import type { CityAggregate } from '../growth/map.js';

/**
 * Pure merge of the admin-entered past placements (PastPlacement rows) into the placement map aggregates.
 *
 * Past rows are grouped per city (by the city-table slug when the city matched it, else by cityKey) and added to the
 * case-derived city with the same slug or key — so cases in "Frankfurt" and a past row for "Frankfurt am Main" end
 * up in one city. The privacy threshold (≥ 3) is applied afterwards to the combined total (applyThreshold).
 */

export interface PastRow {
  city: string;
  cityKey: string;
  citySlug: string | null;
  profession: string | null;
  count: number;
}

interface PastGroup {
  city: string;
  cityKey: string;
  slug: string | null;
  count: number;
  professions: Map<string, number>;
}

/** Totals of the past rows per city (slug when known, else cityKey); rows with a non-positive count are ignored. */
export const groupPast = (rows: readonly PastRow[], professionLabel: (key: string) => string) => {
  const groups = new Map<string, PastGroup>();
  for (const r of rows) {
    if (!(r.count > 0)) continue;
    const id = r.citySlug ? `slug:${r.citySlug}` : `key:${r.cityKey}`;
    const g = groups.get(id) ?? { city: r.city, cityKey: r.cityKey, slug: r.citySlug, count: 0, professions: new Map<string, number>() };
    g.count += r.count;
    if (r.profession) {
      const label = professionLabel(r.profession);
      g.professions.set(label, (g.professions.get(label) ?? 0) + r.count);
    }
    groups.set(id, g);
  }
  return groups;
};

const byCount = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);

/**
 * Adds the past placements to `out` (mutated): an existing city (same slug via `slugOfCity`, or same cityKey) gets
 * the count added, otherwise a new city is created. Professions: the existing top list, then the past professions
 * by count, at most 3.
 */
export const mergePast = (
  out: Map<string, CityAggregate>,
  rows: readonly PastRow[],
  slugOfCity: (city: string) => string | null,
  professionLabel: (key: string) => string,
) => {
  const groups = groupPast(rows, professionLabel);
  if (!groups.size) return out;
  const keyOfSlug = new Map<string, string>();
  for (const [key, c] of out) {
    const slug = slugOfCity(c.city);
    if (slug && !keyOfSlug.has(slug)) keyOfSlug.set(slug, key);
  }
  for (const g of groups.values()) {
    const key = (g.slug && keyOfSlug.get(g.slug)) || g.cityKey;
    const base = out.get(key);
    const professions = [...new Set([...(base?.professions ?? []), ...byCount(g.professions)])].slice(0, 3);
    if (base) {
      out.set(key, { ...base, workers: base.workers + g.count, past: (base.past ?? 0) + g.count, professions, source: base.computed > 0 ? 'mixed' : 'manual' });
    } else {
      out.set(key, { cityKey: key, city: g.city, workers: g.count, professions, lat: null, lng: null, source: 'manual', computed: 0, past: g.count });
      if (g.slug) keyOfSlug.set(g.slug, key);
    }
  }
  return out;
};

/** Cities that may be published: combined total ≥ min (never below 3), biggest first. */
export const applyThreshold = <T extends { workers: number; city: string }>(cities: Iterable<T>, min: number, threshold = true) =>
  [...cities].filter((c) => !threshold || c.workers >= Math.max(3, min)).sort((a, b) => b.workers - a.workers || a.city.localeCompare(b.city));
