import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import { invalidateMyWork } from '../../lib/myWork.js';
import { getCheckInSettings, leftSchema, overview, overviewQuery, runCheckIns, saveCheckInSettings, settingsSchema } from '../../lib/checkIns/service.js';

/**
 * Post-arrival check-ins, staff side (mounted at /api/admin/check-ins, STAFF+):
 *
 *   GET   /overview                retention dashboard            ?from&to&companyId&status
 *   POST  /:id/resolve             mark a reported problem as handled { note? }
 *   PATCH /follow-ups/:id/left     "left the job" (or undo)          { left, leftAt?, reason?, note? }
 *   GET   /settings                offsets / employer check-in
 *   PUT   /settings                ADMIN+
 *   POST  /run                     ADMIN+: send what is due now (the job runs hourly anyway)
 */
export const adminCheckInsRouter = Router();

adminCheckInsRouter.get('/overview', async (req, res) => {
  res.json(await overview(parse(overviewQuery, req.query)));
});

adminCheckInsRouter.post('/:id/resolve', async (req, res) => {
  const body = parse(z.object({ note: z.string().trim().max(1000).nullish() }), req.body ?? {});
  const c = await prisma.arrivalCheckIn.findUnique({ where: { id: String(req.params.id) } });
  if (!c) throw notFound('CHECKIN_NOT_FOUND');
  if (c.answer !== 'ISSUE') throw badRequest('NOT_AN_ISSUE');
  const saved = c.resolvedAt ? c : await prisma.arrivalCheckIn.update({ where: { id: c.id }, data: { resolvedAt: new Date(), resolvedById: req.user!.id } });
  await audit(req, 'CHECKIN_ISSUE_RESOLVED', `checkin:${c.id}`, { caseId: c.caseId, note: body.note ?? null });
  invalidateMyWork();
  res.json({ checkIn: { id: saved.id, resolvedAt: saved.resolvedAt } });
});

adminCheckInsRouter.patch('/follow-ups/:id/left', async (req, res) => {
  const body = parse(leftSchema, req.body ?? {});
  const f = await prisma.arrivalFollowUp.findUnique({ where: { id: String(req.params.id) } });
  if (!f) throw notFound('FOLLOW_UP_NOT_FOUND');
  if (body.left && !body.reason) throw badRequest('REASON_REQUIRED');
  const leftAt = body.left ? (body.leftAt ? new Date(`${body.leftAt}T12:00:00Z`) : new Date()) : null;
  if (leftAt && leftAt < f.arrivedAt) throw badRequest('LEFT_BEFORE_ARRIVAL');
  const saved = await prisma.arrivalFollowUp.update({
    where: { id: f.id },
    data: body.left ? { leftJobAt: leftAt, leftReason: body.reason, leftNote: body.note || null, leftMarkedById: req.user!.id } : { leftJobAt: null, leftReason: null, leftNote: null, leftMarkedById: req.user!.id },
  });
  await audit(req, body.left ? 'WORKER_LEFT_JOB' : 'WORKER_LEFT_JOB_UNDONE', `case:${f.caseId}`, { followUpId: f.id, reason: body.reason ?? null, leftAt: leftAt?.toISOString() ?? null });
  res.json({ followUp: saved });
});

adminCheckInsRouter.get('/settings', async (_req, res) => {
  res.json({ settings: await getCheckInSettings() });
});

adminCheckInsRouter.put('/settings', requireMinRole('ADMIN'), async (req, res) => {
  const saved = await saveCheckInSettings(parse(settingsSchema, req.body?.settings ?? req.body ?? {}));
  await audit(req, 'CHECKIN_SETTINGS', 'setting:checkIns', saved);
  res.json({ settings: saved });
});

adminCheckInsRouter.post('/run', requireMinRole('ADMIN'), async (_req, res) => {
  res.json(await runCheckIns());
});
