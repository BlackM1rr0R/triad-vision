import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma, TaskStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { requireMinRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound, forbidden, parse } from '../lib/http.js';
import {
  OPEN_STATUSES,
  STAFF_ROLES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  activeStaff,
  activityRow,
  cardInclude,
  caseVisibilityWhere,
  createNumbered,
  detailInclude,
  fullName,
  loadTaskForActor,
  mentionedIds,
  requirePerm,
  taskKey,
  toCard,
  toDetail,
  type Activity,
  type Actor,
} from '../lib/tasks/core.js';
import { notifyAssigned, notifyComment, notifyStatus } from '../lib/tasks/notify.js';
import { viewableNodeIds } from '../lib/tasks/drive.js';
import { ensureTaskFolder } from '../lib/tasks/files.js';
import fs from 'node:fs/promises';
import { decodeOriginalName, verifyUploadedFile } from '../middleware/upload.js';
import { driveUpload } from '../lib/drive/upload.js';
import { adoptUpload, removeStored } from '../lib/drive/storage.js';
import { freeNameIn, safeUploadName } from '../lib/drive/names.js';
import { completeFindingTaskIfDone } from '../lib/ai/features/caseAi/findingTasks.js';

/** Team tasks (/api/tasks): create, assign, deadlines, board, comments, checklist. */
export const tasksRouter = Router();
tasksRouter.use(requireMinRole('STAFF'));

const DAY = 24 * 60 * 60 * 1000;
/** Gap between neighbouring cards in a board column (room for many moves before renumbering). */
const GAP = 1024;

const actorOf = (req: Request): Actor => ({ id: req.user!.id, role: req.user!.role });
const personOf = (req: Request) => ({ id: req.user!.id, firstName: req.user!.firstName, lastName: req.user!.lastName });

const id = z.string().trim().min(1).max(40);
const dateIn = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s))
  .nullable();
const title = z.string().trim().min(1).max(200);
const description = z
  .string()
  .max(20_000)
  .nullable()
  .transform((s) => (s && s.trim() ? s.replace(/\r\n/g, '\n').trimEnd() : null));
const checklistText = z.string().trim().min(1).max(300);
const commentBody = z
  .string()
  .max(5000)
  .transform((s) => s.replace(/\r\n/g, '\n').trim())
  .refine((s) => s.length > 0, 'EMPTY');

/** "a,b" or repeated params → validated list. */
const csv = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? undefined : (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean)))
    .pipe(z.array(z.enum(values)).max(10).optional());

// ─── Helpers ───────────────────────────────────────────────────────────

const loadDetail = async (taskId: string, actor: Actor) => {
  const t = await prisma.task.findUnique({ where: { id: taskId }, include: detailInclude });
  if (!t) throw notFound('TASK_NOT_FOUND');
  const viewable = await viewableNodeIds(actor, t.attachments.map((a) => a.nodeId));
  return toDetail(t, actor, (nodeId) => viewable.has(nodeId));
};

const validateAssignees = async (ids: string[]) => {
  const unique = [...new Set(ids)];
  const found = await activeStaff(unique);
  if (found.length !== unique.length) throw badRequest('INVALID_ASSIGNEE');
  return found;
};

const validateCase = async (caseId: string | null | undefined, actor: Actor) => {
  if (!caseId) return null;
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, number: true } });
  if (!c) throw badRequest('INVALID_CASE');
  // Same rule as case visibility for tasks (every staff role may see every case today).
  void actor;
  return c;
};

const checkDates = (startAt: Date | null | undefined, dueAt: Date | null | undefined) => {
  if (startAt && dueAt && startAt.getTime() > dueAt.getTime()) throw badRequest('START_AFTER_DUE');
};

/** sortOrder for a card placed at the top of a column. */
const topOfColumn = async (tx: Prisma.TransactionClient, status: TaskStatus, excludeId?: string) => {
  const min = await tx.task.aggregate({ where: { status, ...(excludeId ? { id: { not: excludeId } } : {}) }, _min: { sortOrder: true } });
  return min._min.sortOrder === null ? 0 : min._min.sortOrder - GAP;
};

