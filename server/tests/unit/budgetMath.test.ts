import { describe, expect, it } from 'vitest';
import { computeBudget, firstPayDate, type BudgetInput } from '../../src/lib/budget/budget.js';
import { DEFAULT_CITY_COSTS, matchCity, publicCity, cityCostSchema } from '../../src/lib/budget/cities.js';
import { CURRENT_PARAMS } from '../../src/lib/budget/params.js';
import { estimatePayroll } from '../../src/lib/budget/payroll.js';
import type { CityCost } from '@prisma/client';

const rows: CityCost[] = DEFAULT_CITY_COSTS.map((d, i) => ({ ...d, id: `c${i}`, createdAt: new Date(), updatedAt: new Date() }));
const city = (slug: string) => publicCity(rows.find((r) => r.slug === slug)!);

const base: BudgetInput = {
  gross: 3_000,
  taxClass: 1,
  church: false,
  age: 30,
  state: 'BE',
  household: 'single',
  children: 0,
  housing: 'wg',
  companyRent: null,
  start: '2026-10-01',
  arrival: null,
  blockedAccountYear: 0,
};

const sum = (xs: { amount: [number, number] }[], i: 0 | 1) => xs.reduce((s, x) => s + x.amount[i], 0);

describe('timeline', () => {
  it('first salary at the end of the month after the start month', () => {
    expect(firstPayDate('2026-10-01')).toBe('2026-11-30');
    expect(firstPayDate('2026-10-15')).toBe('2026-11-30');
    expect(firstPayDate('2026-12-01')).toBe('2027-01-31');
    expect(firstPayDate('2027-01-15')).toBe('2027-02-28');
  });

  it('arrival defaults to 7 days before the start, ~9 weeks without salary', () => {
    const r = computeBudget(base, city('berlin'));
    expect(r.timeline).toMatchObject({ arrival: '2026-09-24', start: '2026-10-01', firstPay: '2026-11-30', daysUntilPay: 67, monthsTouched: 3, daysBeforeStart: 7 });
    expect(r.timeline.weeksUntilPay).toBeCloseTo(9.6, 1);
  });

  it('an arrival after the start is moved to the start', () => {
    const r = computeBudget({ ...base, arrival: '2026-10-20' }, city('berlin'));
    expect(r.timeline.arrival).toBe('2026-10-01');
    expect(r.timeline.daysBeforeStart).toBe(0);
    expect(r.oneOff.items.find((l) => l.key === 'healthGap')!.amount).toEqual([0, 0]);
  });
});

describe('one-off costs until the first salary', () => {
  it('WG in Berlin: deposit 3 rents, pro-rata + 2 full rents, tickets for Oct + Nov', () => {
    const r = computeBudget(base, city('berlin'));
    const get = (k: string) => r.oneOff.items.find((l) => l.key === k)!;
    expect(get('deposit').amount).toEqual([1_800, 2_160]); // 3 × 600–720
    // 24 Sep → 7/30 of September + October + November
    expect(get('rent').meta?.months).toBeCloseTo(2.2, 1);
    expect(get('rent').amount).toEqual([Math.round(600 * (7 / 30 + 2)), Math.round(720 * (7 / 30 + 2))]);
    expect(get('transport').amount).toEqual([126, 126]); // arrived on the 24th → no September ticket
    expect(get('rundfunk').amount).toEqual([0, 18]); // WG: usually paid by a flatmate
    expect(get('healthGap').amount).toEqual([35, 80]); // 7 days → one month of incoming insurance
    // food: 67 days ≈ 2.2 months × 260–340
    expect(get('food').amount).toEqual([Math.round(260 * (67 / 30.44)), Math.round(340 * (67 / 30.44))]);
    expect(r.oneOff.total).toEqual([sum(r.oneOff.items, 0), sum(r.oneOff.items, 1)]);
  });

  it('own flat: deposit on the cold rent only, first Rundfunk quarter, more furniture', () => {
    const c = city('leipzig');
    const r = computeBudget({ ...base, housing: 'flat' }, c);
    const get = (k: string) => r.oneOff.items.find((l) => l.key === k)!;
    expect(get('deposit').amount).toEqual([c.flat1.cold[0] * 3, c.flat1.cold[1] * 3]);
    expect(get('rundfunk').amount).toEqual([55, 55]);
    expect(get('furniture').amount).toEqual(CURRENT_PARAMS.costs.furniture.flat);
    const rent = r.monthly.items.find((l) => l.key === 'rent')!;
    expect(rent.amount).toEqual([c.flat1.cold[0] + c.flat1.utilities[0], c.flat1.cold[1] + c.flat1.utilities[1]]);
  });

  it('company housing with the employer’s figure: deposit 0–1 rent', () => {
    const r = computeBudget({ ...base, housing: 'company', companyRent: 350 }, city('hamburg'));
    expect(r.oneOff.items.find((l) => l.key === 'deposit')!.amount).toEqual([0, 350]);
    expect(r.monthly.items.find((l) => l.key === 'rent')!.amount).toEqual([350, 350]);
  });

  it('a family in a WG gets a 2-room flat instead (with a warning)', () => {
    const r = computeBudget({ ...base, household: 'family', children: 2, taxClass: 3 }, city('dortmund'));
    expect(r.input.housingUsed).toBe('flat');
    expect(r.warnings).toContain('WG_FAMILY');
    expect(r.children).toBe(2);
    expect(r.monthly.income.kindergeld).toBe(2 * 259);
  });
});

