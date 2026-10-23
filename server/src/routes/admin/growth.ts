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
import { getReferralSettings, REFERRAL_DEFAULTS, referralSchema, syncReferrals } from '../../lib/growth/referral.js';

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
  const counts = await eventCounts(events.map((e) => e.id));
  res.json({ events: events.map((e) => ({ ...e, counts: counts[e.id] ?? { total: 0, CHECKED_IN: 0, NO_SHOW: 0, REGISTERED: 0 } })) });
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
  res.json({ event });
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

adminGrowthRouter.get('/referrals', async (_req, res) => {
  await syncReferrals();
  const [settings, referrals] = await Promise.all([
    getReferralSettings(),
    prisma.clientReferral.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        reward: true,
        referrer: { select: { id: true, firstName: true, lastName: true, email: true } },
        referred: { select: { id: true, firstName: true, lastName: true, email: true, referredByAgentId: true } },
      },
    }),
  ]);
  const totals: Record<string, number> = { PENDING: 0, EARNED: 0, PAID: 0, USED: 0, CANCELLED: 0 };
  for (const r of referrals) if (r.reward) totals[r.reward.status] += r.reward.amount;
  res.json({ settings, defaults: REFERRAL_DEFAULTS, referrals, totals });
});

adminGrowthRouter.put('/referrals/settings', adminOnly, async (req, res) => {
  const settings = parse(referralSchema, req.body);
  await writeSetting(GROWTH_SETTING_KEYS.referral, settings);
  fresh();
  await audit(req, 'GROWTH_REFERRAL_SETTINGS_UPDATED', GROWTH_SETTING_KEYS.referral, { trigger: settings.trigger, kind: settings.kind, amount: settings.amount });
  res.json({ settings });
});

/** Allowed ledger moves (admin): EARNED → PAID / USED, anything open → CANCELLED, CANCELLED → PENDING (undo). */
const MOVES: Record<string, string[]> = {
  PENDING: ['CANCELLED'],
  EARNED: ['PAID', 'USED', 'CANCELLED'],
  PAID: [],
  USED: [],
  CANCELLED: ['PENDING'],
};

adminGrowthRouter.patch('/referrals/rewards/:id', adminOnly, async (req, res) => {
  const body = parse(z.object({ status: z.enum(['PENDING', 'PAID', 'USED', 'CANCELLED']), note: z.string().trim().max(300).optional() }), req.body);
  const reward = await prisma.referralReward.findUnique({ where: { id: String(req.params.id) }, include: { referral: { select: { stage: true } } } });
  if (!reward) throw notFound();
  if (!MOVES[reward.status].includes(body.status)) throw badRequest('INVALID_TRANSITION');
  if (body.status === 'PENDING' && reward.referral.stage === 'BLOCKED') throw badRequest('REFERRAL_BLOCKED');
  const settled = body.status === 'PAID' || body.status === 'USED';
  const updated = await prisma.referralReward.update({
    where: { id: reward.id },
    data: {
      status: body.status,
      ...(body.note !== undefined ? { note: body.note } : {}),
      settledAt: settled ? new Date() : null,
      settledById: settled ? req.user!.id : null,
      ...(body.status === 'PENDING' ? { earnedAt: null } : {}),
    },
  });
  if (body.status === 'PENDING') await syncReferrals({ id: reward.referralId }); // may be earned again right away
  await audit(req, 'REFERRAL_REWARD_UPDATED', reward.id, { from: reward.status, to: body.status });
  res.json({ reward: await prisma.referralReward.findUnique({ where: { id: updated.id } }) });
});
