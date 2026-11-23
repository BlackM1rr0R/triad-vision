import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, limiter, notFound, parse } from '../lib/http.js';
import { visitorIdSchema, utmSchema } from '../lib/marketing/leadScoring.js';
import { normalizePhoneNumber } from '../lib/phone.js';
import { cancelRequest, createClientRequest, createGuestRequest, requestIdFromToken, requestInputSchema, requestView } from '../lib/vacancyRequests/service.js';

/**
 * "Vakansiya sorğusu" — mounted at /api/vacancy-requests (design: lib/vacancyRequests/service.ts). No case is created.
 *   POST   /                    { type, sector?, profession?, city?, germanLevel?, note?, lng, sourceVacancySlug?, … }
 *                               signed-in client → request on the account (201 { already });
 *                               guest → { name, phone and/or email, consent: true } → request + lead
 *   GET    /mine                the signed-in client's own requests (with the vacancies offered to them)
 *   POST   /mine/:id/cancel     cancels one of them (ownership checked)
 *   GET    /by-token?token=     guest cancel page data (no writes)
 *   POST   /cancel              { token } guest withdraws the request (link in every e-mail)
 */
export const vacancyRequestsRouter = Router();

// Guests only (signed-in clients are capped by their open requests); rejected forms do not count against the limit.
const guestLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 8, skipFailedRequests: true });
const createLimiter: typeof guestLimiter = (req, res, next) => (req.user ? next() : guestLimiter(req, res, next));
const tokenLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 30 });

const guestFields = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().toLowerCase().email().max(190).optional().or(z.literal('').transform(() => undefined)),
  phone: z.string().trim().max(40).optional(),
  consent: z.boolean().optional(),
  website: z.string().max(200).optional(), // honeypot
  visitorId: visitorIdSchema.optional().catch(undefined),
  utm: utmSchema.optional().catch(undefined),
});

vacancyRequestsRouter.post('/', createLimiter, async (req, res) => {
  const body = parse(requestInputSchema.merge(guestFields), req.body);
  if (body.website) {
    res.status(201).json({ ok: true, already: false });
    return;
  }
  const input = { type: body.type, sector: body.sector, profession: body.profession, city: body.city, germanLevel: body.germanLevel, note: body.note, lng: body.lng, sourceVacancySlug: body.sourceVacancySlug };
  if (req.user?.role === 'CLIENT') {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true, locale: true, firstName: true, lastName: true } });
    if (user) {
      const r = await createClientRequest(user, input, req);
      if (!r.ok) throw r.code === 'TOO_MANY_REQUESTS' ? conflict(r.code) : badRequest(r.code);
      res.status(201).json({ ok: true, already: r.already, id: r.request.id });
      return;
    }
  }
  if (!body.name) throw badRequest('NAME_REQUIRED');
  const phone = body.phone ? (normalizePhoneNumber(body.phone, { country: 'AZ' }) ?? null) : null;
  if (body.phone && !phone) throw badRequest('INVALID_PHONE');
  if (!phone && !body.email) throw badRequest('CONTACT_REQUIRED');
  if (body.consent !== true) throw badRequest('CONSENT_REQUIRED');
  const r = await createGuestRequest({ input, name: body.name, email: body.email ?? null, phone, visitorId: body.visitorId, utm: body.utm, req });
  if (!r.ok) throw r.code === 'TOO_MANY_REQUESTS' ? conflict(r.code) : badRequest(r.code);
  res.status(201).json({ ok: true, already: r.already });
});

vacancyRequestsRouter.get('/mine', requireAuth, async (req, res) => {
  if (req.user!.role !== 'CLIENT') throw forbidden('CANDIDATES_ONLY');
  const rows = await prisma.vacancyRequest.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 100, include: { notices: { orderBy: { sentAt: 'desc' } } } });
  res.json({ items: await requestView(rows) });
});

vacancyRequestsRouter.post('/mine/:id/cancel', requireAuth, async (req, res) => {
  const r = await prisma.vacancyRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!r || r.userId !== req.user!.id) throw notFound('REQUEST_NOT_FOUND');
  await cancelRequest(r, req);
  res.json({ ok: true });
});

vacancyRequestsRouter.get('/by-token', tokenLimiter, async (req, res) => {
  const id = requestIdFromToken(String(req.query.token ?? ''));
  const r = id ? await prisma.vacancyRequest.findUnique({ where: { id } }) : null;
  if (!r) throw notFound('REQUEST_NOT_FOUND');
  res.json({ type: r.type, sector: r.sector, profession: r.profession, city: r.city, cancelled: !!r.cancelledAt });
});

vacancyRequestsRouter.post('/cancel', tokenLimiter, async (req, res) => {
  const { token } = parse(z.object({ token: z.string().max(120) }), req.body);
  const id = requestIdFromToken(token);
  const r = id ? await prisma.vacancyRequest.findUnique({ where: { id } }) : null;
  if (!r) throw notFound('REQUEST_NOT_FOUND');
  await cancelRequest(r, req);
  res.json({ ok: true });
});
