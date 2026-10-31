import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { isDigestEnabled, sendDigest, setDigestEnabled } from '../../lib/staffDigest/index.js';
import { backupCheckStatus } from '../../lib/ops/backupCheck.js';

/**
 * Staff operations — /api/admin/staff-ops (STAFF+; admin parts marked):
 *
 *   GET  /digest                  own morning digest preference { enabled, emailNotifications }
 *   PUT  /digest                  { enabled }                     opt in / out (lib/staffDigest)
 *   POST /digest/test             send my digest now (even when empty / already sent today)
 *   GET  /backup-check            last weekly backup restore test (ADMIN+, lib/ops/backupCheck)
 */
export const adminStaffOpsRouter = Router();

adminStaffOpsRouter.get('/digest', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { emailNotifications: true } });
  res.json({ enabled: await isDigestEnabled(req.user!.id), emailNotifications: user?.emailNotifications !== false });
});

adminStaffOpsRouter.put('/digest', async (req, res) => {
  const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body);
  await setDigestEnabled(req.user!.id, enabled);
  await audit(req, 'STAFF_DIGEST_PREFERENCE', `user:${req.user!.id}`, { enabled });
  res.json({ enabled });
});

adminStaffOpsRouter.post('/digest/test', async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { id: true, email: true, locale: true, role: true, firstName: true, lastName: true } });
  const r = await sendDigest(u, { test: true });
  res.json({ sent: r.sent, total: r.total });
});

adminStaffOpsRouter.get('/backup-check', requireMinRole('ADMIN'), async (_req, res) => {
  res.json(await backupCheckStatus());
});
