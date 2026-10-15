import i18n from '@/i18n';
import { errorCode } from '@/lib/api';
import type { BusyDto, CalItem, EventColor, EventDto, Person, Source, SystemDto, Tone } from './types';

const t = (key: string, opts?: Record<string, unknown>): string => String(i18n.t(key, opts));
const list = (key: string) => i18n.t(key, { returnObjects: true }) as unknown as string[];

export const DAY = 86_400_000;
export const MIN = 60_000;

export const fullName = (p: Pick<Person, 'firstName' | 'lastName'> | null | undefined) => (p ? `${p.firstName} ${p.lastName}`.trim() : '');

const LOCALE_TAG: Record<string, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };
export const localeTag = () => LOCALE_TAG[i18n.language?.slice(0, 2) ?? 'az'] ?? 'az-Latn-AZ';

export const monthNames = () => list('calendar.months');
export const weekdayNames = () => list('calendar.weekdays');
export const weekdayShort = () => list('calendar.weekdaysShort');
export const weekdayMin = () => list('calendar.weekdaysMin');

// ─── Dates (local time) ────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDayKey = (s: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), 28));
/** Monday of the week containing d. */
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
export const isSameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);
export const isToday = (d: Date) => isSameDay(d, new Date());
/** ISO week number. */
export const weekNumber = (d: Date) => {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - start.getTime()) / DAY + 1) / 7);
};
/** 6×7 grid (Monday first) covering the month. */
export const monthGrid = (month: Date) => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
};
export const toDateInput = (d: Date) => dayKey(d);
export const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fromInputs = (date: string, time: string) => {
  const d = parseDayKey(date) ?? new Date();
  const [h, m] = (time || '00:00').split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 0, m || 0);
};
export const roundTo = (d: Date, minutes: number) => new Date(Math.round(d.getTime() / (minutes * MIN)) * minutes * MIN);

// ─── Formatting ────────────────────────────────────────────────────────