const completedFor = (from: TaskStatus | null, to: TaskStatus, current: Date | null) =>
  to === 'DONE' ? (from === 'DONE' && current ? current : new Date()) : null;

const nameMap = async (ids: string[]) => {
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
  return new Map(users.map((u) => [u.id, fullName(u)]));
};

/** Replaces the assignee set; writes activity + audit; returns added user ids. */
const setAssignees = async (req: Request, taskId: string, number: number, before: string[], next: string[]) => {
  const added = next.filter((x) => !before.includes(x));
  const removed = before.filter((x) => !next.includes(x));
  if (!added.length && !removed.length) return [];
  const names = await nameMap([...added, ...removed]);
  await prisma.$transaction([
    prisma.taskAssignee.deleteMany({ where: { taskId, userId: { in: removed } } }),
    prisma.taskAssignee.createMany({ data: added.map((userId) => ({ taskId, userId })), skipDuplicates: true }),
    prisma.taskComment.create({
      data: activityRow(taskId, req.user!.id, {
        type: 'assignees',
        added: added.map((x) => ({ id: x, name: names.get(x) ?? '' })),
        removed: removed.map((x) => ({ id: x, name: names.get(x) ?? '' })),
      }),
    }),
    prisma.task.update({ where: { id: taskId }, data: { updatedAt: new Date() } }),
  ]);
  await audit(req, 'TASK_REASSIGNED', taskId, { number: taskKey(number), added, removed });
  return added;
};

// ─── Lookups for pickers ───────────────────────────────────────────────

/** GET /api/tasks/summary → { open, overdue } for my assigned, unfinished tasks. */
tasksRouter.get('/summary', async (req, res) => {
  const where: Prisma.TaskWhereInput = {
    AND: [{ status: { in: OPEN_STATUSES }, assignees: { some: { userId: req.user!.id } } }, caseVisibilityWhere(actorOf(req))],
  };
  const [open, overdue] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.count({ where: { AND: [where, { dueAt: { lt: new Date() } }] } }),
  ]);
  res.json({ open, overdue });
});

/** GET /api/tasks/people → active team members (assignee picker, @mentions). */
tasksRouter.get('/people', async (_req, res) => {
  const people = await prisma.user.findMany({
    where: { isActive: true, role: { in: STAFF_ROLES } },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, role: true, email: true },
    take: 500,
  });
  res.json({ people });
});

/** GET /api/tasks/case-options?search= → cases to link a task to (number or client name). */
tasksRouter.get('/case-options', async (req, res) => {
  const q = parse(z.object({ search: z.string().trim().max(120).optional() }), req.query);
  const words = (q.search ?? '').split(/\s+/).filter(Boolean).slice(0, 4);
  const items = await prisma.case.findMany({
    where: words.length
      ? {
          AND: words.map((w) => ({
            OR: [{ number: { contains: w } }, { client: { firstName: { contains: w } } }, { client: { lastName: { contains: w } } }],
          })),
        }
      : {},
    orderBy: { updatedAt: 'desc' },
    take: 15,
    select: { id: true, number: true, status: true, client: { select: { firstName: true, lastName: true } } },
  });
  res.json({ items: items.map((c) => ({ id: c.id, number: c.number, status: c.status, clientName: fullName(c.client) })) });
});

// ─── List ──────────────────────────────────────────────────────────────

const SORTS = ['board', 'number', 'title', 'priority', 'dueAt', 'status', 'updatedAt', 'createdAt'] as const;

