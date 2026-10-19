import { z } from 'zod';
import type { VisaType } from '@prisma/client';

/**
 * Eligibility quiz (/uygunluq-testi): a deterministic scoring table that maps 7 answers to the most
 * suitable German immigration paths, with reason and "what is missing" codes the client translates.
 * Pure functions (unit-tested); durations and the optional AI explanation are added by the route.
 *
 * The rules are a simplified, indicative reading of the Aufenthaltsgesetz (no legal advice):
 * - §18a/§18b skilled workers need a vocational or university qualification (recognition in Germany);
 * - §19c drivers (Berufskraftfahrer) need a C/CE (or D) licence, German A1–A2 is usually enough to start;
 * - §16a Ausbildung: typically 18–35, school finished, German B1 (A2 minimum for some employers);
 * - §20a Chancenkarte: qualification + German A1 (or English B2) + at least 6 points;
 * - §16b study: school-leaving certificate and German (or English) B2 for most programmes;
 * - §16d recognition measures: qualification with partial recognition, German A2+;
 * - family reunion: a spouse / parent living in Germany, the joining spouse usually needs German A1.
 */

export const AGE = ['u18', '18_25', '26_35', '36_45', '46p'] as const;
export const PROFESSION = ['driver', 'care', 'construction', 'technical', 'hospitality', 'it', 'logistics', 'other', 'none'] as const;
export const EXPERIENCE = ['none', 'lt2', '2_5', '5p'] as const;
export const EDUCATION = ['school', 'vocational', 'university'] as const;
export const GERMAN = ['none', 'A1', 'A2', 'B1', 'B2'] as const;
export const LICENCE = ['none', 'B', 'C', 'CE', 'D'] as const;
export const FAMILY = ['single', 'married', 'married_kids', 'family_in_de'] as const;
export const GOAL = ['work', 'ausbildung', 'study', 'family'] as const;

export const eligibilityAnswersSchema = z
  .object({
    age: z.enum(AGE),
    profession: z.enum(PROFESSION),
    experience: z.enum(EXPERIENCE),
    education: z.enum(EDUCATION),
    german: z.enum(GERMAN),
    licence: z.enum(LICENCE),
    family: z.enum(FAMILY),
    goal: z.enum(GOAL),
  })
  .strict();

export type EligibilityAnswers = z.infer<typeof eligibilityAnswersSchema>;

export const PATHS = ['skilled_18b', 'drivers_19c', 'ausbildung_16a', 'chancenkarte', 'study_16b', 'recognition_16d', 'family'] as const;
export type PathKey = (typeof PATHS)[number];

export const PATH_VISA_TYPE: Record<PathKey, VisaType> = {
  skilled_18b: 'WORK',
  drivers_19c: 'WORK',
  ausbildung_16a: 'AUSBILDUNG',
  chancenkarte: 'JOB_SEEKER',
  study_16b: 'STUDY',
  recognition_16d: 'WEITERBILDUNG',
  family: 'FAMILY',
};

/** Matches the visaLabel of a published visa category (for links and admin forecast overrides). */
export const PATH_LABEL_RE: Record<PathKey, RegExp> = {
  skilled_18b: /18\s*[ab]\b/i,
  drivers_19c: /19\s*c\b|kraftfahr|driver|sürücü/i,
  ausbildung_16a: /16\s*a\b|ausbildung/i,
  chancenkarte: /20\s*a\b|chancen/i,
  study_16b: /16\s*b\b|studi/i,
  recognition_16d: /16\s*d\b|anerkenn/i,
  family: /\b(29|30|32)\b|famil/i,
};

export type ReasonCode =
  | 'QUALIFIED'
  | 'GERMAN_OK'
  | 'EXPERIENCE_OK'
  | 'LICENCE_OK'
  | 'DRIVER'
  | 'AGE_OK'
  | 'GOAL_MATCH'
  | 'FAMILY_IN_DE'
  | 'POINTS_OK';

export type MissingItem =
  | { code: 'GERMAN'; from: (typeof GERMAN)[number]; to: (typeof GERMAN)[number] }
  | { code: 'QUALIFICATION' }
  | { code: 'RECOGNITION' }
  | { code: 'EXPERIENCE'; years: number }
  | { code: 'LICENCE'; need: string }
  | { code: 'CODE95' }
  | { code: 'AGE' }
  | { code: 'POINTS'; have: number; need: number }
  | { code: 'FAMILY_MEMBER' };

export interface PathResult {
  key: PathKey;
  visaType: VisaType;
  score: number;
  fit: 'high' | 'medium' | 'low';
  reasons: ReasonCode[];
  missing: MissingItem[];
}

