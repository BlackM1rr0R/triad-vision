import { useTranslation } from 'react-i18next';

/** The visitor's IANA time zone (falls back to Baku). */
export const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Baku';
  } catch {
    return 'Asia/Baku';
  }
};

const partsCache = new Map<string, Intl.DateTimeFormat>();
const partsFmt = (tz: string) => {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
    partsCache.set(tz, f);
  }
  return f;
};

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Calendar parts of an instant as seen in `tz`. */
export const zoned = (d: Date | string, tz: string) => {
  const parts = partsFmt(tz).formatToParts(new Date(d));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const y = Number(get('year'));
  const m = Number(get('month'));
  const day = Number(get('day'));
  const hh = get('hour').padStart(2, '0').replace('24', '00');
  const mm = get('minute').padStart(2, '0');
  return { y, m, d: day, weekday: WD[get('weekday')] ?? 0, time: `${hh}:${mm}`, key: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
};

/** "14:30" in `tz`. */
export const fmtTime = (d: Date | string, tz: string) => zoned(d, tz).time;

/** 'YYYY-MM-DD' of today in `tz`, shifted by `offsetDays`. */
export const dayKeyOffset = (tz: string, offsetDays: number) => zoned(new Date(Date.now() + offsetDays * 86400000), tz).key;

/** Day labels in the UI language (Azerbaijani names are our own: browsers ship incomplete data). */
export const useDayLabels = () => {
  const { t } = useTranslation();
  const weekdays = t('bookingCommon.weekdays', { returnObjects: true }) as string[];
  const weekdaysShort = t('bookingCommon.weekdaysShort', { returnObjects: true }) as string[];
  const months = t('bookingCommon.months', { returnObjects: true }) as string[];
  const monthsShort = t('bookingCommon.monthsShort', { returnObjects: true }) as string[];
  return {
    /** "Monday, 20 October" */
    long: (d: Date | string, tz: string) => {
      const z = zoned(d, tz);
      return `${weekdays[z.weekday]}, ${z.d} ${months[z.m - 1]}`;
    },
    /** "Mon" / "20" / "Oct" parts for compact chips */
    chip: (d: Date | string, tz: string) => {
      const z = zoned(d, tz);
      return { weekday: weekdaysShort[z.weekday], day: z.d, month: monthsShort[z.m - 1], key: z.key };
    },
    /** "20 Oct 2026" */
    date: (d: Date | string, tz: string) => {
      const z = zoned(d, tz);
      return `${z.d} ${monthsShort[z.m - 1]} ${z.y}`;
    },
    relative: (key: string, tz: string) => (key === dayKeyOffset(tz, 0) ? t('bookingCommon.today') : key === dayKeyOffset(tz, 1) ? t('bookingCommon.tomorrow') : null),
  };
};

export const TOPICS = ['candidate', 'company', 'other'] as const;
export type Topic = (typeof TOPICS)[number];
export type BookingStatus = 'BOOKED' | 'CANCELLED' | 'DONE' | 'NO_SHOW';

export const BOOKING_STATUS_TONE: Record<BookingStatus, string> = {
  BOOKED: 'bg-brand-100 text-brand-700',
  DONE: 'bg-emerald-100 text-emerald-800',
  NO_SHOW: 'bg-amber-100 text-amber-800',
  CANCELLED: 'bg-slate-200 text-slate-700',
};
