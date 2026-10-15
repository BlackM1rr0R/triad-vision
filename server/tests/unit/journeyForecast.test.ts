import { describe, expect, it } from 'vitest';
import {
  computeForecast,
  DEFAULT_RANGES,
  median,
  parseOverride,
  quantile,
  rangeFromSample,
  resolveRanges,
  STEP_KEYS,
  stepDurations,
  stepOf,
  type Ranges,
} from '../../src/lib/journey/forecast.js';

const DAY = 24 * 60 * 60 * 1000;
const d = (iso: string) => new Date(iso);

const defaults = (): Ranges =>
  Object.fromEntries(STEP_KEYS.map((k) => [k, { minDays: DEFAULT_RANGES[k][0], maxDays: DEFAULT_RANGES[k][1], basedOn: 'default', sample: 0 }])) as Ranges;

describe('forecast math', () => {
  it('median and quantiles', () => {
    expect(median([])).toBe(0);
    expect(median([5])).toBe(5);
    expect(median([1, 9, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(quantile([10, 20, 30, 40, 50], 0.25)).toBe(20);
    expect(quantile([10, 20, 30, 40, 50], 0.75)).toBe(40);
  });

  it('range from a sample spans p25–p75 around the median, at least one day', () => {
    expect(rangeFromSample([10, 12, 14, 20, 30])).toEqual([12, 20]);
    expect(rangeFromSample([0.2, 0.3, 0.4])).toEqual([1, 1]);
    expect(rangeFromSample([7, 7, 7])).toEqual([7, 7]);
  });

  it('maps statuses to steps', () => {
    expect(stepOf('DOCUMENTS_REVIEW')).toBe('DOCUMENTS');
    expect(stepOf('CONTRACT_SIGNED')).toBe('CONTRACT');
    expect(stepOf('EMBASSY_DOCUMENTS')).toBe('EMBASSY');
    expect(stepOf('APPOINTMENT_SCHEDULED')).toBe('APPOINTMENT');
    expect(stepOf('DECISION_PENDING')).toBe('DECISION');
    expect(stepOf('APPROVED')).toBeNull();
    expect(stepOf('CANCELLED')).toBeNull();
  });

  it('measures how long a case spent in each completed step', () => {
    const durations = stepDurations([
      { status: 'DOCUMENTS_PENDING', at: d('2026-01-01') },
      { status: 'DOCUMENTS_REVIEW', at: d('2026-01-05') }, // same step
      { status: 'DOCUMENTS_PENDING', at: d('2026-01-07') }, // changes requested: still the same step
      { status: 'CONTRACT_SENT', at: d('2026-01-11') }, // DOCUMENTS took 10 days
      { status: 'CONTRACT_SIGNED', at: d('2026-01-13') },
      { status: 'EMBASSY_DOCUMENTS', at: d('2026-01-15') }, // CONTRACT took 4 days
      { status: 'EMBASSY_REVIEW', at: d('2026-01-20') },
    ]);
    expect(durations.DOCUMENTS).toBe(10);
    expect(durations.CONTRACT).toBe(4);
    // Current (open) step is not a sample.
    expect(durations.EMBASSY).toBeUndefined();
    expect(durations.APPOINTMENT).toBeUndefined();
  });

  it('counts the final decision as the end of the DECISION step', () => {
    const durations = stepDurations([
      { status: 'DECISION_PENDING', at: d('2026-02-01') },
      { status: 'APPROVED', at: d('2026-02-22') },
    ]);
    expect(durations.DECISION).toBe(21);
  });

  it('resolves ranges: history (category) → history (all) → defaults, override wins', () => {
    const ranges = resolveRanges(
      {
        category: { DOCUMENTS: [8, 10, 12, 14, 20], CONTRACT: [2] },
        all: { CONTRACT: [3, 4, 5, 6, 9], EMBASSY: [1, 2] },
      },
      { APPOINTMENT: [30, 40] },
    );
    expect(ranges.DOCUMENTS).toEqual({ minDays: 10, maxDays: 14, basedOn: 'history', sample: 5 });
    expect(ranges.CONTRACT).toEqual({ minDays: 4, maxDays: 6, basedOn: 'history', sample: 5 });
    expect(ranges.EMBASSY).toEqual({ minDays: 14, maxDays: 28, basedOn: 'default', sample: 0 });
    expect(ranges.APPOINTMENT).toEqual({ minDays: 30, maxDays: 40, basedOn: 'override', sample: 0 });
    expect(ranges.DECISION).toEqual({ minDays: 14, maxDays: 42, basedOn: 'default', sample: 0 });
  });

  it('ignores malformed overrides', () => {
    expect(parseOverride(null)).toBeNull();
    expect(parseOverride('x')).toBeNull();
    expect(parseOverride({ DOCUMENTS: [5, 9], CONTRACT: 'nope', EMBASSY: [1], FOO: [1, 2] })).toEqual({ DOCUMENTS: [5, 9] });
    // max below min is rejected at resolve time
    const r = resolveRanges({ category: {}, all: {} }, { DOCUMENTS: [9, 5] });
    expect(r.DOCUMENTS.basedOn).toBe('default');
  });

  it('projects dates from the current step entry and chains later steps', () => {
    const now = d('2026-03-10T00:00:00Z');
    const f = computeForecast({
      status: 'EMBASSY_DOCUMENTS',
      history: [
        { status: 'DOCUMENTS_PENDING', at: d('2026-02-01T00:00:00Z') },
        { status: 'CONTRACT_SENT', at: d('2026-02-15T00:00:00Z') },
        { status: 'EMBASSY_DOCUMENTS', at: d('2026-03-01T00:00:00Z') },
      ],
      ranges: defaults(),
      now,
    });
    expect(f.currentStep).toBe('EMBASSY');
    expect(f.currentSince).toEqual(d('2026-03-01T00:00:00Z'));
    expect(f.steps.map((s) => s.status)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
    const [docs, , embassy, appointment, decision] = f.steps;
    expect(docs.enteredAt).toEqual(d('2026-02-01T00:00:00Z'));
    expect(docs.leftAt).toEqual(d('2026-02-15T00:00:00Z'));
    // EMBASSY 14–28 days from 1 March → 15–29 March
    expect(embassy.expectedFrom).toEqual(d('2026-03-15T00:00:00Z'));
    expect(embassy.expectedTo).toEqual(d('2026-03-29T00:00:00Z'));
    // APPOINTMENT 21–45 chained
    expect(appointment.expectedFrom).toEqual(new Date(d('2026-03-15T00:00:00Z').getTime() + 21 * DAY));
    expect(appointment.expectedTo).toEqual(new Date(d('2026-03-29T00:00:00Z').getTime() + 45 * DAY));
    // DECISION 14–42 chained → estimatedDecision
    expect(f.estimatedDecision).toEqual({ from: decision.expectedFrom, to: decision.expectedTo });
    expect(decision.expectedFrom).toEqual(new Date(d('2026-03-15T00:00:00Z').getTime() + (21 + 14) * DAY));
    expect(decision.expectedTo).toEqual(new Date(d('2026-03-29T00:00:00Z').getTime() + (45 + 42) * DAY));
  });

  it('never predicts the current step to end in the past', () => {
    const now = d('2026-06-01T00:00:00Z');
    const f = computeForecast({
      status: 'DOCUMENTS_PENDING',
      history: [{ status: 'DOCUMENTS_PENDING', at: d('2026-01-01T00:00:00Z') }],
      ranges: defaults(),
      now,
    });
    const docs = f.steps[0];
    expect(docs.expectedFrom!.getTime()).toBeGreaterThanOrEqual(now.getTime());
    expect(docs.expectedTo!.getTime()).toBeGreaterThan(now.getTime());
  });

  it('marks everything done for a decided case and nothing for a cancelled one', () => {
    const approved = computeForecast({
      status: 'APPROVED',
      history: [
        { status: 'DOCUMENTS_PENDING', at: d('2026-01-01') },
        { status: 'DECISION_PENDING', at: d('2026-02-01') },
        { status: 'APPROVED', at: d('2026-02-20') },
      ],
      ranges: defaults(),
    });
    expect(approved.steps.every((s) => s.status === 'done')).toBe(true);
    expect(approved.estimatedDecision).toBeNull();
    expect(approved.steps[4].enteredAt).toEqual(d('2026-02-01'));
    expect(approved.steps[4].leftAt).toEqual(d('2026-02-20'));

    const cancelled = computeForecast({ status: 'CANCELLED', history: [{ status: 'DOCUMENTS_PENDING', at: d('2026-01-01') }], ranges: defaults() });
    expect(cancelled.steps.every((s) => s.status === 'upcoming' && s.expectedFrom === null)).toBe(true);
    expect(cancelled.estimatedDecision).toBeNull();
  });

  it('restarts the clock of a step the case re-entered (reopen)', () => {
    const now = d('2026-05-02T00:00:00Z');
    const f = computeForecast({
      status: 'EMBASSY_DOCUMENTS',
      history: [
        { status: 'DOCUMENTS_PENDING', at: d('2026-01-01T00:00:00Z') },
        { status: 'EMBASSY_DOCUMENTS', at: d('2026-02-01T00:00:00Z') },
        { status: 'REJECTED', at: d('2026-03-01T00:00:00Z') },
        { status: 'EMBASSY_DOCUMENTS', at: d('2026-05-01T00:00:00Z') },
      ],
      ranges: defaults(),
      now,
    });
    expect(f.currentSince).toEqual(d('2026-05-01T00:00:00Z'));
    expect(f.steps[2].expectedFrom).toEqual(d('2026-05-15T00:00:00Z'));
  });
});
