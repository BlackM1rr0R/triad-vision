import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import type { DocWorkflowStage, Prisma, VisaType } from '@prisma/client';
import { prisma } from '../db.js';
import { hasMinRole, requireMinRole } from '../middleware/auth.js';
import { HttpError, badRequest, conflict, forbidden, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { DriveAccessCtx, requireNode } from '../lib/drive/access.js';
import { buildItems, itemSelect, type DriveItem } from '../lib/drive/items.js';
import { VISA_TYPES } from '../lib/drive/cases.js';
import { logDriveActivity } from '../lib/driveCollab/activity.js';
import { assertNotLockedByOther } from '../lib/driveCollab/lock.js';
import { findSibling } from '../lib/drive/names.js';
import { MISSING_HASH } from '../lib/drive/org/hash.js';
import { setFinal } from '../lib/drive/org/final.js';
import { DOC_TYPES, NAMING_TOKENS, getNamingSettings, saveNamingSettings } from '../lib/drive/org/naming.js';
import { tidyPreview } from '../lib/drive/org/tidy.js';
import { TAG_COLORS, listTags, tagSelect } from '../lib/drive/org/tags.js';
import { WORKFLOW_STAGES, folderSubtreeIds, seedSmartFolders, smartQuerySchema, smartWhere, type SmartQuery } from '../lib/drive/org/smart.js';
import { caseReadiness } from '../lib/drive/org/readiness.js';
import { applyTemplatesToExisting, cleanFolderList, foldersOf, seedFolderTemplates } from '../lib/drive/org/templates.js';

/**
 * Document organisation of the team drive (mounted inside /api/drive by routes/drive.ts):
 *
 *   GET/POST/PATCH/DELETE /tags[/:id]          tag list (everyone) · manage (ADMIN+)
 *   POST   /tags/apply { ids, add?, remove? }  tag / untag items (EDIT on each)
 *   GET    /tags/:id/items                     everything with that tag (whole drive)
 *   PATCH  /nodes/:id/stage · POST /stage/bulk workflow column of documents (EDIT)
 *   GET    /board?folderId&tagId&caseId&uploadedById&from&to   workflow board
 *   GET    /case-folders/:caseId/readiness     "12/15 sənəd hazır" of the client folder header
 *   GET/PUT /naming · POST /naming/preview · POST /naming/apply   automatic names ("Adları qaydaya sal")
 *   GET/POST/PATCH/DELETE /smart-folders[/:id] · GET /smart-folders/:id/items · POST /query
 *   GET    /duplicates?folderId                "Dublikatları tap" (ADMIN+)
 *   POST   /final { ids } · POST /unfinal { ids, reason }   Final lock (STAFF+ / SUPER_ADMIN)
 *   GET/POST/PATCH/DELETE /folder-templates[/:id] · POST /folder-templates/apply-existing   (ADMIN+)
 */
export const driveOrgRouter = Router();

const ctxOf = (req: Request) => new DriveAccessCtx({ id: req.user!.id, role: req.user!.role });
const idParam = (req: Request, key = 'id') => {
  const id = String(req.params[key] ?? '');
  if (!id || id.length > 120) throw notFound('NOT_FOUND');
  return id;
};
const idList = z.array(z.string().min(1).max(120)).min(1).max(500);
const STAGE = z.enum(WORKFLOW_STAGES as [DocWorkflowStage, ...DocWorkflowStage[]]);
const isAdmin = (req: Request) => hasMinRole(req.user!.role, 'ADMIN');

type BatchResult = { id: string; ok: boolean; error?: string; name?: string };
const batch = async (ids: string[], fn: (id: string) => Promise<Partial<BatchResult> | void>) => {
  const results: BatchResult[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      results.push({ id, ok: true, ...((await fn(id)) ?? {}) });
    } catch (err) {
      if (err instanceof HttpError) results.push({ id, ok: false, error: err.code });
      else throw err;
    }
  }
  return results;
};
const counts = (r: BatchResult[]) => ({ ok: r.filter((x) => x.ok).length, failed: r.filter((x) => !x.ok).length });

