import { Router, type Request } from 'express';
import multer from 'multer';
import { decodeOriginalName } from '../../middleware/upload.js';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { parse } from '../../lib/http.js';
import { metaOf } from '../../lib/esign/http.js';
import { DEFAULT_EXPIRY_DAYS, type Actor } from '../../lib/esign/service.js';
import { INPUT_KEYS } from '../../lib/contracts/render.js';
import { STEPS } from '../../lib/caseContracts/flow.js';
import { approveStep, dropReturned, inspectUpload, returnDocument, sendStep, staffOverview, triadSign, uploadStep } from '../../lib/caseContracts/service.js';
import { MAX_WORK_DOCS } from '../../lib/caseContracts/flow.js';
import { MAX_PDF_BYTES } from '../../lib/esign/service.js';
import { placementsSchema } from '../../lib/esign/placements.js';
import { badRequest } from '../../lib/http.js';
import { invalidateMyWork } from '../../lib/myWork.js';

/**
 * Two-step case contracts (lib/caseContracts) — mounted at /api/admin/case-contracts (STAFF+, area "documents"):
 *   GET  /cases/:caseId              both steps: state, latest request, blocked reason, templates
 *   POST /cases/:caseId/send         { step: LABOUR|WORK, templateId, inputs, message?, expiresInDays? }
 *   POST /cases/:caseId/triad-sign   { step, mode: DRAW|TYPE, signature | typedName, agree: true } — Triad Vision signs first
 *   POST /cases/:caseId/approve      { step } — staff approve the fully signed contract
 *   POST /inspect                    multipart "file" (PDF) → pages + AcroForm fields (signature places of the upload dialog)
 *   POST /cases/:caseId/upload       V2: multipart "files" (Əmək: 1, İş: 1–10) + "meta" JSON { step, placements: [[…] per file],
 *                                    message?, expiresInDays?, replacesId? } — staff's own PDF(s), the client signs first
 *   POST /cases/:caseId/return       V2: { step, requestId?, reason } — send a document back (the client sees the reason)
 *   POST /cases/:caseId/drop         V2: { requestId } — drop a returned İş müqaviləsi document from the set
 * Preview of a template for the case: POST /api/admin/contract-templates/:id/preview (unchanged).
 */
export const adminCaseContractsRouter = Router();

const step = z.enum(STEPS);
const inputs = z
  .object(Object.fromEntries(INPUT_KEYS.map((k) => [k, z.string().trim().max(500).optional()])) as Record<string, z.ZodOptional<z.ZodString>>)
  .strip()
  .default({});

const sendSchema = z.object({
  step,
  templateId: z.string().trim().min(1).max(40),
  inputs,
  message: z.string().trim().max(4000).nullish(),
  expiresInDays: z.number().int().min(1).max(90).default(DEFAULT_EXPIRY_DAYS),
});

const signSchema = z.discriminatedUnion('mode', [
  z.object({ step, mode: z.literal('DRAW'), signature: z.string().max(1_500_000), agree: z.literal(true) }),
  z.object({ step, mode: z.literal('TYPE'), typedName: z.string().trim().min(2).max(160), agree: z.literal(true) }),
]);

const actorOf = (req: Request): Actor => ({ id: req.user!.id, role: req.user!.role, firstName: req.user!.firstName, lastName: req.user!.lastName });
const caseIdOf = (req: Request) => String(req.params.caseId);

adminCaseContractsRouter.get('/cases/:caseId', async (req, res) => {
  res.json(await staffOverview(caseIdOf(req), { id: req.user!.id, role: req.user!.role }));
});

adminCaseContractsRouter.post('/cases/:caseId/send', async (req, res) => {
  const body = parse(sendSchema, req.body ?? {});
  const actor = actorOf(req);
  const out = await sendStep(caseIdOf(req), body, actor, { ...metaOf(req), actorId: actor.id });
  void audit(req, 'caseContract.send', out.signatureRequestId, { caseId: caseIdOf(req), step: body.step, templateId: body.templateId, caseContract: out.caseContract, missing: out.missing });
  invalidateMyWork(out.triadSignerId);
  res.status(201).json(out);
});

