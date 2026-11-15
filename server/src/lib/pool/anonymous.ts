import crypto from 'node:crypto';
import type { CandidatePoolProfile, Prisma, User } from '@prisma/client';
import { GERMAN_LEVELS, germanRank, licenceCovers, parseLicences, professionSimilarity, RECOGNITION_STATUSES } from '../matching.js';
import { POOL_AVAILABILITY, POOL_LANGUAGE_LEVELS, POOL_LANGUAGES, POOL_LIMITS, POOL_REGIONS, POOL_TRACKS } from './constants.js';

/**
 * The anonymous pool profile is built from a WHITELIST: only the user fields in `poolUserSelect` are ever
 * loaded for the employer side, and `poolCard` copies named fields only. No name, photo, contact data, birth
 * date, passport / IDs, address, documents or client free text ("about") can reach an employer. The only
 * free text shown is the staff-written summary (and short profession / skill items).
 */
export const poolUserSelect = {
  id: true,
  role: true,
  isActive: true,
  profession: true,
  experienceYears: true,
  germanLevel: true,
  education: true,
  drivingLicence: true,
  recognitionStatus: true,
} as const satisfies Prisma.UserSelect;

export type PoolUser = Pick<User, keyof typeof poolUserSelect>;
export type PoolProfileWithUser = CandidatePoolProfile & { user: PoolUser };

/** Visible to employers: own consent on, not hidden by staff, an active client account with a profession. */
export const visibleProfileWhere: Prisma.CandidatePoolProfileWhereInput = {
  consentAt: { not: null },
  hidden: false,
  user: { role: 'CLIENT', isActive: true, profession: { not: null } },
};

export const isVisible = (p: Pick<CandidatePoolProfile, 'consentAt' | 'hidden'> & { user: Pick<PoolUser, 'role' | 'isActive' | 'profession'> }) =>
  !!p.consentAt && !p.hidden && p.user.role === 'CLIENT' && p.user.isActive && !!p.user.profession?.trim();

// ─── JSON columns ───────────────────────────────────────────────────────

const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);

export const strList = (v: Prisma.JsonValue | null | undefined, max: number, len: number): string[] => {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const c = clip(x, len);
    if (c && !out.some((o) => o.toLowerCase() === c.toLowerCase())) out.push(c);
    if (out.length >= max) break;
  }
  return out;
};

export const enumList = <T extends string>(v: Prisma.JsonValue | null | undefined, allowed: readonly T[]): T[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is T => typeof x === 'string' && (allowed as readonly string[]).includes(x)))] : [];

export interface PoolLanguage {
  lang: (typeof POOL_LANGUAGES)[number];
  level: (typeof POOL_LANGUAGE_LEVELS)[number];
}

export const languageList = (v: Prisma.JsonValue | null | undefined): PoolLanguage[] => {
  if (!Array.isArray(v)) return [];
  const out: PoolLanguage[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
    const { lang, level } = x as Record<string, unknown>;
    if (!(POOL_LANGUAGES as readonly unknown[]).includes(lang) || !(POOL_LANGUAGE_LEVELS as readonly unknown[]).includes(level)) continue;
    if (out.some((o) => o.lang === lang)) continue;
    out.push({ lang, level } as PoolLanguage);
    if (out.length >= POOL_LIMITS.languages) break;
  }
  return out;
};

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

const professionsOf = (p: Pick<CandidatePoolProfile, 'professions'>, u: Pick<PoolUser, 'profession'>) => {
  const main = u.profession?.trim() ? [clip(u.profession, POOL_LIMITS.professionLength)] : [];
  const extra = strList(p.professions, POOL_LIMITS.professions, POOL_LIMITS.professionLength).filter((x) => !main.some((m) => m.toLowerCase() === x.toLowerCase()));
  return [...main, ...extra];
};

// ─── The card ───────────────────────────────────────────────────────────

