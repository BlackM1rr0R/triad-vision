import fs from 'node:fs/promises';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import type { DriveAccess, Prisma, Role } from '@prisma/client';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { hasMinRole, requireMinRole } from '../middleware/auth.js';
import { decodeOriginalName, verifyUploadedFile } from '../middleware/upload.js';
import { HttpError, badRequest, conflict, forbidden, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { INLINE_MIME } from '../lib/fileCheck.js';
import { notifyUser } from '../lib/notifications.js';
import { ZipWriter } from '../lib/zip.js';
import { DriveAccessCtx, grantMatches, nodeLiteSelect, requireNode, type NodeLite } from '../lib/drive/access.js';
import { breadcrumb, buildItems, collectSubtree, itemSelect } from '../lib/drive/items.js';
import { LEVELS, RANK, allows, maxLevel, type Level } from '../lib/drive/levels.js';
import { STAGES } from '../lib/drive/cases.js';
import { checkName, findSibling, freeNameIn, pickFreeName, safeUploadName, siblingNames } from '../lib/drive/names.js';
import { SECTION_KEYS, sectionIds } from '../lib/drive/roots.js';
import { adoptUpload, copyIntoStore, removeStored, storagePath } from '../lib/drive/storage.js';
import { purgeNodes, restoreSubtree, softDelete, trashRootIds } from '../lib/drive/trash.js';
import { sharedText } from '../lib/drive/texts.js';
import { driveUpload } from '../lib/drive/upload.js';
import { deleteCaseDocument } from '../lib/caseDocDelete.js';
import { relinkRestoredPartnerFolder } from '../lib/drive/caseFolders.js';
import { CONTENT_LIMIT, contentSnippets, contentWhere } from '../lib/driveIntel/search.js';
import { logDriveActivity } from '../lib/driveCollab/activity.js';
import { assertNotLockedByOther } from '../lib/driveCollab/lock.js';
import { prepareDriveFile, publicQuality, scheduleUploadAnalysis } from '../lib/uploadAi/index.js';

/**
 * Team drive (/api/drive): ONE shared workspace ("Gemeinsame Dokumente") where every staff member works —
 * client folders (Anträge / Partner), the former personal files (Mitarbeiter) and everything else. Folders
 * and files keep Windows-like inherited permissions (see lib/drive/access.ts) for the rare restricted
 * folder; by default the whole team edits everything. Every endpoint resolves the caller's effective access
 * server-side; a node the caller may not VIEW answers 404.
 */
export const driveRouter = Router();
driveRouter.use(requireMinRole('STAFF'));

const ACCESS = z.enum(['VIEW', 'DOWNLOAD', 'EXPORT', 'EDIT', 'MANAGE']);
const COLORS = ['blue', 'green', 'amber', 'red', 'violet', 'pink', 'teal', 'slate'] as const;
const STAFF_ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];
const person = { select: { id: true, firstName: true, lastName: true } } as const;

const ctxOf = (req: Request) => new DriveAccessCtx({ id: req.user!.id, role: req.user!.role });
const idParam = (req: Request, key = 'id') => {
  const id = String(req.params[key] ?? '');
  if (!id || id.length > 120) throw notFound('NODE_NOT_FOUND');
  return id;
};
const idList = z.array(z.string().min(1).max(120)).min(1).max(500);

/**
 * System nodes (the sections, the clients workbook) are protected from renaming, moving and deleting —
 * except for super admins, who may do everything everywhere. The shared root itself is never renamed,
 * moved or deleted.
 */
const assertNotProtected = (ctx: DriveAccessCtx, n: NodeLite) => {
  if (!n.parentId) throw badRequest('SYSTEM_NODE');
  if (n.system && !ctx.isSuper) throw badRequest('SYSTEM_NODE');
};

/** Folders that accept new content. */
const assertWritableFolder = (n: NodeLite) => {
  if (n.kind !== 'FOLDER') throw badRequest('NOT_A_FOLDER');
};

const loadItem = async (ctx: DriveAccessCtx, id: string) => {
  const row = await prisma.driveNode.findUnique({ where: { id }, select: itemSelect });
  if (!row) throw notFound('NODE_NOT_FOUND');
  const [item] = await buildItems(ctx, [row]);
  if (!item) throw notFound('NODE_NOT_FOUND');
  return item;
};

/** Result of a batch action on one id; HttpErrors become per-item error codes. */
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

/** Sends a stored file with headers that stop a browser from ever running it. */
const sendStored = (res: Response, absPath: string, name: string, mime: string, inline: boolean) => {
  res.setHeader('Content-Type', mime.startsWith('text/') ? `${mime}; charset=utf-8` : mime);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(absPath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'FILE_MISSING_ON_DISK' });
  });
};

const wantsDownload = (req: Request) => req.query.download === '1' || req.query.download === 'true';

/** Who uploaded the given version of a file: the audit entry of that version, else the creator. */
const versionUploaders = async (nodeId: string, createdBy: { id: string; firstName: string; lastName: string } | null) => {
  const rows = await prisma.auditLog.findMany({
    where: { target: `drive:${nodeId}`, action: { in: ['DRIVE_FILE_VERSION_ADDED', 'DRIVE_FILE_VERSION_RESTORED'] } },
    select: { details: true, actor: person },
    orderBy: { createdAt: 'asc' },
  });
  const byVersion = new Map<number, typeof createdBy>();
  for (const r of rows) {
    const v = (r.details as { version?: number } | null)?.version;
    if (typeof v === 'number') byVersion.set(v, r.actor);
  }
  return (version: number) => (version > 1 && byVersion.has(version) ? byVersion.get(version)! : version === 1 ? createdBy : null);
};

// ─── Navigation ────────────────────────────────────────────────────────

/**
 * The shared workspace and its sections (Anträge, Partner, Mitarbeiter, …). A section a super admin deleted
 * is null until something needs it again; `sections` maps each live section key to its folder id (the
 * client recognises renamed sections by id).
 */
driveRouter.get('/roots', async (req, res) => {
  const ctx = ctxOf(req);
  const { sharedId, sections } = await sectionIds();
  const ids = [sharedId, ...Object.values(sections)];
  const rows = await prisma.driveNode.findMany({ where: { id: { in: ids } }, select: itemSelect });
  const items = await buildItems(ctx, rows);
  const pick = (id: string | undefined) => (id ? (items.find((i) => i.id === id) ?? null) : null);
  const visible: Record<string, string> = {};
  for (const k of SECTION_KEYS) if (pick(sections[k])) visible[k] = sections[k]!;
  res.json({
    shared: pick(sharedId),
    cases: pick(sections.cases),
    partners: pick(sections.partners),
    staff: pick(sections.staff),
    templates: pick(sections.templates),
    // Only super admins see the clients workbook folder (null for everyone else).
    clients: pick(sections.clients),
    tasks: pick(sections.tasks),
    sections: visible,
    limits: { maxFileBytes: config.drive.maxFileSize, trashDays: config.drive.trashDays },
  });
});

const listingQuery = z.object({ kind: z.enum(['FOLDER', 'FILE']).optional() });

