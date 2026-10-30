import type { L10n } from '@/lib/types';

/**
 * Interview calendar (server: routes/interviewCalendar.ts). Employers keep free hours in German
 * time; candidates pick a slot, read in Baku time first. Copy: i18n/pagesInterviewCalendar.ts.
 */

export interface AvailabilityRule {
  id?: string;
  weekday?: number | null;
  day?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  note?: string | null;
}

export interface SchedulingSettings {
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  horizonDays: number;
  cancelCutoffHours: number;
  maxReschedules: number;
}

export interface Availability {
  companyId: string;
  timezone: string;
  settings: SchedulingSettings;
  weekly: AvailabilityRule[];
  dates: AvailabilityRule[];
  blocks: AvailabilityRule[];
}

export interface Slot {
  startsAt: string;
  endsAt: string;
  berlin: { day: string; time: string; until: string };
  baku: { day: string; time: string; until: string };
}

export interface InterviewInvite {
  id: string;
  status: 'OPEN' | 'BOOKED' | 'CANCELLED';
  minutes: number;
  notes: string | null;
  createdAt: string;
  company: { id: string; name: string };
  application: { id: string; status: string; vacancy: { id: string; title: L10n; slug: string } } | null;
  candidate: { id: string; name: string; profession: string | null };
  interview: { id: string; status: string; startsAt: string; endsAt: string; meetingUrl: string | null } | null;
  reschedules: number;
  canMove: boolean;
  canCancel: boolean;
  moveUntil: string | null;
  reschedulesLeft: number;
}

export const SETTING_KEYS: (keyof SchedulingSettings)[] = ['slotMinutes', 'bufferMinutes', 'minNoticeHours', 'horizonDays', 'cancelCutoffHours', 'maxReschedules'];

const INTL: Record<string, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };
export const intlLocale = (lang: string) => INTL[lang.slice(0, 2)] ?? 'en-GB';

/** "Monday, 2 November" for a calendar day "YYYY-MM-DD" (no time-zone shift: noon UTC). */
export const fmtDay = (day: string, lang: string) =>
  new Intl.DateTimeFormat(intlLocale(lang), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));

/** An instant as date + time in Baku. */
export const fmtBaku = (iso: string, lang: string) =>
  new Intl.DateTimeFormat(intlLocale(lang), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Baku' }).format(new Date(iso));

/** Slots grouped by the Baku calendar day (that is where the candidate reads them). */
export const groupByBakuDay = (slots: Slot[]) => {
  const out = new Map<string, Slot[]>();
  for (const s of slots) out.set(s.baku.day, [...(out.get(s.baku.day) ?? []), s]);
  return [...out.entries()];
};
