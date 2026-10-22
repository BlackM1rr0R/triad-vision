import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Locale } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { limiter, notFound, parse } from '../../lib/http.js';
import { auditDetails, buildEmbassyPackage, MAX_COPIES, packagePreview } from '../../lib/caseNext/embassyPackage.js';
import { requestDocuments } from '../../lib/caseNext/requests.js';
import { nextStepFor } from '../../lib/caseNext/nextStep.js';
import { nextStepAi } from '../../lib/caseNext/ai.js';

/**
 * Admin case page: "Next step" card and the one-click embassy package. Mounted on the admin router
 * (STAFF+, 2FA enforced there):
 *
 *   GET  /cases/:id/next-step                       rules → { nextStep: { steps[≤3], total, clientLocale, … } }
 *   POST /cases/:id/next-step/ai                    AI explanation + client message draft (200 with ai.reason when unavailable)
 *   POST /cases/:id/next-step/request-documents     { items: [{ requirementId } | { requirementKey, title }] } — one notification
 *   GET  /cases/:id/embassy-package                 preview checklist (✓ found / ⚠ pending / ✗ missing / manual)
 *   POST /cases/:id/embassy-package                 { items?, separators?, copies?, format? } → saved Document + entries
 *   POST /cases/:id/embassy-package/request         { keys[] } request missing checklist items from the client
 *
 * Every action of a step runs through an existing endpoint (review, messages, /tasks, /actions …); the
 * endpoints here only add what did not exist yet.
 */
export const adminCaseNextRouter = Router();

const buildLimiter = limiter({ windowMs: 60 * 1000, limit: 6, skip: () => config.isTest });
const aiLimiter = limiter({ windowMs: 60 * 1000, limit: 20, skip: () => config.isTest });

const ensureCase = async (id: string) => {
  const c = await prisma.case.findUnique({ where: { id }, select: { id: true, number: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  return c;
};

const staffLocale = (req: Request) => ((req.user!.locale as Locale | undefined) ?? 'az');

// ─── Next step ─────────────────────────────────────────────────────

adminCaseNextRouter.get('/cases/:id/next-step', async (req, res) => {
  const c = await ensureCase(String(req.params.id));
  const out = await nextStepFor(c.id, { staffLocale: staffLocale(req) });
  if (!out) throw notFound('CASE_NOT_FOUND');
  res.json({ nextStep: out.view });
});

adminCaseNextRouter.post('/cases/:id/next-step/ai', aiLimiter, async (req, res) => {
  const c = await ensureCase(String(req.params.id));
  const out = await nextStepFor(c.id, { staffLocale: staffLocale(req) });
  if (!out) throw notFound('CASE_NOT_FOUND');
  const ai = await nextStepAi(out.facts, out.view, { id: req.user!.id, locale: staffLocale(req) });
  if (ai.ai.status === 'done' && !ai.cached) await audit(req, 'CASE_NEXT_STEP_AI', c.id, { steps: out.view.steps.map((s) => s.code), model: ai.ai.model ?? null, costUsd: ai.ai.costUsd ?? 0 });
  res.json({ ...ai, nextStep: out.view });
});

const l10n = z.object({ az: z.string().max(300), de: z.string().max(300), en: z.string().max(300), ru: z.string().max(300) });
const requestItem = z.union([
  z.object({ requirementId: z.string().trim().min(1).max(40) }).strict(),
  z.object({ requirementKey: z.string().trim().min(1).max(40), title: l10n }).strict(),
]);

adminCaseNextRouter.post('/cases/:id/next-step/request-documents', async (req, res) => {
  const body = parse(z.object({ items: z.array(requestItem).min(1).max(30) }), req.body ?? {});
  const c = await ensureCase(String(req.params.id));
  const requested = await requestDocuments(c.id, body.items, req.user!.id);
  await audit(req, 'CASE_NEXT_STEP_REQUEST_DOCUMENTS', c.id, { requirementIds: requested.map((r) => r.requirementId), created: requested.filter((r) => r.created).length });
  res.status(201).json({ requested });
});

// ─── Embassy package ───────────────────────────────────────────────

adminCaseNextRouter.get('/cases/:id/embassy-package', async (req, res) => {
  const c = await ensureCase(String(req.params.id));
  res.json({ preview: await packagePreview(c.id) });
});

const buildBody = z.object({
  items: z
    .array(z.object({ key: z.string().trim().min(1).max(60), include: z.boolean(), copies: z.number().int().min(1).max(MAX_COPIES).optional(), documentId: z.string().trim().min(1).max(40).optional() }))
    .max(80)
    .optional(),
  separators: z.boolean().optional(),
  copies: z.number().int().min(1).max(MAX_COPIES).optional(),
  format: z.enum(['pdf', 'zip']).optional(),
});

adminCaseNextRouter.post('/cases/:id/embassy-package', buildLimiter, async (req, res) => {
  const body = parse(buildBody, req.body ?? {});
  const c = await ensureCase(String(req.params.id));
  const result = await buildEmbassyPackage(c.id, body, { id: req.user!.id });
  await audit(req, 'EMBASSY_PACKAGE_BUILT', c.id, auditDetails(result));
  res.status(201).json(result);
});

adminCaseNextRouter.post('/cases/:id/embassy-package/request', async (req, res) => {
  const body = parse(z.object({ keys: z.array(z.string().trim().min(1).max(60)).min(1).max(40) }), req.body ?? {});
  const c = await ensureCase(String(req.params.id));
  const preview = await packagePreview(c.id);
  const items = preview.items.filter((i) => i.source === 'checklist' && body.keys.includes(i.key) && i.status !== 'found');
  if (!items.length) {
    res.status(200).json({ requested: [] });
    return;
  }
  const requested = await requestDocuments(
    c.id,
    items.map((i) => (i.requirementId ? { requirementId: i.requirementId } : { requirementKey: i.requirementKey ?? undefined, title: i.label })),
    req.user!.id,
  );
  await audit(req, 'EMBASSY_PACKAGE_REQUEST_MISSING', c.id, { keys: items.map((i) => i.key), requirementIds: requested.map((r) => r.requirementId) });
  res.status(201).json({ requested, preview: await packagePreview(c.id) });
});
