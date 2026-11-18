import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, limiter, notFound, parse } from '../lib/http.js';
import { visitorIdSchema, utmSchema } from '../lib/marketing/leadScoring.js';
import { normalizePhoneNumber } from '../lib/phone.js';
import { joinWaitlistAsClient, joinWaitlistAsVisitor, runWaitlistNoticesSoon, waitlistInputSchema, waitlistView } from '../lib/jobAlerts/waitlist.js';

/**
 * Vacancy waitlist — mounted at /api/job-alerts/waitlist (design: lib/jobAlerts/waitlist.ts). The confirmation,
 * manage and unsubscribe links are the job-alert ones (/api/job-alerts/confirm, /manage, /unsubscribe).
 *   POST   /            { profession, city?, germanLevel?, lng, … }
 *                       signed-in client → entry for the account (201 { confirmed: true, already });
 *                       visitor → { email, consent: true, name?, phone? } → double opt-in e-mail + lead (Inquiry)
 *   GET    /mine        the signed-in client's entries
 *   DELETE /mine/:id    removes one of them
 */
export const waitlistRouter = Router();

const createLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 8 });

const visitorFields = z.object({
  email: z.string().trim().toLowerCase().email().max(190).optional(),
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  consent: z.boolean().optional(),
  website: z.string().max(200).optional(), // honeypot
  visitorId: visitorIdSchema.optional().catch(undefined),
  utm: utmSchema.optional().catch(undefined),
});

waitlistRouter.post('/', createLimiter, async (req, res) => {
  const body = parse(waitlistInputSchema.merge(visitorFields), req.body);
  if (body.website) {
    res.status(201).json({ ok: true, confirmed: false, already: false });
    return;
  }
  const input = { profession: body.profession, city: body.city, germanLevel: body.germanLevel ?? null, lng: body.lng };
  if (req.user?.role === 'CLIENT') {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true, locale: true } });
    if (user) {
      const r = await joinWaitlistAsClient(user, input, req);
      if (!r.ok) throw conflict(r.code);
      runWaitlistNoticesSoon(); // a matching vacancy may already have a free place
      res.status(201).json({ ok: true, confirmed: true, already: r.already, entry: waitlistView(r.entry) });
      return;
    }
  }
  if (!body.email) throw badRequest('EMAIL_REQUIRED');
  if (body.consent !== true) throw badRequest('CONSENT_REQUIRED');
  const phone = body.phone ? (normalizePhoneNumber(body.phone, { country: 'AZ' }) ?? null) : null;
  const r = await joinWaitlistAsVisitor({ email: body.email, name: body.name || null, phone, input, visitorId: body.visitorId, utm: body.utm });
  if (!r.ok) throw conflict(r.code);
  res.status(201).json({ ok: true, confirmed: r.already, already: r.already });
});

waitlistRouter.get('/mine', requireAuth, async (req, res) => {
  if (req.user!.role !== 'CLIENT') throw forbidden('CANDIDATES_ONLY');
  const items = await prisma.jobAlert.findMany({ where: { userId: req.user!.id, waitlist: true, unsubscribedAt: null }, orderBy: { createdAt: 'desc' } });
  res.json({ items: items.map((a) => waitlistView(a)) });
});

waitlistRouter.delete('/mine/:id', requireAuth, async (req, res) => {
  const entry = await prisma.jobAlert.findUnique({ where: { id: String(req.params.id) } });
  if (!entry || !entry.waitlist || entry.userId !== req.user!.id) throw notFound('ALERT_NOT_FOUND');
  await prisma.jobAlert.delete({ where: { id: entry.id } });
  res.json({ ok: true });
});
