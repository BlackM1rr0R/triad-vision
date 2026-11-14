import { describe, expect, it } from 'vitest';
import { bakuMonth, bucketByMonth, joinDates, lastMonths, monthsStart, moneySeries, refusalRate } from '../../src/lib/partners/dashboard.js';

describe('partner dashboard helpers', () => {
  it('month keys follow Baku time (UTC+4)', () => {
    expect(bakuMonth(new Date('2026-10-31T19:59:00Z'))).toBe('2026-10');
    expect(bakuMonth(new Date('2026-10-31T20:00:00Z'))).toBe('2026-11');
  });

  it('lastMonths: 12 keys ending with the current month, across a year boundary', () => {
    const m = lastMonths(new Date('2026-02-10T12:00:00Z'));
    expect(m).toHaveLength(12);
    expect(m[0]).toBe('2025-03');
    expect(m[11]).toBe('2026-02');
    expect(monthsStart(m).toISOString()).toBe('2025-02-28T20:00:00.000Z');
  });

  it('bucketByMonth counts / sums inside the window only', () => {
    const months = ['2026-09', '2026-10', '2026-11'];
    const rows = [
      { at: new Date('2026-09-02T00:00:00Z'), v: 5 },
      { at: new Date('2026-11-01T00:00:00Z'), v: 7 },
      { at: new Date('2026-11-20T00:00:00Z'), v: 1 },
      { at: new Date('2025-01-01T00:00:00Z'), v: 100 },
    ];
    expect(bucketByMonth(rows, months, (r) => r.at)).toEqual([1, 0, 2]);
    expect(bucketByMonth(rows, months, (r) => r.at, (r) => r.v)).toEqual([5, 0, 8]);
  });

  it('moneySeries keeps one currency (preferred, else the most frequent) and counts the rest', () => {
    const months = ['2026-11'];
    const at = new Date('2026-11-05T00:00:00Z');
    const rows = [
      { currency: 'AZN', amountCents: 100, at },
      { currency: 'AZN', amountCents: 200, at },
      { currency: 'EUR', amountCents: 50, at },
    ];
    expect(moneySeries(rows, months, (r) => r.at, 'EUR')).toEqual({ currency: 'EUR', cents: [50], totalCents: 50, otherCurrencyRows: 2 });
    expect(moneySeries(rows, months, (r) => r.at, 'USD')).toMatchObject({ currency: 'AZN', totalCents: 300, otherCurrencyRows: 1 });
    expect(moneySeries([], months, (r: (typeof rows)[number]) => r.at, null)).toMatchObject({ currency: 'EUR', totalCents: 0 });
  });

  it('refusalRate: refused ÷ (refused + approved); cancelled and running cases are not decided', () => {
    expect(refusalRate([])).toEqual({ refused: 0, approved: 0, decided: 0, rate: null });
    const r = refusalRate([
      { status: 'APPROVED', processingStage: null },
      { status: 'APPROVED', processingStage: 'REFUSED' }, // approved wins over the team stage
      { status: 'REJECTED', processingStage: null },
      { status: 'DECISION_PENDING', processingStage: 'REFUSED' },
      { status: 'CANCELLED', processingStage: null },
      { status: 'DOCUMENTS_PENDING', processingStage: null },
    ]);
    expect(r).toEqual({ refused: 2, approved: 2, decided: 4, rate: 50 });
  });

  it('joinDates: the earliest of the first partner case and the ownership date', () => {
    const d = (s: string) => new Date(s);
    const m = joinDates(
      [
        { clientId: 'a', createdAt: d('2026-05-01') },
        { clientId: 'a', createdAt: d('2026-03-01') },
        { clientId: 'b', createdAt: d('2026-06-01') },
      ],
      [
        { id: 'b', ownerPartnerAt: d('2026-01-01'), createdAt: d('2025-01-01') },
        { id: 'c', ownerPartnerAt: null, createdAt: d('2026-02-01') },
      ],
    );
    expect(Object.fromEntries([...m].map(([k, v]) => [k, v.toISOString().slice(0, 10)]))).toEqual({ a: '2026-03-01', b: '2026-01-01', c: '2026-02-01' });
  });
});