const listQuery = z.object({
  status: csv(TASK_STATUSES),
  priority: csv(TASK_PRIORITIES),
  assignee: z.union([z.literal('me'), z.literal('unassigned'), id]).optional(),
  creator: z.union([z.literal('me'), id]).optional(),
  caseId: id.optional(),
  due: z.enum(['overdue', 'today', 'week', 'none']).optional(),
  /** the browser's getTimezoneOffset() — day boundaries for due=today/week (default Baku, UTC+4) */
  tzOffset: z.coerce.number().int().min(-840).max(840).default(-240),
  dueFrom: z.string().datetime({ offset: true }).optional(),
  dueTo: z.string().datetime({ offset: true }).optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(SORTS).default('board'),
  dir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

/** Local midnight (for a browser timezone offset) as a UTC Date. */
const localDayStart = (now: Date, tzOffset: number) => {
  const local = now.getTime() - tzOffset * 60_000;
  return new Date(Math.floor(local / DAY) * DAY + tzOffset * 60_000);
};

export const buildListWhere = (q: z.infer<typeof listQuery>, actor: Actor, now = new Date()): Prisma.TaskWhereInput => {
  const and: Prisma.TaskWhereInput[] = [caseVisibilityWhere(actor)];
  // Cancelled tasks only appear when asked for.
  and.push({ status: { in: q.status?.length ? q.status : TASK_STATUSES.filter((s) => s !== 'CANCELLED') } });
  if (q.priority?.length) and.push({ priority: { in: q.priority } });
  if (q.assignee === 'me') and.push({ assignees: { some: { userId: actor.id } } });
  else if (q.assignee === 'unassigned') and.push({ assignees: { none: {} } });
  else if (q.assignee) and.push({ assignees: { some: { userId: q.assignee } } });
  if (q.creator) and.push({ createdById: q.creator === 'me' ? actor.id : q.creator });
  if (q.caseId) and.push({ caseId: q.caseId });
  if (q.due) {
    const start = localDayStart(now, q.tzOffset);
    if (q.due === 'overdue') and.push({ dueAt: { lt: now }, status: { in: OPEN_STATUSES } });
    else if (q.due === 'today') and.push({ dueAt: { gte: start, lt: new Date(start.getTime() + DAY) } });
    else if (q.due === 'week') {
      const localDow = new Date(start.getTime() - q.tzOffset * 60_000).getUTCDay(); // 0 = Sunday
      const weekStart = new Date(start.getTime() - ((localDow + 6) % 7) * DAY);
      and.push({ dueAt: { gte: weekStart, lt: new Date(weekStart.getTime() + 7 * DAY) } });
    } else and.push({ dueAt: null });
  }
  if (q.dueFrom || q.dueTo) and.push({ dueAt: { ...(q.dueFrom ? { gte: new Date(q.dueFrom) } : {}), ...(q.dueTo ? { lt: new Date(q.dueTo) } : {}) } });
  if (q.search) {
    const ref = /^(?:T-?)?(\d{1,9})$/i.exec(q.search);
    and.push({
      OR: [
        ...(ref ? [{ number: Number(ref[1]) }] : []),
        { title: { contains: q.search } },
        { description: { contains: q.search } },
      ],
    });
  }
  return { AND: and };
};

const orderFor = (sort: (typeof SORTS)[number], dir: 'asc' | 'desc' | undefined): Prisma.TaskOrderByWithRelationInput[] => {
  const d = dir ?? (['updatedAt', 'createdAt', 'number', 'priority'].includes(sort) ? 'desc' : 'asc');
  switch (sort) {
    case 'board':
      return [{ sortOrder: 'asc' }, { createdAt: 'desc' }];
    case 'dueAt':
      return [{ dueAt: { sort: d, nulls: 'last' } }, { number: 'desc' }];
    case 'number':
      return [{ number: d }];
    default:
      return [{ [sort]: d }, { number: 'desc' }];
  }
};

/**
 * GET /api/tasks → { items: TaskCard[], total, page, pageSize }.
 * Filters: status (csv; default all but CANCELLED), priority (csv), assignee (me | unassigned | userId),
 * creator (me | userId), caseId, due (overdue | today | week | none, with tzOffset), dueFrom/dueTo (ISO),
 * search (title, description, number "T-12"). Sort: board | number | title | priority | dueAt | status |
 * updatedAt | createdAt, dir asc|desc. pageSize up to 500 (the board and calendar load a whole range).
 */
tasksRouter.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const where = buildListWhere(q, actorOf(req));
  const [items, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: orderFor(q.sort, q.dir),
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: cardInclude,
    }),
    prisma.task.count({ where }),
  ]);
  res.json({ items: items.map(toCard), total, page: q.page, pageSize: q.pageSize });
});

