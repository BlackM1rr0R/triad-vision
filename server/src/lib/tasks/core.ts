import type { Prisma, Role, TaskStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole } from '../../middleware/auth.js';
import { forbidden, notFound } from '../http.js';

/** Shared rules, numbering and response shapes for team tasks (/api/tasks). */

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'] as const;
export const TASK_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
/** Not finished: shown in "my open tasks", reminded about, counted as overdue. */
export const OPEN_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'REVIEW'];
export const STAFF_ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];

export const taskKey = (n: number) => `T-${String(n).padStart(4, '0')}`;

/** "T-0012", "t-12", "12" → { number: 12 }; anything else is treated as a task id. */
export const parseTaskRef = (ref: string): { number: number } | { id: string } => {
  const m = /^(?:T-?)?(\d{1,9})$/i.exec(ref.trim());
  return m ? { number: Number(m[1]) } : { id: ref };
};

export const fullName = (u: { firstName: string; lastName: string } | null | undefined) =>
  u ? `${u.firstName} ${u.lastName}`.trim() : '';

// ─── Permissions ───────────────────────────────────────────────────────

export interface Actor {
  id: string;
  role: Role;
}

export interface TaskPermissions {
  /** title, description, priority, dates, case link */
  edit: boolean;
  delete: boolean;
  /** add / remove assignees */
  assign: boolean;
  /** move between statuses / reorder on the board */
  status: boolean;
  checklist: boolean;
  comment: boolean;
  /** link / unlink drive files */
  attach: boolean;
  /** an unassigned task may be taken by anyone on the team */
  take: boolean;
}

export const taskPermissions = (
  actor: Actor,
  task: { createdById: string | null; assignees: { userId: string }[] },
): TaskPermissions => {
  const manage = hasMinRole(actor.role, 'ADMIN') || (!!task.createdById && task.createdById === actor.id);
  const assignee = task.assignees.some((a) => a.userId === actor.id);
  const work = manage || assignee;
  return {
    edit: manage,
    delete: manage,
    assign: manage,
    status: work,
    checklist: work,
    comment: true,
    attach: work,
    take: !manage && task.assignees.length === 0,
  };
};

/**
 * Tasks linked to a case follow case visibility. Every staff role may open every case in the admin
 * panel today (see routes/admin/cases.ts), so this is a single place to tighten if that ever changes.
 */
export const caseVisibilityWhere = (_actor: Actor): Prisma.TaskWhereInput => ({});

/** Loads a task by id or number (T-0001) with what permission checks need; 404 when invisible. */
export const loadTaskForActor = async (ref: string, actor: Actor) => {
  const key = parseTaskRef(ref);
  const task = await prisma.task.findFirst({
    where: { AND: ['number' in key ? { number: key.number } : { id: key.id }, caseVisibilityWhere(actor)] },
    include: { assignees: { select: { userId: true } } },
  });
  if (!task) throw notFound('TASK_NOT_FOUND');
  return { task, perms: taskPermissions(actor, task) };
};

export const requirePerm = (perms: TaskPermissions, key: keyof TaskPermissions) => {
  if (!perms[key]) throw forbidden('TASK_FORBIDDEN');
};

// ─── Mentions in comments: "@[Full Name](user:<id>)" ───────────────────

const MENTION_RE = /@\[([^\]\n]{1,80})\]\(user:([A-Za-z0-9_-]{1,40})\)/g;

export const mentionedIds = (body: string) => [...new Set([...body.matchAll(MENTION_RE)].map((m) => m[2]))];

/** Comment text for notifications: mention tokens become "@Name", trimmed to `max` characters. */
export const plainText = (body: string, max = 280) => {
  const s = body.replace(MENTION_RE, (_m, name: string) => `@${name}`).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

// ─── Activity entries (TaskComment.system = true, machine-readable JSON body) ───

type Person = { id: string; name: string };
export type Activity =
  | { type: 'created' }
  | { type: 'status'; from: TaskStatus; to: TaskStatus }
  | { type: 'priority'; from: string; to: string }
  | { type: 'due'; from: string | null; to: string | null }
  | { type: 'assignees'; added: Person[]; removed: Person[] }
  | { type: 'case'; from: string | null; to: string | null }
  | { type: 'title'; from: string; to: string };

export const activityRow = (taskId: string, authorId: string, a: Activity) => ({
  taskId,
  authorId,
  system: true,
  body: JSON.stringify(a),
});

const parseActivity = (body: string): Activity | null => {
  try {
    const v = JSON.parse(body) as Activity;
    return v && typeof v === 'object' && typeof v.type === 'string' ? v : null;
  } catch {
    return null;
  }
};

// ─── Numbering ─────────────────────────────────────────────────────────

/** Creates a task with number = max + 1, retrying when two requests race for the same number. */
export const createNumbered = async <T>(create: (tx: Prisma.TransactionClient, number: number) => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const max = await tx.task.aggregate({ _max: { number: true } });
        return create(tx, (max._max.number ?? 0) + 1);
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      const target = String((err as { meta?: { target?: unknown } }).meta?.target ?? '');
      if (code === 'P2002' && attempt < 6 && (target.includes('number') || target === '')) continue;
      throw err;
    }
  }
};

