import { describe, expect, it } from 'vitest';
import {
  allocatePayment,
  expectedPayments,
  inquiryLeadSource,
  leadSourceRows,
  nextMonths,
  partnerRows,
  previousWindow,
  revenueByMonth,
  salesFunnel,
  serviceRows,
  signupLeadSource,
  type Lead,
} from '../../src/lib/salesAnalytics/compute.js';
import { salesPeriod, salesQuery } from '../../src/lib/salesAnalytics/service.js';

const at = (s: string) => new Date(`${s}T08:00:00Z`); // 12:00 in Baku
const NOW = at('2026-11-14');
const inquiry = (over: Partial<Parameters<typeof inquiryLeadSource>[0]> = {}) => ({ partnerId: null, agentId: null, source: null, landingPageId: null, utm: null, visitorId: null, ...over });

describe('sales analytics: lead sources', () => {
  it('classifies inquiries (first rule wins)', () => {
    expect(inquiryLeadSource(inquiry({ partnerId: 'p1', utm: { source: 'fb' } }))).toBe('partner');
    expect(inquiryLeadSource(inquiry({ agentId: 'a1' }))).toBe('partner');
    expect(inquiryLeadSource(inquiry({ utm: { source: 'facebook' }, visitorId: 'v' }))).toBe('campaign');
    expect(inquiryLeadSource(inquiry({ utm: { source: '  ' }, visitorId: 'v' }))).toBe('website');
    expect(inquiryLeadSource(inquiry({ source: 'landing:spring' }))).toBe('campaign');
    expect(inquiryLeadSource(inquiry({ landingPageId: 'lp' }))).toBe('campaign');
    expect(inquiryLeadSource(inquiry({ source: 'event:abc' }))).toBe('campaign');
    expect(inquiryLeadSource(inquiry({ source: 'cost-calculator' }))).toBe('website');
    expect(inquiryLeadSource(inquiry({ visitorId: 'v1' }))).toBe('website');
    expect(inquiryLeadSource(inquiry({ sector: 'Live chat' }))).toBe('website');
    expect(inquiryLeadSource(inquiry())).toBe('direct');
  });

  it('classifies signups', () => {
    expect(signupLeadSource({ referredByClient: true, ownerPartnerId: 'p', referredByAgentId: null })).toBe('referral');
    expect(signupLeadSource({ referredByClient: false, ownerPartnerId: 'p', referredByAgentId: null })).toBe('partner');
    expect(signupLeadSource({ referredByClient: false, ownerPartnerId: null, referredByAgentId: 'a' })).toBe('partner');
    expect(signupLeadSource({ referredByClient: false, ownerPartnerId: null, referredByAgentId: null })).toBe('website');
  });
});

describe('sales analytics: period', () => {
  it('defaults to 12 Baku months and compares with the same length before', () => {
    const p = salesPeriod({}, NOW);
    expect(p).toMatchObject({ from: '2025-12-01', to: '2026-11-14' });
    expect(p.prevEnd.getTime()).toBe(p.start.getTime());
    expect(p.start.getTime() - p.prevStart.getTime()).toBe(p.end.getTime() - p.start.getTime());
    const w = previousWindow(at('2026-10-01'), at('2026-10-11'));
    expect(w.start.toISOString()).toBe(at('2026-09-21').toISOString());
  });

  it('validates the query', () => {
    expect(salesQuery.safeParse({ from: '2026-10-10', to: '2026-10-01' }).success).toBe(false);
    expect(salesQuery.safeParse({ from: '2020-01-01', to: '2026-10-01' }).success).toBe(false);
    expect(salesQuery.safeParse({ from: '2026-02-30' }).success).toBe(false);
    expect(salesQuery.safeParse({ from: '2026-01-01', to: '2026-10-01' }).success).toBe(true);
  });
});

