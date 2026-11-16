import { z } from 'zod';

/**
 * Germany readiness score 0–100 (client portal: dashboard card + /account/readiness). Pure and deterministic:
 * the same facts always give the same score; service.ts collects the facts from the portal data.
 *
 * Weights (sum 100) and sub-scores (each 0–100):
 *   language 30 — German level: the best of the profile level, a passed exam and the latest placement test
 *                 (none 0 · A1 25 · A2 45 · B1 70 · B2 90 · C1/C2 100); +10 (max. 100) while a course is active
 *                 or an exam is booked below B1.
 *   documents 25 — required documents of the stages the application already has: accepted 1, uploaded and
 *                 waiting for review 0.6, missing / rejected 0. No application yet: 0. Approved visa: 100.
 *   skills 20 — CV completeness (lib/cv/schema.ts cvCompleteness) 60 % + recognition (Anerkennung) 40 %:
 *                 recognised / not required 100 · partial 70 · submitted / in review / deficit notice 50 ·
 *                 preparing 25 · none / unknown 0.
 *   housing 15 — the strongest signal: Anmeldung done 100 · housing arranged (arrival plan or the employer's
 *                 checklist) 80 · offered or rental contract uploaded 60 · searching 30 · otherwise
 *                 the share of ticked housing-search steps × 50.
 *   money 10 — the client's short self-check (MONEY_QUESTIONS, points as listed; 0 until answered).
 * Each sub-score names one next step with the points of the TOTAL score it would add (rounded).
 */

export const PARTS = ['language', 'documents', 'skills', 'housing', 'money'] as const;
export type PartKey = (typeof PARTS)[number];
export const WEIGHTS: Record<PartKey, number> = { language: 30, documents: 25, skills: 20, housing: 15, money: 10 };

export const LEVEL_POINTS: Record<string, number> = { none: 0, A1: 25, A2: 45, B1: 70, B2: 90, C1: 100, C2: 100 };
const LEVEL_ORDER = ['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const levelRank = (l: string | null | undefined) => Math.max(0, LEVEL_ORDER.indexOf(l ?? 'none'));
export const bestLevel = (...levels: (string | null | undefined)[]) => LEVEL_ORDER[Math.max(0, ...levels.map(levelRank))];

/** Money self-check: question → option → points (max 100). */
export const MONEY_QUESTIONS = {
  savings: { none: 0, lt1: 10, '1to2': 25, gt2: 35 },
  firstMonth: { no: 0, yes: 25 },
  travelCosts: { no: 0, partly: 10, yes: 20 },
  bankCard: { no: 0, yes: 20 },
} as const;
export type MoneyQuestion = keyof typeof MONEY_QUESTIONS;
export type MoneyAnswers = { [Q in MoneyQuestion]?: keyof (typeof MONEY_QUESTIONS)[Q] };

export const moneyInput = z
  .object({
    savings: z.enum(['none', 'lt1', '1to2', 'gt2']).optional(),
    firstMonth: z.enum(['no', 'yes']).optional(),
    travelCosts: z.enum(['no', 'partly', 'yes']).optional(),
    bankCard: z.enum(['no', 'yes']).optional(),
  })
  .strict();

/** Tolerant read of the stored answers (unknown keys / options dropped). */
export const readMoney = (v: unknown): MoneyAnswers => {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const [q, table] of Object.entries(MONEY_QUESTIONS)) {
    const opt = o[q];
    if (typeof opt === 'string' && opt in table) out[q] = opt;
  }
  return out as MoneyAnswers;
};

export const moneyPoints = (a: MoneyAnswers) =>
  (Object.keys(MONEY_QUESTIONS) as MoneyQuestion[]).reduce((sum, q) => {
    const opt = a[q] as string | undefined;
    const table = MONEY_QUESTIONS[q] as Record<string, number>;
    return sum + (opt !== undefined && opt in table ? table[opt] : 0);
  }, 0);

