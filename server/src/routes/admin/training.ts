import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import {
  completeLesson,
  courseSchema,
  courseView,
  learnerCourses,
  learnerLesson,
  lessonAdminView,
  lessonSchema,
  nextSort,
  pendingRequired,
  progressMatrix,
  reorderSchema,
  submitQuiz,
  submitSchema,
} from '../../lib/training/service.js';
import { createStarterCourses } from '../../lib/training/starter.js';

/**
 * Internal training — /api/admin/training (STAFF+ learn; authoring and the progress matrix are ADMIN+).
 *
 *   GET  /learn                          my courses with progress
 *   GET  /learn/pending                  required courses I have not finished (nav badge, banner)
 *   GET  /learn/lessons/:id              lesson (quiz without answer keys)
 *   POST /learn/lessons/:id/complete     lesson without a quiz → done
 *   POST /learn/lessons/:id/quiz         { answers } → graded on the server
 *
 *   GET  /courses · POST                 all courses (with lesson counts) / new course
 *   POST /courses/reorder                { ids }
 *   POST /courses/starter                idempotent starter courses (Azerbaijani)
 *   GET  /courses/:id · PATCH · DELETE   course with full lessons (quiz keys included)
 *   POST /courses/:id/lessons            new lesson; POST /courses/:id/lessons/reorder { ids }
 *   PATCH /lessons/:id · DELETE
 *   GET  /progress                       who completed what (matrix)
 */
export const adminTrainingRouter = Router();

const viewer = (req: Request) => ({ id: req.user!.id, role: req.user!.role });

// ─── Learner ───────────────────────────────────────────────────────────

adminTrainingRouter.get('/learn', async (req, res) => {
  res.json({ courses: await learnerCourses(viewer(req)) });
});

adminTrainingRouter.get('/learn/pending', async (req, res) => {
  res.json(await pendingRequired(viewer(req)));
});

adminTrainingRouter.get('/learn/lessons/:id', async (req, res) => {
  res.json(await learnerLesson(viewer(req), String(req.params.id)));
});

adminTrainingRouter.post('/learn/lessons/:id/complete', async (req, res) => {
  res.json(await completeLesson(viewer(req), String(req.params.id)));
});

adminTrainingRouter.post('/learn/lessons/:id/quiz', async (req, res) => {
  const { answers } = parse(submitSchema, req.body);
  const result = await submitQuiz(viewer(req), String(req.params.id), answers);
  if (result.passed) void audit(req, 'TRAINING_QUIZ_PASSED', String(req.params.id), { score: result.score, attempts: result.attempts });
  res.json(result);
});

// ─── Authoring (ADMIN+) ────────────────────────────────────────────────

const admin = requireMinRole('ADMIN');

const jsonOrNull = (v: unknown) => (v === null ? (null as unknown as Prisma.InputJsonValue) : (v as Prisma.InputJsonValue));

adminTrainingRouter.get('/courses', admin, async (_req, res) => {
  const [courses, counts] = await Promise.all([
    prisma.trainingCourse.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.trainingLesson.groupBy({ by: ['courseId'], _count: { _all: true } }),
  ]);
  const n = new Map(counts.map((c) => [c.courseId, c._count._all]));
  res.json({ courses: courses.map((c) => ({ ...courseView(c), lessons: n.get(c.id) ?? 0 })) });
});

adminTrainingRouter.post('/courses', admin, async (req, res) => {
  const b = parse(courseSchema, req.body);
  const c = await prisma.trainingCourse.create({
    data: {
      title: b.title,
      description: b.description ?? null,
      roles: b.roles ? (b.roles as Prisma.InputJsonValue) : undefined,
      required: b.required ?? false,
      published: b.published ?? false,
      sortOrder: await nextSort('course'),
      createdById: req.user!.id,
    },
  });
  void audit(req, 'TRAINING_COURSE_CREATED', c.id, { title: c.title });
  res.status(201).json({ course: { ...courseView(c), lessons: [] } });
});

adminTrainingRouter.post('/courses/reorder', admin, async (req, res) => {
  const { ids } = parse(reorderSchema, req.body);
  await prisma.$transaction(ids.map((id, i) => prisma.trainingCourse.updateMany({ where: { id }, data: { sortOrder: i } })));
  res.json({ ok: true });
});

adminTrainingRouter.post('/courses/starter', admin, async (req, res) => {
  const result = await createStarterCourses(req.user!.id);
  void audit(req, 'TRAINING_STARTER_CREATED', undefined, { created: result.created });
  res.json(result);
});

const loadCourse = async (id: string) => {
  const c = await prisma.trainingCourse.findUnique({ where: { id } });
  if (!c) throw notFound('COURSE_NOT_FOUND');
  return c;
};

