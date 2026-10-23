import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Prisma, VaultDocKind } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { decodeOriginalName, verifyUploadedFile } from '../middleware/upload.js';
import { audit } from '../lib/audit.js';
import { CLIENT_UPLOAD_STAGE } from '../lib/caseFlow.js';
import { CASE_DOC_MIME, resolveMime } from '../lib/fileCheck.js';
import { badRequest, conflict, notFound, parse } from '../lib/http.js';
import { checkCaseDocument, runChecks, targetForVaultKind, vaultDir } from '../lib/docCheck/index.js';
import { vaultDto, vaultKindsFor } from '../lib/docCheck/vault.js';
import { scheduleAiDocCheck } from '../lib/aiDocs/docCheck.js';
import { prepareCaseDocument, publicQuality, scheduleUploadAnalysis } from '../lib/uploadAi/index.js';
import { emitAutomationEvent } from '../lib/automation/events.js';

/**
 * Personal document vault: clients keep their documents (passport, diplomas, photos…) once and reuse
 * them for any case. Files live in <private uploads>/vault/<random key>, are served only to their owner
 * and run through the same automatic checks as case documents.
 */
export const vaultRouter = Router();
vaultRouter.use(requireAuth);

fs.mkdirSync(vaultDir(), { recursive: true });

export const VAULT_KINDS = [
  'PASSPORT', 'ID_CARD', 'PHOTO', 'DIPLOMA', 'TRANSCRIPT', 'CERTIFICATE', 'EMPLOYMENT_REF', 'LANGUAGE_CERT',
  'DRIVING_LICENCE', 'BIRTH_CERT', 'MARRIAGE_CERT', 'POLICE_CLEARANCE', 'CV', 'OTHER',
] as const satisfies readonly VaultDocKind[];

const randomName = (original: string) => {
  const ext = path.extname(original).toLowerCase().replace(/[^.a-z0-9]/g, '');
  return `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`;
};

/** Same rules as case documents: 5 MB, CASE_DOC_MIME, magic bytes checked after storing. */
const vaultUpload = multer({
  storage: multer.diskStorage({
    // Created on demand as well, so a removed folder (fresh volume, cleanup) never breaks uploads.
    destination: (_req, _file, cb) => fs.mkdir(vaultDir(), { recursive: true }, (err) => cb(err ?? null, vaultDir())),
    filename: (_req, file, cb) => cb(null, randomName(file.originalname)),
  }),
  limits: { fileSize: config.uploads.maxFileSize, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = resolveMime(file.mimetype, decodeOriginalName(file.originalname));
    if (mime && CASE_DOC_MIME.has(mime)) {
      file.mimetype = mime;
      cb(null, true);
    } else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
});

const vaultPath = (key: string) => path.join(vaultDir(), key);
const casePath = (name: string) => path.join(config.uploads.privateDir, name);

const ownVaultDoc = async (id: string, userId: string) => {
  const d = await prisma.vaultDocument.findUnique({ where: { id } });
  if (!d || d.userId !== userId) throw notFound('VAULT_DOCUMENT_NOT_FOUND');
  return d;
};

const ownCase = async (caseId: string, userId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId } });
  if (!c || c.clientId !== userId) throw notFound('CASE_NOT_FOUND');
  return c;
};

/** Optional date field from multipart / JSON: '' or null clears, 'YYYY-MM-DD' or ISO sets. */
const dateField = z
  .union([z.literal(''), z.null(), z.string().trim().regex(/^\d{4}-\d{2}-\d{2}/)])
  .optional()
  .transform((v) => (v === undefined ? undefined : v ? new Date(v.length === 10 ? `${v}T00:00:00Z` : v) : null))
  .refine((d) => d === undefined || d === null || !Number.isNaN(d.getTime()), 'INVALID_DATE');

const metaSchema = z.object({
  kind: z.enum(VAULT_KINDS),
  title: z.string().trim().min(1).max(200),
  ownerName: z.string().trim().max(160).optional().transform((v) => v || undefined),
  issuedAt: dateField,
  expiresAt: dateField,
});

const titleCaseName = (first: string, last: string) => `${first} ${last}`.trim();

// ─── List ─────────────────────────────────────────────────────────────

vaultRouter.get('/', async (req, res) => {
  const rows = await prisma.vaultDocument.findMany({ where: { userId: req.user!.id }, orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }] });
  const now = new Date();
  const documents = rows.map((r) => vaultDto(r, now));
  const groups: Record<string, ReturnType<typeof vaultDto>[]> = {};
  for (const d of documents) (groups[d.kind] ??= []).push(d);
  res.json({ documents, groups });
});

