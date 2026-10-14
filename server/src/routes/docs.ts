import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import type { DocAccess } from '@prisma/client';
import { prisma } from '../db.js';
import { requireMinRole } from '../middleware/auth.js';
import { decodeOriginalName, verifyUploadedFile, workspaceUpload } from '../middleware/upload.js';
import { HttpError, badRequest, conflict, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { INLINE_MIME } from '../lib/fileCheck.js';
import { ZipWriter } from '../lib/zip.js';
import { config } from '../config.js';
import {
  absPath,
  accessFor,
  allows,
  checkSegment,
  childPrefix,
  createCompany,
  dirExists,
  ensureDir,
  listCompanies,
  listFolders,
  loadFolder,
  normalizePath,
  ownerSelect,
  safeFileName,
} from '../lib/docs.js';

export const docsRouter = Router();
docsRouter.use(requireMinRole('STAFF'));

const ACCESS = z.enum(['VIEW', 'DOWNLOAD', 'EDIT']);
const pathParam = z.string().max(2000).optional();

const fileOut = (f: { id: string; path: string; name: string; mimeType: string; size: number; version: number; createdAt: Date; updatedAt: Date; uploadedBy?: unknown }) => ({
  id: f.id,
  path: f.path,
  name: f.name,
  mimeType: f.mimeType,
  size: f.size,
  version: f.version,
  previewable: INLINE_MIME.has(f.mimeType),
  createdAt: f.createdAt,
  updatedAt: f.updatedAt,
  uploadedBy: f.uploadedBy,
});

// ─── Folders ───────────────────────────────────────────────────────────

docsRouter.get('/folders', async (req, res) => {
  res.json({
    folders: await listFolders(req.user!),
    /** Standard layout every workspace follows: <root>/<company>/<docs>. */
    structure: { rootDir: config.docs.rootDir, companyDocsDir: config.docs.companyDocsDir, maxFileBytes: config.docs.maxFileSize },
  });
});

/**
 * The whole directory tree of a workspace in one call (for an explorer-style sidebar): every
 * directory with its direct file count/size, so the UI can expand folders without extra requests.
 */
docsRouter.get('/folders/:id/tree', async (req, res) => {
  const { folder, access } = await loadFolder(String(req.params.id), req.user!, 'VIEW');
  const [dirs, files] = await Promise.all([
    prisma.docDir.findMany({ where: { folderId: folder.id }, select: { path: true, createdAt: true }, orderBy: { path: 'asc' } }),
    prisma.docFile.groupBy({ by: ['path'], where: { folderId: folder.id }, _count: { _all: true }, _sum: { size: true }, _max: { updatedAt: true } }),
  ]);
  const byPath = new Map(files.map((f) => [f.path, { files: f._count._all, bytes: f._sum.size ?? 0, lastUploadAt: f._max.updatedAt }]));
  const node = (path: string) => ({
    path,
    name: path === '' ? folder.slug : path.slice(path.lastIndexOf('/') + 1),
    files: byPath.get(path)?.files ?? 0,
    bytes: byPath.get(path)?.bytes ?? 0,
    lastUploadAt: byPath.get(path)?.lastUploadAt ?? null,
    fixed: path === config.docs.rootDir || /^[^/]+\/[^/]+\/[^/]+$/.test(path) && path.startsWith(`${config.docs.rootDir}/`) && path.endsWith(`/${config.docs.companyDocsDir}`),
  });
  res.json({
    folder: { id: folder.id, slug: folder.slug, owner: folder.owner },
    access,
    root: node(''),
    dirs: dirs.map((d) => ({ ...node(d.path), parent: d.path.includes('/') ? d.path.slice(0, d.path.lastIndexOf('/')) : '', createdAt: d.createdAt })),
    totals: { files: files.reduce((a, f) => a + f._count._all, 0), bytes: files.reduce((a, f) => a + (f._sum.size ?? 0), 0) },
  });
});

// ─── Companies (firms) inside a workspace ──────────────────────────────

docsRouter.get('/folders/:id/companies', async (req, res) => {
  const { folder, access } = await loadFolder(String(req.params.id), req.user!, 'VIEW');
  res.json({ access, rootDir: config.docs.rootDir, companies: await listCompanies(folder) });
});

/** Creates <root>/<company>/<docs> in one go (EDIT). */
docsRouter.post('/folders/:id/companies', async (req, res) => {
  const { folder } = await loadFolder(String(req.params.id), req.user!, 'EDIT');
  const { name } = parse(z.object({ name: z.string().max(150) }), req.body);
  const company = await createCompany(folder, name);
  await audit(req, 'DOC_COMPANY_CREATED', `folder:${folder.id}`, { name: company.name });
  res.status(201).json({ company });
});

/** Lists one directory of a workspace: sub-directories and files. */
docsRouter.get('/folders/:id', async (req, res) => {
  const { folder, access } = await loadFolder(String(req.params.id), req.user!, 'VIEW');
  const rel = normalizePath(parse(pathParam, req.query.path));
  if (!(await dirExists(folder, rel))) throw notFound('DIR_NOT_FOUND');

  const prefix = childPrefix(rel);
  const [dirs, files] = await Promise.all([
    prisma.docDir.findMany({ where: { folderId: folder.id, path: { startsWith: prefix } }, orderBy: { path: 'asc' } }),
    prisma.docFile.findMany({
      where: { folderId: folder.id, path: rel },
      orderBy: { name: 'asc' },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    }),
  ]);
  // Only direct children of `rel` (DocDir holds every nested path).
  const children = dirs
    .filter((d) => !d.path.slice(prefix.length).includes('/'))
    .map((d) => ({ name: d.path.slice(prefix.length), path: d.path, createdAt: d.createdAt }));
  res.json({
    folder: { id: folder.id, slug: folder.slug, owner: folder.owner },
    access,
    path: rel,
    dirs: children,
    files: files.map(fileOut),
  });
});

// ─── Directories ───────────────────────────────────────────────────────

docsRouter.post('/folders/:id/dirs', async (req, res) => {
  const { folder } = await loadFolder(String(req.params.id), req.user!, 'EDIT');
  const body = parse(z.object({ path: pathParam, name: z.string().max(150) }), req.body);
  const parent = normalizePath(body.path);
  const name = checkSegment(body.name, 'DIR');
  if (!(await dirExists(folder, parent))) throw notFound('DIR_NOT_FOUND');
  const rel = parent ? `${parent}/${name}` : name;
  if (await dirExists(folder, rel)) throw conflict('DIR_EXISTS');
  await ensureDir(folder, rel);
  res.status(201).json({ dir: { name, path: rel } });
});

/** Rename a directory (moves everything inside it on disk and in the database). */
docsRouter.patch('/folders/:id/dirs', async (req, res) => {
  const { folder } = await loadFolder(String(req.params.id), req.user!, 'EDIT');
  const body = parse(z.object({ path: z.string().min(1).max(2000), name: z.string().max(150) }), req.body);
  const rel = normalizePath(body.path);
  if (!rel || !(await dirExists(folder, rel))) throw notFound('DIR_NOT_FOUND');
  const name = checkSegment(body.name, 'DIR');
  const parent = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  const target = parent ? `${parent}/${name}` : name;
  if (target === rel) {
    res.json({ dir: { name, path: rel } });
    return;
  }
  if (await dirExists(folder, target)) throw conflict('DIR_EXISTS');

  await fs.rename(absPath(folder, rel), absPath(folder, target));
  try {
    await prisma.$transaction(async (tx) => {
      const dirs = await tx.docDir.findMany({ where: { folderId: folder.id, OR: [{ path: rel }, { path: { startsWith: `${rel}/` } }] } });
      for (const d of dirs) {
        await tx.docDir.update({ where: { id: d.id }, data: { path: target + d.path.slice(rel.length) } });
      }
      const files = await tx.docFile.findMany({ where: { folderId: folder.id, OR: [{ path: rel }, { path: { startsWith: `${rel}/` } }] } });
      for (const f of files) {
        await tx.docFile.update({ where: { id: f.id }, data: { path: target + f.path.slice(rel.length) } });
      }
    });
  } catch (err) {
    await fs.rename(absPath(folder, target), absPath(folder, rel)).catch(() => undefined);
    throw err;
  }
  await audit(req, 'DOC_DIR_RENAMED', `folder:${folder.id}`, { from: rel, to: target });
  res.json({ dir: { name, path: target } });
});

/** Deletes an empty directory. */
docsRouter.delete('/folders/:id/dirs', async (req, res) => {
  const { folder } = await loadFolder(String(req.params.id), req.user!, 'EDIT');
  const rel = normalizePath(parse(z.string().min(1).max(2000), req.query.path));
  if (!rel || !(await dirExists(folder, rel))) throw notFound('DIR_NOT_FOUND');
  const [files, subdirs] = await Promise.all([
    prisma.docFile.count({ where: { folderId: folder.id, OR: [{ path: rel }, { path: { startsWith: `${rel}/` } }] } }),
    prisma.docDir.count({ where: { folderId: folder.id, path: { startsWith: `${rel}/` } } }),
  ]);
  if (files || subdirs) throw conflict('DIR_NOT_EMPTY');
  await prisma.docDir.delete({ where: { folderId_path: { folderId: folder.id, path: rel } } });
  await fs.rm(absPath(folder, rel), { recursive: true, force: true });
  await audit(req, 'DOC_DIR_DELETED', `folder:${folder.id}`, { path: rel });
  res.json({ ok: true });
});

// ─── Files ─────────────────────────────────────────────────────────────

/**
 * Upload into a directory. The file is spooled under a random name, content-checked, then moved
 * to <workspace>/<path>/<name>. `replace=true` overwrites an existing file (new version).
 */
docsRouter.post('/folders/:id/files', workspaceUpload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('FILE_REQUIRED');
  try {
    const { folder } = await loadFolder(String(req.params.id), req.user!, 'EDIT');
    const body = parse(z.object({ path: pathParam, replace: z.enum(['true', 'false']).optional() }), req.body);
    const rel = normalizePath(body.path);
    if (!(await dirExists(folder, rel))) throw notFound('DIR_NOT_FOUND');
    await verifyUploadedFile(file);
    const name = safeFileName(decodeOriginalName(file.originalname));
    const dest = absPath(folder, rel, name);

    const existing = await prisma.docFile.findUnique({ where: { folderId_path_name: { folderId: folder.id, path: rel, name } } });
    if (existing && body.replace !== 'true') throw conflict('FILE_EXISTS');

    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(file.path, dest);
    const data = { mimeType: file.mimetype, size: file.size, uploadedById: req.user!.id };
    const saved = existing
      ? await prisma.docFile.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } }, include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } } })
      : await prisma.docFile.create({ data: { ...data, folderId: folder.id, path: rel, name }, include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } } });
    await audit(req, existing ? 'DOC_FILE_REPLACED' : 'DOC_FILE_UPLOADED', `docfile:${saved.id}`, { folder: folder.slug, path: rel, name, size: file.size });
    res.status(201).json({ file: fileOut(saved) });
  } catch (err) {
    await fs.unlink(file.path).catch(() => undefined);
    throw err;
  }
});

