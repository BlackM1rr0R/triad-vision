import type { Granularity, RelativeRange } from './types.js';

/**
 * Calendar maths in Asia/Baku (UTC+4 all year, no daylight saving time since 2016): relative date ranges of
 * the filters ("last month"), date grouping keys and the schedule's local send time.
 */

export const BAKU_OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Baku wall-clock parts of an instant. */
export const bakuParts = (d: Date) => {
  const b = new Date(d.getTime() + BAKU_OFFSET_MS);
  return { y: b.getUTCFullYear(), m: b.getUTCMonth(), d: b.getUTCDate(), wd: ((b.getUTCDay() + 6) % 7) + 1, h: b.getUTCHours(), min: b.getUTCMinutes() };
};

/** The instant of Baku local midnight of y-m-d (month 0-based; overflowing days roll over like Date.UTC). */
export const bakuMidnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - BAKU_OFFSET_MS);

/** Instant of a Baku local time. */
export const bakuTime = (y: number, m: number, d: number, h: number, min: number) => new Date(Date.UTC(y, m, d, h, min) - BAKU_OFFSET_MS);

export const bakuDay = (d: Date) => {
  const p = bakuParts(d);
  return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`;
};

/** "YYYY-MM-DD" (a Baku calendar day) → [start, end) instants. */
export const dayRange = (from: string, to: string) => {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return { start: bakuMidnight(fy, fm - 1, fd), end: bakuMidnight(ty, tm - 1, td + 1) };
};

/** [start, end) of a relative range, in Baku days. */
export const relativeRange = (r: RelativeRange, now = new Date()) => {
  const p = bakuParts(now);
  const today = bakuMidnight(p.y, p.m, p.d);
  const q = Math.floor(p.m / 3) * 3;
  switch (r) {
    case 'today':
      return { start: today, end: new Date(today.getTime() + DAY) };
    case 'yesterday':
      return { start: new Date(today.getTime() - DAY), end: today };
    case 'last7':
      return { start: new Date(today.getTime() - 6 * DAY), end: new Date(today.getTime() + DAY) };
    case 'last30':
      return { start: new Date(today.getTime() - 29 * DAY), end: new Date(today.getTime() + DAY) };
    case 'last90':
      return { start: new Date(today.getTime() - 89 * DAY), end: new Date(today.getTime() + DAY) };
    case 'thisWeek': {
      const start = new Date(today.getTime() - (p.wd - 1) * DAY);
      return { start, end: new Date(start.getTime() + 7 * DAY) };
    }
    case 'lastWeek': {
      const end = new Date(today.getTime() - (p.wd - 1) * DAY);
      return { start: new Date(end.getTime() - 7 * DAY), end };
    }
    case 'thisMonth':
      return { start: bakuMidnight(p.y, p.m, 1), end: bakuMidnight(p.y, p.m + 1, 1) };
    case 'lastMonth':
      return { start: bakuMidnight(p.y, p.m - 1, 1), end: bakuMidnight(p.y, p.m, 1) };
    case 'thisQuarter':
      return { start: bakuMidnight(p.y, q, 1), end: bakuMidnight(p.y, q + 3, 1) };
    case 'lastQuarter':
      return { start: bakuMidnight(p.y, q - 3, 1), end: bakuMidnight(p.y, q, 1) };
    case 'thisYear':
      return { start: bakuMidnight(p.y, 0, 1), end: bakuMidnight(p.y + 1, 0, 1) };
    case 'lastYear':
      return { start: bakuMidnight(p.y - 1, 0, 1), end: bakuMidnight(p.y, 0, 1) };
  }
};

/** ISO week "2026-W07" of a Baku day. */
const isoWeek = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m, d));
  const wd = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - wd + 3); // Thursday of this week decides the year
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(week)}`;
};

/** Group key of a date at a granularity (Baku calendar). */
export const dateKey = (d: Date, g: Granularity) => {
  const p = bakuParts(d);
  switch (g) {
    case 'day':
      return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`;
    case 'week':
      return isoWeek(p.y, p.m, p.d);
    case 'month':
      return `${p.y}-${pad(p.m + 1)}`;
    case 'quarter':
      return `${p.y}-Q${Math.floor(p.m / 3) + 1}`;
    case 'year':
      return String(p.y);
  }
};

export const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
