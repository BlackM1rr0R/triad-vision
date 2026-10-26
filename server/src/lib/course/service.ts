import crypto from 'node:crypto';
import { Prisma, type CaseStatus, type Course, type CourseLesson, type CourseQuizQuestion } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound } from '../http.js';
import { isImpersonating } from '../privacy/impersonationContext.js';
import { removeCourseFile } from './storage.js';

/**
 * Pre-departure course (LMS) for candidates — Course → Module → Lesson (VIDEO | TEXT | QUIZ).
 *
 *  - Texts are L10n JSON ({ az, de, en, ru }) like every CMS field; the admin sees a completeness per language.
 *  - Enrollment: automatic for CLIENT users with a case in one of the course's `autoEnrollStatuses` (synced when
 *    the client opens the portal, when staff open the report, and hourly), or manual by staff. Staff "remove"
 *    sets `removedAt`, so the automatic sync does not bring the enrollment back.
 *  - Progress: TEXT lessons are completed with a click, VIDEO lessons at 90 % watched (watched seconds may grow
 *    at most twice as fast as wall time, so skipping to the end does not count), QUIZ lessons by reaching the
 *    pass mark. Quiz answer keys never leave the server for learners; the right options are only shown after
 *    passing.
 *  - All lessons done → the enrollment is completed and a certificate is issued (number + verification code).
 */

export const LOCALES = ['az', 'de', 'en', 'ru'] as const;
export type CourseLocale = (typeof LOCALES)[number];
export type L10n = Record<CourseLocale, string>;

export const CASE_STATUSES = [
  'DOCUMENTS_PENDING',
  'DOCUMENTS_REVIEW',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'EMBASSY_DOCUMENTS',
  'EMBASSY_REVIEW',
  'APPOINTMENT_SCHEDULED',
  'DECISION_PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const satisfies readonly CaseStatus[];

/** Share of the video that must be watched for the lesson to count as done. */
export const WATCH_THRESHOLD = 0.9;
/** Watched seconds may grow at most this much faster than wall time (2× playback speed) … */
export const WATCH_SPEED = 2;
/** … plus this slack per report (network delays, a report lost on the way). */
export const WATCH_SLACK_S = 30;

// ─── Validation ────────────────────────────────────────────────────────

const text = (max: number) => z.string().max(max).default('');
export const l10nSchema = (max = 300) => z.object({ az: text(max), de: text(max), en: text(max), ru: text(max) });
const l10nRequired = (max = 300) => l10nSchema(max).refine((v) => v.az.trim().length > 0, { message: 'AZ_REQUIRED', path: ['az'] });

export const courseInput = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,78}$/)
    .optional(),
  title: l10nRequired(200),
  description: l10nSchema(4000).nullable().optional(),
  disclaimer: l10nSchema(2000).nullable().optional(),
  autoEnrollStatuses: z.array(z.enum(CASE_STATUSES)).max(CASE_STATUSES.length).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});
export const coursePatch = courseInput.partial();

export const moduleInput = z.object({ title: l10nRequired(200), description: l10nSchema(2000).nullable().optional() });
export const modulePatch = moduleInput.partial();

export const lessonInput = z.object({
  kind: z.enum(['VIDEO', 'TEXT', 'QUIZ']),
  title: l10nRequired(200),
  body: l10nSchema(30000).nullable().optional(),
  minutes: z.number().int().min(1).max(600).nullable().optional(),
  passMark: z.number().int().min(1).max(100).optional(),
});
export const lessonPatch = lessonInput.omit({ kind: true }).partial().extend({ moduleId: z.string().min(1).max(40).optional() });

export const questionInput = z
  .object({
    kind: z.enum(['SINGLE', 'MULTIPLE']).default('SINGLE'),
    prompt: l10nRequired(1000),
    options: z.array(l10nRequired(400)).min(2).max(8),
    correct: z.array(z.number().int().min(0).max(7)).min(1).max(8),
    explanation: l10nSchema(2000).nullable().optional(),
  })
  .refine((q) => q.correct.every((i) => i < q.options.length), { message: 'ANSWER_OUT_OF_RANGE', path: ['correct'] })
  .refine((q) => new Set(q.correct).size === q.correct.length, { message: 'DUPLICATE_ANSWER', path: ['correct'] })
  .refine((q) => q.kind === 'MULTIPLE' || q.correct.length === 1, { message: 'SINGLE_NEEDS_ONE_ANSWER', path: ['correct'] });
