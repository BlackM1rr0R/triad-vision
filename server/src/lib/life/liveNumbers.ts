import { prisma } from '../../db.js';
import { canonicalProfession } from '../matching.js';
import { cityKeyOf } from '../growth/map.js';
import { PROFESSION_LABELS } from '../jobAlerts/texts.js';
import type { SeoLocale } from '../seoCatalogue.js';
import { getLifeSettings } from './settings.js';

/**
 * Live numbers board ("This month: X visas granted, Y people arrived in Germany, top professions, top cities").
 *
 * Real data, anonymous and aggregated:
 *  - visas granted: cases (main applicants and family members) that reached APPROVED in the month (decisionAt,
 *    else closedAt);
 *  - people arrived: arrival plans of main applicants that are COMPLETED, or CONFIRMED with a flight date already
 *    past, with the flight in the month — the travellers on the plan (family included);
 *  - top professions: canonical profession (lib/matching.ts) of the main applicants approved in the month;
 *  - top cities: German city (arrival plan housing city, else employer, else vacancy) of those approved / arrived.
 * Privacy: every figure below MIN_COUNT (3) is withheld (null / left out), so no single person can be singled out;
 * only counts leave the server. When nothing of the current month can be shown yet (early in the month) the
 * previous month is shown, labelled as such. Computed at most once an hour (in-memory cache; admin saves clear it).
 */

export const MIN_COUNT = 3;
const TTL_MS = 60 * 60 * 1000;
const TOP = 3;

export interface LiveNumbersData {
  month: string; // YYYY-MM
  period: 'current' | 'previous';
  visas: number | null;
  arrivals: number | null;
  professions: { key: string; labels: Record<SeoLocale, string>; count: number }[];
  cities: { city: string; count: number }[];
  minCount: number;
  computedAt: string;
}

const monthStart = (d: Date, offset = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
const ym = (d: Date) => d.toISOString().slice(0, 7);
const visible = (n: number) => (n >= MIN_COUNT ? n : null);

const top = <T>(counts: Map<string, { n: number; value: T }>) =>
  [...counts.entries()]
    .filter(([, v]) => v.n >= MIN_COUNT)
    .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
    .slice(0, TOP);

const bump = <T>(m: Map<string, { n: number; value: T }>, key: string, value: T, by = 1) => {
  const cur = m.get(key);
  if (cur) cur.n += by;
  else m.set(key, { n: by, value });
};

/** Raw aggregation of one month [from, to) — exported for the tests; thresholds applied here. */
export const computeMonth = async (from: Date, to: Date, now = new Date()) => {
  const approved = await prisma.case.findMany({
    where: {
      status: 'APPROVED',
      OR: [{ decisionAt: { gte: from, lt: to } }, { decisionAt: null, closedAt: { gte: from, lt: to } }],
    },
    select: {
      id: true,
      parentCaseId: true,
      profession: true,
      vacancy: { select: { profession: true, city: true } },
      company: { select: { city: true } },
      arrivalPlan: { select: { housingCity: true } },
    },
    take: 20_000,
  });
  const arrived = await prisma.arrivalPlan.findMany({
    where: {
      flightDate: { gte: from, lt: to < now ? to : now },
      status: { in: ['COMPLETED', 'CONFIRMED'] },
      case: { parentCaseId: null },
    },
    select: {
      caseId: true,
      travellers: true,
      housingCity: true,
      case: { select: { company: { select: { city: true } }, vacancy: { select: { city: true } } } },
    },
    take: 20_000,
  });
  // A COMPLETED plan may carry a future flight date by mistake; the date filter above (≤ now) keeps it out.
  const visas = approved.length;
  const arrivals = arrived.reduce((s, a) => s + Math.max(1, a.travellers || 1), 0);

  const professions = new Map<string, { n: number; value: string }>();
  for (const c of approved) {
    if (c.parentCaseId) continue;
    const key = canonicalProfession(c.vacancy?.profession || c.profession) ?? canonicalProfession(c.profession);
    if (key && PROFESSION_LABELS[key]) bump(professions, key, key);
  }

  const cities = new Map<string, { n: number; value: string }>();
  const seen = new Set<string>();
  const addCity = (caseId: string, raw: string | null | undefined) => {
    if (seen.has(caseId)) return;
    const display = raw?.split(',')[0].trim();
    if (!display) return;
    seen.add(caseId);
    bump(cities, cityKeyOf(display), display);
  };
  for (const a of arrived) addCity(a.caseId, a.housingCity || a.case.company?.city || a.case.vacancy?.city);
  for (const c of approved) if (!c.parentCaseId) addCity(c.id, c.arrivalPlan?.housingCity || c.company?.city || c.vacancy?.city);

  return {
    visas: visible(visas),
    arrivals: visible(arrivals),
    professions: top(professions).map(([key, v]) => ({ key, labels: PROFESSION_LABELS[key], count: v.n })),
    cities: top(cities).map(([, v]) => ({ city: v.value, count: v.n })),
  };
};

const hasAny = (m: Awaited<ReturnType<typeof computeMonth>>) => m.visas != null || m.arrivals != null || m.professions.length > 0 || m.cities.length > 0;

let cache: { at: number; value: LiveNumbersData | null } | null = null;
export const clearLiveNumbersCache = () => {
  cache = null;
};

/** This month's figures (or last month's while nothing can be shown yet); null when there is nothing to show. */
export const liveNumbers = async (now = new Date()): Promise<LiveNumbersData | null> => {
  if (cache && now.getTime() - cache.at < TTL_MS) return cache.value;
  const cur = monthStart(now);
  let m = await computeMonth(cur, monthStart(now, 1), now);
  let period: LiveNumbersData['period'] = 'current';
  let month = ym(cur);
  if (!hasAny(m)) {
    const prev = monthStart(now, -1);
    m = await computeMonth(prev, cur, now);
    period = 'previous';
    month = ym(prev);
  }
  const value = hasAny(m) ? { month, period, ...m, minCount: MIN_COUNT, computedAt: now.toISOString() } : null;
  cache = { at: now.getTime(), value };
  return value;
};

/** Public payload: the board settings plus the figures (nothing when the board is off). */
export const publicLiveNumbers = async () => {
  const s = await getLifeSettings();
  if (!s.board.enabled) return { enabled: false as const, showOnHome: false, showOnAbout: false, data: null };
  return { enabled: true as const, showOnHome: s.board.showOnHome, showOnAbout: s.board.showOnAbout, data: await liveNumbers() };
};
