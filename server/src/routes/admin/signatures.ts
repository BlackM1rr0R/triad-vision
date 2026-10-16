import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import { DriveAccessCtx, requireNode } from '../../lib/drive/access.js';
import { storagePath } from '../../lib/drive/storage.js';
import {
  DEFAULT_EXPIRY_DAYS,
  MAX_PDF_BYTES,
  MAX_SIGNERS,
  cancelRequest,
  createRequest,
  logEvent,
  remindRequest,
  sendRequest,
  staffDetail,
  staffSummary,
  updateSignerEmail,
  type Actor,
} from '../../lib/esign/service.js';
import { metaOf, pdfUpload, sendPdf } from '../../lib/esign/http.js';

/** Staff side of the e-signature module, mounted at /api/admin/signatures (STAFF+ with 2FA). */
export const adminSignaturesRouter = Router();

const actorOf = (req: Express.Request): Actor => ({ id: req.user!.id, role: req.user!.role, firstName: req.user!.firstName, lastName: req.user!.lastName });

const STATUSES = ['DRAFT', 'SENT', 'COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED'] as const;
const ROLES = ['CANDIDATE', 'COMPANY', 'STAFF', 'OTHER'] as const;
const id = z.string().trim().min(1).max(40);

const signerSchema = z.object({
  role: z.enum(ROLES),
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().toLowerCase().email().max(191),
  userId: id.nullish(),
  locale: z.enum(['az', 'de', 'en', 'ru']).nullish(),
  order: z.number().int().min(1).max(99).nullish(),
});

const createSchema = z.object({
  title: z.string().trim().min(2).max(200),
  caseId: id.nullish(),
  companyId: id.nullish(),
  message: z.string().trim().max(4000).nullish(),
  expiresInDays: z.number().int().min(1).max(90).default(DEFAULT_EXPIRY_DAYS),
  order: z.enum(['SEQUENTIAL', 'PARALLEL']).default('SEQUENTIAL'),
  caseContract: z.boolean().default(false),
  send: z.boolean().default(true),
  source: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('upload') }),
      z.object({ type: z.literal('caseDocument'), documentId: id }),
      z.object({ type: z.literal('drive'), nodeId: id }),
    ])
    .default({ type: 'upload' }),
  signers: z.array(signerSchema).min(1).max(MAX_SIGNERS),
});

// ─── List / prefill ────────────────────────────────────────────────────

adminSignaturesRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(STATUSES).optional(),
      q: z.string().trim().max(120).optional(),
      caseId: id.optional(),
      companyId: id.optional(),
      mine: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
      page: z.coerce.number().int().min(1).max(1000).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }),
    req.query,
  );
  const where: Prisma.SignatureRequestWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.caseId ? { caseId: q.caseId } : {}),
    ...(q.companyId ? { companyId: q.companyId } : {}),
    ...(q.mine ? { createdById: req.user!.id } : {}),
    ...(q.q
      ? {
          OR: [
            { title: { contains: q.q } },
            { originalName: { contains: q.q } },
            { case: { number: { contains: q.q } } },
            { company: { name: { contains: q.q } } },
            { signers: { some: { OR: [{ name: { contains: q.q } }, { email: { contains: q.q } }] } } },
          ],
        }
      : {}),
  };
  const baseWhere: Prisma.SignatureRequestWhereInput = { ...where, status: undefined };
  const [rows, total, byStatus] = await Promise.all([
    prisma.signatureRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        signers: true,
        case: { select: { id: true, number: true } },
        company: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.signatureRequest.count({ where }),
    prisma.signatureRequest.groupBy({ by: ['status'], where: baseWhere, _count: { _all: true } }),
  ]);
  res.json({
    items: rows.map(staffSummary),
    total,
    page: q.page,
    pageSize: q.pageSize,
    counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
  });
});

