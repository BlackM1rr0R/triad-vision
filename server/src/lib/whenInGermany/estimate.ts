import { z } from 'zod';
import type { VisaType } from '@prisma/client';
import { DEFAULTS_BY_TYPE, DEFAULT_TRAVEL_RANGE } from '../journey/forecast.js';
import { EDUCATION, GERMAN, PATH_VISA_TYPE, PROFESSION } from '../publicAi/eligibility.js';
import { FINDER_PATHS, PROFESSION_FAMILY, finderPaths } from '../publicAi/pathFinder.js';
import { resolveStat, type DataStage, type GroupLevel, type StatsTable } from './stats.js';

/**
 * "When could I be in Germany?" (/when-in-germany): profession, German level, documents, recognition and visa
 * route → an estimated arrival month and a timeline of seven stages with min – typical – max durations.
 * Pure (unit-tested): the statistics table comes from ./service.ts (real case history, ./stats.ts).
 *
 * Timeline (days, computed separately for the min = p25, typical = median and max = p75 scenarios):
 *   language     0 → L                                   (CEFR hours table below, runs in parallel)
 *   documents    0 → D
 *   recognition  D → D + R                               (only when needed)
 *   contract     D → D + C
 *   embassy      max(L, D + R, D + C) → + E              (embassy file + waiting for the appointment)
 *   decision     → + V
 *   travel       → + T                                   = arrival in Germany
 * The visa route is the path finder's best path (lib/publicAi/pathFinder.ts) unless the visitor picks one.
 */

export const DOC_STATES = ['none', 'some', 'complete'] as const;
export type DocState = (typeof DOC_STATES)[number];
export const RECOGNITION_ANSWERS = ['yes', 'no', 'unsure'] as const;
export type FinderPath = (typeof FINDER_PATHS)[number];

export const whenQuerySchema = z.object({
  profession: z.enum(PROFESSION).catch('driver'),
  education: z.enum(EDUCATION).catch('vocational'),
  german: z.enum(GERMAN).catch('none'),
  documents: z.enum(DOC_STATES).catch('none'),
  recognition: z.enum(RECOGNITION_ANSWERS).catch('unsure'),
  route: z.enum([...FINDER_PATHS, 'auto']).catch('auto'),
});
export type WhenInput = z.infer<typeof whenQuerySchema>;
export const DEFAULT_WHEN_INPUT: WhenInput = whenQuerySchema.parse({});

export const STAGES = ['documents', 'language', 'recognition', 'contract', 'embassy', 'decision', 'travel'] as const;
export type Stage = (typeof STAGES)[number];

// ─── Language: CEFR guided learning hours ───────────────────────────────

/**
 * Cumulative guided learning hours to reach each level from zero (full hours; the source gives 45-minute teaching
 * units, UE): Goethe-Institut, "Frequently asked questions — How long does it take to reach a level?"
 * (https://www.goethe.de/ins/gb/en/sta/lon/kur/faq.html): A1 60–150 h (80–200 UE), A2 150–260 h (200–350 UE),
 * B1 260–490 h (350–650 UE), B2 450–600 h (600–800 UE), C1 600–750 h (800–1,000 UE). Self-study comes on top.
 */
export const LEVEL_HOURS = { none: [0, 0], A1: [60, 150], A2: [150, 260], B1: [260, 490], B2: [450, 600], C1: [600, 750] } as const;
export type Level = keyof typeof LEVEL_HOURS;
const LEVEL_ORDER: Level[] = ['none', 'A1', 'A2', 'B1', 'B2', 'C1'];

/** Course hours per week in the fast (intensive course), typical and slow (evening course) scenario. */
export const HOURS_PER_WEEK = { min: 20, typical: 15, max: 10 } as const;
/** Booking the exam and receiving the certificate (days), when a level has to be reached. ESTIMATE. */
export const EXAM_DAYS = { min: 14, typical: 28, max: 42 } as const;

/**
 * Level the route usually needs at the embassy (simplified, ESTIMATE): skilled workers B1 (nurses B2 for the
 * licence), drivers A2, Ausbildung B1, Chancenkarte A1, studies B2, recognition measures A2 (nurses B1).
 */
