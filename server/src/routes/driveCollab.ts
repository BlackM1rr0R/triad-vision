import type { Request } from 'express';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../db.js';
import { hasMinRole, requireMinRole } from '../middleware/auth.js';
import { HttpError, badRequest, forbidden, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { notifyUser } from '../lib/notifications.js';
import { DriveAccessCtx, requireNode } from '../lib/drive/access.js';
import { allows } from '../lib/drive/levels.js';
import { mentionedIds, plainText } from '../lib/tasks/core.js';
import { DRIVE_ACTIONS, logDriveActivity } from '../lib/driveCollab/activity.js';
import { LOCK_HEARTBEAT_MS, LOCK_STALE_MS, acquireLock, forceUnlock, isStale, releaseLock } from '../lib/driveCollab/lock.js';
import { publishDrive } from '../lib/driveCollab/realtime.js';
import { MAX_LINK_DAYS, linkStatus, maxExpiry, newShareToken, sha256, shareUrl } from '../lib/driveCollab/share.js';
import { createTaskWithFile, taskChips } from '../lib/driveCollab/tasks.js';
import { collabTexts } from '../lib/driveCollab/texts.js';

/**
 * Collaboration on the team drive (/api/drive/collab), same access rules as /api/drive:
 *
 *   GET    /activity?folderId=&nodeId=&actorId=&action=&from=&to=&cursor=   activity journal (VIEW)
 *   GET    /nodes/:nodeId/comments                                         comments with replies (VIEW)
 *   POST   /nodes/:nodeId/comments { body, parentId?, mentions? }          new comment / reply (VIEW)
 *   PATCH  /comments/:id { body?, resolved? }                              edit own (ADMIN+ any) / resolve
 *   DELETE /comments/:id                                                   delete own (ADMIN+ any)
 *   POST   /comments/:id/task { title, assigneeIds, dueAt?, description? }  task from a comment, file attached
 *   GET    /lock/:nodeId · POST /lock/:nodeId (acquire + heartbeat) · DELETE /lock/:nodeId[?force=1]
 *   GET    /nodes/:nodeId/links · POST /nodes/:nodeId/links                external share links (EDIT)
 *   DELETE /links/:id                                                      revoke
 *   GET    /links/:id/accesses                                             who opened it, when
 */
export const driveCollabRouter = Router();
driveCollabRouter.use(requireMinRole('STAFF'));

const STAFF_ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];
const person = { select: { id: true, firstName: true, lastName: true } } as const;
const ctxOf = (req: Request) => new DriveAccessCtx({ id: req.user!.id, role: req.user!.role });
const idOf = (raw: unknown, code = 'NODE_NOT_FOUND') => {
  const id = String(raw ?? '');
  if (!id || id.length > 120) throw notFound(code);
  return id;
};
const me = (req: Request) => ({ id: req.user!.id, firstName: req.user!.firstName, lastName: req.user!.lastName });
const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

/** Where a link to an item opens: its folder in the explorer, with the item (and comment) selected. */
const itemLink = (node: { id: string; parentId: string | null }, commentId?: string) => {
  if (!node.parentId) return `/workspace/drive/f/${encodeURIComponent(node.id)}`;
  const q = new URLSearchParams({ item: node.id, ...(commentId ? { comment: commentId } : {}) });
  return `/workspace/drive/f/${encodeURIComponent(node.parentId)}?${q}`;
};

// ─── Activity journal ─────────────────────────────────────────────────

const actionList = z
  .string()
  .max(600)
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
  .pipe(z.array(z.enum(DRIVE_ACTIONS)).max(DRIVE_ACTIONS.length));

