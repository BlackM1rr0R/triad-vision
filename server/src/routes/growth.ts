import { Router } from 'express';
import { z } from 'zod';
import type { InfoEvent } from '@prisma/client';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, conflict, limiter, notFound, parse } from '../lib/http.js';
import { recordConsent } from '../lib/privacy/consents.js';
import { calculatorCategories, DOC_STATES, estimate, getCalculatorSettings, INPUT_LEVELS } from '../lib/growth/calculator.js';
import { publicMap } from '../lib/growth/map.js';
import { eventIcs, leadForRegistrant, mailRegistrant, registrationIdOf } from '../lib/growth/events.js';
import { asEventLocale } from '../lib/growth/eventTexts.js';
import { ensureReferralCode, getReferralSettings, maskedName, referralLink, syncReferrals } from '../lib/growth/referral.js';
import { campaignActive, caseOpenedBonus, friendDiscount, nextTier } from '../lib/growth/referralRules.js';
import { referralShareRouter } from './referralShare.js';
import { attachLeadContext, utmSchema, visitorIdSchema } from '../lib/marketing/leadScoring.js';
import { visitorDid } from '../lib/marketing/visitors.js';
import { costCategories, costInputSchema, estimateCost, getCostSettings, ITEM_KEYS } from '../lib/marketing/costCalculator.js';
import { publicOrigins } from '../lib/marketing/originMap.js';
import { notifyStaff } from '../lib/notifications.js';
import { onInquiryCreated } from '../lib/assignment/inquiry.js';

/**
 * Public growth features — mounted at /api/growth:
 *   GET  /calculator, /calculator/estimate   start-date calculator
 *   GET  /map                                Germany placement map (aggregates ≥ 3 per city)
 *   GET  /events, /events/:slug              upcoming info sessions / webinars
 *   POST /events/:slug/register              registration (honeypot, consent, rate limit)
 *   GET  /events/:slug/ics                   "add to calendar" (?r=<registrant token> adds the join link)
 *   GET  /events/:slug/recording             recording of a past event (registrants only, ?r=<token>)
 *   GET  /cost-calculator, /…/estimate       client cost calculator
 *   POST /cost-calculator/offer              "get an exact offer" → Inquiry with the estimate
 *   GET  /origins                            origin → destination map (aggregates ≥ 3)
 *   GET  /referral                           the signed-in client's referral code, referrals, rewards and bonuses
 */
export const growthRouter = Router();
growthRouter.use(referralShareRouter); // referral landing page, share messages, QR card, receipts, terms

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

growthRouter.get('/origins', async (_req, res) => {
  publicCache(res, 300);
  res.json(await publicOrigins());
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
      // lead scoring context (the visitor id only exists after analytics consent)
      visitorId: visitorIdSchema.optional().catch(undefined),
      utm: utmSchema.optional().catch(undefined),
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
  await visitorDid(body.visitorId, 'event_register');
  if (lead.inquiryId) await attachLeadContext(lead.inquiryId, { visitorId: body.visitorId, utm: lead.created ? body.utm : undefined });
  void mailRegistrant(event, registration, 'confirmed').catch((err) => console.error('[events] confirmation mail failed', err));
  res.status(201).json({ ok: true, id: registration.id });
});

const tokenLimiter = limiter({ windowMs: 60 * 1000, limit: 60 });

/** Registration of this event behind a registrant token (from the e-mails), or null. */
const registrantOf = async (eventId: string, token: unknown) => {
  const id = registrationIdOf(token);
  if (!id) return null;
  return prisma.infoEventRegistration.findFirst({ where: { id, eventId } });
};

