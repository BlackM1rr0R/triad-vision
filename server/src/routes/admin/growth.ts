import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { clearCache } from '../../lib/cache.js';
import { zonedToUtc } from '../../lib/ics.js';
import { newMeetingUrl } from '../booking.js';
import { GROWTH_SETTING_KEYS, writeSetting } from '../../lib/growth/settings.js';
import { CALCULATOR_DEFAULTS, calculatorSchema, getCalculatorSettings } from '../../lib/growth/calculator.js';
import { buildMap, cityKeyOf, getMapSettings, MAP_DEFAULTS, mapSchema } from '../../lib/growth/map.js';
import { mailRegistrant, pickL10n, sendFollowUps } from '../../lib/growth/events.js';
import { asEventLocale, eventTexts, formatEventTime } from '../../lib/growth/eventTexts.js';
import { eventUrl, eventWhere, bookingUrl } from '../../lib/growth/events.js';
import { blockReferral, getReferralSettings, REFERRAL_DEFAULTS, referralPeriodQuery, referralSchema, syncReferrals } from '../../lib/growth/referral.js';
import { bakuPeriod, leaderboard, leaderboardCsv, signupBursts } from '../../lib/growth/referralRules.js';
import { getReferralTemplates, getReferralTerms, REFERRAL_EXTRA_KEYS, TEMPLATE_DEFAULTS, templatesSchema, TERMS_DEFAULTS, termsSchema } from '../../lib/growth/referralExtras.js';
import { receiptNumber } from '../../lib/growth/referralPdf.js';
import { receiptFor, sendReceipt } from '../referralShare.js';
import { csvSafe } from '../../lib/csvSafe.js';
import { emptyConversion, eventConversions } from '../../lib/growth/eventStats.js';

/**
 * Admin side of the public growth features — mounted at /api/admin/growth (STAFF+; settings and
 * money-related actions ADMIN+). Every write clears the public cache and is audited.
 */
export const adminGrowthRouter = Router();
const adminOnly = requireMinRole('ADMIN');

const fresh = () => clearCache();

// ─── Calculator assumptions ────────────────────────────────────────────

adminGrowthRouter.get('/calculator', async (_req, res) => {
  res.json({ settings: await getCalculatorSettings(), defaults: CALCULATOR_DEFAULTS });
});

adminGrowthRouter.put('/calculator', adminOnly, async (req, res) => {
  const settings = parse(calculatorSchema, req.body);
  await writeSetting(GROWTH_SETTING_KEYS.calculator, settings);
  fresh();
  await audit(req, 'GROWTH_CALCULATOR_UPDATED', GROWTH_SETTING_KEYS.calculator);
  res.json({ settings });
});

// ─── Placement map ─────────────────────────────────────────────────────

adminGrowthRouter.get('/map', async (_req, res) => {
  const settings = await getMapSettings();
  const [entries, preview] = await Promise.all([
    prisma.placementMapEntry.findMany({ orderBy: { city: 'asc' } }),
    buildMap({ ...settings, enabled: true }, { threshold: false }),
  ]);
  res.json({
    settings,
    defaults: MAP_DEFAULTS,
    entries,
    preview: preview.cities.map((c) => ({ ...c, published: c.workers >= preview.minPerCity })),
    minPerCity: preview.minPerCity,
  });
});

adminGrowthRouter.put('/map/settings', adminOnly, async (req, res) => {
  const settings = parse(mapSchema, req.body);
  await writeSetting(GROWTH_SETTING_KEYS.map, settings);
  fresh();
  await audit(req, 'GROWTH_MAP_SETTINGS_UPDATED', GROWTH_SETTING_KEYS.map, settings);
  res.json({ settings });
});