// ─── Create ────────────────────────────────────────────────────────────

const createBody = z.object({
  title,
  description: description.optional(),
  status: z.enum(TASK_STATUSES).default('TODO'),
  priority: z.enum(TASK_PRIORITIES).default('NORMAL'),
  startAt: dateIn.optional(),
  dueAt: dateIn.optional(),
  assigneeIds: z.array(id).max(20).default([]),
  caseId: id.nullable().optional(),
  checklist: z.array(checklistText).max(100).default([]),
});

tasksRouter.post('/', async (req, res) => {
  const body = parse(createBody, req.body);
  const actor = actorOf(req);
  checkDates(body.startAt, body.dueAt);
  const assignees = await validateAssignees(body.assigneeIds);
  await validateCase(body.caseId, actor);

  const task = await createNumbered(async (tx, number) => {
    const t = await tx.task.create({
      data: {
        number,
        title: body.title,
        description: body.description ?? null,
        status: body.status,
        priority: body.priority,
        startAt: body.startAt ?? null,
        dueAt: body.dueAt ?? null,
        completedAt: body.status === 'DONE' ? new Date() : null,
        sortOrder: await topOfColumn(tx, body.status),
        caseId: body.caseId ?? null,
        createdById: actor.id,
        assignees: { create: assignees.map((a) => ({ userId: a.id })) },
        checklist: { create: body.checklist.map((text, i) => ({ text, sortOrder: i })) },
      },
    });
    await tx.taskComment.create({ data: activityRow(t.id, actor.id, { type: 'created' }) });
    return t;
  });

  await notifyAssigned(task, assignees.map((a) => a.id), personOf(req));
  res.status(201).json({ task: await loadDetail(task.id, actor) });
});

// ─── One task ──────────────────────────────────────────────────────────

/** GET /api/tasks/:ref (id, "T-0012" or 12) → { task: TaskDetail }. */
tasksRouter.get('/:ref', async (req, res) => {
  const { task } = await loadTaskForActor(String(req.params.ref), actorOf(req));
  res.json({ task: await loadDetail(task.id, actorOf(req)) });
});

