import express, { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { conflict, forbidden, limiter, notFound, parse } from '../lib/http.js';
import { visitorIdSchema } from '../lib/marketing/leadScoring.js';
import { DIRECTIONS, MAX_ALERTS_PER_EMAIL, alertInputSchema, targetSchema } from '../lib/rateAlerts/logic.js';
import { alertView, confirmAlert, createAccountAlert, createPublicAlert, findByToken, rearmAlert, unsubscribeAlert } from '../lib/rateAlerts/service.js';

/**
 * EUR → AZN rate alerts — mounted at /api/rate-alerts (design: lib/rateAlerts/service.ts):
 *   POST   /                       visitor: { email, direction: gte|lte, target, consent: true, lng, website (honeypot),
 *                                  visitorId? } → confirmation e-mail (double opt-in); a signed-in client's own
 *                                  account address: confirmed at once
 *   POST   /confirm   { token }    double opt-in (the e-mail link opens /rate-alert, which posts here)
 *   GET    /manage?token=          the alert of a manage link (e-mail masked)
 *   POST   /rearm     { token, direction?, target? }   re-arm after it fired / extend after expiry / resume
 *   POST   /unsubscribe { token }  stop it (page button)
 *   POST   /unsubscribe/:token     RFC 8058 one-click (List-Unsubscribe-Post from the mail client)
 *   GET    /mine, POST /mine, POST /mine/:id/rearm, DELETE /mine/:id   signed-in clients (no opt-in e-mail)
 */
export const rateAlertsRouter = Router();

const createLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 6, skip: () => config.isTest });
const tokenLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 40, skip: () => config.isTest });
const mineLimiter = limiter({ windowMs: 60 * 1000, limit: 30, skip: () => config.isTest });

const noStore = (res: Response) => res.setHeader('Cache-Control', 'no-store, private');
const token = z.string().min(12).max(120);

const requireClient: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'CLIENT') return next(forbidden('CLIENTS_ONLY'));
  next();
};

rateAlertsRouter.post('/', createLimiter, async (req, res) => {
  noStore(res);
  const body = parse(
    alertInputSchema.extend({
      email: z.string().trim().toLowerCase().email().max(190),
      consent: z.literal(true),
      website: z.string().max(200).optional(), // honeypot
      visitorId: visitorIdSchema.optional().catch(undefined),
    }),
    req.body ?? {},
  );
  if (body.website) {
    res.status(201).json({ ok: true, confirmed: false }); // look like a success to bots
    return;
  }
  const { email, visitorId, website: _hp, consent: _c, ...alert } = body;
  if (req.user?.role === 'CLIENT') {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true, locale: true } });
    if (user && user.email.toLowerCase() === email) {
      const r = await createAccountAlert(user, alert, req);
      if (!r.ok) throw conflict(r.code);
      res.status(201).json({ ok: true, confirmed: true });
      return;
    }
  }
  const r = await createPublicAlert({ email, alert, visitorId });
  if (!r.ok) throw conflict(r.code);
  res.status(201).json({ ok: true, confirmed: false });
});

const byToken = async (raw: unknown) => {
  const alert = await findByToken(raw);
  if (!alert) throw notFound('LINK_INVALID');
  return alert;
};

rateAlertsRouter.post('/confirm', tokenLimiter, async (req, res) => {
  noStore(res);
  const body = parse(z.object({ token }), req.body ?? {});
  const alert = await confirmAlert(await byToken(body.token), req);
  res.json({ alert: alertView(alert, { maskedEmail: true }) });
});

rateAlertsRouter.get('/manage', tokenLimiter, async (req, res) => {
  noStore(res);
  res.json({ alert: alertView(await byToken(req.query.token), { maskedEmail: true }), max: MAX_ALERTS_PER_EMAIL });
});

const rearmBody = z.object({ direction: z.enum(DIRECTIONS).optional(), target: targetSchema.optional() });

rateAlertsRouter.post('/rearm', tokenLimiter, async (req, res) => {
  noStore(res);
  const body = parse(rearmBody.extend({ token }), req.body ?? {});
  const r = await rearmAlert(await byToken(body.token), body, req);
  if (!r.ok) throw conflict(r.code);
  res.json({ alert: alertView(r.alert, { maskedEmail: true }) });
});

const unsubscribe = async (req: Request, res: Response, raw: unknown) => {
  noStore(res);
  const alert = await unsubscribeAlert(await byToken(raw), req);
  res.json({ ok: true, alert: alertView(alert, { maskedEmail: true }) });
};

rateAlertsRouter.post('/unsubscribe', tokenLimiter, async (req, res) => {
  const body = parse(z.object({ token }), req.body ?? {});
  await unsubscribe(req, res, body.token);
});

// One-click POSTs arrive as application/x-www-form-urlencoded ("List-Unsubscribe=One-Click").
rateAlertsRouter.post('/unsubscribe/:token', tokenLimiter, express.urlencoded({ extended: false, limit: '2kb' }), async (req, res) => {
  await unsubscribe(req, res, String(req.params.token));
});

// ─── Signed-in clients ──────────────────────────────────────────────────

rateAlertsRouter.get('/mine', requireAuth, requireClient, mineLimiter, async (req, res) => {
  noStore(res);
  const items = await prisma.rateAlert.findMany({ where: { userId: req.user!.id, unsubscribedAt: null }, orderBy: { createdAt: 'desc' } });
  res.json({ items: items.map((a) => alertView(a)), max: MAX_ALERTS_PER_EMAIL });
});

rateAlertsRouter.post('/mine', requireAuth, requireClient, mineLimiter, async (req, res) => {
  const input = parse(alertInputSchema, req.body ?? {});
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { id: true, email: true, locale: true } });
  const r = await createAccountAlert(user, input, req);
  if (!r.ok) throw conflict(r.code);
  res.status(201).json({ alert: alertView(r.alert) });
});

const ownAlert = async (userId: string, id: string) => {
  const alert = await prisma.rateAlert.findUnique({ where: { id } });
  if (!alert || alert.userId !== userId) throw notFound('ALERT_NOT_FOUND');
  return alert;
};

rateAlertsRouter.post('/mine/:id/rearm', requireAuth, requireClient, mineLimiter, async (req, res) => {
  const body = parse(rearmBody, req.body ?? {});
  const r = await rearmAlert(await ownAlert(req.user!.id, String(req.params.id)), body, req);
  if (!r.ok) throw conflict(r.code);
  res.json({ alert: alertView(r.alert) });
});

rateAlertsRouter.delete('/mine/:id', requireAuth, requireClient, mineLimiter, async (req, res) => {
  const alert = await ownAlert(req.user!.id, String(req.params.id));
  await unsubscribeAlert(alert, req); // logs the withdrawal
  await prisma.rateAlert.delete({ where: { id: alert.id } });
  res.json({ ok: true });
});