const gRank = (g: (typeof GERMAN)[number]) => GERMAN.indexOf(g);
const qualified = (a: EligibilityAnswers) => a.education === 'vocational' || a.education === 'university';
const expYears = (e: EligibilityAnswers['experience']) => ({ none: 0, lt2: 1, '2_5': 3, '5p': 5 })[e];
const needGerman = (a: EligibilityAnswers, to: (typeof GERMAN)[number]): MissingItem | null => (gRank(a.german) < gRank(to) ? { code: 'GERMAN', from: a.german, to } : null);

/** Chancenkarte points (simplified): experience, German, age. 6 are needed. */
export const chancenkartePoints = (a: EligibilityAnswers) => {
  let p = 0;
  p += a.experience === '5p' ? 3 : a.experience === '2_5' ? 2 : 0;
  p += a.german === 'B2' ? 3 : a.german === 'B1' ? 2 : a.german === 'A2' ? 1 : 0;
  p += a.age === '18_25' || a.age === '26_35' ? 2 : a.age === '36_45' ? 1 : 0;
  // Qualification counts once recognised; a vocational / university degree in a shortage occupation adds 1 here.
  p += qualified(a) && ['care', 'technical', 'it', 'construction', 'driver'].includes(a.profession) ? 1 : 0;
  return p;
};

type Scored = { score: number; reasons: ReasonCode[]; missing: (MissingItem | null)[] };

const RULES: Record<PathKey, (a: EligibilityAnswers) => Scored> = {
  skilled_18b: (a) => {
    if (!qualified(a)) return { score: 15, reasons: [], missing: [{ code: 'QUALIFICATION' }] };
    const reasons: ReasonCode[] = ['QUALIFIED'];
    let score = 40;
    const g = gRank(a.german);
    score += g >= 3 ? 20 : g === 2 ? 12 : g === 1 ? 5 : 0;
    if (g >= 3) reasons.push('GERMAN_OK');
    const y = expYears(a.experience);
    score += y >= 5 ? 15 : y >= 3 ? 12 : y >= 1 ? 5 : 0;
    if (y >= 3) reasons.push('EXPERIENCE_OK');
    if (a.goal === 'work') {
      score += 15;
      reasons.push('GOAL_MATCH');
    }
    if (a.age === '46p') score -= 10;
    return { score, reasons, missing: [needGerman(a, 'B1'), { code: 'RECOGNITION' }] };
  },
  drivers_19c: (a) => {
    const heavy = a.licence === 'C' || a.licence === 'CE' || a.licence === 'D';
    const reasons: ReasonCode[] = [];
    let score = 0;
    if (heavy) {
      score += 45;
      reasons.push('LICENCE_OK');
    }
    if (a.profession === 'driver') {
      score += 15;
      reasons.push('DRIVER');
    }
    if (!heavy && a.profession !== 'driver') return { score: Math.min(score, 10), reasons, missing: [{ code: 'LICENCE', need: 'CE' }] };
    const y = expYears(a.experience);
    score += y >= 3 ? 15 : y >= 1 ? 7 : 0;
    if (y >= 3) reasons.push('EXPERIENCE_OK');
    const g = gRank(a.german);
    score += g >= 2 ? 15 : g === 1 ? 10 : 0;
    if (g >= 1) reasons.push('GERMAN_OK');
    if (a.goal === 'work') {
      score += 10;
      reasons.push('GOAL_MATCH');
    }
    if (a.age === 'u18') score -= 30;
    return {
      score,
      reasons,
      missing: [heavy ? null : { code: 'LICENCE', need: 'CE' }, needGerman(a, 'A2'), y < 1 ? { code: 'EXPERIENCE', years: 1 } : null, heavy ? { code: 'CODE95' } : null],
    };
  },
  ausbildung_16a: (a) => {
    const reasons: ReasonCode[] = [];
    let score = 10; // school finished (every education option includes it)
    if (a.age === '18_25') score += 30;
    else if (a.age === '26_35') score += 18;
    else if (a.age === 'u18') score += 5;
    if (a.age === '18_25' || a.age === '26_35') reasons.push('AGE_OK');
    const g = gRank(a.german);
    score += g >= 3 ? 30 : g === 2 ? 15 : g === 1 ? 5 : 0;
    if (g >= 3) reasons.push('GERMAN_OK');
    if (a.goal === 'ausbildung') {
      score += 25;
      reasons.push('GOAL_MATCH');
    } else if (a.goal === 'work' && !qualified(a)) score += 10;
    return { score, reasons, missing: [needGerman(a, 'B1'), a.age === '36_45' || a.age === '46p' || a.age === 'u18' ? { code: 'AGE' } : null] };
  },
  chancenkarte: (a) => {
    if (!qualified(a)) return { score: 10, reasons: [], missing: [{ code: 'QUALIFICATION' }] };
    const points = chancenkartePoints(a);
    const reasons: ReasonCode[] = ['QUALIFIED'];
    let score = 30 + Math.min(points, 8) * 6;
    if (points >= 6) reasons.push('POINTS_OK');
    if (a.german === 'none') score -= 25;
    if (a.goal === 'work') {
      score += 5;
      reasons.push('GOAL_MATCH');
    }
    return { score, reasons, missing: [needGerman(a, 'A1'), points < 6 ? { code: 'POINTS', have: points, need: 6 } : null] };
  },
  study_16b: (a) => {
    const reasons: ReasonCode[] = [];
    let score = 15;
    const g = gRank(a.german);
    score += g >= 4 ? 30 : g === 3 ? 15 : g === 2 ? 5 : 0;
    if (g >= 4) reasons.push('GERMAN_OK');
    if (a.age === '18_25' || a.age === '26_35') {
      score += 15;
      reasons.push('AGE_OK');
    }
    if (a.goal === 'study') {
      score += 35;
      reasons.push('GOAL_MATCH');
    } else score = Math.round(score * 0.5);
    return { score, reasons, missing: [needGerman(a, 'B2')] };
  },
  recognition_16d: (a) => {
    if (!qualified(a)) return { score: 5, reasons: [], missing: [{ code: 'QUALIFICATION' }] };
    const reasons: ReasonCode[] = ['QUALIFIED'];
    const g = gRank(a.german);
    let score = 30 + (g === 2 || g === 3 ? 15 : g >= 4 ? 5 : 0);
    if (g >= 2) reasons.push('GERMAN_OK');
    if (expYears(a.experience) >= 3) {
      score += 8;
      reasons.push('EXPERIENCE_OK');
    }
    if (a.goal === 'work' || a.goal === 'ausbildung') score += 5;
    return { score, reasons, missing: [needGerman(a, 'A2'), { code: 'RECOGNITION' }] };
  },
  family: (a) => {
    if (a.family !== 'family_in_de') return { score: a.goal === 'family' ? 30 : 0, reasons: [], missing: [{ code: 'FAMILY_MEMBER' }] };
    const reasons: ReasonCode[] = ['FAMILY_IN_DE'];
    let score = 60;
    if (gRank(a.german) >= 1) {
      score += 20;
      reasons.push('GERMAN_OK');
    }
    if (a.goal === 'family') {
      score += 15;
      reasons.push('GOAL_MATCH');
    }
    return { score, reasons, missing: [needGerman(a, 'A1')] };
  },
};

