import { Router, type Request } from 'express';
import type { Locale, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import {
  CASE_STATUSES,
  LOCALES,
  type CourseLocale,
  adminCourseView,
  courseHeader,
  courseInput,
  coursePatch,
  deleteLesson,
  enrollUser,
  l10nOrNull,
  l10nText,
  lessonInput,
  lessonPatch,
  moduleInput,
  modulePatch,
  nextSortOrder,
  outlineOf,
  progressOf,
  publishProblems,
  questionsInput,
  reorderInput,
  subtitlesOf,
  syncAutoEnrollments,
  asL10n,
} from '../../lib/course/service.js';
import { acceptVideo, courseAssetUpload, courseVideoUpload, removeCourseFile, sendCourseFile, storePoster, storeSubtitles } from '../../lib/course/storage.js';
import { courseReport, reportCsv } from '../../lib/course/report.js';
import { certificatePdf } from '../../lib/course/certificate.js';
import { createStarterCourse } from '../../lib/course/starter.js';

/**
 * Pre-departure course, admin side — /api/admin/course (STAFF+ read, report and enroll; ADMIN+ edit courses).
 *
 *   GET    /courses                          list with lesson counts, enrolled / completed
 *   POST   /courses                          new course (ADMIN)          POST /courses/starter  "Almaniyaya hazırlıq" (ADMIN, idempotent)
 *   GET    /courses/:id                      builder view: modules → lessons → questions (keys), completeness, problems
 *   PATCH  /courses/:id · DELETE             (ADMIN; delete refused while certificates exist)
 *   POST   /courses/:id/publish              { published } (ADMIN; publishing checks the content)
 *   POST   /courses/:id/modules              · POST /courses/:id/modules/reorder { ids }      (ADMIN)
 *   PATCH  /modules/:id · DELETE             · POST /modules/:id/lessons · POST /modules/:id/lessons/reorder (ADMIN)
 *   PATCH  /lessons/:id · DELETE             · PUT /lessons/:id/questions { questions }       (ADMIN)
 *   POST   /lessons/:id/video                multipart file (+ duration) · DELETE              (ADMIN)
 *   POST   /lessons/:id/poster · DELETE      · POST /lessons/:id/subtitles/:locale · DELETE   (ADMIN)
 *   GET    /lessons/:id/video | poster | subtitles/:locale                                    preview (STAFF)
 *   GET    /report                           ?courseId&status&staffId&q   · GET /report.csv    (STAFF)
 *   GET    /users/:userId                    one client's enrollments + progress (case page card)
 *   POST   /enrollments { courseId, userId } · DELETE /enrollments/:id                        (STAFF)
 *   GET    /certificates/:id.pdf             ?lang                                             (STAFF)
 */
export const adminCourseRouter = Router();

const admin = requireMinRole('ADMIN');
const id = (req: Request, key = 'id') => String(req.params[key]);

const loadCourse = async (courseId: string) => {
  const c = await prisma.course.findUnique({ where: { id: courseId } });
  if (!c) throw notFound('COURSE_NOT_FOUND');
  return c;
};
const loadModule = async (moduleId: string) => {
  const m = await prisma.courseModule.findUnique({ where: { id: moduleId } });
  if (!m) throw notFound('MODULE_NOT_FOUND');
  return m;
};
const loadLesson = async (lessonId: string) => {
  const l = await prisma.courseLesson.findUnique({ where: { id: lessonId } });
  if (!l) throw notFound('LESSON_NOT_FOUND');
  return l;
};
const bump = (courseId: string) => prisma.course.update({ where: { id: courseId }, data: { updatedAt: new Date() } });

// ─── Courses ───────────────────────────────────────────────────────────

adminCourseRouter.get('/courses', async (_req, res) => {
  const courses = await prisma.course.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  const [lessons, enrolled, completed] = await Promise.all([
    prisma.courseLesson.groupBy({ by: ['courseId'], _count: { _all: true } }),
    prisma.courseEnrollment.groupBy({ by: ['courseId'], where: { removedAt: null }, _count: { _all: true } }),
    prisma.courseEnrollment.groupBy({ by: ['courseId'], where: { removedAt: null, completedAt: { not: null } }, _count: { _all: true } }),
  ]);
  const n = (rows: { courseId: string; _count: { _all: number } }[], cid: string) => rows.find((r) => r.courseId === cid)?._count._all ?? 0;
  res.json({
    courses: courses.map((c) => ({ ...courseHeader(c), lessons: n(lessons, c.id), enrolled: n(enrolled, c.id), completed: n(completed, c.id) })),
    statuses: CASE_STATUSES,
  });
});

adminCourseRouter.post('/courses', admin, async (req, res) => {
  const body = parse(courseInput, req.body ?? {});
  const slug = body.slug ?? `course-${Date.now().toString(36)}`;
  if (await prisma.course.findUnique({ where: { slug } })) throw conflict('SLUG_TAKEN');
  const max = await prisma.course.aggregate({ _max: { sortOrder: true } });
  const c = await prisma.course.create({
    data: {
      slug,
      title: body.title,
      description: l10nOrNull(body.description ?? null),
      disclaimer: l10nOrNull(body.disclaimer ?? null),
      autoEnrollStatuses: body.autoEnrollStatuses ?? [],
      sortOrder: body.sortOrder ?? (max._max.sortOrder ?? -1) + 1,
      createdById: req.user!.id,
    },
  });
  await audit(req, 'COURSE_CREATED', `course:${c.id}`, { slug });
  res.status(201).json({ course: await adminCourseView(c.id) });
});

adminCourseRouter.post('/courses/starter', admin, async (req, res) => {
  const r = await createStarterCourse(prisma, req.user!.id);
  if (r.created) await audit(req, 'COURSE_STARTER_CREATED', `course:${r.courseId}`);
  res.json(r);
});

adminCourseRouter.get('/courses/:id', async (req, res) => {
  res.json({ course: await adminCourseView(id(req)) });
});

adminCourseRouter.patch('/courses/:id', admin, async (req, res) => {
  const c = await loadCourse(id(req));
  const body = parse(coursePatch, req.body ?? {});
  if (body.slug && body.slug !== c.slug && (await prisma.course.findUnique({ where: { slug: body.slug } }))) throw conflict('SLUG_TAKEN');
  await prisma.course.update({
    where: { id: c.id },
    data: {
      slug: body.slug,
      title: body.title,
      description: l10nOrNull(body.description),
      disclaimer: l10nOrNull(body.disclaimer),
      autoEnrollStatuses: body.autoEnrollStatuses,
      sortOrder: body.sortOrder,
    },
  });
  await audit(req, 'COURSE_UPDATED', `course:${c.id}`, { fields: Object.keys(body) });
  res.json({ course: await adminCourseView(c.id) });
});

adminCourseRouter.post('/courses/:id/publish', admin, async (req, res) => {
  const c = await loadCourse(id(req));
  const { published } = parse(z.object({ published: z.boolean() }), req.body ?? {});
  if (published) {
    const { lessons } = await outlineOf(c.id);
    const qs = await prisma.courseQuizQuestion.findMany({ where: { lessonId: { in: lessons.map((l) => l.id) } } });
    const byLesson = new Map<string, typeof qs>();
    for (const q of qs) byLesson.set(q.lessonId, [...(byLesson.get(q.lessonId) ?? []), q]);
    const problems = publishProblems(lessons, byLesson);
    if (problems.length) throw badRequest('COURSE_INCOMPLETE', problems.join(','));
  }
  await prisma.course.update({ where: { id: c.id }, data: { published, publishedAt: published ? (c.publishedAt ?? new Date()) : c.publishedAt } });
  if (published) await syncAutoEnrollments({ courseId: c.id });
  await audit(req, published ? 'COURSE_PUBLISHED' : 'COURSE_UNPUBLISHED', `course:${c.id}`);
  res.json({ course: await adminCourseView(c.id) });
});

adminCourseRouter.delete('/courses/:id', admin, async (req, res) => {
  const c = await loadCourse(id(req));
  if (await prisma.courseCertificate.count({ where: { courseId: c.id } })) throw conflict('COURSE_HAS_CERTIFICATES');
  const lessons = await prisma.courseLesson.findMany({ where: { courseId: c.id } });
  for (const l of lessons) await deleteLesson(l);
  await prisma.$transaction([
    prisma.courseEnrollment.deleteMany({ where: { courseId: c.id } }),
    prisma.courseModule.deleteMany({ where: { courseId: c.id } }),
    prisma.course.delete({ where: { id: c.id } }),
  ]);
  await audit(req, 'COURSE_DELETED', `course:${c.id}`, { slug: c.slug });
  res.json({ ok: true });
});

// ─── Modules ───────────────────────────────────────────────────────────

adminCourseRouter.post('/courses/:id/modules', admin, async (req, res) => {
  const c = await loadCourse(id(req));
  const body = parse(moduleInput, req.body ?? {});
  const m = await prisma.courseModule.create({ data: { courseId: c.id, title: body.title, description: l10nOrNull(body.description ?? null), sortOrder: await nextSortOrder('module', c.id) } });
  await bump(c.id);
  await audit(req, 'COURSE_MODULE_CREATED', `course:${c.id}`, { moduleId: m.id });
  res.status(201).json({ module: { id: m.id }, course: await adminCourseView(c.id) });
});

adminCourseRouter.post('/courses/:id/modules/reorder', admin, async (req, res) => {
  const c = await loadCourse(id(req));
  const { ids } = parse(reorderInput, req.body ?? {});
  const own = await prisma.courseModule.findMany({ where: { courseId: c.id }, select: { id: true } });
  if (ids.length !== own.length || !ids.every((x) => own.some((o) => o.id === x))) throw badRequest('INVALID_ORDER');
  await prisma.$transaction(ids.map((mid, i) => prisma.courseModule.update({ where: { id: mid }, data: { sortOrder: i } })));
  await bump(c.id);
  await audit(req, 'COURSE_MODULES_REORDERED', `course:${c.id}`);
  res.json({ course: await adminCourseView(c.id) });
});

adminCourseRouter.patch('/modules/:id', admin, async (req, res) => {
  const m = await loadModule(id(req));
  const body = parse(modulePatch, req.body ?? {});
  await prisma.courseModule.update({ where: { id: m.id }, data: { title: body.title, description: l10nOrNull(body.description) } });
  await bump(m.courseId);
  await audit(req, 'COURSE_MODULE_UPDATED', `course:${m.courseId}`, { moduleId: m.id });
  res.json({ course: await adminCourseView(m.courseId) });
});

adminCourseRouter.delete('/modules/:id', admin, async (req, res) => {
  const m = await loadModule(id(req));
  const lessons = await prisma.courseLesson.findMany({ where: { moduleId: m.id } });
  for (const l of lessons) await deleteLesson(l);
  await prisma.courseModule.delete({ where: { id: m.id } });
  await bump(m.courseId);
  await audit(req, 'COURSE_MODULE_DELETED', `course:${m.courseId}`, { moduleId: m.id, lessons: lessons.length });
  res.json({ course: await adminCourseView(m.courseId) });
});

// ─── Lessons ───────────────────────────────────────────────────────────

adminCourseRouter.post('/modules/:id/lessons', admin, async (req, res) => {
  const m = await loadModule(id(req));
  const body = parse(lessonInput, req.body ?? {});
  const l = await prisma.courseLesson.create({
    data: {
      courseId: m.courseId,
      moduleId: m.id,
      kind: body.kind,
      title: body.title,
      body: l10nOrNull(body.body ?? null),
      minutes: body.minutes ?? null,
      passMark: body.passMark ?? 70,
      sortOrder: await nextSortOrder('lesson', m.id),
    },
  });
  await bump(m.courseId);
  await audit(req, 'COURSE_LESSON_CREATED', `course:${m.courseId}`, { lessonId: l.id, kind: l.kind });
  res.status(201).json({ lesson: { id: l.id }, course: await adminCourseView(m.courseId) });
});

adminCourseRouter.post('/modules/:id/lessons/reorder', admin, async (req, res) => {
  const m = await loadModule(id(req));
  const { ids } = parse(reorderInput, req.body ?? {});
  const own = await prisma.courseLesson.findMany({ where: { moduleId: m.id }, select: { id: true } });
  if (ids.length !== own.length || !ids.every((x) => own.some((o) => o.id === x))) throw badRequest('INVALID_ORDER');
  await prisma.$transaction(ids.map((lid, i) => prisma.courseLesson.update({ where: { id: lid }, data: { sortOrder: i } })));
  await bump(m.courseId);
  await audit(req, 'COURSE_LESSONS_REORDERED', `course:${m.courseId}`, { moduleId: m.id });
  res.json({ course: await adminCourseView(m.courseId) });
});

adminCourseRouter.patch('/lessons/:id', admin, async (req, res) => {
  const l = await loadLesson(id(req));
  const body = parse(lessonPatch, req.body ?? {});
  let sortOrder: number | undefined;
  if (body.moduleId && body.moduleId !== l.moduleId) {
    const target = await loadModule(body.moduleId);
    if (target.courseId !== l.courseId) throw badRequest('MODULE_OF_OTHER_COURSE');
    sortOrder = await nextSortOrder('lesson', target.id);
  }
  await prisma.courseLesson.update({
    where: { id: l.id },
    data: { title: body.title, body: l10nOrNull(body.body), minutes: body.minutes, passMark: body.passMark, moduleId: body.moduleId, sortOrder },
  });
  await bump(l.courseId);
  await audit(req, 'COURSE_LESSON_UPDATED', `course:${l.courseId}`, { lessonId: l.id, fields: Object.keys(body) });
  res.json({ course: await adminCourseView(l.courseId) });
});

adminCourseRouter.delete('/lessons/:id', admin, async (req, res) => {
  const l = await loadLesson(id(req));
  await deleteLesson(l);
  await bump(l.courseId);
  await audit(req, 'COURSE_LESSON_DELETED', `course:${l.courseId}`, { lessonId: l.id });
  res.json({ course: await adminCourseView(l.courseId) });
});

adminCourseRouter.put('/lessons/:id/questions', admin, async (req, res) => {
  const l = await loadLesson(id(req));
  if (l.kind !== 'QUIZ') throw badRequest('LESSON_NOT_QUIZ');
  const { questions } = parse(questionsInput, req.body ?? {});
  await prisma.$transaction([
    prisma.courseQuizQuestion.deleteMany({ where: { lessonId: l.id } }),
    prisma.courseQuizQuestion.createMany({
      data: questions.map((q, i) => ({
        lessonId: l.id,
        kind: q.kind,
        prompt: q.prompt,
        options: q.options,
        correct: [...q.correct].sort((a, b) => a - b),
        explanation: (l10nOrNull(q.explanation ?? null) ?? undefined) as Prisma.InputJsonValue | undefined,
        sortOrder: i,
      })),
    }),
  ]);
  await bump(l.courseId);
  await audit(req, 'COURSE_QUIZ_UPDATED', `course:${l.courseId}`, { lessonId: l.id, questions: questions.length });
  res.json({ course: await adminCourseView(l.courseId) });
});

// ─── Files ─────────────────────────────────────────────────────────────

adminCourseRouter.post('/lessons/:id/video', admin, courseVideoUpload.single('file'), async (req, res) => {
  const l = await prisma.courseLesson.findUnique({ where: { id: id(req) } });
  if (!l) {
    if (req.file?.path) await removeCourseFile(req.file.filename);
    throw notFound('LESSON_NOT_FOUND');
  }
  const saved = await acceptVideo(req.file);
  if (l.kind !== 'VIDEO') {
    await removeCourseFile(saved.key);
    throw badRequest('LESSON_NOT_VIDEO');
  }
  const duration = Number(req.body?.duration);
  await prisma.courseLesson.update({
    where: { id: l.id },
    data: { videoKey: saved.key, videoMime: saved.mime, videoSize: saved.size, videoDuration: Number.isFinite(duration) && duration > 0 && duration < 36000 ? Math.round(duration) : null },
  });
  if (l.videoKey && l.videoKey !== saved.key) await removeCourseFile(l.videoKey);
  await bump(l.courseId);
  await audit(req, 'COURSE_VIDEO_UPLOADED', `course:${l.courseId}`, { lessonId: l.id, size: saved.size, mime: saved.mime });
  res.status(201).json({ course: await adminCourseView(l.courseId) });
});

adminCourseRouter.delete('/lessons/:id/video', admin, async (req, res) => {
  const l = await loadLesson(id(req));
  await prisma.courseLesson.update({ where: { id: l.id }, data: { videoKey: null, videoMime: null, videoSize: null, videoDuration: null } });
  await removeCourseFile(l.videoKey);
  await bump(l.courseId);
  await audit(req, 'COURSE_VIDEO_DELETED', `course:${l.courseId}`, { lessonId: l.id });
  res.json({ course: await adminCourseView(l.courseId) });
});

adminCourseRouter.post('/lessons/:id/poster', admin, courseAssetUpload.single('file'), async (req, res) => {
  const l = await loadLesson(id(req));
  const key = await storePoster(req.file);
  await prisma.courseLesson.update({ where: { id: l.id }, data: { posterKey: key } });
  await removeCourseFile(l.posterKey);
  await bump(l.courseId);
  await audit(req, 'COURSE_POSTER_UPLOADED', `course:${l.courseId}`, { lessonId: l.id });
  res.status(201).json({ course: await adminCourseView(l.courseId) });
});

adminCourseRouter.delete('/lessons/:id/poster', admin, async (req, res) => {
  const l = await loadLesson(id(req));
  await prisma.courseLesson.update({ where: { id: l.id }, data: { posterKey: null } });
  await removeCourseFile(l.posterKey);
  await bump(l.courseId);
  await audit(req, 'COURSE_POSTER_DELETED', `course:${l.courseId}`, { lessonId: l.id });
  res.json({ course: await adminCourseView(l.courseId) });
});

const localeParam = (req: Request) => {
  const l = String(req.params.locale).replace(/\.vtt$/, '');
  if (!(LOCALES as readonly string[]).includes(l)) throw badRequest('INVALID_LOCALE');
  return l as CourseLocale;
};

adminCourseRouter.post('/lessons/:id/subtitles/:locale', admin, courseAssetUpload.single('file'), async (req, res) => {
  const l = await loadLesson(id(req));
  const locale = localeParam(req);
  const key = await storeSubtitles(req.file);
  const subs = subtitlesOf(l.subtitles);
  const old = subs[locale];
  await prisma.courseLesson.update({ where: { id: l.id }, data: { subtitles: { ...subs, [locale]: key } } });
  await removeCourseFile(old);
  await bump(l.courseId);
  await audit(req, 'COURSE_SUBTITLES_UPLOADED', `course:${l.courseId}`, { lessonId: l.id, locale });
  res.status(201).json({ course: await adminCourseView(l.courseId) });
});

adminCourseRouter.delete('/lessons/:id/subtitles/:locale', admin, async (req, res) => {
  const l = await loadLesson(id(req));
  const locale = localeParam(req);
  const subs = subtitlesOf(l.subtitles);
  const old = subs[locale];
  delete subs[locale];
  await prisma.courseLesson.update({ where: { id: l.id }, data: { subtitles: subs } });
  await removeCourseFile(old);
  await bump(l.courseId);
  await audit(req, 'COURSE_SUBTITLES_DELETED', `course:${l.courseId}`, { lessonId: l.id, locale });
  res.json({ course: await adminCourseView(l.courseId) });
});

adminCourseRouter.get('/lessons/:id/video', async (req, res) => {
  const l = await loadLesson(id(req));
  await sendCourseFile(res, l.videoKey, { mime: l.videoMime });
});
adminCourseRouter.get('/lessons/:id/poster', async (req, res) => {
  const l = await loadLesson(id(req));
  await sendCourseFile(res, l.posterKey);
});
adminCourseRouter.get('/lessons/:id/subtitles/:locale', async (req, res) => {
  const l = await loadLesson(id(req));
  await sendCourseFile(res, subtitlesOf(l.subtitles)[localeParam(req)]);
});

// ─── Report, enrollments, certificates ─────────────────────────────────

const reportQuery = z.object({
  courseId: z.string().max(40).optional(),
  status: z.enum(CASE_STATUSES).optional(),
  staffId: z.string().max(40).optional(),
  q: z.string().max(100).optional(),
});

adminCourseRouter.get('/report', async (req, res) => {
  const f = parse(reportQuery, req.query);
  res.json({ rows: await courseReport(f) });
});

adminCourseRouter.get('/report.csv', async (req, res) => {
  const f = parse(reportQuery, req.query);
  const rows = await courseReport(f);
  await audit(req, 'COURSE_REPORT_EXPORTED', f.courseId ? `course:${f.courseId}` : undefined, { rows: rows.length, ...f });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="course-progress-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(reportCsv(rows, req.user!.locale));
});

/** One client's courses (admin case page card): progress, quiz bests, certificate, courses to enroll in. */
adminCourseRouter.get('/users/:userId', async (req, res) => {
  const userId = id(req, 'userId');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) throw notFound('USER_NOT_FOUND');
  if (user.role === 'CLIENT') await syncAutoEnrollments({ userId });
  const [enrollments, courses, certs] = await Promise.all([
    prisma.courseEnrollment.findMany({ where: { userId, removedAt: null }, orderBy: { enrolledAt: 'asc' } }),
    prisma.course.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.courseCertificate.findMany({ where: { userId } }),
  ]);
  const rows = [];
  for (const e of enrollments) {
    const course = courses.find((c) => c.id === e.courseId);
    if (!course) continue;
    const { lessons } = await outlineOf(course.id);
    const progress = await prisma.courseLessonProgress.findMany({ where: { userId, courseId: course.id }, select: { lessonId: true, completedAt: true } });
    const attempts = await prisma.courseQuizAttempt.groupBy({ by: ['lessonId'], where: { userId, courseId: course.id }, _max: { score: true }, _count: { _all: true } });
    const cert = certs.find((c) => c.courseId === course.id);
    rows.push({
      enrollmentId: e.id,
      course: { id: course.id, title: asL10n(course.title), published: course.published },
      source: e.source,
      enrolledAt: e.enrolledAt,
      lastActivityAt: e.lastActivityAt,
      completedAt: e.completedAt,
      progress: progressOf(lessons, progress),
      quizzes: lessons
        .filter((l) => l.kind === 'QUIZ')
        .map((l) => {
          const a = attempts.find((x) => x.lessonId === l.id);
          return { lessonId: l.id, title: asL10n(l.title), best: a?._max.score ?? null, attempts: a?._count._all ?? 0, passed: progress.some((p) => p.lessonId === l.id && p.completedAt) };
        }),
      certificate: cert ? { id: cert.id, number: cert.number, issuedAt: cert.issuedAt } : null,
    });
  }
  const enrolledIds = new Set(enrollments.map((e) => e.courseId));
  res.json({
    isClient: user.role === 'CLIENT',
    enrollments: rows,
    available: courses.filter((c) => c.published && !enrolledIds.has(c.id)).map((c) => ({ id: c.id, title: asL10n(c.title) })),
  });
});