/** Items with the client folder they belong to (board cards, smart folder rows). */
const withClient = async (ctx: DriveAccessCtx, items: DriveItem[]) => {
  const chains = new Map(items.map((i) => [i.id, ctx.chain(i.id).map((n) => n.id)]));
  const all = [...new Set([...chains.values()].flat())];
  const cases = all.length
    ? await prisma.case.findMany({ where: { driveFolderId: { in: all } }, select: { id: true, number: true, driveFolderId: true, client: { select: { firstName: true, lastName: true } } } })
    : [];
  const byFolder = new Map(cases.map((c) => [c.driveFolderId!, c]));
  return items.map((i) => {
    const chain = chains.get(i.id) ?? [];
    let client: { caseId: string; caseNumber: string; folderId: string; name: string } | null = null;
    for (let k = chain.length - 1; k >= 0 && !client; k--) {
      const c = byFolder.get(chain[k]);
      if (c) client = { caseId: c.id, caseNumber: c.number, folderId: chain[k], name: ctx.nodes.get(chain[k])?.name ?? `${c.client.firstName} ${c.client.lastName}`.trim() };
    }
    return { ...i, client };
  });
};

const runQuery = async (ctx: DriveAccessCtx, q: SmartQuery, take = 600) => {
  const rows = await prisma.driveNode.findMany({ where: await smartWhere(q), select: itemSelect, orderBy: { updatedAt: 'desc' }, take });
  return (await buildItems(ctx, rows, { withLocation: true })).slice(0, 300);
};

// ─── Tags ─────────────────────────────────────────────────────────────

driveOrgRouter.get('/tags', async (req, res) => {
  res.json({ tags: await listTags(), colors: TAG_COLORS, canManage: isAdmin(req) });
});

const tagBody = z.object({ name: z.string().trim().min(1).max(60), color: z.enum(TAG_COLORS).default('amber'), sortOrder: z.number().int().min(0).max(10_000).optional() });

driveOrgRouter.post('/tags', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(tagBody, req.body);
  await listTags();
  if (await prisma.driveTag.findUnique({ where: { name: body.name } })) throw conflict('TAG_EXISTS');
  const max = await prisma.driveTag.aggregate({ _max: { sortOrder: true } });
  const tag = await prisma.driveTag.create({ data: { name: body.name, color: body.color, sortOrder: body.sortOrder ?? (max._max.sortOrder ?? 0) + 1 }, select: tagSelect });
  await audit(req, 'DRIVE_TAG_CREATED', `driveTag:${tag.id}`, { name: tag.name, color: tag.color });
  res.status(201).json({ tag });
});

driveOrgRouter.patch('/tags/:id', requireMinRole('ADMIN'), async (req, res) => {
  const id = idParam(req);
  const body = parse(tagBody.partial(), req.body);
  const tag = await prisma.driveTag.findUnique({ where: { id } });
  if (!tag) throw notFound('TAG_NOT_FOUND');
  if (body.name && body.name !== tag.name) {
    const other = await prisma.driveTag.findUnique({ where: { name: body.name } });
    if (other && other.id !== id) throw conflict('TAG_EXISTS');
  }
  const updated = await prisma.driveTag.update({ where: { id }, data: { name: body.name, color: body.color, sortOrder: body.sortOrder }, select: tagSelect });
  await audit(req, 'DRIVE_TAG_UPDATED', `driveTag:${id}`, { from: { name: tag.name, color: tag.color }, to: { name: updated.name, color: updated.color } });
  res.json({ tag: updated });
});

driveOrgRouter.delete('/tags/:id', requireMinRole('ADMIN'), async (req, res) => {
  const id = idParam(req);
  const tag = await prisma.driveTag.findUnique({ where: { id }, select: { id: true, name: true, _count: { select: { nodes: true } } } });
  if (!tag) throw notFound('TAG_NOT_FOUND');
  await prisma.driveTag.delete({ where: { id } });
  await audit(req, 'DRIVE_TAG_DELETED', `driveTag:${id}`, { name: tag.name, items: tag._count.nodes });
  res.json({ ok: true });
});