const activityQuery = z.object({
  folderId: z.string().min(1).max(120).optional(),
  nodeId: z.string().min(1).max(120).optional(),
  actorId: z.string().min(1).max(40).optional(),
  action: actionList.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

driveCollabRouter.get('/activity', async (req, res) => {
  const q = parse(activityQuery, req.query);
  const ctx = ctxOf(req);
  const and: Prisma.DriveActivityWhereInput[] = [];
  if (q.nodeId) {
    await requireNode(ctx, q.nodeId, 'VIEW', { allowDeleted: true });
    and.push({ nodeId: q.nodeId });
  }
  if (q.folderId) {
    const { node } = await requireNode(ctx, q.folderId, 'VIEW', { allowDeleted: true });
    if (node.kind !== 'FOLDER') throw badRequest('NOT_A_FOLDER');
    // Actions on its direct children, on the folder itself, and items moved out of it.
    and.push({ OR: [{ folderId: q.folderId }, { nodeId: q.folderId }, { action: 'MOVE', meta: { path: '$.fromId', equals: q.folderId } }] });
  }
  if (!q.nodeId && !q.folderId && !ctx.isSuper) throw badRequest('FOLDER_OR_NODE_REQUIRED');
  if (q.actorId) and.push({ actorId: q.actorId });
  if (q.action?.length) and.push({ action: { in: q.action } });
  if (q.from || q.to) and.push({ createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } });

  const rows = await prisma.driveActivity.findMany({
    where: { AND: and },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    select: { id: true, nodeId: true, folderId: true, action: true, name: true, meta: true, createdAt: true, actor: person },
  });
  const page = rows.slice(0, q.limit);
  const nextCursor = rows.length > q.limit ? page[page.length - 1].id : null;

  // Rows about items the caller may not see (a restricted sub-folder) are left out; purged items keep their row.
  const ids = [...new Set(page.flatMap((r) => [r.nodeId, r.folderId]).filter((x): x is string => !!x))];
  await ctx.load(ids);
  const visible = (id: string | null) => !id || !ctx.nodes.has(id) || !!ctx.level(id);
  const items = page
    .filter((r) => visible(r.nodeId))
    .map((r) => {
      const n = r.nodeId ? ctx.nodes.get(r.nodeId) : undefined;
      const f = r.folderId ? ctx.nodes.get(r.folderId) : undefined;
      return {
        ...r,
        node: n ? { kind: n.kind, parentId: n.parentId, deleted: !!n.deletedAt } : null,
        folder: f && ctx.level(f.id) ? { id: f.id, name: f.name, system: f.system, space: f.space, deleted: !!f.deletedAt } : null,
      };
    });
  res.json({ items, nextCursor });
});

// ─── Comments ─────────────────────────────────────────────────────────

const commentSelect = {
  id: true,
  nodeId: true,
  authorId: true,
  parentId: true,
  body: true,
  mentions: true,
  taskId: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  author: person,
} satisfies Prisma.DriveCommentSelect;
type CommentRow = Prisma.DriveCommentGetPayload<{ select: typeof commentSelect }>;

const bodySchema = z
  .string()
  .max(5000)
  .transform((s) => s.replace(/\r\n/g, '\n').trim())
  .refine((s) => s.length > 0, 'EMPTY');

const asIds = (v: Prisma.JsonValue | null) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const isAdmin = (req: Request) => hasMinRole(req.user!.role, 'ADMIN');

/** Active staff among `ids` who can VIEW the node (mention targets). */
const mentionTargets = async (ids: string[], nodeId: string) => {
  const unique = [...new Set(ids)].slice(0, 30);
  if (!unique.length) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: unique }, isActive: true, role: { in: STAFF_ROLES } },
    select: { id: true, role: true, firstName: true, lastName: true, locale: true },
  });
  const out: typeof users = [];
  for (const u of users) {
    const ctx = new DriveAccessCtx({ id: u.id, role: u.role });
    await ctx.load([nodeId]);
    if (allows(ctx.level(nodeId), 'VIEW')) out.push(u);
  }
  return out;
};

const notifyMentions = async (
  users: { id: string; locale: import('@prisma/client').Locale }[],
  node: { id: string; parentId: string | null; name: string },
  commentId: string,
  body: string,
  actor: { id: string; firstName: string; lastName: string },
) => {
  for (const u of users) {
    if (u.id === actor.id) continue;
    try {
      const tx = collabTexts(u.locale);
      const msg = tx.mention({ actor: fullName(actor), name: node.name, excerpt: plainText(body) });
      await notifyUser(u.id, { type: 'DRIVE_MENTION', ...msg, link: itemLink(node, commentId), ctaLabel: tx.cta });
    } catch (err) {
      console.error('[driveCollab] mention notification failed', err);
    }
  }
};

