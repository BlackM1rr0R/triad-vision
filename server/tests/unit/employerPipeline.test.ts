import { describe, expect, it } from 'vitest';
import {
  KEEP_AFTER_START_DAYS,
  MIN_REMAINING_DAYS,
  TYPICAL_STAGE_DAYS,
  arrivalStrip,
  estimateArrival,
  expectedArrival,
  expectedFirstDay,
  resolveStage,
  type StageInput,
} from '../../src/lib/employerPipeline/stages.js';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-15T10:00:00Z');
const ago = (d: number) => new Date(now.getTime() - d * DAY);
const inDays = (d: number) => new Date(now.getTime() + d * DAY);

const base = (over: Partial<StageInput> = {}): StageInput => ({
  stage: 'DOCUMENTS',
  phase: 'IN_PROCESS',
  status: 'DOCUMENTS_PENDING',
  startedAt: ago(30),
  timeline: [{ stage: 'DOCUMENTS', at: ago(30) }],
  statusSince: ago(30),
  recognition: null,
  arrivedAt: null,
  firstWorkDay: null,
  now,
  ...over,
});

describe('employer pipeline: stage of a worker', () => {
  it('documents and an unsigned contract are the contract column, since the case start', () => {
    expect(resolveStage(base())).toEqual({ stage: 'CONTRACT', since: ago(30) });
    expect(resolveStage(base({ stage: 'CONTRACT', status: 'CONTRACT_SENT', statusSince: ago(5) }))).toEqual({ stage: 'CONTRACT', since: ago(30) });
  });

  it('a signed contract moves on to recognition when one is open, else to the embassy documents', () => {
    const signed = base({ stage: 'CONTRACT', status: 'CONTRACT_SIGNED', statusSince: ago(4) });
    expect(resolveStage(signed)).toEqual({ stage: 'EMBASSY', since: ago(4) });
    expect(resolveStage({ ...signed, recognition: { since: ago(20) } })).toEqual({ stage: 'RECOGNITION', since: ago(4) });
    expect(resolveStage({ ...signed, recognition: { since: ago(1) } })).toEqual({ stage: 'RECOGNITION', since: ago(1) });
  });

  it('embassy documents with an open recognition stay in recognition', () => {
    const emb = base({ stage: 'EMBASSY', status: 'EMBASSY_DOCUMENTS', timeline: [{ stage: 'DOCUMENTS', at: ago(60) }, { stage: 'EMBASSY', at: ago(10) }], statusSince: ago(10) });
    expect(resolveStage(emb)).toEqual({ stage: 'EMBASSY', since: ago(10) });
    expect(resolveStage({ ...emb, recognition: { since: ago(40) } })).toEqual({ stage: 'RECOGNITION', since: ago(10) });
  });

  it('appointment and pending decision are the visa decision column', () => {
    const tl = [{ stage: 'DOCUMENTS' as const, at: ago(90) }, { stage: 'APPOINTMENT' as const, at: ago(12) }, { stage: 'DECISION' as const, at: ago(3) }];
    expect(resolveStage(base({ stage: 'DECISION', status: 'DECISION_PENDING', timeline: tl, statusSince: ago(3) }))).toEqual({ stage: 'DECISION', since: ago(12) });
  });

  it('approved visa → flight, arrival → arrived, first work day reached → first day', () => {
    const tl = [{ stage: 'DOCUMENTS' as const, at: ago(120) }, { stage: 'APPROVED' as const, at: ago(6) }];
    expect(resolveStage(base({ stage: 'APPROVED', phase: 'TRAVELLING', status: 'APPROVED', timeline: tl }))).toEqual({ stage: 'FLIGHT', since: ago(6) });
    const arrived = base({ stage: 'ARRIVED', phase: 'WORKING', status: 'APPROVED', timeline: tl, arrivedAt: ago(2) });
    expect(resolveStage(arrived)).toEqual({ stage: 'ARRIVED', since: ago(2) });
    expect(resolveStage({ ...arrived, firstWorkDay: inDays(5) })).toEqual({ stage: 'ARRIVED', since: ago(2) });
    expect(resolveStage({ ...arrived, firstWorkDay: ago(1) })).toEqual({ stage: 'FIRST_DAY', since: ago(1) });
  });

  it('drops closed cases, leavers and workers long past their start', () => {
    expect(resolveStage(base({ stage: 'REJECTED', phase: 'CLOSED', status: 'REJECTED' }))).toBeNull();
    expect(resolveStage(base({ stage: 'CANCELLED', phase: 'CLOSED', status: 'CANCELLED' }))).toBeNull();
    expect(resolveStage(base({ stage: 'ARRIVED', phase: 'LEFT', status: 'APPROVED', arrivedAt: ago(10) }))).toBeNull();
    const working = base({ stage: 'ARRIVED', phase: 'WORKING', status: 'APPROVED', arrivedAt: ago(200) });
    expect(resolveStage({ ...working, firstWorkDay: ago(KEEP_AFTER_START_DAYS + 1) })).toBeNull();
    expect(resolveStage(working)).toBeNull();
  });
});

