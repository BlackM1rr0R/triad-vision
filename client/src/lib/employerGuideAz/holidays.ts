/**
 * Public holidays (non-working days) in Azerbaijan for the employer guide (/employer-guide-azerbaijan), so German
 * employers can plan holidays, home trips and deadlines.
 *
 * - Fixed dates: Labour Code of the Republic of Azerbaijan, art. 105 (Əmək Məcəlləsi, 105-ci maddə).
 * - Novruz, Ramazan and Qurban bayramı are set every year by a decision of the Cabinet of Ministers. 2026:
 *   decision No. 362 of 2 December 2025 (Novruz 20–24 March, Ramazan 20–21 March, Qurban 27–28 May),
 *   https://nk.gov.az/uploads/doc/docs/692e89d45e806.pdf.
 * - 2027: not decided yet (as of November 2026). Novruz is shown on its usual dates (around the March equinox);
 *   Ramazan / Qurban bayramı are estimated from the astronomical Hijri calendar (1 Shawwal 1448 ≈ 9 March 2027,
 *   10 Dhu al-Hijja 1448 ≈ 16 May 2027) and can move by a day after moon sighting. Shown as estimates.
 * If a holiday falls on a weekend, the following working day is usually free (art. 105); the Cabinet also moves
 * rest days around the holidays, which is not modelled here.
 */

export type HolidayKey =
  | 'newYear'
  | 'mourning'
  | 'women'
  | 'novruz'
  | 'ramazan'
  | 'victoryFascism'
  | 'independence'
  | 'qurban'
  | 'salvation'
  | 'armedForces'
  | 'victory'
  | 'flag'
  | 'solidarity';

export type HolidayStatus = 'fixed' | 'decree' | 'estimated';

export interface AzHoliday {
  key: HolidayKey;
  /** First day, ISO date. */
  start: string;
  /** Last day (inclusive), ISO date; same as start for one-day holidays. */
  end: string;
  status: HolidayStatus;
}

/** Fixed-date holidays: [key, month, first day, number of days]. */
const FIXED: [HolidayKey, number, number, number][] = [
  ['newYear', 1, 1, 2],
  ['mourning', 1, 20, 1],
  ['women', 3, 8, 1],
  ['victoryFascism', 5, 9, 1],
  ['independence', 5, 28, 1],
  ['salvation', 6, 15, 1],
  ['armedForces', 6, 26, 1],
  ['victory', 11, 8, 1],
  ['flag', 11, 9, 1],
  ['solidarity', 12, 31, 1],
];

/** Holidays set each year by the Cabinet of Ministers (decree) or estimated until the decree is published. */
const MOVABLE: Record<number, AzHoliday[]> = {
  2026: [
    { key: 'novruz', start: '2026-03-20', end: '2026-03-24', status: 'decree' },
    { key: 'ramazan', start: '2026-03-20', end: '2026-03-21', status: 'decree' },
    { key: 'qurban', start: '2026-05-27', end: '2026-05-28', status: 'decree' },
  ],
  2027: [
    { key: 'novruz', start: '2027-03-20', end: '2027-03-24', status: 'estimated' },
    { key: 'ramazan', start: '2027-03-09', end: '2027-03-10', status: 'estimated' },
    { key: 'qurban', start: '2027-05-16', end: '2027-05-17', status: 'estimated' },
  ],
};

export const HOLIDAY_YEARS = Object.keys(MOVABLE).map(Number);

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
/** Adds days to an ISO date (UTC, no time-zone drift). */
export const addDays = (isoDate: string, days: number) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** All holidays of a year, sorted by start date (movable ones only for the years in MOVABLE). */
export const holidaysFor = (year: number): AzHoliday[] => {
  const fixed = FIXED.map(([key, m, d, n]): AzHoliday => {
    const start = iso(year, m, d);
    return { key, start, end: addDays(start, n - 1), status: 'fixed' };
  });
  return [...fixed, ...(MOVABLE[year] ?? [])].sort((a, b) => a.start.localeCompare(b.start) || a.key.localeCompare(b.key));
};

/** Number of calendar days a holiday lasts. */
export const holidayDays = (h: AzHoliday) => Math.round((Date.parse(`${h.end}T00:00:00Z`) - Date.parse(`${h.start}T00:00:00Z`)) / 86_400_000) + 1;

/** Holidays that end on or after `fromIso`, over the years we have data for. */
export const upcomingHolidays = (fromIso: string, limit = Infinity): AzHoliday[] =>
  HOLIDAY_YEARS.flatMap(holidaysFor)
    .filter((h) => h.end >= fromIso)
    .slice(0, limit);

const dmy = (isoDate: string) => isoDate.split('-').reverse().join('.');
/** "20.03.2026", "20.–24.03.2026" (same month) or "31.12.2026 – 01.01.2027" (deterministic, SSR-safe). */
export const holidayRange = (h: Pick<AzHoliday, 'start' | 'end'>) => {
  if (h.start === h.end) return dmy(h.start);
  const [ys, ms, ds] = h.start.split('-');
  const [ye, me, de] = h.end.split('-');
  if (ys === ye && ms === me) return `${ds}.–${de}.${ms}.${ys}`;
  return `${dmy(h.start)} – ${dmy(h.end)}`;
};