growthRouter.get('/events/:slug/ics', tokenLimiter, async (req, res) => {
  const e = await prisma.infoEvent.findUnique({ where: { slug: String(req.params.slug) } });
  if (!e || e.status === 'DRAFT') throw notFound();
  const registrant = req.query.r ? await registrantOf(e.id, req.query.r) : null;
  const locale = asEventLocale(registrant?.locale ?? String(req.query.lng ?? e.language));
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="triad-vision-${e.slug.slice(0, 60)}.ics"`);
  res.setHeader('Cache-Control', registrant ? 'private, no-store' : 'public, max-age=300');
  // Without a valid registrant token the join link stays out of the file.
  res.send(eventIcs(e, locale, e.status === 'CANCELLED', !!registrant));
});

growthRouter.get('/events/:slug/recording', tokenLimiter, async (req, res) => {
  const e = await prisma.infoEvent.findUnique({ where: { slug: String(req.params.slug) } });
  if (!e || e.status === 'DRAFT') throw notFound();
  const registrant = await registrantOf(e.id, req.query.r);
  if (!registrant) throw notFound('NOT_A_REGISTRANT');
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ recordingUrl: e.startsAt.getTime() <= Date.now() ? e.recordingUrl : null, name: registrant.name });
});

// ─── Client cost calculator ────────────────────────────────────────────

growthRouter.get('/cost-calculator', async (_req, res) => {
  const settings = await getCostSettings();
  publicCache(res);
  res.json({
    enabled: settings.enabled,
    items: ITEM_KEYS,
    rates: settings.rates,
    ratesUpdatedAt: settings.ratesUpdatedAt || null,
    categories: settings.enabled
      ? (await costCategories(settings)).map((c) => ({
          id: c.id,
          slug: c.slug,
          title: c.title,
          icon: c.icon,
          visaLabel: c.visaLabel,
          germanLevel: c.germanLevel,
          defaults: {
            documents: c.fees.translationDocs,
            apostilles: c.fees.apostilleDocs,
            recognition: c.fees.recognitionDefault,
            language: c.languageDefault,
            blockedAccount: c.fees.blockedAccount > 0,
          },
        }))
      : [],
  });
});

const findCostCategory = (idOrSlug: string) =>
  prisma.visaCategory.findFirst({
    where: { published: true, OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true, slug: true, title: true, visaLabel: true, germanLevel: true },
  });

const costQuery = costInputSchema.extend({ category: z.string().trim().min(1).max(120) });

growthRouter.get('/cost-calculator/estimate', estimateLimiter, async (req, res) => {
  const q = parse(costQuery, req.query);
  const settings = await getCostSettings();
  if (!settings.enabled) throw notFound('CALCULATOR_DISABLED');
  const category = await findCostCategory(q.category);
  if (!category) throw notFound('CATEGORY_NOT_FOUND');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ category: { id: category.id, slug: category.slug }, ...(await estimateCost(category, q, settings)) });
});

const offerLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10 });

growthRouter.post('/cost-calculator/offer', offerLimiter, async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().toLowerCase().email().max(200),
      phone: z
        .string()
        .trim()
        .max(40)
        .regex(/^[+\d][\d\s()-]{5,}$/, 'PHONE_INVALID')
        .optional()
        .or(z.literal('').transform(() => undefined)),
      message: z.string().trim().max(2000).optional().or(z.literal('').transform(() => undefined)),
      locale: z.enum(['az', 'de', 'en', 'ru']).catch('az'),
      consent: z.literal(true),
      // honeypot: real users never fill this hidden field
      website: z.string().max(200).optional(),
      visitorId: visitorIdSchema.optional().catch(undefined),
      utm: utmSchema.optional().catch(undefined),
      input: costQuery,
    }),
    req.body,
  );
  if (body.website) {
    res.status(201).json({ ok: true, id: 'ok' });
    return;
  }
  const settings = await getCostSettings();
  if (!settings.enabled) throw notFound('CALCULATOR_DISABLED');
  const category = await findCostCategory(body.input.category);
  if (!category) throw notFound('CATEGORY_NOT_FOUND');
  // The estimate is recomputed on the server: stored figures never come from the browser.
  const est = await estimateCost(category, body.input, settings);
  const title = (category.title as Record<string, string> | null)?.az || category.slug;
  const eur = (m: [number, number]) => (m[0] === m[1] ? `${m[0]} EUR` : `${m[0]}–${m[1]} EUR`);
  const yes = (b: boolean) => (b ? 'bəli' : 'xeyr');
  const message = [
    `Xərc kalkulyatoru: dəqiq təklif sorğusu — ${title} (${category.visaLabel})`,
    `Böyüklər: ${est.input.adults}, uşaqlar: ${est.input.children}, tərcümə: ${est.input.documents}, apostil: ${est.input.apostilles}, tanınma: ${yes(est.input.recognition)}, dil kursu: ${yes(est.input.language)}`,
    `Birdəfəlik xərclər: ${eur(est.oneTime)}${est.refundable[1] > 0 ? `; bloklanmış hesab (geri qaytarılır): ${eur(est.refundable)}` : ''}`,
    body.message ? `\n${body.message}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
  const inquiry = await prisma.inquiry.create({
    data: { kind: 'contact', source: 'cost-calculator', contactName: body.name, email: body.email, phone: body.phone ?? null, sector: title.slice(0, 120), message, locale: body.locale },
  });
  void onInquiryCreated(inquiry.id); // automation rules + optional auto-assignment (never throws)
  await recordConsent({ email: body.email, type: 'PRIVACY_POLICY', granted: true, source: 'COST_CALCULATOR', req });
  await visitorDid(body.visitorId, 'cost_calc');
  await notifyStaff(
    `Xərc kalkulyatoru: ${body.name}`,
    [`Email: ${body.email}`, body.phone ? `Telefon: ${body.phone}` : null, `Dil: ${body.locale}`, '', message].filter((l): l is string => l !== null).join('\n'),
    { link: '/admin/inquiries' },
  );
  // Lead score after the notice, so a HOT alert never arrives before it (never throws).
  await attachLeadContext(inquiry.id, {
    visitorId: body.visitorId,
    utm: body.utm,
    estimate: {
      category: { id: category.id, slug: category.slug, visaLabel: category.visaLabel },
      input: { ...est.input },
      items: est.items.map((i) => ({ key: i.key, amount: i.amount, qty: i.qty, refundable: i.refundable })),
      oneTime: est.oneTime,
      refundable: est.refundable,
      currency: 'EUR',
      computedAt: new Date().toISOString(),
    },
  });
  res.status(201).json({ ok: true, id: inquiry.id });
});

