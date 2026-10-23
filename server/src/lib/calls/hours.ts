import { prisma } from '../../db.js';
import { getCallsSettings, type OfficeHoursSetting } from './settings.js';

/**
 * Office hours (Asia/Baku, UTC+4 all year, no DST) for callback windows and the live chat.
 * Source: Setting 'calls'.officeHours when set, otherwise parsed from the site contact hours
 * (Setting 'contact'.hours, e.g. "Mon – Fri, 09:00 – 18:00"), otherwise Mon–Fri 09:00–18:00.
 */

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const BAKU_OFFSET = 4 * HOUR;

export interface OfficeHours {
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  /** minutes after midnight */
  from: number;
  to: number;
  source: 'settings' | 'contact' | 'default';
}

export const DEFAULT_HOURS: OfficeHours = { days: [1, 2, 3, 4, 5], from: 9 * 60, to: 18 * 60, source: 'default' };

const toMin = (h: string, m: string) => Number(h) * 60 + Number(m);

const DAY_WORDS: [RegExp, number][] = [
  [/^(sun|so|вс)/i, 0],
  [/^(mon|mo|пн|b\.?\s?e)/i, 1],
  [/^(tue|di|вт)/i, 2],
  [/^(wed|mi|ср)/i, 3],
  [/^(thu|do|чт)/i, 4],
  [/^(fri|fr|пт|cüm)/i, 5],
  [/^(sat|sa|сб|şən)/i, 6],
];

const dayOf = (word: string): number | null => {
  for (const [re, d] of DAY_WORDS) if (re.test(word.trim())) return d;
  return null;
};

/** "Mon – Fri, 09:00 – 18:00" → hours; null when no time range is found. */
export const parseHoursText = (text: string): OfficeHours | null => {
  const t = /(\d{1,2})[:.](\d{2})\s*[–—-]\s*(\d{1,2})[:.](\d{2})/.exec(text);
  if (!t) return null;
  const from = toMin(t[1], t[2]);
  const to = toMin(t[3], t[4]);
  if (!(from < to && to <= 24 * 60)) return null;
  let days = DEFAULT_HOURS.days;
  const before = text.slice(0, t.index);
  const range = /([^\s,–—-][^,–—-]*?)\s*[–—-]\s*([^\s,–—-][^,–—-]*)/.exec(before);
  if (range) {
    const a = dayOf(range[1]);
    const b = dayOf(range[2]);
    if (a !== null && b !== null) {
      days = [];
      for (let d = a; ; d = (d + 1) % 7) {
        days.push(d);
        if (d === b || days.length > 7) break;
      }
    }
  }
  return { days, from, to, source: 'contact' };
};

const fromSetting = (o: OfficeHoursSetting): OfficeHours => ({ days: o.days, from: toMin(...(o.from.split(':') as [string, string])), to: toMin(...(o.to.split(':') as [string, string])), source: 'settings' });

export const getOfficeHours = async (): Promise<OfficeHours> => {
  const s = await getCallsSettings();
  if (s.officeHours) return fromSetting(s.officeHours); // no days = always closed
  const row = await prisma.setting.findUnique({ where: { key: 'contact' } });
  const hours = (row?.value as { hours?: unknown } | null)?.hours;
  const texts = typeof hours === 'string' ? [hours] : hours && typeof hours === 'object' ? ['en', 'de', 'az', 'ru'].map((l) => (hours as Record<string, unknown>)[l]).filter((v): v is string => typeof v === 'string') : [];
  for (const text of texts) {
    const parsed = parseHoursText(text);
    if (parsed) return parsed;
  }
  return DEFAULT_HOURS;
};

/** Baku-local day start (as UTC instant) and weekday / minute of `now`. */
export const bakuClock = (now: Date) => {
  const local = now.getTime() + BAKU_OFFSET;
  const dayStartLocal = Math.floor(local / DAY) * DAY;
  return {
    dayStart: new Date(dayStartLocal - BAKU_OFFSET),
    weekday: new Date(dayStartLocal).getUTCDay(),
    minute: Math.floor((local - dayStartLocal) / MIN),
    date: new Date(dayStartLocal).toISOString().slice(0, 10),
  };
};

export const isOpen = (h: OfficeHours, now = new Date()) => {
  const c = bakuClock(now);
  return h.days.includes(c.weekday) && c.minute >= h.from && c.minute < h.to;
};

/** Next moment the office opens (now when open). */
export const nextOpening = (h: OfficeHours, now = new Date()) => {
  if (isOpen(h, now)) return now;
  if (!h.days.length) return null;
  const c = bakuClock(now);
  for (let i = 0; i < 8; i++) {
    const dayStart = new Date(c.dayStart.getTime() + i * DAY);
    const wd = (c.weekday + i) % 7;
    if (!h.days.includes(wd)) continue;
    const at = new Date(dayStart.getTime() + h.from * MIN);
    if (at > now) return at;
  }
  return null;
};

export interface Window {
  start: string;
  end: string;
}

/** Minimum lead time before a booked window starts. */
export const WINDOW_LEAD_MS = 20 * MIN;

/** 1-hour windows inside office hours for today and tomorrow (Baku); today's start at least 20 min ahead. */
export const callbackWindows = (h: OfficeHours, now = new Date()) => {
  const c = bakuClock(now);
  return (['today', 'tomorrow'] as const).map((label, i) => {
    const dayStart = new Date(c.dayStart.getTime() + i * DAY);
    const wd = (c.weekday + i) % 7;
    const windows: Window[] = [];
    if (h.days.includes(wd)) {
      for (let m = h.from; m + 60 <= h.to; m += 60) {
        const start = new Date(dayStart.getTime() + m * MIN);
        if (start.getTime() < now.getTime() + WINDOW_LEAD_MS) continue;
        windows.push({ start: start.toISOString(), end: new Date(start.getTime() + HOUR).toISOString() });
      }
    }
    return { label, date: new Date(dayStart.getTime() + BAKU_OFFSET).toISOString().slice(0, 10), windows };
  });
};

export const hhmmBaku = (d: Date) => new Date(d.getTime() + BAKU_OFFSET).toISOString().slice(11, 16);