/** Tags / untags many items at once (EDIT on each). One journal row per item and direction. */
driveOrgRouter.post('/tags/apply', async (req, res) => {
  const ctx = ctxOf(req);
  const body = parse(
    z.object({ ids: idList, add: z.array(z.string().min(1).max(120)).max(20).default([]), remove: z.array(z.string().min(1).max(120)).max(20).default([]) }).refine((b) => b.add.length + b.remove.length > 0, { message: 'add or remove' }),
    req.body,
  );
  const tags = await prisma.driveTag.findMany({ where: { id: { in: [...body.add, ...body.remove] } }, select: { id: true, name: true } });
  const name = new Map(tags.map((t) => [t.id, t.name]));
  const add = body.add.filter((id) => name.has(id));
  const remove = body.remove.filter((id) => name.has(id) && !add.includes(id));
  if (!add.length && !remove.length) throw badRequest('TAG_NOT_FOUND');
  const results = await batch(body.ids, async (id) => {
    const { node } = await requireNode(ctx, id, 'EDIT');
    const have = new Set((await prisma.driveNodeTag.findMany({ where: { nodeId: id }, select: { tagId: true } })).map((t) => t.tagId));
    const added = add.filter((t) => !have.has(t));
    const removed = remove.filter((t) => have.has(t));
    if (added.length) await prisma.driveNodeTag.createMany({ data: added.map((tagId) => ({ nodeId: id, tagId })), skipDuplicates: true });
    if (removed.length) await prisma.driveNodeTag.deleteMany({ where: { nodeId: id, tagId: { in: removed } } });
    if (added.length) await logDriveActivity({ nodeId: id, folderId: node.parentId, actorId: req.user!.id, action: 'TAG', name: node.name, meta: { kind: node.kind, tags: added.map((t) => name.get(t)), tag: added.map((t) => name.get(t)).join(', ') } });
    if (removed.length) await logDriveActivity({ nodeId: id, folderId: node.parentId, actorId: req.user!.id, action: 'UNTAG', name: node.name, meta: { kind: node.kind, tags: removed.map((t) => name.get(t)), tag: removed.map((t) => name.get(t)).join(', ') } });
    return { name: node.name };
  });
  res.json({ results, ...counts(results) });
});

driveOrgRouter.get('/tags/:id/items', async (req, res) => {
  const id = idParam(req);
  if (!(await prisma.driveTag.count({ where: { id } }))) throw notFound('TAG_NOT_FOUND');
  const ctx = ctxOf(req);
  const rows = await prisma.driveNode.findMany({ where: { deletedAt: null, system: false, tags: { some: { tagId: id } } }, select: itemSelect, orderBy: { updatedAt: 'desc' }, take: 600 });
  res.json({ items: (await buildItems(ctx, rows, { withLocation: true })).slice(0, 300) });
});

// ─── Workflow board ───────────────────────────────────────────────────

const stageOne = async (req: Request, ctx: DriveAccessCtx, id: string, stage: DocWorkflowStage | null) => {
  const { node } = await requireNode(ctx, id, 'EDIT');
  if (node.kind !== 'FILE') throw badRequest('NOT_A_FILE');
  const row = await prisma.driveNode.findUniqueOrThrow({ where: { id }, select: { workflowStage: true, updatedAt: true } });
  if (row.workflowStage === stage) return { name: node.name };
  await prisma.driveNode.update({ where: { id }, data: { workflowStage: stage, workflowAt: stage ? new Date() : null, updatedAt: row.updatedAt } });
  await logDriveActivity({ nodeId: id, folderId: node.parentId, actorId: req.user!.id, action: 'STAGE', name: node.name, meta: { kind: 'FILE', from: row.workflowStage, to: stage, stage } });
  return { name: node.name };
};

driveOrgRouter.patch('/nodes/:id/stage', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const { stage } = parse(z.object({ stage: STAGE.nullable() }), req.body);
  await stageOne(req, ctx, id, stage);
  const [item] = await buildItems(ctx, [await prisma.driveNode.findUniqueOrThrow({ where: { id }, select: itemSelect })]);
  res.json({ item });
});

driveOrgRouter.post('/stage/bulk', async (req, res) => {
  const ctx = ctxOf(req);
  const { ids, stage } = parse(z.object({ ids: idList, stage: STAGE.nullable() }), req.body);
  const results = await batch(ids, (id) => stageOne(req, ctx, id, stage));
  res.json({ results, ...counts(results) });
});