export const targetLevel = (route: FinderPath, profession: WhenInput['profession']): Level => {
  const care = profession === 'care';
  switch (route) {
    case 'skilled_18b':
      return care ? 'B2' : 'B1';
    case 'drivers_19c':
      return 'A2';
    case 'ausbildung_16a':
      return 'B1';
    case 'chancenkarte':
      return 'A1';
    case 'study_16b':
      return 'B2';
    case 'recognition_16d':
      return care ? 'B1' : 'A2';
  }
};

export interface Triple {
  min: number;
  typical: number;
  max: number;
}
const SCEN = ['min', 'typical', 'max'] as const;
const tri = (min: number, typical: number, max: number): Triple => {
  const [a, b, c] = [min, typical, max].map((x) => Math.max(0, Math.round(x))).sort((x, y) => x - y);
  return { min: a, typical: b, max: c };
};
const ZERO: Triple = { min: 0, typical: 0, max: 0 };

/** Hours still to learn from `from` to `to`: [low − low, mid − mid, high − high] of the table. */
export const gapHours = (from: Level, to: Level): Triple => {
  if (LEVEL_ORDER.indexOf(from) >= LEVEL_ORDER.indexOf(to)) return ZERO;
  const [a0, a1] = LEVEL_HOURS[from];
  const [b0, b1] = LEVEL_HOURS[to];
  return tri(b0 - a0, (b0 + b1) / 2 - (a0 + a1) / 2, b1 - a1);
};

/** Days of language learning (+ exam) for the gap. */
export const languageDays = (from: Level, to: Level): Triple => {
  const h = gapHours(from, to);
  if (h.max === 0) return ZERO;
  const d = (s: (typeof SCEN)[number]) => (h[s] / HOURS_PER_WEEK[s]) * 7 + EXAM_DAYS[s];
  return tri(d('min'), d('typical'), d('max'));
};

// ─── Fallbacks (no group with enough cases) ─────────────────────────────

/** Documents status → share of the documents stage, used with the fallback ranges only. ESTIMATE. */
export const DOC_FACTOR: Record<DocState, number> = { none: 1, some: 0.6, complete: 0.3 };
/** Diploma recognition (days): 8–16 weeks, the start-date calculator's default assumption. ESTIMATE. */
export const RECOGNITION_FALLBACK: [number, number] = [56, 112];

const mid = ([a, b]: readonly [number, number]): Triple => tri(a, (a + b) / 2, b);

/** Documented fallback (days) per stage: the case forecast's defaults per visa type (lib/journey/forecast.ts). */
export const fallbackDays = (stage: Exclude<Stage, 'language'>, visaType: VisaType, documents: DocState): Triple => {
  const d = DEFAULTS_BY_TYPE[visaType];
  switch (stage) {
    case 'documents': {
      const f = DOC_FACTOR[documents];
      return mid([Math.max(1, d.DOCUMENTS[0] * f), Math.max(1, d.DOCUMENTS[1] * f)]);
    }
    case 'contract':
      return mid(d.CONTRACT);
    case 'embassy':
      return mid([d.EMBASSY[0] + d.APPOINTMENT[0], d.EMBASSY[1] + d.APPOINTMENT[1]]);
    case 'decision':
      return mid(d.DECISION);
    case 'recognition':
      return mid(RECOGNITION_FALLBACK);
    case 'travel':
      return mid(DEFAULT_TRAVEL_RANGE);
  }
};

// ─── Recognition and route ──────────────────────────────────────────────

/**
 * Is a diploma recognition needed? The visitor's answer wins; "unsure" is inferred: the skilled-worker route
 * (§ 18a / 18b, except professional drivers: licence conversion instead) and the recognition route (§ 16d) need
 * one; Ausbildung, Chancenkarte, studies and § 19c drivers do not.
 */
export const recognitionNeeded = (answer: WhenInput['recognition'], route: FinderPath, profession: WhenInput['profession']): { needed: boolean; inferred: boolean } => {
  if (answer === 'yes') return { needed: true, inferred: false };
  if (answer === 'no') return { needed: false, inferred: false };
  return { needed: route === 'recognition_16d' || (route === 'skilled_18b' && profession !== 'driver'), inferred: true };
};