export const questionsInput = z.object({ questions: z.array(questionInput).max(40) });

export const reorderInput = z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(500) });

export const progressInput = z.object({
  position: z.number().min(0).max(36000),
  watched: z.number().min(0).max(36000),
  duration: z.number().min(1).max(36000).optional(),
});

export const quizSubmitInput = z.object({ answers: z.array(z.array(z.number().int().min(0).max(7)).max(8)).max(40) });

// ─── Reading stored JSON ───────────────────────────────────────────────

export const asL10n = (v: Prisma.JsonValue | null | undefined): L10n | null => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  return { az: String(o.az ?? ''), de: String(o.de ?? ''), en: String(o.en ?? ''), ru: String(o.ru ?? '') };
};
const asL10nList = (v: Prisma.JsonValue | null | undefined): L10n[] => (Array.isArray(v) ? v.map((x) => asL10n(x as Prisma.JsonValue) ?? { az: '', de: '', en: '', ru: '' }) : []);
const asNumbers = (v: Prisma.JsonValue | null | undefined): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isInteger(x)) : []);
export const statusesOf = (v: Prisma.JsonValue | null | undefined): CaseStatus[] =>
  Array.isArray(v) ? (v.filter((x) => typeof x === 'string' && (CASE_STATUSES as readonly string[]).includes(x)) as CaseStatus[]) : [];
