import type { CaseStatus, VisaType } from '@prisma/client';
import { STAGE_STATUSES, stageDurations, type StatusEvent } from '../kpi/compute.js';
import { quantile } from '../journey/forecast.js';
import { canonicalProfession, professionFamily } from '../matching.js';

/**
 * Duration statistics of the "When could I be in Germany?" estimator (/when-in-germany), from our own case history.
 * Pure functions (unit-tested); ./service.ts loads the rows and caches the table once per day.
 *
 * Per estimator stage and group the table keeps only the 25th percentile, the median and the 75th percentile
 * (days) and the sample size — never single cases — and only for groups with at least MIN_GROUP_SAMPLE cases.
 * Groups, most specific first: visa route (VisaType) × profession family (lib/matching.ts), visa route alone,
 * all cases. A stage without a group of that size falls back to the documented estimates in ./estimate.ts.
 *
 * Stage samples per case (status history = CaseEvent fromStatus / toStatus, the KPI's stageDurations rules):
 *  - documents:  DOCUMENTS_PENDING + DOCUMENTS_REVIEW. Three variants for the visitor's documents status:
 *                none = both, some = half the PENDING time + REVIEW, complete = REVIEW only.
 *  - contract:   CONTRACT_SENT + CONTRACT_SIGNED.
 *  - embassy:    EMBASSY_DOCUMENTS + EMBASSY_REVIEW + APPOINTMENT_SCHEDULED (embassy file and waiting for the appointment).
 *  - decision:   DECISION_PENDING (application lodged → decision).
 *  A stage counts only once the case has moved past all its statuses (open stages would understate the time);
 *  cancelled cases are left out (their last stage ends with the cancellation, not with the next step).
 *  - recognition: RecognitionProcess created → decisionAt (recognised, partially recognised or rejected).
 *  - travel:      Case.decisionAt (approved) → ArrivalFollowUp.arrivedAt.
 */

export const MIN_GROUP_SAMPLE = 10;

export const DATA_STAGES = ['documents_none', 'documents_some', 'documents_complete', 'contract', 'embassy', 'decision', 'recognition', 'travel'] as const;
export type DataStage = (typeof DATA_STAGES)[number];

export interface DurationStat {
  /** Days, one decimal. */
  p25: number;
  median: number;
  p75: number;
  /** Cases behind the figures (≥ MIN_GROUP_SAMPLE). */
  n: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** p25 / median / p75 (linear interpolation) of a sample; null below `min` values. */
export const durationStat = (values: number[], min = MIN_GROUP_SAMPLE): DurationStat | null => {
  const xs = values.filter((v) => Number.isFinite(v) && v >= 0);
  if (xs.length < Math.max(1, min)) return null;
  return { p25: round1(quantile(xs, 0.25)), median: round1(quantile(xs, 0.5)), p75: round1(quantile(xs, 0.75)), n: xs.length };
};

/** Order of the case statuses; a final decision is after every stage. */
const RANK = new Map<CaseStatus, number>([...STAGE_STATUSES.map((s, i) => [s, i] as const), ['APPROVED', STAGE_STATUSES.length], ['REJECTED', STAGE_STATUSES.length]]);
const passed = (current: CaseStatus, last: CaseStatus) => (RANK.get(current) ?? -1) > (RANK.get(last) ?? Infinity);

export interface CaseRow {
  createdAt: Date;
  status: CaseStatus;
  visaType: VisaType;
  profession: string;
  events: StatusEvent[];
}

/** Stage durations (days) of one case; stages the case has not finished (or never had) are missing. */
export const caseSamples = (c: CaseRow): Partial<Record<DataStage, number>> => {
  if (c.status === 'CANCELLED') return {};
  const d = stageDurations(c.createdAt, c.events);
  const sum = (ss: CaseStatus[]) => ss.reduce((a, s) => a + (d[s as keyof typeof d] ?? 0), 0);
  const out: Partial<Record<DataStage, number>> = {};
  if (passed(c.status, 'DOCUMENTS_REVIEW')) {
    const pending = d.DOCUMENTS_PENDING ?? 0;
    const review = d.DOCUMENTS_REVIEW ?? 0;
    if (pending + review > 0) {
      out.documents_none = pending + review;
      out.documents_some = pending / 2 + review;
      out.documents_complete = review;
    }
  }
  if (passed(c.status, 'CONTRACT_SIGNED')) {
    const v = sum(['CONTRACT_SENT', 'CONTRACT_SIGNED']);
    if (v > 0) out.contract = v;
  }
  if (passed(c.status, 'APPOINTMENT_SCHEDULED')) {
    const v = sum(['EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED']);
    if (v > 0) out.embassy = v;
  }
  if (passed(c.status, 'DECISION_PENDING')) {
    const v = sum(['DECISION_PENDING']);
    if (v > 0) out.decision = v;
  }
  return out;
};

/** Group keys of a case / visitor, most specific first. */
export const groupKeys = (visaType: VisaType, family: string | null): string[] => [...(family ? [`${visaType}|${family}`] : []), visaType, 'all'];
export type GroupLevel = 'route_profession' | 'route' | 'all';
export const levelOf = (key: string): GroupLevel => (key === 'all' ? 'all' : key.includes('|') ? 'route_profession' : 'route');

export const familyOfProfession = (profession: string | null | undefined) => professionFamily(canonicalProfession(profession));

export interface ExtraRow {
  visaType: VisaType;
  profession: string;
  days: number;
}

export type StatsTable = Record<string, Partial<Record<DataStage, DurationStat>>>;

/** The whole table: every group with every stage that has at least `min` samples (smaller groups are dropped). */
export const buildStatsTable = (input: { cases: CaseRow[]; recognition: ExtraRow[]; travel: ExtraRow[] }, min = MIN_GROUP_SAMPLE): StatsTable => {
  const samples = new Map<string, Partial<Record<DataStage, number[]>>>();
  const push = (visaType: VisaType, profession: string, stage: DataStage, days: number) => {
    for (const key of groupKeys(visaType, familyOfProfession(profession))) {
      const g = samples.get(key) ?? {};
      (g[stage] ??= []).push(days);
      samples.set(key, g);
    }
  };
  for (const c of input.cases) {
    const s = caseSamples(c);
    for (const k of DATA_STAGES) if (s[k] !== undefined) push(c.visaType, c.profession, k, s[k]!);
  }
  for (const r of input.recognition) if (r.days >= 0 && r.days <= 730) push(r.visaType, r.profession, 'recognition', r.days);
  for (const r of input.travel) if (r.days >= 0 && r.days <= 365) push(r.visaType, r.profession, 'travel', r.days);

  const table: StatsTable = {};
  for (const [key, g] of samples) {
    const row: Partial<Record<DataStage, DurationStat>> = {};
    for (const k of DATA_STAGES) {
      const st = durationStat(g[k] ?? [], min);
      if (st) row[k] = st;
    }
    if (Object.keys(row).length) table[key] = row;
  }
  return table;
};

/** The most specific group that has the stage; null = no group with enough cases. */
export const resolveStat = (table: StatsTable, stage: DataStage, visaType: VisaType, family: string | null): { stat: DurationStat; level: GroupLevel } | null => {
  for (const key of groupKeys(visaType, family)) {
    const stat = table[key]?.[stage];
    if (stat) return { stat, level: levelOf(key) };
  }
  return null;
};
