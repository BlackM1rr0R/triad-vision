import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { RECOGNITION_STATUSES } from '../../lib/matching.js';
import { createShareLink, listShareLinks, MAX_LINK_DAYS, employerSharingAllowed } from '../../lib/placement/shareLinks.js';
import { candidateEvaluations } from '../../lib/placement/evaluations.js';
import { introVideoInfo, sendIntroVideo } from '../../lib/placement/introVideo.js';
import { CONTRACT_FILTERS, contractInput, listContracts, loadContract, prefillFromAi, saveContract } from '../../lib/placement/employmentContract.js';

/**
 * Admin: candidate placement & employer collaboration — mounted at /api/admin/placement (STAFF+).
 *
 *   PATCH /candidates/:id/recognition          { recognitionStatus, recognitionNote } (Anerkennung, used by matching)
 *   GET   /candidates/:id/share-links          employer share links of a candidate (+ whether sharing is allowed)
 *   POST  /candidates/:id/share-links          { applicationId?, companyId?, vacancyId?, days? } → { url } (shown once)
 *   POST  /share-links/:linkId/revoke
 *   GET   /candidates/:id/evaluations          interview evaluations with averages
 *   GET   /candidates/:id/intro-video          { video } / GET …/intro-video/file (stream)
 *   GET   /cases/:caseId/contract              employment contract tracker (Arbeitsvertrag) of a case
 *   PUT   /cases/:caseId/contract              create / update (checks + probation end recomputed)
 *   GET   /cases/:caseId/contract/prefill      proposal from the latest AI contract check
 *   GET   /contracts?filter=warnings|probation|all
 */
export const adminPlacementRouter = Router();

const candidateOr404 = async (id: string) => {
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, introVideoKey: true } });
  if (!u || u.role !== 'CLIENT') throw notFound('CANDIDATE_NOT_FOUND');
  return u;
};

// ─── Recognition ───────────────────────────────────────────────────────

adminPlacementRouter.patch('/candidates/:id/recognition', async (req, res) => {
  const body = parse(
    z.object({
      recognitionStatus: z.enum(RECOGNITION_STATUSES).nullable().optional(),
      recognitionNote: z.string().trim().max(300).nullable().optional(),
    }),
    req.body,
  );
  const u = await candidateOr404(String(req.params.id));
  const data: { recognitionStatus?: string | null; recognitionNote?: string | null } = {};
  if (body.recognitionStatus !== undefined) data.recognitionStatus = body.recognitionStatus;
  if (body.recognitionNote !== undefined) data.recognitionNote = body.recognitionNote || null;
  const user = await prisma.user.update({ where: { id: u.id }, data, select: { recognitionStatus: true, recognitionNote: true } });
  await audit(req, 'CANDIDATE_RECOGNITION_SET', `user:${u.id}`, { recognitionStatus: user.recognitionStatus });
  res.json(user);
});

// ─── Employer share links ─────────────────────────────────────────────

adminPlacementRouter.get('/candidates/:id/share-links', async (req, res) => {
  const u = await candidateOr404(String(req.params.id));
  const [items, allowed] = await Promise.all([listShareLinks(u.id), employerSharingAllowed(u.id)]);
  res.json({ items, sharingAllowed: allowed, maxDays: MAX_LINK_DAYS });
});

adminPlacementRouter.post('/candidates/:id/share-links', async (req, res) => {
  const body = parse(
    z.object({
      applicationId: z.string().max(40).nullable().optional(),
      companyId: z.string().max(40).nullable().optional(),
      vacancyId: z.string().max(40).nullable().optional(),
      days: z.number().int().min(1).max(MAX_LINK_DAYS).optional(),
    }),
    req.body ?? {},
  );
  const { link, url } = await createShareLink(String(req.params.id), body, req.user!.id);
  await audit(req, 'CANDIDATE_SHARE_LINK_CREATED', `candidateShare:${link.id}`, { candidateId: link.candidateId, applicationId: link.applicationId, companyId: link.companyId, vacancyId: link.vacancyId, expiresAt: link.expiresAt.toISOString() });
  res.status(201).json({ id: link.id, url, expiresAt: link.expiresAt });
});

adminPlacementRouter.post('/share-links/:linkId/revoke', async (req, res) => {
  const link = await prisma.candidateShareLink.findUnique({ where: { id: String(req.params.linkId) } });
  if (!link) throw notFound('SHARE_NOT_FOUND');
  if (!link.revokedAt) await prisma.candidateShareLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
  await audit(req, 'CANDIDATE_SHARE_LINK_REVOKED', `candidateShare:${link.id}`, { candidateId: link.candidateId });
  res.json({ ok: true });
});

// ─── Evaluations / video ──────────────────────────────────────────────

adminPlacementRouter.get('/candidates/:id/evaluations', async (req, res) => {
  const u = await candidateOr404(String(req.params.id));
  res.json(await candidateEvaluations(u.id));
});

adminPlacementRouter.get('/candidates/:id/intro-video', async (req, res) => {
  const u = await candidateOr404(String(req.params.id));
  res.json({ video: await introVideoInfo(u.introVideoKey) });
});

adminPlacementRouter.get('/candidates/:id/intro-video/file', async (req, res) => {
  const u = await candidateOr404(String(req.params.id));
  await sendIntroVideo(res, u.introVideoKey);
});

// ─── Employment contract ──────────────────────────────────────────────

adminPlacementRouter.get('/contracts', async (req, res) => {
  const q = parse(z.object({ filter: z.enum(CONTRACT_FILTERS).default('warnings') }), req.query);
  res.json(await listContracts(q.filter));
});

adminPlacementRouter.get('/cases/:caseId/contract', async (req, res) => {
  res.json(await loadContract(String(req.params.caseId)));
});

adminPlacementRouter.put('/cases/:caseId/contract', async (req, res) => {
  const body = parse(contractInput, req.body ?? {});
  const out = await saveContract(String(req.params.caseId), body, req.user!.id);
  await audit(req, out.created ? 'EMPLOYMENT_CONTRACT_CREATED' : 'EMPLOYMENT_CONTRACT_UPDATED', `case:${out.case.id}`, {
    fields: Object.keys(body),
    warnings: out.contract.warnings.map((w) => w.code),
    blueCardCheck: out.contract.blueCardCheck,
  });
  res.status(out.created ? 201 : 200).json({ contract: out.contract });
});

adminPlacementRouter.get('/cases/:caseId/contract/prefill', async (req, res) => {
  res.json(await prefillFromAi(String(req.params.caseId)));
});
