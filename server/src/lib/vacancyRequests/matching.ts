import type { Vacancy } from '@prisma/client';
import { canonicalProfession } from '../matching.js';
import { normalizePlace, placeMatches } from '../jobAlerts/waitlist.js';
import { vacancyProfession } from '../jobAlerts/service.js';

/** Pure matching of a "Vakansiya sorğusu" (lib/vacancyRequests) against a vacancy. */

export const REQUEST_TYPES = ['WORK', 'AUSBILDUNG'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export interface RequestFacts {
  id?: string;
  type: string;
  sector: string | null;
  profession: string | null;
  city: string | null;
  sourceVacancyId?: string | null;
}
export type RequestVacancyFacts = Pick<Vacancy, 'id' | 'title' | 'city' | 'sector' | 'profession' | 'employmentType'>;

/** Ausbildung vacancies are AUSBILDUNG; everything else (full / part time, seasonal) is WORK. */
export const requestTypeOf = (employmentType: string): RequestType => (employmentType === 'AUSBILDUNG' ? 'AUSBILDUNG' : 'WORK');

const titleText = (v: Pick<Vacancy, 'title' | 'profession'>) => {
  const t = (v.title ?? {}) as Record<string, unknown>;
  return normalizePlace([v.profession ?? '', ...['de', 'en', 'az', 'ru'].map((l) => (typeof t[l] === 'string' ? (t[l] as string) : ''))].join(' '));
};

/**
 * A vacancy fits a request: same type; then the profession when one is given (canonical key, or free text found in the
 * title), else the sector (a vacancy without its own canonical profession also fits a profession + sector request in that
 * sector); no profession and no sector = any vacancy of the type. The city is matched loosely (lib/jobAlerts/waitlist
 * placeMatches). The vacancy a request was made from always fits.
 */
export const vacancyRequestMatches = (req: RequestFacts, v: RequestVacancyFacts): boolean => {
  if (req.sourceVacancyId && req.sourceVacancyId === v.id) return true;
  if (req.type !== requestTypeOf(v.employmentType)) return false;
  if (!placeMatches(req.city, v.city)) return false;
  const reqKey = canonicalProfession(req.profession);
  const free = normalizePlace(req.profession);
  if (reqKey || free) {
    const own = vacancyProfession(v);
    if (reqKey && own === reqKey) return true;
    if (!reqKey && free.length >= 4 && titleText(v).includes(free)) return true;
    return !!req.sector && v.sector === req.sector && !own; // sector fallback only for vacancies without a known profession
  }
  if (req.sector) return v.sector === req.sector;
  return true;
};