export const subtitlesOf = (v: Prisma.JsonValue | null | undefined): Partial<Record<CourseLocale, string>> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  return Object.fromEntries(LOCALES.filter((l) => typeof o[l] === 'string' && o[l]).map((l) => [l, o[l] as string]));
};
export const l10nText = (v: Prisma.JsonValue | null | undefined, locale: string) => {
  const t = asL10n(v);
  if (!t) return '';
  return t[locale as CourseLocale] || t.az || t.en || t.de || t.ru || '';
};
/** JSON column value for an optional L10n field: an all-empty text is stored as NULL. */
export const l10nOrNull = (v: L10n | null | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined =>
  v === undefined ? undefined : v && Object.values(v).some((x) => x.trim()) ? v : Prisma.DbNull;

// ─── Outline ───────────────────────────────────────────────────────────

/** Modules and lessons of a course in display order (lessons flattened in module order). */
export const outlineOf = async (courseId: string) => {
  const [modules, lessons] = await Promise.all([
    prisma.courseModule.findMany({ where: { courseId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.courseLesson.findMany({ where: { courseId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
  ]);
  const rank = new Map(modules.map((m, i) => [m.id, i]));
  const ordered = lessons.filter((l) => rank.has(l.moduleId)).sort((a, b) => rank.get(a.moduleId)! - rank.get(b.moduleId)! || a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
  return { modules, lessons: ordered };
};

// ─── Completeness (admin) ─────────────────────────────────────────────

type Counter = Record<CourseLocale, { filled: number; total: number }>;
const newCounter = (): Counter => ({ az: { filled: 0, total: 0 }, de: { filled: 0, total: 0 }, en: { filled: 0, total: 0 }, ru: { filled: 0, total: 0 } });
const count = (c: Counter, v: L10n | null) => {
  for (const l of LOCALES) {
    c[l].total++;
    if (v?.[l]?.trim()) c[l].filled++;
  }
};
const percents = (c: Counter) => Object.fromEntries(LOCALES.map((l) => [l, c[l].total ? Math.round((c[l].filled / c[l].total) * 100) : 100])) as Record<CourseLocale, number>;

/**
 * Per-language completeness (0–100) of a lesson: title, body (when the AZ body is set), quiz prompts, options
 * and explanations (when the AZ explanation is set). Optional fields only count once AZ has them.
 */
export const lessonCompleteness = (lesson: Pick<CourseLesson, 'title' | 'body'>, questions: Pick<CourseQuizQuestion, 'prompt' | 'options' | 'explanation'>[] = [], into?: Counter) => {
  const c = into ?? newCounter();
  count(c, asL10n(lesson.title));
  const body = asL10n(lesson.body);
  if (body?.az.trim()) count(c, body);
  for (const q of questions) {
    count(c, asL10n(q.prompt));
    for (const o of asL10nList(q.options)) count(c, o);
    const ex = asL10n(q.explanation);
    if (ex?.az.trim()) count(c, ex);
  }
  return percents(c);
};

// ─── Views ─────────────────────────────────────────────────────────────

export const adminQuestionView = (q: CourseQuizQuestion) => ({
  id: q.id,
  kind: q.kind,
  prompt: asL10n(q.prompt),
  options: asL10nList(q.options),
  correct: asNumbers(q.correct),
  explanation: asL10n(q.explanation),
  sortOrder: q.sortOrder,
});

const fileInfo = (l: CourseLesson) => ({
  video: l.videoKey ? { mime: l.videoMime, size: l.videoSize, duration: l.videoDuration } : null,
  poster: !!l.posterKey,
  subtitles: Object.keys(subtitlesOf(l.subtitles)) as CourseLocale[],
});

export const adminLessonView = (l: CourseLesson, questions: CourseQuizQuestion[]) => ({
  id: l.id,
  moduleId: l.moduleId,
  kind: l.kind,
  title: asL10n(l.title),
  body: asL10n(l.body),
  minutes: l.minutes,
  passMark: l.passMark,
  sortOrder: l.sortOrder,
  ...fileInfo(l),
  questions: questions.map(adminQuestionView),
  completeness: lessonCompleteness(l, questions),
});

export const courseHeader = (c: Course) => ({
  id: c.id,
  slug: c.slug,
  title: asL10n(c.title),
  description: asL10n(c.description),
  disclaimer: asL10n(c.disclaimer),
  published: c.published,
  publishedAt: c.publishedAt,
  autoEnrollStatuses: statusesOf(c.autoEnrollStatuses),
  sortOrder: c.sortOrder,
  updatedAt: c.updatedAt,
});

/** Full course for the builder: modules → lessons → questions (answer keys included), completeness, counts. */
export const adminCourseView = async (courseId: string) => {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw notFound('COURSE_NOT_FOUND');
  const { modules, lessons } = await outlineOf(courseId);
  const questions = await prisma.courseQuizQuestion.findMany({ where: { lessonId: { in: lessons.map((l) => l.id) } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  const byLesson = new Map<string, CourseQuizQuestion[]>();
  for (const q of questions) byLesson.set(q.lessonId, [...(byLesson.get(q.lessonId) ?? []), q]);
  const total = newCounter();
  count(total, asL10n(course.title));
  for (const v of [course.description, course.disclaimer]) {
    const t = asL10n(v);
    if (t?.az.trim()) count(total, t);
  }
  for (const m of modules) count(total, asL10n(m.title));
  for (const l of lessons) lessonCompleteness(l, byLesson.get(l.id) ?? [], total);
  const [enrolled, completed, certificates] = await Promise.all([
    prisma.courseEnrollment.count({ where: { courseId, removedAt: null } }),
    prisma.courseEnrollment.count({ where: { courseId, removedAt: null, completedAt: { not: null } } }),
    prisma.courseCertificate.count({ where: { courseId } }),
  ]);
  return {
    ...courseHeader(course),
    completeness: percents(total),
    stats: { enrolled, completed, certificates },
    problems: publishProblems(lessons, byLesson),
    modules: modules.map((m) => ({
      id: m.id,
      title: asL10n(m.title),
      description: asL10n(m.description),
      sortOrder: m.sortOrder,
      lessons: lessons.filter((l) => l.moduleId === m.id).map((l) => adminLessonView(l, byLesson.get(l.id) ?? [])),
    })),
  };
};

/** What keeps a course from being published (empty list = ready). */
export const publishProblems = (lessons: CourseLesson[], questions: Map<string, CourseQuizQuestion[]>) => {
  const problems: string[] = [];
  if (!lessons.length) problems.push('NO_LESSONS');
  for (const l of lessons) {
    if (l.kind === 'VIDEO' && !l.videoKey) problems.push(`VIDEO_MISSING:${l.id}`);
    if (l.kind === 'QUIZ' && !(questions.get(l.id)?.length)) problems.push(`QUIZ_EMPTY:${l.id}`);
    if (l.kind === 'TEXT' && !asL10n(l.body)?.az.trim()) problems.push(`TEXT_EMPTY:${l.id}`);
  }
  return problems;
};

// ─── Enrollment ────────────────────────────────────────────────────────

/**
 * Enrolls CLIENT users whose case is in one of a published course's auto-enroll statuses. Idempotent
 * (unique course + user; removed enrollments stay removed). `userId` limits it to one client.
 */
export const syncAutoEnrollments = async (opts: { userId?: string; courseId?: string } = {}) => {
  if (isImpersonating()) return 0; // "view as client" never writes
  const courses = await prisma.course.findMany({ where: { published: true, ...(opts.courseId ? { id: opts.courseId } : {}) }, select: { id: true, autoEnrollStatuses: true } });
  let created = 0;
  for (const c of courses) {
    const statuses = statusesOf(c.autoEnrollStatuses);
    if (!statuses.length) continue;
    const cases = await prisma.case.findMany({
      where: { status: { in: statuses }, client: { role: 'CLIENT', isActive: true }, ...(opts.userId ? { clientId: opts.userId } : {}) },
      select: { clientId: true },
      distinct: ['clientId'],
    });
    if (!cases.length) continue;
    const r = await prisma.courseEnrollment.createMany({ data: cases.map((x) => ({ courseId: c.id, userId: x.clientId, source: 'AUTO' })), skipDuplicates: true });
    created += r.count;
  }
  return created;
};

/** Manual enrollment by staff (re-activates a removed one). */
export const enrollUser = async (courseId: string, userId: string, staffId: string) => {
  const [course, user] = await Promise.all([prisma.course.findUnique({ where: { id: courseId } }), prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })]);
  if (!course) throw notFound('COURSE_NOT_FOUND');
  if (!user || user.role !== 'CLIENT') throw badRequest('NOT_A_CLIENT');
  return prisma.courseEnrollment.upsert({
    where: { courseId_userId: { courseId, userId } },
    create: { courseId, userId, source: 'MANUAL', enrolledById: staffId },
    update: { removedAt: null, source: 'MANUAL', enrolledById: staffId },
  });
};

/** The client's active enrollment in a published course, or 404. */
export const requireEnrollment = async (userId: string, courseId: string) => {
  let e = await prisma.courseEnrollment.findUnique({ where: { courseId_userId: { courseId, userId } } });
  // A deep link (notification, bookmark) may arrive before the portal synced the automatic enrollment.
  if (!e && (await syncAutoEnrollments({ userId, courseId }))) e = await prisma.courseEnrollment.findUnique({ where: { courseId_userId: { courseId, userId } } });
  const course = e && !e.removedAt ? await prisma.course.findUnique({ where: { id: courseId } }) : null;
  if (!e || e.removedAt || !course?.published) throw notFound('COURSE_NOT_FOUND');
  return { enrollment: e, course };
};

/** A lesson the client may open (enrolled, course published). */
export const requireLessonAccess = async (userId: string, lessonId: string) => {
  const lesson = await prisma.courseLesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw notFound('LESSON_NOT_FOUND');
  const { enrollment, course } = await requireEnrollment(userId, lesson.courseId);
  return { lesson, enrollment, course };
};

// ─── Progress ──────────────────────────────────────────────────────────

export interface CourseProgress {
  total: number;
  done: number;
  percent: number;
  /** First lesson not done yet (null when everything is done). */
  nextLessonId: string | null;
}

export const progressOf = (lessons: { id: string }[], rows: { lessonId: string; completedAt: Date | null }[]): CourseProgress => {
  const done = new Set(rows.filter((r) => r.completedAt).map((r) => r.lessonId));
  const doneCount = lessons.filter((l) => done.has(l.id)).length;
  return {
    total: lessons.length,
    done: doneCount,
    percent: lessons.length ? Math.round((doneCount / lessons.length) * 100) : 0,
    nextLessonId: lessons.find((l) => !done.has(l.id))?.id ?? null,
  };
};

const touch = (enrollmentId: string, now = new Date()) => prisma.courseEnrollment.update({ where: { id: enrollmentId }, data: { lastActivityAt: now } });

/** Marks a lesson as started (first open); never during "view as client". */
export const markStarted = async (userId: string, lesson: CourseLesson, enrollmentId: string) => {
  if (isImpersonating()) return null;
  const existing = await prisma.courseLessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId: lesson.id } } });
  if (existing) return existing;
  const row = await prisma.courseLessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId: lesson.id } },
    create: { userId, lessonId: lesson.id, courseId: lesson.courseId },
    update: {},
  });
  await touch(enrollmentId);
  return row;
};

/** After a lesson was completed: course done? → enrollment completed + certificate issued. */
export const afterLessonDone = async (userId: string, courseId: string, enrollmentId: string) => {
  const { lessons } = await outlineOf(courseId);
  const rows = await prisma.courseLessonProgress.findMany({ where: { userId, courseId }, select: { lessonId: true, completedAt: true } });
  const p = progressOf(lessons, rows);
  let certificate = null;
  if (p.total > 0 && p.done === p.total) {
    await prisma.courseEnrollment.updateMany({ where: { id: enrollmentId, completedAt: null }, data: { completedAt: new Date() } });
    certificate = await issueCertificate(userId, courseId);
  }
  return { progress: p, certificate };
};

const completeLesson = async (userId: string, lesson: CourseLesson, enrollmentId: string, data: Partial<Prisma.CourseLessonProgressUncheckedCreateInput> = {}) => {
  const now = new Date();
  await prisma.courseLessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId: lesson.id } },
    create: { userId, lessonId: lesson.id, courseId: lesson.courseId, completedAt: now, ...data },
    update: { ...data, completedAt: now },
  });
  await touch(enrollmentId, now);
};

