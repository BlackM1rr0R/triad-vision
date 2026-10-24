import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { conflict, forbidden, limiter, notFound, parse } from '../lib/http.js';
import { parseLocale } from '../lib/seo.js';
import { canonicalProfession } from '../lib/matching.js';
import { visitorIdSchema } from '../lib/marketing/leadScoring.js';
import {
  JOB_KINDS,
  alertPrefsSchema,
  alertView,
  createAccountAlert,
  createPublicAlert,
  findByToken,
  prefsData,
  professionOptions,
} from '../lib/jobAlerts/service.js';

/**
 * Job alerts — mounted at /api/job-alerts (design: lib/jobAlerts/service.ts):
 *   GET    /options?lng=&profession=  profession list (labels in that language), German levels, job kinds, the key
 *                                  matching a free-text profession (to preselect on a job page)
 *   POST   /                      visitor: { email, professions, germanLevel?, kinds?, lng } → confirmation e-mail
 *   POST   /confirm   { token }   double opt-in (the e-mail link opens /job-alert, which posts here)
 *   GET    /manage?token=         the alert of a manage link (e-mail masked)
 *   PATCH  /manage    { token, … } change professions / level / kinds / language
 *   POST   /unsubscribe { token } stop all mail; POST /resume { token } undoes it (deleted after 30 days)
 *   GET    /mine, POST /mine, PATCH /mine/:id, DELETE /mine/:id   signed-in clients (no double opt-in)
 */
export const jobAlertsRouter = Router();

const createLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 6 });
const tokenLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 40 });

const token = z.string().min(20).max(100);

jobAlertsRouter.get('/options', (req, res) => {
  const lng = parseLocale(req.query.lng) ?? 'az';
  res.setHeader('Cache-Control', 'public, max-age=3600');
  // ?profession=<free text> (e.g. a vacancy's profession) → the dictionary key to preselect, if recognised.
  const suggested = typeof req.query.profession === 'string' ? canonicalProfession(req.query.profession.slice(0, 120)) : null;
  res.json({ professions: professionOptions(lng), germanLevels: ['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'], kinds: JOB_KINDS, suggested });
});

jobAlertsRouter.post('/', createLimiter, async (req, res) => {
  const body = parse(
    alertPrefsSchema.extend({
      email: z.string().trim().toLowerCase().email().max(190),
      website: z.string().max(200).optional(), // honeypot
      visitorId: visitorIdSchema.optional().catch(undefined),
    }),
    req.body,
  );
  if (body.website) {
    res.status(201).json({ ok: true, confirmed: false });
    return;
  }
  const { email, visitorId, website: _hp, ...prefs } = body;
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

jobAlertsRouter.post('/confirm', tokenLimiter, async (req, res) => {
  const body = parse(z.object({ token }), req.body);
  const alert = await findByToken(body.token);
  if (!alert) throw notFound('ALERT_NOT_FOUND');
  const updated = alert.confirmedAt ? alert : await prisma.jobAlert.update({ where: { id: alert.id }, data: { confirmedAt: new Date(), unsubscribedAt: null } });
  res.json({ alert: alertView(updated, { maskedEmail: true }) });
});

jobAlertsRouter.get('/manage', tokenLimiter, async (req, res) => {
  const alert = await findByToken(req.query.token);
  if (!alert) throw notFound('ALERT_NOT_FOUND');
  res.json({ alert: alertView(alert, { maskedEmail: true }) });
});

jobAlertsRouter.patch('/manage', tokenLimiter, async (req, res) => {
  const body = parse(alertPrefsSchema.partial().extend({ token }), req.body);
  const alert = await findByToken(body.token);
  if (!alert) throw notFound('ALERT_NOT_FOUND');
  const { token: _t, ...prefs } = body;
  const updated = await prisma.jobAlert.update({ where: { id: alert.id }, data: prefsData(prefs) });
  res.json({ alert: alertView(updated, { maskedEmail: true }) });
});

jobAlertsRouter.post('/unsubscribe', tokenLimiter, async (req, res) => {
  const body = parse(z.object({ token }), req.body);
  const alert = await findByToken(body.token);
  if (!alert) throw notFound('ALERT_NOT_FOUND');
  const updated = alert.unsubscribedAt ? alert : await prisma.jobAlert.update({ where: { id: alert.id }, data: { unsubscribedAt: new Date() } });
  res.json({ alert: alertView(updated, { maskedEmail: true }) });
});

jobAlertsRouter.post('/resume', tokenLimiter, async (req, res) => {
  const body = parse(z.object({ token }), req.body);
  const alert = await findByToken(body.token);
  if (!alert) throw notFound('ALERT_NOT_FOUND');
  const updated = await prisma.jobAlert.update({ where: { id: alert.id }, data: { unsubscribedAt: null, confirmedAt: alert.confirmedAt ?? new Date() } });
  res.json({ alert: alertView(updated, { maskedEmail: true }) });
});

// ─── Signed-in clients ──────────────────────────────────────────────────

const requireClient: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'CLIENT') return next(forbidden('CANDIDATES_ONLY'));
  next();
};

jobAlertsRouter.get('/mine', requireAuth, requireClient, async (req, res) => {
  const [items, user] = await Promise.all([
    prisma.jobAlert.findMany({ where: { userId: req.user!.id, unsubscribedAt: null }, orderBy: { createdAt: 'desc' } }),
    prisma.user.findUnique({ where: { id: req.user!.id }, select: { profession: true, germanLevel: true, emailNotifications: true } }),
  ]);
  res.json({
    items: items.map((a) => alertView(a)),
    // Prefill for the form: the profile's profession mapped to the dictionary.
    suggested: { profession: canonicalProfession(user?.profession), germanLevel: user?.germanLevel ?? null },
    emailNotifications: user?.emailNotifications ?? true,
  });
});

jobAlertsRouter.post('/mine', requireAuth, requireClient, async (req, res) => {
  const prefs = parse(alertPrefsSchema, req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { id: true, email: true, locale: true } });
  const r = await createAccountAlert(user, prefs);
  if (!r.ok) throw conflict(r.code);
  res.status(201).json({ alert: alertView(r.alert) });
});

const ownAlert = async (userId: string, id: string) => {
  const alert = await prisma.jobAlert.findUnique({ where: { id } });
  if (!alert || alert.userId !== userId) throw notFound('ALERT_NOT_FOUND');
  return alert;
};

jobAlertsRouter.patch('/mine/:id', requireAuth, requireClient, async (req, res) => {
  const prefs = parse(alertPrefsSchema.partial(), req.body);
  const alert = await ownAlert(req.user!.id, String(req.params.id));
  const updated = await prisma.jobAlert.update({ where: { id: alert.id }, data: prefsData(prefs) });
  res.json({ alert: alertView(updated) });
});

jobAlertsRouter.delete('/mine/:id', requireAuth, requireClient, async (req, res) => {
  const alert = await ownAlert(req.user!.id, String(req.params.id));
  await prisma.jobAlert.delete({ where: { id: alert.id } });
  res.json({ ok: true });
});