/** Contents of a folder with its breadcrumb. */
driveRouter.get('/nodes/:id/children', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const q = parse(listingQuery, req.query);
  const { node: folderNode } = await requireNode(ctx, id, 'VIEW');
  if (folderNode.kind !== 'FOLDER') throw badRequest('NOT_A_FOLDER');
  const rows = await prisma.driveNode.findMany({
    where: { parentId: id, deletedAt: null, ...(q.kind ? { kind: q.kind } : {}) },
    select: itemSelect,
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    take: 20_000,
  });
  const [folder] = await buildItems(ctx, [await prisma.driveNode.findUniqueOrThrow({ where: { id }, select: itemSelect })]);
  const items = await buildItems(ctx, rows);
  res.json({ folder, ...breadcrumb(ctx, id), items });
});

/** Properties of one node: item, path, versions, folder totals, current uploader, case link. */
driveRouter.get('/nodes/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const { node } = await requireNode(ctx, id, 'VIEW', { allowDeleted: true });
  const row = await prisma.driveNode.findUniqueOrThrow({ where: { id }, select: { ...itemSelect, deletedBy: person } });
  const [item] = await buildItems(ctx, [row]);
  let versions: unknown[] = [];
  let modifiedBy = null;
  let totals = null;
  if (node.kind === 'FILE') {
    const uploaderOf = await versionUploaders(id, row.createdBy);
    versions = await prisma.driveFileVersion.findMany({
      where: { nodeId: id },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, size: true, mimeType: true, createdAt: true, uploadedBy: person },
    });
    modifiedBy = uploaderOf(row.version) ?? row.createdBy;
  } else {
    try {
      const sub = await collectSubtree([id], { size: true }, { limit: 20_000 });
      totals = {
        files: sub.filter((n) => n.kind === 'FILE').length,
        folders: sub.filter((n) => n.kind === 'FOLDER').length - 1,
        bytes: sub.reduce((a, n) => a + (n.size ?? 0), 0),
      };
    } catch {
      totals = null;
    }
  }
  res.json({
    item,
    ...breadcrumb(ctx, id),
    details: { versions, modifiedBy, totals, caseLink: item?.caseId ? `/admin/cases/${item.caseId}` : null, deletedAt: row.deletedAt, deletedBy: row.deletedBy },
  });
});

/** Top-most items shared with me that I cannot reach from a parent (only used when folders are restricted). */
driveRouter.get('/shared', async (req, res) => {
  const ctx = ctxOf(req);
  if (ctx.isSuper) {
    res.json({ items: [] });
    return;
  }
  const roles = STAFF_ROLES.filter((r) => hasMinRole(req.user!.role, r));
  const grants = await prisma.driveGrant.findMany({
    where: { OR: [{ userId: req.user!.id }, { role: { in: roles } }], node: { deletedAt: null, parentId: { not: null } } },
    select: { nodeId: true },
    take: 5000,
  });
  const rows = await prisma.driveNode.findMany({ where: { id: { in: [...new Set(grants.map((g) => g.nodeId))] } }, select: itemSelect });
  const items = await buildItems(ctx, rows, { withLocation: true });
  res.json({ items: items.filter((i) => !i.parentId || !ctx.level(i.parentId)).map((i) => ({ ...i, location: null })) });
});

driveRouter.get('/recent', async (req, res) => {
  const ctx = ctxOf(req);
  const rows = await prisma.driveNode.findMany({
    where: { kind: 'FILE', deletedAt: null },
    select: itemSelect,
    orderBy: { updatedAt: 'desc' },
    take: ctx.isSuper ? 60 : 500,
  });
  res.json({ items: (await buildItems(ctx, rows, { withLocation: true })).slice(0, 60) });
});

driveRouter.get('/starred', async (req, res) => {
  const ctx = ctxOf(req);
  const favs = await prisma.driveFavorite.findMany({ where: { userId: req.user!.id, node: { deletedAt: null } }, select: { nodeId: true }, take: 1000 });
  const rows = await prisma.driveNode.findMany({ where: { id: { in: favs.map((f) => f.nodeId) } }, select: itemSelect, orderBy: { name: 'asc' } });
  res.json({ items: await buildItems(ctx, rows, { withLocation: true }) });
});

const TYPE_MIME: Record<string, string[]> = {
  pdf: ['application/pdf'],
  word: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text', 'application/rtf', 'text/rtf'],
  excel: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.oasis.opendocument.spreadsheet', 'text/csv'],
  presentation: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  archive: ['application/zip', 'application/x-zip-compressed'],
  text: ['text/plain'],
};

const searchQuery = z.object({
  q: z.string().trim().min(1).max(100),
  type: z.enum(['folder', 'pdf', 'image', 'word', 'excel', 'presentation', 'archive', 'text']).optional(),
  modifiedFrom: z.coerce.date().optional(),
  modifiedTo: z.coerce.date().optional(),
  ownerId: z.string().max(40).optional(),
  /** '0' = names only; otherwise the indexed text of files is searched too (lib/driveIntel). */
  content: z.enum(['0', '1']).optional(),
});

/**
 * Name search across the shared workspace. Client folders are also found by case number and passport
 * number (they are named "Vorname Nachname · Pass-Nr. …"). Files are also found by their text (PDF text
 * layer, DOCX, XLSX, OCR — see jobs/driveIndex.ts); such rows carry `contentMatch: { snippet }`.
 */
driveRouter.get('/search', async (req, res) => {
  const ctx = ctxOf(req);
  const q = parse(searchQuery, req.query);
  const filters: Prisma.DriveNodeWhereInput = {
    deletedAt: null,
    system: false,
    ...(q.type === 'folder' ? { kind: 'FOLDER' } : q.type === 'image' ? { mimeType: { startsWith: 'image/' } } : q.type ? { mimeType: { in: TYPE_MIME[q.type] } } : {}),
    ...(q.modifiedFrom || q.modifiedTo ? { updatedAt: { ...(q.modifiedFrom ? { gte: q.modifiedFrom } : {}), ...(q.modifiedTo ? { lte: q.modifiedTo } : {}) } } : {}),
    ...(q.ownerId ? { createdById: q.ownerId } : {}),
  };
  const rows = await prisma.driveNode.findMany({ where: { ...filters, name: { contains: q.q } }, select: itemSelect, orderBy: { updatedAt: 'desc' }, take: 600 });
  const inContent = q.content !== '0' && q.type !== 'folder' ? contentWhere(q.q) : null;
  let contentIds = new Set<string>();
  if (inContent) {
    const hits = await prisma.driveNode.findMany({ where: { ...filters, ...inContent }, select: itemSelect, orderBy: { updatedAt: 'desc' }, take: CONTENT_LIMIT });
    contentIds = new Set(hits.map((h) => h.id));
    rows.push(...hits.filter((h) => !rows.some((r) => r.id === h.id)));
  }
  if (!q.type || q.type === 'folder') {
    const cases = await prisma.case.findMany({
      where: { driveFolderId: { not: null }, OR: [{ number: { contains: q.q } }, { client: { passportNumber: { contains: q.q } } }] },
      select: { driveFolderId: true },
      take: 50,
    });
    const extra = cases.map((c) => c.driveFolderId!).filter((fid) => !rows.some((r) => r.id === fid));
    if (extra.length) rows.unshift(...(await prisma.driveNode.findMany({ where: { id: { in: extra }, deletedAt: null }, select: itemSelect })));
  }
  const items = (await buildItems(ctx, rows, { withLocation: true })).slice(0, 300);
  const matches = contentIds.size ? await contentSnippets(items.filter((i) => contentIds.has(i.id)).map((i) => i.id), q.q) : new Map();
  res.json({ items: items.map((i) => (matches.has(i.id) ? { ...i, contentMatch: matches.get(i.id) } : i)) });
});