// ─── Suggestions for a case ──────────────────────────────────────────

vaultRouter.get('/suggestions', async (req, res) => {
  const { caseId } = parse(z.object({ caseId: z.string().min(1) }), req.query);
  const c = await ownCase(caseId, req.user!.id);
  const stage = CLIENT_UPLOAD_STAGE[c.status] ?? null;
  if (!stage) {
    res.json({ stage: null, suggestions: [] });
    return;
  }
  const [requirements, vault] = await Promise.all([
    prisma.documentRequirement.findMany({
      where: { caseId: c.id, stage },
      orderBy: { sortOrder: 'asc' },
      include: { documents: { select: { status: true } } },
    }),
    prisma.vaultDocument.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' } }),
  ]);
  const now = new Date();
  const suggestions = requirements.map((r) => {
    const kinds = vaultKindsFor(r.key);
    const documents = vault
      .filter((v) => kinds.includes(v.kind))
      .sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind))
      .map((v) => vaultDto(v, now));
    return { requirementId: r.id, key: r.key, title: r.title, required: r.required, kinds, satisfied: r.documents.some((d) => d.status !== 'REJECTED'), documents };
  });
  res.json({ stage, suggestions });
});

// ─── Upload ───────────────────────────────────────────────────────────

vaultRouter.post('/', vaultUpload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('FILE_REQUIRED');
  try {
    await verifyUploadedFile(file);
    const meta = parse(metaSchema, req.body);
    const { checks, scan } = await runChecks({ path: file.path, mimeType: file.mimetype, target: targetForVaultKind(meta.kind) });

    // Passport: fill expiry date and holder name from the MRZ when the client left them empty.
    let expiresAt = meta.expiresAt ?? null;
    let ownerName = meta.ownerName ?? null;
    if (scan && meta.kind === 'PASSPORT') {
      if (!expiresAt && scan.fields.expiryDate) expiresAt = new Date(`${scan.fields.expiryDate}T00:00:00Z`);
      if (!ownerName) ownerName = titleCaseName(scan.fields.firstName, scan.fields.lastName) || null;
    }

    const doc = await prisma.vaultDocument.create({
      data: {
        userId: req.user!.id,
        kind: meta.kind,
        title: meta.title,
        ownerName,
        storageKey: file.filename,
        filename: decodeOriginalName(file.originalname).slice(0, 200),
        mimeType: file.mimetype,
        size: file.size,
        issuedAt: meta.issuedAt ?? null,
        expiresAt,
        checks: checks as unknown as Prisma.InputJsonValue,
        ocr: scan ? ({ fields: scan.fields, valid: scan.checks.valid, at: checks.at } as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
    await audit(req, 'vault.upload', doc.id, { kind: doc.kind });
    res.status(201).json({ document: vaultDto(doc), checks, prefilled: !!scan && meta.kind === 'PASSPORT' });
  } catch (err) {
    await fsp.unlink(file.path).catch(() => undefined);
    throw err;
  }
});

// ─── Save an own case document to the vault ─────────────────────────

vaultRouter.post('/from-document', async (req, res) => {
  const body = parse(
    z.object({ documentId: z.string().min(1), kind: z.enum(VAULT_KINDS), title: z.string().trim().min(1).max(200), ownerName: z.string().trim().max(160).optional() }),
    req.body,
  );
  const src = await prisma.document.findUnique({ where: { id: body.documentId }, include: { case: { select: { clientId: true } } } });
  if (!src || src.case.clientId !== req.user!.id) throw notFound('DOCUMENT_NOT_FOUND');
  if (!CASE_DOC_MIME.has(src.mimeType)) throw badRequest('UNSUPPORTED_FILE_TYPE');

  const key = randomName(src.originalName);
  try {
    await fsp.mkdir(vaultDir(), { recursive: true });
    await fsp.copyFile(casePath(src.storedName), vaultPath(key));
  } catch {
    throw notFound('FILE_NOT_FOUND');
  }
  try {
    const { checks } = await runChecks({ path: vaultPath(key), mimeType: src.mimeType, target: targetForVaultKind(body.kind) });
    const doc = await prisma.vaultDocument.create({
      data: {
        userId: req.user!.id,
        kind: body.kind,
        title: body.title,
        ownerName: body.ownerName || null,
        storageKey: key,
        filename: src.originalName.slice(0, 200),
        mimeType: src.mimeType,
        size: src.size,
        checks: checks as unknown as Prisma.InputJsonValue,
      },
    });
    await audit(req, 'vault.from_document', doc.id, { documentId: src.id });
    res.status(201).json({ document: vaultDto(doc), checks });
  } catch (err) {
    await fsp.unlink(vaultPath(key)).catch(() => undefined);
    throw err;
  }
});

// ─── Single document ─────────────────────────────────────────────────

vaultRouter.patch('/:id', async (req, res) => {
  const d = await ownVaultDoc(String(req.params.id), req.user!.id);
  const body = parse(
    z.object({
      kind: z.enum(VAULT_KINDS).optional(),
      title: z.string().trim().min(1).max(200).optional(),
      ownerName: z.string().trim().max(160).nullable().optional(),
      issuedAt: dateField,
      expiresAt: dateField,
    }),
    req.body,
  );
  const updated = await prisma.vaultDocument.update({
    where: { id: d.id },
    data: {
      kind: body.kind,
      title: body.title,
      ownerName: body.ownerName === undefined ? undefined : body.ownerName || null,
      issuedAt: body.issuedAt,
      expiresAt: body.expiresAt,
    },
  });
  res.json({ document: vaultDto(updated) });
});

vaultRouter.delete('/:id', async (req, res) => {
  const d = await ownVaultDoc(String(req.params.id), req.user!.id);
  await prisma.vaultDocument.delete({ where: { id: d.id } });
  await fsp.unlink(vaultPath(d.storageKey)).catch(() => undefined);
  await audit(req, 'vault.delete', d.id, { kind: d.kind });
  res.json({ ok: true });
});

const INLINE_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

vaultRouter.get('/:id/file', async (req, res) => {
  const d = await ownVaultDoc(String(req.params.id), req.user!.id);
  const disposition = req.query.download || !INLINE_MIME.has(d.mimeType) ? 'attachment' : 'inline';
  res.setHeader('Content-Type', d.mimeType);
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(d.filename)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(vaultPath(d.storageKey), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'FILE_NOT_FOUND' });
  });
});

