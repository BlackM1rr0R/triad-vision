import type { VisaType } from '@prisma/client';
import { bakuMidnight, bakuParts } from '../reports/dates.js';

/**
 * Quarterly "Azerbaijan → Germany labour mobility report": pure aggregation (unit-tested). ./service.ts loads the
 * rows, ./pdf.ts draws the result. Privacy rule (k-anonymity, K_MIN = 3): no figure that leaves this module
 * describes fewer than three distinct cases.
 *  - Totals below 3 become null ("fewer than 3").
 *  - Breakdown buckets below 3 are merged into "other"; when the merged bucket is itself below 3 it is dropped
 *    (`suppressed: true`) — the reader only learns that "a few" cases are not shown.
 *  - Processing times per stage only with ≥ 3 samples.
 *  - Trends only when both quarters have ≥ 3 cases.
 */

export const K_MIN = 3;

export const STAGES = ['documents', 'contract', 'embassy', 'decision', 'total'] as const;
export type ReportStage = (typeof STAGES)[number];

export const DIMENSIONS = ['profession', 'visaType', 'state', 'germanLevel'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** Key for rows whose value is unknown (no profession recognised, no employer city …). */
export const UNSPECIFIED = 'unspecified';
/** Key of the merged bucket of small groups. */
export const OTHER = 'other';

export interface ReportCase {
  id: string;
  visaType: VisaType;
  /** canonical profession key (lib/matching.ts) or null */
  profession: string | null;
  /** federal state code (BY, NW …) or null */
  state: string | null;
  /** none | A1 … C2 or null */
  germanLevel: string | null;
  /** stage durations in days (missing = not measurable) */
  samples: Partial<Record<ReportStage, number>>;
}

export interface Bucket {
  key: string;
  count: number;
}

export interface Breakdown {
  /** buckets with ≥ K_MIN cases, largest first; may end with the merged "other" bucket */
  buckets: Bucket[];
  /** some cases are not shown because even merged they are fewer than K_MIN */
  suppressed: boolean;
}

export interface StageStat {
  /** days, one decimal */
  mean: number;
  median: number;
  n: number;
}

export interface QuarterStats {
  version: 1;
  year: number;
  quarter: number;
  /** ISO instants of the quarter (Baku time boundaries) */
  from: string;
  to: string;
  generatedAt: string;
  /** approved visas (main applicants); null = fewer than K_MIN */
  approved: number | null;
  previous: { year: number; quarter: number; approved: number | null };
  /** change vs the previous quarter (absolute and percent); null when either side is below K_MIN */
  trend: { delta: number; percent: number | null } | null;
  breakdowns: Record<Dimension, Breakdown>;
  /** previous quarter's breakdowns (same rules) for the per-bucket comparison */
  previousBreakdowns: Record<Dimension, Breakdown>;
  stages: Partial<Record<ReportStage, StageStat>>;
  previousStages: Partial<Record<ReportStage, StageStat>>;
}

// ─── Quarters ─────────────────────────────────────────────────────────

export const quarterRange = (year: number, quarter: number) => ({
  from: bakuMidnight(year, (quarter - 1) * 3, 1),
  to: bakuMidnight(year, quarter * 3, 1),
});

export const previousQuarter = (year: number, quarter: number) => (quarter === 1 ? { year: year - 1, quarter: 4 } : { year, quarter: quarter - 1 });

/** The last fully completed quarter (Baku time) before `now`. */
export const lastCompletedQuarter = (now = new Date()) => {
  const p = bakuParts(now);
  return previousQuarter(p.y, Math.floor(p.m / 3) + 1);
};

export const isValidQuarter = (year: number, quarter: number) => Number.isInteger(year) && year >= 2020 && year <= 2100 && [1, 2, 3, 4].includes(quarter);

// ─── k-anonymity helpers ──────────────────────────────────────────────

/** A count shown only from K_MIN upwards. */
export const safeCount = (n: number, k = K_MIN): number | null => (n >= k ? n : null);

/** Groups values into buckets with the k rule (see the module comment). */
export const kBreakdown = (values: (string | null | undefined)[], k = K_MIN): Breakdown => {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v && v !== OTHER ? v : UNSPECIFIED;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const big: Bucket[] = [];
  let small = 0;
  for (const [key, count] of counts) {
    if (count >= k) big.push({ key, count });
    else small += count;
  }
  big.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  if (small >= k) big.push({ key: OTHER, count: small });
  return { buckets: big, suppressed: small > 0 && small < k };
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** Mean and median of a stage; null below k samples. */
export const stageStat = (values: number[], k = K_MIN): StageStat | null => {
  const xs = values.filter((v) => Number.isFinite(v) && v >= 0);
  if (xs.length < k) return null;
  return { mean: round1(xs.reduce((a, b) => a + b, 0) / xs.length), median: round1(median(xs)), n: xs.length };
};

/** Distinct cases only (a case counted twice would weaken the k rule). */
const distinct = (rows: ReportCase[]) => [...new Map(rows.map((r) => [r.id, r])).values()];

const breakdownsOf = (rows: ReportCase[], k: number): Record<Dimension, Breakdown> => ({
  profession: kBreakdown(rows.map((r) => r.profession), k),
  visaType: kBreakdown(rows.map((r) => r.visaType), k),
  state: kBreakdown(rows.map((r) => r.state), k),
  germanLevel: kBreakdown(rows.map((r) => r.germanLevel), k),
});

const stagesOf = (rows: ReportCase[], k: number) => {
  const out: Partial<Record<ReportStage, StageStat>> = {};
  for (const s of STAGES) {
    const st = stageStat(rows.map((r) => r.samples[s]).filter((v): v is number => v !== undefined), k);
    if (st) out[s] = st;
  }
  return out;
};

export const trendOf = (current: number | null, previous: number | null) => {
  if (current === null || previous === null) return null;
  return { delta: current - previous, percent: previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null };
};

export const buildQuarterStats = (
  input: { year: number; quarter: number; current: ReportCase[]; previous: ReportCase[]; now?: Date },
  k = K_MIN,
): QuarterStats => {
  const cur = distinct(input.current);
  const prev = distinct(input.previous);
  const { from, to } = quarterRange(input.year, input.quarter);
  const pq = previousQuarter(input.year, input.quarter);
  const approved = safeCount(cur.length, k);
  const prevApproved = safeCount(prev.length, k);
  // Below k the whole quarter shows nothing but "fewer than 3": breakdowns of 1–2 cases would identify people.
  const empty: Record<Dimension, Breakdown> = { profession: { buckets: [], suppressed: cur.length > 0 }, visaType: { buckets: [], suppressed: cur.length > 0 }, state: { buckets: [], suppressed: cur.length > 0 }, germanLevel: { buckets: [], suppressed: cur.length > 0 } };
  const emptyPrev: Record<Dimension, Breakdown> = { profession: { buckets: [], suppressed: prev.length > 0 }, visaType: { buckets: [], suppressed: prev.length > 0 }, state: { buckets: [], suppressed: prev.length > 0 }, germanLevel: { buckets: [], suppressed: prev.length > 0 } };
  return {
    version: 1,
    year: input.year,
    quarter: input.quarter,
    from: from.toISOString(),
    to: to.toISOString(),
    generatedAt: (input.now ?? new Date()).toISOString(),
    approved,
    previous: { ...pq, approved: prevApproved },
    trend: trendOf(approved, prevApproved),
    breakdowns: approved === null ? empty : breakdownsOf(cur, k),
    previousBreakdowns: prevApproved === null ? emptyPrev : breakdownsOf(prev, k),
    stages: approved === null ? {} : stagesOf(cur, k),
    previousStages: prevApproved === null ? {} : stagesOf(prev, k),
  };
};

/** Every count in a stats object is ≥ k (used by tests and as a last guard before publishing). */
export const satisfiesK = (s: QuarterStats, k = K_MIN) => {
  const ok = (n: number | null) => n === null || n >= k;
  if (!ok(s.approved) || !ok(s.previous.approved)) return false;
  for (const set of [s.breakdowns, s.previousBreakdowns]) for (const d of DIMENSIONS) if (set[d].buckets.some((b) => b.count < k)) return false;
  for (const set of [s.stages, s.previousStages]) for (const st of Object.values(set)) if (st && st.n < k) return false;
  return true;
};
