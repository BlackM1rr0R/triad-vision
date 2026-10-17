import { describe, expect, it } from 'vitest';
import {
  agingBucket,
  byType,
  commissionsByAgent,
  daysOverdue,
  monthly,
  outstandingAt,
  receivables,
  staffStats,
  summarize,
  type CaseRow,
  type CommissionRow,
  type FinanceData,
  type InvoiceRow,
} from '../../src/lib/finance/aggregate';
import { monthsOf, PeriodError, resolvePeriod } from '../../src/lib/finance/period';

const D = (s: string) => new Date(s.length === 10 ? `${s}T12:00:00Z` : s);

let n = 0;
const inv = (o: Partial<InvoiceRow>): InvoiceRow => ({
  id: `i${++n}`,
  number: `TV-${n}`,
  companyId: 'co1',
  companyName: 'Co',
  issueDate: D('2026-01-10'),
  dueDate: D('2026-01-24'),
  netCents: 10000,
  grossCents: 11900,
  status: 'SENT',
  paidAt: null,
  ...o,
});
const kase = (o: Partial<CaseRow>): CaseRow => ({
  id: `c${++n}`,
  status: 'DOCUMENTS_PENDING',
  createdAt: D('2026-01-05'),
  decisionAt: null,
  closedAt: null,
  assignedStaffId: null,
  visaType: 'WORK',
  visaCategoryId: null,
  companyId: null,
  ...o,
});
const com = (o: Partial<CommissionRow>): CommissionRow => ({ agentId: 'a1', caseId: null, amountCents: 5000, status: 'PENDING', createdAt: D('2026-02-01'), paidAt: null, ...o });