// ─── Client referral programme ─────────────────────────────────────────

growthRouter.get('/referral', requireRole('CLIENT'), async (req, res) => {
  const userId = req.user!.id;
  const settings = await getReferralSettings();
  await syncReferrals({ referrerId: userId });
  const [code, referrals, ledger] = await Promise.all([
    settings.enabled ? ensureReferralCode(userId) : prisma.clientReferralCode.findUnique({ where: { userId } }),
    prisma.clientReferral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { referred: { select: { firstName: true, lastName: true } }, reward: true },
    }),
    // Every ledger row for this user: main rewards, bonuses, and their own discount as a referred friend.
    prisma.referralReward.findMany({ where: { referrerId: userId }, orderBy: { createdAt: 'desc' }, take: 500 }),
  ]);
  const mine = ledger.filter((r) => r.type !== 'FRIEND');
  const sum = (status: string[]) => mine.filter((r) => status.includes(r.status)).reduce((a, r) => a + r.amount, 0);
  const brief = (r: (typeof ledger)[number]) => ({ id: r.id, amount: r.amount, currency: r.currency, kind: r.kind, status: r.status, earnedAt: r.earnedAt, settledAt: r.settledAt });
  const stageBonus = new Map(mine.filter((r) => r.type === 'STAGE' && r.sourceReferralId).map((r) => [r.sourceReferralId!, r]));
  const welcome = ledger.find((r) => r.type === 'FRIEND' && r.status !== 'CANCELLED');
  const approved = referrals.filter((r) => r.stage === 'VISA_APPROVED').length;
  const now = new Date();
  res.json({
    enabled: settings.enabled,
    rule: {
      trigger: settings.trigger,
      kind: settings.kind,
      amount: settings.amount,
      currency: settings.currency,
      terms: settings.terms,
      caseOpenedBonus: caseOpenedBonus(settings, now),
      tiers: settings.tiers,
      friendDiscount: friendDiscount(settings),
      campaign: campaignActive(settings.campaign, now)
        ? { multiplier: settings.campaign.multiplier, endsAt: settings.campaign.endsAt || null, label: settings.campaign.label }
        : null,
    },
    code: code?.code ?? null,
    link: code ? referralLink(code.code) : null,
    referrals: referrals.map((r) => ({
      id: r.id,
      name: maskedName(r.referred.firstName, r.referred.lastName),
      stage: r.stage,
      createdAt: r.createdAt,
      caseOpenedAt: r.caseOpenedAt,
      approvedAt: r.approvedAt,
      reward: r.reward ? brief(r.reward) : null,
      bonus: stageBonus.has(r.id) ? brief(stageBonus.get(r.id)!) : null,
    })),
    tierBonuses: mine.filter((r) => r.type === 'TIER').map((r) => ({ ...brief(r), approved: Number(r.dedupeKey?.split(':')[2]) || null })),
    progress: { approved, next: nextTier(settings.tiers, approved) },
    welcome: welcome ? brief(welcome) : null,
    totals: { pending: sum(['PENDING']), earned: sum(['EARNED']), settled: sum(['PAID', 'USED']), currency: settings.currency },
  });
});
