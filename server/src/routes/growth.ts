import { Router } from 'express';
import { z } from 'zod';
import type { InfoEvent } from '@prisma/client';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, conflict, limiter, notFound, parse } from '../lib/http.js';
import { recordConsent } from '../lib/privacy/consents.js';
import { calculatorCategories, DOC_STATES, estimate, getCalculatorSettings, INPUT_LEVELS } from '../lib/growth/calculator.js';
import { publicMap } from '../lib/growth/map.js';
import { leadForRegistrant, mailRegistrant } from '../lib/growth/events.js';
import { ensureReferralCode, getReferralSettings, maskedName, referralLink, syncReferrals } from '../lib/growth/referral.js';

/**
 * Public growth features — mounted at /api/growth:
 *   GET  /calculator, /calculator/estimate   start-date calculator
 *   GET  /map                                Germany placement map (aggregates ≥ 3 per city)
 *   GET  /events, /events/:slug              upcoming info sessions / webinars
 *   POST /events/:slug/register              registration (honeypot, consent, rate limit)
 *   GET  /referral                           the signed-in client's referral code, referrals and rewards
 */
export const growthRouter = Router();

const publicCache = (res: import('express').Response, seconds = 60) =>
  res.setHeader('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=600`);

// ─── Start-date calculator ─────────────────────────────────────────────

growthRouter.get('/calculator', async (_req, res) => {
  const settings = await getCalculatorSettings();
  publicCache(res);
  res.json({
    enabled: settings.enabled,
    levels: INPUT_LEVELS,
    documents: DOC_STATES,
    categories: settings.enabled ? await calculatorCategories(settings) : [],
    verifiedAt: settings.verifiedAt || null,
  });
});

const estimateLimiter = limiter({ windowMs: 60 * 1000, limit: 120 });

growthRouter.get('/calculator/estimate', estimateLimiter, async (req, res) => {
  const q = parse(
    z.object({
      category: z.string().trim().min(1).max(120),
      level: z.enum(INPUT_LEVELS),
      documents: z.enum(DOC_STATES),
      recognition: z.enum(['1', '0', '']).optional(),
      offer: z.enum(['1', '0']).default('0'),
    }),
    req.query,
  );
  const settings = await getCalculatorSettings();
  if (!settings.enabled) throw notFound('CALCULATOR_DISABLED');
  const category = await prisma.visaCategory.findFirst({
    where: { published: true, OR: [{ id: q.category }, { slug: q.category }] },
    select: { id: true, slug: true, visaLabel: true, germanLevel: true, processingMin: true, processingMax: true },
  });
  if (!category) throw notFound('CATEGORY_NOT_FOUND');
  const result = estimate(
    {
      category,
      level: q.level,
      documents: q.documents,
      recognition: q.recognition === '1' ? true : q.recognition === '0' ? false : undefined,
      jobOffer: q.offer === '1',
    },
    settings,
  );
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ category: { id: category.id, slug: category.slug }, ...result });
});

// ─── Placement map ─────────────────────────────────────────────────────

growthRouter.get('/map', async (_req, res) => {
  publicCache(res, 300);
  res.json(await publicMap());
});

// ─── Info sessions / webinars ──────────────────────────────────────────

const publicEvent = (e: InfoEvent & { _count: { registrations: number } }) => ({
  id: e.id,
  slug: e.slug,
  title: e.title,
  description: e.description,
  mode: e.mode,
  // The meeting link is only sent to registrants (confirmation / reminders).
  address: e.mode === 'OFFLINE' ? e.address : null,
  startsAt: e.startsAt,
  endsAt: e.endsAt,
  language: e.language,
  status: e.status,
  capacity: e.capacity,
  seatsLeft: e.capacity == null ? null : Math.max(0, e.capacity - e._count.registrations),
  registrationOpen: e.status === 'PUBLISHED' && e.startsAt.getTime() > Date.now() && (e.capacity == null || e._count.registrations < e.capacity),
});

growthRouter.get('/events', async (_req, res) => {
  const events = await prisma.infoEvent.findMany({
    where: { status: { in: ['PUBLISHED', 'CANCELLED'] }, endsAt: { gt: new Date() } },
    orderBy: { startsAt: 'asc' },
    take: 50,
    include: { _count: { select: { registrations: true } } },
  });
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json({ events: events.map(publicEvent) });
});

growthRouter.get('/events/:slug', async (req, res) => {
  const e = await prisma.infoEvent.findUnique({ where: { slug: String(req.params.slug) }, include: { _count: { select: { registrations: true } } } });
  if (!e || e.status === 'DRAFT') throw notFound();
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json({ event: publicEvent(e) });
});

const registerLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10 });

growthRouter.post('/events/:slug/register', registerLimiter, async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(2).max(120),
      phone: z
        .string()
        .trim()
        .max(40)
        .regex(/^[+\d][\d\s()-]{5,}$/, 'PHONE_INVALID')
        .optional()
        .or(z.literal('').transform(() => undefined)),
      email: z.string().trim().toLowerCase().email().max(200),
      locale: z.enum(['az', 'de', 'en', 'ru']).catch('az'),
      consent: z.literal(true),
      // honeypot: real users never fill this hidden field
      website: z.string().max(200).optional(),
    }),
    req.body,
  );
  if (body.website) {
    res.status(201).json({ ok: true, id: 'ok' }); // look like a success to bots
    return;
  }
  const event = await prisma.infoEvent.findUnique({ where: { slug: String(req.params.slug) } });
  if (!event || event.status === 'DRAFT') throw notFound();
  if (event.status !== 'PUBLISHED' || event.startsAt.getTime() <= Date.now()) throw new HttpError(409, 'REGISTRATION_CLOSED');
  const existing = await prisma.infoEventRegistration.findUnique({ where: { eventId_email: { eventId: event.id, email: body.email } } });
  if (existing) throw conflict('ALREADY_REGISTERED');

  // Capacity is checked inside a transaction so two last-seat sign-ups cannot both get in.
  const registration = await prisma.$transaction(async (tx) => {
    if (event.capacity != null) {
      const taken = await tx.infoEventRegistration.count({ where: { eventId: event.id } });
      if (taken >= event.capacity) throw new HttpError(409, 'EVENT_FULL');
    }
    return tx.infoEventRegistration.create({
      data: { eventId: event.id, name: body.name, email: body.email, phone: body.phone ?? null, locale: body.locale },
    });
  }).catch((err) => {
    if ((err as { code?: string }).code === 'P2002') throw conflict('ALREADY_REGISTERED');
    throw err;
  });
  if (event.capacity != null) {
    // Re-check after commit: concurrent transactions may each have seen one free seat.
    const total = await prisma.infoEventRegistration.count({ where: { eventId: event.id } });
    if (total > event.capacity) {
      await prisma.infoEventRegistration.delete({ where: { id: registration.id } });
      throw new HttpError(409, 'EVENT_FULL');
    }
  }
  await recordConsent({ email: body.email, type: 'PRIVACY_POLICY', granted: true, source: 'EVENT', req });
  const lead = await leadForRegistrant(event, body);
  if (lead.inquiryId) await prisma.infoEventRegistration.update({ where: { id: registration.id }, data: { inquiryId: lead.inquiryId } });
  void mailRegistrant(event, registration, 'confirmed').catch((err) => console.error('[events] confirmation mail failed', err));
  res.status(201).json({ ok: true, id: registration.id });
});

// ─── Client referral programme ─────────────────────────────────────────

growthRouter.get('/referral', requireRole('CLIENT'), async (req, res) => {
  const userId = req.user!.id;
  const settings = await getReferralSettings();
  await syncReferrals({ referrerId: userId });
  const [code, referrals] = await Promise.all([
    settings.enabled ? ensureReferralCode(userId) : prisma.clientReferralCode.findUnique({ where: { userId } }),
    prisma.clientReferral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { referred: { select: { firstName: true, lastName: true } }, reward: true },
    }),
  ]);
  const rewards = referrals.map((r) => r.reward).filter((r): r is NonNullable<typeof r> => !!r);
  const sum = (status: string[]) => rewards.filter((r) => status.includes(r.status)).reduce((a, r) => a + r.amount, 0);
  res.json({
    enabled: settings.enabled,
    rule: { trigger: settings.trigger, kind: settings.kind, amount: settings.amount, currency: settings.currency, terms: settings.terms },
    code: code?.code ?? null,
    link: code ? referralLink(code.code) : null,
    referrals: referrals.map((r) => ({
      id: r.id,
      name: maskedName(r.referred.firstName, r.referred.lastName),
      stage: r.stage,
      createdAt: r.createdAt,
      caseOpenedAt: r.caseOpenedAt,
      approvedAt: r.approvedAt,
      reward: r.reward ? { amount: r.reward.amount, currency: r.reward.currency, kind: r.reward.kind, status: r.reward.status, earnedAt: r.reward.earnedAt, settledAt: r.reward.settledAt } : null,
    })),
    totals: { pending: sum(['PENDING']), earned: sum(['EARNED']), settled: sum(['PAID', 'USED']), currency: settings.currency },
  });
});
