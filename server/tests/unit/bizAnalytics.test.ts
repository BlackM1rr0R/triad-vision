import { describe, expect, it } from 'vitest';
import type { CaseStatus } from '@prisma/client';
import { bottleneck, caseStageTimes, funnelCohorts, funnelStepOf, monthsIn, perfRow, perfRows, stageStats, type PerfCase } from '../../src/lib/bizAnalytics/compute.js';
import { bizPeriod, bizQuery } from '../../src/lib/bizAnalytics/service.js';

const at = (s: string) => new Date(`${s}T08:00:00Z`); // 12:00 in Baku
const ev = (day: string, fromStatus: CaseStatus | null, toStatus: CaseStatus) => ({ createdAt: at(day), fromStatus, toStatus });
const NOW = at('2026-10-30');

describe('business analytics: months and period', () => {
  it('lists the Baku months of a range', () => {
    expect(monthsIn(new Date('2026-01-01T00:00:00+04:00'), new Date('2026-04-01T00:00:00+04:00'))).toEqual(['2026-01', '2026-02', '2026-03']);
    // 21:00 UTC on 31 Dec is already January in Baku.
    expect(monthsIn(new Date('2025-12-31T21:00:00Z'), new Date('2026-01-02T00:00:00Z'))).toEqual(['2026-01']);
    expect(monthsIn(new Date('2025-11-15T00:00:00Z'), new Date('2026-02-03T00:00:00Z'))).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('defaults to the last 12 months and validates the range', () => {
    expect(bizPeriod({}, NOW)).toMatchObject({ from: '2025-11-01', to: '2026-10-30' });
    expect(bizPeriod({ from: '2026-10-01', to: '2026-10-01' }, NOW).start.toISOString()).toBe('2026-09-30T20:00:00.000Z');
    expect(bizQuery.safeParse({ from: '2026-10-10', to: '2026-10-01' }).success).toBe(false);
    expect(bizQuery.safeParse({ from: '2020-01-01', to: '2026-10-01' }).success).toBe(false);
    expect(bizQuery.safeParse({ from: '2026-02-30' }).success).toBe(false);
    expect(bizQuery.safeParse({ from: '2025-01-01', to: '2026-10-01', visaCategoryId: 'none' }).success).toBe(true);
  });
});

describe('business analytics: time per stage', () => {
  it('measures each stage, adds up repeated visits and keeps the open stage open', () => {
    const t = caseStageTimes(
      at('2026-01-01'),
      [
        { createdAt: new Date(at('2026-01-01').getTime() + 5), fromStatus: null, toStatus: 'DOCUMENTS_PENDING' as const }, // "case created", a few ms later
        ev('2026-01-11', 'DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW'),
        ev('2026-01-13', 'DOCUMENTS_REVIEW', 'DOCUMENTS_PENDING'), // sent back
        ev('2026-01-16', 'DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW'),
        ev('2026-01-18', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT'),
      ],
      at('2026-01-25'),
    );
    expect(t.DOCUMENTS_PENDING).toEqual({ days: 13, exitedAt: at('2026-01-16') });
    expect(t.DOCUMENTS_REVIEW).toEqual({ days: 4, exitedAt: at('2026-01-18') });
    expect(t.CONTRACT_SENT).toEqual({ days: 7, exitedAt: null });
  });

  it('does not measure final statuses', () => {
    const t = caseStageTimes(at('2026-01-01'), [ev('2026-01-03', 'DOCUMENTS_PENDING', 'CANCELLED')], NOW);
    expect(Object.keys(t)).toEqual(['DOCUMENTS_PENDING']);
  });

  it('averages the stages that ended in the period, by month and category, and names the slowest', () => {
    const start = new Date('2026-01-01T00:00:00+04:00');
    const end = new Date('2026-03-01T00:00:00+04:00');
    const s = stageStats(
      [
        { createdAt: at('2026-01-01'), categoryId: 'a', events: [ev('2026-01-05', 'DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW'), ev('2026-02-04', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT')] },
        { createdAt: at('2026-01-10'), categoryId: 'a', events: [ev('2026-01-20', 'DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW')] },
        { createdAt: at('2025-12-01'), categoryId: null, events: [ev('2026-02-15', 'DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW')] },
        // Ended before the period: not counted.
        { createdAt: at('2025-11-01'), categoryId: null, events: [ev('2025-11-03', 'DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW'), ev('2025-12-03', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT')] },
      ],
      start,
      end,
      NOW,
    );
    const pending = s.stages.find((x) => x.stage === 'DOCUMENTS_PENDING')!;
    expect(pending).toMatchObject({ cases: 3, medianDays: 10, avgDays: 30 });
    expect(s.stages.find((x) => x.stage === 'DOCUMENTS_REVIEW')).toMatchObject({ cases: 1, medianDays: 30 });
    expect(s.slowest).toBe('DOCUMENTS_REVIEW');
    expect(s.trend.months).toEqual(['2026-01', '2026-02']);
    expect(s.trend.rows.find((r) => r.stage === 'DOCUMENTS_PENDING')).toEqual({ stage: 'DOCUMENTS_PENDING', medianDays: [7, 76], cases: [2, 1] });
    expect(s.byCategory).toEqual([
      { categoryId: 'a', cases: 2, medianDays: { DOCUMENTS_PENDING: 7, DOCUMENTS_REVIEW: 30 }, totalMedianDays: 37 },
      { categoryId: null, cases: 1, medianDays: { DOCUMENTS_PENDING: 76 }, totalMedianDays: 76 },
    ]);
  });

  it('finds the bottleneck: the stage holding the most case-days now', () => {
    const b = bottleneck(
      [
        { status: 'DOCUMENTS_PENDING', since: at('2026-10-29') },
        { status: 'DOCUMENTS_PENDING', since: at('2026-10-28') },
        { status: 'DOCUMENTS_PENDING', since: at('2026-10-27') },
        { status: 'DECISION_PENDING', since: at('2026-09-30') },
      ],
      { DOCUMENTS_PENDING: 1.5, DECISION_PENDING: 40 },
      NOW,
    );
    expect(b.stage).toBe('DECISION_PENDING');
    expect(b.rows.find((r) => r.stage === 'DOCUMENTS_PENDING')).toEqual({ stage: 'DOCUMENTS_PENDING', open: 3, medianWaitingDays: 2, waitingDays: 6, overTypical: 2 });
    expect(b.rows.find((r) => r.stage === 'DECISION_PENDING')).toMatchObject({ open: 1, waitingDays: 30, overTypical: 0 });
    expect(bottleneck([], {}, NOW).stage).toBeNull();
  });
});

describe('business analytics: performance', () => {
  const pc = (over: Partial<PerfCase>): PerfCase => ({
    clientId: 'c1',
    createdAt: at('2026-01-01'),
    status: 'DOCUMENTS_PENDING',
    processingStage: null,
    decidedAt: null,
    revenueCents: 0,
    commissionCents: 0,
    ...over,
  });

  it('counts approvals, refusals (incl. the team "Ablehnung" mark), processing days and commission share', () => {
    const r = perfRow('p1', 'Partner', [
      pc({ status: 'APPROVED', decidedAt: at('2026-03-02'), revenueCents: 200000, commissionCents: 30000 }), // 60 days
      pc({ status: 'REJECTED', decidedAt: at('2026-02-10'), revenueCents: 100000 }), // 40 days
      pc({ status: 'DECISION_PENDING', processingStage: 'REFUSED', decidedAt: at('2026-01-21') }), // 20 days
      pc({ status: 'CANCELLED' }),
      pc({ clientId: 'c2' }),
    ]);
    expect(r).toMatchObject({ cases: 5, approved: 1, refused: 2, cancelled: 1, active: 1, approvalRate: 33.3, refusalRate: 66.7, avgDays: 40, medianDays: 40, revenueCents: 300000, commissionCents: 30000, commissionShare: 10 });
    expect(r.clients).toBeNull();
    expect(perfRow('a', 'A', [], { total: 4, withCase: 1 })).toMatchObject({ clients: 4, clientsWithCase: 1, caseRate: 25, cases: 0, approvalRate: null });
  });

  it('groups rows, keeps agents without cases and puts the "without" row last', () => {
    const rows = perfRows(
      [
        { ...pc({}), key: null },
        { ...pc({}), key: null },
        { ...pc({}), key: 'b' },
        { ...pc({}), key: 'a' },
        { ...pc({}), key: 'a' },
      ],
      (k) => k.toUpperCase(),
      new Map([
        ['a', { total: 3, withCase: 2 }],
        ['z', { total: 5, withCase: 0 }],
      ]),
    );
    expect(rows.map((r) => [r.id, r.name, r.cases, r.clients])).toEqual([
      ['a', 'A', 2, 3],
      ['b', 'B', 1, 0],
      ['z', 'Z', 0, 5],
      [null, null, 2, 0],
    ]);
  });
});

describe('business analytics: funnel', () => {
  it('takes the furthest step, a later step implying the earlier ones', () => {
    expect(funnelStepOf({ registeredAt: NOW, consultation: false, caseRank: null, departed: false })).toBe(0);
    expect(funnelStepOf({ registeredAt: NOW, consultation: true, caseRank: null, departed: false })).toBe(1);
    expect(funnelStepOf({ registeredAt: NOW, consultation: false, caseRank: 0, departed: false })).toBe(2);
    expect(funnelStepOf({ registeredAt: NOW, consultation: false, caseRank: 2, departed: false })).toBe(3);
    expect(funnelStepOf({ registeredAt: NOW, consultation: false, caseRank: 7, departed: false })).toBe(4);
    expect(funnelStepOf({ registeredAt: NOW, consultation: false, caseRank: 7, departed: true })).toBe(5);
  });

  it('builds totals and cohorts by registration month', () => {
    const f = funnelCohorts(
      [
        { registeredAt: at('2026-09-03'), consultation: true, caseRank: 7, departed: true },
        { registeredAt: at('2026-09-20'), consultation: true, caseRank: 1, departed: false },
        { registeredAt: at('2026-10-01'), consultation: false, caseRank: null, departed: false },
        { registeredAt: at('2026-10-02'), consultation: true, caseRank: null, departed: false },
      ],
      ['2026-09', '2026-10'],
    );
    expect(f.steps.map((s) => s.count)).toEqual([4, 3, 2, 1, 1, 1]);
    expect(f.steps[1]).toEqual({ key: 'consultation', count: 3, rate: 75, ofFirst: 75 });
    expect(f.steps[2]).toMatchObject({ rate: 66.7, ofFirst: 50 });
    expect(f.cohorts.map((c) => [c.month, c.steps.map((s) => s.count)])).toEqual([
      ['2026-09', [2, 2, 2, 1, 1, 1]],
      ['2026-10', [2, 1, 0, 0, 0, 0]],
    ]);
    expect(funnelCohorts([], ['2026-10']).steps[0]).toEqual({ key: 'registered', count: 0, rate: null, ofFirst: null });
  });
});
