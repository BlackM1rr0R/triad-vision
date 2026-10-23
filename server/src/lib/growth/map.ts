import { z } from 'zod';
import { prisma } from '../../db.js';
import { cached } from '../cache.js';
import { GROWTH_SETTING_KEYS, readSetting } from './settings.js';

/**
 * Germany placement map: how many of our workers are in which German city.
 *
 * Computed from main-applicant cases (no family members) whose visa was APPROVED or whose arrival
 * plan is COMPLETED, with the city of the linked employer (Company.city) or, failing that, of the
 * vacancy. Admin "map entries" then override (OVERRIDE), add to (ADD) or hide (HIDE) single cities.
 * Privacy: a city is only published with at least MIN_PER_CITY (3) workers — never fewer, whatever
 * the setting says — and only counts and job titles leave the server, never names or case data.
 */
export const MIN_PER_CITY = 3;

export const mapSchema = z.object({
  /** Show the map at all (/map page, home and stories sections). */
  enabled: z.boolean().default(true),
  showOnHome: z.boolean().default(true),
  showOnStories: z.boolean().default(true),
  /** Count cases automatically; off = only the manual entries are shown. */
  useCases: z.boolean().default(true),
  /** Minimum per city (cannot go below 3). */
  minPerCity: z.number().int().min(MIN_PER_CITY).max(100).default(MIN_PER_CITY),
});
export type MapSettings = z.infer<typeof mapSchema>;
export const MAP_DEFAULTS: MapSettings = { enabled: true, showOnHome: true, showOnStories: true, useCases: true, minPerCity: MIN_PER_CITY };

export const getMapSettings = () => readSetting(GROWTH_SETTING_KEYS.map, mapSchema, MAP_DEFAULTS);

/** "Hamburg, Deutschland " → "hamburg" */
export const cityKeyOf = (city: string) => city.split(',')[0].trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 80);

export interface CityAggregate {
  cityKey: string;
  city: string;
  workers: number;
  professions: string[];
  lat: number | null;
  lng: number | null;
  /** computed | manual | mixed (admin view only) */
  source: 'computed' | 'manual' | 'mixed';
  computed: number;
}

const topProfessions = (counts: Map<string, number>, n = 3) =>
  [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([p]) => p);

/** Raw aggregation of the cases (no threshold) — the admin preview shows it. */
export const computeCityCounts = async () => {
  const cases = await prisma.case.findMany({
    where: {
      parentCaseId: null,
      OR: [{ status: 'APPROVED' }, { arrivalPlan: { is: { status: 'COMPLETED' } } }],
    },
    select: {
      profession: true,
      company: { select: { city: true } },
      vacancy: { select: { city: true, profession: true } },
    },
    take: 20000,
  });
  const byCity = new Map<string, { names: Map<string, number>; workers: number; professions: Map<string, number> }>();
  for (const c of cases) {
    const raw = c.company?.city?.trim() || c.vacancy?.city?.trim();
    if (!raw) continue;
    const key = cityKeyOf(raw);
    if (!key) continue;
    const row = byCity.get(key) ?? { names: new Map(), workers: 0, professions: new Map() };
    const display = raw.split(',')[0].trim();
    row.names.set(display, (row.names.get(display) ?? 0) + 1);
    row.workers++;
    const prof = (c.vacancy?.profession || c.profession || '').trim();
    if (prof) row.professions.set(prof, (row.professions.get(prof) ?? 0) + 1);
    byCity.set(key, row);
  }
  return byCity;
};

/** Computed counts merged with the admin entries; `threshold` false keeps small cities (admin preview). */
export const buildMap = async (settings: MapSettings, opts: { threshold: boolean }) => {
  const [computed, entries] = await Promise.all([
    settings.useCases ? computeCityCounts() : Promise.resolve(new Map<string, never>()),
    prisma.placementMapEntry.findMany(),
  ]);
  const out = new Map<string, CityAggregate>();
  for (const [key, row] of computed) {
    out.set(key, {
      cityKey: key,
      city: topProfessions(row.names, 1)[0] ?? key,
      workers: row.workers,
      professions: topProfessions(row.professions),
      lat: null,
      lng: null,
      source: 'computed',
      computed: row.workers,
    });
  }
  for (const e of entries) {
    const base = out.get(e.cityKey);
    if (e.mode === 'HIDE') {
      out.delete(e.cityKey);
      continue;
    }
    const manualProfessions = Array.isArray(e.professions) ? (e.professions as unknown[]).filter((p): p is string => typeof p === 'string') : [];
    const workers = e.mode === 'ADD' ? (base?.workers ?? 0) + e.workers : e.workers;
    out.set(e.cityKey, {
      cityKey: e.cityKey,
      city: e.city,
      workers,
      professions: manualProfessions.length ? manualProfessions.slice(0, 5) : (base?.professions ?? []),
      lat: e.lat,
      lng: e.lng,
      source: base ? 'mixed' : 'manual',
      computed: base?.computed ?? 0,
    });
  }
  const min = Math.max(MIN_PER_CITY, settings.minPerCity);
  const cities = [...out.values()]
    .filter((c) => !opts.threshold || c.workers >= min)
    .sort((a, b) => b.workers - a.workers || a.city.localeCompare(b.city));
  return { cities, minPerCity: min };
};

/** Public map (cached; admin edits clear the cache). Only aggregates of at least 3 per city. */
export const publicMap = () =>
  cached('growth:map', async () => {
    const settings = await getMapSettings();
    if (!settings.enabled) return { enabled: false, showOnHome: false, showOnStories: false, cities: [], total: 0, minPerCity: MIN_PER_CITY };
    const { cities, minPerCity } = await buildMap(settings, { threshold: true });
    return {
      enabled: true,
      showOnHome: settings.showOnHome,
      showOnStories: settings.showOnStories,
      minPerCity,
      total: cities.reduce((a, c) => a + c.workers, 0),
      cities: cities.map((c) => ({ city: c.city, workers: c.workers, professions: c.professions, lat: c.lat, lng: c.lng })),
    };
  });