const boardQuery = z.object({
  folderId: z.string().min(1).max(120).optional(),
  tagId: z.string().min(1).max(120).optional(),
  caseId: z.string().min(1).max(120).optional(),
  uploadedById: z.string().min(1).max(120).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** Documents with a workflow stage, below a folder (recursive) or in the whole drive, with filters. */
driveOrgRouter.get('/board', async (req, res) => {
  const ctx = ctxOf(req);
  const q = parse(boardQuery, req.query);
  const and: Prisma.DriveNodeWhereInput[] = [{ kind: 'FILE', deletedAt: null, workflowStage: { not: null } }];
  if (q.folderId) {
    await requireNode(ctx, q.folderId, 'VIEW');
    and.push({ parentId: { in: await folderSubtreeIds(q.folderId) } });
  }
  if (q.caseId) {
    const c = await prisma.case.findUnique({ where: { id: q.caseId }, select: { driveFolderId: true } });
    and.push(c?.driveFolderId ? { parentId: { in: await folderSubtreeIds(c.driveFolderId) } } : { id: '__none__' });
  }
  if (q.tagId) and.push({ tags: { some: { tagId: q.tagId } } });
  if (q.uploadedById) and.push({ createdById: q.uploadedById });
  if (q.from || q.to) and.push({ createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: new Date(q.to.getTime() + 86_399_999) } : {}) } });
  const LIMIT = 1500;
  const rows = await prisma.driveNode.findMany({ where: { AND: and }, select: itemSelect, orderBy: { workflowAt: 'asc' }, take: LIMIT + 1 });
  const items = await buildItems(ctx, rows.slice(0, LIMIT));
  res.json({ stages: WORKFLOW_STAGES, items: await withClient(ctx, items), truncated: rows.length > LIMIT });
});

// ─── Readiness of a client folder ─────────────────────────────────────

driveOrgRouter.get('/case-folders/:caseId/readiness', async (req, res) => {
  const caseId = idParam(req, 'caseId');
  const r = await caseReadiness(caseId);
  if (!r) throw notFound('CASE_NOT_FOUND');
  if (r.folderId) await requireNode(ctxOf(req), r.folderId, 'VIEW', { allowDeleted: true });
  res.json(r);
});

// ─── Automatic naming ─────────────────────────────────────────────────

driveOrgRouter.get('/naming', async (req, res) => {
  res.json({ ...(await getNamingSettings()), tokens: NAMING_TOKENS, docTypes: DOC_TYPES, canManage: isAdmin(req) });
});

driveOrgRouter.put('/naming', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(z.object({ enabled: z.boolean(), pattern: z.string().trim().min(3).max(120) }), req.body);
  const tokens = [...body.pattern.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  if (!tokens.length || tokens.some((t) => !NAMING_TOKENS.some((k) => k.toLowerCase() === t.toLowerCase()))) throw badRequest('INVALID_PATTERN');
  // eslint-disable-next-line no-control-regex
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(body.pattern.replace(/\{\w+\}/g, ''))) throw badRequest('INVALID_PATTERN');
  const before = await getNamingSettings();
  await saveNamingSettings(body);
  await audit(req, 'DRIVE_NAMING_UPDATED', undefined, { from: { ...before }, to: { ...body } });
  res.json({ ...body, tokens: NAMING_TOKENS, docTypes: DOC_TYPES, canManage: true });
});

driveOrgRouter.post('/naming/preview', async (req, res) => {
  const ctx = ctxOf(req);
  const { folderId } = parse(z.object({ folderId: z.string().min(1).max(120) }), req.body);
  const { node } = await requireNode(ctx, folderId, 'VIEW');
  if (node.kind !== 'FOLDER') throw badRequest('NOT_A_FOLDER');
  res.json(await tidyPreview(ctx, folderId));
});

