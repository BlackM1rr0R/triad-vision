import { z } from 'zod';
import { prisma } from '../../db.js';
import { GROWTH_SETTING_KEYS, readSetting } from './settings.js';

/**
 * "When can I start working in Germany?" — the start-date estimate of the public calculator.
 *
 * Model (all durations in weeks, each a [min, max] range from the admin settings):
 *   track 1  language learning (current level → the category's level, weeks per level step)
 *   track 2  documents & translations → diploma recognition (Anerkennung, when needed)
 *   track 3  documents & translations → employer matching (≈ 0 with a job offer)
 *   then, one after another: embassy appointment wait → visa processing (VisaCategory.processingMin/Max,
 *   fallback from the settings) → travel / start.
 * The three preparation tracks run in parallel; the embassy part starts when the longest one ends.
 * The min scenario uses every minimum, the max scenario every maximum. Indicative only.
 */

export const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type Level = (typeof LEVELS)[number];
/** Levels the visitor can pick as "my German now". */
export const INPUT_LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2'] as const;
export const DOC_STATES = ['none', 'some', 'all'] as const;
export type DocState = (typeof DOC_STATES)[number];

export const STAGE_KEYS = ['language', 'documents', 'recognition', 'matching', 'embassy', 'processing', 'travel'] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export type Range = [number, number];
const weeks = z.number().int().min(0).max(260);
const range = z.tuple([weeks, weeks]).refine(([a, b]) => a <= b, 'MIN_GREATER_THAN_MAX');

export const calculatorSchema = z.object({
  enabled: z.boolean().default(true),
  /** Weeks to reach each level from the one below (A1 = from zero to A1). */
  weeksPerLevel: z.object({ A1: range, A2: range, B1: range, B2: range, C1: range }),
  documents: z.object({ none: range, some: range, all: range }),
  recognition: range,
  matching: z.object({ withOffer: range, withoutOffer: range }),
  embassyWait: range,
  /** Used when the visa category has no processingMin / processingMax. */
  processingFallback: range,
  travel: range,
  /** Per visa category slug: is diploma recognition needed by default? (missing = heuristic from the visa label) */
  recognitionBySlug: z.record(z.string().max(120), z.boolean()).default({}),
  /** "Verify" note for the team: when and by whom the assumptions were last checked. */
  verifiedAt: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(''),
  verifiedNote: z.string().trim().max(1000).default(''),
});
export type CalculatorSettings = z.infer<typeof calculatorSchema>;

/** Starting assumptions — to be verified by the team (Admin → Sayt alətləri → Kalkulyator). */
export const CALCULATOR_DEFAULTS: CalculatorSettings = {
  enabled: true,
  weeksPerLevel: { A1: [6, 10], A2: [6, 10], B1: [8, 14], B2: [10, 16], C1: [12, 20] },
  documents: { none: [4, 8], some: [2, 5], all: [1, 2] },
  recognition: [8, 16],
  matching: { withOffer: [0, 1], withoutOffer: [4, 12] },
  embassyWait: [4, 12],
  processingFallback: [4, 12],
  travel: [1, 3],
  recognitionBySlug: {},
  verifiedAt: '',
  verifiedNote: '',
};

export const getCalculatorSettings = () => readSetting(GROWTH_SETTING_KEYS.calculator, calculatorSchema, CALCULATOR_DEFAULTS);

/** First CEFR level named in a free-text level ("B1", "A2–B1", "B1 (Pflege)") → our ladder; null = none needed. */
export const parseLevel = (raw: string | null | undefined): Level | null => {
  const m = /\b(A1|A2|B1|B2|C1|C2)\b/i.exec(raw ?? '');
  if (!m) return null;
  const l = m[1].toUpperCase();
  return (l === 'C2' ? 'C1' : l) as Level;
};

/** Language weeks from `from` up to `to` (sum of the level steps in between). */
export const languageWeeks = (from: Level, to: Level | null, perLevel: CalculatorSettings['weeksPerLevel']): Range => {
  if (!to) return [0, 0];
  const a = LEVELS.indexOf(from);
  const b = LEVELS.indexOf(to);
  let min = 0;
  let max = 0;
  for (let i = a + 1; i <= b; i++) {
    const [lo, hi] = perLevel[LEVELS[i] as Exclude<Level, 'A0'>];
    min += lo;
    max += hi;
  }
  return [min, max];
};