export const fmtTime = (d: Date) => new Intl.DateTimeFormat(localeTag(), { hour: '2-digit', minute: '2-digit' }).format(d);
export const fmtDate = (d: Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) => new Intl.DateTimeFormat(localeTag(), opts).format(d);
export const fmtDayLong = (d: Date) => new Intl.DateTimeFormat(localeTag(), { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
export const fmtMonthTitle = (d: Date) => `${monthNames()[d.getMonth()]} ${d.getFullYear()}`;
export const fmtRange = (start: Date, end: Date, allDay: boolean) => {
  if (allDay) {
    const last = addDays(end, -1);
    return isSameDay(start, last) || last < start ? fmtDayLong(start) : `${fmtDate(start, { day: 'numeric', month: 'short' })} – ${fmtDate(last, { day: 'numeric', month: 'short' })}`;
  }
  if (isSameDay(start, end)) return `${fmtDayLong(start)}, ${fmtTime(start)}–${fmtTime(end)}`;
  return `${fmtDayLong(start)} ${fmtTime(start)} – ${fmtDayLong(end)} ${fmtTime(end)}`;
};
export const fmtDateTimeShort = (d: Date) => new Intl.DateTimeFormat(localeTag(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);

export const errorText = (err: unknown) => {
  const code = errorCode(err);
  const key = `calendar.errors.${code}`;
  return i18n.exists(key) ? t(key) : t('calendar.errors.generic');
};

// ─── Colours ───────────────────────────────────────────────────────────

export const TONES: Record<EventColor, Tone> = {
  blue: { bg: 'bg-brand-100', text: 'text-brand-700', border: 'border-brand-500', dot: 'bg-brand-500' },
  green: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-500', dot: 'bg-emerald-500' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-900', border: 'border-amber-500', dot: 'bg-amber-500' },
  red: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-500', dot: 'bg-red-500' },
  violet: { bg: 'bg-violet-100', text: 'text-violet-800', border: 'border-violet-500', dot: 'bg-violet-500' },
  pink: { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-500', dot: 'bg-pink-500' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-500', dot: 'bg-teal-500' },
  slate: { bg: 'bg-slate-200', text: 'text-slate-700', border: 'border-slate-400', dot: 'bg-slate-400' },
};
export const BUSY_TONE: Tone = { bg: 'bg-slate-100 bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgba(100,116,139,0.18)_4px,rgba(100,116,139,0.18)_8px)]', text: 'text-slate-500', border: 'border-slate-300', dot: 'bg-slate-400' };
export const SOURCE_COLOR: Record<Exclude<Source, 'event'>, EventColor> = { case: 'red', booking: 'teal', interview: 'violet', task: 'amber' };
export const CALENDAR_DOT: Record<string, string> = { mine: TONES.blue.dot, team: TONES.green.dot, case: TONES.red.dot, booking: TONES.teal.dot, interview: TONES.violet.dot, task: TONES.amber.dot };

/** Colleagues get a stable colour of their own. */
const USER_COLORS: EventColor[] = ['violet', 'pink', 'teal', 'amber', 'green', 'slate'];
export const userColor = (id: string): EventColor => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return USER_COLORS[h % USER_COLORS.length];
};

// ─── Normalising API rows into renderable items ────────────────────────

export const toItems = (events: (EventDto | BusyDto)[], system: SystemDto[], meId: string): CalItem[] => {
  const out: CalItem[] = [];
  for (const e of events) {
    const start = new Date(e.startsAt);
    const end = new Date(e.endsAt);
    const key = `event:${e.id}:${e.occurrence ?? ''}`;
    if (e.busy) {
      out.push({ key, id: e.id, source: 'event', title: t('calendar.labels.busy'), start, end, allDay: e.allDay, busy: true, ownerId: e.ownerId, calendar: 'user', tone: BUSY_TONE, raw: e });
      continue;
    }
    const mine = e.ownerId === meId || e.isAttendee;
    const calendar = mine ? 'mine' : e.visibility === 'TEAM' ? 'team' : 'user';
    const color = mine ? (e.color ?? 'blue') : calendar === 'team' ? (e.color ?? 'green') : userColor(e.ownerId);
    out.push({ key, id: e.id, source: 'event', title: e.title, start, end, allDay: e.allDay, busy: false, ownerId: e.ownerId, calendar, tone: TONES[color], raw: e });
  }
  for (const s of system) {
    out.push({ key: `${s.source}:${s.id}:${s.ownerId}`, id: s.id, source: s.source, title: s.title, start: new Date(s.startsAt), end: new Date(s.endsAt), allDay: false, busy: false, ownerId: s.ownerId, calendar: s.source, tone: TONES[SOURCE_COLOR[s.source]], raw: s });
  }
  out.sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  return out;
};

/** Items touching the given local day. */
export const itemsOnDay = (items: CalItem[], day: Date) => {
  const s = startOfDay(day).getTime();
  const e = s + DAY;
  return items.filter((i) => i.start.getTime() < e && i.end.getTime() > s);
};

// ─── Recurrence helpers (client side, mirrors the server subset) ───────

export const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export interface RecurrenceForm {
  freq: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byDay: WeekdayCode[];
  ends: 'never' | 'after' | 'until';
  count: number;
  until: string;
}

export const EMPTY_RECURRENCE: RecurrenceForm = { freq: 'NONE', interval: 1, byDay: [], ends: 'never', count: 10, until: '' };

export const parseRecurrence = (rrule: string | null | undefined): RecurrenceForm => {
  if (!rrule) return EMPTY_RECURRENCE;
  const parts = Object.fromEntries(rrule.split(';').map((p) => p.split('=') as [string, string]));
  const until = parts.UNTIL ? `${parts.UNTIL.slice(0, 4)}-${parts.UNTIL.slice(4, 6)}-${parts.UNTIL.slice(6, 8)}` : '';
  return {
    freq: (parts.FREQ as RecurrenceForm['freq']) ?? 'NONE',
    interval: Number(parts.INTERVAL) || 1,
    byDay: parts.BYDAY ? (parts.BYDAY.split(',') as WeekdayCode[]) : [],
    ends: parts.COUNT ? 'after' : parts.UNTIL ? 'until' : 'never',
    count: Number(parts.COUNT) || 10,
    until,
  };
};

export const buildRRule = (r: RecurrenceForm): string | null => {
  if (r.freq === 'NONE') return null;
  const parts = [`FREQ=${r.freq}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.freq === 'WEEKLY' && r.byDay.length) parts.push(`BYDAY=${r.byDay.join(',')}`);
  if (r.ends === 'after' && r.count > 0) parts.push(`COUNT=${r.count}`);
  if (r.ends === 'until' && r.until) parts.push(`UNTIL=${r.until.replace(/-/g, '')}T235959Z`);
  return parts.join(';');
};

export const recurrenceLabel = (r: RecurrenceForm) => {
  if (r.freq === 'NONE') return t('calendar.recurrence.none');
  const unit = { DAILY: 'unitDay', WEEKLY: 'unitWeek', MONTHLY: 'unitMonth', YEARLY: 'unitYear' }[r.freq];
  let s = r.interval > 1 ? `${t('calendar.recurrence.every')} ${r.interval} ${t(`calendar.recurrence.${unit}`)}` : t(`calendar.recurrence.${r.freq.toLowerCase()}`);
  if (r.freq === 'WEEKLY' && r.byDay.length) s += ` · ${r.byDay.map((d) => weekdayShort()[WEEKDAY_CODES.indexOf(d)]).join(', ')}`;
  if (r.ends === 'after') s += ` · ${r.count}×`;
  if (r.ends === 'until' && r.until) s += ` · ${t('calendar.recurrence.until').toLowerCase()} ${r.until}`;
  return s;
};

export const REMINDER_OPTIONS: { value: number | null; key: string }[] = [
  { value: null, key: 'none' },
  { value: 0, key: 'atTime' },
  { value: 5, key: 'm5' },
  { value: 10, key: 'm10' },
  { value: 15, key: 'm15' },
  { value: 30, key: 'm30' },
  { value: 60, key: 'h1' },
  { value: 120, key: 'h2' },
  { value: 1440, key: 'd1' },
];

export const systemLink = (s: SystemDto) => s.link ?? null;
export const systemLinkLabel = (s: SystemDto) => t(`calendar.actions.${{ case: 'openCase', booking: 'openBooking', interview: 'openInterview', task: 'openTask' }[s.source]}`);
