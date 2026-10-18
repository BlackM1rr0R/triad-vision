import fs from 'node:fs/promises';
import type { Request, Response } from 'express';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { decodeOriginalName, verifyUploadedFile } from '../middleware/upload.js';
import { HttpError, badRequest, limiter, notFound, parse } from '../lib/http.js';
import { notifyUser } from '../lib/notifications.js';
import { ZipWriter } from '../lib/zip.js';
import { collectSubtree } from '../lib/drive/items.js';
import { freeNameIn, safeUploadName } from '../lib/drive/names.js';
import { adoptUpload, removeStored, storagePath } from '../lib/drive/storage.js';
import { driveUpload } from '../lib/drive/upload.js';
import { logDriveActivity } from '../lib/driveCollab/activity.js';
import { TOKEN_RE, UNLOCK_TTL_MS, childRef, linkStatus, sha256, signUnlock, verifyUnlock } from '../lib/driveCollab/share.js';
import { collabTexts } from '../lib/driveCollab/texts.js';

/**
 * Public side of external share links (/api/share/:token), no account needed:
 *
 *   GET  /:token[?dir=<ref>]      what is shared (name, size, type, expiry; folder listing one level)
 *   POST /:token/unlock {password} → signed key (cookie + body) for password-protected links
 *   GET  /:token/download          the file, or a ZIP of the shared folder
 *   GET  /:token/download/:ref     one file (or a ZIP of a sub-folder) inside the shared folder
 *   POST /:token/upload            upload into the shared folder (when the link allows it)
 *
 * Unknown, revoked and expired links all answer 404 without saying which. Every opening, download,
 * upload and wrong password is written to DriveShareAccess.
 */
export const shareRouter = Router();

shareRouter.use(limiter({ windowMs: 60 * 1000, limit: 60, skip: () => config.isTest }));
const unlockLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 10, skip: () => config.isTest });
const uploadLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 40, skip: () => config.isTest });

const COOKIE = 'tv_share';
const cookiePath = (token: string) => `/api/share/${token}`;

const nodeSelect = { id: true, kind: true, name: true, mimeType: true, size: true, storageKey: true, deletedAt: true, updatedAt: true, parentId: true, space: true, ownerId: true } as const;

/** The live link of a token, or 404 (never says whether it existed, expired or was revoked). */
const resolve = async (req: Request) => {
  const token = String(req.params.token ?? '');
  if (!TOKEN_RE.test(token)) throw notFound('SHARE_NOT_FOUND');
  const link = await prisma.driveShareLink.findUnique({ where: { tokenHash: sha256(token) }, include: { node: { select: nodeSelect } } });
  if (!link || link.revokedAt || link.expiresAt.getTime() <= Date.now() || link.node.deletedAt) throw notFound('SHARE_NOT_FOUND');
  const key = (req.get('x-share-key') ?? (req.cookies?.[COOKIE] as string | undefined) ?? (typeof req.query.key === 'string' ? req.query.key : undefined)) || null;
  const unlocked = !link.passwordHash || verifyUnlock(link.id, key);
  return { token, link, unlocked };
};
type Resolved = Awaited<ReturnType<typeof resolve>>;

const logAccess = async (req: Request, linkId: string, action: 'VIEW' | 'DOWNLOAD' | 'UPLOAD' | 'BAD_PASSWORD', fileName?: string | null) => {
  try {
    await prisma.driveShareAccess.create({
      data: { linkId, action, fileName: fileName ? fileName.slice(0, 255) : null, ip: (req.ip ?? '').slice(0, 64) || null, userAgent: (req.get('user-agent') ?? '').slice(0, 255) || null },
    });
  } catch (err) {
    console.error('[share] access log failed', err);
  }
};

const requireUnlocked = (r: Resolved) => {
  if (!r.unlocked) throw new HttpError(403, 'PASSWORD_REQUIRED');
};

const subtreeSelect = { name: true, mimeType: true, size: true, storageKey: true, updatedAt: true } as const;
type SubRow = { id: string; kind: 'FILE' | 'FOLDER'; parentId: string | null; name: string; mimeType: string | null; size: number | null; storageKey: string | null; updatedAt: Date };

/** The live subtree of a shared folder (root included) with each node's opaque ref. */
const sharedTree = async (r: Resolved) => {
  const rows = (await collectSubtree([r.link.node.id], subtreeSelect, { limit: 10_000 })) as unknown as SubRow[];
  const byRef = new Map<string, SubRow>();
  for (const n of rows) if (n.id !== r.link.node.id) byRef.set(childRef(r.link.id, n.id), n);
  return { rows, byRef };
};

const entry = (linkId: string, n: SubRow) => ({ id: childRef(linkId, n.id), name: n.name, kind: n.kind, size: n.kind === 'FILE' ? (n.size ?? 0) : null, mimeType: n.kind === 'FILE' ? n.mimeType : null, updatedAt: n.updatedAt });