const loadFile = async (fileId: string, user: NonNullable<import('express').Request['user']>, need: DocAccess) => {
  const f = await prisma.docFile.findUnique({ where: { id: fileId }, include: { folder: true } });
  if (!f) throw notFound('FILE_NOT_FOUND');
  const access = await accessFor(f.folder, user);
  if (access === null) throw notFound('FILE_NOT_FOUND');
  if (!allows(access, need)) throw new HttpError(403, 'INSUFFICIENT_ACCESS');
  return { file: f, access };
};

/** Preview (VIEW) or download (DOWNLOAD). Non-previewable types always need DOWNLOAD. */
docsRouter.get('/files/:id', async (req, res) => {
  const download = req.query.download === '1' || req.query.download === 'true';
  const { file } = await loadFile(String(req.params.id), req.user!, 'VIEW');
  const inline = !download && INLINE_MIME.has(file.mimeType);
  if (!inline) {
    const { access } = await loadFile(file.id, req.user!, 'DOWNLOAD');
    void access;
  }
  const abs = absPath(file.folder, file.path, file.name);
  res.setHeader('Content-Type', file.mimeType.startsWith('text/') ? `${file.mimeType}; charset=utf-8` : file.mimeType);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(abs, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'FILE_MISSING_ON_DISK' });
  });
});

