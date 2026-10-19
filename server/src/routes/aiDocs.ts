import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Locale, Prisma } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { isStaff, requireAuth, requireMinRole } from '../middleware/auth.js';
import { decodeOriginalName } from '../middleware/upload.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, HttpError, limiter, notFound, parse } from '../lib/http.js';
import { FileCheckError, verifyStoredFile } from '../lib/fileCheck.js';
import { limitMessage, type LimitReason } from '../lib/ai/limits.js';
import { getAiSettings } from '../lib/ai/settings.js';
import type { AiPart } from '../lib/ai/complete.js';
import { vaultDir } from '../lib/docCheck/index.js';
import { buildScanPdf, ScanImageError } from '../lib/scan/pdf.js';
import { createCaseMessage } from '../lib/messaging/caseMessages.js';
import { DriveAccessCtx, nodeLiteSelect, requireNode, type NodeLite } from '../lib/drive/access.js';
import { createFileIn, readNodeBuffer } from '../lib/drive/files.js';
import { ensureCaseFolder } from '../lib/drive/caseFolders.js';
import { ensureStaffFolder } from '../lib/drive/roots.js';
import { findSibling } from '../lib/drive/names.js';
import { loadOrder, recordChange, TRANSLATIONS_DIR } from '../lib/translations/core.js';
import { aiOf, runAiDocCheck } from '../lib/aiDocs/docCheck.js';
import { filePart, MAX_IMAGE_BYTES } from '../lib/aiDocs/input.js';
import { explainLetter, letterOf, managerMessage, type StoredLetter } from '../lib/aiDocs/letter.js';
import { buildTranslationDraft, TRANSLATIONS_FOLDER } from '../lib/aiDocs/translateDraft.js';

/**
 * Document AI (/api/ai-docs):
 *
 *   GET    /documents/:docId/check            AI check result of a case document (case owner, staff with 2FA)
 *   POST   /documents/:docId/check            re-run the AI check now (STAFF+ with 2FA, ADMIN scope cost)
 *   POST   /letters                           explain a German letter (CLIENT, multipart "files": 1 PDF or ≤3 JPEG/PNG, ≤10 MB)
 *   GET    /letters                           the client's explained letters (newest first)
 *   POST   /letters/:id/send   { caseId?, note? }   letter + explanation to the case manager (case message + OTHER document)
 *   DELETE /letters/:id                       remove an explained letter
 *   POST   /translate-draft    { documentId | nodeId | translationOrderId, fileId?, quality? }   German draft PDF (STAFF+ with 2FA)
 *
 * The automatic check after client uploads is started by the upload routes (scheduleAiDocCheck).
 */
export const aiDocsRouter = Router();
aiDocsRouter.use(requireAuth);

const LIMIT_REASONS: LimitReason[] = ['DISABLED', 'DAILY_MESSAGES', 'DAILY_COST', 'MONTHLY_BUDGET', 'KEY_CREDIT', 'NO_API_KEY'];
const LOCALES = ['az', 'de', 'en', 'ru'];
/** Interface language of the request (X-Locale header), else the profile language. */
const localeOf = (req: Request) => {
  const h = String(req.get('x-locale') ?? '').slice(0, 2);
  return (LOCALES.includes(h) ? h : LOCALES.includes(req.user!.locale) ? req.user!.locale : 'az') as Locale;
};

/** AI failures: limits → 429 with a friendly text in the user's language; file problems → 400/413; the rest → 502. */
const sendAiFailure = (req: Request, res: Response, reason: string) => {
  if ((LIMIT_REASONS as string[]).includes(reason)) {
    res.status(429).json({ error: 'AI_LIMIT', reason, message: limitMessage(reason as LimitReason, localeOf(req)) });
  } else if (reason === 'UNSUPPORTED_TYPE') res.status(400).json({ error: 'UNSUPPORTED_FILE_TYPE', reason });
  else if (reason === 'TOO_LARGE') res.status(413).json({ error: 'FILE_TOO_LARGE', reason });
  else res.status(502).json({ error: 'AI_FAILED', reason });
};

const clientOnly = (req: Request) => {
  if (req.user!.role !== 'CLIENT') throw forbidden('CLIENTS_ONLY');
};

// ─── Document check ────────────────────────────────────────────────────