const entryBody = z.object({
  city: z.string().trim().min(2).max(80),
  mode: z.enum(['OVERRIDE', 'ADD', 'HIDE']).default('OVERRIDE'),
  workers: z.number().int().min(0).max(100_000).default(0),
  professions: z.array(z.string().trim().min(1).max(60)).max(5).default([]),
  lat: z.number().min(47).max(55.2).nullable().optional(),
  lng: z.number().min(5.8).max(15.1).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

adminGrowthRouter.post('/map/entries', adminOnly, async (req, res) => {
  const body = parse(entryBody, req.body);
  const cityKey = cityKeyOf(body.city);
  const data = {
    city: body.city,
    mode: body.mode,
    workers: body.workers,
    professions: body.professions,
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    note: body.note ?? null,
  };
  const entry = await prisma.placementMapEntry.upsert({ where: { cityKey }, create: { cityKey, ...data }, update: data });
  fresh();
  await audit(req, 'GROWTH_MAP_ENTRY_SAVED', entry.id, { city: entry.city, mode: entry.mode, workers: entry.workers });
  res.status(201).json({ entry });
});

adminGrowthRouter.patch('/map/entries/:id', adminOnly, async (req, res) => {
  const body = parse(entryBody.partial(), req.body);
  const existing = await prisma.placementMapEntry.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw notFound();
  const cityKey = body.city ? cityKeyOf(body.city) : existing.cityKey;
  if (cityKey !== existing.cityKey && (await prisma.placementMapEntry.findUnique({ where: { cityKey } }))) throw conflict('CITY_EXISTS');
  const entry = await prisma.placementMapEntry.update({
    where: { id: existing.id },
    data: {
      cityKey,
      ...(body.city !== undefined ? { city: body.city } : {}),
      ...(body.mode !== undefined ? { mode: body.mode } : {}),
      ...(body.workers !== undefined ? { workers: body.workers } : {}),
      ...(body.professions !== undefined ? { professions: body.professions } : {}),
      ...(body.lat !== undefined ? { lat: body.lat } : {}),
      ...(body.lng !== undefined ? { lng: body.lng } : {}),
      ...(body.note !== undefined ? { note: body.note } : {}),
    },
  });
  fresh();
  await audit(req, 'GROWTH_MAP_ENTRY_SAVED', entry.id, { city: entry.city, mode: entry.mode, workers: entry.workers });
  res.json({ entry });
});

adminGrowthRouter.delete('/map/entries/:id', adminOnly, async (req, res) => {
  const { count } = await prisma.placementMapEntry.deleteMany({ where: { id: String(req.params.id) } });
  if (!count) throw notFound();
  fresh();
  await audit(req, 'GROWTH_MAP_ENTRY_DELETED', String(req.params.id));
  res.json({ ok: true });
});

// ─── Info sessions / webinars ──────────────────────────────────────────

const l10n = (max: number) =>
  z.object({ az: z.string().trim().max(max), de: z.string().trim().max(max), en: z.string().trim().max(max), ru: z.string().trim().max(max) });

const eventBody = z
  .object({
    title: l10n(160).refine((t) => Object.values(t).some((v) => v.length >= 3), 'TITLE_REQUIRED'),
    description: l10n(5000),
    mode: z.enum(['ONLINE', 'OFFLINE']),
    meetingUrl: z.string().trim().url().startsWith('https://').max(500).nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    /** Wall-clock date and time in Asia/Baku. */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    durationMin: z.number().int().min(15).max(8 * 60).default(60),
    capacity: z.number().int().min(1).max(10_000).nullable().optional(),
    language: z.enum(['az', 'de', 'en', 'ru']).default('az'),
    status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED']).default('DRAFT'),
    followUpNote: l10n(2000).nullable().optional(),
    /** Recording (YouTube / Vimeo / drive link) shown to registrants after the event and in the follow-up mail. */
    recordingUrl: z.string().trim().url().startsWith('https://').max(1000).nullable().optional(),
  })
  .refine((b) => b.mode === 'ONLINE' || (b.address ?? '').length >= 3, { message: 'ADDRESS_REQUIRED', path: ['address'] });

const startOf = (date: string, time: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return zonedToUtc(y, m, d, h, mi, 'Asia/Baku');
};

const slugify = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ə/gi, 'e')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const uniqueSlug = async (title: Record<string, string>, date: string, exceptId?: string) => {
  const base = `${slugify(title.az || title.en || title.de || title.ru) || 'event'}-${date}`.slice(0, 110);
  for (let n = 1; n < 100; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await prisma.infoEvent.findUnique({ where: { slug }, select: { id: true } });
    if (!taken || taken.id === exceptId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
};

const eventCounts = async (ids: string[]) => {
  const rows = await prisma.infoEventRegistration.groupBy({ by: ['eventId', 'attendance'], where: { eventId: { in: ids } }, _count: { _all: true } });
  const out: Record<string, { total: number; CHECKED_IN: number; NO_SHOW: number; REGISTERED: number }> = {};
  for (const r of rows) {
    const c = (out[r.eventId] ??= { total: 0, CHECKED_IN: 0, NO_SHOW: 0, REGISTERED: 0 });
    c[r.attendance] += r._count._all;
    c.total += r._count._all;
  }
  return out;
};

adminGrowthRouter.get('/events', async (req, res) => {
  const scope = req.query.scope === 'past' ? 'past' : 'upcoming';
  const now = new Date();
  const events = await prisma.infoEvent.findMany({
    where: scope === 'past' ? { endsAt: { lte: now } } : { endsAt: { gt: now } },
    orderBy: { startsAt: scope === 'past' ? 'desc' : 'asc' },
    take: 200,
  });
  const [counts, conversions] = await Promise.all([eventCounts(events.map((e) => e.id)), eventConversions(events.map((e) => e.id))]);
  res.json({
    events: events.map((e) => ({
      ...e,
      counts: counts[e.id] ?? { total: 0, CHECKED_IN: 0, NO_SHOW: 0, REGISTERED: 0 },
      conversion: conversions[e.id] ?? emptyConversion(),
    })),
  });
});

adminGrowthRouter.post('/events', async (req, res) => {
  const body = parse(eventBody, req.body);
  const startsAt = startOf(body.date, body.time);
  const event = await prisma.infoEvent.create({
    data: {
      slug: await uniqueSlug(body.title, body.date),
      title: body.title,
      description: body.description,
      mode: body.mode,
      meetingUrl: body.mode === 'ONLINE' ? body.meetingUrl || newMeetingUrl() : null,
      address: body.mode === 'OFFLINE' ? (body.address ?? null) : null,
      startsAt,
      endsAt: new Date(startsAt.getTime() + body.durationMin * 60_000),
      capacity: body.capacity ?? null,
      language: body.language,
      status: body.status,
      followUpNote: body.followUpNote ?? undefined,
      recordingUrl: body.recordingUrl ?? null,
      createdById: req.user!.id,
    },
  });
  fresh();
  await audit(req, 'INFO_EVENT_CREATED', event.id, { slug: event.slug, status: event.status });
  res.status(201).json({ event });
});

adminGrowthRouter.get('/events/:id', async (req, res) => {
  const event = await prisma.infoEvent.findUnique({
    where: { id: String(req.params.id) },
    include: { registrations: { orderBy: { createdAt: 'asc' } } },
  });
  if (!event) throw notFound();
  const conversion = (await eventConversions([event.id]))[event.id] ?? emptyConversion();
  res.json({ event, conversion });
});

adminGrowthRouter.patch('/events/:id', async (req, res) => {
  const existing = await prisma.infoEvent.findUnique({ where: { id: String(req.params.id) }, include: { registrations: true } });
  if (!existing) throw notFound();
  const body = parse(eventBody, req.body);
  const startsAt = startOf(body.date, body.time);
  const event = await prisma.infoEvent.update({
    where: { id: existing.id },
    data: {
      title: body.title,
      description: body.description,
      mode: body.mode,
      meetingUrl: body.mode === 'ONLINE' ? body.meetingUrl || existing.meetingUrl || newMeetingUrl() : null,
      address: body.mode === 'OFFLINE' ? (body.address ?? null) : null,
      startsAt,
      endsAt: new Date(startsAt.getTime() + body.durationMin * 60_000),
      capacity: body.capacity ?? null,
      language: body.language,
      status: body.status,
      followUpNote: body.followUpNote === null ? (null as unknown as Prisma.InputJsonValue) : (body.followUpNote ?? undefined),
      ...(body.recordingUrl !== undefined ? { recordingUrl: body.recordingUrl } : {}),
    },
  });
  // Registrants hear about a cancellation (with a cancelling .ics) and about a moved date (new .ics).
  const cancelled = existing.status !== 'CANCELLED' && event.status === 'CANCELLED';
  const moved = !cancelled && event.status === 'PUBLISHED' && existing.startsAt.getTime() !== event.startsAt.getTime();
  if (cancelled || moved) {
    for (const r of existing.registrations) {
      void mailRegistrant(event, r, cancelled ? 'cancelled' : 'confirmed').catch((err) => console.error('[events] mail failed', err));
    }
  }
  fresh();
  await audit(req, 'INFO_EVENT_UPDATED', event.id, { status: event.status, cancelled, moved });
  res.json({ event, notified: cancelled || moved ? existing.registrations.length : 0 });
});

adminGrowthRouter.delete('/events/:id', adminOnly, async (req, res) => {
  const existing = await prisma.infoEvent.findUnique({ where: { id: String(req.params.id) }, include: { _count: { select: { registrations: true } } } });
  if (!existing) throw notFound();
  if (existing._count.registrations > 0 && existing.status !== 'CANCELLED') throw conflict('HAS_REGISTRATIONS'); // cancel first (registrants are told)
  await prisma.infoEvent.delete({ where: { id: existing.id } });
  fresh();
  await audit(req, 'INFO_EVENT_DELETED', existing.id, { slug: existing.slug });
  res.json({ ok: true });
});

adminGrowthRouter.patch('/events/:id/registrations/:regId', async (req, res) => {
  const body = parse(z.object({ attendance: z.enum(['REGISTERED', 'CHECKED_IN', 'NO_SHOW']) }), req.body);
  const reg = await prisma.infoEventRegistration.findFirst({ where: { id: String(req.params.regId), eventId: String(req.params.id) } });
  if (!reg) throw notFound();
  const updated = await prisma.infoEventRegistration.update({
    where: { id: reg.id },
    data: { attendance: body.attendance, checkedInAt: body.attendance === 'CHECKED_IN' ? new Date() : null, markedById: req.user!.id },
  });
  await audit(req, 'INFO_EVENT_ATTENDANCE', reg.id, { eventId: reg.eventId, attendance: body.attendance });
  res.json({ registration: updated });
});

adminGrowthRouter.get('/events/:id/follow-up/preview', async (req, res) => {
  const event = await prisma.infoEvent.findUnique({ where: { id: String(req.params.id) } });
  if (!event) throw notFound();
  const locale = asEventLocale(String(req.query.locale ?? 'az'));
  const msg = eventTexts[locale].followUp({
    name: '{{name}}',
    title: pickL10n(event.title, locale),
    when: formatEventTime(event.startsAt, locale),
    where: eventWhere(event),
    online: event.mode === 'ONLINE',
    eventUrl: eventUrl(event.slug),
    bookingUrl: bookingUrl(),
    note: pickL10n(event.followUpNote, locale).trim() || undefined,
    recordingUrl: event.recordingUrl || undefined,
  });
  res.json({ locale, ...msg, ctaUrl: bookingUrl() });
});

adminGrowthRouter.post('/events/:id/follow-up', async (req, res) => {
  const body = parse(z.object({ audience: z.enum(['attended', 'all', 'noShow']).default('attended') }), req.body);
  const event = await prisma.infoEvent.findUnique({ where: { id: String(req.params.id) }, select: { id: true, startsAt: true } });
  if (!event) throw notFound();
  if (event.startsAt.getTime() > Date.now()) throw badRequest('EVENT_NOT_STARTED');
  const result = await sendFollowUps(event.id, body.audience);
  await audit(req, 'INFO_EVENT_FOLLOW_UP', event.id, { audience: body.audience, sent: result?.sent ?? 0 });
  res.json(result);
});

// ─── Client referral programme ─────────────────────────────────────────

const personSelect = { id: true, firstName: true, lastName: true, email: true } as const;

/** GET /referrals — settings, the latest 500 referrals (with their main reward), bonus rows and totals. */
adminGrowthRouter.get('/referrals', async (_req, res) => {
  await syncReferrals();
  const [settings, referrals, bonuses, sums] = await Promise.all([
    getReferralSettings(),
    prisma.clientReferral.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        reward: true,
        referrer: { select: personSelect },
        referred: { select: { ...personSelect, referredByAgentId: true } },
      },
    }),
    prisma.referralReward.findMany({
      where: { type: { not: 'REFERRAL' } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { source: { select: { id: true, stage: true, referrer: { select: personSelect }, referred: { select: personSelect } } } },
    }),
    // The referrers' money (the friend's own discount is not part of it).
    prisma.referralReward.groupBy({ by: ['status'], where: { type: { not: 'FRIEND' } }, _sum: { amount: true } }),
  ]);
  const totals: Record<string, number> = { PENDING: 0, EARNED: 0, PAID: 0, USED: 0, CANCELLED: 0 };
  for (const s of sums) totals[s.status] = s._sum.amount ?? 0;
  res.json({ settings, defaults: REFERRAL_DEFAULTS, referrals, bonuses, totals });
});

adminGrowthRouter.put('/referrals/settings', adminOnly, async (req, res) => {
  const settings = parse(referralSchema, req.body);
  await writeSetting(GROWTH_SETTING_KEYS.referral, settings);
  fresh();
  await audit(req, 'GROWTH_REFERRAL_SETTINGS_UPDATED', GROWTH_SETTING_KEYS.referral, {
    trigger: settings.trigger,
    kind: settings.kind,
    amount: settings.amount,
    caseOpenedBonus: settings.caseOpenedBonus,
    tiers: settings.tiers,
    friendDiscount: settings.friendDiscount,
    campaign: { enabled: settings.campaign.enabled, multiplier: settings.campaign.multiplier, startsAt: settings.campaign.startsAt, endsAt: settings.campaign.endsAt },
  });
  res.json({ settings });
});

/**
 * Leaderboard per referrer for a period (?from, ?to: Baku days, inclusive): friends registered / case
 * opened / visa approved / blocked in the period, rewards earned, pending, settled, and what is owed now.
 */
const loadLeaderboard = async (q: { from?: string; to?: string }) => {
  const [settings, referrals, rewards] = await Promise.all([
    getReferralSettings(),
    prisma.clientReferral.findMany({ select: { referrerId: true, stage: true, createdAt: true, caseOpenedAt: true, approvedAt: true } }),
    prisma.referralReward.findMany({ select: { referrerId: true, type: true, status: true, amount: true, createdAt: true, earnedAt: true, settledAt: true } }),
  ]);
  const rows = leaderboard(referrals, rewards, bakuPeriod(q.from, q.to));
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.referrerId) } }, select: personSelect });
  const byId = new Map(users.map((u) => [u.id, u]));
  return {
    from: q.from ?? null,
    to: q.to ?? null,
    currency: settings.currency,
    rows: rows.map((r) => {
      const u = byId.get(r.referrerId);
      return { ...r, name: u ? `${u.firstName} ${u.lastName}`.trim() : '—', email: u?.email ?? '' };
    }),
  };
};