/** Rename and/or move a file. */
docsRouter.patch('/files/:id', async (req, res) => {
  const body = parse(z.object({ name: z.string().max(150).optional(), path: pathParam }), req.body);
  const { file } = await loadFile(String(req.params.id), req.user!, 'EDIT');
  const name = body.name !== undefined ? checkSegment(body.name, 'FILE') : file.name;
  const rel = body.path !== undefined ? normalizePath(body.path) : file.path;
  if (path.extname(name).toLowerCase() !== path.extname(file.name).toLowerCase()) throw badRequest('EXTENSION_CHANGE_NOT_ALLOWED');
  if (name === file.name && rel === file.path) {
    res.json({ file: fileOut(file) });
    return;
  }
  if (!(await dirExists(file.folder, rel))) throw notFound('DIR_NOT_FOUND');
  const clash = await prisma.docFile.findUnique({ where: { folderId_path_name: { folderId: file.folderId, path: rel, name } } });
  if (clash) throw conflict('FILE_EXISTS');

  const from = absPath(file.folder, file.path, file.name);
  const to = absPath(file.folder, rel, name);
  await fs.rename(from, to);
  try {
    const updated = await prisma.docFile.update({ where: { id: file.id }, data: { name, path: rel }, include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } } });
    await audit(req, 'DOC_FILE_MOVED', `docfile:${file.id}`, { from: `${file.path}/${file.name}`, to: `${rel}/${name}` });
    res.json({ file: fileOut(updated) });
  } catch (err) {
    await fs.rename(to, from).catch(() => undefined);
    throw err;
  }
});