/** Copies a vault file into a case as a normal (pending) document of a requirement. */
vaultRouter.post('/:id/use', async (req, res) => {
  const v = await ownVaultDoc(String(req.params.id), req.user!.id);
  const body = parse(z.object({ caseId: z.string().min(1), requirementId: z.string().min(1) }), req.body);
  const c = await ownCase(body.caseId, req.user!.id);
  // Same stage rules as POST /api/cases/:id/documents.
  const stage = CLIENT_UPLOAD_STAGE[c.status];
  if (!stage) throw conflict('UPLOAD_NOT_ALLOWED');
  const requirement = await prisma.documentRequirement.findUnique({ where: { id: body.requirementId } });
  if (!requirement || requirement.caseId !== c.id || requirement.stage !== stage) throw badRequest('INVALID_REQUIREMENT');

  const storedName = randomName(v.filename);
  try {
    await fsp.copyFile(vaultPath(v.storageKey), casePath(storedName));
  } catch {
    throw notFound('FILE_NOT_FOUND');
  }
  try {
    const doc = await prisma.document.create({
      data: {
        caseId: c.id,
        requirementId: requirement.id,
        stage,
        originalName: v.filename.slice(0, 200),
        storedName,
        mimeType: v.mimeType,
        size: v.size,
        uploadedById: req.user!.id,
        vaultDocumentId: v.id,
        expiresAt: v.expiresAt, // the vault's validity date drives the case document's expiry warnings
      },
    });
    await prisma.caseEvent.create({
      data: { caseId: c.id, type: 'DOCUMENT_UPLOADED', note: doc.originalName, actorId: req.user!.id, visibleToClient: false },
    });
    void emitAutomationEvent({ type: 'DOCUMENT_UPLOADED', entityType: 'document', entityId: doc.id, caseId: c.id }); // automation hook
    const checks = await checkCaseDocument(doc.id);
    await audit(req, 'vault.use', v.id, { caseId: c.id, documentId: doc.id });
    const quality = publicQuality(await prepareCaseDocument(doc.id)); // smart uploads: scan quality, never throws
    res.status(201).json({ document: { ...doc, checks }, checks, quality });
    scheduleAiDocCheck(doc.id); // AI check against the requirement (checks.ai)
    scheduleUploadAnalysis({ documentId: doc.id }); // recognition + proposals, in the background
  } catch (err) {
    await fsp.unlink(casePath(storedName)).catch(() => undefined);
    throw err;
  }
});