driveOrgRouter.post('/naming/apply', async (req, res) => {
  const ctx = ctxOf(req);
  const body = parse(z.object({ folderId: z.string().min(1).max(120), ids: z.array(z.string().min(1).max(120)).max(5000).optional() }), req.body);
  const { node: folder } = await requireNode(ctx, body.folderId, 'EDIT');
  if (folder.kind !== 'FOLDER') throw badRequest('NOT_A_FOLDER');
  const { items } = await tidyPreview(ctx, body.folderId);
  const wanted = body.ids ? new Set(body.ids) : null;
  const results = await batch(
    items.filter((i) => !wanted || wanted.has(i.id)).map((i) => i.id),
    async (id) => {
      const row = items.find((i) => i.id === id)!;
      if (row.blocked) throw new HttpError(row.blocked === 'INSUFFICIENT_ACCESS' ? 403 : 423, row.blocked);
      await requireNode(ctx, id, 'EDIT');
      await assertNotLockedByOther(id, req.user!.id);
      if (await findSibling(row.parentId, row.to, id)) throw conflict('NAME_EXISTS');
      await prisma.driveNode.update({ where: { id }, data: { name: row.to } });
      await audit(req, 'DRIVE_RENAMED', `drive:${id}`, { from: row.from, to: row.to, auto: true });
      await logDriveActivity({ nodeId: id, folderId: row.parentId, actorId: req.user!.id, action: 'RENAME', name: row.to, meta: { from: row.from, to: row.to, kind: 'FILE', auto: true } });
      return { name: row.to };
    },
  );
  res.json({ results, ...counts(results) });
});

// ─── Smart folders (saved searches) ───────────────────────────────────

const smartBody = z.object({
  name: z.string().trim().min(1).max(120),
  shared: z.boolean().default(false),
  icon: z.string().trim().max(30).nullable().optional(),
  query: smartQuerySchema,
});

const smartView = (req: Request, f: { id: string; name: string; ownerId: string | null; shared: boolean; icon: string | null; query: Prisma.JsonValue; sortOrder: number }) => ({
  ...f,
  mine: f.ownerId === req.user!.id,
  canEdit: f.ownerId === req.user!.id || (f.shared && isAdmin(req)),
});

const loadSmart = async (req: Request, id: string, edit = false) => {
  const f = await prisma.driveSmartFolder.findUnique({ where: { id } });
  if (!f || (!f.shared && f.ownerId !== req.user!.id)) throw notFound('SMART_FOLDER_NOT_FOUND');
  if (edit && !smartView(req, f).canEdit) throw forbidden('INSUFFICIENT_ACCESS');
  return f;
};

