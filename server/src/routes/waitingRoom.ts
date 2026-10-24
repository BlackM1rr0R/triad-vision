import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { notFound, parse } from '../lib/http.js';
import { activeCaseOf, clientItem, exerciseOf, fitsCase, gradeExercise, progressStats } from '../lib/waitingRoom/index.js';

/**
 * Client waiting room — mounted at /api/waiting-room (clients).
 *   GET  /               published items that fit the active case (visa type + status), own progress, points / streak
 *   POST /:id/complete   lesson / video / checklist done (idempotent)
 *   POST /:id/answer     { answers: number[] } → graded on the server; best score kept, item done
 */
export const waitingRoomRouter = Router();
waitingRoomRouter.use(requireAuth, requireRole('CLIENT'));

const loadVisible = async (userId: string) => {
  const c = await activeCaseOf(userId);
  const rows = await prisma.waitingRoomItem.findMany({ where: { published: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  return { c, items: rows.filter((r) => fitsCase(r, c)) };
};

const visibleItem = async (userId: string, id: string) => {
  const { items } = await loadVisible(userId);
  const item = items.find((i) => i.id === id);
  if (!item) throw notFound('ITEM_NOT_FOUND');
  return item;
};

const statsFor = async (userId: string, itemIds: string[]) => {
  const rows = await prisma.waitingRoomProgress.findMany({ where: { userId, itemId: { in: itemIds } } });
  return { rows, stats: progressStats(rows, itemIds.length) };
};

waitingRoomRouter.get('/', async (req, res) => {
  const userId = req.user!.id;
  const { c, items } = await loadVisible(userId);
  const { rows, stats } = await statsFor(userId, items.map((i) => i.id));
  const progress = Object.fromEntries(rows.map((r) => [r.itemId, { completedAt: r.completedAt, score: r.score }]));
  // "Next while you wait": the first item not done yet (in the admin's order).
  const next = items.find((i) => !progress[i.id]?.completedAt) ?? null;
  res.json({
    case: c ? { id: c.id, visaType: c.visaType, status: c.status } : null,
    items: items.map((i) => ({ ...clientItem(i), progress: progress[i.id] ?? null })),
    nextId: next?.id ?? null,
    stats,
  });
});

waitingRoomRouter.post('/:id/complete', async (req, res) => {
  const userId = req.user!.id;
  const item = await visibleItem(userId, String(req.params.id));
  const existing = await prisma.waitingRoomProgress.findUnique({ where: { userId_itemId: { userId, itemId: item.id } } });
  const row = existing?.completedAt
    ? existing
    : await prisma.waitingRoomProgress.upsert({
        where: { userId_itemId: { userId, itemId: item.id } },
        create: { userId, itemId: item.id, completedAt: new Date() },
        update: { completedAt: new Date() },
      });
  const { items } = await loadVisible(userId);
  res.json({ progress: { completedAt: row.completedAt, score: row.score }, stats: (await statsFor(userId, items.map((i) => i.id))).stats });
});

waitingRoomRouter.post('/:id/answer', async (req, res) => {
  const userId = req.user!.id;
  const item = await visibleItem(userId, String(req.params.id));
  const questions = exerciseOf(item);
  if (item.kind !== 'EXERCISE' || !questions.length) throw notFound('EXERCISE_NOT_FOUND');
  const { answers } = parse(z.object({ answers: z.array(z.number().int().min(0).max(20).nullable()).max(questions.length) }), req.body ?? {});
  const graded = gradeExercise(questions, answers);
  const existing = await prisma.waitingRoomProgress.findUnique({ where: { userId_itemId: { userId, itemId: item.id } } });
  const best = Math.max(existing?.score ?? 0, graded.score);
  const row = await prisma.waitingRoomProgress.upsert({
    where: { userId_itemId: { userId, itemId: item.id } },
    create: { userId, itemId: item.id, completedAt: new Date(), score: graded.score },
    update: { completedAt: existing?.completedAt ?? new Date(), score: best },
  });
  const { items } = await loadVisible(userId);
  res.json({ ...graded, best, progress: { completedAt: row.completedAt, score: row.score }, stats: (await statsFor(userId, items.map((i) => i.id))).stats });
});
