import { z } from 'zod';
import type { VisaType } from '@prisma/client';
import { canonicalProfession, professionFamily } from '../matching.js';
import { quickNetMonthly } from '../budget/salary.js';
import { AGE, EDUCATION, EXPERIENCE, GERMAN, PROFESSION, scorePaths, type EligibilityAnswers, type PathKey, type PathResult } from './eligibility.js';

/**
 * "Which path fits me" wizard (/path-finder): five answers (profession, education, German, experience, age)
 * → the suitable immigration paths with reasons, an indicative salary range (gross and net), the typical
 * duration and the matching service package. The scoring is the eligibility quiz's (./eligibility.ts); the
 * three questions the wizard does not ask are filled with neutral defaults:
 *  - licence: a "driver" is a professional driver (C/CE), everyone else none;
 *  - family: single (family reunion is not offered here — it needs a family member in Germany);
 *  - goal: work for a qualified / experienced person or a driver, otherwise Ausbildung.
 * Pure functions (unit-tested); the route adds durations, vacancies and packages from the database.
 */

export const pathFinderSchema = z
  .object({
    profession: z.enum(PROFESSION),
    education: z.enum(EDUCATION),
    german: z.enum(GERMAN),
    experience: z.enum(EXPERIENCE),
    age: z.enum(AGE),
  })
  .strict();
export type PathFinderAnswers = z.infer<typeof pathFinderSchema>;

/** Paths the wizard can recommend (family reunion needs a question it does not ask). */
export const FINDER_PATHS = ['skilled_18b', 'drivers_19c', 'ausbildung_16a', 'chancenkarte', 'study_16b', 'recognition_16d'] as const satisfies readonly PathKey[];

export const toEligibilityAnswers = (a: PathFinderAnswers): EligibilityAnswers => {
  const qualified = a.education === 'vocational' || a.education === 'university';
  const experienced = a.experience === '2_5' || a.experience === '5p';
  return {
    ...a,
    licence: a.profession === 'driver' ? 'CE' : 'none',
    family: 'single',
    goal: qualified || experienced || a.profession === 'driver' ? 'work' : 'ausbildung',
  };
};

/** Best paths first: up to 3 with a score ≥ 40, at least the best one. */
export const finderPaths = (a: PathFinderAnswers): PathResult[] => {
  const all = scorePaths(toEligibilityAnswers(a)).filter((p) => (FINDER_PATHS as readonly string[]).includes(p.key));
  const good = all.filter((p) => p.score >= 40).slice(0, 3);
  return good.length ? good : all.slice(0, 1);
};

/** Wizard profession → profession family of lib/matching.ts (null: no specific family). */
export const PROFESSION_FAMILY: Record<PathFinderAnswers['profession'], string | null> = {
  driver: 'driving',
  care: 'care',
  construction: 'construction',
  technical: 'technical',
  hospitality: 'hospitality',
  it: 'it',
  logistics: 'logistics',
  other: null,
  none: null,
};

/** Vacancy board sector for the "matching jobs" link (client/src/components/jobs/types.ts SECTORS). */
export const PROFESSION_SECTOR: Record<PathFinderAnswers['profession'], string | null> = {
  driver: 'logistics',
  care: 'healthcare',
  construction: 'construction',
  technical: 'industry',
  hospitality: 'hospitality',
  it: null,
  logistics: 'logistics',
  other: null,
  none: null,
};

/**
 * Indicative gross monthly salaries for 2026 (full time, first job in Germany, € per month), used when fewer
 * than MIN_VACANCIES live vacancies with a salary exist for the profession. Orientation values from the
 * Entgeltatlas of the Federal Employment Agency for entry level, rounded; the lower end never goes below the
 * statutory minimum wage (13.90 €/h in 2026 ≈ 2,410 € at 40 h).
 */
export const REFERENCE_GROSS: Record<PathFinderAnswers['profession'], readonly [number, number]> = {
  driver: [2800, 3600],
  care: [2900, 3900],
  construction: [2700, 3500],
  technical: [3000, 3900],
  hospitality: [2450, 3000],
  it: [3800, 5500],
  logistics: [2450, 3100],
  other: [2450, 3200],
  none: [2450, 2900],
};
/** Ausbildung: typical training allowance over the three years (collective agreements 2026), € gross per month. */
export const AUSBILDUNG_GROSS = [1050, 1350] as const;
export const MIN_VACANCIES = 2;