describe('finance periods (UTC)', () => {
  it('defaults to the current calendar year', () => {
    const p = resolvePeriod({}, D('2026-10-17'));
    expect(p).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
    expect(p.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('rejects bad dates, reversed and too long ranges', () => {
    expect(() => resolvePeriod({ from: '2026-02-30' })).toThrow(PeriodError);
    expect(() => resolvePeriod({ from: '2026-05-01', to: '2026-04-01' })).toThrow('INVALID_RANGE');
    expect(() => resolvePeriod({ from: '2015-01-01', to: '2026-01-01' })).toThrow('RANGE_TOO_LONG');
  });

  it('splits a period into UTC months clipped to the range', () => {
    const m = monthsOf(resolvePeriod({ from: '2026-01-15', to: '2026-03-10' }));
    expect(m.map((x) => x.key)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(m[0].start.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    expect(m[1].end.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(m[2].end.toISOString()).toBe('2026-03-11T00:00:00.000Z');
  });
});

describe('receivables', () => {
  it('buckets by days overdue; not yet due counts as 0–30', () => {
    expect(agingBucket(0)).toBe('0-30');
    expect(agingBucket(30)).toBe('0-30');
    expect(agingBucket(31)).toBe('31-60');
    expect(agingBucket(90)).toBe('61-90');
    expect(agingBucket(91)).toBe('90+');
    expect(daysOverdue(D('2026-03-01'), D('2026-02-01'))).toBe(0);
    expect(daysOverdue(D('2026-03-01'), D('2026-03-11'))).toBe(10);
  });

  it('treats invoices paid after the instant as still open then, and ignores drafts / cancelled', () => {
    const list = [
      inv({ status: 'PAID', paidAt: D('2026-03-05'), grossCents: 1000 }),
      inv({ status: 'OVERDUE', grossCents: 2000 }),
      inv({ status: 'DRAFT', grossCents: 4000 }),
      inv({ status: 'CANCELLED', grossCents: 8000 }),
      inv({ status: 'SENT', issueDate: D('2026-04-01'), grossCents: 16000 }),
    ];
    expect(outstandingAt(list, D('2026-03-01'))).toEqual({ grossCents: 3000, count: 2, overdueGrossCents: 3000, overdueCount: 2 });
    expect(outstandingAt(list, D('2026-03-10')).grossCents).toBe(2000);
    expect(outstandingAt(list, D('2026-04-02')).grossCents).toBe(18000);
  });

  it('lists open invoices with aging totals, oldest first', () => {
    const at = D('2026-06-01');
    const r = receivables(
      [
        inv({ dueDate: D('2026-05-20'), grossCents: 100 }),
        inv({ dueDate: D('2026-04-15'), grossCents: 200 }),
        inv({ dueDate: D('2026-01-01'), grossCents: 300, status: 'OVERDUE' }),
        inv({ dueDate: D('2026-06-20'), grossCents: 400 }),
      ],
      at,
    );
    expect(r.rows.map((x) => x.grossCents)).toEqual([300, 200, 100, 400]);
    expect(r.aging).toEqual([
      { bucket: '0-30', count: 2, grossCents: 500 },
      { bucket: '31-60', count: 1, grossCents: 200 },
      { bucket: '61-90', count: 0, grossCents: 0 },
      { bucket: '90+', count: 1, grossCents: 300 },
    ]);
    expect(r.totalGrossCents).toBe(1000);
  });
});

describe('summary and monthly', () => {
  const p = resolvePeriod({ from: '2026-01-01', to: '2026-03-31' });
  const now = D('2026-10-17');
  const data: FinanceData = {
    invoices: [
      inv({ status: 'PAID', issueDate: D('2026-01-10'), paidAt: D('2026-02-03'), netCents: 10000, grossCents: 11900 }),
      inv({ status: 'PAID', issueDate: D('2026-03-01'), paidAt: new Date('2026-03-31T23:30:00Z'), netCents: 20000, grossCents: 23800 }),
      inv({ status: 'PAID', issueDate: D('2026-03-15'), dueDate: D('2026-04-10'), paidAt: new Date('2026-04-01T00:10:00Z'), netCents: 1000, grossCents: 1190 }),
      inv({ status: 'OVERDUE', issueDate: D('2026-02-01'), dueDate: D('2026-02-15'), grossCents: 5000 }),
    ],
    commissions: [
      com({ status: 'PENDING', createdAt: D('2026-01-20'), amountCents: 100 }),
      com({ status: 'APPROVED', createdAt: D('2026-02-20'), amountCents: 200 }),
      com({ status: 'PAID', createdAt: D('2025-12-20'), paidAt: D('2026-03-02'), amountCents: 400 }),
      com({ status: 'PAID', createdAt: D('2026-03-20'), paidAt: D('2026-05-02'), amountCents: 800 }),
    ],
    translations: [
      { caseId: null, priceCents: 3000, status: 'DELIVERED', completedAt: D('2026-02-10'), updatedAt: D('2026-02-10') },
      { caseId: null, priceCents: 9000, status: 'READY', completedAt: null, updatedAt: D('2026-02-10') },
    ],
    cases: [
      kase({ createdAt: D('2026-01-01'), status: 'APPROVED', decisionAt: D('2026-01-21') }),
      kase({ createdAt: D('2025-12-01'), status: 'REJECTED', decisionAt: D('2026-02-10') }),
      kase({ createdAt: D('2026-03-01'), status: 'APPROVED', decisionAt: null, closedAt: D('2026-03-31') }),
      kase({ createdAt: D('2026-02-14') }),
    ],
  };

  it('computes the KPI cards', () => {
    const s = summarize(data, p, now);
    expect(s.revenue).toEqual({ grossCents: 35700, netCents: 30000, count: 2 });
    // At the end of March: the overdue invoice and the one paid on 1 April.
    expect(s.receivables).toEqual({ grossCents: 6190, count: 2, overdueGrossCents: 5000, overdueCount: 1 });
    expect(s.translation).toEqual({ cents: 3000, count: 1 });
    expect(s.commissions).toMatchObject({ pendingCents: 100, approvedCents: 200, paidCents: 400, paidCount: 1 });
    expect(s.netResultCents).toBe(30000 + 3000 - 400);
    expect(s.cases).toEqual({ new: 3, approved: 2, rejected: 1, decided: 3, conversionPct: 66.7, avgDaysToDecision: 40.3 });
  });

  it('buckets per UTC month (23:30 on 31 March stays in March)', () => {
    const m = monthly(data, p, now);
    expect(m.map((x) => x.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(m.map((x) => x.paidCents)).toEqual([0, 11900, 23800]);
    expect(m.map((x) => x.invoicedCents)).toEqual([11900, 5000, 23800 + 1190]);
    expect(m.map((x) => x.outstandingCents)).toEqual([11900, 5000, 6190]);
    expect(m.map((x) => x.translationCents)).toEqual([0, 3000, 0]);
    expect(m.map((x) => x.commissionsPaidCents)).toEqual([0, 0, 400]);
    expect(m.map((x) => x.newCases)).toEqual([1, 1, 1]);
    expect(m.map((x) => x.approved)).toEqual([1, 0, 1]);
  });

  it('has no outstanding value for months in the future', () => {
    const m = monthly(data, resolvePeriod({ from: '2026-10-01', to: '2026-11-30' }), now);
    expect(m[0].outstandingCents).not.toBeNull();
    expect(m[1].outstandingCents).toBeNull();
  });
});

describe('per agent, per staff, per type', () => {
  const p = resolvePeriod({ from: '2026-01-01', to: '2026-12-31' });

  it('sums commissions per agent and hides paused agents without activity', () => {
    const agents = [
      { id: 'a1', code: 'A1', name: 'Ali', region: null, status: 'ACTIVE', referralsTotal: 3, referralsInRange: 2 },
      { id: 'a2', code: 'A2', name: 'Vali', region: null, status: 'PAUSED', referralsTotal: 0, referralsInRange: 0 },
    ];
    const r = commissionsByAgent(agents, [com({ amountCents: 100 }), com({ status: 'PAID', paidAt: D('2026-03-01'), amountCents: 300 }), com({ status: 'CANCELLED', amountCents: 50 })], p);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ pendingCents: 100, paidCents: 300, cancelledCents: 50, totalCents: 400 });
    expect(r.totals.totalCents).toBe(400);
  });

  it('builds the staff league', () => {
    const cases = [
      kase({ assignedStaffId: 's1', status: 'APPROVED', createdAt: D('2026-01-01'), decisionAt: D('2026-01-11') }),
      kase({ assignedStaffId: 's1', status: 'REJECTED', createdAt: D('2026-01-01'), decisionAt: D('2026-01-31') }),
      kase({ assignedStaffId: 's1' }),
    ];
    const rows = staffStats(
      [
        { id: 's1', name: 'Staff One', role: 'STAFF', isActive: true },
        { id: 's2', name: 'Gone', role: 'STAFF', isActive: false },
      ],
      cases,
      new Map([['s1', 4]]),
      new Map([['s1', { avg: 8.66, count: 3 }]]),
      p,
    );
    expect(rows).toEqual([
      expect.objectContaining({ id: 's1', activeCases: 1, newCases: 3, approved: 1, rejected: 1, approvalPct: 50, avgDaysToDecision: 20, documentsReviewed: 4, satisfactionAvg: 8.7, satisfactionCount: 3 }),
    ]);
  });

  it('splits invoice revenue over the company cases', () => {
    const data: FinanceData = {
      invoices: [inv({ companyId: 'co1', status: 'PAID', paidAt: D('2026-02-01'), grossCents: 1001 }), inv({ companyId: 'co2', status: 'PAID', paidAt: D('2026-02-01'), grossCents: 500 })],
      commissions: [],
      translations: [],
      cases: [
        kase({ id: 'k1', companyId: 'co1', visaType: 'WORK', visaCategoryId: 'cat1' }),
        kase({ id: 'k2', companyId: 'co1', visaType: 'AUSBILDUNG', visaCategoryId: 'cat2', createdAt: D('2025-06-01') }),
      ],
    };
    const r = byType(data, p);
    const t = Object.fromEntries(r.byVisaType.map((x) => [String(x.key), x]));
    expect(t.WORK.invoiceRevenueCents).toBe(501);
    expect(t.AUSBILDUNG.invoiceRevenueCents).toBe(500);
    expect(t.null.invoiceRevenueCents).toBe(500);
    expect(t.WORK.newCases).toBe(1);
    expect(t.AUSBILDUNG.newCases).toBe(0);
    expect(r.byCategory.reduce((a, x) => a + x.revenueCents, 0)).toBe(1501);
  });
});