export const RECOGNITION_POINTS: Record<string, number> = {
  RECOGNISED: 100,
  NOT_REQUIRED: 100,
  PARTIAL: 70,
  PARTIALLY_RECOGNISED: 70,
  ADAPTATION: 70,
  IN_PROGRESS: 50,
  SUBMITTED: 50,
  IN_REVIEW: 50,
  DEFICIT_NOTICE: 50,
  PREPARING: 25,
  NONE: 0,
  REJECTED: 0,
  WITHDRAWN: 0,
};

export type DocState = 'accepted' | 'review' | 'missing';
export type HousingSignal = 'ANMELDUNG_DONE' | 'ARRANGED' | 'OFFERED' | 'CONTRACT' | 'SEARCHING' | 'NONE';

export interface ReadinessFacts {
  german: { profile: string | null; exam: string | null; test: string | null; activeCourse: boolean; examBooked: boolean };
  documents: { hasCase: boolean; approved: boolean; required: DocState[] };
  skills: { cvPercent: number; hasCv: boolean; recognition: string | null };
  housing: { signals: HousingSignal[]; stepsDone: number; stepsTotal: number; approved: boolean };
  money: MoneyAnswers;
}

export interface NextStep {
  key: string;
  to: string;
  /** Points of the total score this step would add (≥ 1). */
  gain: number;
}

export interface PartResult {
  key: PartKey;
  score: number;
  weight: number;
  /** Contribution to the total (score × weight / 100), rounded to one decimal. */
  points: number;
  detail: Record<string, string | number | boolean | null>;
  next: NextStep | null;
}

