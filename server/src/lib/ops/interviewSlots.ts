import { zonedDay, zonedToUtc } from '../ics.js';

/**
 * Free interview slots from an employer's availability — pure, no database. Availability is German
 * wall-clock time (Europe/Berlin, with DST); candidates mostly read it in Baku time (Asia/Baku,
 * UTC+4 all year), so the gap between the two is 2 h in summer and 3 h in winter.
 *
 *   WEEKLY  recurring free hours on an ISO weekday (1 = Monday … 7 = Sunday)
 *   DATE    one-off free hours on one German calendar day (added to the weekly hours)
 *   BLOCK   one-off unavailable time (no times = the whole day)
 *
 * Slots run back to back from the start of each free window, `slotMinutes` long with
 * `bufferMinutes` in between, and are dropped when they (plus the buffer on either side) touch a
 * busy interval: the employer's other interviews and calendar events, the candidate's interviews.
 */

export const BERLIN = 'Europe/Berlin';
export const BAKU = 'Asia/Baku';
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

export interface AvailabilityRule {
  kind: 'WEEKLY' | 'DATE' | 'BLOCK';
  weekday?: number | null;
  day?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

export interface Interval {
  start: Date;
  end: Date;
}

export interface SlotOptions {
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  from: Date;
  to: Date;
  now: Date;
}

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
export const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** True when a rule is well-formed (times in order, the right fields for its kind). */
export const validRule = (r: AvailabilityRule) => {
  const timed = r.startTime != null || r.endTime != null;
  if (timed && !(r.startTime && r.endTime && TIME_RE.test(r.startTime) && TIME_RE.test(r.endTime) && minutesOf(r.endTime) > minutesOf(r.startTime))) return false;
  if (r.kind === 'WEEKLY') return Number.isInteger(r.weekday) && r.weekday! >= 1 && r.weekday! <= 7 && timed;
  if (!r.day || !DAY_RE.test(r.day)) return false;
  return r.kind === 'BLOCK' || timed;
};

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** German wall-clock "HH:MM" on a German day → UTC instant ("24:00" = midnight that ends the day). */
const wall = (y: number, m: number, d: number, hhmm: string) => {
  const mins = minutesOf(hhmm);
  if (mins === 24 * 60) {
    const next = new Date(Date.UTC(y, m - 1, d) + DAY);
    return zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, BERLIN);
  }
  return zonedToUtc(y, m, d, Math.floor(mins / 60), mins % 60, BERLIN);
};

/** Sorted union of intervals. */
const merge = (list: Interval[]) => {
  const sorted = [...list].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start.getTime() <= last.end.getTime()) {
      if (i.end.getTime() > last.end.getTime()) last.end = i.end;
    } else out.push({ start: i.start, end: i.end });
  }
  return out;
};

/** `windows` minus `cuts`. */
const subtract = (windows: Interval[], cuts: Interval[]) => {
  let out = windows;
  for (const c of cuts) {
    const next: Interval[] = [];
    for (const w of out) {
      if (c.end <= w.start || c.start >= w.end) {
        next.push(w);
        continue;
      }
      if (c.start > w.start) next.push({ start: w.start, end: c.start });
      if (c.end < w.end) next.push({ start: c.end, end: w.end });
    }
    out = next;
  }
  return out;
};

/** Free windows (availability minus blocks) of every German day touching [from, to). */
export const freeWindows = (rules: AvailabilityRule[], from: Date, to: Date): Interval[] => {
  const valid = rules.filter(validRule);
  const windows: Interval[] = [];
  const blocks: Interval[] = [];
  // One day of slack on each side: a German day starts at 22:00 or 23:00 UTC the evening before.
  const first = zonedDay(new Date(from.getTime() - DAY), BERLIN);
  const last = zonedDay(new Date(to.getTime() + DAY), BERLIN);
  for (let t = Date.UTC(first.y, first.m - 1, first.d); t <= Date.UTC(last.y, last.m - 1, last.d); t += DAY) {
    const date = new Date(t);
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    const key = dayKey(y, m, d);
    const isoWeekday = ((date.getUTCDay() + 6) % 7) + 1;
    for (const r of valid) {
      if (r.kind === 'WEEKLY' ? r.weekday !== isoWeekday : r.day !== key) continue;
      const span = r.startTime && r.endTime ? { start: wall(y, m, d, r.startTime), end: wall(y, m, d, r.endTime) } : { start: wall(y, m, d, '00:00'), end: wall(y, m, d, '24:00') };
      (r.kind === 'BLOCK' ? blocks : windows).push(span);
    }
  }
  return subtract(merge(windows), merge(blocks)).filter((w) => w.end > from && w.start < to);
};

/** Bookable slots in [from, to), earliest first. */
export const generateSlots = (rules: AvailabilityRule[], busy: Interval[], o: SlotOptions): Interval[] => {
  const len = o.slotMinutes * MIN;
  const buffer = Math.max(0, o.bufferMinutes) * MIN;
  const earliest = Math.max(o.from.getTime(), o.now.getTime() + Math.max(0, o.minNoticeMinutes) * MIN);
  const out: Interval[] = [];
  if (len <= 0) return out;
  for (const w of freeWindows(rules, o.from, o.to)) {
    for (let s = w.start.getTime(); s + len <= w.end.getTime(); s += len + buffer) {
      const e = s + len;
      if (s < earliest || e > o.to.getTime()) continue;
      if (busy.some((b) => b.start.getTime() < e + buffer && b.end.getTime() > s - buffer)) continue;
      out.push({ start: new Date(s), end: new Date(e) });
    }
  }
  return out;
};

/** Is `start` exactly one of the bookable slots? (Booking re-checks against fresh busy times.) */
export const isBookable = (start: Date, rules: AvailabilityRule[], busy: Interval[], o: Omit<SlotOptions, 'from' | 'to'> & { to: Date }) =>
  generateSlots(rules, busy, { ...o, from: new Date(start.getTime() - DAY), to: o.to }).some((s) => s.start.getTime() === start.getTime());

const parts = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const BERLIN_FMT = parts(BERLIN);
const BAKU_FMT = parts(BAKU);
const split = (fmt: Intl.DateTimeFormat, d: Date) => {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
};

/** One slot as both sides read it: German day/time for the employer, Baku day/time for the candidate. */
export const slotView = (s: Interval) => {
  const de = split(BERLIN_FMT, s.start);
  const az = split(BAKU_FMT, s.start);
  return {
    startsAt: s.start.toISOString(),
    endsAt: s.end.toISOString(),
    berlin: { day: de.day, time: de.time, until: split(BERLIN_FMT, s.end).time },
    baku: { day: az.day, time: az.time, until: split(BAKU_FMT, s.end).time },
  };
};
