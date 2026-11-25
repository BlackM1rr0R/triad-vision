/**
 * Active vacancies per city for the public map layer "Aktiv vakansiyalar": only the city, how many vacancies
 * with free places, and the gross monthly salary range. Never the employer, the vacancy title or anything else.
 * Pure aggregation (no database) so it is unit-tested on its own.
 */
export interface VacancyCityInput {
  city: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
}

export interface VacancyCity {
  city: string;
  count: number;
  salaryMin: number | null;
  salaryMax: number | null;
}

/** "Hamburg, Deutschland " -> "hamburg" (same key as lib/growth/map cityKeyOf). */
const keyOf = (city: string) => city.split(',')[0].trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 80);

export const aggregateVacancyCities = (rows: VacancyCityInput[]): VacancyCity[] => {
  const by = new Map<string, VacancyCity>();
  for (const r of rows) {
    const raw = r.city?.split(',')[0].trim();
    if (!raw) continue;
    const key = keyOf(raw);
    if (!key) continue;
    const row = by.get(key) ?? { city: raw, count: 0, salaryMin: null, salaryMax: null };
    row.count++;
    const lo = r.salaryMin ?? r.salaryMax;
    const hi = r.salaryMax ?? r.salaryMin;
    if (lo != null) row.salaryMin = row.salaryMin == null ? lo : Math.min(row.salaryMin, lo);
    if (hi != null) row.salaryMax = row.salaryMax == null ? hi : Math.max(row.salaryMax, hi);
    by.set(key, row);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
};
