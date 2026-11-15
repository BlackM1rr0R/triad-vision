/**
 * Anonymous candidate pool: fixed value lists shared by the client, employer and staff routes.
 * The client copies of these lists live in client/src/components/pool/types.ts.
 */

/**
 * Version of the consent text shown next to the "Show my anonymous profile to employers" switch
 * (client/src/i18n/pagesPool.ts → pool.client.consentText). Bump it when that text changes: a new
 * opt-in must then confirm the new version (the ConsentRecord row stores it).
 */
export const POOL_CONSENT_VERSION = 'pool-2026-11-v1';

/** German states (Bundesland codes); ANY = anywhere in Germany. */
export const POOL_REGIONS = ['ANY', 'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'] as const;
export type PoolRegion = (typeof POOL_REGIONS)[number];

export const POOL_AVAILABILITY = ['IMMEDIATE', 'ONE_MONTH', 'THREE_MONTHS', 'LATER'] as const;
export type PoolAvailability = (typeof POOL_AVAILABILITY)[number];

/** What the candidate is looking for: a job, an Ausbildung (vocational training) or both. */
export const POOL_TRACKS = ['JOB', 'AUSBILDUNG', 'BOTH'] as const;
export type PoolTrack = (typeof POOL_TRACKS)[number];

/** Other languages (ISO 639-1) a candidate can list, with a CEFR level or "native". */
export const POOL_LANGUAGES = ['az', 'en', 'ru', 'tr', 'ka', 'uk', 'fa', 'ar', 'fr', 'es', 'it', 'pl'] as const;
export const POOL_LANGUAGE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native'] as const;

export const POOL_INTEREST_STATUSES = ['NEW', 'CONTACTED', 'INTERVIEW', 'CLOSED'] as const;

export const POOL_LIMITS = {
  professions: 3,
  professionLength: 80,
  skills: 12,
  skillLength: 40,
  languages: 8,
  summary: 1200,
  message: 1000,
  positionsMax: 200,
} as const;

/** Employer page size of the pool search. */
export const POOL_PAGE_SIZE = 20;
/** Upper bound of visible profiles filtered in memory per search. */
export const POOL_SCAN_LIMIT = 5000;

/**
 * Daily caps per company (24 h window, counted in CandidatePoolView). Above them the pool answers 429
 * POOL_DAILY_LIMIT and staff get one notification, so a scraping employer is visible.
 */
export const POOL_DAILY_DETAIL_LIMIT = 150;
export const POOL_DAILY_SEARCH_LIMIT = 600;