adminCourseRouter.post('/enrollments', async (req, res) => {
  const { courseId, userId } = parse(z.object({ courseId: z.string().min(1).max(40), userId: z.string().min(1).max(40) }), req.body ?? {});
  const e = await enrollUser(courseId, userId, req.user!.id);
  await audit(req, 'COURSE_ENROLLED', `user:${userId}`, { courseId, enrollmentId: e.id });
  res.status(201).json({ enrollment: { id: e.id } });
});

adminCourseRouter.delete('/enrollments/:id', async (req, res) => {
  const e = await prisma.courseEnrollment.findUnique({ where: { id: id(req) } });
  if (!e || e.removedAt) throw notFound('ENROLLMENT_NOT_FOUND');
  await prisma.courseEnrollment.update({ where: { id: e.id }, data: { removedAt: new Date() } });
  await audit(req, 'COURSE_UNENROLLED', `user:${e.userId}`, { courseId: e.courseId, enrollmentId: e.id });
  res.json({ ok: true });
});

adminCourseRouter.get('/certificates/:id.pdf', async (req, res) => {
  const cert = await prisma.courseCertificate.findUnique({ where: { id: id(req) } });
  if (!cert) throw notFound('CERTIFICATE_NOT_FOUND');
  const course = await prisma.course.findUnique({ where: { id: cert.courseId }, select: { title: true } });
  const lang = String(req.query.lang ?? '');
  const locale = ((LOCALES as readonly string[]).includes(lang) ? lang : req.user!.locale) as Locale;
  const pdf = await certificatePdf({ holderName: cert.holderName, courseTitle: l10nText(course?.title ?? null, locale), issuedAt: cert.issuedAt, number: cert.number, code: cert.code, locale });
  await audit(req, 'COURSE_CERTIFICATE_DOWNLOADED', `user:${cert.userId}`, { certificateId: cert.id });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="certificate-${cert.number}-${locale}.pdf"`);
  res.send(pdf);
});