/** Keys of the anonymous card: the employer API never sends anything else about a candidate (tests assert this). */
export const POOL_CARD_KEYS = [
  'code',
  'professions',
  'experienceYears',
  'germanLevel',
  'languages',
  'drivingLicences',
  'education',
  'recognitionStatus',
  'regions',
  'earliestStart',
  'availability',
  'skills',
  'track',
  'summary',
] as const;

export type PoolCard = {
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
};

const EDUCATION = ['school', 'vocational', 'university'];

export const poolCard = (p: CandidatePoolProfile, u: PoolUser): PoolCard => ({
  code: p.code,
  professions: professionsOf(p, u),
  experienceYears: typeof u.experienceYears === 'number' ? Math.max(0, Math.min(60, u.experienceYears)) : null,
  germanLevel: (GERMAN_LEVELS as readonly string[]).includes(u.germanLevel ?? '') ? u.germanLevel : null,
  languages: languageList(p.languages),
  drivingLicences: parseLicences(u.drivingLicence),
  education: u.education && EDUCATION.includes(u.education) ? u.education : null,
  recognitionStatus: (RECOGNITION_STATUSES as readonly string[]).includes(u.recognitionStatus ?? '') ? u.recognitionStatus! : 'NONE',
  regions: enumList(p.regions, POOL_REGIONS),
  earliestStart: ymd(p.earliestStart),
  availability: p.availability && (POOL_AVAILABILITY as readonly string[]).includes(p.availability) ? p.availability : null,
  skills: strList(p.skills, POOL_LIMITS.skills, POOL_LIMITS.skillLength),
  track: (POOL_TRACKS as readonly string[]).includes(p.track) ? p.track : 'JOB',
  summary: p.summary?.trim() ? p.summary.trim().slice(0, POOL_LIMITS.summary) : null,
});

// ─── Deterministic filters (no AI) ──────────────────────────────────────

export interface PoolFilters {
  profession?: string;
  germanLevel?: string;
  minExperience?: number;
  licence?: string;
  recognition?: string;
  region?: string;
  startBy?: Date;
  track?: 'JOB' | 'AUSBILDUNG';
}

/** The date a candidate can start (earliest start, or today for "immediately"); null = not given. */
const startDate = (p: Pick<CandidatePoolProfile, 'earliestStart' | 'availability'>, now: Date) =>
  p.earliestStart ?? (p.availability === 'IMMEDIATE' ? now : null);

export const matchesFilters = (p: CandidatePoolProfile, u: PoolUser, f: PoolFilters, now = new Date()): boolean => {
  if (f.profession && !professionsOf(p, u).some((x) => professionSimilarity(x, f.profession) >= 0.5)) return false;
  if (f.germanLevel && germanRank(u.germanLevel) < germanRank(f.germanLevel)) return false;
  if (f.minExperience !== undefined && (u.experienceYears ?? 0) < f.minExperience) return false;
  if (f.licence && !licenceCovers(u.drivingLicence, f.licence)) return false;
  if (f.recognition && (u.recognitionStatus || 'NONE') !== f.recognition) return false;
  if (f.region) {
    const regions = enumList(p.regions, POOL_REGIONS);
    if (regions.length && !regions.includes('ANY') && !regions.includes(f.region as (typeof POOL_REGIONS)[number])) return false;
  }
  if (f.startBy) {
    const s = startDate(p, now);
    if (!s || s.getTime() > f.startBy.getTime()) return false;
  }
  if (f.track && p.track !== 'BOTH' && p.track !== f.track) return false;
  return true;
};

// ─── Pseudonymous code ──────────────────────────────────────────────────

/** TV-K-1234 (random; 5 digits once 4-digit codes get crowded). */
export const randomPoolCode = (digits = 4) => `TV-K-${crypto.randomInt(10 ** (digits - 1), 10 ** digits)}`;

/** Accepts "tv-k-1234" as typed in a URL. */
export const normaliseCode = (s: string) => s.trim().toUpperCase();
