import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { clearRealSalaryCache, recomputeRealSalaries, staffOverview } from '../../lib/realSalaries/service.js';

/**
 * Real salary database — staff side (/api/admin/real-salaries; the admin router requires STAFF):
 *   GET    /                       every contract record (amount, why it is not used), group preview with exact
 *                                  worker counts and hide reasons, latest snapshot (internal view)
 *   POST   /exclusions             { caseId, reason? } leave a contract out of the public ranges
 *   DELETE /exclusions/:caseId     include it again
 *   POST   /recompute              new snapshot now (ADMIN+; otherwise the monthly job does it)
 * Exclusions take effect with the next snapshot (staff recompute or the monthly job).
 */
export const adminRealSalariesRouter = Router();

adminRealSalariesRouter.get('/', async (_req, res) => {
  res.json(await staffOverview());
});

adminRealSalariesRouter.post('/exclusions', async (req, res) => {
  const body = parse(z.object({ caseId: z.string().trim().min(1).max(40), reason: z.string().trim().max(300).optional().nullable() }), req.body);
  if (!(await prisma.employmentContract.findUnique({ where: { caseId: body.caseId }, select: { id: true } }))) throw notFound('CONTRACT_NOT_FOUND');
  await prisma.realSalaryExclusion.upsert({
    where: { caseId: body.caseId },
    create: { caseId: body.caseId, reason: body.reason || null, createdById: req.user!.id },
    update: { reason: body.reason || null, createdById: req.user!.id },
  });
  await audit(req, 'REAL_SALARY_EXCLUDED', `case:${body.caseId}`, { reason: body.reason ?? null });
  res.json({ ok: true });
});

adminRealSalariesRouter.delete('/exclusions/:caseId', async (req, res) => {
  const caseId = String(req.params.caseId).slice(0, 40);
  const { count } = await prisma.realSalaryExclusion.deleteMany({ where: { caseId } });
  if (!count) throw notFound('EXCLUSION_NOT_FOUND');
  await audit(req, 'REAL_SALARY_INCLUDED', `case:${caseId}`);
  res.json({ ok: true });
});

adminRealSalariesRouter.post('/recompute', requireMinRole('ADMIN'), async (req, res) => {
  clearRealSalaryCache();
  const data = await recomputeRealSalaries();
  await audit(req, 'REAL_SALARIES_RECOMPUTED', 'real-salaries', { groups: data.groups.length, hidden: data.hiddenGroups });
  res.json({ month: data.month, computedAt: data.computedAt, groups: data.groups.length, hiddenGroups: data.hiddenGroups });
});
