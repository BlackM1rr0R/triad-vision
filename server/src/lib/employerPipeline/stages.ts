import type { CaseStatus } from '@prisma/client';
import type { Stage } from '../requests/workers.js';
import type { Phase } from '../employerWorkers/panel.js';

/**
 * Pure stage and estimate logic of the employer candidate pipeline (/company/pipeline). No database access, so
 * it is unit-tested directly (tests/unit/employerPipeline.test.ts).
 *
 * Pipeline columns (what the worker is currently going through):
 *   CONTRACT     documents + employment contract (case DOCUMENTS / CONTRACT_SENT)
 *   RECOGNITION  recognition of the qualification is still open (only when a RecognitionProcess exists)
 *   EMBASSY      embassy documents are prepared / reviewed (contract signed)
 *   DECISION     visa application lodged: appointment held / decision pending
 *   FLIGHT       visa approved, travel planned or under way
 *   ARRIVED      arrived in Germany, first work day still ahead (or unknown)
 *   FIRST_DAY    first work day reached (shown for KEEP_AFTER_START_DAYS, then the worker only lives in "My workers")
 * Rejected / cancelled cases and workers who left are not part of the pipeline.
 */

const DAY = 24 * 60 * 60 * 1000;

export const PIPELINE_STAGES = ['CONTRACT', 'RECOGNITION', 'EMBASSY', 'DECISION', 'FLIGHT', 'ARRIVED', 'FIRST_DAY'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Typical length of each stage in days (planning values for the estimate when no date is known yet). */
export const TYPICAL_STAGE_DAYS: Record<Exclude<PipelineStage, 'FIRST_DAY'>, number> = {
  CONTRACT: 21,
  RECOGNITION: 90,
  EMBASSY: 28,
  DECISION: 42,
  FLIGHT: 21,
  ARRIVED: 7,
};

/** A stage that already took longer than its typical length still needs at least this many days. */
export const MIN_REMAINING_DAYS = 7;
/** Workers stay on the board this long after the first work day (or after arrival without a known start date). */
export const KEEP_AFTER_START_DAYS = 60;

export interface StageInput {
  /** Stage of lib/requests/workers (DOCUMENTS … ARRIVED, REJECTED, CANCELLED). */
  stage: Stage;
  phase: Phase;
  status: CaseStatus;
  startedAt: Date;
  /** First entry into each worker stage (lib/requests/workers timeline). */
  timeline: { stage: Stage; at: Date }[];
  /** When the case got its current status (last status event, else the case creation). */
  statusSince: Date;
  /** Open recognition procedure of the case (null = none or already decided). */
  recognition: { since: Date } | null;
  arrivedAt: Date | null;
  /** First work day (employer checklist date, else employment contract start). */
  firstWorkDay: Date | null;
  now: Date;
}

const stageAt = (timeline: StageInput['timeline'], ...stages: Stage[]) => timeline.find((t) => stages.includes(t.stage))?.at ?? null;
const later = (a: Date, b: Date | null) => (b && b > a ? b : a);

/** Current pipeline column of a worker, with the moment it entered it; null = not on the board. */
export const resolveStage = (i: StageInput): { stage: PipelineStage; since: Date } | null => {
  if (i.phase === 'LEFT' || i.phase === 'CLOSED' || i.stage === 'REJECTED' || i.stage === 'CANCELLED') return null;
  const keep = (since: Date) => i.now.getTime() - since.getTime() <= KEEP_AFTER_START_DAYS * DAY;

  if (i.phase === 'WORKING' || i.stage === 'ARRIVED' || i.arrivedAt) {
    const arrived = i.arrivedAt ?? stageAt(i.timeline, 'ARRIVED') ?? i.statusSince;
    if (i.firstWorkDay && i.firstWorkDay <= i.now) return keep(i.firstWorkDay) ? { stage: 'FIRST_DAY', since: i.firstWorkDay } : null;
    return i.firstWorkDay || keep(arrived) ? { stage: 'ARRIVED', since: arrived } : null;
  }
  if (i.phase === 'TRAVELLING' || i.stage === 'APPROVED') return { stage: 'FLIGHT', since: stageAt(i.timeline, 'APPROVED') ?? i.statusSince };

  switch (i.stage) {
    case 'DOCUMENTS':
    case 'CONTRACT':
      if (i.status !== 'CONTRACT_SIGNED') return { stage: 'CONTRACT', since: i.startedAt };
      // Contract signed: recognition (if one runs) or the embassy documents come next.
      return i.recognition ? { stage: 'RECOGNITION', since: later(i.statusSince, i.recognition.since) } : { stage: 'EMBASSY', since: i.statusSince };
    case 'EMBASSY': {
      const at = stageAt(i.timeline, 'EMBASSY') ?? i.statusSince;
      return i.recognition ? { stage: 'RECOGNITION', since: later(at, i.recognition.since) } : { stage: 'EMBASSY', since: at };
    }
    case 'APPOINTMENT':
    case 'DECISION':
      return { stage: 'DECISION', since: stageAt(i.timeline, 'APPOINTMENT', 'DECISION') ?? i.statusSince };
    default:
      return null;
  }
};

export const daysBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY));