describe('monthly budget and money to bring', () => {
  it('remaining = net − costs (range), recommendation = high + buffer rounded up to 100', () => {
    const r = computeBudget(base, city('berlin'));
    const net = estimatePayroll({ grossMonthly: 3_000, taxClass: 1, state: 'BE', church: false, children: 0, age: 30 }).net;
    expect(r.net.net).toBe(net);
    expect(r.monthly.remaining).toEqual([Math.round(net - r.monthly.total[1]), Math.round(net - r.monthly.total[0])]);
    const high = r.oneOff.total[1];
    const buffer = Math.ceil(Math.max(500, high * 0.15) / 100) * 100;
    expect(r.bring.buffer).toBe(buffer);
    expect(r.bring.recommended).toBe(Math.ceil((high + buffer) / 100) * 100);
    expect(r.bring.recommended % 100).toBe(0);
    expect(r.bring.blockedAccount).toBeNull();
  });

  it('blocked account: 992 €/month, releases before the first salary cover running costs only', () => {
    const r = computeBudget({ ...base, gross: 1_100, blockedAccountYear: 11_904 }, city('berlin'));
    const b = r.bring.blockedAccount!;
    expect(b.monthly).toBe(992);
    expect(b.releasesBeforePay).toBe(2); // 1 Oct + 1 Nov
    expect(b.releasedBeforePay).toBe(1_984);
    const running = r.oneOff.items.filter((l) => !['deposit', 'furniture', 'healthGap', 'liability'].includes(l.key)).reduce((s, l) => s + l.amount[1], 0);
    expect(b.covered).toBe(Math.min(1_984, running));
    expect(b.cashBesides).toBe(Math.ceil((r.bring.recommended - b.covered) / 100) * 100);
    expect(r.warnings).toContain('MIDIJOB'); // 1,100 € is in the Midijob range (Ausbildung is excluded in reality)
  });

  it('flags a monthly deficit', () => {
    const r = computeBudget({ ...base, gross: 1_200, housing: 'flat' }, city('muenchen'));
    expect(r.warnings).toContain('MONTHLY_DEFICIT');
    expect(r.monthly.remaining[0]).toBeLessThan(0);
  });

  it('costs scale with the household', () => {
    const one = computeBudget({ ...base, housing: 'flat' }, city('koeln'));
    const two = computeBudget({ ...base, housing: 'flat', household: 'couple', taxClass: 3 }, city('koeln'));
    expect(two.oneOff.total[1]).toBeGreaterThan(one.oneOff.total[1]);
    expect(two.monthly.total[1]).toBeGreaterThan(one.monthly.total[1]);
    expect(two.net.net).toBeGreaterThan(one.net.net); // class III
  });
});

describe('city data', () => {
  it('has ~20 cities plus 3 size-class fallbacks, all valid for the admin schema', () => {
    expect(rows.filter((r) => r.kind === 'CITY').length).toBeGreaterThanOrEqual(20);
    expect(rows.filter((r) => r.kind === 'GENERIC').map((r) => r.slug).sort()).toEqual(['other-large', 'other-medium', 'other-small']);
    for (const d of DEFAULT_CITY_COSTS) {
      const parsed = cityCostSchema.safeParse({ ...d, checkedAt: d.checkedAt.toISOString().slice(0, 10) });
      expect(parsed.success, d.slug).toBe(true);
      expect(d.depositMonths).toBeLessThanOrEqual(3);
    }
  });

  it('matches vacancy places to rows (name, alias, umlauts)', () => {
    expect(matchCity(rows, 'München')?.slug).toBe('muenchen');
    expect(matchCity(rows, 'Munich')?.slug).toBe('muenchen');
    expect(matchCity(rows, 'Langenhagen')?.slug).toBe('hannover');
    expect(matchCity(rows, 'Mörfelden-Walldorf')?.slug).toBe('frankfurt');
    expect(matchCity(rows, 'Versmold')?.slug).toBe('bielefeld');
    expect(matchCity(rows, 'Kempten')?.slug).toBe('kempten');
    expect(matchCity(rows, 'Frankfurt am Main')?.slug).toBe('frankfurt');
    expect(matchCity(rows, 'Nowhere')).toBeNull();
    expect(matchCity(rows, '')).toBeNull();
  });

  it('rejects min > max and a CITY without a state', () => {
    const d = DEFAULT_CITY_COSTS[0];
    const ok = { ...d, checkedAt: '2026-10-26' };
    expect(cityCostSchema.safeParse({ ...ok, wgMin: 900, wgMax: 800 }).success).toBe(false);
    expect(cityCostSchema.safeParse({ ...ok, state: null }).success).toBe(false);
    expect(cityCostSchema.safeParse({ ...ok, depositMonths: 4 }).success).toBe(false);
  });
});