/** Storage usage. */
driveRouter.get('/stats', async (req, res) => {
  const ctx = ctxOf(req);
  const sum = (where: Prisma.DriveNodeWhereInput) => prisma.driveNode.aggregate({ where: { kind: 'FILE', ...where }, _count: { _all: true }, _sum: { size: true } });
  const out = (a: Awaited<ReturnType<typeof sum>>) => ({ files: a._count._all, bytes: a._sum.size ?? 0 });
  const [shared, trash] = await Promise.all([sum({ deletedAt: null }), sum({ deletedAt: { not: null } })]);
  let total = null;
  let versions = null;
  if (ctx.isSuper) {
    const [all, v] = await Promise.all([sum({}), prisma.driveFileVersion.aggregate({ _count: { _all: true }, _sum: { size: true } })]);
    total = out(all);
    versions = { files: v._count._all, bytes: v._sum.size ?? 0 };
  }
  res.json({ shared: out(shared), trash: out(trash), total, versions, limits: { maxFileBytes: config.drive.maxFileSize, trashDays: config.drive.trashDays } });
});

/** Staff picker for the share dialog. */
driveRouter.get('/people', async (req, res) => {
  const { q } = parse(z.object({ q: z.string().trim().max(100).optional() }), req.query);
  const people = await prisma.user.findMany({
    where: {
      role: { in: STAFF_ROLES },
      isActive: true,
      ...(q ? { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { email: { contains: q } }] } : {}),
    },
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 100,
  });
  res.json({ people });
});

// ─── Create, upload, download ─────────────────────────────────────────

driveRouter.post('/nodes/:id/folders', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const { node } = await requireNode(ctx, id, 'EDIT');
  assertWritableFolder(node);
  const { name: raw } = parse(z.object({ name: z.string().max(300) }), req.body);
  const name = checkName(raw, 'FOLDER');
  if (ctx.chain(id).length >= 40) throw badRequest('TOO_DEEP');
  if (await findSibling(id, name)) throw conflict('NAME_EXISTS');
  const created = await prisma.driveNode.create({
    data: { space: node.space, ownerId: node.ownerId, kind: 'FOLDER', name, parentId: id, createdById: req.user!.id },
    select: { id: true },
  });
  await logDriveActivity({ nodeId: created.id, folderId: id, actorId: req.user!.id, action: 'CREATE_FOLDER', name, meta: { kind: 'FOLDER' } });
  res.status(201).json({ item: await loadItem(ctxOf(req), created.id) });
});

/** Creates (or reuses) the folders of `rel` ("a/b/c") below `parentId`, for folder uploads. */
const ensureFolderPath = async (parent: NodeLite, rel: string, userId: string) => {
  const parts = rel.replace(/\\/g, '/').split('/').filter((p) => p.length > 0);
  if (parts.length > 20) throw badRequest('TOO_DEEP');
  let cur = parent;
  for (const raw of parts) {
    const name = checkName(raw, 'FOLDER');
    const existing = await findSibling(cur.id, name);
    if (existing && existing.kind !== 'FOLDER') throw conflict('NAME_EXISTS');
    const next = existing
      ? await prisma.driveNode.findUniqueOrThrow({ where: { id: existing.id }, select: nodeLiteSelect })
      : await prisma.driveNode.create({
          data: { space: cur.space, ownerId: cur.ownerId, kind: 'FOLDER', name, parentId: cur.id, createdById: userId },
          select: nodeLiteSelect,
        });
    cur = next;
  }
  return cur.id;
};

const uploadBody = z.object({
  onConflict: z.enum(['fail', 'rename', 'replace']).default('fail'),
  relativeDir: z.string().max(2000).optional(),
});

/**
 * Upload one file into a folder (multipart field `file`). Name clashes: `fail` (409 NAME_EXISTS with the
 * existing id, the client then asks), `rename` ("name (2).pdf") or `replace` (new version of the file).
 * `relativeDir` creates sub-folders on the way (folder uploads).
 */
driveRouter.post(
  '/nodes/:id/files',
  async (req, res, next) => {
    // Access is checked before a single byte is spooled to disk.
    const ctx = ctxOf(req);
    const id = idParam(req);
      const { node } = await requireNode(ctx, id, 'EDIT');
    assertWritableFolder(node);
    res.locals.driveFolder = node;
    next();
  },
  driveUpload.single('file'),
  async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('FILE_REQUIRED');
    let storedKey: string | null = null;
    try {
      await verifyUploadedFile(file);
      const body = parse(uploadBody, req.body);
      const user = req.user!;
      let target = res.locals.driveFolder as NodeLite;
      if (body.relativeDir) {
        const targetId = await ensureFolderPath(target, body.relativeDir, user.id);
        target = (await requireNode(ctxOf(req), targetId, 'EDIT')).node;
      }
      const name = safeUploadName(decodeOriginalName(file.originalname));
      const clash = await findSibling(target.id, name);
      let finalName = name;
      if (clash && clash.kind === 'FILE' && body.onConflict === 'replace') {
        const ctx = ctxOf(req);
        await requireNode(ctx, clash.id, 'EDIT');
        await assertNotLockedByOther(clash.id, user.id);
        const current = await prisma.driveNode.findUniqueOrThrow({
          where: { id: clash.id },
          select: { id: true, version: true, storageKey: true, mimeType: true, size: true, createdBy: person },
        });
        const uploaderOf = await versionUploaders(current.id, current.createdBy);
        storedKey = await adoptUpload(file.path);
        const next = current.version + 1;
        await prisma.$transaction([
          prisma.driveFileVersion.create({
            data: {
              nodeId: current.id,
              version: current.version,
              storageKey: current.storageKey!,
              mimeType: current.mimeType ?? 'application/octet-stream',
              size: current.size ?? 0,
              uploadedById: uploaderOf(current.version)?.id ?? null,
            },
          }),
          prisma.driveNode.update({ where: { id: current.id }, data: { storageKey: storedKey, mimeType: file.mimetype, size: file.size, version: next } }),
        ]);
        await audit(req, 'DRIVE_FILE_VERSION_ADDED', `drive:${current.id}`, { name, version: next, size: file.size });
        await logDriveActivity({ nodeId: current.id, folderId: target.id, actorId: user.id, action: 'NEW_VERSION', name, meta: { version: next, size: file.size, kind: 'FILE' } });
        // Smart uploads (files in client folders): scan quality now, recognition in the background; never throws.
        const prep = await prepareDriveFile(current.id);
        const quality = publicQuality(prep?.quality ?? null);
        res.status(201).json({ item: await loadItem(ctxOf(req), current.id), replaced: true, quality });
        if (prep) scheduleUploadAnalysis({ driveNodeId: current.id });
        return;
      }
      if (clash) {
        if (body.onConflict === 'fail') {
          await fs.unlink(file.path).catch(() => undefined);
          res.status(409).json({ error: 'NAME_EXISTS', existingId: clash.id, existingKind: clash.kind });
          return;
        }
        finalName = await freeNameIn(target.id, name, true);
      }
      storedKey = await adoptUpload(file.path);
      const created = await prisma.driveNode.create({
        data: {
          space: target.space,
          ownerId: target.ownerId,
          kind: 'FILE',
          name: finalName,
          parentId: target.id,
          storageKey: storedKey,
          mimeType: file.mimetype,
          size: file.size,
          createdById: user.id,
        },
        select: { id: true },
      });
      storedKey = null;
      await audit(req, 'DRIVE_FILE_UPLOADED', `drive:${created.id}`, { name: finalName, size: file.size, parentId: target.id });
      await logDriveActivity({ nodeId: created.id, folderId: target.id, actorId: user.id, action: 'UPLOAD', name: finalName, meta: { size: file.size, kind: 'FILE' } });
      // Smart uploads (files in client folders): scan quality now, recognition in the background; never throws.
      const prep = await prepareDriveFile(created.id);
      const quality = publicQuality(prep?.quality ?? null);
      res.status(201).json({ item: await loadItem(ctxOf(req), created.id), replaced: false, quality });
      if (prep) scheduleUploadAnalysis({ driveNodeId: created.id });
    } catch (err) {
      await fs.unlink(file.path).catch(() => undefined);
      // A file adopted into the store but never recorded must not linger.
      if (storedKey) await removeStored([storedKey]).catch(() => undefined);
      throw err;
    }
  },
);