const patchBody = z
  .object({
    title,
    description,
    status: z.enum(TASK_STATUSES),
    priority: z.enum(TASK_PRIORITIES),
    startAt: dateIn,
    dueAt: dateIn,
    caseId: id.nullable(),
    assigneeIds: z.array(id).max(20),
  })
  .partial()
  .strict();

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** PATCH /api/tasks/:ref — partial update; every field needs its own permission (see TaskPermissions). */
tasksRouter.patch('/:ref', async (req, res) => {
  const body = parse(patchBody, req.body);
  const actor = actorOf(req);
  const { task, perms } = await loadTaskForActor(String(req.params.ref), actor);

  const fieldKeys = (['title', 'description', 'priority', 'startAt', 'dueAt', 'caseId'] as const).filter((k) => body[k] !== undefined);
  if (fieldKeys.length) requirePerm(perms, 'edit');
  if (body.status !== undefined) requirePerm(perms, 'status');
  const before = task.assignees.map((a) => a.userId);
  let nextAssignees: string[] | undefined;
  if (body.assigneeIds !== undefined) {
    nextAssignees = [...new Set(body.assigneeIds)];
    const selfTake = perms.take && nextAssignees.length === 1 && nextAssignees[0] === actor.id;
    if (!perms.assign && !selfTake) throw forbidden('TASK_FORBIDDEN');
    await validateAssignees(nextAssignees.filter((x) => !before.includes(x)));
  }
  const startAt = body.startAt !== undefined ? body.startAt : task.startAt;
  const dueAt = body.dueAt !== undefined ? body.dueAt : task.dueAt;
  if (body.startAt !== undefined || body.dueAt !== undefined) checkDates(startAt, dueAt);
  if (body.caseId) await validateCase(body.caseId, actor);

  const activity: Activity[] = [];
  const data: Prisma.TaskUncheckedUpdateInput = {};
  if (body.title !== undefined && body.title !== task.title) {
    data.title = body.title;
    activity.push({ type: 'title', from: task.title, to: body.title });
  }
  if (body.description !== undefined) data.description = body.description;
  if (body.priority !== undefined && body.priority !== task.priority) {
    data.priority = body.priority;
    activity.push({ type: 'priority', from: task.priority, to: body.priority });
  }
  if (body.startAt !== undefined) data.startAt = body.startAt;
  if (body.dueAt !== undefined && iso(body.dueAt) !== iso(task.dueAt)) {
    data.dueAt = body.dueAt;
    activity.push({ type: 'due', from: iso(task.dueAt), to: iso(body.dueAt) });
  }
  if (body.caseId !== undefined && body.caseId !== task.caseId) {
    data.caseId = body.caseId;
    const cases = await prisma.case.findMany({ where: { id: { in: [task.caseId, body.caseId].filter((x): x is string => !!x) } }, select: { id: true, number: true } });
    const num = (cid: string | null) => cases.find((c) => c.id === cid)?.number ?? null;
    activity.push({ type: 'case', from: num(task.caseId), to: num(body.caseId) });
  }
  const statusChanged = body.status !== undefined && body.status !== task.status;
  if (statusChanged) {
    data.status = body.status;
    data.completedAt = completedFor(task.status, body.status!, task.completedAt);
    data.sortOrder = await topOfColumn(prisma, body.status!, task.id);
    activity.push({ type: 'status', from: task.status, to: body.status! });
  }

  if (Object.keys(data).length || activity.length) {
    await prisma.$transaction([
      prisma.task.update({ where: { id: task.id }, data }),
      ...activity.map((a) => prisma.taskComment.create({ data: activityRow(task.id, actor.id, a) })),
    ]);
  }
  const added = nextAssignees ? await setAssignees(req, task.id, task.number, before, nextAssignees) : [];
  const finalAssignees = nextAssignees ?? before;

  const ref = { ...task, title: (data.title as string | undefined) ?? task.title, dueAt };
  if (added.length) await notifyAssigned(ref, added, personOf(req));
  if (statusChanged) await notifyStatus(ref, finalAssignees.filter((x) => !added.includes(x)), body.status!, personOf(req));
  res.json({ task: await loadDetail(task.id, actor) });
});

/**
 * POST /api/tasks/:ref/move { status, beforeId } — drag & drop on the board: put the card into
 * `status` right before `beforeId` (null/absent = end of the column).
 */
tasksRouter.post('/:ref/move', async (req, res) => {
  const body = parse(z.object({ status: z.enum(TASK_STATUSES), beforeId: id.nullable().optional() }), req.body);
  const actor = actorOf(req);
  const { task, perms } = await loadTaskForActor(String(req.params.ref), actor);
  requirePerm(perms, 'status');

  const column = await prisma.task.findMany({
    where: { status: body.status, id: { not: task.id } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    select: { id: true, sortOrder: true },
  });
  let idx = body.beforeId ? column.findIndex((c) => c.id === body.beforeId) : column.length;
  if (idx < 0) idx = column.length;
  const prev = column[idx - 1];
  const next = column[idx];
  let sortOrder: number | null;
  if (!prev && !next) sortOrder = 0;
  else if (!prev) sortOrder = next.sortOrder - GAP;
  else if (!next) sortOrder = prev.sortOrder + GAP;
  else sortOrder = next.sortOrder - prev.sortOrder > 1 ? Math.floor((prev.sortOrder + next.sortOrder) / 2) : null;

  const statusChanged = body.status !== task.status;
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (sortOrder === null) {
    // No room between the neighbours: renumber the whole column with even gaps.
    const ordered = [...column.slice(0, idx).map((c) => c.id), task.id, ...column.slice(idx).map((c) => c.id)];
    ordered.forEach((tid, i) => {
      if (tid !== task.id) ops.push(prisma.task.update({ where: { id: tid }, data: { sortOrder: i * GAP }, select: { id: true } }));
    });
    sortOrder = ordered.indexOf(task.id) * GAP;
  }
  ops.push(
    prisma.task.update({
      where: { id: task.id },
      data: { sortOrder, status: body.status, completedAt: completedFor(task.status, body.status, task.completedAt) },
    }),
  );
  if (statusChanged) ops.push(prisma.taskComment.create({ data: activityRow(task.id, actor.id, { type: 'status', from: task.status, to: body.status }) }));
  await prisma.$transaction(ops);

  if (statusChanged) await notifyStatus(task, task.assignees.map((a) => a.userId), body.status, personOf(req));
  const card = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: cardInclude });
  res.json({ task: toCard(card) });
});