/** TEXT lesson read → done (idempotent). */
export const completeTextLesson = async (userId: string, lesson: CourseLesson, enrollmentId: string) => {
  if (lesson.kind !== 'TEXT') throw badRequest('LESSON_NOT_TEXT');
  const existing = await prisma.courseLessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId: lesson.id } } });
  if (!existing?.completedAt) await completeLesson(userId, lesson, enrollmentId);
  return afterLessonDone(userId, lesson.courseId, enrollmentId);
};

/**
 * Video position report: keeps the resume position, grows the watched seconds (at most WATCH_SPEED × the wall
 * time since the last report + slack) and completes the lesson at 90 %.
 */
export const reportVideoProgress = async (userId: string, lesson: CourseLesson, enrollmentId: string, input: z.infer<typeof progressInput>, now = new Date()) => {
  if (lesson.kind !== 'VIDEO' || !lesson.videoKey) throw badRequest('LESSON_NOT_VIDEO');
  let duration = lesson.videoDuration;
  if (!duration && input.duration) {
    duration = Math.round(input.duration);
    await prisma.courseLesson.update({ where: { id: lesson.id }, data: { videoDuration: duration } });
  }
  const existing = await prisma.courseLessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId: lesson.id } } });
  const before = existing?.watchedSeconds ?? 0;
  const since = existing ? Math.max(0, (now.getTime() - existing.updatedAt.getTime()) / 1000) : 0;
  const cap = before + since * WATCH_SPEED + WATCH_SLACK_S;
  let watched = Math.max(before, Math.min(Math.floor(input.watched), Math.floor(cap)));
  let position = Math.floor(input.position);
  if (duration) {
    watched = Math.min(watched, duration);
    position = Math.min(position, duration);
  }
  const reached = !!duration && watched >= duration * WATCH_THRESHOLD;
  const completedAt = existing?.completedAt ?? (reached ? now : null);
  const row = await prisma.courseLessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId: lesson.id } },
    create: { userId, lessonId: lesson.id, courseId: lesson.courseId, watchedSeconds: watched, positionSeconds: position, completedAt },
    update: { watchedSeconds: watched, positionSeconds: position, completedAt },
  });
  await touch(enrollmentId, now);
  const justDone = !existing?.completedAt && !!completedAt;
  const after = justDone ? await afterLessonDone(userId, lesson.courseId, enrollmentId) : null;
  return { progress: lessonProgressView(row, duration), course: after?.progress ?? null, certificate: after?.certificate ?? null, justCompleted: justDone };
};

