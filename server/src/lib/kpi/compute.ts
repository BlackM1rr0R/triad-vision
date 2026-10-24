import type { CaseStatus } from '@prisma/client';
import { bakuMidnight, bakuParts } from '../reports/dates.js';
import { averageRatings, npsOf, RATING_KEYS } from '../surveys/nps.js';

/**
 * Pure maths of the staff KPI card (no database access, unit tested). Months are Baku calendar months
 * ("2026-10"); every metric is computed per staff member and month from rows the service loads.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const pad = (n: number) => String(n).padStart(2, '0');

/** Statuses a case passes through before a decision (time per stage is measured for these). */
export const STAGE_STATUSES = [
  'DOCUMENTS_PENDING',
  'DOCUMENTS_REVIEW',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'EMBASSY_DOCUMENTS',
  'EMBASSY_REVIEW',
  'APPOINTMENT_SCHEDULED',
  'DECISION_PENDING',
] as const satisfies readonly CaseStatus[];
export type StageStatus = (typeof STAGE_STATUSES)[number];

// ─── Months ─────────────────────────────────────────────────────────────

export const monthOf = (d: Date) => {
  const p = bakuParts(d);
  return `${p.y}-${pad(p.m + 1)}`;
};

/** [start, end) instants of a Baku month "YYYY-MM". */
export const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return { start: bakuMidnight(y, m - 1, 1), end: bakuMidnight(y, m, 1) };
};

/** The `n` months ending with `last` (oldest first). */
export const monthsEnding = (last: string, n: number) => {
  const [y, m] = last.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  }
  return out;
};

export const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

// ─── Metrics ────────────────────────────────────────────────────────────

export interface KpiMetrics {
  closed: number;
  approved: number;
  rejected: number;
  cancelled: number;
  /** New cases that came to the staff member this month (assignment changes + new cases they own). */
  assigned: number;
  /** Average days created → decision of the cases decided this month (approved / rejected). */
  avgCaseDays: number | null;
  /** Average days per status of the cases closed this month (from the status timeline). */
  stageDays: Partial<Record<StageStatus, number>>;
  docsReviewed: number;
  docsAccepted: number;
  docsRejected: number;
  /** Average hours from a client message to the first team reply written by this staff member. */
  avgFirstResponseHours: number | null;
  responses: number;
  /** Average of the survey ratings (1–5) and NPS (−100…100) of the surveys answered this month. */
  csat: number | null;
  nps: number | null;
  surveys: number;
  /** Lifetime revenue / margin (EUR cents) of the cases closed this month. */
  revenueCents: number;
  marginCents: number;
  minutes: number;
  tasksDone: number;
  tasksOverdue: number;
  /** Four-eyes checks of embassy packages decided by this staff member (as the second person). */
  approvalsGiven: number;
}

export const emptyMetrics = (): KpiMetrics => ({
  closed: 0,
  approved: 0,
  rejected: 0,
  cancelled: 0,
  assigned: 0,
  avgCaseDays: null,
  stageDays: {},
  docsReviewed: 0,
  docsAccepted: 0,
  docsRejected: 0,
  avgFirstResponseHours: null,
  responses: 0,
  csat: null,
  nps: null,
  surveys: 0,
  revenueCents: 0,
  marginCents: 0,
  minutes: 0,
  tasksDone: 0,
  tasksOverdue: 0,
  approvalsGiven: 0,
});

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// ─── Time per stage ─────────────────────────────────────────────────────

export interface StatusEvent {
  createdAt: Date;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus | null;
}

/**
 * Days spent in each status, from the case's status changes (events sorted or not). The case starts in
 * DOCUMENTS_PENDING at `createdAt` unless the first change says otherwise; a status visited twice adds up.
 * The final status (closing) is not measured; changes after `endAt` (a reopened case) are ignored.
 */