/** The route: the visitor's choice, else the path finder's best path (experience 2–5 years, age 26–35 assumed). */
export const routeFor = (input: WhenInput): { route: FinderPath; auto: boolean } => {
  if (input.route !== 'auto') return { route: input.route, auto: false };
  const best = finderPaths({ profession: input.profession, education: input.education, german: input.german, experience: '2_5', age: '26_35' })[0];
  return { route: (best?.key as FinderPath) ?? 'skilled_18b', auto: true };
};

// ─── Date math ──────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;

/** "YYYY-MM" of the day `days` (rounded up) after `today` (UTC calendar). */
export const monthAfter = (today: Date, days: number): string => {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) + Math.ceil(Math.max(0, days)) * DAY);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

// ─── Estimate ───────────────────────────────────────────────────────────

export type Basis = 'history' | 'cefr' | 'estimate' | 'skipped';

export interface StageResult {
  key: Stage;
  days: Triple;
  start: Triple;
  end: Triple;
  basis: Basis;
  /** Group the history figures come from, and how many cases (basis "history"). */
  level: GroupLevel | null;
  sample: number | null;
}

export interface WhenEstimate {
  input: WhenInput;
  route: FinderPath;
  routeAuto: boolean;
  visaType: VisaType;
  targetLevel: Level;
  recognition: { needed: boolean; inferred: boolean };
  stages: StageResult[];
  totalDays: Triple;
  /** "YYYY-MM" of arrival per scenario. */
  arrival: { min: string; typical: string; max: string };
  today: string;
}

const DOC_STAGE: Record<DocState, DataStage> = { none: 'documents_none', some: 'documents_some', complete: 'documents_complete' };

export const estimateWhen = (raw: Partial<WhenInput>, table: StatsTable, today: Date = new Date()): WhenEstimate => {
  const input = whenQuerySchema.parse(raw);
  const { route, auto } = routeFor(input);
  const visaType = PATH_VISA_TYPE[route];
  const family = PROFESSION_FAMILY[input.profession];
  const target = targetLevel(route, input.profession);
  const recognition = recognitionNeeded(input.recognition, route, input.profession);

  const dataStage = (s: Exclude<Stage, 'language'>): DataStage => (s === 'documents' ? DOC_STAGE[input.documents] : s);
  const durations = {} as Record<Stage, Omit<StageResult, 'key' | 'start' | 'end'>>;
  for (const s of STAGES) {
    if (s === 'language') {
      const days = languageDays(input.german, target);
      durations[s] = { days, basis: days.max === 0 ? 'skipped' : 'cefr', level: null, sample: null };
      continue;
    }
    if (s === 'recognition' && !recognition.needed) {
      durations[s] = { days: ZERO, basis: 'skipped', level: null, sample: null };
      continue;
    }
    const hit = resolveStat(table, dataStage(s), visaType, family);
    durations[s] = hit
      ? { days: tri(hit.stat.p25, hit.stat.median, hit.stat.p75), basis: 'history', level: hit.level, sample: hit.stat.n }
      : { days: fallbackDays(s, visaType, input.documents), basis: 'estimate', level: null, sample: null };
  }

  const start = {} as Record<Stage, Triple>;
  const end = {} as Record<Stage, Triple>;
  const each = (fn: (s: (typeof SCEN)[number]) => number): Triple => ({ min: fn('min'), typical: fn('typical'), max: fn('max') });
  const place = (k: Stage, from: Triple) => {
    start[k] = from;
    end[k] = each((s) => from[s] + durations[k].days[s]);
  };
  place('language', ZERO);
  place('documents', ZERO);
  place('recognition', end.documents);
  place('contract', end.documents);
  place('embassy', each((s) => Math.max(end.language[s], end.recognition[s], end.contract[s])));
  place('decision', end.embassy);
  place('travel', end.decision);

  const totalDays = end.travel;
  return {
    input,
    route,
    routeAuto: auto,
    visaType,
    targetLevel: target,
    recognition,
    stages: STAGES.map((key) => ({ key, ...durations[key], start: start[key], end: end[key] })),
    totalDays,
    arrival: { min: monthAfter(today, totalDays.min), typical: monthAfter(today, totalDays.typical), max: monthAfter(today, totalDays.max) },
    today: today.toISOString().slice(0, 10),
  };
};