/** Heuristic default: skilled-worker visas based on a qualification (§18a, §18b, Blue Card, §16d) need recognition. */
export const recognitionDefault = (cat: { slug: string; visaLabel: string }, settings: CalculatorSettings) => {
  const override = settings.recognitionBySlug[cat.slug];
  if (typeof override === 'boolean') return override;
  return /18\s*a|18\s*b|16\s*d|blue\s*card/i.test(cat.visaLabel);
};

export interface EstimateInput {
  category: { id: string; slug: string; visaLabel: string; germanLevel: string | null; processingMin: number | null; processingMax: number | null };
  level: Level;
  documents: DocState;
  /** undefined = the category default */
  recognition?: boolean;
  jobOffer: boolean;
  today?: Date;
}

export interface Stage {
  key: StageKey;
  weeks: Range;
  /** start week in the min / max scenario */
  start: Range;
  end: Range;
  /** runs in parallel with other preparation stages */
  parallel: boolean;
  skipped: boolean;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const estimate = (input: EstimateInput, settings: CalculatorSettings) => {
  const target = parseLevel(input.category.germanLevel);
  const needsRecognition = input.recognition ?? recognitionDefault(input.category, settings);
  const lang = languageWeeks(input.level, target, settings.weeksPerLevel);
  const docs = settings.documents[input.documents];
  const rec: Range = needsRecognition ? settings.recognition : [0, 0];
  const match = input.jobOffer ? settings.matching.withOffer : settings.matching.withoutOffer;
  const processing: Range =
    input.category.processingMin != null && input.category.processingMax != null && input.category.processingMin <= input.category.processingMax
      ? [input.category.processingMin, input.category.processingMax]
      : settings.processingFallback;

  const at = (i: 0 | 1) => {
    const docsEnd = docs[i];
    const prepEnd = Math.max(lang[i], docsEnd + rec[i], docsEnd + match[i]);
    const embassyEnd = prepEnd + settings.embassyWait[i];
    const processingEnd = embassyEnd + processing[i];
    return { docsEnd, prepEnd, embassyEnd, processingEnd, travelEnd: processingEnd + settings.travel[i] };
  };
  const lo = at(0);
  const hi = at(1);
  const stage = (key: StageKey, w: Range, start: Range, parallel: boolean, skipped = false): Stage => ({
    key,
    weeks: w,
    start,
    end: [start[0] + w[0], start[1] + w[1]],
    parallel,
    skipped,
  });
  const stages: Stage[] = [
    stage('language', lang, [0, 0], true, lang[1] === 0),
    stage('documents', docs, [0, 0], true),
    stage('recognition', rec, [lo.docsEnd, hi.docsEnd], true, !needsRecognition),
    stage('matching', match, [lo.docsEnd, hi.docsEnd], true),
    stage('embassy', settings.embassyWait, [lo.prepEnd, hi.prepEnd], false),
    stage('processing', processing, [lo.embassyEnd, hi.embassyEnd], false),
    stage('travel', settings.travel, [lo.processingEnd, hi.processingEnd], false),
  ];
  const today = input.today ?? new Date();
  const total: Range = [lo.travelEnd, hi.travelEnd];
  return {
    targetLevel: target,
    recognition: needsRecognition,
    stages,
    totalWeeks: total,
    earliest: new Date(today.getTime() + total[0] * WEEK_MS).toISOString(),
    latest: new Date(today.getTime() + total[1] * WEEK_MS).toISOString(),
  };
};

/** Published visa categories with the fields the calculator needs (+ the recognition default). */
export const calculatorCategories = async (settings: CalculatorSettings) => {
  const cats = await prisma.visaCategory.findMany({
    where: { published: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, slug: true, title: true, visaLabel: true, icon: true, germanLevel: true, processingMin: true, processingMax: true },
  });
  return cats.map((c) => ({ ...c, targetLevel: parseLevel(c.germanLevel), recognitionDefault: recognitionDefault(c, settings) }));
};