describe('employer pipeline: expected arrival', () => {
  it('adds what is left of the current stage and the typical later stages', () => {
    const at = estimateArrival({ stage: 'CONTRACT', since: ago(10), now, openRecognition: false })!;
    const days = TYPICAL_STAGE_DAYS.CONTRACT - 10 + TYPICAL_STAGE_DAYS.EMBASSY + TYPICAL_STAGE_DAYS.DECISION + TYPICAL_STAGE_DAYS.FLIGHT;
    expect(at.getTime()).toBe(now.getTime() + days * DAY);
  });

  it('counts recognition only when one is open', () => {
    const without = estimateArrival({ stage: 'CONTRACT', since: now, now, openRecognition: false })!;
    const withRec = estimateArrival({ stage: 'CONTRACT', since: now, now, openRecognition: true })!;
    expect(withRec.getTime() - without.getTime()).toBe(TYPICAL_STAGE_DAYS.RECOGNITION * DAY);
  });

  it('a stage that already took too long still needs the minimum', () => {
    const at = estimateArrival({ stage: 'FLIGHT', since: ago(200), now, openRecognition: false })!;
    expect(at.getTime()).toBe(now.getTime() + MIN_REMAINING_DAYS * DAY);
  });

  it('a later visa decision forecast pushes the estimate', () => {
    const decisionTo = inDays(100);
    const at = estimateArrival({ stage: 'DECISION', since: now, now, openRecognition: false, decisionTo })!;
    expect(at.getTime()).toBe(decisionTo.getTime() + TYPICAL_STAGE_DAYS.FLIGHT * DAY);
    // An earlier forecast does not pull it below the stage estimate.
    const early = estimateArrival({ stage: 'DECISION', since: now, now, openRecognition: false, decisionTo: inDays(1) })!;
    expect(early.getTime()).toBe(now.getTime() + (TYPICAL_STAGE_DAYS.DECISION + TYPICAL_STAGE_DAYS.FLIGHT) * DAY);
  });

  it('no estimate after arrival', () => {
    expect(estimateArrival({ stage: 'ARRIVED', since: now, now, openRecognition: false })).toBeNull();
    expect(estimateArrival({ stage: 'FIRST_DAY', since: now, now, openRecognition: false })).toBeNull();
  });

  it('prefers the actual arrival, then the flight, then the estimate', () => {
    const o = { stage: 'FLIGHT' as const, since: ago(3), now, openRecognition: false };
    expect(expectedArrival({ ...o, arrivedAt: ago(1), flightAt: inDays(3) })).toEqual({ at: ago(1), source: 'ACTUAL' });
    expect(expectedArrival({ ...o, arrivedAt: null, flightAt: inDays(3) })).toEqual({ at: inDays(3), source: 'FLIGHT' });
    expect(expectedArrival({ ...o, arrivedAt: null, flightAt: null })?.source).toBe('ESTIMATE');
  });

  it('first work day: the planned date unless it lies before the expected arrival', () => {
    expect(expectedFirstDay(inDays(20), { at: inDays(10), source: 'FLIGHT' })).toEqual({ at: inDays(20), source: 'PLANNED' });
    expect(expectedFirstDay(inDays(5), { at: inDays(10), source: 'ESTIMATE' })).toEqual({ at: inDays(10 + TYPICAL_STAGE_DAYS.ARRIVED), source: 'ESTIMATE' });
    expect(expectedFirstDay(ago(1), { at: ago(5), source: 'ACTUAL' })).toEqual({ at: ago(1), source: 'PLANNED' });
    expect(expectedFirstDay(null, null)).toBeNull();
  });

  it('groups expected arrivals per month and splits confirmed from estimated', () => {
    const strip = arrivalStrip(
      [
        { id: 'a', expectedArrival: { at: new Date('2026-11-20T10:00:00Z'), source: 'FLIGHT' } },
        { id: 'b', expectedArrival: { at: new Date('2026-11-28T10:00:00Z'), source: 'ESTIMATE' } },
        { id: 'c', expectedArrival: { at: new Date('2027-02-03T10:00:00Z'), source: 'ESTIMATE' } },
        { id: 'd', expectedArrival: { at: new Date('2026-10-01T10:00:00Z'), source: 'ACTUAL' } },
        { id: 'e', expectedArrival: null },
      ],
      now,
      6,
    );
    expect(strip.map((m) => m.month)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
    expect(strip[0]).toEqual({ month: '2026-11', confirmed: 1, estimated: 1, ids: ['a', 'b'] });
    expect(strip[3]).toMatchObject({ confirmed: 0, estimated: 1, ids: ['c'] });
    expect(strip.flatMap((m) => m.ids)).not.toContain('d');
  });
});
