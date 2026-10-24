import type { Prisma, Role, TrainingCourse, TrainingLesson } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest, notFound } from '../http.js';

/**
 * Internal training / onboarding for the team (Admin → Təlim, workspace → Təlim).
 *
 *  - Courses are visible to the roles in `roles` (null = every staff role) once published; `required`
 *    courses show a badge / banner until every lesson is done.
 *  - A lesson has a markdown body, an optional video (YouTube / Vimeo / mp4 link or a drive file) and an
 *    optional quiz [{ q, options, answer }]. Quizzes are graded on the server: the answer keys never leave
 *    the server for learners — not before submitting and not after (only right / wrong per question).
 *  - A lesson without a quiz is completed with a click; with a quiz, by reaching `passScore` percent.
 */

export const TEAM_ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
}

export const quizSchema = z
  .array(
    z
      .object({
        q: z.string().trim().min(1).max(500),
        options: z.array(z.string().trim().min(1).max(300)).min(2).max(8),
        answer: z.number().int().min(0),
      })
      .refine((x) => x.answer < x.options.length, { message: 'ANSWER_OUT_OF_RANGE' }),
  )
  .max(30);

/** Reads the stored Json safely: malformed questions are dropped. */
export const parseQuiz = (raw: unknown): QuizQuestion[] => {
  const r = quizSchema.safeParse(raw);
  if (r.success) return r.data;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    const one = quizSchema.element.safeParse(x);
    return one.success ? [one.data] : [];
  });
};

/** Quiz as learners see it: questions and options only. */
export const publicQuiz = (quiz: QuizQuestion[]) => quiz.map((x) => ({ q: x.q, options: x.options }));

/** Percent of right answers (0–100, rounded) and right / wrong per question. */
export const gradeQuiz = (quiz: QuizQuestion[], answers: (number | null)[]) => {
  const correct = quiz.map((x, i) => answers[i] === x.answer);
  const score = quiz.length ? Math.round((correct.filter(Boolean).length / quiz.length) * 100) : 100;
  return { score, correct };
};

export const parseRoles = (raw: unknown): Role[] | null =>
  Array.isArray(raw) ? (raw.filter((r) => typeof r === 'string' && (TEAM_ROLES as string[]).includes(r)) as Role[]) : null;

export const courseVisibleTo = (c: Pick<TrainingCourse, 'roles' | 'published'>, role: Role) => {
  if (!c.published) return false;
  const roles = parseRoles(c.roles);
  return !roles || roles.length === 0 || roles.includes(role);
};

// ─── Video ─────────────────────────────────────────────────────────────

/** A video link as an embeddable source: YouTube / Vimeo player URL, or a direct file (mp4 / webm). */
export const videoEmbed = (url: string | null | undefined): { kind: 'youtube' | 'vimeo' | 'file'; src: string } | null => {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(u.pathname.slice(1))}` };
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id = u.searchParams.get('v') ?? /^\/(?:embed|shorts|live)\/([^/?#]+)/.exec(u.pathname)?.[1];
    return id ? { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` } : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = /(\d{6,})/.exec(u.pathname)?.[1];
    return id ? { kind: 'vimeo', src: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (/\.(mp4|webm|ogg|mov)$/i.test(u.pathname)) return { kind: 'file', src: u.toString() };
  return null;
};

// ─── Schemas ───────────────────────────────────────────────────────────

const roles = z.array(z.enum(['STAFF', 'ADMIN', 'SUPER_ADMIN'])).max(3).nullable();

export const courseSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  roles: roles.optional(),
  required: z.boolean().optional(),
  published: z.boolean().optional(),
});

export const lessonSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(200_000).nullable().optional(),
  videoUrl: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .refine((v) => !v || videoEmbed(v) !== null, { message: 'INVALID_VIDEO_URL' }),
  driveNodeId: z.string().trim().max(40).nullable().optional(),
  minutes: z.number().int().min(0).max(600).nullable().optional(),
  quiz: quizSchema.nullable().optional(),
  passScore: z.number().int().min(0).max(100).optional(),
});

export const reorderSchema = z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(500) });

// ─── Views ─────────────────────────────────────────────────────────────

export const lessonAdminView = (l: TrainingLesson) => ({
  id: l.id,
  courseId: l.courseId,
  title: l.title,
  body: l.body,
  videoUrl: l.videoUrl,
  driveNodeId: l.driveNodeId,
  minutes: l.minutes,
  sortOrder: l.sortOrder,
  quiz: parseQuiz(l.quiz),
  passScore: l.passScore,
  updatedAt: l.updatedAt,
});