export const lessonProgressView = (
  row: { startedAt: Date; completedAt: Date | null; watchedSeconds: number; positionSeconds: number } | null,
  duration?: number | null,
) =>
  row
    ? {
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        watchedSeconds: row.watchedSeconds,
        positionSeconds: row.positionSeconds,
        watchedPercent: duration ? Math.min(100, Math.round((row.watchedSeconds / duration) * 100)) : null,
      }
    : null;

// ─── Quiz ──────────────────────────────────────────────────────────────

/** Questions as learners see them (no answer keys). */
export const learnerQuestions = (questions: CourseQuizQuestion[]) =>
  questions.map((q) => ({ id: q.id, kind: q.kind, prompt: asL10n(q.prompt), options: asL10nList(q.options) }));

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Grades answers (one array of option indexes per question): right iff the chosen set equals the key. */
export const gradeQuiz = (questions: CourseQuizQuestion[], answers: number[][], passMark: number) => {
  const results = questions.map((q, i) => {
    const chosen = [...new Set(answers[i] ?? [])];
    const key = asNumbers(q.correct);
    return { questionId: q.id, correct: sameSet(chosen, key), key, explanation: asL10n(q.explanation) };
  });
  const right = results.filter((r) => r.correct).length;
  const score = questions.length ? Math.round((right / questions.length) * 100) : 0;
  return { results, right, total: questions.length, score, passed: questions.length > 0 && score >= passMark };
};