/** DELETE /api/tasks/:ref — creator or ADMIN+ (audited). */
tasksRouter.delete('/:ref', async (req, res) => {
  const { task, perms } = await loadTaskForActor(String(req.params.ref), actorOf(req));
  requirePerm(perms, 'delete');
  await prisma.task.delete({ where: { id: task.id } });
  await audit(req, 'TASK_DELETED', task.id, { number: taskKey(task.number), title: task.title });
  res.json({ ok: true });
});

// ─── Assignees ─────────────────────────────────────────────────────────

/** POST /api/tasks/:ref/assignees { userId } — managers, or anyone taking an unassigned task for themselves. */
tasksRouter.post('/:ref/assignees', async (req, res) => {
  const { userId } = parse(z.object({ userId: id }), req.body);
  const actor = actorOf(req);
  const { task, perms } = await loadTaskForActor(String(req.params.ref), actor);
  if (!perms.assign && !(perms.take && userId === actor.id)) throw forbidden('TASK_FORBIDDEN');
  await validateAssignees([userId]);
  const before = task.assignees.map((a) => a.userId);
  const added = await setAssignees(req, task.id, task.number, before, [...before, userId]);
  if (added.length) await notifyAssigned(task, added, personOf(req));
  res.json({ task: await loadDetail(task.id, actor) });
});

tasksRouter.delete('/:ref/assignees/:userId', async (req, res) => {
  const actor = actorOf(req);
  const { task, perms } = await loadTaskForActor(String(req.params.ref), actor);
  requirePerm(perms, 'assign');
  const before = task.assignees.map((a) => a.userId);
  await setAssignees(req, task.id, task.number, before, before.filter((x) => x !== req.params.userId));
  res.json({ task: await loadDetail(task.id, actor) });
});

// ─── Checklist ─────────────────────────────────────────────────────────

