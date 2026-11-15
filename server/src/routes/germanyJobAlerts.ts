import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, limiter, notFound, parse } from '../lib/http.js';
import { visitorIdSchema } from '../lib/marketing/leadScoring.js';
import {
  alertPrefsSchema,
  alertUpdateSchema,
  alertView,
  createAccountAlert,
  createPublicAlert,
  findByToken,
  updateData,
} from '../lib/germanyJobs/alerts.js';
import { MAX_SAVED, listSaved, saveJob, savedSnapshotSchema, savedView, syncSaved } from '../lib/germanyJobs/saved.js';

/**
 * Germany job alerts — mounted at /api/germany-jobs/alerts (design: lib/germanyJobs/alerts.ts):
 *   POST   /                      visitor: { email, consent: true, q, where, radius, type, time, remote, visa, frequency,
 *                                 lng } → confirmation e-mail (double opt-in); a signed-in client's own address: confirmed
 *   POST   /confirm   { token }   double opt-in (the e-mail link opens /job-alert/germany, which posts here)
 *   GET    /manage?token=         the alert of a manage link (e-mail masked)
 *   PATCH  /manage    { token, frequency?, lng? }
 *   POST   /unsubscribe { token } stop all mail; POST /resume { token } undoes it (deleted after 30 days)
 *   GET    /mine, POST /mine, PATCH /mine/:id, DELETE /mine/:id   signed-in clients (no double opt-in)
 */
export const germanyJobAlertsRouter = Router();

/**
 * Saved Germany jobs of signed-in clients — mounted at /api/germany-jobs/saved (lib/germanyJobs/saved.ts):
 *   GET    /                      { items: [snapshot + savedAt + status available | gone | unknown], max }
 *   POST   /          snapshot    save (idempotent)
 *   POST   /sync      { items }   merge the visitor's browser list after sign-in → { added, items }
 *   DELETE /:listingId            unsave
 */
export const savedGermanyJobsRouter = Router();

const createLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 6 });
const tokenLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 40 });
const savedLimiter = limiter({ windowMs: 60 * 1000, limit: 60 });

const token = z.string().min(20).max(100);

const requireClient: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'CLIENT') return next(forbidden('CANDIDATES_ONLY'));
  next();
};

germanyJobAlertsRouter.post('/', createLimiter, async (req, res) => {
  const body = parse(
    alertPrefsSchema.extend({
      email: z.string().trim().toLowerCase().email().max(190),
      consent: z.literal(true),
      website: z.string().max(200).optional(), // honeypot
      visitorId: visitorIdSchema.optional().catch(undefined),
    }),
    req.body ?? {},
  );
  if (body.website) {
    res.status(201).json({ ok: true, confirmed: false });
    return;
  }
  const { email, visitorId, website: _hp, consent: _c, ...prefs } = body;
  // A signed-in client subscribing their own account address needs no double opt-in.
  if (req.user?.role === 'CLIENT') {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true, locale: true } });
    if (user && user.email.toLowerCase() === email) {
      const r = await createAccountAlert(user, prefs);
      if (!r.ok) throw conflict(r.code);
      res.status(201).json({ ok: true, confirmed: true });
      return;
    }
  }
  const r = await createPublicAlert({ email, prefs, visitorId });
  if (!r.ok) throw conflict(r.code);
  res.status(201).json({ ok: true, confirmed: false });
});

const byToken = async (raw: unknown) => {
  const alert = await findByToken(raw);
  if (!alert) throw notFound('ALERT_NOT_FOUND');
  return alert;
};

germanyJobAlertsRouter.post('/confirm', tokenLimiter, async (req, res) => {
  const body = parse(z.object({ token }), req.body ?? {});
  const alert = await byToken(body.token);
  const updated = alert.confirmedAt ? alert : await prisma.germanyJobAlert.update({ where: { id: alert.id }, data: { confirmedAt: new Date(), unsubscribedAt: null } });
  res.json({ alert: alertView(updated, { maskedEmail: true }) });
});

germanyJobAlertsRouter.get('/manage', tokenLimiter, async (req, res) => {
  const alert = await byToken(req.query.token);
  res.json({ alert: alertView(alert, { maskedEmail: true }) });
});

germanyJobAlertsRouter.patch('/manage', tokenLimiter, async (req, res) => {
  const body = parse(alertUpdateSchema.extend({ token }), req.body ?? {});
  const alert = await byToken(body.token);
  const updated = await prisma.germanyJobAlert.update({ where: { id: alert.id }, data: updateData(body) });
  res.json({ alert: alertView(updated, { maskedEmail: true }) });
});