driveOrgRouter.get('/smart-folders', async (req, res) => {
  await seedSmartFolders();
  const rows = await prisma.driveSmartFolder.findMany({
    where: { OR: [{ shared: true }, { ownerId: req.user!.id }] },
    select: { id: true, name: true, ownerId: true, shared: true, icon: true, query: true, sortOrder: true },
    orderBy: [{ shared: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ items: rows.map((r) => smartView(req, r)), canManageShared: isAdmin(req) });
});

driveOrgRouter.post('/smart-folders', async (req, res) => {
  const body = parse(smartBody, req.body);
  const created = await prisma.driveSmartFolder.create({
    data: { name: body.name, shared: body.shared, icon: body.icon ?? null, query: body.query as Prisma.InputJsonValue, ownerId: req.user!.id },
    select: { id: true, name: true, ownerId: true, shared: true, icon: true, query: true, sortOrder: true },
  });
  if (body.shared) await audit(req, 'DRIVE_SMART_FOLDER_CREATED', `driveSmart:${created.id}`, { name: body.name });
  res.status(201).json({ item: smartView(req, created) });
});

driveOrgRouter.patch('/smart-folders/:id', async (req, res) => {
  const f = await loadSmart(req, idParam(req), true);
  const body = parse(smartBody.partial(), req.body);
  const updated = await prisma.driveSmartFolder.update({
    where: { id: f.id },
    data: { name: body.name, shared: body.shared, icon: body.icon, ...(body.query ? { query: body.query as Prisma.InputJsonValue } : {}) },
    select: { id: true, name: true, ownerId: true, shared: true, icon: true, query: true, sortOrder: true },
  });
  res.json({ item: smartView(req, updated) });
});

driveOrgRouter.delete('/smart-folders/:id', async (req, res) => {
  const f = await loadSmart(req, idParam(req), true);
  await prisma.driveSmartFolder.delete({ where: { id: f.id } });
  if (f.shared) await audit(req, 'DRIVE_SMART_FOLDER_DELETED', `driveSmart:${f.id}`, { name: f.name });
  res.json({ ok: true });
});

/** Runs a smart folder live (access-filtered). A broken saved query answers an empty list. */
driveOrgRouter.get('/smart-folders/:id/items', async (req, res) => {
  const f = await loadSmart(req, idParam(req));
  const q = smartQuerySchema.safeParse(f.query);
  const ctx = ctxOf(req);
  const items = q.success ? await runQuery(ctx, q.data) : [];
  res.json({ folder: smartView(req, f), items: await withClient(ctx, items) });
});

/** Ad-hoc query (filters of the explorer, "save as smart folder" preview). */
driveOrgRouter.post('/query', async (req, res) => {
  const { query } = parse(z.object({ query: smartQuerySchema }), req.body);
  const ctx = ctxOf(req);
  res.json({ items: await withClient(ctx, await runQuery(ctx, query)) });
});

// ─── Duplicates report ────────────────────────────────────────────────

driveOrgRouter.get('/duplicates', requireMinRole('ADMIN'), async (req, res) => {
  const ctx = ctxOf(req);
  const { folderId } = parse(z.object({ folderId: z.string().min(1).max(120).optional() }), req.query);
  const scope: Prisma.DriveNodeWhereInput = { kind: 'FILE', deletedAt: null };
  if (folderId) {
    await requireNode(ctx, folderId, 'VIEW');
    scope.parentId = { in: await folderSubtreeIds(folderId) };
  }
  const groups = await prisma.driveNode.groupBy({
    by: ['contentHash'],
    where: { ...scope, contentHash: { not: null, notIn: [MISSING_HASH] } },
    _count: { _all: true },
    having: { contentHash: { _count: { gt: 1 } } },
    orderBy: { _count: { contentHash: 'desc' } },
    take: 200,
  });
  const hashes = groups.map((g) => g.contentHash!).filter(Boolean);
  const rows = hashes.length ? await prisma.driveNode.findMany({ where: { ...scope, contentHash: { in: hashes } }, select: { ...itemSelect, contentHash: true }, take: 3000 }) : [];
  const hashOf = new Map(rows.map((r) => [r.id, r.contentHash!]));
  const items = await buildItems(ctx, rows, { withLocation: true });
  const byHash = new Map<string, (DriveItem & { path: string })[]>();
  for (const i of items) {
    const h = hashOf.get(i.id)!;
    const path = ctx
      .chain(i.id)
      .slice(0, -1)
      .map((n) => n.name)
      .join('/');
    byHash.set(h, [...(byHash.get(h) ?? []), { ...i, path }]);
  }
  const out = [...byHash.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([hash, list]) => ({ hash, size: list[0].size ?? 0, items: list.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)) }))
    .sort((a, b) => b.items.length * b.size - a.items.length * a.size);
  const unchecked = await prisma.driveNode.count({ where: { ...scope, contentHash: null } });
  res.json({ groups: out, unchecked, wastedBytes: out.reduce((a, g) => a + g.size * (g.items.length - 1), 0) });
});

// ─── Final lock ───────────────────────────────────────────────────────

driveOrgRouter.post('/final', async (req, res) => {
  const ctx = ctxOf(req);
  const { ids } = parse(z.object({ ids: idList }), req.body);
  const results = await batch(ids, async (id) => {
    const { node } = await requireNode(ctx, id, 'EDIT');
    const changed = await setFinal(id, req.user!.id, true);
    if (changed.length) {
      await audit(req, 'DRIVE_FINAL_SET', `drive:${id}`, { name: node.name, kind: node.kind, nodes: changed.length });
      await logDriveActivity({ nodeId: id, folderId: node.parentId, actorId: req.user!.id, action: 'FINAL', name: node.name, meta: { kind: node.kind, nodes: changed.length } });
    }
    return { name: node.name };
  });
  res.json({ results, ...counts(results) });
});

driveOrgRouter.post('/unfinal', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const ctx = ctxOf(req);
  const { ids, reason } = parse(z.object({ ids: idList, reason: z.string().trim().min(3).max(500) }), req.body);
  const results = await batch(ids, async (id) => {
    const { node } = await requireNode(ctx, id, 'VIEW');
    const changed = await setFinal(id, null, false);
    if (changed.length) {
      await audit(req, 'DRIVE_FINAL_REMOVED', `drive:${id}`, { name: node.name, kind: node.kind, nodes: changed.length, reason });
      await logDriveActivity({ nodeId: id, folderId: node.parentId, actorId: req.user!.id, action: 'UNFINAL', name: node.name, meta: { kind: node.kind, nodes: changed.length, reason } });
    }
    return { name: node.name };
  });
  res.json({ results, ...counts(results) });
});