const checklistOf = async (taskId: string) => {
  await prisma.task.update({ where: { id: taskId }, data: { updatedAt: new Date() }, select: { id: true } });
  const items = await prisma.taskChecklistItem.findMany({ where: { taskId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  return items.map((c) => ({ id: c.id, text: c.text, done: c.done, sortOrder: c.sortOrder }));
};

const checklistTask = async (req: Request) => {
  const { task, perms } = await loadTaskForActor(String(req.params.ref), actorOf(req));
  requirePerm(perms, 'checklist');
  return task;
};

const findItem = async (taskId: string, itemId: string) => {
  const item = await prisma.taskChecklistItem.findFirst({ where: { id: itemId, taskId } });
  if (!item) throw notFound('CHECKLIST_ITEM_NOT_FOUND');
  return item;
};

/** POST /api/tasks/:ref/checklist { text } → { checklist }. */
tasksRouter.post('/:ref/checklist', async (req, res) => {
  const { text } = parse(z.object({ text: checklistText }), req.body);
  const task = await checklistTask(req);
  const count = await prisma.taskChecklistItem.count({ where: { taskId: task.id } });
  if (count >= 200) throw badRequest('CHECKLIST_FULL');
  const max = await prisma.taskChecklistItem.aggregate({ where: { taskId: task.id }, _max: { sortOrder: true } });
  await prisma.taskChecklistItem.create({ data: { taskId: task.id, text, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
  res.status(201).json({ checklist: await checklistOf(task.id) });
});

/** PUT /api/tasks/:ref/checklist/order { ids } — new order of the items. */
tasksRouter.put('/:ref/checklist/order', async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(id).max(200) }), req.body);
  const task = await checklistTask(req);
  const items = await prisma.taskChecklistItem.findMany({ where: { taskId: task.id }, select: { id: true } });
  const known = new Set(items.map((i) => i.id));
  if (ids.length !== known.size || !ids.every((x) => known.has(x))) throw badRequest('CHECKLIST_ORDER_MISMATCH');
  await prisma.$transaction(ids.map((itemId, i) => prisma.taskChecklistItem.update({ where: { id: itemId }, data: { sortOrder: i } })));
  res.json({ checklist: await checklistOf(task.id) });
});

/** PATCH /api/tasks/:ref/checklist/:itemId { text?, done? }. */
tasksRouter.patch('/:ref/checklist/:itemId', async (req, res) => {
  const body = parse(z.object({ text: checklistText, done: z.boolean() }).partial().strict(), req.body);
  const task = await checklistTask(req);
  await findItem(task.id, String(req.params.itemId));
  await prisma.taskChecklistItem.update({ where: { id: String(req.params.itemId) }, data: body });
  // An AI document-problems task (one per client) completes itself once every item is ticked.
  const completed = body.done ? await completeFindingTaskIfDone(task.id, actorOf(req).id) : false;
  res.json({ checklist: await checklistOf(task.id), ...(completed ? { completed: true } : {}) });
});

tasksRouter.delete('/:ref/checklist/:itemId', async (req, res) => {
  const task = await checklistTask(req);
  await findItem(task.id, String(req.params.itemId));
  await prisma.taskChecklistItem.delete({ where: { id: String(req.params.itemId) } });
  res.json({ checklist: await checklistOf(task.id) });
});

// ─── Comments ──────────────────────────────────────────────────────────

/** Mentions that point at active team members (others stay plain text and notify nobody). */
const validMentions = async (body: string) => (await activeStaff(mentionedIds(body))).map((u) => u.id);

/** POST /api/tasks/:ref/comments { body } — any team member; "@[Name](user:<id>)" mentions notify. */
tasksRouter.post('/:ref/comments', async (req, res) => {
  const { body } = parse(z.object({ body: commentBody }), req.body);
  const actor = actorOf(req);
  const { task, perms } = await loadTaskForActor(String(req.params.ref), actor);
  requirePerm(perms, 'comment');
  const [comment] = await prisma.$transaction([
    prisma.taskComment.create({ data: { taskId: task.id, authorId: actor.id, body } }),
    prisma.task.update({ where: { id: task.id }, data: { updatedAt: new Date() }, select: { id: true } }),
  ]);
  await notifyComment(task, task.assignees.map((a) => a.userId), body, await validMentions(body), personOf(req));
  res.status(201).json({ task: await loadDetail(task.id, actor), commentId: comment.id });
});

const ownComment = async (req: Request, mode: 'edit' | 'delete') => {
  const actor = actorOf(req);
  const { task } = await loadTaskForActor(String(req.params.ref), actor);
  const comment = await prisma.taskComment.findFirst({ where: { id: String(req.params.commentId), taskId: task.id, system: false } });
  if (!comment) throw notFound('COMMENT_NOT_FOUND');
  const own = comment.authorId === actor.id;
  if (mode === 'edit' ? !own : !own && actor.role === 'STAFF') throw forbidden('TASK_FORBIDDEN');
  return { task, comment };
};

/** PATCH /api/tasks/:ref/comments/:commentId { body } — own comments only; new mentions notify. */
tasksRouter.patch('/:ref/comments/:commentId', async (req, res) => {
  const { body } = parse(z.object({ body: commentBody }), req.body);
  const { task, comment } = await ownComment(req, 'edit');
  await prisma.taskComment.update({ where: { id: comment.id }, data: { body } });
  const before = new Set(mentionedIds(comment.body));
  const fresh = (await validMentions(body)).filter((x) => !before.has(x));
  if (fresh.length) await notifyComment(task, [], body, fresh, personOf(req));
  res.json({ task: await loadDetail(task.id, actorOf(req)) });
});

/** DELETE /api/tasks/:ref/comments/:commentId — own comments; ADMIN+ any. */
tasksRouter.delete('/:ref/comments/:commentId', async (req, res) => {
  const { task, comment } = await ownComment(req, 'delete');
  await prisma.taskComment.delete({ where: { id: comment.id } });
  res.json({ task: await loadDetail(task.id, actorOf(req)) });
});

// ─── Attachments (drive files / folders) ───────────────────────────────

/** POST /api/tasks/:ref/attachments { nodeId } — the user must be able to view the drive node. */
tasksRouter.post('/:ref/attachments', async (req, res) => {
  const { nodeId } = parse(z.object({ nodeId: id }), req.body);
  const actor = actorOf(req);
  const { task, perms } = await loadTaskForActor(String(req.params.ref), actor);
  requirePerm(perms, 'attach');
  const node = await prisma.driveNode.findFirst({ where: { id: nodeId, deletedAt: null }, select: { id: true, system: true } });
  if (!node || node.system || !(await viewableNodeIds(actor, [nodeId])).has(nodeId)) throw badRequest('INVALID_NODE');
  const count = await prisma.taskAttachment.count({ where: { taskId: task.id } });
  if (count >= 50) throw badRequest('ATTACHMENTS_FULL');
  await prisma.taskAttachment.upsert({
    where: { taskId_nodeId: { taskId: task.id, nodeId } },
    create: { taskId: task.id, nodeId },
    update: {},
  });
  await prisma.task.update({ where: { id: task.id }, data: { updatedAt: new Date() }, select: { id: true } });
  res.status(201).json({ task: await loadDetail(task.id, actor) });
});

/**
 * POST /api/tasks/:ref/files (multipart, field "file") — uploads a file from the computer straight
 * into the task. It is stored in the company drive under "Tapşırıq faylları/T-0001 · title" (every
 * staff member can download it there) and linked to the task.
 */
tasksRouter.post(
  '/:ref/files',
  async (req, res, next) => {
    // Permission is checked before a single byte is spooled to disk.
    const { task, perms } = await loadTaskForActor(String(req.params.ref), actorOf(req));
    requirePerm(perms, 'attach');
    if ((await prisma.taskAttachment.count({ where: { taskId: task.id } })) >= 50) throw badRequest('ATTACHMENTS_FULL');
    res.locals.task = task;
    next();
  },
  driveUpload.single('file'),
  async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('FILE_REQUIRED');
    const task = res.locals.task as { id: string; number: number; title: string };
    const actor = actorOf(req);
    let storedKey: string | null = null;
    try {
      await verifyUploadedFile(file);
      const folderId = await ensureTaskFolder(task, actor.id);
      const name = await freeNameIn(folderId, safeUploadName(decodeOriginalName(file.originalname)), true);
      storedKey = await adoptUpload(file.path);
      const node = await prisma.driveNode.create({
        data: { space: 'SHARED', kind: 'FILE', name, parentId: folderId, storageKey: storedKey, mimeType: file.mimetype, size: file.size, createdById: actor.id },
        select: { id: true },
      });
      storedKey = null;
      await prisma.taskAttachment.create({ data: { taskId: task.id, nodeId: node.id } });
      await prisma.task.update({ where: { id: task.id }, data: { updatedAt: new Date() }, select: { id: true } });
      await audit(req, 'TASK_FILE_UPLOADED', `task:${task.id}`, { nodeId: node.id, name, size: file.size });
      res.status(201).json({ task: await loadDetail(task.id, actor) });
    } catch (err) {
      await fs.unlink(file.path).catch(() => undefined);
      if (storedKey) await removeStored([storedKey]).catch(() => undefined);
      throw err;
    }
  },
);

tasksRouter.delete('/:ref/attachments/:nodeId', async (req, res) => {
  const actor = actorOf(req);
  const { task, perms } = await loadTaskForActor(String(req.params.ref), actor);
  requirePerm(perms, 'attach');
  await prisma.taskAttachment.deleteMany({ where: { taskId: task.id, nodeId: String(req.params.nodeId) } });
  res.json({ task: await loadDetail(task.id, actor) });
});