const dirRef = (req: Request) => (typeof req.query.dir === 'string' ? req.query.dir : '');

const downloadsLeft = (l: Resolved['link']) => (l.maxDownloads === null ? null : Math.max(0, l.maxDownloads - l.downloads));

shareRouter.get('/:token', async (req, res) => {
  const r = await resolve(req);
  const { link } = r;
  const base = { name: link.node.name, kind: link.node.kind, expiresAt: link.expiresAt, needsPassword: !!link.passwordHash, unlocked: r.unlocked };
  if (!r.unlocked) {
    if (!dirRef(req)) await logAccess(req, link.id, 'VIEW');
    res.json(base);
    return;
  }
  const out: Record<string, unknown> = {
    ...base,
    size: link.node.kind === 'FILE' ? (link.node.size ?? 0) : null,
    mimeType: link.node.kind === 'FILE' ? link.node.mimeType : null,
    allowUpload: link.allowUpload && link.node.kind === 'FOLDER',
    maxDownloads: link.maxDownloads,
    downloadsLeft: downloadsLeft(link),
    exhausted: linkStatus(link) === 'exhausted',
    maxFileBytes: config.drive.maxFileSize,
  };
  if (link.node.kind === 'FOLDER') {
    const { rows, byRef } = await sharedTree(r);
    let dir: SubRow | undefined = rows.find((n) => n.id === link.node.id);
    const ref = dirRef(req);
    if (ref) {
      dir = byRef.get(ref);
      if (!dir || dir.kind !== 'FOLDER') throw notFound('SHARE_ITEM_NOT_FOUND');
    }
    const byId = new Map(rows.map((n) => [n.id, n]));
    const path: { id: string | null; name: string }[] = [];
    for (let cur = dir; cur && cur.id !== link.node.id; cur = cur.parentId ? byId.get(cur.parentId) : undefined) path.unshift({ id: childRef(link.id, cur.id), name: cur.name });
    path.unshift({ id: null, name: link.node.name });
    const children = rows
      .filter((n) => n.parentId === dir!.id)
      .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'FOLDER' ? -1 : 1))
      .map((n) => entry(link.id, n));
    out.path = path;
    out.entries = children;
    out.totals = { files: rows.filter((n) => n.kind === 'FILE').length, bytes: rows.reduce((a, n) => a + (n.kind === 'FILE' ? (n.size ?? 0) : 0), 0) };
  }
  if (!dirRef(req)) await logAccess(req, link.id, 'VIEW');
  res.json(out);
});

shareRouter.post('/:token/unlock', unlockLimiter, async (req, res) => {
  const { password } = parse(z.object({ password: z.string().max(200) }), req.body);
  const r = await resolve(req);
  if (!r.link.passwordHash) {
    res.json({ ok: true, key: null });
    return;
  }
  if (!(await bcrypt.compare(password, r.link.passwordHash))) {
    await logAccess(req, r.link.id, 'BAD_PASSWORD');
    throw new HttpError(403, 'BAD_PASSWORD');
  }
  const key = signUnlock(r.link.id);
  res.cookie(COOKIE, key, { httpOnly: true, sameSite: 'lax', secure: config.isProd, path: cookiePath(r.token), maxAge: UNLOCK_TTL_MS });
  res.json({ ok: true, key });
});

/** Counts one download, atomically refusing once the maximum is reached. */
const countDownload = async (l: Resolved['link']) => {
  const res = await prisma.driveShareLink.updateMany({
    where: { id: l.id, revokedAt: null, ...(l.maxDownloads !== null ? { downloads: { lt: l.maxDownloads } } : {}) },
    data: { downloads: { increment: 1 } },
  });
  if (res.count !== 1) throw new HttpError(410, 'DOWNLOAD_LIMIT_REACHED');
};

const sendFile = (res: Response, key: string, name: string, mime: string) => {
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(storagePath(key), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'FILE_MISSING_ON_DISK' });
  });
};

const isBelow = (rows: SubRow[], n: SubRow, ancestorId: string) => {
  const byId = new Map(rows.map((x) => [x.id, x]));
  for (let cur: SubRow | undefined = n; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) if (cur.parentId === ancestorId) return true;
  return false;
};

