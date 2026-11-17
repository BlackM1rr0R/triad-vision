import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../../db.js';
import { notFound } from '../http.js';
import { MANUAL_REF, TRAINING_TASKS, TRAINING_TASK_IDS, evaluateTraining, matchTrainingPath, type TrainingTaskId } from './tasks.js';

/**
 * New staff training checklist (/api/admin/training-checklist): tracker middleware (records the request-detected
 * tasks), the user's own checklist, manual ticks and the team overview (ADMIN+).
 */

const STAFF = new Set(['STAFF', 'ADMIN', 'SUPER_ADMIN']);

/** Recorded keys of this process: skip the database once a task is known (bounded). */
const known = new Set<string>();
const KNOWN_MAX = 20_000;

export const recordTrainingEvent = async (userId: string, taskId: TrainingTaskId, ref = '') => {
  const key = `${userId}|${taskId}|${ref}`;
  if (known.has(key)) return;
  await prisma.staffTrainingEvent.createMany({ data: [{ userId, taskId, ref }], skipDuplicates: true });
  if (known.size >= KNOWN_MAX) known.clear();
  known.add(key);
};

/** Test helper: forget the process cache. */
export const resetTrainingCache = () => known.clear();

/**
 * Express middleware for the admin router (after the STAFF+ check): a successful GET whose path completes a
 * training task records it after the response is sent. Never blocks or fails the request.
 */
export const trainingTracker = (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET' || !req.user || !STAFF.has(req.user.role) || req.impersonator) return next();
  const hit = matchTrainingPath(req.path);
  if (!hit) return next();
  const userId = req.user.id;
  res.on('finish', () => {
    if (res.statusCode !== 200) return;
    recordTrainingEvent(userId, hit.taskId, hit.ref).catch((err) => console.error('[training-checklist] event not recorded', err));
  });
  next();
};

/** Database-detected tasks of the given users. */
const dbSignals = async (userIds: string[]) => {
  const [links, sent, notes, tasks] = await Promise.all([
    prisma.caseUploadLink.groupBy({ by: ['createdById'], where: { createdById: { in: userIds } }, _count: { _all: true } }),
    prisma.caseUploadLink.groupBy({ by: ['createdById'], where: { createdById: { in: userIds }, sentTo: { not: null } }, _count: { _all: true } }),
    prisma.caseEvent.groupBy({ by: ['actorId'], where: { actorId: { in: userIds }, type: 'INTERNAL_NOTE' }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ['createdById'], where: { createdById: { in: userIds } }, _count: { _all: true } }),
  ]);
  const has = (rows: { _count: { _all: number } }[], key: (r: never) => string | null) => new Set(rows.filter((r) => r._count._all > 0).map((r) => key(r as never)));
  const l = has(links, (r: { createdById: string }) => r.createdById);
  const s = has(sent, (r: { createdById: string }) => r.createdById);
  const n = has(notes, (r: { actorId: string | null }) => r.actorId);
  const t = has(tasks, (r: { createdById: string | null }) => r.createdById);
  return (userId: string): Partial<Record<TrainingTaskId, boolean>> => ({
    requestDocs: l.has(userId),
    sendUploadLink: s.has(userId),
    addNote: n.has(userId),
    createTask: t.has(userId),
  });
};

export const myChecklist = async (userId: string) => {
  const [events, db] = await Promise.all([prisma.staffTrainingEvent.findMany({ where: { userId }, select: { taskId: true, ref: true } }), dbSignals([userId])]);
  const result = evaluateTraining({ events, db: db(userId) });
  return { ...result, tasks: result.tasks.map((s) => ({ ...s, ...TRAINING_TASKS.find((t) => t.id === s.id)! })) };
};

/** Manual tick (done = true) or untick (removes the manual mark; automatic detection stays). */
export const tickTask = async (userId: string, taskId: string, done: boolean) => {
  if (!(TRAINING_TASK_IDS as readonly string[]).includes(taskId)) throw notFound('TASK_NOT_FOUND');
  if (done) await prisma.staffTrainingEvent.createMany({ data: [{ userId, taskId, ref: MANUAL_REF }], skipDuplicates: true });
  else await prisma.staffTrainingEvent.deleteMany({ where: { userId, taskId, ref: MANUAL_REF } });
  return myChecklist(userId);
};

/** ADMIN+: progress of every active staff member. */
export const teamProgress = async () => {
  const users = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }],
    take: 500,
  });
  const ids = users.map((u) => u.id);
  const [events, db] = await Promise.all([
    prisma.staffTrainingEvent.findMany({ where: { userId: { in: ids } }, select: { userId: true, taskId: true, ref: true } }),
    dbSignals(ids),
  ]);
  const byUser = new Map<string, { taskId: string; ref: string }[]>();
  for (const e of events) byUser.set(e.userId, [...(byUser.get(e.userId) ?? []), e]);
  return {
    members: users.map((u) => {
      const r = evaluateTraining({ events: byUser.get(u.id) ?? [], db: db(u.id) });
      return {
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email,
        role: u.role,
        createdAt: u.createdAt.toISOString(),
        done: r.done,
        total: r.total,
        percent: r.percent,
        complete: r.complete,
        open: r.tasks.filter((t) => !t.done).map((t) => t.id),
      };
    }),
  };
};