/** Suggested signers and PDFs for a new request from a case or a company page. */
adminSignaturesRouter.get('/prefill', async (req, res) => {
  const q = parse(z.object({ caseId: id.optional(), companyId: id.optional() }), req.query);
  const signers: z.infer<typeof signerSchema>[] = [];
  let caseInfo = null;
  let companyId = q.companyId ?? null;
  let documents: { id: string; originalName: string; stage: string; size: number; createdAt: Date }[] = [];
  if (q.caseId) {
    const c = await prisma.case.findUnique({
      where: { id: q.caseId },
      include: { client: { select: { id: true, firstName: true, lastName: true, email: true, locale: true } }, contract: { select: { signatureRequestId: true, signedAt: true } } },
    });
    if (!c) throw notFound('CASE_NOT_FOUND');
    caseInfo = {
      id: c.id,
      number: c.number,
      status: c.status,
      profession: c.profession,
      contractAllowed: ['DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED'].includes(c.status),
    };
    companyId = companyId ?? c.companyId;
    signers.push({ role: 'CANDIDATE', name: `${c.client.firstName} ${c.client.lastName}`.trim(), email: c.client.email, userId: c.client.id, locale: c.client.locale, order: 1 });
    documents = await prisma.document.findMany({
      where: { caseId: c.id, mimeType: 'application/pdf' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, originalName: true, stage: true, size: true, createdAt: true },
    });
  }
  let company = null;
  if (companyId) {
    const co = await prisma.company.findUnique({
      where: { id: companyId },
      include: { users: { where: { isActive: true }, select: { id: true, firstName: true, lastName: true, email: true, locale: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (co) {
      company = { id: co.id, name: co.name };
      for (const u of co.users) signers.push({ role: 'COMPANY', name: `${u.firstName} ${u.lastName}`.trim(), email: u.email, userId: u.id, locale: u.locale, order: 2 });
    }
  }
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { id: true, firstName: true, lastName: true, email: true, locale: true } });
  res.json({
    case: caseInfo,
    company,
    signers,
    staff: { role: 'STAFF', name: `${me.firstName} ${me.lastName}`.trim(), email: me.email, userId: me.id, locale: me.locale, order: 3 },
    documents,
    defaults: { expiresInDays: DEFAULT_EXPIRY_DAYS, maxBytes: MAX_PDF_BYTES },
  });
});

// ─── Create / send ─────────────────────────────────────────────────────

/** JSON body, or multipart with `file` (PDF) + `payload` (the same JSON as a string). */
adminSignaturesRouter.post('/', pdfUpload.single('file'), async (req, res) => {
  let raw: unknown = req.body;
  if (typeof req.body?.payload === 'string') {
    try {
      raw = JSON.parse(req.body.payload);
    } catch {
      throw badRequest('INVALID_JSON');
    }
  }
  const body = parse(createSchema, raw);

  let pdf: Buffer;
  let fileName: string;
  if (body.source.type === 'upload') {
    if (!req.file) throw badRequest('FILE_REQUIRED');
    pdf = req.file.buffer;
    fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  } else if (body.source.type === 'caseDocument') {
    const doc = await prisma.document.findUnique({ where: { id: body.source.documentId } });
    if (!doc || !body.caseId || doc.caseId !== body.caseId) throw notFound('DOCUMENT_NOT_FOUND');
    if (doc.mimeType !== 'application/pdf') throw badRequest('INVALID_PDF');
    pdf = await fs.readFile(path.join(config.uploads.privateDir, path.basename(doc.storedName))).catch(() => {
      throw notFound('DOCUMENT_NOT_FOUND');
    });
    fileName = doc.originalName;
  } else {
    const ctx = new DriveAccessCtx({ id: req.user!.id, role: req.user!.role });
    const { node } = await requireNode(ctx, body.source.nodeId, 'DOWNLOAD');
    const file = await prisma.driveNode.findUnique({ where: { id: node.id }, select: { kind: true, storageKey: true, mimeType: true, name: true, size: true } });
    if (!file || file.kind !== 'FILE' || !file.storageKey) throw notFound('NODE_NOT_FOUND');
    if (file.mimeType !== 'application/pdf') throw badRequest('INVALID_PDF');
    if ((file.size ?? 0) > MAX_PDF_BYTES) throw badRequest('FILE_TOO_LARGE');
    pdf = await fs.readFile(storagePath(file.storageKey));
    fileName = file.name;
  }

  const actor = actorOf(req);
  const meta = { ...metaOf(req), actorId: actor.id };
  const created = await createRequest(
    {
      title: body.title,
      caseId: body.caseId ?? null,
      companyId: body.companyId ?? null,
      message: body.message ?? null,
      expiresAt: new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000),
      order: body.order,
      caseContract: body.caseContract,
      signers: body.signers,
      pdf,
      fileName,
    },
    actor,
    meta,
  );
  if (body.send) {
    try {
      await sendRequest(created.id, actor, meta);
    } catch (err) {
      // Nothing was sent: do not leave a half-made draft behind.
      await prisma.signatureRequest.delete({ where: { id: created.id } }).catch(() => undefined);
      await fs.unlink(path.join(config.uploads.privateDir, created.originalKey)).catch(() => undefined);
      throw err;
    }
  }
  void audit(req, 'signature.create', created.id, { title: created.title, caseId: created.caseId, sent: body.send });
  res.status(201).json({ request: await staffDetail(created.id) });
});

adminSignaturesRouter.get('/:id', async (req, res) => {
  res.json({ request: await staffDetail(String(req.params.id)) });
});

adminSignaturesRouter.post('/:id/send', async (req, res) => {
  const actor = actorOf(req);
  await sendRequest(String(req.params.id), actor, { ...metaOf(req), actorId: actor.id });
  void audit(req, 'signature.send', String(req.params.id));
  res.json({ request: await staffDetail(String(req.params.id)) });
});

adminSignaturesRouter.post('/:id/remind', async (req, res) => {
  const { signerId } = parse(z.object({ signerId: id.nullish() }), req.body ?? {});
  const actor = actorOf(req);
  const result = await remindRequest(String(req.params.id), actor, signerId ?? null, { ...metaOf(req), actorId: actor.id });
  res.json({ ...result, request: await staffDetail(String(req.params.id)) });
});

/** New personal link for one signer (optionally to a corrected email address). */
adminSignaturesRouter.post('/:id/signers/:signerId/resend', async (req, res) => {
  const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email().max(191).optional() }), req.body ?? {});
  const rid = String(req.params.id);
  const sid = String(req.params.signerId);
  if (email) await updateSignerEmail(rid, sid, email);
  const actor = actorOf(req);
  await remindRequest(rid, actor, sid, { ...metaOf(req), actorId: actor.id });
  void audit(req, 'signature.resend', rid, { signerId: sid, emailChanged: !!email });
  res.json({ request: await staffDetail(rid) });
});