export const courseView = (c: TrainingCourse) => ({
  id: c.id,
  title: c.title,
  description: c.description,
  roles: parseRoles(c.roles),
  required: c.required,
  sortOrder: c.sortOrder,
  published: c.published,
  updatedAt: c.updatedAt,
});

type ProgressRow = { lessonId: string; completedAt: Date | null; quizScore: number | null; attempts: number };

const summarize = (lessonIds: string[], progress: ProgressRow[]) => {
  const done = progress.filter((p) => p.completedAt && lessonIds.includes(p.lessonId));
  const scores = done.map((p) => p.quizScore).filter((s): s is number => s !== null);
  const total = lessonIds.length;
  const complete = total > 0 && done.length === total;
  return {
    lessons: total,
    completed: done.length,
    percent: total ? Math.round((done.length / total) * 100) : 0,
    complete,
    completedAt: complete ? new Date(Math.max(...done.map((p) => p.completedAt!.getTime()))) : null,
    avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
  };
};

// ─── Learner ───────────────────────────────────────────────────────────

interface Learner {
  id: string;
  role: Role;
}

const visibleCourses = async (viewer: Learner) => {
  const courses = await prisma.trainingCourse.findMany({ where: { published: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  return courses.filter((c) => courseVisibleTo(c, viewer.role));
};

/** Courses for the learner with their progress (lesson list without bodies). */
export const learnerCourses = async (viewer: Learner) => {
  const courses = await visibleCourses(viewer);
  const ids = courses.map((c) => c.id);
  const [lessons, progress] = await Promise.all([
    prisma.trainingLesson.findMany({ where: { courseId: { in: ids } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, courseId: true, title: true, minutes: true, quiz: true, videoUrl: true, driveNodeId: true } }),
    prisma.trainingProgress.findMany({ where: { userId: viewer.id, courseId: { in: ids } }, select: { lessonId: true, completedAt: true, quizScore: true, attempts: true } }),
  ]);
  const prog = new Map(progress.map((p) => [p.lessonId, p]));
  return courses.map((c) => {
    const own = lessons.filter((l) => l.courseId === c.id);
    return {
      ...courseView(c),
      progress: summarize(
        own.map((l) => l.id),
        progress,
      ),
      lessons: own.map((l) => ({
        id: l.id,
        title: l.title,
        minutes: l.minutes,
        hasQuiz: parseQuiz(l.quiz).length > 0,
        hasVideo: !!(l.videoUrl || l.driveNodeId),
        completedAt: prog.get(l.id)?.completedAt ?? null,
        quizScore: prog.get(l.id)?.quizScore ?? null,
      })),
    };
  });
};

/** Required courses the learner has not finished (badge / banner). */
export const pendingRequired = async (viewer: Learner) => {
  const courses = (await learnerCourses(viewer)).filter((c) => c.required && c.progress.lessons > 0 && !c.progress.complete);
  return { count: courses.length, courses: courses.map((c) => ({ id: c.id, title: c.title, percent: c.progress.percent })) };
};

const loadVisibleLesson = async (viewer: Learner, lessonId: string) => {
  const lesson = await prisma.trainingLesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw notFound('LESSON_NOT_FOUND');
  const course = await prisma.trainingCourse.findUnique({ where: { id: lesson.courseId } });
  if (!course || !courseVisibleTo(course, viewer.role)) throw notFound('LESSON_NOT_FOUND');
  return { lesson, course };
};

/** One lesson for the learner: body, video, quiz WITHOUT answer keys, own progress, previous / next. */
export const learnerLesson = async (viewer: Learner, lessonId: string) => {
  const { lesson, course } = await loadVisibleLesson(viewer, lessonId);
  const [siblings, progress] = await Promise.all([
    prisma.trainingLesson.findMany({ where: { courseId: course.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, title: true } }),
    prisma.trainingProgress.findUnique({ where: { userId_lessonId: { userId: viewer.id, lessonId } } }),
  ]);
  const i = siblings.findIndex((s) => s.id === lesson.id);
  const quiz = parseQuiz(lesson.quiz);
  return {
    course: { id: course.id, title: course.title, required: course.required },
    lesson: {
      id: lesson.id,
      title: lesson.title,
      body: lesson.body,
      minutes: lesson.minutes,
      video: videoEmbed(lesson.videoUrl),
      driveNodeId: lesson.driveNodeId,
      quiz: publicQuiz(quiz),
      passScore: lesson.passScore,
    },
    progress: progress ? { completedAt: progress.completedAt, quizScore: progress.quizScore, attempts: progress.attempts } : null,
    prev: i > 0 ? siblings[i - 1] : null,
    next: i >= 0 && i < siblings.length - 1 ? siblings[i + 1] : null,
    position: i + 1,
    total: siblings.length,
  };
};

/** Marks a lesson without a quiz as done (a lesson with a quiz is done by passing it). */
export const completeLesson = async (viewer: Learner, lessonId: string, now = new Date()) => {
  const { lesson } = await loadVisibleLesson(viewer, lessonId);
  if (parseQuiz(lesson.quiz).length) throw badRequest('QUIZ_REQUIRED');
  const row = await prisma.trainingProgress.upsert({
    where: { userId_lessonId: { userId: viewer.id, lessonId } },
    create: { userId: viewer.id, courseId: lesson.courseId, lessonId, completedAt: now },
    update: {},
  });
  if (!row.completedAt) await prisma.trainingProgress.update({ where: { id: row.id }, data: { completedAt: now } });
  return { completedAt: row.completedAt ?? now };
};

export const submitSchema = z.object({ answers: z.array(z.number().int().min(0).max(20).nullable()).max(30) });

/** Grades a quiz attempt; a pass completes the lesson (an earlier pass is kept with the best score). */
export const submitQuiz = async (viewer: Learner, lessonId: string, answers: (number | null)[], now = new Date()) => {
  const { lesson } = await loadVisibleLesson(viewer, lessonId);
  const quiz = parseQuiz(lesson.quiz);
  if (!quiz.length) throw badRequest('NO_QUIZ');
  if (answers.length !== quiz.length) throw badRequest('ANSWER_COUNT');
  const { score, correct } = gradeQuiz(quiz, answers);
  const passed = score >= lesson.passScore;
  const prev = await prisma.trainingProgress.findUnique({ where: { userId_lessonId: { userId: viewer.id, lessonId } } });
  const best = Math.max(score, prev?.quizScore ?? 0);
  const data: Prisma.TrainingProgressUncheckedUpdateInput = {
    attempts: { increment: 1 },
    quizScore: prev?.completedAt ? best : score,
    ...(passed && !prev?.completedAt ? { completedAt: now } : {}),
  };
  const row = prev
    ? await prisma.trainingProgress.update({ where: { id: prev.id }, data })
    : await prisma.trainingProgress.create({ data: { userId: viewer.id, courseId: lesson.courseId, lessonId, attempts: 1, quizScore: score, completedAt: passed ? now : null } });
  return { score, passed, passScore: lesson.passScore, correct, attempts: row.attempts, completedAt: row.completedAt };
};

// ─── Admin ─────────────────────────────────────────────────────────────

/** Who completed what: every active staff member × every course (published or not). */
export const progressMatrix = async () => {
  const [courses, lessons, users, progress] = await Promise.all([
    prisma.trainingCourse.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.trainingLesson.findMany({ select: { id: true, courseId: true } }),
    prisma.user.findMany({ where: { role: { in: TEAM_ROLES }, isActive: true }, select: { id: true, firstName: true, lastName: true, role: true }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] }),
    prisma.trainingProgress.findMany({ select: { userId: true, courseId: true, lessonId: true, completedAt: true, quizScore: true, attempts: true } }),
  ]);
  const lessonsOf = new Map<string, string[]>();
  for (const l of lessons) lessonsOf.set(l.courseId, [...(lessonsOf.get(l.courseId) ?? []), l.id]);
  const byUser = new Map<string, typeof progress>();
  for (const p of progress) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);
  return {
    courses: courses.map((c) => ({ ...courseView(c), lessons: lessonsOf.get(c.id)?.length ?? 0 })),
    rows: users.map((u) => ({
      user: u,
      cells: Object.fromEntries(
        courses.map((c) => {
          const applies = courseVisibleTo({ ...c, published: true }, u.role);
          const s = summarize(lessonsOf.get(c.id) ?? [], (byUser.get(u.id) ?? []).filter((p) => p.courseId === c.id));
          return [c.id, { ...s, applies, attempts: (byUser.get(u.id) ?? []).filter((p) => p.courseId === c.id).reduce((a, p) => a + p.attempts, 0) }];
        }),
      ),
    })),
  };
};

/** Next sort position at the end of a list. */
export const nextSort = async (kind: 'course' | 'lesson', courseId?: string) => {
  const agg =
    kind === 'course'
      ? await prisma.trainingCourse.aggregate({ _max: { sortOrder: true } })
      : await prisma.trainingLesson.aggregate({ where: { courseId }, _max: { sortOrder: true } });
  return (agg._max.sortOrder ?? -1) + 1;
};