docsRouter.delete('/files/:id', async (req, res) => {
  const { file } = await loadFile(String(req.params.id), req.user!, 'EDIT');
  await prisma.docFile.delete({ where: { id: file.id } });
  await fs.unlink(absPath(file.folder, file.path, file.name)).catch(() => undefined);
  await audit(req, 'DOC_FILE_DELETED', `docfile:${file.id}`, { folder: file.folder.slug, path: file.path, name: file.name });
  res.json({ ok: true });
});

// ─── Export (zip of a directory tree) ──────────────────────────────────

docsRouter.get('/folders/:id/export', async (req, res) => {
  const { folder } = await loadFolder(String(req.params.id), req.user!, 'DOWNLOAD');
  const rel = normalizePath(parse(pathParam, req.query.path));
  if (!(await dirExists(folder, rel))) throw notFound('DIR_NOT_FOUND');
  const files = await prisma.docFile.findMany({
    where: { folderId: folder.id, ...(rel ? { OR: [{ path: rel }, { path: { startsWith: `${rel}/` } }] } : {}) },
    orderBy: [{ path: 'asc' }, { name: 'asc' }],
  });
  const archiveName = `${folder.slug}${rel ? '-' + rel.replace(/\//g, '-') : ''}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(archiveName)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  const zip = new ZipWriter(res);
  const base = childPrefix(rel);
  for (const f of files) {
    const entry = (f.path ? `${f.path}/` : '') + f.name;
    try {
      await zip.addFile(entry.slice(base.length), absPath(folder, f.path, f.name), f.updatedAt);
    } catch (err) {
      // A file missing on disk must not abort the whole export.
      if ((err as { code?: string }).code !== 'ENOENT') throw err;
    }
  }
  await zip.finish();
  await audit(req, 'DOC_FOLDER_EXPORTED', `folder:${folder.id}`, { path: rel, files: files.length });
});

// ─── Permissions (super admin only) ───────────────────────────────────

docsRouter.get('/folders/:id/grants', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const { folder } = await loadFolder(String(req.params.id), req.user!, 'VIEW');
  const [grants, staff] = await Promise.all([
    prisma.docGrant.findMany({ where: { folderId: folder.id }, include: { user: { select: ownerSelect } }, orderBy: { createdAt: 'asc' } }),
    prisma.user.findMany({
      where: { role: { in: ['STAFF', 'ADMIN'] }, isActive: true, id: { not: folder.ownerId } },
      select: ownerSelect,
      orderBy: { firstName: 'asc' },
    }),
  ]);
  res.json({
    folder: { id: folder.id, slug: folder.slug, owner: folder.owner },
    grants: grants.map((g) => ({ user: g.user, access: g.access, updatedAt: g.updatedAt })),
    /** Staff who could be given access (owner and super admin excluded: they always have everything). */
    candidates: staff,
  });
});

docsRouter.put('/folders/:id/grants/:userId', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const { folder } = await loadFolder(String(req.params.id), req.user!, 'VIEW');
  const { access } = parse(z.object({ access: ACCESS.nullable() }), req.body);
  const userId = String(req.params.userId);
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!target || target.role === 'CLIENT') throw badRequest('INVALID_USER');
  if (target.id === folder.ownerId || target.role === 'SUPER_ADMIN') throw badRequest('USER_ALWAYS_HAS_ACCESS');

  if (access === null) {
    await prisma.docGrant.deleteMany({ where: { folderId: folder.id, userId } });
  } else {
    await prisma.docGrant.upsert({
      where: { folderId_userId: { folderId: folder.id, userId } },
      create: { folderId: folder.id, userId, access, grantedById: req.user!.id },
      update: { access, grantedById: req.user!.id },
    });
  }
  await audit(req, 'DOC_GRANT_CHANGED', `folder:${folder.id}`, { userId, access });
  res.json({ ok: true, access });
});

// ─── Audit trail (super admin) ────────────────────────────────────────

docsRouter.get('/audit', requireMinRole('SUPER_ADMIN'), async (req, res) => {
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