adminSignaturesRouter.post('/:id/cancel', async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().max(1000).nullish() }), req.body ?? {});
  const actor = actorOf(req);
  await cancelRequest(String(req.params.id), actor, reason ?? null, { ...metaOf(req), actorId: actor.id });
  void audit(req, 'signature.cancel', String(req.params.id));
  res.json({ request: await staffDetail(String(req.params.id)) });
});

/** ?version=original|final (default: final when completed), ?download=1 for an attachment. */
adminSignaturesRouter.get('/:id/document', async (req, res) => {
  const q = parse(z.object({ version: z.enum(['original', 'final']).optional(), download: z.string().optional() }), req.query);
  const r = await prisma.signatureRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!r) throw notFound('SIGNATURE_REQUEST_NOT_FOUND');
  const version = q.version ?? (r.finalKey ? 'final' : 'original');
  const key = version === 'final' ? r.finalKey : r.originalKey;
  if (!key) throw notFound('DOCUMENT_NOT_FOUND');
  await logEvent(r.id, 'DOWNLOADED', { ...metaOf(req), actorId: req.user!.id, note: version });
  const base = r.originalName.replace(/\.pdf$/i, '');
  sendPdf(res, key, version === 'final' ? `${base}-signed.pdf` : r.originalName, !!q.download);
});