export const quizQuestions = (lessonId: string) => prisma.courseQuizQuestion.findMany({ where: { lessonId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });

/**
 * Stores an attempt and answers with feedback: right / wrong and the explanation per question; the right
 * options only once the quiz is passed (so a failed attempt cannot simply be copied into the next one).
 */
export const submitQuiz = async (userId: string, lesson: CourseLesson, enrollmentId: string, answers: number[][]) => {
  if (lesson.kind !== 'QUIZ') throw badRequest('LESSON_NOT_QUIZ');
  const questions = await quizQuestions(lesson.id);
  if (!questions.length) throw badRequest('QUIZ_EMPTY');
  const graded = gradeQuiz(questions, answers, lesson.passMark);
  await prisma.courseQuizAttempt.create({
    data: { userId, lessonId: lesson.id, courseId: lesson.courseId, answers: questions.map((_, i) => [...new Set(answers[i] ?? [])]), score: graded.score, passed: graded.passed },
  });
  const existing = await prisma.courseLessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId: lesson.id } } });
  let after = null;
  if (graded.passed && !existing?.completedAt) {
    await completeLesson(userId, lesson, enrollmentId);
    after = await afterLessonDone(userId, lesson.courseId, enrollmentId);
  } else {
    await prisma.courseLessonProgress.upsert({ where: { userId_lessonId: { userId, lessonId: lesson.id } }, create: { userId, lessonId: lesson.id, courseId: lesson.courseId }, update: {} });
    await touch(enrollmentId);
  }
  const best = await bestScore(userId, lesson.id);
  return {
    score: graded.score,
    passed: graded.passed,
    passMark: lesson.passMark,
    right: graded.right,
    total: graded.total,
    best,
    results: graded.results.map((r) => ({ questionId: r.questionId, correct: r.correct, explanation: r.explanation, correctOptions: graded.passed ? r.key : null })),
    course: after?.progress ?? null,
    certificate: after?.certificate ?? null,
  };
};

export const bestScore = async (userId: string, lessonId: string) => {
  const r = await prisma.courseQuizAttempt.aggregate({ where: { userId, lessonId }, _max: { score: true }, _count: { _all: true } });
  return { score: r._max.score, attempts: r._count._all };
};

// ─── Certificate ───────────────────────────────────────────────────────

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0 / O / 1 / I
const randomCode = (n: number) => Array.from(crypto.randomBytes(n), (b) => ALPHABET[b % ALPHABET.length]).join('');
export const CODE_RE = /^[A-Z2-9]{12}$/;

export const initialsOf = (firstName: string, lastName: string) =>
  [firstName, lastName]
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `${s[0].toLocaleUpperCase('az')}.`)
    .join(' ');