adminGrowthRouter.get('/referrals/leaderboard', async (req, res) => {
  await syncReferrals();
  res.json(await loadLeaderboard(parse(referralPeriodQuery, req.query)));
});

adminGrowthRouter.get('/referrals/leaderboard.csv', async (req, res) => {
  const q = parse(referralPeriodQuery, req.query);
  const board = await loadLeaderboard(q);
  await audit(req, 'REFERRAL_LEADERBOARD_EXPORTED', undefined, { from: board.from, to: board.to, rows: board.rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="dostunu-getir${q.from ? `-${q.from}` : ''}${q.to ? `_${q.to}` : ''}.csv"`);
  res.send(leaderboardCsv(board.rows, board.currency));
});

/**
 * GET /referrals/suspicious — blocked referrals (self-referral checks or blocked by an admin) and
 * referrers with a burst of sign-ups (≥ 5 within 24 h in the last 90 days).
 */
adminGrowthRouter.get('/referrals/suspicious', async (_req, res) => {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const [blocked, recent] = await Promise.all([
    prisma.clientReferral.findMany({
      where: { stage: 'BLOCKED' },
      orderBy: { updatedAt: 'desc' },
      take: 300,
      include: { referrer: { select: personSelect }, referred: { select: personSelect } },
    }),
    prisma.clientReferral.findMany({ where: { createdAt: { gte: since } }, select: { referrerId: true, createdAt: true } }),
  ]);
  const bursts = signupBursts(recent);
  const users = await prisma.user.findMany({ where: { id: { in: [...bursts.keys()] } }, select: personSelect });
  res.json({
    blocked: blocked.map((r) => ({ id: r.id, blockedReason: r.blockedReason, createdAt: r.createdAt, updatedAt: r.updatedAt, referrer: r.referrer, referred: r.referred })),
    bursts: users.map((u) => ({ referrer: u, maxIn24h: bursts.get(u.id)! })).sort((a, b) => b.maxIn24h - a.maxIn24h),
  });
});

/** POST /referrals/:id/block — an admin blocks a referral (MANUAL); its unsettled rewards are cancelled. */
adminGrowthRouter.post('/referrals/:id/block', adminOnly, async (req, res) => {
  const body = parse(z.object({ note: z.string().trim().max(300).optional() }), req.body ?? {});
  const referral = await prisma.clientReferral.findUnique({ where: { id: String(req.params.id) }, select: { id: true, stage: true } });
  if (!referral) throw notFound();
  if (!(await blockReferral(referral.id, 'MANUAL'))) throw badRequest('ALREADY_BLOCKED');
  await audit(req, 'REFERRAL_BLOCKED', referral.id, { from: referral.stage, note: body.note ?? null });
  res.json({ ok: true });
});

/** Allowed ledger moves (admin): EARNED → PAID / USED, anything open → CANCELLED, CANCELLED → PENDING (undo). */
const MOVES: Record<string, string[]> = {
  PENDING: ['CANCELLED'],
  EARNED: ['PAID', 'USED', 'CANCELLED'],
  PAID: [],
  USED: [],
  CANCELLED: ['PENDING'],
};

/**
 * POST /referrals/rewards/settle { ids? | referrerId?, note? } — marks EARNED rewards settled in one go:
 * PAYOUT → PAID, DISCOUNT → USED. Only EARNED rows move; everything else is skipped. Audited.
 */
adminGrowthRouter.post('/referrals/rewards/settle', adminOnly, async (req, res) => {
  const body = parse(
    z
      .object({
        ids: z.array(z.string().trim().min(1).max(40)).min(1).max(500).optional(),
        referrerId: z.string().trim().min(1).max(40).optional(),
        note: z.string().trim().max(300).optional(),
      })
      .refine((b) => !!b.ids !== !!b.referrerId, 'IDS_OR_REFERRER'),
    req.body,
  );
  const where: Prisma.ReferralRewardWhereInput = { status: 'EARNED', ...(body.ids ? { id: { in: body.ids } } : { referrerId: body.referrerId }) };
  const rows = await prisma.referralReward.findMany({ where, select: { id: true, kind: true, amount: true } });
  const stamp = { settledAt: new Date(), settledById: req.user!.id, ...(body.note !== undefined ? { note: body.note } : {}) };
  const ids = (kind: string) => rows.filter((r) => (kind === 'PAYOUT' ? r.kind === 'PAYOUT' : r.kind !== 'PAYOUT')).map((r) => r.id);
  // status: 'EARNED' again in the update, so a row settled concurrently is not counted twice.
  const [paid, used] = await Promise.all([
    prisma.referralReward.updateMany({ where: { id: { in: ids('PAYOUT') }, status: 'EARNED' }, data: { status: 'PAID', ...stamp } }),
    prisma.referralReward.updateMany({ where: { id: { in: ids('DISCOUNT') }, status: 'EARNED' }, data: { status: 'USED', ...stamp } }),
  ]);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  await audit(req, 'REFERRAL_REWARDS_SETTLED', body.referrerId, { paid: paid.count, used: used.count, total, ids: rows.map((r) => r.id).slice(0, 100) });
  res.json({ paid: paid.count, used: used.count, total });
});

adminGrowthRouter.patch('/referrals/rewards/:id', adminOnly, async (req, res) => {
  const body = parse(z.object({ status: z.enum(['PENDING', 'PAID', 'USED', 'CANCELLED']), note: z.string().trim().max(300).optional() }), req.body);
  const reward = await prisma.referralReward.findUnique({
    where: { id: String(req.params.id) },
    include: { referral: { select: { stage: true } }, source: { select: { stage: true } } },
  });
  if (!reward) throw notFound();
  if (!MOVES[reward.status].includes(body.status)) throw badRequest('INVALID_TRANSITION');
  if (body.status === 'PENDING' && (reward.referral ?? reward.source)?.stage === 'BLOCKED') throw badRequest('REFERRAL_BLOCKED');
  // A bonus is granted already earned, so its undo goes back to EARNED; only the main reward waits for its trigger.
  const status = body.status === 'PENDING' && reward.type !== 'REFERRAL' ? 'EARNED' : body.status;
  const settled = status === 'PAID' || status === 'USED';
  const updated = await prisma.referralReward.update({
    where: { id: reward.id },
    data: {
      status,
      ...(body.note !== undefined ? { note: body.note } : {}),
      settledAt: settled ? new Date() : null,
      settledById: settled ? req.user!.id : null,
      ...(status === 'PENDING' ? { earnedAt: null } : {}),
    },
  });
  if (status === 'PENDING' && reward.referralId) await syncReferrals({ id: reward.referralId }); // may be earned again right away
  await audit(req, 'REFERRAL_REWARD_UPDATED', reward.id, { from: reward.status, to: status, type: reward.type });
  res.json({ reward: await prisma.referralReward.findUnique({ where: { id: updated.id } }) });
});

// ─── Share templates, terms, payout report, receipts ───────────────────

/** Share messages per profession: staff may edit (STAFF+ like the rest of this router). */
adminGrowthRouter.get('/referrals/templates', async (_req, res) => {
  res.json({ ...(await getReferralTemplates()), defaults: TEMPLATE_DEFAULTS });
});

adminGrowthRouter.put('/referrals/templates', async (req, res) => {
  const value = parse(templatesSchema, req.body);
  await writeSetting(REFERRAL_EXTRA_KEYS.templates, value);
  await audit(req, 'REFERRAL_TEMPLATES_UPDATED', REFERRAL_EXTRA_KEYS.templates, { count: value.items.length });
  res.json(value);
});

adminGrowthRouter.get('/referrals/terms', async (_req, res) => {
  res.json({ ...(await getReferralTerms()), defaults: TERMS_DEFAULTS });
});

adminGrowthRouter.put('/referrals/terms', adminOnly, async (req, res) => {
  const body = parse(termsSchema.pick({ body: true }), req.body);
  const value = { body: body.body, updatedAt: new Date().toISOString() };
  await writeSetting(REFERRAL_EXTRA_KEYS.terms, value);
  fresh();
  await audit(req, 'REFERRAL_TERMS_UPDATED', REFERRAL_EXTRA_KEYS.terms);
  res.json(value);
});

/**
 * GET /referrals/payouts.csv?from&to[&all=1] — rewards settled in the period for accounting: cash payouts
 * (PAID) by default, with ?all=1 also discounts used (USED). Semicolon CSV with BOM, receipt numbers.
 */
adminGrowthRouter.get('/referrals/payouts.csv', async (req, res) => {
  const q = parse(referralPeriodQuery.extend({ all: z.enum(['1', '0']).optional() }), req.query);
  const period = bakuPeriod(q.from, q.to);
  const rows = await prisma.referralReward.findMany({
    where: {
      status: q.all === '1' ? { in: ['PAID', 'USED'] } : 'PAID',
      settledAt: { not: null, ...(period.from ? { gte: period.from } : {}), ...(period.to ? { lt: period.to } : {}) },
    },
    orderBy: { settledAt: 'asc' },
    take: 20_000,
  });
  const ids = [...new Set(rows.flatMap((r) => [r.referrerId, r.settledById ?? '']).filter(Boolean))];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, email: true } })).map((u) => [u.id, u]));
  const name = (id: string | null) => {
    const u = id ? users.get(id) : null;
    return u ? `${u.firstName} ${u.lastName}`.trim() : '';
  };
  const cell = (v: string | number) => {
    const s = csvSafe(String(v));
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    ['Qəbz', 'Tarix', 'Alan', 'E-poçt', 'Növ', 'Mükafat', 'Status', 'Məbləğ', 'Valyuta', 'Kim bağladı', 'Qeyd'],
    ...rows.map((r) => [
      r.status === 'PAID' ? receiptNumber({ id: r.id, settledAt: r.settledAt! }) : '',
      r.settledAt!.toISOString().slice(0, 10),
      name(r.referrerId),
      users.get(r.referrerId)?.email ?? '',
      r.type,
      r.kind,
      r.status,
      r.amount,
      r.currency,
      name(r.settledById),
      r.note ?? '',
    ]),
  ];
  const total = rows.reduce((a, r) => a + r.amount, 0);
  lines.push(['Cəmi', '', '', '', '', '', '', total, '', '', '']);
  await audit(req, 'REFERRAL_PAYOUTS_EXPORTED', undefined, { from: q.from ?? null, to: q.to ?? null, rows: rows.length, total });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="dostunu-getir-odenisler${q.from ? `-${q.from}` : ''}${q.to ? `_${q.to}` : ''}.csv"`);
  res.send(`﻿${lines.map((l) => l.map(cell).join(';')).join('\r\n')}\r\n`);
});

adminGrowthRouter.get('/referrals/rewards/:id/receipt.pdf', async (req, res) => {
  const r = await receiptFor(String(req.params.id));
  if (!r) throw notFound();
  await audit(req, 'REFERRAL_RECEIPT_DOWNLOADED', String(req.params.id), { number: r.number });
  await sendReceipt(res, r);
});