const shapeComments = async (req: Request, rows: CommentRow[], flat = false) => {
  const chips = await taskChips(rows.map((r) => r.taskId).filter((x): x is string => !!x));
  const mentionIds = [...new Set(rows.flatMap((r) => asIds(r.mentions)))];
  const people = mentionIds.length ? await prisma.user.findMany({ where: { id: { in: mentionIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const names = new Map(people.map((p) => [p.id, fullName(p)]));
  const admin = isAdmin(req);
  const shape = (r: CommentRow) => ({
    id: r.id,
    nodeId: r.nodeId,
    parentId: r.parentId,
    body: r.body,
    author: r.author,
    mentions: asIds(r.mentions).map((id) => ({ id, name: names.get(id) ?? '' })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    edited: r.updatedAt.getTime() - r.createdAt.getTime() > 1000,
    resolvedAt: r.resolvedAt,
    task: r.taskId ? (chips.get(r.taskId) ?? null) : null,
    canEdit: r.authorId === req.user!.id || admin,
    canDelete: r.authorId === req.user!.id || admin,
  });
  if (flat) return rows.map((r) => ({ ...shape(r), replies: [] }));
  const top = rows.filter((r) => !r.parentId);
  const byParent = new Map<string, CommentRow[]>();
  for (const r of rows) if (r.parentId) byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);
  return top.map((t) => ({ ...shape(t), replies: (byParent.get(t.id) ?? []).map(shape) }));
};

driveCollabRouter.get('/nodes/:nodeId/comments', async (req, res) => {
  const nodeId = idOf(req.params.nodeId);
  await requireNode(ctxOf(req), nodeId, 'VIEW', { allowDeleted: true });
  const rows = await prisma.driveComment.findMany({ where: { nodeId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: commentSelect, take: 2000 });
  const comments = await shapeComments(req, rows);
  res.json({ comments, open: comments.filter((c) => !c.resolvedAt).length });
});

const loadComment = async (req: Request) => {
  const id = idOf(req.params.id, 'COMMENT_NOT_FOUND');
  const c = await prisma.driveComment.findUnique({ where: { id }, select: commentSelect });
  if (!c) throw notFound('COMMENT_NOT_FOUND');
  const ctx = ctxOf(req);
  const { node } = await requireNode(ctx, c.nodeId, 'VIEW', { allowDeleted: true }).catch((err) => {
    if (err instanceof HttpError && err.status === 404) throw notFound('COMMENT_NOT_FOUND');
    throw err;
  });
  return { c, node };
};

driveCollabRouter.post('/nodes/:nodeId/comments', async (req, res) => {
  const nodeId = idOf(req.params.nodeId);
  const body = parse(z.object({ body: bodySchema, parentId: z.string().min(1).max(40).nullable().optional(), mentions: z.array(z.string().min(1).max(40)).max(30).optional() }), req.body);
  const { node } = await requireNode(ctxOf(req), nodeId, 'VIEW');
  let parentId: string | null = null;
  if (body.parentId) {
    const parent = await prisma.driveComment.findUnique({ where: { id: body.parentId }, select: { id: true, nodeId: true, parentId: true } });
    if (!parent || parent.nodeId !== nodeId) throw badRequest('INVALID_PARENT');
    // One level of replies: a reply to a reply joins the same thread.
    parentId = parent.parentId ?? parent.id;
  }
  const targets = await mentionTargets([...mentionedIds(body.body), ...(body.mentions ?? [])], nodeId);
  const created = await prisma.driveComment.create({
    data: { nodeId, authorId: req.user!.id, parentId, body: body.body, mentions: targets.map((t) => t.id) },
    select: commentSelect,
  });
  // A new reply reopens a resolved thread.
  if (parentId) await prisma.driveComment.updateMany({ where: { id: parentId, resolvedAt: { not: null } }, data: { resolvedAt: null } });
  await notifyMentions(targets, node, created.id, body.body, me(req));
  await logDriveActivity({ nodeId, actorId: req.user!.id, action: 'COMMENT', name: node.name, meta: { commentId: created.id, reply: !!parentId, kind: node.kind } });
  await publishDrive('drive.comment', { nodeId, commentId: created.id, action: 'created' });
  const [shaped] = await shapeComments(req, [created], true);
  res.status(201).json({ comment: shaped });
});

driveCollabRouter.patch('/comments/:id', async (req, res) => {
  const body = parse(z.object({ body: bodySchema.optional(), resolved: z.boolean().optional(), mentions: z.array(z.string().min(1).max(40)).max(30).optional() }), req.body);
  const { c, node } = await loadComment(req);
  const data: Prisma.DriveCommentUpdateInput = {};
  let added: Awaited<ReturnType<typeof mentionTargets>> = [];
  if (body.body !== undefined && body.body !== c.body) {
    if (c.authorId !== req.user!.id && !isAdmin(req)) throw forbidden('NOT_COMMENT_AUTHOR');
    const targets = await mentionTargets([...mentionedIds(body.body), ...(body.mentions ?? [])], c.nodeId);
    const before = new Set(asIds(c.mentions));
    added = targets.filter((t) => !before.has(t.id));
    data.body = body.body;
    data.mentions = targets.map((t) => t.id);
  }
  if (body.resolved !== undefined) {
    if (c.parentId) throw badRequest('REPLY_CANNOT_BE_RESOLVED');
    data.resolvedAt = body.resolved ? (c.resolvedAt ?? new Date()) : null;
  }
  const updated = Object.keys(data).length ? await prisma.driveComment.update({ where: { id: c.id }, data, select: commentSelect }) : c;
  if (added.length) await notifyMentions(added, node, c.id, updated.body, me(req));
  await publishDrive('drive.comment', { nodeId: c.nodeId, commentId: c.id, action: 'updated' });
  const [shaped] = await shapeComments(req, [updated], true);
  res.json({ comment: shaped });
});

driveCollabRouter.delete('/comments/:id', async (req, res) => {
  const { c } = await loadComment(req);
  if (c.authorId !== req.user!.id && !isAdmin(req)) throw forbidden('NOT_COMMENT_AUTHOR');
  await prisma.$transaction([prisma.driveComment.deleteMany({ where: { parentId: c.id } }), prisma.driveComment.delete({ where: { id: c.id } })]);
  await publishDrive('drive.comment', { nodeId: c.nodeId, commentId: c.id, action: 'deleted' });
  res.json({ ok: true });
});

const dateIn = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), 'INVALID_DATE')
  .transform((s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T17:00:00Z`) : new Date(s)));

/** "Tapşırıq yarat" from a comment: the task gets the file attached and the comment shows its status. */
driveCollabRouter.post('/comments/:id/task', async (req, res) => {
  const body = parse(
    z.object({
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().max(20_000).nullable().optional(),
      assigneeIds: z.array(z.string().min(1).max(40)).max(20).default([]),
      dueAt: dateIn.nullable().optional(),
    }),
    req.body,
  );
  const { c, node } = await loadComment(req);
  if (c.taskId && (await prisma.task.count({ where: { id: c.taskId } }))) throw badRequest('TASK_ALREADY_CREATED');
  if (node.deletedAt) throw badRequest('NODE_IN_TRASH');
  if (node.system) throw badRequest('SYSTEM_NODE');
  const text = plainText(c.body, 5000);
  const title = body.title ?? (text.length > 120 ? `${text.slice(0, 119)}…` : text);
  const task = await createTaskWithFile({
    title,
    description: body.description !== undefined ? body.description?.trim() || null : text,
    assigneeIds: body.assigneeIds,
    dueAt: body.dueAt ?? null,
    nodeId: node.id,
    actor: me(req),
  });
  await prisma.driveComment.update({ where: { id: c.id }, data: { taskId: task.id } });
  await logDriveActivity({ nodeId: node.id, actorId: req.user!.id, action: 'TASK_CREATED', name: node.name, meta: { taskId: task.id, number: task.number, commentId: c.id, kind: node.kind } });
  await publishDrive('drive.comment', { nodeId: node.id, commentId: c.id, action: 'task' });
  const chip = (await taskChips([task.id])).get(task.id) ?? null;
  res.status(201).json({ task: chip });
});

// ─── Edit locks ───────────────────────────────────────────────────────

const lockView = async (nodeId: string, userId: string) => {
  const n = await prisma.driveNode.findUnique({ where: { id: nodeId }, select: { lockedAt: true, lockedById: true, lockedBy: person } });
  if (!n?.lockedById || !n.lockedBy) return null;
  return { lockedBy: { id: n.lockedBy.id, name: fullName(n.lockedBy) }, lockedAt: n.lockedAt, mine: n.lockedById === userId, stale: isStale(n.lockedAt) };
};

driveCollabRouter.get('/lock/:nodeId', async (req, res) => {
  const nodeId = idOf(req.params.nodeId);
  await requireNode(ctxOf(req), nodeId, 'VIEW');
  res.json({ lock: await lockView(nodeId, req.user!.id), staleAfterMs: LOCK_STALE_MS, heartbeatMs: LOCK_HEARTBEAT_MS });
});

/** Acquire, and heartbeat (call again every minute while editing). A stale lock is taken over. */
driveCollabRouter.post('/lock/:nodeId', async (req, res) => {
  const nodeId = idOf(req.params.nodeId);
  const { node } = await requireNode(ctxOf(req), nodeId, 'EDIT');
  if (node.kind !== 'FILE') throw badRequest('NOT_A_FILE');
  const r = await acquireLock(nodeId, req.user!.id);
  if (r.status !== 'refreshed') {
    await logDriveActivity({ nodeId, actorId: req.user!.id, action: 'LOCK', name: node.name, meta: r.previous ? { takeover: true, previous: r.previous } : {} });
    await publishDrive('drive.lock', { nodeId, locked: true });
  }
  res.json({ status: r.status, lock: await lockView(nodeId, req.user!.id), staleAfterMs: LOCK_STALE_MS, heartbeatMs: LOCK_HEARTBEAT_MS });
});

/** Releases the caller's lock; `?force=1` lets a super admin remove someone else's. */
driveCollabRouter.delete('/lock/:nodeId', async (req, res) => {
  const nodeId = idOf(req.params.nodeId);
  const { node } = await requireNode(ctxOf(req), nodeId, 'VIEW', { allowDeleted: true });
  const force = req.query.force === '1' || req.query.force === 'true';
  const current = await lockView(nodeId, req.user!.id);
  if (!current) {
    res.json({ ok: true, released: false });
    return;
  }
  if (current.mine) {
    const released = await releaseLock(nodeId, req.user!.id);
    if (released) {
      await logDriveActivity({ nodeId, actorId: req.user!.id, action: 'UNLOCK', name: node.name });
      await publishDrive('drive.lock', { nodeId, locked: false });
    }
    res.json({ ok: true, released });
    return;
  }
  if (!force) throw forbidden('NOT_LOCK_OWNER');
  if (req.user!.role !== 'SUPER_ADMIN') throw forbidden('SUPER_ADMIN_ONLY');
  const previous = await forceUnlock(nodeId);
  await audit(req, 'DRIVE_FORCE_UNLOCKED', `drive:${nodeId}`, { name: node.name, previous: previous?.id ?? null });
  await logDriveActivity({ nodeId, actorId: req.user!.id, action: 'UNLOCK', name: node.name, meta: { forced: true, previous } });
  await publishDrive('drive.lock', { nodeId, locked: false });
  res.json({ ok: true, released: true, forced: true });
});

// ─── External share links ─────────────────────────────────────────────

const linkSelect = {
  id: true,
  nodeId: true,
  label: true,
  expiresAt: true,
  passwordHash: true,
  maxDownloads: true,
  downloads: true,
  allowUpload: true,
  createdAt: true,
  revokedAt: true,
  createdBy: person,
  accesses: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
  _count: { select: { accesses: true } },
} satisfies Prisma.DriveShareLinkSelect;
type LinkRow = Prisma.DriveShareLinkGetPayload<{ select: typeof linkSelect }>;

const shapeLink = (l: LinkRow) => ({
  id: l.id,
  nodeId: l.nodeId,
  label: l.label,
  expiresAt: l.expiresAt,
  hasPassword: !!l.passwordHash,
  maxDownloads: l.maxDownloads,
  downloads: l.downloads,
  allowUpload: l.allowUpload,
  createdAt: l.createdAt,
  createdBy: l.createdBy,
  revokedAt: l.revokedAt,
  status: linkStatus(l),
  lastAccessAt: l.accesses[0]?.createdAt ?? null,
  accessCount: l._count.accesses,
});

driveCollabRouter.get('/nodes/:nodeId/links', async (req, res) => {
  const nodeId = idOf(req.params.nodeId);
  await requireNode(ctxOf(req), nodeId, 'EDIT', { allowDeleted: true });
  const rows = await prisma.driveShareLink.findMany({ where: { nodeId }, orderBy: { createdAt: 'desc' }, select: linkSelect, take: 200 });
  res.json({ links: rows.map(shapeLink), maxDays: MAX_LINK_DAYS });
});

const linkBody = z.object({
  label: z.string().trim().max(160).nullable().optional(),
  expiresInDays: z.number().int().min(1).max(MAX_LINK_DAYS).optional(),
  expiresAt: z.coerce.date().optional(),
  password: z.string().min(4).max(200).nullable().optional(),
  maxDownloads: z.number().int().min(1).max(100_000).nullable().optional(),
  allowUpload: z.boolean().optional(),
});

/** Creates a link (EDIT on the item). The full URL is in this answer only — the server keeps a hash. */
driveCollabRouter.post('/nodes/:nodeId/links', async (req, res) => {
  const nodeId = idOf(req.params.nodeId);
  const body = parse(linkBody, req.body);
  const ctx = ctxOf(req);
  const { node, level } = await requireNode(ctx, nodeId, 'EDIT');
  if (!node.parentId || (node.system && !ctx.isSuper)) throw badRequest('SYSTEM_NODE');
  if (node.kind === 'FILE' && !allows(level, 'DOWNLOAD')) throw forbidden('INSUFFICIENT_ACCESS');
  if (body.allowUpload && node.kind !== 'FOLDER') throw badRequest('UPLOAD_ONLY_FOR_FOLDERS');
  const now = Date.now();
  const expiresAt = body.expiresAt ?? new Date(now + (body.expiresInDays ?? 7) * 24 * 60 * 60 * 1000);
  if (expiresAt.getTime() <= now) throw badRequest('EXPIRY_IN_PAST');
  if (expiresAt.getTime() > maxExpiry(now).getTime() + 60_000) throw badRequest('EXPIRY_TOO_FAR');
  const token = newShareToken();
  const created = await prisma.driveShareLink.create({
    data: {
      nodeId,
      tokenHash: sha256(token),
      passwordHash: body.password ? await bcrypt.hash(body.password, 10) : null,
      label: body.label?.trim() || null,
      expiresAt,
      maxDownloads: body.maxDownloads ?? null,
      allowUpload: !!body.allowUpload,
      createdById: req.user!.id,
    },
    select: linkSelect,
  });
  await audit(req, 'DRIVE_SHARE_LINK_CREATED', `drive:${nodeId}`, { name: node.name, linkId: created.id, expiresAt, password: !!body.password, maxDownloads: body.maxDownloads ?? null, allowUpload: !!body.allowUpload });
  await logDriveActivity({ nodeId, actorId: req.user!.id, action: 'SHARE_LINK_CREATED', name: node.name, meta: { linkId: created.id, label: created.label, expiresAt, allowUpload: created.allowUpload, kind: node.kind } });
  res.status(201).json({ link: shapeLink(created), url: shareUrl(token), token });
});

const loadLink = async (req: Request) => {
  const id = idOf(req.params.id, 'LINK_NOT_FOUND');
  const link = await prisma.driveShareLink.findUnique({ where: { id }, select: linkSelect });
  if (!link) throw notFound('LINK_NOT_FOUND');
  const { node } = await requireNode(ctxOf(req), link.nodeId, 'EDIT', { allowDeleted: true }).catch((err) => {
    if (err instanceof HttpError && err.status === 404) throw notFound('LINK_NOT_FOUND');
    throw err;
  });
  return { link, node };
};

driveCollabRouter.delete('/links/:id', async (req, res) => {
  const { link, node } = await loadLink(req);
  if (link.revokedAt) {
    res.json({ link: shapeLink(link) });
    return;
  }
  const updated = await prisma.driveShareLink.update({ where: { id: link.id }, data: { revokedAt: new Date() }, select: linkSelect });
  await audit(req, 'DRIVE_SHARE_LINK_REVOKED', `drive:${node.id}`, { name: node.name, linkId: link.id });
  await logDriveActivity({ nodeId: node.id, actorId: req.user!.id, action: 'SHARE_LINK_REVOKED', name: node.name, meta: { linkId: link.id, label: link.label, kind: node.kind } });
  res.json({ link: shapeLink(updated) });
});

driveCollabRouter.get('/links/:id/accesses', async (req, res) => {
  const { link } = await loadLink(req);
  const accesses = await prisma.driveShareAccess.findMany({
    where: { linkId: link.id },
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: { id: true, action: true, fileName: true, ip: true, userAgent: true, createdAt: true },
  });
  res.json({ link: shapeLink(link), accesses });
});