adminTrainingRouter.get('/courses/:id', admin, async (req, res) => {
  const c = await loadCourse(String(req.params.id));
  const lessons = await prisma.trainingLesson.findMany({ where: { courseId: c.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  res.json({ course: { ...courseView(c), lessons: lessons.map(lessonAdminView) } });
});

adminTrainingRouter.patch('/courses/:id', admin, async (req, res) => {
  const c = await loadCourse(String(req.params.id));
  const b = parse(courseSchema.partial(), req.body);
  const updated = await prisma.trainingCourse.update({
    where: { id: c.id },
    data: {
      ...(b.title !== undefined ? { title: b.title } : {}),
      ...(b.description !== undefined ? { description: b.description } : {}),
      ...(b.roles !== undefined ? { roles: jsonOrNull(b.roles) } : {}),
      ...(b.required !== undefined ? { required: b.required } : {}),
      ...(b.published !== undefined ? { published: b.published } : {}),
    },
  });
  void audit(req, 'TRAINING_COURSE_UPDATED', c.id, b as Prisma.InputJsonValue);
  res.json({ course: courseView(updated) });
});

adminTrainingRouter.delete('/courses/:id', admin, async (req, res) => {
  const c = await loadCourse(String(req.params.id));
  await prisma.$transaction([
    prisma.trainingProgress.deleteMany({ where: { courseId: c.id } }),
    prisma.trainingLesson.deleteMany({ where: { courseId: c.id } }),
    prisma.trainingCourse.delete({ where: { id: c.id } }),
  ]);
  void audit(req, 'TRAINING_COURSE_DELETED', c.id, { title: c.title });
  res.json({ ok: true });
});

const lessonData = (b: Partial<ReturnType<typeof lessonSchema.parse>>) => ({
  ...(b.title !== undefined ? { title: b.title } : {}),
  ...(b.body !== undefined ? { body: b.body } : {}),
  ...(b.videoUrl !== undefined ? { videoUrl: b.videoUrl || null } : {}),
  ...(b.driveNodeId !== undefined ? { driveNodeId: b.driveNodeId || null } : {}),
  ...(b.minutes !== undefined ? { minutes: b.minutes } : {}),
  ...(b.quiz !== undefined ? { quiz: b.quiz && b.quiz.length ? (b.quiz as unknown as Prisma.InputJsonValue) : jsonOrNull(null) } : {}),
  ...(b.passScore !== undefined ? { passScore: b.passScore } : {}),
});

const checkDriveNode = async (id: string | null | undefined) => {
  if (!id) return;
  const n = await prisma.driveNode.findUnique({ where: { id }, select: { kind: true, deletedAt: true } });
  if (!n || n.kind !== 'FILE' || n.deletedAt) throw badRequest('INVALID_DRIVE_NODE');
};

adminTrainingRouter.post('/courses/:id/lessons', admin, async (req, res) => {
  const c = await loadCourse(String(req.params.id));
  const b = parse(lessonSchema, req.body);
  await checkDriveNode(b.driveNodeId);
  const l = await prisma.trainingLesson.create({ data: { courseId: c.id, title: b.title, sortOrder: await nextSort('lesson', c.id), ...lessonData(b) } });
  void audit(req, 'TRAINING_LESSON_CREATED', l.id, { courseId: c.id, title: l.title });
  res.status(201).json({ lesson: lessonAdminView(l) });
});

adminTrainingRouter.post('/courses/:id/lessons/reorder', admin, async (req, res) => {
  const c = await loadCourse(String(req.params.id));
  const { ids } = parse(reorderSchema, req.body);
  await prisma.$transaction(ids.map((id, i) => prisma.trainingLesson.updateMany({ where: { id, courseId: c.id }, data: { sortOrder: i } })));
  res.json({ ok: true });
});

const loadLesson = async (id: string) => {
  const l = await prisma.trainingLesson.findUnique({ where: { id } });
  if (!l) throw notFound('LESSON_NOT_FOUND');
  return l;
};

adminTrainingRouter.patch('/lessons/:id', admin, async (req, res) => {
  const l = await loadLesson(String(req.params.id));
  const b = parse(lessonSchema.partial(), req.body);
  await checkDriveNode(b.driveNodeId);
  const updated = await prisma.trainingLesson.update({ where: { id: l.id }, data: lessonData(b) });
  void audit(req, 'TRAINING_LESSON_UPDATED', l.id, { courseId: l.courseId, fields: Object.keys(b) });
  res.json({ lesson: lessonAdminView(updated) });
});

adminTrainingRouter.delete('/lessons/:id', admin, async (req, res) => {
  const l = await loadLesson(String(req.params.id));
  await prisma.$transaction([prisma.trainingProgress.deleteMany({ where: { lessonId: l.id } }), prisma.trainingLesson.delete({ where: { id: l.id } })]);
  void audit(req, 'TRAINING_LESSON_DELETED', l.id, { courseId: l.courseId, title: l.title });
  res.json({ ok: true });
});

adminTrainingRouter.get('/progress', admin, async (_req, res) => {
  res.json(await progressMatrix());
});
