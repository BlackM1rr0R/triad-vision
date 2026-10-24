import { Router, type Request } from 'express';
import { prisma } from '../../db.js';
import { requireMinRole, requireRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { notFound, parse } from '../../lib/http.js';
import {
  fourEyesSettingsSchema,
  fourEyesState,
  getFourEyesSettings,
  overrideFourEyes,
  overrideSchema,
  requestReview,
  requestSchema,
  reviewPackage,
  reviewQueue,
  reviewSchema,
  saveFourEyesSettings,
} from '../../lib/caseNext/fourEyes.js';

/**
 * Four-eyes check of the embassy package (lib/caseNext/fourEyes.ts), mounted on the admin router (STAFF+):
 *
 *   GET  /cases/:id/four-eyes                 state of the gate, latest review, history, checklist keys
 *   POST /cases/:id/four-eyes/request         { reviewerId?, note? } the builder asks a second staff member
 *   POST /four-eyes/:approvalId/review        { decision: APPROVE | REJECT, comment?, checklist[] } (not the requester)
 *   POST /cases/:id/four-eyes/override        { reason } SUPER_ADMIN only, audited
 *   GET  /four-eyes/queue                     "waiting for my review"
 *   GET  /four-eyes/settings · PUT (ADMIN+)   { enabled } — the gate on / off
 */
export const adminFourEyesRouter = Router();

const actorOf = (req: Request) => ({ id: req.user!.id, role: req.user!.role, firstName: req.user!.firstName, lastName: req.user!.lastName });

const ensureCase = async (id: string) => {
  const c = await prisma.case.findUnique({ where: { id }, select: { id: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  return c;
};

adminFourEyesRouter.get('/four-eyes/queue', async (req, res) => {
  res.json({ items: await reviewQueue(req.user!.id) });
});

adminFourEyesRouter.get('/four-eyes/settings', async (_req, res) => {
  res.json({ settings: await getFourEyesSettings() });
});

adminFourEyesRouter.put('/four-eyes/settings', requireMinRole('ADMIN'), async (req, res) => {
  const saved = await saveFourEyesSettings(parse(fourEyesSettingsSchema, req.body?.settings ?? req.body ?? {}));
  await audit(req, 'FOUR_EYES_SETTINGS', 'setting:fourEyes', saved);
  res.json({ settings: saved });
});

adminFourEyesRouter.get('/cases/:id/four-eyes', async (req, res) => {
  const c = await ensureCase(String(req.params.id));
  res.json({ fourEyes: await fourEyesState(c.id, actorOf(req)) });
});

adminFourEyesRouter.post('/cases/:id/four-eyes/request', async (req, res) => {
  const body = parse(requestSchema, req.body ?? {});
  const c = await ensureCase(String(req.params.id));
  const row = await requestReview(c.id, actorOf(req), body);
  await audit(req, 'FOUR_EYES_REQUESTED', `case:${c.id}`, { approvalId: row.id, reviewerId: row.reviewerId, packageHash: row.packageHash });
  res.status(201).json({ fourEyes: await fourEyesState(c.id, actorOf(req)) });
});

adminFourEyesRouter.post('/four-eyes/:approvalId/review', async (req, res) => {
  const body = parse(reviewSchema, req.body ?? {});
  const row = await reviewPackage(String(req.params.approvalId), actorOf(req), body);
  await audit(req, row.status === 'APPROVED' ? 'FOUR_EYES_APPROVED' : 'FOUR_EYES_REJECTED', `case:${row.caseId}`, { approvalId: row.id, comment: row.comment, packageHash: row.packageHash });
  res.json({ fourEyes: await fourEyesState(row.caseId, actorOf(req)) });
});

adminFourEyesRouter.post('/cases/:id/four-eyes/override', requireRole('SUPER_ADMIN'), async (req, res) => {
  const { reason } = parse(overrideSchema, req.body ?? {});
  const c = await ensureCase(String(req.params.id));
  const row = await overrideFourEyes(c.id, actorOf(req), reason);
  await audit(req, 'FOUR_EYES_OVERRIDDEN', `case:${c.id}`, { approvalId: row.id, reason, packageHash: row.packageHash });
  res.status(201).json({ fourEyes: await fourEyesState(c.id, actorOf(req)) });
});
