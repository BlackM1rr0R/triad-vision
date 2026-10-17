/**
 * Reporting periods for the financial reports.
 *
 * Time zone: all boundaries are **UTC** calendar days / months (the same convention as the admin
 * analytics). A range `from`…`to` covers [from 00:00 UTC, to+1 day 00:00 UTC). A payment booked at
 * 2026-03-31 23:30 UTC therefore belongs to March, one at 2026-04-01 00:10 UTC to April.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;
/** Longest accepted range (about five years) so a report never scans unbounded history. */
export const MAX_RANGE_DAYS = 1830;

export interface Period {
  /** First day, inclusive (YYYY-MM-DD). */
  from: string;
  /** Last day, inclusive (YYYY-MM-DD). */
  to: string;
  /** Start instant (UTC midnight of `from`). */
  start: Date;
  /** End instant, exclusive (UTC midnight of the day after `to`). */
  end: Date;
}

export class PeriodError extends Error {
  constructor(public code: 'INVALID_DATE' | 'INVALID_RANGE' | 'RANGE_TOO_LONG') {
    super(code);
  }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const parseDay = (s: string) => {
  if (!ISO_DAY.test(s)) throw new PeriodError('INVALID_DATE');
  const d = new Date(`${s}T00:00:00Z`);
  // Rejects 2026-02-30 and similar: the round trip must give the same day back.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new PeriodError('INVALID_DATE');
  return d;
};

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Builds a period; missing bounds default to the current UTC calendar year. */
export const resolvePeriod = (q: { from?: string; to?: string }, now = new Date()): Period => {
  const year = now.getUTCFullYear();
  const from = q.from ?? `${year}-01-01`;
  const to = q.to ?? `${year}-12-31`;
  const start = parseDay(from);
  const last = parseDay(to);
  if (start > last) throw new PeriodError('INVALID_RANGE');
  if ((last.getTime() - start.getTime()) / DAY_MS + 1 > MAX_RANGE_DAYS) throw new PeriodError('RANGE_TOO_LONG');
  return { from, to, start, end: new Date(last.getTime() + DAY_MS) };
};

/** 'YYYY-MM' of an instant (UTC). */
export const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/** Every month touched by the period, with its own [start, end) clipped to the period. */
export const monthsOf = (p: Period) => {
  const out: { key: string; start: Date; end: Date }[] = [];
  let cur = new Date(Date.UTC(p.start.getUTCFullYear(), p.start.getUTCMonth(), 1));
  while (cur < p.end) {
    const next = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    out.push({ key: monthKey(cur), start: cur < p.start ? p.start : cur, end: next > p.end ? p.end : next });
    cur = next;
  }
  return out;
};

export const inRange = (d: Date | null | undefined, start: Date, end: Date) => !!d && d >= start && d < end;