/** Preview (VIEW, inline-safe types only) or download (DOWNLOAD). */
driveRouter.get('/nodes/:id/content', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const download = wantsDownload(req);
  const { node, level } = await requireNode(ctx, id, 'VIEW');
  if (node.kind !== 'FILE') throw badRequest('NOT_A_FILE');
  const row = await prisma.driveNode.findUniqueOrThrow({ where: { id }, select: { storageKey: true, mimeType: true, name: true } });
  const mime = row.mimeType ?? 'application/octet-stream';
  const inline = !download && INLINE_MIME.has(mime);
  if (!inline && !allows(level, 'DOWNLOAD')) throw new HttpError(403, 'INSUFFICIENT_ACCESS');
  // Explicit staff downloads feed the bulk-download security rule (lib/aiMgmt/security).
  if (download && hasMinRole(req.user!.role, 'STAFF')) void audit(req, 'DRIVE_DOWNLOADED', `drive:${id}`, { name: row.name });
  sendStored(res, storagePath(row.storageKey!), row.name, mime, inline);
});

// ─── Rename, colour, move, copy ───────────────────────────────────────

driveRouter.patch('/nodes/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = parse(z.object({ name: z.string().max(300).optional(), color: z.enum(COLORS).nullable().optional() }), req.body);
  const { node } = await requireNode(ctx, id, body.color !== undefined ? 'MANAGE' : 'EDIT');
  if (body.name !== undefined && node.name !== body.name) {
    await requireNode(ctx, id, 'EDIT');
    assertNotProtected(ctx, node);
    const name = checkName(body.name, node.kind === 'FILE' ? 'FILE' : 'FOLDER');
    if (node.kind === 'FILE' && extOf(name) !== extOf(node.name)) throw badRequest('EXTENSION_CHANGE_NOT_ALLOWED');
    if (node.parentId && (await findSibling(node.parentId, name, id))) throw conflict('NAME_EXISTS');
    await assertNotLockedByOther(id, req.user!.id);
    await prisma.driveNode.update({ where: { id }, data: { name } });
    await audit(req, 'DRIVE_RENAMED', `drive:${id}`, { from: node.name, to: name });
    await logDriveActivity({ nodeId: id, folderId: node.parentId, actorId: req.user!.id, action: 'RENAME', name, meta: { from: node.name, to: name, kind: node.kind } });
  }
  if (body.color !== undefined) {
    if (node.kind !== 'FOLDER') throw badRequest('NOT_A_FOLDER');
    await prisma.driveNode.update({ where: { id }, data: { color: body.color } });
  }
  res.json({ item: await loadItem(ctxOf(req), id) });
});

const extOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i <= 0 ? '' : name.slice(i).toLowerCase();
};

const moveBody = z.object({ ids: idList, targetId: z.string().min(1).max(120) });

/**
 * Prepares moving nodes into a folder: EDIT on the target; per node EDIT, not a system folder, not into
 * itself. Names that clash in the target become "name (2)".
 */
const mover = async (ctx: DriveAccessCtx, targetId: string) => {
  const { node: target } = await requireNode(ctx, targetId, 'EDIT');
  assertWritableFolder(target);
  const taken = await siblingNames(targetId);
  const targetChain = new Set(ctx.chain(targetId).map((n) => n.id));
  return async (id: string) => {
    const { node } = await requireNode(ctx, id, 'EDIT');
    assertNotProtected(ctx, node);
    if (targetChain.has(id)) throw badRequest('INTO_ITSELF');
    if (node.parentId === targetId) return { name: node.name, from: node.parentId, moved: false };
    await assertNotLockedByOther(id, ctx.user.id);
    const name = pickFreeName(taken, node.name, node.kind === 'FILE');
    await prisma.driveNode.update({ where: { id }, data: { parentId: targetId, name } });
    await logDriveActivity({ nodeId: id, folderId: targetId, actorId: ctx.user.id, action: 'MOVE', name, meta: { fromId: node.parentId, fromName: node.parentId ? (ctx.nodes.get(node.parentId)?.name ?? null) : null, toId: targetId, toName: target.name, kind: node.kind, ...(name !== node.name ? { oldName: node.name } : {}) } });
    if (node.space !== target.space || node.ownerId !== target.ownerId) {
      const sub = await collectSubtree([id], { id: true }, { includeDeleted: true });
      await prisma.driveNode.updateMany({ where: { id: { in: sub.map((s) => s.id) } }, data: { space: target.space, ownerId: target.ownerId } });
    }
    return { name, from: node.parentId, moved: true };
  };
};

/** Moves nodes into a folder (drag & drop, cut / paste). One audit entry per node. */
driveRouter.post('/move', async (req, res) => {
  const ctx = ctxOf(req);
  const { ids, targetId } = parse(moveBody, req.body);
  const moveOne = await mover(ctx, targetId);
  const results = await batch(ids, async (id) => {
    const r = await moveOne(id);
    if (r.moved) await audit(req, 'DRIVE_MOVED', `drive:${id}`, { name: r.name, from: r.from, to: targetId });
    return { name: r.name };
  });
  res.json({ results });
});