const BEFORE_ARRIVAL: PipelineStage[] = ['CONTRACT', 'RECOGNITION', 'EMBASSY', 'DECISION', 'FLIGHT'];

/**
 * Estimated arrival from typical stage durations: what is left of the current stage (at least MIN_REMAINING_DAYS)
 * plus every later stage before arrival (recognition only when one is open). A visa decision forecast
 * (`decisionTo`, lib/journey) pushes the estimate to at least that date plus the travel stage.
 * Returns null for stages after arrival.
 */
export const estimateArrival = (o: { stage: PipelineStage; since: Date; now: Date; openRecognition: boolean; decisionTo?: Date | null }): Date | null => {
  const idx = BEFORE_ARRIVAL.indexOf(o.stage);
  if (idx < 0) return null;
  const typ = TYPICAL_STAGE_DAYS[o.stage as Exclude<PipelineStage, 'FIRST_DAY'>];
  const remaining = Math.max(typ - daysBetween(o.since, o.now), MIN_REMAINING_DAYS);
  const rest = BEFORE_ARRIVAL.slice(idx + 1)
    .filter((s) => s !== 'RECOGNITION' || o.openRecognition)
    .reduce((a, s) => a + TYPICAL_STAGE_DAYS[s as Exclude<PipelineStage, 'FIRST_DAY'>], 0);
  let est = o.now.getTime() + (remaining + rest) * DAY;
  if (o.decisionTo && o.stage !== 'FLIGHT') est = Math.max(est, o.decisionTo.getTime() + TYPICAL_STAGE_DAYS.FLIGHT * DAY);
  return new Date(est);
};

export type DateSource = 'ACTUAL' | 'FLIGHT' | 'PLANNED' | 'ESTIMATE';

/** Expected arrival: the actual arrival, else the flight of the arrival plan, else the estimate. */
export const expectedArrival = (o: {
  stage: PipelineStage;
  since: Date;
  now: Date;
  arrivedAt: Date | null;
  flightAt: Date | null;
  openRecognition: boolean;
  decisionTo?: Date | null;
}): { at: Date; source: DateSource } | null => {
  if (o.arrivedAt) return { at: o.arrivedAt, source: 'ACTUAL' };
  if (o.flightAt) return { at: o.flightAt, source: 'FLIGHT' };
  const est = estimateArrival(o);
  return est ? { at: est, source: 'ESTIMATE' } : null;
};

/**
 * Expected first work day: the employer's / contract date when it is not before the (expected) arrival,
 * else arrival + the typical settling-in days (estimate).
 */
export const expectedFirstDay = (firstWorkDay: Date | null, arrival: { at: Date; source: DateSource } | null): { at: Date; source: DateSource } | null => {
  if (firstWorkDay && (!arrival || firstWorkDay >= arrival.at || arrival.source === 'ACTUAL')) return { at: firstWorkDay, source: 'PLANNED' };
  if (!arrival) return null;
  return { at: new Date(arrival.at.getTime() + TYPICAL_STAGE_DAYS.ARRIVED * DAY), source: 'ESTIMATE' };
};

/** "YYYY-MM" in UTC. */
export const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/** Expected arrivals per month, from the current month on (`months` months; earlier arrivals are left out). */
export const arrivalStrip = (cards: { id: string; expectedArrival: { at: Date; source: DateSource } | null }[], now: Date, months = 12) => {
  const out: { month: string; confirmed: number; estimated: number; ids: string[] }[] = [];
  for (let m = 0; m < months; m++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m, 1));
    out.push({ month: monthKey(d), confirmed: 0, estimated: 0, ids: [] });
  }
  const index = new Map(out.map((o, i) => [o.month, i]));
  for (const c of cards) {
    if (!c.expectedArrival) continue;
    const i = index.get(monthKey(c.expectedArrival.at));
    if (i === undefined) continue;
    if (c.expectedArrival.source === 'ESTIMATE') out[i].estimated++;
    else out[i].confirmed++;
    out[i].ids.push(c.id);
  }
  return out;
};
