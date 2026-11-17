import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { decodeOriginalName, verifyUploadedFile } from '../../middleware/upload.js';
import { badRequest, limiter, notFound, parse } from '../http.js';
import { logDocumentAccess } from '../privacy/accessLog.js'; // the client's "who opened my documents" log
import { audit } from '../audit.js';
import { notifyStaff } from '../notifications.js';
import { INLINE_MIME } from '../fileCheck.js';
import { driveUpload } from '../drive/upload.js';
import { adoptUpload, removeStored, storagePath } from '../drive/storage.js';
import { freeNameIn, safeUploadName } from '../drive/names.js';
import { openVacancyWhere } from '../vacancies.js';
import { partnerCaseOr404 } from '../partnerPortal/cases.js';
import { partnerContextOf, requireDocuments, requireDrive, requireFlag, requireOwner } from './context.js';
import { listPartnerFolder, nodeInPartnerFolder, partnerDriveRoot } from './drive.js';
import { inviteMember, listMembers, memberInviteInput, memberPatchInput, resendMemberInvite, updateMember } from './members.js';
import { MESSAGE_KINDS, messageView } from './messages.js';

/**
 * Partner-portal areas that depend on the per-partner permission set — mounted into /api/partner (role AGENT,
 * partner owner or active team member; lib/partnerAccess/context.ts):
 *
 *   GET    /team                         owner: members + the partner's own permission set
 *   POST   /team                         owner: invite a member (permissions ≤ the partner's)
 *   PATCH  /team/:id                     owner: change a member's permissions / (de)activate
 *   POST   /team/:id/invite              owner: e-mail a fresh set-password link
 *   GET    /drive[?folder=]              drive ≥ view: the partner's own folder (client folders never shown)
 *   GET    /drive/files/:id              drive ≥ view: open / download (?download=1) a file of that folder
 *   POST   /drive/files?folder=          drive = upload: multipart `file` into the partner's folder
 *   GET    /messages, POST /messages     messaging: thread with the Triad Vision team
 *   GET    /vacancies                    vacancies: open vacancies (public data)
 *   GET    /cases/:id/documents/:docId/file   documents = download: a document of an own case
 */
export const partnerAccessPortalRouter = Router();

/** Sends a stored file with headers that stop a browser from ever running it (as in the staff drive). */
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

// ─── Team (owner only) ────────────────────────────────────────────────

const teamLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 30, keyGenerator: (req) => `partner-team:${req.user?.id ?? 'anon'}` });

partnerAccessPortalRouter.get('/team', async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireOwner(ctx);
  res.json({ partnerPerms: ctx.partnerPerms, items: await listMembers(ctx.partner.id, ctx.partnerPerms) });
});

partnerAccessPortalRouter.post('/team', teamLimiter, async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireOwner(ctx);
  const body = parse(memberInviteInput, req.body);
  const m = await inviteMember(req, ctx.partner, ctx.partnerPerms, body, 'PARTNER');
  res.status(201).json({ member: (await listMembers(ctx.partner.id, ctx.partnerPerms)).find((x) => x.id === m.id) });
});

partnerAccessPortalRouter.patch('/team/:id', async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireOwner(ctx);
  const body = parse(memberPatchInput, req.body);
  await updateMember(req, ctx.partner.id, ctx.partnerPerms, String(req.params.id), body, 'PARTNER');
  res.json({ member: (await listMembers(ctx.partner.id, ctx.partnerPerms)).find((x) => x.id === String(req.params.id)) });
});

partnerAccessPortalRouter.post('/team/:id/invite', teamLimiter, async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireOwner(ctx);
  await resendMemberInvite(req, ctx.partner, String(req.params.id), 'PARTNER');
  res.json({ ok: true });
});

// ─── Own Drive folder ─────────────────────────────────────────────────

const driveRoot = async (partnerId: string) => {
  const root = await partnerDriveRoot(partnerId);
  if (!root) throw notFound('PARTNER_FOLDER_UNAVAILABLE');
  return root;
};

partnerAccessPortalRouter.get('/drive', async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireDrive(ctx, 'view');
  const q = parse(z.object({ folder: z.string().min(1).max(120).optional() }), req.query);
  const root = await driveRoot(ctx.partner.id);
  const out = await listPartnerFolder(root, q.folder ?? root);
  res.json({ ...out, rootId: root, canUpload: ctx.perms.drive === 'upload' });
});

partnerAccessPortalRouter.get('/drive/files/:id', async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireDrive(ctx, 'view');
  const root = await driveRoot(ctx.partner.id);
  const { node } = await nodeInPartnerFolder(root, String(req.params.id).slice(0, 120));
  if (node.kind !== 'FILE') throw badRequest('NOT_A_FILE');
  const row = await prisma.driveNode.findUniqueOrThrow({ where: { id: node.id }, select: { storageKey: true, mimeType: true, name: true } });
  if (!row.storageKey) throw notFound('NODE_NOT_FOUND');
  const mime = row.mimeType ?? 'application/octet-stream';
  const download = req.query.download === '1' || req.query.download === 'true';
  await audit(req, 'PARTNER_DRIVE_FILE_OPENED', `drive:${node.id}`, { partnerId: ctx.partner.id, download, role: ctx.role });
  sendStored(res, storagePath(row.storageKey), row.name, mime, !download && INLINE_MIME.has(mime));
});

const uploadLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 120, keyGenerator: (req) => `partner-drive:${req.user?.id ?? 'anon'}` });

partnerAccessPortalRouter.post(
  '/drive/files',
  uploadLimiter,
  async (req, res, next) => {
    // Rights and the target folder are checked before a single byte is spooled to disk.
    const ctx = await partnerContextOf(req);
    requireDrive(ctx, 'upload');
    const root = await driveRoot(ctx.partner.id);
    const folderId = typeof req.query.folder === 'string' && req.query.folder ? req.query.folder.slice(0, 120) : root;
    const { node } = await nodeInPartnerFolder(root, folderId);
    if (node.kind !== 'FOLDER') throw badRequest('NOT_A_FOLDER');
    res.locals.partnerFolder = node.id;
    res.locals.partnerId = ctx.partner.id;
    next();
  },
  driveUpload.single('file'),
  async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('FILE_REQUIRED');
    let storedKey: string | null = null;
    try {
      await verifyUploadedFile(file);
      const folderId = res.locals.partnerFolder as string;
      const parent = await prisma.driveNode.findUniqueOrThrow({ where: { id: folderId }, select: { space: true, ownerId: true } });
      const name = await freeNameIn(folderId, safeUploadName(decodeOriginalName(file.originalname)), true);
      storedKey = await adoptUpload(file.path);
      const created = await prisma.driveNode.create({
        data: { space: parent.space, ownerId: parent.ownerId, kind: 'FILE', name, parentId: folderId, storageKey: storedKey, mimeType: file.mimetype, size: file.size, createdById: req.user!.id },
        select: { id: true, name: true, kind: true, size: true, mimeType: true, updatedAt: true },
      });
      storedKey = null;
      await audit(req, 'PARTNER_DRIVE_FILE_UPLOADED', `drive:${created.id}`, { partnerId: res.locals.partnerId as string, name, size: file.size, parentId: folderId });
      res.status(201).json({ item: created });
    } catch (err) {
      await fs.unlink(file.path).catch(() => undefined);
      if (storedKey) await removeStored([storedKey]).catch(() => undefined);
      throw err;
    }
  },
);

// ─── Messages with the Triad Vision team ──────────────────────────────

const messageLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 30, keyGenerator: (req) => `partner-msg:${req.user?.id ?? 'anon'}` });

partnerAccessPortalRouter.get('/messages', async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireFlag(ctx, 'messaging');
  const rows = await prisma.partnerActivity.findMany({
    where: { referralPartnerId: ctx.partner.id, kind: { in: [...MESSAGE_KINDS] } },
    orderBy: { at: 'desc' },
    take: 200,
  });
  res.json({ items: await messageView(rows) });
});

partnerAccessPortalRouter.post('/messages', messageLimiter, async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireFlag(ctx, 'messaging');
  const { text } = parse(z.object({ text: z.string().trim().min(1).max(4000) }), req.body);
  const row = await prisma.partnerActivity.create({ data: { referralPartnerId: ctx.partner.id, kind: 'PORTAL_IN', body: text, createdById: req.user!.id } });
  await audit(req, 'PARTNER_MESSAGE_SENT', `partner:${ctx.partner.id}`, { activityId: row.id, role: ctx.role });
  await notifyStaff(`Partnyordan mesaj: ${ctx.partner.name}`.slice(0, 180), text, { link: `/admin/partners/${ctx.partner.id}`, type: 'PARTNER_MESSAGE' }).catch(() => undefined);
  res.status(201).json({ message: (await messageView([row]))[0] });
});

// ─── Vacancies (public data) ──────────────────────────────────────────

partnerAccessPortalRouter.get('/vacancies', async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireFlag(ctx, 'vacancies');
  const rows = await prisma.vacancy.findMany({
    where: openVacancyWhere(),
    orderBy: { publishedAt: 'desc' },
    take: 200,
    select: { id: true, slug: true, title: true, city: true, profession: true, sector: true, positions: true, employmentType: true, salaryMin: true, salaryMax: true, germanLevel: true, publishedAt: true, closesAt: true },
  });
  res.json({ items: rows });
});

// ─── Case documents (download level only) ─────────────────────────────

partnerAccessPortalRouter.get('/cases/:id/documents/:docId/file', async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireDocuments(ctx, 'download');
  if (ctx.perms.clientList === 'none') throw notFound('CASE_NOT_FOUND');
  const c = await partnerCaseOr404(ctx.partner.id, String(req.params.id));
  const doc = await prisma.document.findFirst({
    where: { id: String(req.params.docId), caseId: c.id, stage: { in: ['INITIAL', 'EMBASSY'] } },
    select: { id: true, storedName: true, originalName: true, mimeType: true },
  });
  if (!doc) throw notFound('DOCUMENT_NOT_FOUND');
  const abs = path.join(config.uploads.privateDir, path.basename(doc.storedName));
  await fs.access(abs).catch(() => {
    throw notFound('FILE_MISSING_ON_DISK');
  });
  await audit(req, 'PARTNER_DOCUMENT_DOWNLOADED', `case:${c.id}`, { partnerId: ctx.partner.id, documentId: doc.id, role: ctx.role });
  void logDocumentAccess(req.user, { id: doc.id, caseId: c.id, name: doc.originalName, clientId: c.clientId }, 'DOWNLOAD', 'FILES');
  sendStored(res, abs, doc.originalName, doc.mimeType ?? 'application/octet-stream', false);
});