const copySelect = { ...nodeLiteSelect, storageKey: true, mimeType: true, size: true } satisfies Prisma.DriveNodeSelect;

/**
 * Copies nodes (files need DOWNLOAD, folders EXPORT) into a folder (EDIT). Copies get fresh storage
 * keys, no grants (they inherit from the target), no version history and no link to a case document.
 */
driveRouter.post('/copy', async (req, res) => {
  const ctx = ctxOf(req);
  const { ids, targetId } = parse(moveBody, req.body);
  const { node: target } = await requireNode(ctx, targetId, 'EDIT');
  assertWritableFolder(target);
  const taken = await siblingNames(targetId);
  const targetChain = new Set(ctx.chain(targetId).map((n) => n.id));
  const me = req.user!.id;
  const base = { space: target.space, ownerId: target.ownerId, createdById: me };

  const copyFile = async (parentId: string, name: string, src: string, mimeType: string, size: number) => {
    const key = await copyIntoStore(src);
    try {
      await prisma.driveNode.create({ data: { ...base, kind: 'FILE', name, parentId, storageKey: key, mimeType, size } });
    } catch (err) {
      await removeStored([key]);
      throw err;
    }
  };
  const newFolder = async (parentId: string, name: string) =>
    (await prisma.driveNode.create({ data: { ...base, kind: 'FOLDER', name, parentId }, select: { id: true } })).id;

  const results = await batch(ids, async (id) => {
    const { node, level } = await requireNode(ctx, id, 'VIEW');
    if (!allows(level, node.kind === 'FILE' ? 'DOWNLOAD' : 'EXPORT')) throw new HttpError(403, 'INSUFFICIENT_ACCESS');
    if (node.kind === 'FOLDER' && targetChain.has(id)) throw badRequest('INTO_ITSELF');
    const sub = await collectSubtree([id], copySelect, { limit: 5000 });
    ctx.add(sub as NodeLite[]);
    const newIds = new Map<string, string>();
    for (const n of sub) {
      const isRoot = n.id === id;
      const parentNew = isRoot ? targetId : newIds.get(n.parentId!);
      if (!parentNew) continue; // parent folder was not visible: skip its contents
      if (n.kind === 'FOLDER') {
        if (!allows(ctx.level(n.id), 'VIEW')) continue;
        newIds.set(n.id, await newFolder(parentNew, isRoot ? pickFreeName(taken, n.name, false) : n.name));
      } else if (allows(ctx.level(n.id), 'DOWNLOAD') && n.storageKey) {
        await copyFile(parentNew, isRoot ? pickFreeName(taken, n.name, true) : n.name, storagePath(n.storageKey), n.mimeType ?? 'application/octet-stream', n.size ?? 0).catch((err) => {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        });
      }
    }
    await audit(req, 'DRIVE_COPIED', `drive:${id}`, { name: node.name, to: targetId, nodes: sub.length });
    await logDriveActivity({ nodeId: newIds.get(id) ?? null, folderId: targetId, actorId: me, action: 'COPY', name: node.name, meta: { sourceId: id, fromId: node.parentId, toId: targetId, toName: target.name, kind: node.kind } });
    return { name: node.name };
  });
  res.json({ results });
});

// ─── Recycle bin ──────────────────────────────────────────────────────

const CASE_DOC_ID = new RegExp(`^(?:doc:([a-z0-9]{10,40})|case:([a-z0-9]{10,40})(?::(${STAGES.join('|')}))?)$`);

/**
 * POST /api/drive/case-documents/delete { ids: ['doc:…' | 'case:…' | 'case:…:STAGE'] } — super admins
 * permanently delete case documents (single documents, a whole case or one stage). Their drive copies go too.
 */
driveRouter.post('/case-documents/delete', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const { ids } = parse(z.object({ ids: idList }), req.body);
  const results = await batch(ids, async (id) => {
    const m = CASE_DOC_ID.exec(id);
    if (!m) throw badRequest('NOT_A_CASE_DOCUMENT');
    if (m[1]) return { name: (await deleteCaseDocument(req, m[1])).name };
    const caseId = m[2];
    // A case or a stage: every document in it goes (whatever its review status); the case stays.
    const docs = await prisma.document.findMany({ where: { caseId, ...(m[3] ? { stage: m[3] as (typeof STAGES)[number] } : {}) }, select: { id: true } });
    if (!docs.length && !(await prisma.case.count({ where: { id: caseId } }))) throw notFound('NODE_NOT_FOUND');
    for (const d of docs) await deleteCaseDocument(req, d.id);
    return { name: id, deleted: docs.length };
  });
  res.json({ results });
});

/** Moves one node (and its live subtree) to the recycle bin; system folders only for super admins, never the root. */
const trashOne = async (ctx: DriveAccessCtx, id: string, at: Date) => {
  const { node } = await requireNode(ctx, id, 'EDIT', { allowDeleted: true });
  if (node.deletedAt) return { name: node.name, kind: node.kind, nodes: 0 };
  assertNotProtected(ctx, node);
  await assertNotLockedByOther(id, ctx.user.id);
  const nodes = await softDelete(id, ctx.user.id, at);
  if (nodes) await logDriveActivity({ nodeId: id, folderId: node.parentId, actorId: ctx.user.id, action: 'DELETE', name: node.name, meta: { kind: node.kind, nodes } });
  return { name: node.name, kind: node.kind, nodes };
};

driveRouter.post('/trash', async (req, res) => {
  const ctx = ctxOf(req);
  const { ids } = parse(z.object({ ids: idList }), req.body);
  const at = new Date();
  const results = await batch(ids, async (id) => {
    const r = await trashOne(ctx, id, at);
    if (r.nodes) await audit(req, 'DRIVE_TRASHED', `drive:${id}`, { name: r.name, kind: r.kind, nodes: r.nodes });
    return { name: r.name };
  });
  res.json({ results });
});

// ─── Bulk actions (multi-select in the explorer) ─────────────────────

const counts = (results: BatchResult[]) => ({ ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });

/** POST /api/drive/bulk/delete { ids } — moves many items to the recycle bin; one audit entry with the counts. */
driveRouter.post('/bulk/delete', async (req, res) => {
  const ctx = ctxOf(req);
  const { ids } = parse(z.object({ ids: idList }), req.body);
  const at = new Date();
  let nodes = 0;
  const results = await batch(ids, async (id) => {
    const r = await trashOne(ctx, id, at);
    nodes += r.nodes;
    return { name: r.name };
  });
  const c = counts(results);
  await audit(req, 'DRIVE_BULK_TRASHED', undefined, { requested: results.length, deleted: c.ok, failed: c.failed, nodes, ids: ids.slice(0, 50) });
  res.json({ results, ...c });
});

/** POST /api/drive/bulk/move { ids, targetId } — moves many items into one folder; one audit entry with the counts. */
driveRouter.post('/bulk/move', async (req, res) => {
  const ctx = ctxOf(req);
  const { ids, targetId } = parse(moveBody, req.body);
  const moveOne = await mover(ctx, targetId);
  const results = await batch(ids, async (id) => ({ name: (await moveOne(id)).name }));
  const c = counts(results);
  await audit(req, 'DRIVE_BULK_MOVED', `drive:${targetId}`, { requested: results.length, moved: c.ok, failed: c.failed, ids: ids.slice(0, 50) });
  res.json({ results, ...c });
});