const staffWith2fa = (req: Request) => isStaff(req.user) && !!req.user!.twoFactorEnabled;

aiDocsRouter.get('/documents/:docId/check', async (req, res) => {
  const doc = await prisma.document.findUnique({ where: { id: String(req.params.docId) }, select: { id: true, checks: true, case: { select: { clientId: true } } } });
  if (!doc || (!staffWith2fa(req) && doc.case.clientId !== req.user!.id)) throw notFound('DOCUMENT_NOT_FOUND');
  const settings = await getAiSettings();
  res.json({ documentId: doc.id, enabled: settings.docCheckEnabled, ai: aiOf(doc.checks) });
});

aiDocsRouter.post('/documents/:docId/check', requireMinRole('STAFF'), async (req, res) => {
  const doc = await prisma.document.findUnique({ where: { id: String(req.params.docId) }, select: { id: true, caseId: true } });
  if (!doc) throw notFound('DOCUMENT_NOT_FOUND');
  const ai = await runAiDocCheck(doc.id, { userId: req.user!.id, scope: 'ADMIN' }, 'staff');
  await audit(req, 'AI_DOC_CHECK_RUN', doc.id, { caseId: doc.caseId, verdict: ai?.verdict ?? null });
  if (ai?.verdict === 'skipped' && (LIMIT_REASONS as string[]).includes(ai.reason)) {
    res.status(429).json({ error: 'AI_LIMIT', reason: ai.reason, message: limitMessage(ai.reason as LimitReason, localeOf(req)), ai });
    return;
  }
  res.json({ documentId: doc.id, ai });
});

// ─── Letters ───────────────────────────────────────────────────────────

export const LETTER_MAX_BYTES = 10 * 1024 * 1024;
export const LETTER_MAX_FILES = 3;
const LETTER_MIME = ['image/jpeg', 'image/png', 'application/pdf'];
const incomingDir = path.join(config.uploads.privateDir, '.ai-incoming');
fsSync.mkdirSync(incomingDir, { recursive: true });

const letterUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => fsSync.mkdir(incomingDir, { recursive: true }, (err) => cb(err ?? null, incomingDir)),
    filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(10).toString('hex')}`),
  }),
  limits: { fileSize: LETTER_MAX_BYTES, files: LETTER_MAX_FILES },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;
    if (LETTER_MIME.includes(mime)) {
      file.mimetype = mime;
      cb(null, true);
    } else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
}).array('files', LETTER_MAX_FILES);

const receiveLetter = (req: Request, res: Response, next: NextFunction) =>
  letterUpload(req, res, (err: unknown) => {
    const code = (err as { code?: string } | undefined)?.code;
    if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') return next(badRequest('TOO_MANY_FILES'));
    if (code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'FILE_TOO_LARGE'));
    next(err);
  });

const letterLimiter = limiter({ windowMs: 60 * 1000, limit: 6, skip: () => config.isTest });

const LETTER_TITLE: Record<Locale, string> = { az: 'Məktub', de: 'Brief', en: 'Letter', ru: 'Письмо' };

const letterDto = (v: { id: string; title: string; filename: string; mimeType: string; size: number; createdAt: Date; ocr: unknown }) => ({
  id: v.id,
  title: v.title,
  filename: v.filename,
  mimeType: v.mimeType,
  size: v.size,
  createdAt: v.createdAt,
  fileUrl: `/api/vault/${v.id}/file`,
  letter: letterOf(v.ocr)!,
});

const randomKey = (ext: string) => `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`;

aiDocsRouter.post('/letters', letterLimiter, receiveLetter, async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  try {
    clientOnly(req);
    if (!files.length) throw badRequest('FILE_REQUIRED');
    const pdfs = files.filter((f) => f.mimetype === 'application/pdf');
    if (pdfs.length && files.length > 1) throw badRequest('ONE_PDF_ONLY');
    for (const f of files) {
      try {
        await verifyStoredFile(f.path, f.mimetype);
      } catch (err) {
        if (err instanceof FileCheckError) throw badRequest(err.code);
        throw err;
      }
    }
    const bufs = await Promise.all(files.map((f) => fs.readFile(f.path)));
    const originalName = decodeOriginalName(files[0].originalname).slice(0, 200) || 'letter';

    // AI input: the PDF (first pages) or the images.
    const parts: AiPart[] = [];
    if (pdfs.length) {
      const p = await filePart(bufs[0], 'application/pdf', originalName);
      if (!p.ok) return void sendAiFailure(req, res, p.reason);
      parts.push(...p.parts);
    } else {
      if (bufs.some((b) => b.length > MAX_IMAGE_BYTES)) throw new HttpError(413, 'IMAGE_TOO_LARGE');
      bufs.forEach((data, i) => parts.push({ type: 'image', mime: files[i].mimetype, data }));
    }

    const locale = localeOf(req);
    const result = await explainLetter(req.user!.id, locale, parts);
    if (!result.ok) return void sendAiFailure(req, res, result.reason);

    // Stored in the client's vault (kind OTHER): one image as it is, several images as one PDF.
    let stored: { data: Buffer; mime: string; name: string };
    if (pdfs.length) stored = { data: bufs[0], mime: 'application/pdf', name: originalName };
    else if (files.length === 1) stored = { data: bufs[0], mime: files[0].mimetype, name: originalName };
    else {
      try {
        const pdf = await buildScanPdf(bufs.map((data, i) => ({ data, mime: files[i].mimetype })), { title: originalName });
        stored = { data: pdf, mime: 'application/pdf', name: `${originalName.replace(/\.[a-z0-9]{2,5}$/i, '')}.pdf` };
      } catch (err) {
        if (err instanceof ScanImageError) throw badRequest('INVALID_IMAGE');
        throw err;
      }
    }
    const ext = stored.mime === 'application/pdf' ? '.pdf' : stored.mime === 'image/png' ? '.png' : '.jpg';
    const storageKey = randomKey(ext);
    await fs.mkdir(vaultDir(), { recursive: true });
    await fs.writeFile(path.join(vaultDir(), storageKey), stored.data);
    const e = result.explanation;
    const letter: StoredLetter = { explanation: e, locale, model: result.model, costUsd: result.costUsd, at: new Date().toISOString() };
    const label = [e.subject, e.sender.name].filter(Boolean).join(' · ') || stored.name;
    try {
      const v = await prisma.vaultDocument.create({
        data: {
          userId: req.user!.id,
          kind: 'OTHER',
          title: `${LETTER_TITLE[locale]}: ${label}`.slice(0, 200),
          storageKey,
          filename: stored.name.slice(0, 255),
          mimeType: stored.mime,
          size: stored.data.length,
          issuedAt: e.letterDate ? new Date(`${e.letterDate}T00:00:00Z`) : null,
          ocr: { letter } as unknown as Prisma.InputJsonValue,
        },
      });
      await audit(req, 'AI_LETTER_EXPLAINED', v.id, { urgency: e.urgency, pages: files.length });
      res.status(201).json({ item: letterDto(v) });
    } catch (err) {
      await fs.unlink(path.join(vaultDir(), storageKey)).catch(() => undefined);
      throw err;
    }
  } finally {
    await Promise.all(files.map((f) => fs.unlink(f.path).catch(() => undefined)));
  }
});

aiDocsRouter.get('/letters', async (req, res) => {
  clientOnly(req);
  const rows = await prisma.vaultDocument.findMany({ where: { userId: req.user!.id, kind: 'OTHER' }, orderBy: { createdAt: 'desc' }, take: 300 });
  res.json({ items: rows.filter((r) => letterOf(r.ocr)).slice(0, 100).map(letterDto) });
});

const ownLetter = async (req: Request) => {
  clientOnly(req);
  const v = await prisma.vaultDocument.findUnique({ where: { id: String(req.params.id) } });
  if (!v || v.userId !== req.user!.id || !letterOf(v.ocr)) throw notFound('LETTER_NOT_FOUND');
  return { v, letter: letterOf(v.ocr)! };
};

aiDocsRouter.post('/letters/:id/send', async (req, res) => {
  const body = parse(z.object({ caseId: z.string().trim().min(1).max(40).optional(), note: z.string().trim().max(1000).optional() }), req.body ?? {});
  const { v, letter } = await ownLetter(req);
  if (letter.sentAt) throw conflict('ALREADY_SENT');
  const c = body.caseId
    ? await prisma.case.findUnique({ where: { id: body.caseId } })
    : ((await prisma.case.findFirst({ where: { clientId: req.user!.id, closedAt: null }, orderBy: { createdAt: 'desc' } })) ??
      (await prisma.case.findFirst({ where: { clientId: req.user!.id }, orderBy: { createdAt: 'desc' } })));
  if (body.caseId && (!c || c.clientId !== req.user!.id)) throw notFound('CASE_NOT_FOUND');
  if (!c) throw conflict('NO_CASE');

  // The letter file joins the case as an OTHER-stage document, so staff can open it next to the message.
  const storedName = randomKey(path.extname(v.storageKey).toLowerCase().replace(/[^.a-z0-9]/g, ''));
  try {
    await fs.copyFile(path.join(vaultDir(), v.storageKey), path.join(config.uploads.privateDir, storedName));
  } catch {
    throw notFound('FILE_NOT_FOUND');
  }
  let documentId: string;
  try {
    const doc = await prisma.document.create({
      data: { caseId: c.id, stage: 'OTHER', originalName: v.filename.slice(0, 200), storedName, mimeType: v.mimeType, size: v.size, uploadedById: req.user!.id, vaultDocumentId: v.id },
    });
    documentId = doc.id;
    await prisma.caseEvent.create({ data: { caseId: c.id, type: 'DOCUMENT_UPLOADED', note: doc.originalName, actorId: req.user!.id, visibleToClient: false } });
  } catch (err) {
    await fs.unlink(path.join(config.uploads.privateDir, storedName)).catch(() => undefined);
    throw err;
  }
  const message = await createCaseMessage({ caseId: c.id, authorId: req.user!.id, body: managerMessage(letter, v.filename, body.note), side: 'client' });
  const next: StoredLetter = { ...letter, sentAt: new Date().toISOString(), sentCaseId: c.id, sentDocumentId: documentId };
  const ocr = { ...((v.ocr as Record<string, unknown> | null) ?? {}), letter: next };
  await prisma.vaultDocument.update({ where: { id: v.id }, data: { ocr: ocr as unknown as Prisma.InputJsonValue } });
  await audit(req, 'AI_LETTER_SENT', v.id, { caseId: c.id, documentId });
  res.status(201).json({ message, caseId: c.id, documentId, item: letterDto({ ...v, ocr }) });
});

aiDocsRouter.delete('/letters/:id', async (req, res) => {
  const { v } = await ownLetter(req);
  await prisma.vaultDocument.delete({ where: { id: v.id } });
  await fs.unlink(path.join(vaultDir(), v.storageKey)).catch(() => undefined);
  res.json({ ok: true });
});

// ─── Draft translation (staff) ─────────────────────────────────────────

const draftSchema = z
  .object({
    documentId: z.string().trim().min(1).max(40).optional(),
    nodeId: z.string().trim().min(1).max(120).optional(),
    translationOrderId: z.string().trim().min(1).max(40).optional(),
    fileId: z.string().trim().min(1).max(40).optional(),
    quality: z.enum(['standard', 'high']).default('standard'),
  })
  .refine((b) => [b.documentId, b.nodeId, b.translationOrderId].filter(Boolean).length === 1, 'ONE_SOURCE');

const draftLimiter = limiter({ windowMs: 60 * 1000, limit: 10, skip: () => config.isTest });

const nodeLite = async (id: string) => (await prisma.driveNode.findUniqueOrThrow({ where: { id }, select: nodeLiteSelect })) as unknown as NodeLite;

/** "<client folder>/Übersetzungen" of a case (created when missing). */
const caseTranslationsFolder = async (caseId: string): Promise<NodeLite> => {
  const folderId = await ensureCaseFolder(caseId);
  if (!folderId) throw notFound('CASE_NOT_FOUND');
  let sub = await findSibling(folderId, TRANSLATIONS_FOLDER);
  if (!sub || sub.kind !== 'FOLDER') {
    const parent = await prisma.driveNode.findUniqueOrThrow({ where: { id: folderId }, select: { space: true, ownerId: true } });
    try {
      sub = await prisma.driveNode.create({ data: { space: parent.space, ownerId: parent.ownerId, kind: 'FOLDER', name: TRANSLATIONS_FOLDER, parentId: folderId }, select: { id: true, kind: true, name: true } });
    } catch {
      sub = await findSibling(folderId, TRANSLATIONS_FOLDER);
    }
  }
  if (!sub) throw new HttpError(500, 'FOLDER_FAILED');
  return nodeLite(sub.id);
};

const readFileOr404 = async (p: string) => {
  try {
    return await fs.readFile(p);
  } catch {
    throw notFound('FILE_NOT_FOUND');
  }
};

aiDocsRouter.post('/translate-draft', requireMinRole('STAFF'), draftLimiter, async (req, res) => {
  const body = parse(draftSchema, req.body ?? {});
  let source: { buf: Buffer; mimeType: string; filename: string };
  let target: () => Promise<NodeLite>;
  let location: 'case' | 'drive' | 'staff';
  let order: Awaited<ReturnType<typeof loadOrder>> = null;

  if (body.documentId) {
    const doc = await prisma.document.findUnique({ where: { id: body.documentId } });
    if (!doc) throw notFound('DOCUMENT_NOT_FOUND');
    source = { buf: await readFileOr404(path.join(config.uploads.privateDir, path.basename(doc.storedName))), mimeType: doc.mimeType, filename: doc.originalName };
    target = () => caseTranslationsFolder(doc.caseId);
    location = 'case';
  } else if (body.nodeId) {
    const ctx = new DriveAccessCtx({ id: req.user!.id, role: req.user!.role });
    const { node } = await requireNode(ctx, body.nodeId, 'DOWNLOAD');
    if (node.kind !== 'FILE') throw badRequest('NOT_A_FILE');
    if (!node.parentId) throw badRequest('NO_PARENT_FOLDER');
    const { node: parent } = await requireNode(ctx, node.parentId, 'EDIT');
    const { row, buf } = await readNodeBuffer(node.id, config.drive.maxFileSize);
    source = { buf, mimeType: row.mimeType ?? 'application/octet-stream', filename: row.name };
    target = async () => parent;
    location = 'drive';
  } else {
    order = await loadOrder(body.translationOrderId!);
    if (!order) throw notFound('ORDER_NOT_FOUND');
    const file = body.fileId ? order.files.find((f) => f.id === body.fileId) : order.files.find((f) => f.kind === 'SOURCE');
    if (!file) throw notFound('FILE_NOT_FOUND');
    let p: string;
    if (file.storageKey) p = path.join(TRANSLATIONS_DIR, path.basename(file.storageKey));
    else if (file.documentId) {
      const doc = await prisma.document.findUnique({ where: { id: file.documentId }, select: { storedName: true } });
      if (!doc) throw notFound('FILE_NOT_FOUND');
      p = path.join(config.uploads.privateDir, path.basename(doc.storedName));
    } else throw notFound('FILE_NOT_FOUND');
    source = { buf: await readFileOr404(p), mimeType: file.mimeType, filename: file.filename };
    const caseId = order.caseId;
    if (caseId) {
      target = () => caseTranslationsFolder(caseId);
      location = 'case';
    } else {
      // No case: the staff member's own folder in the team drive ("Mitarbeiter/<Name>").
      target = async () => {
        const id = await ensureStaffFolder(req.user!.id);
        if (!id) throw conflict('NO_TARGET_FOLDER');
        return nodeLite(id);
      };
      location = 'staff';
    }
  }

  const draft = await buildTranslationDraft({ userId: req.user!.id, ...source, quality: body.quality });
  if (!draft.ok) return void sendAiFailure(req, res, draft.reason);
  const parent = await target();
  const created = await createFileIn(parent, draft.name, draft.pdf, 'application/pdf', req.user!.id);
  await audit(req, 'AI_TRANSLATION_DRAFT', `drive:${created.id}`, {
    documentId: body.documentId ?? null,
    nodeId: body.nodeId ?? null,
    translationOrderId: body.translationOrderId ?? null,
    model: draft.model,
    costUsd: draft.costUsd,
  });
  if (order) {
    await recordChange(req, order, 'TRANSLATION_AI_DRAFT', { note: `AI-Entwurf: ${created.name}`, visibleToClient: false }, { nodeId: created.id });
  }
  res.status(201).json({ nodeId: created.id, name: created.name, parentId: parent.id, location, model: draft.model, costUsd: draft.costUsd, pages: draft.pages });
});
