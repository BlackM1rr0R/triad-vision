import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { conflict, notFound } from '../http.js';
import { daysUntil } from '../clientPlus/portal.js';
import { dayWeather, type DayWeather } from './dayWeather.js';

/**
 * "My Germany day" (portal home card, GET /api/account/departure): from the visa approval on, the countdown to the
 * departure (arrival plan: arrival time, else flight day), the destination city with its weather — the forecast of
 * the current week while the flight is at most MAX_FORECAST_DAYS (16) days away, the city's typical climate for the
 * departure month otherwise (or when Open-Meteo is unavailable) — and the packing checklist, which opens
 * PACKING_OPENS_DAYS (14) days before the flight. The first-day German phrases are static client copy.
 *
 * Access: the caller's own APPROVED cases only (Case.clientId); a member case without its own arrival plan uses the
 * main case's (the family flies together).
 */

export const PACKING_OPENS_DAYS = 14;
/** The card stays this many days after the departure day ("You made it"), then the portal hides it. */
export const AFTER_DAYS = 3;

/** Packing checklist items (copy on the client: i18n/pagesGermanyDay). Order = display order. */
export const PACKING_KEYS = [
  'passport',
  'visaCheck',
  'contract',
  'diplomas',
  'insurance',
  'money',
  'addressNote',
  'photos',
  'medicine',
  'clothes',
  'workShoes',
  'phone',
  'copies',
  'arrivalCard',
] as const;
export type PackingKey = (typeof PACKING_KEYS)[number];

type Checked = Partial<Record<PackingKey, string>>;

const checkedOf = (v: Prisma.JsonValue | null | undefined): Checked => {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out: Checked = {};
  for (const k of PACKING_KEYS) if (typeof o[k] === 'string') out[k] = o[k] as string;
  return out;
};

/** The approved case the card is about (the chosen one when given, else the newest decision) or null. */
const approvedCase = async (userId: string, caseId: string | null) =>
  prisma.case.findFirst({
    where: { clientId: userId, status: 'APPROVED', ...(caseId ? { id: caseId } : {}) },
    orderBy: [{ parentCaseId: 'asc' }, { decisionAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      number: true,
      parentCaseId: true,
      company: { select: { city: true } },
      vacancy: { select: { city: true } },
      arrivalPlan: true,
      housing: { select: { city: true } },
    },
  });

export interface GermanyDay {
  case: { id: string; number: string } | null;
  departureAt: string | null;
  /** true: departureAt is a calendar day only (no arrival time known). */
  dayOnly: boolean;
  days: number | null;
  phase: 'NO_CASE' | 'NO_FLIGHT' | 'UPCOMING' | 'TODAY' | 'ARRIVED';
  flightNumber: string | null;
  departureAirport: string | null;
  arrivalAirport: string | null;
  city: string | null;
  weather: DayWeather | null;
  packing: { open: boolean; opensInDays: number | null; items: { key: PackingKey; checkedAt: string | null }[]; done: number; total: number };
}

const packingView = (checked: Checked, open: boolean, opensInDays: number | null): GermanyDay['packing'] => {
  const items = PACKING_KEYS.map((key) => ({ key, checkedAt: checked[key] ?? null }));
  return { open, opensInDays, items, done: items.filter((i) => i.checkedAt).length, total: items.length };
};

export const germanyDay = async (userId: string, caseId: string | null, now = new Date()): Promise<GermanyDay> => {
  const [c, row] = await Promise.all([approvedCase(userId, caseId), prisma.packingChecklist.findUnique({ where: { userId } })]);
  const checked = checkedOf(row?.checked);
  const empty = (phase: GermanyDay['phase']): GermanyDay => ({
    case: c ? { id: c.id, number: c.number } : null,
    departureAt: null,
    dayOnly: false,
    days: null,
    phase,
    flightNumber: null,
    departureAirport: null,
    arrivalAirport: null,
    city: null,
    weather: null,
    packing: packingView(checked, false, null),
  });
  if (!c) return empty('NO_CASE');
  const parent = c.parentCaseId && !c.arrivalPlan ? await approvedCase(userId, c.parentCaseId) : null;
  const plan = c.arrivalPlan ?? parent?.arrivalPlan ?? null;
  const city = c.housing?.city || plan?.housingCity || c.vacancy?.city || c.company?.city || parent?.housing?.city || parent?.vacancy?.city || parent?.company?.city || null;
  const departure = plan && plan.status !== 'CANCELLED' ? (plan.arrivalTime ?? plan.flightDate) : null;
  if (!departure) return { ...empty('NO_FLIGHT'), city };

  const days = daysUntil(departure, now);
  const arrived = plan?.status === 'COMPLETED' || days < 0;
  const phase: GermanyDay['phase'] = arrived ? 'ARRIVED' : days === 0 ? 'TODAY' : 'UPCOMING';
  const open = !arrived && days <= PACKING_OPENS_DAYS;
  return {
    case: { id: c.id, number: c.number },
    departureAt: departure.toISOString(),
    dayOnly: !plan?.arrivalTime,
    days,
    phase,
    flightNumber: plan?.flightNumber ?? null,
    departureAirport: plan?.departureAirport ?? null,
    arrivalAirport: plan?.arrivalAirport ?? null,
    city,
    // No upstream call once the client is there (the card only says "You made it" for a few days).
    weather: arrived ? null : await dayWeather(city, days, departure, now),
    packing: packingView(checked, open, open ? 0 : Math.max(0, days - PACKING_OPENS_DAYS)),
  };
};

/** Ticks / unticks one packing item (only while the checklist is open). */
export const setPacking = async (userId: string, key: PackingKey, done: boolean, now = new Date()) => {
  const day = await germanyDay(userId, null, now);
  if (!day.case) throw notFound('CASE_NOT_FOUND');
  if (!day.packing.open) throw conflict('PACKING_NOT_OPEN');
  const row = await prisma.packingChecklist.findUnique({ where: { userId } });
  const checked = checkedOf(row?.checked);
  if (done) checked[key] ??= now.toISOString();
  else delete checked[key];
  await prisma.packingChecklist.upsert({ where: { userId }, create: { userId, checked }, update: { checked } });
  return packingView(checked, true, 0);
};