/** Trash roots of the shared workspace (everyone works in one place, so everyone sees the one bin). */
driveRouter.get('/trash', async (req, res) => {
  const ctx = ctxOf(req);
  const ids = await trashRootIds({});
  const rows = await prisma.driveNode.findMany({ where: { id: { in: ids } }, select: { ...itemSelect, deletedBy: person }, orderBy: { deletedAt: 'desc' } });
  const items = await buildItems(ctx, rows, { withLocation: true });
  const extra = new Map(rows.map((r) => [r.id, r]));
  res.json({
    items: items.map((i) => ({ ...i, deletedAt: extra.get(i.id)!.deletedAt, deletedBy: extra.get(i.id)!.deletedBy })),
    trashDays: config.drive.trashDays,
    canPurge: hasMinRole(req.user!.role, 'ADMIN'),
  });
});

driveRouter.post('/restore', async (req, res) => {
  const ctx = ctxOf(req);
  const { ids } = parse(z.object({ ids: idList }), req.body);
  const results = await batch(ids, async (id) => {
    const { node } = await requireNode(ctx, id, 'EDIT', { allowDeleted: true });
    if (!node.deletedAt) throw badRequest('NOT_IN_TRASH');
    const parent = node.parentId ? ctx.nodes.get(node.parentId) : undefined;
    if (parent?.deletedAt) throw conflict(parent.deletedAt.getTime() === node.deletedAt.getTime() ? 'NOT_A_TRASH_ROOT' : 'PARENT_IN_TRASH');
    let name = node.name;
    if (node.parentId && (await findSibling(node.parentId, node.name, id))) {
      name = await freeNameIn(node.parentId, node.name, node.kind === 'FILE');
      await prisma.driveNode.update({ where: { id }, data: { name } });
    }
    const count = await restoreSubtree(id, node.deletedAt);
    // A partner folder that came back as "Name (2)" joins the partner's live folder (one folder per partner).
    if (node.kind === 'FOLDER' && name !== node.name) await relinkRestoredPartnerFolder(id);
    await audit(req, 'DRIVE_RESTORED', `drive:${id}`, { name, nodes: count });
    await logDriveActivity({ nodeId: id, folderId: node.parentId, actorId: req.user!.id, action: 'RESTORE', name, meta: { kind: node.kind, nodes: count } });
    return { name };
  });
  res.json({ results });
});

/** Deleting for good: admins and above (or a MANAGE holder of a restricted folder). */
const purgeAllowed = async (ctx: DriveAccessCtx, id: string) => {
  const { node, level } = await requireNode(ctx, id, 'EDIT', { allowDeleted: true });
  if (!node.deletedAt) throw badRequest('NOT_IN_TRASH');
  if (!hasMinRole(ctx.user.role, 'ADMIN') && level !== 'MANAGE') throw forbidden('INSUFFICIENT_ACCESS');
  return node;
};

driveRouter.post('/purge', async (req, res) => {
  const ctx = ctxOf(req);
  const { ids } = parse(z.object({ ids: idList }), req.body);
  const results = await batch(ids, async (id) => {
    const node = await purgeAllowed(ctx, id);
    const r = await purgeNodes([id]);
    await audit(req, 'DRIVE_PURGED', `drive:${id}`, { name: node.name, kind: node.kind, ...r });
    await logDriveActivity({ nodeId: id, folderId: node.parentId, actorId: req.user!.id, action: 'PURGE', name: node.name, meta: { kind: node.kind, nodes: r.nodes } });
    return { name: node.name };
  });
  res.json({ results });
});

/** Empty the bin (admins and above). */
driveRouter.delete('/trash', requireMinRole('ADMIN'), async (req, res) => {
  const ctx = ctxOf(req);
  const ids = await trashRootIds({});
  let purged = 0;
  let bytes = 0;
  for (const id of ids) {
    let purgedNode: NodeLite;
    try {
      purgedNode = await purgeAllowed(ctx, id);
    } catch (err) {
      if (err instanceof HttpError) continue;
      throw err;
    }
    const r = await purgeNodes([id]);
    await logDriveActivity({ nodeId: id, folderId: purgedNode.parentId, actorId: req.user!.id, action: 'PURGE', name: purgedNode.name, meta: { kind: purgedNode.kind, nodes: r.nodes, emptied: true } });
    purged += r.nodes;
    bytes += r.bytes;
  }
  await audit(req, 'DRIVE_TRASH_EMPTIED', undefined, { roots: ids.length, nodes: purged, bytes });
  res.json({ ok: true, nodes: purged, bytes });
});

// ─── ZIP export ───────────────────────────────────────────────────────

const exportSelect = { ...nodeLiteSelect, storageKey: true, updatedAt: true } satisfies Prisma.DriveNodeSelect;

/**
 * Streams a ZIP of the selected nodes (`?ids=a,b,c`). Only files the caller has EXPORT on are included,
 * and only below folders they can see; nothing exportable → 403 before any byte is sent.
 */
