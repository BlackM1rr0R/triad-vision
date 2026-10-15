/**
 * A small RFC 5545 RRULE subset for the team calendar: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY with
 * INTERVAL, BYDAY (weekly only), COUNT and UNTIL. Occurrences are computed in UTC; the office
 * time zone (Asia/Baku) has no daylight-saving changes, so a weekly 09:00 meeting stays at 09:00.
 */

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface RRule {
  freq: Freq;
  interval: number;
  byDay?: Weekday[];
  count?: number;
  until?: Date;
}

const DAY = 24 * 60 * 60 * 1000;
/** Safety net against pathological rules (every day for 30 years). */
export const MAX_OCCURRENCES = 2000;

const parseUntil = (v: string): Date | null => {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(v);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 23, m[5] ? +m[5] : 59, m[6] ? +m[6] : 59));
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Parses "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10" (an optional "RRULE:" prefix is accepted). Returns null when unsupported. */
export const parseRRule = (input: string | null | undefined): RRule | null => {
  if (!input) return null;
  const text = input.trim().replace(/^RRULE:/i, '');
  if (!text) return null;
  const parts: Record<string, string> = {};
  for (const seg of text.split(';')) {
    const [k, v] = seg.split('=');
    if (!k || v === undefined) return null;
    parts[k.trim().toUpperCase()] = v.trim().toUpperCase();
  }
  const freq = parts.FREQ as Freq | undefined;
  if (!freq || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;
  const interval = parts.INTERVAL ? Number(parts.INTERVAL) : 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 999) return null;
  const rule: RRule = { freq, interval };
  if (parts.BYDAY) {
    if (freq !== 'WEEKLY') return null;
    const days = parts.BYDAY.split(',').map((d) => d.trim()) as Weekday[];
    if (!days.length || days.some((d) => !WEEKDAYS.includes(d))) return null;
    rule.byDay = [...new Set(days)].sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
  }
  if (parts.COUNT) {
    const n = Number(parts.COUNT);
    if (!Number.isInteger(n) || n < 1 || n > MAX_OCCURRENCES) return null;
    rule.count = n;
  }
  if (parts.UNTIL) {
    const u = parseUntil(parts.UNTIL);
    if (!u) return null;
    rule.until = u;
  }
  for (const k of Object.keys(parts)) if (!['FREQ', 'INTERVAL', 'BYDAY', 'COUNT', 'UNTIL', 'WKST'].includes(k)) return null;
  return rule;
};

export const formatRRule = (r: RRule) =>
  [`FREQ=${r.freq}`, r.interval > 1 ? `INTERVAL=${r.interval}` : null, r.byDay?.length ? `BYDAY=${r.byDay.join(',')}` : null, r.count ? `COUNT=${r.count}` : null, r.until ? `UNTIL=${r.until.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}` : null]
    .filter(Boolean)
    .join(';');

/** Same wall-clock time on another day (UTC fields). */
const onDay = (template: Date, y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, template.getUTCHours(), template.getUTCMinutes(), template.getUTCSeconds()));

/** Adds months keeping the day of month; a 31st in a shorter month is skipped (returns null). */
const addMonths = (start: Date, months: number) => {
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth() + months;
  const d = onDay(start, y, m, start.getUTCDate());
  return d.getUTCDate() === start.getUTCDate() ? d : null;
};

/**
 * Every occurrence start of `rule` anchored at `start` (DTSTART is always the first occurrence),
 * in ascending order, that falls inside [from, to) — or, without a window, all of them up to COUNT /
 * UNTIL / MAX_OCCURRENCES. Both bounds are checked against the start instant.
 */
export const expandRRule = (start: Date, rule: RRule, window?: { from: Date; to: Date }): Date[] => {
  const out: Date[] = [];
  let produced = 0;
  const push = (d: Date) => {
    if (rule.until && d.getTime() > rule.until.getTime()) return false;
    if (rule.count && produced >= rule.count) return false;
    produced++;
    if (window) {
      if (d.getTime() >= window.to.getTime()) return false;
      if (d.getTime() >= window.from.getTime()) out.push(d);
    } else out.push(d);
    return produced < MAX_OCCURRENCES;
  };

  if (rule.freq === 'WEEKLY' && rule.byDay?.length) {
    // DTSTART first, then the listed weekdays of each interval-th week (week starts on Monday).
    if (!push(start)) return out;
    const startDow = start.getUTCDay();
    const mondayOffset = (startDow + 6) % 7; // days since Monday
    const weekStart = new Date(start.getTime() - mondayOffset * DAY);
    const days = rule.byDay.map((d) => (WEEKDAYS.indexOf(d) + 6) % 7).sort((a, b) => a - b);
    for (let week = 0; ; week += rule.interval) {
      const base = weekStart.getTime() + week * 7 * DAY;
      let stop = false;
      for (const offset of days) {
        const d = new Date(base + offset * DAY);
        if (d.getTime() <= start.getTime()) continue;
        if (!push(d)) {
          stop = true;
          break;
        }
      }
      if (stop) break;
      if (window && base > window.to.getTime() + 7 * DAY) break;
      if (week > 52 * 100 * 7) break;
    }
    return out;
  }

  for (let i = 0; ; i++) {
    let d: Date | null;
    switch (rule.freq) {
      case 'DAILY':
        d = new Date(start.getTime() + i * rule.interval * DAY);
        break;
      case 'WEEKLY':
        d = new Date(start.getTime() + i * rule.interval * 7 * DAY);
        break;
      case 'MONTHLY':
        d = addMonths(start, i * rule.interval);
        break;
      case 'YEARLY':
        d = addMonths(start, i * rule.interval * 12);
        break;
    }
    if (d === null) {
      // Skipped month (no 31st): does not count towards COUNT, keep going unless hopeless.
      if (i > 12 * MAX_OCCURRENCES) break;
      continue;
    }
    if (!push(d)) break;
    if (i > 12 * MAX_OCCURRENCES) break;
  }
  return out;
};

/** Occurrences as [start, end) pairs within the window, overlapping counts: a long event that started before `from` is included. */
export const expandOccurrences = (startsAt: Date, endsAt: Date, rrule: string | null | undefined, from: Date, to: Date): { start: Date; end: Date }[] => {
  const duration = Math.max(0, endsAt.getTime() - startsAt.getTime());
  const rule = parseRRule(rrule);
  if (!rule) {
    return startsAt.getTime() < to.getTime() && endsAt.getTime() > from.getTime() ? [{ start: startsAt, end: endsAt }] : [];
  }
  // Starts a little before `from` may still overlap the window thanks to the duration.
  const starts = expandRRule(startsAt, rule, { from: new Date(from.getTime() - duration), to });
  return starts.map((s) => ({ start: s, end: new Date(s.getTime() + duration) })).filter((o) => o.end.getTime() > from.getTime());
};