// ─── Folder templates (admins) ────────────────────────────────────────

const templateBody = z.object({
  name: z.string().trim().min(1).max(120),
  visaType: z.enum(VISA_TYPES as [VisaType, ...VisaType[]]).nullable().default(null),
  visaCategoryId: z.string().min(1).max(40).nullable().default(null),
  folders: z.array(z.string().max(300)).max(100),
  active: z.boolean().default(true),
});

const templateView = (t: { id: string; name: string; visaType: VisaType | null; visaCategoryId: string | null; folders: Prisma.JsonValue; active: boolean; updatedAt: Date }) => ({ ...t, folders: foldersOf(t.folders) });

driveOrgRouter.get('/folder-templates', requireMinRole('ADMIN'), async (_req, res) => {
  await seedFolderTemplates();
  const [items, categories] = await Promise.all([
    prisma.driveFolderTemplate.findMany({ orderBy: [{ visaType: 'asc' }, { name: 'asc' }] }),
    prisma.visaCategory.findMany({ select: { id: true, title: true, visaLabel: true }, orderBy: { visaLabel: 'asc' } }),
  ]);
  res.json({ items: items.map(templateView), categories, visaTypes: VISA_TYPES });
});

const checkCategory = async (id: string | null | undefined) => {
  if (id && !(await prisma.visaCategory.count({ where: { id } }))) throw badRequest('INVALID_CATEGORY');
};

driveOrgRouter.post('/folder-templates', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(templateBody, req.body);
  await checkCategory(body.visaCategoryId);
  const created = await prisma.driveFolderTemplate.create({ data: { ...body, folders: cleanFolderList(body.folders) } });
  await audit(req, 'DRIVE_TEMPLATE_CREATED', `driveTemplate:${created.id}`, { name: created.name });
  res.status(201).json({ item: templateView(created) });
});

driveOrgRouter.patch('/folder-templates/:id', requireMinRole('ADMIN'), async (req, res) => {
  const id = idParam(req);
  if (!(await prisma.driveFolderTemplate.count({ where: { id } }))) throw notFound('TEMPLATE_NOT_FOUND');
  const raw = (req.body ?? {}) as Record<string, unknown>;
  const body = parse(templateBody.partial(), req.body);
  await checkCategory(body.visaCategoryId);
  const updated = await prisma.driveFolderTemplate.update({
    where: { id },
    data: {
      name: body.name,
      active: body.active,
      ...('visaType' in raw ? { visaType: body.visaType ?? null } : {}),
      ...('visaCategoryId' in raw ? { visaCategoryId: body.visaCategoryId ?? null } : {}),
      ...(body.folders ? { folders: cleanFolderList(body.folders) } : {}),
    },
  });
  await audit(req, 'DRIVE_TEMPLATE_UPDATED', `driveTemplate:${id}`, { name: updated.name });
  res.json({ item: templateView(updated) });
});

driveOrgRouter.delete('/folder-templates/:id', requireMinRole('ADMIN'), async (req, res) => {
  const id = idParam(req);
  const t = await prisma.driveFolderTemplate.findUnique({ where: { id } });
  if (!t) throw notFound('TEMPLATE_NOT_FOUND');
  await prisma.driveFolderTemplate.delete({ where: { id } });
  await audit(req, 'DRIVE_TEMPLATE_DELETED', `driveTemplate:${id}`, { name: t.name });
  res.json({ ok: true });
});

/** Adds the missing template folders to every existing client folder (nothing is moved or deleted). */
driveOrgRouter.post('/folder-templates/apply-existing', requireMinRole('ADMIN'), async (req, res) => {
  const { templateId } = parse(z.object({ templateId: z.string().min(1).max(40).nullable().optional() }), req.body ?? {});
  const r = await applyTemplatesToExisting(templateId ?? null);
  await audit(req, 'DRIVE_TEMPLATE_APPLIED', templateId ? `driveTemplate:${templateId}` : undefined, r);
  res.json(r);
});