export const stageDurations = (createdAt: Date, events: StatusEvent[], endAt?: Date | null): Partial<Record<StageStatus, number>> => {
  const changes = events.filter((e) => e.toStatus && e.fromStatus !== e.toStatus && (!endAt || e.createdAt <= endAt)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const out: Partial<Record<StageStatus, number>> = {};
  let status: CaseStatus = changes[0]?.fromStatus ?? 'DOCUMENTS_PENDING';
  let since = createdAt.getTime();
  const add = (s: CaseStatus, until: number) => {
    if (!(STAGE_STATUSES as readonly string[]).includes(s) || until <= since) return;
    out[s as StageStatus] = (out[s as StageStatus] ?? 0) + (until - since) / DAY;
  };
  for (const e of changes) {
    add(status, e.createdAt.getTime());
    status = e.toStatus!;
    since = Math.max(since, e.createdAt.getTime());
  }
  if (endAt && !['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) add(status, endAt.getTime());
  return out;
};

/** Average per stage over several cases (cases that never visited a stage do not count for it). */
export const averageStages = (list: Partial<Record<StageStatus, number>>[]) => {
  const out: Partial<Record<StageStatus, number>> = {};
  for (const s of STAGE_STATUSES) {
    const xs = list.map((x) => x[s]).filter((v): v is number => typeof v === 'number');
    const m = mean(xs);
    if (m !== null) out[s] = round1(m);
  }
  return out;
};

// ─── First response ─────────────────────────────────────────────────────

export interface MessageRow {
  caseId: string;
  authorId: string;
  clientId: string;
  createdAt: Date;
}

/**
 * First replies to client messages: for every run of client messages, the first later message by someone
 * else on the same case answers it; the wait counts from the FIRST message of the run. Returns one row per
 * answered run, attributed to whoever replied.
 */
export const firstResponses = (rows: MessageRow[]) => {
  const byCase = new Map<string, MessageRow[]>();
  for (const r of rows) byCase.set(r.caseId, [...(byCase.get(r.caseId) ?? []), r]);
  const out: { responderId: string; at: Date; hours: number }[] = [];
  for (const list of byCase.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let waitingSince: Date | null = null;
    for (const m of list) {
      if (m.authorId === m.clientId) {
        waitingSince ??= m.createdAt;
      } else if (waitingSince) {
        out.push({ responderId: m.authorId, at: m.createdAt, hours: (m.createdAt.getTime() - waitingSince.getTime()) / HOUR });
        waitingSince = null;
      }
    }
  }
  return out;
};

// ─── Surveys ────────────────────────────────────────────────────────────

/** CSAT = mean of each survey's average rating (1–5, one decimal); NPS from the 0–10 scores. */
export const surveyScores = (rows: { score: number | null; ratings: unknown }[]) => {
  const perSurvey = rows
    .map((r) => {
      const avg = averageRatings([r.ratings]);
      return mean(RATING_KEYS.map((k) => avg[k]).filter((v): v is number => v !== null));
    })
    .filter((v): v is number => v !== null);
  const csat = mean(perSurvey);
  return { csat: csat === null ? null : round1(csat), nps: npsOf(rows.map((r) => r.score)).score, surveys: rows.length };
};

// ─── Comparison ─────────────────────────────────────────────────────────

export const NUMERIC_KEYS = [
  'closed',
  'approved',
  'rejected',
  'cancelled',
  'assigned',
  'avgCaseDays',
  'docsReviewed',
  'avgFirstResponseHours',
  'responses',
  'csat',
  'nps',
  'surveys',
  'revenueCents',
  'marginCents',
  'minutes',
  'tasksDone',
  'tasksOverdue',
  'approvalsGiven',
] as const satisfies readonly (keyof KpiMetrics)[];
export type NumericKey = (typeof NUMERIC_KEYS)[number];

/** Change from the previous value: absolute difference and percent (null when there is nothing to compare). */
export const delta = (current: number | null, previous: number | null) => {
  if (current === null || previous === null) return { diff: null, pct: null };
  const diff = round1(current - previous);
  return { diff, pct: previous !== 0 ? Math.round(((current - previous) / Math.abs(previous)) * 100) : null };
};

export const deltas = (current: KpiMetrics, previous: KpiMetrics) =>
  Object.fromEntries(NUMERIC_KEYS.map((k) => [k, delta(current[k], previous[k])])) as Record<NumericKey, { diff: number | null; pct: number | null }>;

/** Team average per metric: counts over everyone, averages only over people who have a value. */
export const teamAverage = (list: KpiMetrics[]): KpiMetrics => {
  const out = emptyMetrics();
  if (!list.length) return out;
  for (const k of NUMERIC_KEYS) {
    const values = list.map((m) => m[k]).filter((v): v is number => v !== null);
    const nullable = ['avgCaseDays', 'avgFirstResponseHours', 'csat', 'nps'].includes(k);
    const m = nullable ? mean(values) : values.reduce((a, b) => a + b, 0) / list.length;
    (out as unknown as Record<string, number | null>)[k] = m === null ? null : k.endsWith('Cents') ? Math.round(m) : round1(m);
  }
  out.stageDays = averageStages(list.map((m) => m.stageDays));
  return out;
};

