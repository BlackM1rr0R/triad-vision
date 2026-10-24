import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { parse } from '../../lib/http.js';
import { metaOf } from '../../lib/esign/http.js';
import {
  countersign,
  getCountersignSettings,
  isAuthorisedSignatory,
  pendingCountersignatures,
  saveCountersignSettings,
} from '../../lib/esign/countersign.js';
import { invalidateMyWork } from '../../lib/myWork.js';

/**
 * Triad Vision countersignature of service contracts — mounted at /api/admin/countersign (ADMIN+):
 *   GET  /                 contracts waiting for the countersignature (client signed, Triad Vision open)
 *   POST /:signerId        one-click countersignature { mode: DRAW|TYPE, signature | typedName, agree: true }
 *   GET  /settings         settings + the ADMIN+ users that can be marked as authorised signatories
 *   PUT  /settings         { enabled, signatoryIds, defaultSignerId, packageOrders, caseContracts, reminderDays }
 * See lib/esign/countersign.ts for the flow.
 */
export const adminCountersignRouter = Router();

const signBody = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('DRAW'), signature: z.string().max(1_500_000), agree: z.literal(true) }),
  z.object({ mode: z.literal('TYPE'), typedName: z.string().trim().min(2).max(160), agree: z.literal(true) }),
]);

const candidates = () =>
  prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 200,
  });

adminCountersignRouter.get('/', async (req, res) => {
  const viewer = { id: req.user!.id, role: req.user!.role };
  const [items, settings] = await Promise.all([pendingCountersignatures(viewer), getCountersignSettings()]);
  res.json({ items, enabled: settings.enabled, authorised: isAuthorisedSignatory(viewer, settings), reminderDays: settings.reminderDays });
});

adminCountersignRouter.get('/settings', async (_req, res) => {
  const [settings, users] = await Promise.all([getCountersignSettings(), candidates()]);
  res.json({ settings, candidates: users });
});

adminCountersignRouter.put('/settings', async (req, res) => {
  const settings = await saveCountersignSettings(req.body?.settings ?? req.body ?? {});
  await audit(req, 'COUNTERSIGN_SETTINGS', 'esignCountersign', { enabled: settings.enabled, signatories: settings.signatoryIds.length });
  res.json({ settings, candidates: await candidates() });
});

adminCountersignRouter.post('/:signerId', async (req, res) => {
  const body = parse(signBody, req.body ?? {});
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { id: true, role: true, firstName: true, lastName: true, email: true } });
  const request = await countersign(String(req.params.signerId), me, body.mode === 'DRAW' ? { mode: 'DRAW', signature: body.signature } : { mode: 'TYPE', typedName: body.typedName }, metaOf(req));
  await audit(req, 'CONTRACT_COUNTERSIGN', request.id, { signerId: String(req.params.signerId), mode: body.mode });
  invalidateMyWork(me.id);
  res.json({ request });
});
