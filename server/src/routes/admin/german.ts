import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { notFound, parse } from '../../lib/http.js';
import { PROFILE_LEVELS } from '../../lib/german/progress.js';
import {
  courseCreateSchema,
  courseUpdateSchema,
  createCourse,
  createExam,
  deleteCourse,
  deleteExam,
  examCreateSchema,
  examDateData,
  examDateSchema,
  examDateUpdateSchema,
  examUpdateSchema,
  germanOverview,
  planSchema,
  savePlan,
  serializeExamDate,
  updateCourse,
  updateExam,
} from '../../lib/german/service.js';

/**
 * admin/german — mounted at /api/admin/german (STAFF+; exam-date writes ADMIN+).
 *
 *   GET    /exam-dates                       all exam dates (Admin → İmtahan tarixləri)
 *   POST   /exam-dates  PATCH|DELETE /exam-dates/:id
 *   GET    /users/:userId                    a candidate's German progress (case / user page panel)
 *   PUT    /users/:userId/level              { level } — sets User.germanLevel (audited)
 *   PUT    /users/:userId/plan
 *   POST   /users/:userId/courses|exams  PATCH|DELETE …/:id
 */
export const adminGermanRouter = Router();
adminGermanRouter.use(requireMinRole('STAFF'));
const adminOnly = requireMinRole('ADMIN');

adminGermanRouter.get('/exam-dates', async (req, res) => {
  const { scope } = parse(z.object({ scope: z.enum(['upcoming', 'all']).default('upcoming') }), req.query);
  const items = await prisma.germanExamDate.findMany({
    where: scope === 'upcoming' ? { examDate: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } : {},
    orderBy: { examDate: scope === 'upcoming' ? 'asc' : 'desc' },
    take: 300,
    include: { _count: { select: { exams: true } } },
  });
  res.json({ items: items.map(({ _count, ...d }) => ({ ...serializeExamDate(d), candidates: _count.exams })) });
});

adminGermanRouter.post('/exam-dates', adminOnly, async (req, res) => {
  const body = parse(examDateSchema, req.body ?? {});
  const row = await prisma.germanExamDate.create({ data: { ...(examDateData(body) as Prisma.GermanExamDateUncheckedCreateInput), createdById: req.user!.id } });
  await audit(req, 'GERMAN_EXAM_DATE_CREATED', `germanExamDate:${row.id}`, { provider: row.provider, examDate: row.examDate.toISOString() });
  res.status(201).json({ item: serializeExamDate(row) });
});

adminGermanRouter.patch('/exam-dates/:id', adminOnly, async (req, res) => {
  const body = parse(examDateUpdateSchema, req.body ?? {});
  const exists = await prisma.germanExamDate.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!exists) throw notFound('EXAM_DATE_NOT_FOUND');
  const row = await prisma.germanExamDate.update({ where: { id: exists.id }, data: examDateData(body) });
  await audit(req, 'GERMAN_EXAM_DATE_UPDATED', `germanExamDate:${row.id}`, { fields: Object.keys(body) });
  res.json({ item: serializeExamDate(row) });
});

adminGermanRouter.delete('/exam-dates/:id', adminOnly, async (req, res) => {
  const exists = await prisma.germanExamDate.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!exists) throw notFound('EXAM_DATE_NOT_FOUND');
  await prisma.germanExamDate.delete({ where: { id: exists.id } }); // candidates' exams keep their copied date (examDateId → null)
  await audit(req, 'GERMAN_EXAM_DATE_DELETED', `germanExamDate:${exists.id}`);
  res.json({ ok: true });
});

// ─── A candidate's progress (staff) ────────────────────────────────────

const candidate = async (userId: string) => {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!u || u.role !== 'CLIENT') throw notFound('USER_NOT_FOUND');
  return u.id;
};

adminGermanRouter.get('/users/:userId', async (req, res) => {
  res.json(await germanOverview(await candidate(String(req.params.userId))));
});

adminGermanRouter.put('/users/:userId/level', async (req, res) => {
  const userId = await candidate(String(req.params.userId));
  const { level } = parse(z.object({ level: z.enum(PROFILE_LEVELS) }), req.body ?? {});
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { germanLevel: true } });
  await prisma.user.update({ where: { id: userId }, data: { germanLevel: level } });
  await audit(req, 'GERMAN_LEVEL_SET', `user:${userId}`, { from: before.germanLevel ?? null, to: level });
  res.json(await germanOverview(userId));
});

adminGermanRouter.put('/users/:userId/plan', async (req, res) => {
  const userId = await candidate(String(req.params.userId));
  await savePlan(userId, parse(planSchema, req.body ?? {}));
  res.json(await germanOverview(userId));
});

adminGermanRouter.post('/users/:userId/courses', async (req, res) => {
  const userId = await candidate(String(req.params.userId));
  const c = await createCourse(userId, parse(courseCreateSchema, req.body ?? {}), req.user!.id);
  res.status(201).json({ id: c.id, ...(await germanOverview(userId)) });
});

adminGermanRouter.patch('/users/:userId/courses/:id', async (req, res) => {
  const userId = await candidate(String(req.params.userId));
  await updateCourse(userId, String(req.params.id), parse(courseUpdateSchema, req.body ?? {}));
  res.json(await germanOverview(userId));
});

adminGermanRouter.delete('/users/:userId/courses/:id', async (req, res) => {
  const userId = await candidate(String(req.params.userId));
  await deleteCourse(userId, String(req.params.id));
  res.json(await germanOverview(userId));
});

adminGermanRouter.post('/users/:userId/exams', async (req, res) => {
  const userId = await candidate(String(req.params.userId));
  const e = await createExam(userId, parse(examCreateSchema, req.body ?? {}), req.user!.id);
  res.status(201).json({ id: e.id, ...(await germanOverview(userId)) });
});

adminGermanRouter.patch('/users/:userId/exams/:id', async (req, res) => {
  const userId = await candidate(String(req.params.userId));
  const body = parse(examUpdateSchema, req.body ?? {});
  await updateExam(userId, String(req.params.id), body);
  if (body.results !== undefined || body.passed !== undefined) await audit(req, 'GERMAN_EXAM_RESULT_SET', `germanExam:${String(req.params.id)}`, { userId });
  res.json(await germanOverview(userId));
});

adminGermanRouter.delete('/users/:userId/exams/:id', async (req, res) => {
  const userId = await candidate(String(req.params.userId));
  await deleteExam(userId, String(req.params.id));
  res.json(await germanOverview(userId));
});