driveRouter.get('/export', async (req, res) => {
  const ctx = ctxOf(req);
  const raw = parse(z.object({ ids: z.string().min(1).max(60_000) }), req.query).ids;
  const ids = parse(idList, [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))]);
  const entries: { rel: string; abs: string; mtime: Date }[] = [];
  const used = new Set<string>();
  const add = (rel: string, abs: string, mtime: Date) => {
    let name = rel;
    for (let i = 2; used.has(name.toLowerCase()); i++) {
      const dot = rel.lastIndexOf('.');
      name = dot > rel.lastIndexOf('/') + 1 ? `${rel.slice(0, dot)} (${i})${rel.slice(dot)}` : `${rel} (${i})`;
    }
    used.add(name.toLowerCase());
    entries.push({ rel: name, abs, mtime });
  };
  let archive = '';

  for (const id of ids) {
    const { node, level } = await requireNode(ctx, id, 'VIEW');
    archive ||= node.name;
    if (node.kind === 'FILE') {
      if (!allows(level, 'EXPORT')) continue;
      const row = await prisma.driveNode.findUniqueOrThrow({ where: { id }, select: { storageKey: true, updatedAt: true } });
      add(node.name, storagePath(row.storageKey!), row.updatedAt);
      continue;
    }
    const sub = await collectSubtree([id], exportSelect, { limit: 20_000 });
    ctx.add(sub as NodeLite[]);
    const relOf = new Map<string, string>([[id, `${node.name}/`]]);
    for (const n of sub) {
      if (n.id === id) continue;
      const parentRel = relOf.get(n.parentId!);
      if (parentRel === undefined) continue;
      if (n.kind === 'FOLDER') {
        if (allows(ctx.level(n.id), 'VIEW')) relOf.set(n.id, `${parentRel}${n.name}/`);
      } else if (n.storageKey && allows(ctx.level(n.id), 'EXPORT')) {
        add(parentRel + n.name, storagePath(n.storageKey), n.updatedAt);
      }
    }
  }
  if (entries.length === 0) throw new HttpError(403, 'NOTHING_TO_EXPORT');

  const fileName = `${ids.length === 1 ? safeUploadName(archive) : `drive-${new Date().toISOString().slice(0, 10)}`}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  const zip = new ZipWriter(res);
  let written = 0;
  for (const e of entries) {
    // Check first: a missing file must be skipped before its header is written.
    const ok = await fs.stat(e.abs).then((s) => s.isFile()).catch(() => false);
    if (!ok) continue;
    await zip.addFile(e.rel, e.abs, e.mtime);
    written++;
  }
  await zip.finish();
  await audit(req, 'DRIVE_EXPORTED', ids.length === 1 ? `drive:${ids[0]}` : undefined, { ids: ids.slice(0, 50), files: written });
});

// ─── Versions ─────────────────────────────────────────────────────────

driveRouter.get('/nodes/:id/versions', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  await requireNode(ctx, id, 'VIEW');
  const versions = await prisma.driveFileVersion.findMany({
    where: { nodeId: id },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, size: true, mimeType: true, createdAt: true, uploadedBy: person },
  });
  res.json({ versions });
});

const loadVersion = async (req: Request, need: DriveAccess) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const { node } = await requireNode(ctx, id, need);
  const v = await prisma.driveFileVersion.findFirst({ where: { id: String(req.params.versionId), nodeId: id } });
  if (!v) throw notFound('VERSION_NOT_FOUND');
  return { node, v };
};

driveRouter.get('/nodes/:id/versions/:versionId/content', async (req, res) => {
  const { node, v } = await loadVersion(req, 'DOWNLOAD');
  const dot = node.name.lastIndexOf('.');
  const name = dot > 0 ? `${node.name.slice(0, dot)} (v${v.version})${node.name.slice(dot)}` : `${node.name} (v${v.version})`;
  sendStored(res, storagePath(v.storageKey), name, v.mimeType, false);
});

/** Makes an old version the current one again (as a new version; history is kept). */
driveRouter.post('/nodes/:id/versions/:versionId/restore', async (req, res) => {
  const { node, v } = await loadVersion(req, 'EDIT');
  await assertNotLockedByOther(node.id, req.user!.id);
  const current = await prisma.driveNode.findUniqueOrThrow({
    where: { id: node.id },
    select: { id: true, version: true, storageKey: true, mimeType: true, size: true, createdBy: person },
  });
  const uploaderOf = await versionUploaders(current.id, current.createdBy);
  const key = await copyIntoStore(storagePath(v.storageKey));
  const next = current.version + 1;
  try {
    await prisma.$transaction([
      prisma.driveFileVersion.create({
        data: {
          nodeId: current.id,
          version: current.version,
          storageKey: current.storageKey!,
          mimeType: current.mimeType ?? 'application/octet-stream',
          size: current.size ?? 0,
          uploadedById: uploaderOf(current.version)?.id ?? null,
        },
      }),
      prisma.driveNode.update({ where: { id: current.id }, data: { storageKey: key, mimeType: v.mimeType, size: v.size, version: next } }),
    ]);
  } catch (err) {
    await removeStored([key]);
    throw err;
  }
  await audit(req, 'DRIVE_FILE_VERSION_RESTORED', `drive:${current.id}`, { name: node.name, version: next, from: v.version });
  await logDriveActivity({ nodeId: current.id, folderId: node.parentId, actorId: req.user!.id, action: 'NEW_VERSION', name: node.name, meta: { version: next, restoredFrom: v.version, kind: 'FILE' } });
  res.json({ item: await loadItem(ctxOf(req), current.id) });
});

// ─── Favourites ───────────────────────────────────────────────────────

driveRouter.put('/nodes/:id/star', async (req, res) => {
  const id = idParam(req);
  await requireNode(ctxOf(req), id, 'VIEW');
  await prisma.driveFavorite.upsert({ where: { userId_nodeId: { userId: req.user!.id, nodeId: id } }, create: { userId: req.user!.id, nodeId: id }, update: {} });
  res.json({ ok: true, starred: true });
});

driveRouter.delete('/nodes/:id/star', async (req, res) => {
  const id = idParam(req);
  await prisma.driveFavorite.deleteMany({ where: { userId: req.user!.id, nodeId: id } });
  res.json({ ok: true, starred: false });
});

// ─── Permissions ──────────────────────────────────────────────────────

const userSelect = { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true } as const;

/**
 * Who has access to a node: its own grants and the inherited ones (with the folder they come from), plus
 * the implicit holders (super admins, the owner of an old personal tree).
 */
driveRouter.get('/nodes/:id/access', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const r = await requireNode(ctx, id, 'VIEW', { allowDeleted: true });
  const chainNodes: NodeLite[] = ctx.chain(id);
  const level: Level = r.level;
  const nodeInfo = { id, name: r.node.name, kind: r.node.kind, space: r.node.space, system: r.node.system, inheritPermissions: r.node.inheritPermissions, parentId: r.node.parentId, virtual: false };
  const assignedStaff = null;
  const entries: { grantId: string; userId: string | null; role: Role | null; access: DriveAccess; inherited: boolean; from: { id: string; name: string; space: string; system: boolean } | null }[] = [];
  for (let i = chainNodes.length - 1; i >= 0; i--) {
    const n = chainNodes[i];
    const inherited = i !== chainNodes.length - 1;
    for (const g of n.grants) {
      entries.push({ grantId: g.id, userId: g.userId, role: g.role, access: g.access, inherited, from: inherited ? { id: n.id, name: n.name, space: n.space, system: n.system } : null });
    }
    if (!n.inheritPermissions) break;
  }
  const userIds = [...new Set(entries.map((e) => e.userId).filter((u): u is string => !!u))];
  const owner = chainNodes[0]?.space === 'PERSONAL' && chainNodes[0].ownerId ? chainNodes[0].ownerId : null;
  const users = await prisma.user.findMany({ where: { id: { in: owner ? [...userIds, owner] : userIds } }, select: userSelect });
  const byId = new Map(users.map((u) => [u.id, u]));
  res.json({
    node: nodeInfo,
    myAccess: level,
    canManage: level === 'MANAGE',
    entries: entries.map((e) => ({ ...e, user: e.userId ? (byId.get(e.userId) ?? null) : null })),
    implicit: { superAdmins: true, owner: owner ? (byId.get(owner) ?? null) : null, assignedStaff },
  });
});

const grantBody = z
  .object({ userId: z.string().min(1).max(40).optional(), role: z.enum(['STAFF', 'ADMIN']).optional(), access: ACCESS })
  .refine((b) => !!b.userId !== !!b.role, { message: 'exactly one of userId / role' });

/** Adds or changes a grant (MANAGE). Never above the granter's own level. */
driveRouter.put('/nodes/:id/grants', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = parse(grantBody, req.body);
  const { node, level } = await requireNode(ctx, id, 'MANAGE');
  if (RANK[body.access] > RANK[level!]) throw forbidden('LEVEL_TOO_HIGH');
  let target: { id: string; role: Role; isActive: boolean; locale: import('@prisma/client').Locale } | null = null;
  if (body.userId) {
    target = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, role: true, isActive: true, locale: true } });
    if (!target || !target.isActive || !hasMinRole(target.role, 'STAFF')) throw badRequest('INVALID_USER');
    if (target.role === 'SUPER_ADMIN' || (node.space === 'PERSONAL' && node.ownerId === target.id)) throw badRequest('USER_ALWAYS_HAS_ACCESS');
  }
  const where = body.userId ? { nodeId_userId: { nodeId: id, userId: body.userId } } : { nodeId_role: { nodeId: id, role: body.role! } };
  const existing = await prisma.driveGrant.findUnique({ where, select: { access: true } });
  await prisma.driveGrant.upsert({
    where,
    create: { nodeId: id, userId: body.userId ?? null, role: body.role ?? null, access: body.access, grantedById: req.user!.id },
    update: { access: body.access, grantedById: req.user!.id },
  });
  await audit(req, 'DRIVE_GRANT_SET', `drive:${id}`, {
    name: node.name,
    ...(body.userId ? { userId: body.userId } : { role: body.role }),
    access: body.access,
    previous: existing?.access ?? null,
  });
  if (target && !existing && target.id !== req.user!.id) {
    const by = `${req.user!.firstName} ${req.user!.lastName}`.trim();
    const text = sharedText(target.locale, { by, name: node.name, access: body.access, folder: node.kind === 'FOLDER' });
    await notifyUser(target.id, { type: 'DRIVE_SHARED', title: text.title, body: text.body, link: `/workspace/drive/f/${id}`, ctaLabel: text.cta });
  }
  res.json({ ok: true });
});

driveRouter.delete('/nodes/:id/grants/:grantId', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const { node } = await requireNode(ctx, id, 'MANAGE');
  const grant = await prisma.driveGrant.findFirst({ where: { id: String(req.params.grantId), nodeId: id } });
  if (!grant) throw notFound('GRANT_NOT_FOUND');
  await prisma.driveGrant.delete({ where: { id: grant.id } });
  await audit(req, 'DRIVE_GRANT_REMOVED', `drive:${id}`, { name: node.name, userId: grant.userId, role: grant.role, access: grant.access });
  res.json({ ok: true });
});

/**
 * Turns inheritance from the parent on or off (MANAGE). Turning it off can copy the inherited grants as
 * explicit ones (like Windows); the person making the change never locks themselves out.
 */
driveRouter.patch('/nodes/:id/inheritance', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = parse(z.object({ inherit: z.boolean(), copyInherited: z.boolean().optional() }), req.body);
  const { node } = await requireNode(ctx, id, 'MANAGE');
  if (!node.parentId) throw badRequest('ROOT_HAS_NO_PARENT');
  if (node.inheritPermissions === body.inherit) {
    res.json({ ok: true, inheritPermissions: body.inherit, copied: 0 });
    return;
  }
  let copied = 0;
  if (!body.inherit) {
    if (body.copyInherited) {
      // Best inherited level per principal, from the parent chain.
      const best = new Map<string, { userId: string | null; role: Role | null; access: DriveAccess }>();
      const chain = ctx.chain(node.parentId);
      for (let i = chain.length - 1; i >= 0; i--) {
        for (const g of chain[i].grants) {
          const key = g.userId ? `u:${g.userId}` : `r:${g.role}`;
          const prev = best.get(key);
          best.set(key, { userId: g.userId, role: g.role, access: maxLevel(prev?.access, g.access)! });
        }
        if (!chain[i].inheritPermissions) break;
      }
      const own = new Map(node.grants.map((g) => [g.userId ? `u:${g.userId}` : `r:${g.role}`, g]));
      for (const [key, g] of best) {
        const mine = own.get(key);
        if (mine && RANK[mine.access] >= RANK[g.access]) continue;
        if (mine) await prisma.driveGrant.update({ where: { id: mine.id }, data: { access: g.access, grantedById: req.user!.id } });
        else await prisma.driveGrant.create({ data: { nodeId: id, userId: g.userId, role: g.role, access: g.access, grantedById: req.user!.id } });
        copied++;
      }
    }
    await prisma.driveNode.update({ where: { id }, data: { inheritPermissions: false } });
    // Keep the actor in control of what they just changed.
    const after = ctxOf(req);
    await after.load([id]);
    if (after.level(id) !== 'MANAGE') {
      await prisma.driveGrant.upsert({
        where: { nodeId_userId: { nodeId: id, userId: req.user!.id } },
        create: { nodeId: id, userId: req.user!.id, access: 'MANAGE', grantedById: req.user!.id },
        update: { access: 'MANAGE' },
      });
    }
  } else {
    await prisma.driveNode.update({ where: { id }, data: { inheritPermissions: true } });
  }
  await audit(req, 'DRIVE_INHERITANCE_CHANGED', `drive:${id}`, { name: node.name, inherit: body.inherit, copied });
  res.json({ ok: true, inheritPermissions: body.inherit, copied });
});

// ─── Super admin: who can access what ─────────────────────────────────

/** Every folder (and individually shared file) a staff member can open, with the level and its source. */
driveRouter.get('/overview/:userId', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: String(req.params.userId) }, select: userSelect });
  if (!target || !hasMinRole(target.role, 'STAFF')) throw notFound('USER_NOT_FOUND');
  const casesId = (await sectionIds()).sections.cases ?? null;
  const ctx = new DriveAccessCtx({ id: target.id, role: target.role });
  const rows = await prisma.driveNode.findMany({
    where: { deletedAt: null, OR: [{ kind: 'FOLDER' }, { grants: { some: {} } }] },
    select: nodeLiteSelect,
    take: 50_000,
  });
  ctx.add(rows);
  const items = rows
    .filter((n) => ctx.level(n.id))
    .map((n) => {
      const own = n.grants.filter((g) => grantMatches(g, ctx.user));
      const source = ctx.isSuper ? 'super' : n.space === 'PERSONAL' && n.ownerId === target.id ? 'owner' : own.length ? (own.some((g) => g.userId) ? 'user' : 'role') : 'inherited';
      return { id: n.id, parentId: n.parentId, name: n.name, kind: n.kind, space: n.space, system: n.system, ownerId: n.ownerId, inheritPermissions: n.inheritPermissions, level: ctx.level(n.id), source };
    });
  const assigned = await prisma.case.count({ where: { assignedStaffId: target.id } });
  res.json({ user: target, items, cases: { rootId: casesId, rootLevel: casesId ? ctx.level(casesId) : null, assignedCases: assigned }, levels: LEVELS });
});

/** Security audit trail (super admin), filterable by action prefix. */
driveRouter.get('/audit', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const q = parse(z.object({ page: z.coerce.number().int().min(1).default(1), action: z.string().max(60).optional() }), req.query);
  const pageSize = 50;
  const where = q.action ? { action: { startsWith: q.action } } : {};
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * pageSize,
      take: pageSize,
      include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  res.json({ items, total, pageSize });
});
