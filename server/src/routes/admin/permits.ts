import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { notFound, parse } from '../../lib/http.js';
import { parseDay } from '../../lib/expiry/index.js';
import { casePermits, getPermitSettings, permitSettingsSchema, runPermitReminders, savePermitSettings } from '../../lib/permits/service.js';

/**
 * Permit expiry reminders after arrival (lib/permits), mounted at /api/admin/permits (STAFF+):
 *
 *   GET   /cases/:id         card of the admin case page (title kind, insurance, passport, sent / next reminders)
 *   PATCH /cases/:id         { residenceTitleKind?, healthInsuranceExpiresAt?, passportExpiry? } — audited;
 *                            the residence title date itself stays on PATCH /admin/renewals/cases/:id
 *   GET   /settings · PUT /settings   windows per item, staff e-mail, on / off (PUT ADMIN+)
 *   POST  /run               ADMIN+: run the reminders now
 */
export const adminPermitsRouter = Router();

const dayString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
  .refine((v) => parseDay(v) !== null, 'Invalid date');
const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

adminPermitsRouter.get('/cases/:id', async (req, res) => {
  const permits = await casePermits(String(req.params.id));
  if (!permits) throw notFound('CASE_NOT_FOUND');
  res.json({ permits });
});

adminPermitsRouter.patch('/cases/:id', async (req, res) => {
  const body = parse(
    z
      .object({
        residenceTitleKind: z.enum(['RESIDENCE_PERMIT', 'EU_BLUE_CARD']).nullable(),
        healthInsuranceExpiresAt: dayString.nullable(),
        passportExpiry: dayString.nullable(),
      })
      .partial()
      .refine((b) => Object.keys(b).length > 0, 'Nothing to change'),
    req.body ?? {},
  );
  const c = await prisma.case.findUnique({
    where: { id: String(req.params.id) },
    select: { id: true, clientId: true, residenceTitleKind: true, healthInsuranceExpiresAt: true, client: { select: { passportExpiry: true } } },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const toDate = (v: string | null) => (v ? parseDay(v) : null);
  await prisma.case.update({
    where: { id: c.id },
    data: {
      ...(body.residenceTitleKind !== undefined ? { residenceTitleKind: body.residenceTitleKind } : {}),
      ...(body.healthInsuranceExpiresAt !== undefined ? { healthInsuranceExpiresAt: toDate(body.healthInsuranceExpiresAt) } : {}),
    },
  });
  if (body.passportExpiry !== undefined) await prisma.user.update({ where: { id: c.clientId }, data: { passportExpiry: toDate(body.passportExpiry) } });
  await audit(req, 'PERMIT_DATES_SET', `case:${c.id}`, {
    from: { residenceTitleKind: c.residenceTitleKind, healthInsuranceExpiresAt: day(c.healthInsuranceExpiresAt), passportExpiry: day(c.client.passportExpiry) },
    to: body,
  });
  res.json({ permits: await casePermits(c.id) });
});

adminPermitsRouter.get('/settings', async (_req, res) => {
  res.json({ settings: await getPermitSettings() });
});

adminPermitsRouter.put('/settings', requireMinRole('ADMIN'), async (req, res) => {
  const saved = await savePermitSettings(parse(permitSettingsSchema, req.body?.settings ?? req.body ?? {}));
  await audit(req, 'PERMIT_REMINDER_SETTINGS', 'setting:permitReminders', saved);
  res.json({ settings: saved });
});

adminPermitsRouter.post('/run', requireMinRole('ADMIN'), async (_req, res) => {
  res.json({ sent: await runPermitReminders() });
});