/** Streams a ZIP of `root` (a folder of the shared tree) and everything below it. */
const sendZip = async (res: Response, rows: SubRow[], rootId: string, rootName: string) => {
  const byParent = new Map<string, SubRow[]>();
  for (const n of rows) if (n.parentId) byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), n]);
  const entries: { rel: string; abs: string; mtime: Date }[] = [];
  const walk = (id: string, prefix: string) => {
    for (const n of byParent.get(id) ?? []) {
      if (n.kind === 'FOLDER') walk(n.id, `${prefix}${n.name}/`);
      else if (n.storageKey) entries.push({ rel: `${prefix}${n.name}`, abs: storagePath(n.storageKey), mtime: n.updatedAt });
    }
  };
  walk(rootId, `${rootName}/`);
  if (!entries.length) throw badRequest('FOLDER_EMPTY');
  const fileName = `${safeUploadName(rootName)}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  const zip = new ZipWriter(res);
  for (const e of entries) {
    const ok = await fs.stat(e.abs).then((s) => s.isFile()).catch(() => false);
    if (ok) await zip.addFile(e.rel, e.abs, e.mtime);
  }
  await zip.finish();
  return fileName;
};

shareRouter.get('/:token/download', async (req, res) => {
  const r = await resolve(req);
  requireUnlocked(r);
  const n = r.link.node;
  if (n.kind === 'FILE') {
    if (!n.storageKey) throw notFound('FILE_MISSING_ON_DISK');
    await countDownload(r.link);
    await logAccess(req, r.link.id, 'DOWNLOAD', n.name);
    sendFile(res, n.storageKey, n.name, n.mimeType ?? 'application/octet-stream');
    return;
  }
  const { rows } = await sharedTree(r);
  if (!rows.some((x) => x.kind === 'FILE')) throw badRequest('FOLDER_EMPTY');
  await countDownload(r.link);
  await logAccess(req, r.link.id, 'DOWNLOAD', `${n.name}.zip`);
  await sendZip(res, rows, n.id, n.name);
});

shareRouter.get('/:token/download/:ref', async (req, res) => {
  const r = await resolve(req);
  requireUnlocked(r);
  if (r.link.node.kind !== 'FOLDER') throw notFound('SHARE_ITEM_NOT_FOUND');
  const ref = String(req.params.ref ?? '');
  const { rows, byRef } = await sharedTree(r);
  const n = byRef.get(ref);
  if (!n) throw notFound('SHARE_ITEM_NOT_FOUND');
  if (n.kind === 'FILE') {
    if (!n.storageKey) throw notFound('FILE_MISSING_ON_DISK');
    await countDownload(r.link);
    await logAccess(req, r.link.id, 'DOWNLOAD', n.name);
    sendFile(res, n.storageKey, n.name, n.mimeType ?? 'application/octet-stream');
    return;
  }
  if (!rows.some((x) => x.kind === 'FILE' && isBelow(rows, x, n.id))) throw badRequest('FOLDER_EMPTY');
  await countDownload(r.link);
  await logAccess(req, r.link.id, 'DOWNLOAD', `${n.name}.zip`);
  await sendZip(res, rows, n.id, n.name);
});

/** An outsider returns files (e.g. a translator): same type and size checks as staff uploads. */
shareRouter.post(
  '/:token/upload',
  uploadLimiter,
  async (req, res, next) => {
    const r = await resolve(req);
    requireUnlocked(r);
    if (!r.link.allowUpload || r.link.node.kind !== 'FOLDER') throw new HttpError(403, 'UPLOAD_NOT_ALLOWED');
    res.locals.share = r;
    next();
  },
  driveUpload.single('file'),
  async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('FILE_REQUIRED');
    const r = res.locals.share as Resolved;
    const folder = r.link.node;
    let storedKey: string | null = null;
    try {
      await verifyUploadedFile(file);
      const name = await freeNameIn(folder.id, safeUploadName(decodeOriginalName(file.originalname)), true);
      storedKey = await adoptUpload(file.path);
      const created = await prisma.driveNode.create({
        data: { space: folder.space, ownerId: folder.ownerId, kind: 'FILE', name, parentId: folder.id, storageKey: storedKey, mimeType: file.mimetype, size: file.size, createdById: null },
        select: { id: true },
      });
      storedKey = null;
      await logAccess(req, r.link.id, 'UPLOAD', name);
      await logDriveActivity({ nodeId: created.id, folderId: folder.id, actorId: null, action: 'UPLOAD_VIA_LINK', name, meta: { linkId: r.link.id, label: r.link.label, size: file.size } });
      if (r.link.createdById) {
        const u = await prisma.user.findUnique({ where: { id: r.link.createdById }, select: { locale: true } });
        const tx = collabTexts(u?.locale);
        const msg = tx.linkUpload({ label: r.link.label ?? tx.unnamedLink, file: name, folder: folder.name });
        const q = new URLSearchParams({ item: created.id });
        await notifyUser(r.link.createdById, { type: 'DRIVE_LINK_UPLOAD', ...msg, link: `/workspace/drive/f/${encodeURIComponent(folder.id)}?${q}`, ctaLabel: tx.cta, email: false }).catch(() => undefined);
      }
      res.status(201).json({ ok: true, file: { name, size: file.size } });
    } catch (err) {
      await fs.unlink(file.path).catch(() => undefined);
      if (storedKey) await removeStored([storedKey]).catch(() => undefined);
      throw err;
    }
  },
);
