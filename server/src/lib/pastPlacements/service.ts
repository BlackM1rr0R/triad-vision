import { z } from 'zod';
import type { PastPlacement } from '@prisma/client';
import { activeCityCosts, matchCity } from '../budget/cities.js';
import { FEDERAL_STATES } from '../budget/params.js';
import { buildMap, cityKeyOf, getMapSettings } from '../growth/map.js';
import { PROFESSION_KEYS } from '../matching.js';
import { PROFESSION_LABELS } from '../jobAlerts/texts.js';

/**
 * Past placements (Admin → Sayt → Keçmiş yerləşdirmələr, /admin/past-placements): the agency's REAL historical
 * placements made before this system existed, entered by admins as aggregates (city, optional profession and
 * year, count, source note). They are added to the case-derived counts of the public placement map (globe on the
 * home page, /map, stories); the ≥ 3 per city threshold applies to the combined total. Nothing is seeded — only
 * numbers an admin entered are ever shown.
 */

export const currentYear = () => new Date().getUTCFullYear();

export const pastPlacementSchema = z.object({
  city: z.string().trim().min(2).max(80),
  state: z.enum(FEDERAL_STATES).nullable().optional(),
  profession: z
    .string()
    .refine((p) => PROFESSION_KEYS.includes(p), 'UNKNOWN_PROFESSION')
    .nullable()
    .optional(),
  count: z.number().int().min(1).max(100_000),
  year: z
    .number()
    .int()
    .min(1990)
    .refine((y) => y <= currentYear(), 'YEAR_IN_FUTURE')
    .nullable()
    .optional(),
  note: z.string().trim().max(300).nullable().optional(),
});
export type PastPlacementInput = z.infer<typeof pastPlacementSchema>;

/** Normalises the city through the city table (name, slug, Bundesland); unknown cities keep the typed name. */
export const toPastPlacementData = async (body: PastPlacementInput) => {
  const rows = await activeCityCosts();
  const typed = body.city.split(',')[0].trim().replace(/\s+/g, ' ');
  const match = matchCity(rows, typed);
  const city = match?.name ?? typed;
  return {
    city,
    cityKey: cityKeyOf(city),
    citySlug: match?.slug ?? null,
    state: body.state ?? match?.state ?? null,
    profession: body.profession ?? null,
    count: body.count,
    year: body.year ?? null,
    note: body.note?.trim() || null,
  };
};

/** Audit snapshot of a row (no ids of people). */
export const auditView = (r: Pick<PastPlacement, 'city' | 'state' | 'profession' | 'count' | 'year' | 'note'>) => ({
  city: r.city,
  state: r.state,
  profession: r.profession,
  count: r.count,
  year: r.year,
  note: r.note,
});

/** Options of the form: cities of the city table (with Bundesland) and the canonical professions. */
export const formOptions = async () => {
  const rows = await activeCityCosts();
  return {
    cities: rows.filter((r) => r.kind === 'CITY').map((r) => ({ slug: r.slug, name: r.name, state: r.state })),
    professions: PROFESSION_KEYS.filter((k) => PROFESSION_LABELS[k]).map((key) => ({ key, labels: PROFESSION_LABELS[key] })),
    states: [...FEDERAL_STATES],
    maxYear: currentYear(),
  };
};

/** What the public map will show (same builder as GET /api/growth/map), plus the cities withheld by the threshold. */
export const publicPreview = async () => {
  const settings = await getMapSettings();
  const { cities, minPerCity } = await buildMap({ ...settings, enabled: true }, { threshold: false });
  const shown = cities.filter((c) => c.workers >= minPerCity);
  return {
    mapEnabled: settings.enabled,
    showOnHome: settings.showOnHome,
    showOnStories: settings.showOnStories,
    useCases: settings.useCases,
    minPerCity,
    total: shown.reduce((s, c) => s + c.workers, 0),
    cities: cities.map((c) => ({ city: c.city, workers: c.workers, computed: c.computed, past: c.past, published: c.workers >= minPerCity })),
  };
};
