import { Router } from 'express';
import type { Locale } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { limiter, notFound, parse } from '../lib/http.js';
import { config } from '../config.js';
import { notifyUser } from '../lib/notifications.js';
import {
  LOCALES,
  type CourseLocale,
  completeTextLesson,
  l10nText,
  learnerCourse,
  learnerCourses,
  learnerLesson,
  progressInput,
  quizSubmitInput,
  reportVideoProgress,
  requireEnrollment,
  requireLessonAccess,
  submitQuiz,
  subtitlesOf,
  verifyCertificate,
} from '../lib/course/service.js';
import { sendCourseFile } from '../lib/course/storage.js';
import { certificatePdf } from '../lib/course/certificate.js';
import { CERTIFICATE_READY } from '../lib/course/texts.js';

/**
 * Pre-departure course, client side — mounted at /api/course (CLIENT):
 *   GET  /                               my courses with progress + next lesson (auto-enrollment synced)
 *   GET  /:courseId                      outline: modules → lessons with my progress, certificate
 *   GET  /:courseId/certificate.pdf      ?lang=az|de|en|ru (default: my language)
 *   GET  /lessons/:id                    lesson (marks it started; quiz without answer keys)
 *   POST /lessons/:id/progress           { position, watched, duration? } — video; done at 90 % watched
 *   POST /lessons/:id/complete           text lesson read
 *   POST /lessons/:id/quiz               { answers: number[][] } → score, feedback
 *   GET  /lessons/:id/video              the video (HTTP range requests)
 *   GET  /lessons/:id/poster
 *   GET  /lessons/:id/subtitles/:locale  WebVTT
 *
 * Public verification — mounted at /api/certificates:
 *   GET  /:code                          { valid, initials, course, issuedAt } — nothing else about the holder
 */
export const courseRouter = Router();
courseRouter.use(requireAuth, requireRole('CLIENT'));

const quizLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 60, skip: () => config.isTest });

/** The first certificate of a course: tell the client (in-app + push, no e-mail). */
const announce = async (userId: string, courseId: string, cert: unknown) => {
  if (!cert) return;
  const [user, course] = await Promise.all([prisma.user.findUnique({ where: { id: userId }, select: { locale: true } }), prisma.course.findUnique({ where: { id: courseId }, select: { title: true } })]);
  const locale = (user?.locale ?? 'az') as CourseLocale;
  const t = CERTIFICATE_READY[locale]({ course: l10nText(course?.title ?? null, locale) });
  await notifyUser(userId, { type: 'COURSE_CERTIFICATE', title: t.title, body: t.body, link: `/account/course/${courseId}`, email: false }).catch((e) => console.error('[course] notify failed', e));
};

courseRouter.get('/', async (req, res) => {
  res.json({ courses: await learnerCourses(req.user!.id) });
});

courseRouter.get('/lessons/:id', async (req, res) => {
  res.json({ lesson: await learnerLesson(req.user!.id, String(req.params.id)) });
});

courseRouter.post('/lessons/:id/progress', async (req, res) => {
  const body = parse(progressInput, req.body ?? {});
  const { lesson, enrollment } = await requireLessonAccess(req.user!.id, String(req.params.id));
  const r = await reportVideoProgress(req.user!.id, lesson, enrollment.id, body);
  if (r.justCompleted && r.certificate && Date.now() - r.certificate.issuedAt.getTime() < 60_000) void announce(req.user!.id, lesson.courseId, r.certificate);
  res.json(r);
});

courseRouter.post('/lessons/:id/complete', async (req, res) => {
  const { lesson, enrollment } = await requireLessonAccess(req.user!.id, String(req.params.id));
  const before = await prisma.courseCertificate.findUnique({ where: { courseId_userId: { courseId: lesson.courseId, userId: req.user!.id } } });
  const r = await completeTextLesson(req.user!.id, lesson, enrollment.id);
  if (!before && r.certificate) void announce(req.user!.id, lesson.courseId, r.certificate);
  res.json(r);
});

courseRouter.post('/lessons/:id/quiz', quizLimiter, async (req, res) => {
  const { answers } = parse(quizSubmitInput, req.body ?? {});
  const { lesson, enrollment } = await requireLessonAccess(req.user!.id, String(req.params.id));
  const before = await prisma.courseCertificate.findUnique({ where: { courseId_userId: { courseId: lesson.courseId, userId: req.user!.id } } });
  const r = await submitQuiz(req.user!.id, lesson, enrollment.id, answers);
  if (!before && r.certificate) void announce(req.user!.id, lesson.courseId, r.certificate);
  res.json(r);
});

courseRouter.get('/lessons/:id/video', async (req, res) => {
  const { lesson } = await requireLessonAccess(req.user!.id, String(req.params.id));
  await sendCourseFile(res, lesson.videoKey, { mime: lesson.videoMime });
});

courseRouter.get('/lessons/:id/poster', async (req, res) => {
  const { lesson } = await requireLessonAccess(req.user!.id, String(req.params.id));
  await sendCourseFile(res, lesson.posterKey);
});

courseRouter.get('/lessons/:id/subtitles/:locale', async (req, res) => {
  const { lesson } = await requireLessonAccess(req.user!.id, String(req.params.id));
  const locale = String(req.params.locale).replace(/\.vtt$/, '') as CourseLocale;
  if (!(LOCALES as readonly string[]).includes(locale)) throw notFound('FILE_NOT_FOUND');
  await sendCourseFile(res, subtitlesOf(lesson.subtitles)[locale]);
});

courseRouter.get('/:courseId', async (req, res) => {
  res.json({ course: await learnerCourse(req.user!.id, String(req.params.courseId)) });
});

courseRouter.get('/:courseId/certificate.pdf', async (req, res) => {
  const courseId = String(req.params.courseId);
  const { course } = await requireEnrollment(req.user!.id, courseId);
  const cert = await prisma.courseCertificate.findUnique({ where: { courseId_userId: { courseId, userId: req.user!.id } } });
  if (!cert) throw notFound('CERTIFICATE_NOT_FOUND');
  const lang = String(req.query.lang ?? '');
  const locale = ((LOCALES as readonly string[]).includes(lang) ? lang : req.user!.locale) as Locale;
  const pdf = await certificatePdf({ holderName: cert.holderName, courseTitle: l10nText(course.title, locale), issuedAt: cert.issuedAt, number: cert.number, code: cert.code, locale });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="certificate-${cert.number}-${locale}.pdf"`);
  res.send(pdf);
});

// ─── Public verification ───────────────────────────────────────────────

export const certificatePublicRouter = Router();
const verifyLimiter = limiter({ windowMs: 60 * 1000, limit: 30, skip: () => config.isTest });

certificatePublicRouter.get('/:code', verifyLimiter, async (req, res) => {
  const r = await verifyCertificate(String(req.params.code).toUpperCase());
  if (!r) throw notFound('CERTIFICATE_NOT_FOUND');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.json(r);
});