adminCaseContractsRouter.post('/cases/:caseId/triad-sign', async (req, res) => {
  const body = parse(signSchema, req.body ?? {});
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { id: true, role: true, firstName: true, lastName: true, email: true } });
  const requestId = await triadSign(caseIdOf(req), body.step, me, body.mode === 'DRAW' ? { mode: 'DRAW', signature: body.signature } : { mode: 'TYPE', typedName: body.typedName }, metaOf(req));
  void audit(req, 'caseContract.triadSign', requestId, { caseId: caseIdOf(req), step: body.step, mode: body.mode });
  invalidateMyWork(me.id);
  res.json(await staffOverview(caseIdOf(req), { id: me.id, role: me.role }));
});

adminCaseContractsRouter.post('/cases/:caseId/approve', async (req, res) => {
  const body = parse(z.object({ step }), req.body ?? {});
  const requestId = await approveStep(caseIdOf(req), body.step, actorOf(req));
  void audit(req, 'caseContract.approve', requestId, { caseId: caseIdOf(req), step: body.step });
  res.json(await staffOverview(caseIdOf(req), { id: req.user!.id, role: req.user!.role }));
});

// ─── V2: staff's own PDF with signature places ────────────────────────

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: MAX_WORK_DOCS },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname)),
});

adminCaseContractsRouter.post('/inspect', pdfUpload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('FILE_REQUIRED');
  res.json(await inspectUpload(req.file.buffer));
});

const uploadMeta = z.object({
  step,
  placements: z.array(placementsSchema).min(1).max(MAX_WORK_DOCS),
  message: z.string().trim().max(4000).nullish(),
  expiresInDays: z.number().int().min(1).max(90).default(DEFAULT_EXPIRY_DAYS),
  replacesId: z.string().trim().max(40).nullish(),
});

adminCaseContractsRouter.post('/cases/:caseId/upload', pdfUpload.array('files', MAX_WORK_DOCS), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw badRequest('FILE_REQUIRED');
  let raw: unknown;
  try {
    raw = JSON.parse(String(req.body?.meta ?? '{}'));
  } catch {
    throw badRequest('INVALID_JSON');
  }
  const meta = parse(uploadMeta, raw);
  if (meta.placements.length !== files.length) throw badRequest('PLACEMENTS_PER_FILE');
  const actor = actorOf(req);
  const out = await uploadStep(
    caseIdOf(req),
    { step: meta.step, files: files.map((f, i) => ({ buffer: f.buffer, name: decodeOriginalName(f.originalname), placements: meta.placements[i] })), message: meta.message, expiresInDays: meta.expiresInDays, replacesId: meta.replacesId },
    actor,
    { ...metaOf(req), actorId: actor.id },
  );
  void audit(req, 'caseContract.upload', out.signatureRequestIds.join(','), { caseId: caseIdOf(req), step: meta.step, files: files.length, caseContract: out.caseContract, replacesId: meta.replacesId ?? null });
  if (out.triadSignerId) invalidateMyWork(out.triadSignerId);
  res.status(201).json({ ...out, overview: await staffOverview(caseIdOf(req), { id: req.user!.id, role: req.user!.role }) });
});

adminCaseContractsRouter.post('/cases/:caseId/return', async (req, res) => {
  const body = parse(z.object({ step, requestId: z.string().trim().max(40).nullish(), reason: z.string().trim().min(3).max(2000) }), req.body ?? {});
  const requestId = await returnDocument(caseIdOf(req), body, actorOf(req), metaOf(req));
  void audit(req, 'caseContract.return', requestId, { caseId: caseIdOf(req), step: body.step });
  res.json(await staffOverview(caseIdOf(req), { id: req.user!.id, role: req.user!.role }));
});

adminCaseContractsRouter.post('/cases/:caseId/drop', async (req, res) => {
  const body = parse(z.object({ requestId: z.string().trim().min(1).max(40) }), req.body ?? {});
  const requestId = await dropReturned(caseIdOf(req), body.requestId);
  void audit(req, 'caseContract.drop', requestId, { caseId: caseIdOf(req) });
  res.json(await staffOverview(caseIdOf(req), { id: req.user!.id, role: req.user!.role }));
});
