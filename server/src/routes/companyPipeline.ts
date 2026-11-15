import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { forbidden, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { buildPipeline } from '../lib/employerPipeline/service.js';
import { isDigestOn, setDigest } from '../lib/employerPipeline/digest.js';

/**
 * Employer candidate pipeline — mounted at /api/company/pipeline (COMPANY role; a suspended company gets
 * 403 COMPANY_SUSPENDED like every company router):
 *
 *   GET /               cards (own company's workers only, panel permission rules), month strip, summary
 *   GET /preferences    { weeklyDigest } of the signed-in portal user
 *   PUT /preferences    { weeklyDigest: boolean } — opt in to / out of the weekly e-mail digest
 *
 * Realtime: `pipeline.updated` { caseId } (lib/employerPipeline/realtime) tells the portal to refetch.
 */
export const companyPipelineRouter = Router();
companyPipelineRouter.use(requireRole('COMPANY'));
companyPipelineRouter.use(async (req, res, next) => {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { company: { select: { id: true, status: true } } } });
  if (!u?.company) return next(forbidden('NO_COMPANY'));
  if (u.company.status === 'SUSPENDED') return next(forbidden('COMPANY_SUSPENDED'));
  res.locals.companyId = u.company.id;
  next();
});

const companyId = (res: { locals: Record<string, unknown> }) => res.locals.companyId as string;

companyPipelineRouter.get('/', async (req, res) => {
  res.json(await buildPipeline(companyId(res), new Date(), req.user!.id));
});

companyPipelineRouter.get('/preferences', async (req, res) => {
  res.json({ weeklyDigest: await isDigestOn(req.user!.id) });
});

companyPipelineRouter.put('/preferences', async (req, res) => {
  const body = parse(z.object({ weeklyDigest: z.boolean() }), req.body);
  await setDigest(req.user!.id, body.weeklyDigest);
  await audit(req, 'EMPLOYER_PIPELINE_DIGEST', `company:${companyId(res)}`, { weeklyDigest: body.weeklyDigest });
  res.json({ weeklyDigest: body.weeklyDigest });
});
