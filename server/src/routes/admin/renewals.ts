import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { conflict, notFound, parse } from '../../lib/http.js';
import { parseDay } from '../../lib/expiry/index.js';
import { caseCare, getRenewalSettings, openRenewalCase, renewalSettingsSchema, runRenewals, saveRenewalSettings, upcomingCare } from '../../lib/renewals/service.js';

/**
 * Residence-title renewal and probation end (lib/renewals), mounted at /api/admin/renewals (STAFF+):
 *
 *   GET   /cases/:id                 card of the admin case page (title expiry, probation, renewal links)
 *   PATCH /cases/:id                 { residenceTitleExpiresAt: 'YYYY-MM-DD' | null } — audited
 *   POST  /cases/:id/open            open the renewal case now (instead of waiting for the job)
 *   GET   /upcoming?days&staffId     the extra sections of /admin/expiring
 *   GET   /settings · PUT /settings  lead days (PUT ADMIN+)
 *   POST  /run                       ADMIN+: run the daily job now
 */
export const adminRenewalsRouter = Router();

const dayString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
  .refine((v) => parseDay(v) !== null, 'Invalid date');

adminRenewalsRouter.get('/cases/:id', async (req, res) => {
  const care = await caseCare(String(req.params.id));
  if (!care) throw notFound('CASE_NOT_FOUND');
  res.json({ care });
});

adminRenewalsRouter.patch('/cases/:id', async (req, res) => {
  const body = parse(z.object({ residenceTitleExpiresAt: dayString.nullable() }), req.body ?? {});
  const c = await prisma.case.findUnique({ where: { id: String(req.params.id) }, select: { id: true, residenceTitleExpiresAt: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const value = body.residenceTitleExpiresAt ? parseDay(body.residenceTitleExpiresAt) : null;
  await prisma.case.update({ where: { id: c.id }, data: { residenceTitleExpiresAt: value } });
  await audit(req, 'RESIDENCE_TITLE_EXPIRY_SET', `case:${c.id}`, { from: c.residenceTitleExpiresAt?.toISOString().slice(0, 10) ?? null, to: body.residenceTitleExpiresAt });
  res.json({ care: await caseCare(c.id) });
});

adminRenewalsRouter.post('/cases/:id/open', async (req, res) => {
  const c = await prisma.case.findUnique({ where: { id: String(req.params.id) }, select: { id: true, residenceTitleExpiresAt: true, renewalCaseCreatedAt: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  if (!c.residenceTitleExpiresAt) throw conflict('NO_RESIDENCE_TITLE_DATE');
  if (c.renewalCaseCreatedAt) throw conflict('RENEWAL_EXISTS');
  const created = await openRenewalCase(c.id, new Date(), req.user!.id);
  if (!created) throw conflict('ACTIVE_CASE_EXISTS');
  await audit(req, 'RENEWAL_CASE_OPENED', `case:${created.id}`, { renewalOfCaseId: c.id });
  res.status(201).json({ renewal: { id: created.id, number: created.number }, care: await caseCare(c.id) });
});

adminRenewalsRouter.get('/upcoming', async (req, res) => {
  const q = parse(
    z.object({
      days: z.coerce.number().int().refine((d) => [30, 60, 90, 180].includes(d), 'days must be 30, 60, 90 or 180').default(90),
      staffId: z.string().trim().min(1).max(40).optional(),
    }),
    req.query,
  );
  res.json({ days: q.days, ...(await upcomingCare(q.days, { staffId: q.staffId })) });
});

adminRenewalsRouter.get('/settings', async (_req, res) => {
  res.json({ settings: await getRenewalSettings() });
});

adminRenewalsRouter.put('/settings', requireMinRole('ADMIN'), async (req, res) => {
  const saved = await saveRenewalSettings(parse(renewalSettingsSchema, req.body?.settings ?? req.body ?? {}));
  await audit(req, 'RENEWAL_SETTINGS', 'setting:renewals', saved);
  res.json({ settings: saved });
});

adminRenewalsRouter.post('/run', requireMinRole('ADMIN'), async (_req, res) => {
  res.json(await runRenewals());
});