// ─── Response shapes ───────────────────────────────────────────────────

const personSelect = { id: true, firstName: true, lastName: true, role: true } satisfies Prisma.UserSelect;

export const cardInclude = {
  assignees: { orderBy: { createdAt: 'asc' }, select: { user: { select: personSelect } } },
  case: { select: { id: true, number: true, client: { select: { firstName: true, lastName: true } } } },
  checklist: { select: { done: true } },
  _count: { select: { comments: { where: { system: false } }, attachments: true } },
} satisfies Prisma.TaskInclude;

type CardRow = Prisma.TaskGetPayload<{ include: typeof cardInclude }>;

const caseRef = (c: CardRow['case']) => (c ? { id: c.id, number: c.number, clientName: fullName(c.client) } : null);

export const toCard = (t: CardRow) => ({
  id: t.id,
  number: t.number,
  key: taskKey(t.number),
  title: t.title,
  status: t.status,
  priority: t.priority,
  startAt: t.startAt,
  dueAt: t.dueAt,
  completedAt: t.completedAt,
  sortOrder: t.sortOrder,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
  createdById: t.createdById,
  assignees: t.assignees.map((a) => a.user),
  case: caseRef(t.case),
  checklist: { done: t.checklist.filter((c) => c.done).length, total: t.checklist.length },
  commentCount: t._count.comments,
  attachmentCount: t._count.attachments,
});

export type TaskCard = ReturnType<typeof toCard>;

export const detailInclude = {
  assignees: { orderBy: { createdAt: 'asc' }, select: { userId: true, user: { select: personSelect } } },
  createdBy: { select: personSelect },
  case: { select: { id: true, number: true, status: true, client: { select: { firstName: true, lastName: true } } } },
  checklist: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
  comments: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { author: { select: personSelect } } },
  attachments: {
    orderBy: { createdAt: 'asc' },
    include: { node: { select: { id: true, name: true, kind: true, mimeType: true, size: true, deletedAt: true } } },
  },
} satisfies Prisma.TaskInclude;

type DetailRow = Prisma.TaskGetPayload<{ include: typeof detailInclude }>;

export const toDetail = (t: DetailRow, actor: Actor, canOpenNode: (nodeId: string) => boolean) => ({
  id: t.id,
  number: t.number,
  key: taskKey(t.number),
  title: t.title,
  description: t.description,
  status: t.status,
  priority: t.priority,
  startAt: t.startAt,
  dueAt: t.dueAt,
  completedAt: t.completedAt,
  sortOrder: t.sortOrder,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
  createdBy: t.createdBy,
  assignees: t.assignees.map((a) => a.user),
  case: t.case ? { id: t.case.id, number: t.case.number, status: t.case.status, clientName: fullName(t.case.client) } : null,
  checklist: t.checklist.map((c) => ({ id: c.id, text: c.text, done: c.done, sortOrder: c.sortOrder })),
  attachments: t.attachments
    .filter((a) => !a.node.deletedAt)
    .map((a) => ({
      nodeId: a.nodeId,
      name: a.node.name,
      kind: a.node.kind,
      mimeType: a.node.mimeType,
      size: a.node.size,
      createdAt: a.createdAt,
      accessible: canOpenNode(a.nodeId),
    })),
  /** Comments and activity entries, oldest first. */
  timeline: t.comments.map((c) =>
    c.system
      ? { id: c.id, kind: 'activity' as const, author: c.author, createdAt: c.createdAt, activity: parseActivity(c.body) }
      : {
          id: c.id,
          kind: 'comment' as const,
          author: c.author,
          createdAt: c.createdAt,
          body: c.body,
          canEdit: c.authorId === actor.id,
          canDelete: c.authorId === actor.id || hasMinRole(actor.role, 'ADMIN'),
        },
  ),
  permissions: taskPermissions(actor, t),
});

/** Active staff users among `ids` (assignees and mentions must be on the team). */
export const activeStaff = (ids: string[]) =>
  ids.length
    ? prisma.user.findMany({
        where: { id: { in: ids }, isActive: true, role: { in: STAFF_ROLES } },
        select: { id: true, firstName: true, lastName: true, locale: true },
      })
    : Promise.resolve([]);
