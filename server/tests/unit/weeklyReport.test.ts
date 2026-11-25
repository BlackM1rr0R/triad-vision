import { describe, expect, it } from 'vitest';
import { delta, isoWeekKey, isSendTime, previousWeek, reminderKey, reportWeek } from '../../src/lib/weeklyReport/kpis.js';
import { fmtDelta } from '../../src/lib/weeklyReport/pdf.js';

describe('weekly report: week window and idempotency key', () => {
  it('reports the last complete Berlin week (Mon 00:00 to Mon 00:00)', () => {
    // Monday 2026-11-23 08:00 Berlin (07:00 UTC, winter time) -> week 2026-11-16 .. 2026-11-23
    const w = reportWeek(new Date('2026-11-23T07:00:00Z'));
    expect(w.key).toBe('2026-W47');
    expect(w.start.toISOString()).toBe('2026-11-15T23:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-11-22T23:00:00.000Z');
    expect(reminderKey(w.key)).toBe('weekly-report:2026-W47');
  });

  it('the same week key all week long, and the next one on the next Monday', () => {
    expect(reportWeek(new Date('2026-11-23T07:00:00Z')).key).toBe(reportWeek(new Date('2026-11-29T20:00:00Z')).key);
    expect(reportWeek(new Date('2026-11-30T07:00:00Z')).key).toBe('2026-W48');
  });

  it('handles summer time (CEST) and the year boundary', () => {
    const w = reportWeek(new Date('2026-07-06T06:00:00Z'));
    expect(w.start.toISOString()).toBe('2026-06-28T22:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-07-05T22:00:00.000Z');
    expect(isoWeekKey(2026, 12, 31)).toBe('2026-W53');
    expect(isoWeekKey(2027, 1, 3)).toBe('2026-W53');
    expect(isoWeekKey(2027, 1, 4)).toBe('2027-W01');
  });

  it('previousWeek ends where the report week starts', () => {
    const w = reportWeek(new Date('2026-11-23T07:00:00Z'));
    const p = previousWeek(w);
    expect(p.end.getTime()).toBe(w.start.getTime());
    expect(p.key).toBe('2026-W46');
    expect(p.start.toISOString()).toBe('2026-11-08T23:00:00.000Z');
  });

  it('sends on Monday from 07:00 Berlin only', () => {
    expect(isSendTime(new Date('2026-11-23T05:59:00Z'))).toBe(false); // 06:59 Berlin
    expect(isSendTime(new Date('2026-11-23T06:00:00Z'))).toBe(true); // 07:00 Berlin
    expect(isSendTime(new Date('2026-11-24T08:00:00Z'))).toBe(false); // Tuesday
  });
});

describe('weekly report: deltas', () => {
  it('computes difference and percent (null from zero)', () => {
    expect(delta(12, 10)).toEqual({ diff: 2, percent: 20 });
    expect(delta(5, 10)).toEqual({ diff: -5, percent: -50 });
    expect(delta(3, 0)).toEqual({ diff: 3, percent: null });
    expect(fmtDelta(12, 10)).toBe('+2 (+20 %)');
    expect(fmtDelta(0, 0)).toBe('0');
  });
});