export interface Readiness {
  score: number;
  parts: PartResult[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const gainOf = (key: PartKey, from: number, to: number) => Math.max(1, Math.round(((clamp(to) - clamp(from)) * WEIGHTS[key]) / 100));

export const languagePart = (f: ReadinessFacts['german']) => {
  const level = bestLevel(f.profile, f.exam, f.test);
  const base = LEVEL_POINTS[level] ?? 0;
  const boost = levelRank(level) < levelRank('B1') && (f.activeCourse || f.examBooked) ? 10 : 0;
  const score = clamp(base + boost);
  const nextLevel = LEVEL_ORDER[Math.min(LEVEL_ORDER.length - 1, levelRank(level) + 1)];
  let next: NextStep | null = null;
  if (score < 100) {
    if (level === 'none' && !f.test) next = { key: 'placementTest', to: '/account/german', gain: gainOf('language', score, LEVEL_POINTS.A1) };
    else if (!boost && levelRank(level) < levelRank('B1')) next = { key: 'bookCourse', to: '/account/german', gain: gainOf('language', score, base + 10) };
    else next = { key: 'nextLevel', to: '/account/german', gain: gainOf('language', score, LEVEL_POINTS[nextLevel] ?? 100) };
  }
  return { score, detail: { level, nextLevel: score < 100 ? nextLevel : null, boost: boost > 0 }, next };
};

export const documentsPart = (f: ReadinessFacts['documents']) => {
  if (!f.hasCase) return { score: 0, detail: { accepted: 0, review: 0, missing: 0, total: 0 }, next: { key: 'startCase', to: '/account', gain: gainOf('documents', 0, 20) } };
  const accepted = f.required.filter((s) => s === 'accepted').length;
  const review = f.required.filter((s) => s === 'review').length;
  const total = f.required.length;
  const missing = total - accepted - review;
  const score = f.approved ? 100 : total ? clamp(((accepted + 0.6 * review) / total) * 100) : 0;
  let next: NextStep | null = null;
  if (score < 100 && total) {
    next = missing
      ? { key: 'uploadMissing', to: '/account/checklist', gain: gainOf('documents', score, ((accepted + 0.6 * (review + missing)) / total) * 100) }
      : { key: 'waitReview', to: '/account/checklist', gain: gainOf('documents', score, 100) };
  } else if (score < 100) next = { key: 'waitRequirements', to: '/account/checklist', gain: gainOf('documents', score, 20) };
  return { score, detail: { accepted, review, missing, total }, next };
};

export const skillsPart = (f: ReadinessFacts['skills']) => {
  const cv = clamp(f.cvPercent);
  const rec = RECOGNITION_POINTS[f.recognition ?? 'NONE'] ?? 0;
  const score = clamp(cv * 0.6 + rec * 0.4);
  let next: NextStep | null = null;
  if (cv < 80) next = { key: f.hasCv ? 'completeCv' : 'createCv', to: '/account/cv', gain: gainOf('skills', score, 100 * 0.6 + rec * 0.4) };
  else if (rec < 100) next = { key: rec === 0 ? 'checkRecognition' : 'followRecognition', to: '/anerkennung', gain: gainOf('skills', score, cv * 0.6 + Math.min(100, Math.max(rec, 50)) * 0.4) };
  else if (cv < 100) next = { key: 'completeCv', to: '/account/cv', gain: gainOf('skills', score, 100) };
  return { score, detail: { cv, recognition: f.recognition ?? 'NONE', recognitionPoints: rec }, next };
};

const SIGNAL_POINTS: Record<HousingSignal, number> = { ANMELDUNG_DONE: 100, ARRANGED: 80, OFFERED: 60, CONTRACT: 60, SEARCHING: 30, NONE: 0 };

export const housingPart = (f: ReadinessFacts['housing']) => {
  const steps = f.stepsTotal ? (Math.min(f.stepsDone, f.stepsTotal) / f.stepsTotal) * 50 : 0;
  const score = clamp(Math.max(steps, ...f.signals.map((s) => SIGNAL_POINTS[s])));
  let next: NextStep | null = null;
  if (score < 100) {
    if (!f.approved) next = { key: 'learnHousing', to: '/account/housing', gain: gainOf('housing', score, Math.max(score, 25)) };
    else if (score >= 80) next = { key: 'anmeldung', to: '/account/housing', gain: gainOf('housing', score, 100) };
    else next = { key: 'findHousing', to: '/account/housing', gain: gainOf('housing', score, 80) };
  }
  return { score, detail: { stepsDone: f.stepsDone, stepsTotal: f.stepsTotal, best: f.signals.length ? f.signals.reduce((a, s) => (SIGNAL_POINTS[s] > SIGNAL_POINTS[a] ? s : a), 'NONE' as HousingSignal) : 'NONE' }, next };
};

export const moneyPart = (a: MoneyAnswers) => {
  const answered = (Object.keys(MONEY_QUESTIONS) as MoneyQuestion[]).filter((q) => a[q] !== undefined).length;
  const score = clamp(moneyPoints(a));
  let next: NextStep | null = null;
  if (answered < 4) next = { key: 'selfCheck', to: '/account/readiness#money', gain: gainOf('money', score, Math.max(score, 50)) };
  else if (a.firstMonth !== 'yes') next = { key: 'planBudget', to: '/account/budget', gain: gainOf('money', score, score + 25) };
  else if (score < 100) next = { key: 'save', to: '/account/budget', gain: gainOf('money', score, 100) };
  return { score, detail: { answered }, next };
};

export const computeReadiness = (f: ReadinessFacts): Readiness => {
  const raw: Record<PartKey, { score: number; detail: PartResult['detail']; next: NextStep | null }> = {
    language: languagePart(f.german),
    documents: documentsPart(f.documents),
    skills: skillsPart(f.skills),
    housing: housingPart(f.housing),
    money: moneyPart(f.money),
  };
  const parts = PARTS.map((key): PartResult => ({
    key,
    score: raw[key].score,
    weight: WEIGHTS[key],
    points: Math.round((raw[key].score * WEIGHTS[key]) / 10) / 10,
    detail: raw[key].detail,
    next: raw[key].next,
  }));
  return { score: clamp(parts.reduce((s, p) => s + (p.score * p.weight) / 100, 0)), parts };
};
