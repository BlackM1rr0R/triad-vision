import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { parse } from '../../lib/http.js';
import { metaOf } from '../../lib/esign/http.js';
import { DEFAULT_EXPIRY_DAYS, type Actor } from '../../lib/esign/service.js';
import { INPUT_KEYS } from '../../lib/contracts/render.js';
import { STEPS } from '../../lib/caseContracts/flow.js';
import { approveStep, sendStep, staffOverview, triadSign } from '../../lib/caseContracts/service.js';
import { invalidateMyWork } from '../../lib/myWork.js';

/**
 * Two-step case contracts (lib/caseContracts) — mounted at /api/admin/case-contracts (STAFF+, area "documents"):
 *   GET  /cases/:caseId              both steps: state, latest request, blocked reason, templates
 *   POST /cases/:caseId/send         { step: LABOUR|WORK, templateId, inputs, message?, expiresInDays? }
 *   POST /cases/:caseId/triad-sign   { step, mode: DRAW|TYPE, signature | typedName, agree: true } — Triad Vision signs first
 *   POST /cases/:caseId/approve      { step } — staff approve the fully signed contract
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
