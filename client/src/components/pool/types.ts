import i18n from '@/i18n';
import { errorCode } from '@/lib/api';
import { TONE_CLASS } from '@/components/ui/status';

// Mirrors server/src/lib/pool/constants.ts and the card of server/src/lib/pool/anonymous.ts.
export const POOL_REGIONS = ['ANY', 'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'] as const;
export const POOL_AVAILABILITY = ['IMMEDIATE', 'ONE_MONTH', 'THREE_MONTHS', 'LATER'] as const;
export const POOL_TRACKS = ['JOB', 'AUSBILDUNG', 'BOTH'] as const;
export const POOL_LANGUAGES = ['az', 'en', 'ru', 'tr', 'ka', 'uk', 'fa', 'ar', 'fr', 'es', 'it', 'pl'] as const;
export const POOL_LANGUAGE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native'] as const;
export const POOL_GERMAN_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const POOL_RECOGNITION = ['NONE', 'NOT_REQUIRED', 'IN_PROGRESS', 'PARTIAL', 'RECOGNISED'] as const;
export const POOL_INTEREST_STATUSES = ['NEW', 'CONTACTED', 'INTERVIEW', 'CLOSED'] as const;
export type PoolInterestStatus = (typeof POOL_INTEREST_STATUSES)[number];

export interface PoolLanguage {
  lang: (typeof POOL_LANGUAGES)[number];
  level: (typeof POOL_LANGUAGE_LEVELS)[number];
}

export interface PoolCard {
  code: string;
  professions: string[];
  experienceYears: number | null;
  germanLevel: string | null;
  languages: PoolLanguage[];
  drivingLicences: string[];
  education: string | null;
  recognitionStatus: string;
  regions: string[];
  earliestStart: string | null;
  availability: string | null;
  skills: string[];
  track: string;
  summary: string | null;
  saved?: boolean;
}

/** Badge classes per interest status (tones from components/ui/status). */
export const INTEREST_TONE: Record<PoolInterestStatus, string> = {
  NEW: TONE_CLASS.info,
  CONTACTED: TONE_CLASS.warning,
  INTERVIEW: TONE_CLASS.accent,
  CLOSED: TONE_CLASS.neutral,
};

/** Translated message for an API error of the pool. */
export const poolError = (err: unknown) => {
  const key = `pool.errors.${errorCode(err)}`;
  return i18n.exists(key) ? String(i18n.t(key)) : String(i18n.t('pool.errors.generic'));
};

/** "a, b , c" → ['a', 'b', 'c'] (trimmed, unique, at most `max`). */
export const splitList = (s: string, max: number) => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))].slice(0, max);

export const fmtDay = (iso: string | null | undefined, locale: string) => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale === 'az' ? 'az-Latn-AZ' : locale, { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
};
