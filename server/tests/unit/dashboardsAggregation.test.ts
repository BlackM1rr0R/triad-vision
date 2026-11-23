import { describe, expect, it } from 'vitest';
import { heatBucketOf, pipelineSteps, stageHeatmap } from '../../src/lib/bizAnalytics/compute.js';
import { expectedVsReceived } from '../../src/lib/salesAnalytics/compute.js';
import { lastMonths, partnerTrend } from '../../src/lib/partnerPortal/trend.js';

const at = (s: string) => new Date(`${s}T08:00:00Z`);
const DAY = 24 * 60 * 60 * 1000;

describe('pipeline funnel (registration → documents → contract → embassy → visa)', () => {
  it('counts "reached or beyond" with conversion and drop-off', () => {
    // no case, docs review, contract signed, embassy review, approved
    const steps = pipelineSteps([null, 1, 3, 4, 7]);
    expect(steps.map((s) => s.count)).toEqual([5, 4, 3, 2, 1]);
    expect(steps.map((s) => s.dropped)).toEqual([0, 1, 1, 1, 1]);
    expect(steps[0].ofFirst).toBe(100);
    expect(steps[2].rate).toBe(75);
    expect(steps[4].ofFirst).toBe(20);
  });
  it('handles an empty cohort', () => {
    const steps = pipelineSteps([]);
    expect(steps.every((s) => s.count === 0 && s.dropped === 0)).toBe(true);
    expect(steps[0].ofFirst).toBeNull();
  });
});

describe('stage heatmap', () => {
  const now = at('2026-11-20');
  it('puts waiting days into buckets', () => {
    expect(heatBucketOf(0)).toBe('d7');
    expect(heatBucketOf(6.9)).toBe('d7');
    expect(heatBucketOf(7)).toBe('d14');
    expect(heatBucketOf(29.9)).toBe('d30');
    expect(heatBucketOf(30)).toBe('d60');
    expect(heatBucketOf(400)).toBe('d60plus');
  });
  it('counts open cases per stage and bucket, stuck = 30+ days', () => {
    const open = [
      { status: 'DOCUMENTS_PENDING' as const, since: new Date(now.getTime() - 2 * DAY) },
      { status: 'DOCUMENTS_PENDING' as const, since: new Date(now.getTime() - 45 * DAY) },
      { status: 'DOCUMENTS_PENDING' as const, since: new Date(now.getTime() - 90 * DAY) },
      { status: 'DECISION_PENDING' as const, since: new Date(now.getTime() - 10 * DAY) },
    ];
    const h = stageHeatmap(open, now);
    const docs = h.rows.find((r) => r.stage === 'DOCUMENTS_PENDING')!;
    expect(docs.total).toBe(3);
    expect(docs.counts).toMatchObject({ d7: 1, d60: 1, d60plus: 1 });
    expect(docs.stuck).toBe(2);
    expect(h.totalOpen).toBe(4);
    expect(h.totalStuck).toBe(2);
    expect(h.max).toBe(1);
  });
});

describe('expected vs received by month', () => {
  it('counts only rows inside each window and aligns the previous period', () => {
    const cur = { start: new Date('2026-10-01T00:00:00+04:00'), end: new Date('2026-12-01T00:00:00+04:00') };
    const prev = { start: new Date('2026-08-01T00:00:00+04:00'), end: new Date('2026-10-01T00:00:00+04:00') };
    const due = [
      { at: at('2026-10-10'), cents: 1000 },
      { at: at('2026-11-10'), cents: 500 },
      { at: at('2026-09-10'), cents: 700 },
      { at: at('2027-01-10'), cents: 9999 }, // outside both windows
    ];
    const r = expectedVsReceived(['2026-10', '2026-11'], ['2026-08', '2026-09'], due, { cur: [800, 0], prev: [0, 300] }, cur, prev);
    expect(r.expected).toEqual([1000, 500]);
    expect(r.prevExpected).toEqual([0, 700]);
    expect(r.prevReceived).toEqual([0, 300]);
    expect(r.totals).toEqual({ expected: 1500, received: 800, prevExpected: 700, prevReceived: 300 });
  });
});

describe('partner monthly trend', () => {
  const now = at('2026-11-20');
  it('lists the last months oldest first', () => {
    expect(lastMonths(now, 3)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(lastMonths(at('2026-02-10'), 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
  it('counts new clients (first case), cases and granted visas per month', () => {
    const t = partnerTrend(
      [
        { clientId: 'a', createdAt: at('2026-09-05'), status: 'APPROVED', decisionAt: at('2026-10-20') },
        { clientId: 'a', createdAt: at('2026-10-05'), status: 'DOCUMENTS_PENDING', decisionAt: null },
        { clientId: 'b', createdAt: at('2026-10-06'), status: 'REJECTED', decisionAt: at('2026-11-01') },
        { clientId: 'c', createdAt: at('2024-01-01'), status: 'APPROVED', decisionAt: at('2024-02-01') }, // outside
      ],
      now,
      3,
    );
    expect(t.months).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(t.clients).toEqual([1, 1, 0]);
    expect(t.cases).toEqual([1, 2, 0]);
    expect(t.approved).toEqual([0, 1, 0]);
  });
});