const percentile = (sorted: number[], p: number) => {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
};
const round50 = (n: number) => Math.round(n / 50) * 50;

export interface SalaryVacancy {
  profession: string | null;
  title: unknown;
  salaryMin: number | null;
  salaryMax: number | null;
}

const titleText = (t: unknown) => (t && typeof t === 'object' ? Object.values(t as Record<string, unknown>).filter((x) => typeof x === 'string').join(' ') : '');

/** Vacancies of the wizard profession's family (by the vacancy's profession field, else its title). */
export const vacanciesOfProfession = <V extends SalaryVacancy>(list: V[], profession: PathFinderAnswers['profession']): V[] => {
  const family = PROFESSION_FAMILY[profession];
  if (!family) return [];
  return list.filter((v) => professionFamily(canonicalProfession(v.profession) ?? canonicalProfession(titleText(v.title))) === family);
};

export interface SalaryRange {
  kind: 'job' | 'ausbildung';
  source: 'vacancies' | 'reference';
  grossMin: number;
  grossMax: number;
  netMin: number;
  netMax: number;
  /** live vacancies the range was computed from (source "vacancies") */
  vacancies: number;
}

/** Gross range of the profession: 25th percentile of the lower bounds … 75th percentile of the upper bounds. */
export const professionSalary = (list: SalaryVacancy[], profession: PathFinderAnswers['profession']): SalaryRange => {
  const paid = vacanciesOfProfession(list, profession).filter((v) => (v.salaryMin ?? v.salaryMax ?? 0) > 0);
  let lo: number;
  let hi: number;
  let source: SalaryRange['source'] = 'reference';
  if (paid.length >= MIN_VACANCIES) {
    const mins = paid.map((v) => (v.salaryMin ?? v.salaryMax)!).sort((a, b) => a - b);
    const maxs = paid.map((v) => Math.max(v.salaryMax ?? 0, (v.salaryMin ?? v.salaryMax)!)).sort((a, b) => a - b);
    lo = round50(percentile(mins, 0.25));
    hi = Math.max(lo, round50(percentile(maxs, 0.75)));
    source = 'vacancies';
  } else [lo, hi] = REFERENCE_GROSS[profession];
  return { kind: 'job', source, grossMin: lo, grossMax: hi, netMin: quickNetMonthly(lo), netMax: quickNetMonthly(hi), vacancies: source === 'vacancies' ? paid.length : 0 };
};

/** Salary shown on a path: the job's range, the training allowance for Ausbildung, nothing for studies. */
export const salaryForPath = (key: PathKey, job: SalaryRange): SalaryRange | null => {
  if (key === 'study_16b') return null;
  if (key === 'ausbildung_16a') {
    const [lo, hi] = AUSBILDUNG_GROSS;
    return { kind: 'ausbildung', source: 'reference', grossMin: lo, grossMax: hi, netMin: quickNetMonthly(lo), netMax: quickNetMonthly(hi), vacancies: 0 };
  }
  return job;
};

export interface FinderPackage {
  id: string;
  slug: string;
  tier: string;
  visaTypes: unknown;
  title: unknown;
  priceCents: number;
  currency: string;
  highlight: boolean;
  sortOrder: number;
}

/** The package for a visa type: one made for it (or for all types), the highlighted one first, then the cheapest. */
export const packageFor = <P extends FinderPackage>(packages: P[], visaType: VisaType): P | null => {
  const fits = packages.filter((p) => !Array.isArray(p.visaTypes) || p.visaTypes.length === 0 || (p.visaTypes as string[]).includes(visaType));
  const specific = fits.filter((p) => Array.isArray(p.visaTypes) && (p.visaTypes as string[]).includes(visaType));
  const pool = specific.length ? specific : fits;
  return [...pool].sort((a, b) => Number(b.highlight) - Number(a.highlight) || a.sortOrder - b.sortOrder || a.priceCents - b.priceCents)[0] ?? null;
};