germanyJobAlertsRouter.post('/unsubscribe', tokenLimiter, async (req, res) => {
  const body = parse(z.object({ token }), req.body ?? {});
  const alert = await byToken(body.token);
  const updated = alert.unsubscribedAt ? alert : await prisma.germanyJobAlert.update({ where: { id: alert.id }, data: { unsubscribedAt: new Date() } });
  res.json({ alert: alertView(updated, { maskedEmail: true }) });
});

germanyJobAlertsRouter.post('/resume', tokenLimiter, async (req, res) => {
  const body = parse(z.object({ token }), req.body ?? {});
  const alert = await byToken(body.token);
  const updated = await prisma.germanyJobAlert.update({ where: { id: alert.id }, data: { unsubscribedAt: null, confirmedAt: alert.confirmedAt ?? new Date() } });
  res.json({ alert: alertView(updated, { maskedEmail: true }) });
});

// ─── Signed-in clients ──────────────────────────────────────────────────

germanyJobAlertsRouter.get('/mine', requireAuth, requireClient, async (req, res) => {
  const [items, user] = await Promise.all([
    prisma.germanyJobAlert.findMany({ where: { userId: req.user!.id, unsubscribedAt: null }, orderBy: { createdAt: 'desc' } }),
    prisma.user.findUnique({ where: { id: req.user!.id }, select: { emailNotifications: true } }),
  ]);
  res.json({ items: items.map((a) => alertView(a)), emailNotifications: user?.emailNotifications ?? true });
});

germanyJobAlertsRouter.post('/mine', requireAuth, requireClient, async (req, res) => {
  const prefs = parse(alertPrefsSchema, req.body ?? {});
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { id: true, email: true, locale: true } });
  const r = await createAccountAlert(user, prefs);
  if (!r.ok) throw conflict(r.code);
  res.status(201).json({ alert: alertView(r.alert) });
});

const ownAlert = async (userId: string, id: string) => {
  const alert = await prisma.germanyJobAlert.findUnique({ where: { id } });
  if (!alert || alert.userId !== userId) throw notFound('ALERT_NOT_FOUND');
  return alert;
};

germanyJobAlertsRouter.patch('/mine/:id', requireAuth, requireClient, async (req, res) => {
  const body = parse(alertUpdateSchema, req.body ?? {});
  const alert = await ownAlert(req.user!.id, String(req.params.id));
  const updated = await prisma.germanyJobAlert.update({ where: { id: alert.id }, data: updateData(body) });
  res.json({ alert: alertView(updated) });
});

germanyJobAlertsRouter.delete('/mine/:id', requireAuth, requireClient, async (req, res) => {
  const alert = await ownAlert(req.user!.id, String(req.params.id));
  await prisma.germanyJobAlert.delete({ where: { id: alert.id } });
  res.json({ ok: true });
});

// ─── Saved jobs ─────────────────────────────────────────────────────────

savedGermanyJobsRouter.use(requireAuth, requireClient, savedLimiter);

savedGermanyJobsRouter.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ items: await listSaved(req.user!.id), max: MAX_SAVED });
});

savedGermanyJobsRouter.post('/', async (req, res) => {
  const snap = parse(savedSnapshotSchema, req.body ?? {});
  const r = await saveJob(req.user!.id, snap);
  if (!r.ok) throw conflict(r.code);
  res.status(201).json({ item: savedView(r.row, 'unknown') });
});

savedGermanyJobsRouter.post('/sync', async (req, res) => {
  const body = parse(z.object({ items: z.array(z.unknown()).max(MAX_SAVED) }), req.body ?? {});
  // Invalid entries of an old / tampered browser list are skipped, not fatal.
  const items = body.items.flatMap((x) => {
    const r = savedSnapshotSchema.safeParse(x);
    return r.success ? [r.data] : [];
  });
  const added = await syncSaved(req.user!.id, items);
  res.json({ added, items: await listSaved(req.user!.id) });
});

savedGermanyJobsRouter.delete('/:listingId', async (req, res) => {
  const listingId = String(req.params.listingId);
  if (!listingId || listingId.length > 160) throw badRequest('INVALID_ID');
  await prisma.savedGermanyJob.deleteMany({ where: { userId: req.user!.id, listingId } });
  res.json({ ok: true });
});