const fitOf = (score: number): PathResult['fit'] => (score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low');

/** Every path scored (0–100), best first. */
export const scorePaths = (a: EligibilityAnswers): PathResult[] =>
  PATHS.map((key) => {
    const r = RULES[key](a);
    const score = Math.max(0, Math.min(100, Math.round(r.score)));
    return { key, visaType: PATH_VISA_TYPE[key], score, fit: fitOf(score), reasons: r.reasons, missing: r.missing.filter((m): m is MissingItem => !!m) };
  }).sort((x, y) => y.score - x.score || PATHS.indexOf(x.key) - PATHS.indexOf(y.key));

/** The suitable paths to show: up to 3 with a score ≥ 40, at least the best one. */
export const evaluateEligibility = (a: EligibilityAnswers): PathResult[] => {
  const all = scorePaths(a);
  const good = all.filter((p) => p.score >= 40).slice(0, 3);
  return good.length ? good : all.slice(0, 1);
};

/** Sum of the per-step day ranges → whole weeks (min rounded down, max rounded up). */
export const weeksFromRanges = (ranges: Record<string, { minDays: number; maxDays: number }>) => {
  let min = 0;
  let max = 0;
  for (const r of Object.values(ranges)) {
    min += r.minDays;
    max += r.maxDays;
  }
  return { minWeeks: Math.max(1, Math.floor(min / 7)), maxWeeks: Math.max(1, Math.ceil(max / 7)) };
};

/** One line per answer, for inquiries and the AI prompt (codes are language-neutral). */
export const answersSummary = (a: EligibilityAnswers) =>
  `age ${a.age}, profession ${a.profession}, experience ${a.experience}, education ${a.education}, German ${a.german}, licence ${a.licence}, family ${a.family}, goal ${a.goal}`;