/** Issues the certificate for a completed course (idempotent: one per user and course). */
export const issueCertificate = async (userId: string, courseId: string) => {
  const existing = await prisma.courseCertificate.findUnique({ where: { courseId_userId: { courseId, userId } } });
  if (existing) return existing;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  if (!user) throw notFound('USER_NOT_FOUND');
  const year = new Date().getUTCFullYear();
  for (let i = 0; i < 6; i++) {
    try {
      return await prisma.courseCertificate.create({
        data: { courseId, userId, number: `CRS-${year}-${randomCode(6)}`, code: randomCode(12), holderName: `${user.firstName} ${user.lastName}`.trim().slice(0, 200) },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      const again = await prisma.courseCertificate.findUnique({ where: { courseId_userId: { courseId, userId } } });
      if (again) return again; // a parallel request issued it
    }
  }
  throw conflict('CERTIFICATE_NUMBER_EXHAUSTED');
};

/** Public verification: initials, course title and date only (no name, no number, no account data). */
export const verifyCertificate = async (code: string) => {
  if (!CODE_RE.test(code)) return null;
  const cert = await prisma.courseCertificate.findUnique({ where: { code } });
  if (!cert) return null;
  const [user, course] = await Promise.all([
    prisma.user.findUnique({ where: { id: cert.userId }, select: { firstName: true, lastName: true } }),
    prisma.course.findUnique({ where: { id: cert.courseId }, select: { title: true } }),
  ]);
  const [first = '', ...rest] = cert.holderName.split(/\s+/);
  const initials = user ? initialsOf(user.firstName, user.lastName) : initialsOf(first, rest.join(' '));
  return { valid: true, initials, course: asL10n(course?.title) ?? null, issuedAt: cert.issuedAt };
};

// ─── Learner views ─────────────────────────────────────────────────────

/** The client's courses with progress (auto-enrollment synced first). */
export const learnerCourses = async (userId: string) => {
  await syncAutoEnrollments({ userId });
  const enrollments = await prisma.courseEnrollment.findMany({ where: { userId, removedAt: null }, orderBy: { enrolledAt: 'asc' } });
  const courses = await prisma.course.findMany({ where: { id: { in: enrollments.map((e) => e.courseId) }, published: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  const [rows, certs] = await Promise.all([
    prisma.courseLessonProgress.findMany({ where: { userId, courseId: { in: courses.map((c) => c.id) } }, select: { lessonId: true, completedAt: true, courseId: true } }),
    prisma.courseCertificate.findMany({ where: { userId, courseId: { in: courses.map((c) => c.id) } } }),
  ]);
  const out = [];
  for (const c of courses) {
    const { modules, lessons } = await outlineOf(c.id);
    const p = progressOf(lessons, rows.filter((r) => r.courseId === c.id));
    const next = lessons.find((l) => l.id === p.nextLessonId);
    const cert = certs.find((x) => x.courseId === c.id);
    out.push({
      id: c.id,
      title: asL10n(c.title),
      description: asL10n(c.description),
      modules: modules.length,
      minutes: lessons.reduce((n, l) => n + (l.minutes ?? 0), 0),
      progress: p,
      next: next ? { lessonId: next.id, title: asL10n(next.title), kind: next.kind } : null,
      certificate: cert ? { number: cert.number, code: cert.code, issuedAt: cert.issuedAt } : null,
      started: rows.some((r) => r.courseId === c.id),
    });
  }
  return out;
};

/** One course for the client: modules, lessons with own progress, certificate. */
export const learnerCourse = async (userId: string, courseId: string) => {
  const { course } = await requireEnrollment(userId, courseId);
  const { modules, lessons } = await outlineOf(courseId);
  const [rows, attempts, cert] = await Promise.all([
    prisma.courseLessonProgress.findMany({ where: { userId, courseId } }),
    prisma.courseQuizAttempt.groupBy({ by: ['lessonId'], where: { userId, courseId }, _max: { score: true }, _count: { _all: true } }),
    prisma.courseCertificate.findUnique({ where: { courseId_userId: { courseId, userId } } }),
  ]);
  const byLesson = new Map(rows.map((r) => [r.lessonId, r]));
  const best = new Map(attempts.map((a) => [a.lessonId, { score: a._max.score, attempts: a._count._all }]));
  return {
    id: course.id,
    title: asL10n(course.title),
    description: asL10n(course.description),
    disclaimer: asL10n(course.disclaimer),
    progress: progressOf(lessons, rows),
    certificate: cert ? { number: cert.number, code: cert.code, issuedAt: cert.issuedAt } : null,
    modules: modules.map((m) => ({
      id: m.id,
      title: asL10n(m.title),
      description: asL10n(m.description),
      lessons: lessons
        .filter((l) => l.moduleId === m.id)
        .map((l) => ({
          id: l.id,
          kind: l.kind,
          title: asL10n(l.title),
          minutes: l.minutes,
          passMark: l.kind === 'QUIZ' ? l.passMark : null,
          progress: lessonProgressView(byLesson.get(l.id) ?? null, l.videoDuration),
          quiz: l.kind === 'QUIZ' ? (best.get(l.id) ?? { score: null, attempts: 0 }) : null,
        })),
    })),
  };
};

/** One lesson for the client (marks it started): text, video info, subtitles, quiz without keys, neighbours. */
export const learnerLesson = async (userId: string, lessonId: string) => {
  const { lesson, enrollment, course } = await requireLessonAccess(userId, lessonId);
  const row = (await markStarted(userId, lesson, enrollment.id)) ?? (await prisma.courseLessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId } } }));
  const { modules, lessons } = await outlineOf(lesson.courseId);
  const i = lessons.findIndex((l) => l.id === lesson.id);
  const questions = lesson.kind === 'QUIZ' ? await quizQuestions(lesson.id) : [];
  const mod = modules.find((m) => m.id === lesson.moduleId);
  return {
    id: lesson.id,
    courseId: lesson.courseId,
    course: { id: course.id, title: asL10n(course.title), disclaimer: asL10n(course.disclaimer) },
    module: mod ? { id: mod.id, title: asL10n(mod.title), index: modules.indexOf(mod) + 1 } : null,
    kind: lesson.kind,
    title: asL10n(lesson.title),
    body: asL10n(lesson.body),
    minutes: lesson.minutes,
    passMark: lesson.passMark,
    video: lesson.videoKey ? { mime: lesson.videoMime, duration: lesson.videoDuration, poster: !!lesson.posterKey } : null,
    subtitles: Object.keys(subtitlesOf(lesson.subtitles)) as CourseLocale[],
    questions: learnerQuestions(questions),
    progress: lessonProgressView(row, lesson.videoDuration),
    quiz: lesson.kind === 'QUIZ' ? await bestScore(userId, lesson.id) : null,
    prevId: i > 0 ? lessons[i - 1].id : null,
    nextId: i >= 0 && i < lessons.length - 1 ? lessons[i + 1].id : null,
    position: { index: i + 1, total: lessons.length },
  };
};

// ─── Deleting ──────────────────────────────────────────────────────────

/** Removes a lesson with its questions, files, progress and attempts. */
export const deleteLesson = async (lesson: CourseLesson) => {
  await prisma.$transaction([
    prisma.courseQuizQuestion.deleteMany({ where: { lessonId: lesson.id } }),
    prisma.courseQuizAttempt.deleteMany({ where: { lessonId: lesson.id } }),
    prisma.courseLessonProgress.deleteMany({ where: { lessonId: lesson.id } }),
    prisma.courseLesson.delete({ where: { id: lesson.id } }),
  ]);
  await Promise.all([removeCourseFile(lesson.videoKey), removeCourseFile(lesson.posterKey), ...Object.values(subtitlesOf(lesson.subtitles)).map((k) => removeCourseFile(k))]);
};

/** DSGVO erasure of a user: enrollments, progress, attempts and certificates (plain ids, no foreign keys). */
export const deleteCourseData = async (userId: string) => {
  await prisma.$transaction([
    prisma.courseQuizAttempt.deleteMany({ where: { userId } }),
    prisma.courseLessonProgress.deleteMany({ where: { userId } }),
    prisma.courseEnrollment.deleteMany({ where: { userId } }),
    prisma.courseCertificate.deleteMany({ where: { userId } }),
  ]);
};

export const nextSortOrder = async (model: 'module' | 'lesson', parentId: string) => {
  const r =
    model === 'module'
      ? await prisma.courseModule.aggregate({ where: { courseId: parentId }, _max: { sortOrder: true } })
      : await prisma.courseLesson.aggregate({ where: { moduleId: parentId }, _max: { sortOrder: true } });
  return (r._max.sortOrder ?? -1) + 1;
};