describe('sales analytics: revenue', () => {
  it('sums paid revenue per Baku month', () => {
    const r = revenueByMonth(['2026-09', '2026-10'], [{ at: at('2026-09-03'), cents: 1000 }], [
      { at: at('2026-10-01'), cents: 500 },
      // 23:30 UTC on 30 Sep = 03:30 on 1 Oct in Baku
      { at: new Date('2026-09-30T23:30:00Z'), cents: 200 },
      { at: at('2026-08-01'), cents: 999 },
    ]);
    expect(r).toEqual({ invoices: [1000, 0], payments: [0, 700], total: [1000, 700] });
  });

  it('allocates a payment to its package, or over the invoice lines', () => {
    expect(allocatePayment({ cents: 900, packageId: 'pk', items: [] })).toEqual([{ key: 'package:pk', cents: 900 }]);
    expect(allocatePayment({ cents: 1000, packageId: null, items: null })).toEqual([{ key: 'other', cents: 1000 }]);
    const parts = allocatePayment({
      cents: 1001,
      packageId: null,
      items: [
        { description: 'Fee', quantity: 1, unitPriceCents: 2000, category: 'SERVICE_FEE' },
        { description: 'Tr', quantity: 2, unitPriceCents: 500, category: 'TRANSLATION' },
      ],
    });
    expect(parts).toEqual([
      { key: 'category:SERVICE_FEE', cents: 668 },
      { key: 'category:TRANSLATION', cents: 333 },
    ]);
    expect(parts.reduce((a, p) => a + p.cents, 0)).toBe(1001);
  });

  it('ranks services with the previous period', () => {
    const rows = serviceRows(
      [
        { key: 'employer', cents: 300 },
        { key: 'package:a', cents: 700 },
      ],
      [{ key: 'employer', cents: 600 }, { key: 'other', cents: 50 }],
    );
    expect(rows.map((r) => r.key)).toEqual(['package:a', 'employer', 'other']);
    expect(rows[1]).toMatchObject({ cents: 300, prevCents: 600, share: 30, delta: -50 });
    expect(rows[2]).toMatchObject({ cents: 0, prevCents: 50, delta: -100 });
  });
});

describe('sales analytics: expected payments', () => {
  it('buckets what is still to come by due month and keeps overdue apart', () => {
    expect(nextMonths(NOW, 3)).toEqual(['2026-11', '2026-12', '2027-01']);
    const e = expectedPayments(
      [
        { kind: 'client', due: at('2026-11-20'), cents: 100 },
        { kind: 'company', due: at('2026-12-01'), cents: 200 },
        { kind: 'installment', due: at('2027-08-01'), cents: 50 },
        { kind: 'client', due: at('2026-11-01'), cents: 70 }, // overdue
        { kind: 'client', due: at('2026-11-14'), cents: 30 }, // due today: not overdue yet
        { kind: 'company', due: at('2026-12-02'), cents: 0 },
      ],
      NOW,
      3,
    );
    expect(e.months[0]).toEqual({ month: '2026-11', client: 130, company: 0, installment: 0, total: 130 });
    expect(e.months[1].total).toBe(200);
    expect(e.later).toEqual({ client: 0, company: 0, installment: 50, total: 50 });
    expect(e.upcomingCents).toBe(330);
    expect(e.overdue).toEqual({ cents: 70, count: 1 });
  });
});

describe('sales analytics: funnel, sources and partners', () => {
  const leads: Lead[] = [
    { source: 'website', at: at('2026-10-01'), clientId: 'c1' },
    { source: 'website', at: at('2026-10-02'), clientId: 'c1' }, // same client twice
    { source: 'website', at: at('2026-10-03'), clientId: null },
    { source: 'partner', at: at('2026-10-04'), clientId: 'c2' },
    { source: 'referral', at: at('2026-10-05'), clientId: 'c3' },
  ];
  const withCase = new Set(['c1', 'c2']);
  const approved = new Set(['c2']);

  it('follows the cohort from lead to visa', () => {
    expect(salesFunnel(leads, withCase, approved)).toEqual([
      { key: 'leads', count: 5, rate: null, ofFirst: null },
      { key: 'clients', count: 3, rate: 60, ofFirst: 60 },
      { key: 'cases', count: 2, rate: 66.7, ofFirst: 40 },
      { key: 'approved', count: 1, rate: 50, ofFirst: 20 },
    ]);
    expect(salesFunnel([], withCase, approved)[1]).toMatchObject({ count: 0, rate: null });
  });

  it('counts leads per source with the previous period', () => {
    const rows = leadSourceRows(leads, [{ source: 'website', at: at('2026-09-01'), clientId: null }], approved);
    expect(rows.map((r) => r.source)).toEqual(['website', 'partner', 'referral', 'campaign', 'direct']);
    expect(rows[0]).toMatchObject({ count: 3, prev: 1, share: 60, clients: 1, clientRate: 33.3, delta: 200 });
    expect(rows[1]).toMatchObject({ count: 1, approved: 1, delta: null });
  });

  it('ranks partners by the revenue of their clients', () => {
    const rows = partnerRows(
      [
        { partnerId: 'p1', clientId: 'a', cents: 100 },
        { partnerId: 'p1', clientId: 'a', cents: 50 },
        { partnerId: 'p2', clientId: 'b', cents: 300 },
        { partnerId: null, clientId: 'c', cents: 550 },
      ],
      [{ partnerId: 'p1', clientId: 'a', cents: 300 }],
      new Map([
        ['p1', 20],
        ['p3', 10],
      ]),
    );
    expect(rows.map((r) => r.id)).toEqual(['p2', 'p1', 'p3']);
    expect(rows[1]).toMatchObject({ revenueCents: 150, prevRevenueCents: 300, delta: -50, clients: 1, payments: 2, commissionCents: 20, share: 15 });
    expect(rows[2]).toMatchObject({ revenueCents: 0, commissionCents: 10 });
  });
});
