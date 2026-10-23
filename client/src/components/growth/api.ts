import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { L10n } from '@/lib/types';

export type Range = [number, number];
export type InputLevel = 'A0' | 'A1' | 'A2' | 'B1' | 'B2';
export type DocState = 'none' | 'some' | 'all';
export type StageKey = 'language' | 'documents' | 'recognition' | 'matching' | 'embassy' | 'processing' | 'travel';

export interface CalcCategory {
  id: string;
  slug: string;
  title: L10n;
  icon: string;
  visaLabel: string;
  germanLevel: string | null;
  targetLevel: string | null;
  recognitionDefault: boolean;
  processingMin: number | null;
  processingMax: number | null;
}

export interface CalcConfig {
  enabled: boolean;
  levels: InputLevel[];
  documents: DocState[];
  categories: CalcCategory[];
  verifiedAt: string | null;
}

export interface Stage {
  key: StageKey;
  weeks: Range;
  start: Range;
  end: Range;
  parallel: boolean;
  skipped: boolean;
}

export interface Estimate {
  category: { id: string; slug: string };
  targetLevel: string | null;
  recognition: boolean;
  stages: Stage[];
  totalWeeks: Range;
  earliest: string;
  latest: string;
}

export const useCalcConfig = () =>
  useQuery({ queryKey: ['growth', 'calculator'], queryFn: async () => (await api.get<CalcConfig>('/growth/calculator')).data, staleTime: 5 * 60 * 1000 });

export interface MapCity {
  city: string;
  workers: number;
  professions: string[];
  lat: number | null;
  lng: number | null;
}
export interface PublicMap {
  enabled: boolean;
  showOnHome: boolean;
  showOnStories: boolean;
  minPerCity: number;
  total: number;
  cities: MapCity[];
}

export const usePlacementMap = () =>
  useQuery({ queryKey: ['growth', 'map'], queryFn: async () => (await api.get<PublicMap>('/growth/map')).data, staleTime: 10 * 60 * 1000 });

export interface PublicEvent {
  id: string;
  slug: string;
  title: L10n;
  description: L10n;
  mode: 'ONLINE' | 'OFFLINE';
  address: string | null;
  startsAt: string;
  endsAt: string;
  language: 'az' | 'de' | 'en' | 'ru';
  status: 'PUBLISHED' | 'CANCELLED';
  capacity: number | null;
  seatsLeft: number | null;
  registrationOpen: boolean;
}

export const usePublicEvents = () =>
  useQuery({ queryKey: ['growth', 'events'], queryFn: async () => (await api.get<{ events: PublicEvent[] }>('/growth/events')).data.events, staleTime: 60 * 1000 });

/** "Mart 2027" style month label in the UI language (Baku time zone). */
export const monthLabel = (iso: string, locale: string) =>
  new Intl.DateTimeFormat({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[locale] ?? 'az-Latn-AZ', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Baku',
  }).format(new Date(iso));

/** "Mart–Aprel 2027" (same year) or "Dekabr 2026 – Mart 2027". */
export const monthRange = (fromIso: string, toIso: string, locale: string) => {
  const intl = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[locale] ?? 'az-Latn-AZ';
  const a = new Date(fromIso);
  const b = new Date(toIso);
  const month = (d: Date) => new Intl.DateTimeFormat(intl, { month: 'long', timeZone: 'Asia/Baku' }).format(d);
  const cap = (s: string) => s.charAt(0).toLocaleUpperCase(intl) + s.slice(1);
  const ya = a.getUTCFullYear();
  const yb = b.getUTCFullYear();
  if (ya === yb && a.getUTCMonth() === b.getUTCMonth()) return cap(monthLabel(fromIso, locale));
  if (ya === yb) return `${cap(month(a))}–${cap(month(b))} ${yb}`;
  return `${cap(monthLabel(fromIso, locale))} – ${cap(monthLabel(toIso, locale))}`;
};

/** Event time in Baku: "Bazar ertəsi, 20 oktyabr 2026, 18:00". */
export const bakuTime = (iso: string, locale: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'full', timeStyle: 'short' }) =>
  new Intl.DateTimeFormat({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[locale] ?? 'az-Latn-AZ', { ...opts, timeZone: 'Asia/Baku' }).format(new Date(iso));
