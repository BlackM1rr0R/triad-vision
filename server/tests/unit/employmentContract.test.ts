import { describe, expect, it } from 'vitest';
import { BLUE_CARD, MINIMUM_WAGE } from '../../src/lib/ai/features/caseAi/config.js';
import { checkContract, probationEnd, salaryOf, type ContractFields } from '../../src/lib/placement/employmentContract.js';
import { isBlueCardCategory } from '../../src/lib/ai/features/caseAi/contract.js';

const settings = { minimumWage: MINIMUM_WAGE, blueCard: BLUE_CARD };
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const base: ContractFields = {
  contractType: 'UNLIMITED',
  grossMonthly: 4500,
  grossYearly: null,
  weeklyHours: 40,
  vacationDays: 28,
  startDate: d('2026-03-01'),
  endDate: null,
  probationMonths: 6,
};
const work = { blueCard: false, visaType: 'WORK' as const };
const blue = { blueCard: true, visaType: 'WORK' as const };
const codes = (c: ContractFields, ctx = work) => checkContract(c, ctx, settings).warnings.map((w) => w.code);

describe('probationEnd', () => {
  it('ends the day before the same date n months later', () => {
    expect(probationEnd(d('2026-01-01'), 6).toISOString().slice(0, 10)).toBe('2026-06-30');
    expect(probationEnd(d('2026-03-15'), 3).toISOString().slice(0, 10)).toBe('2026-06-14');
  });
  it('clamps to the end of a shorter month', () => {
    expect(probationEnd(d('2026-08-31'), 6).toISOString().slice(0, 10)).toBe('2027-02-27');
  });
});

describe('salaryOf', () => {
  it('derives monthly and yearly gross from each other', () => {
    expect(salaryOf({ grossMonthly: 4000, grossYearly: null })).toEqual({ monthly: 4000, yearly: 48000 });
    expect(salaryOf({ grossMonthly: null, grossYearly: 50700 })).toEqual({ monthly: 4225, yearly: 50700 });
    expect(salaryOf({ grossMonthly: null, grossYearly: null })).toEqual({ monthly: null, yearly: null });
  });
});

describe('checkContract', () => {
  it('passes a clean contract', () => {
    expect(checkContract(base, work, settings)).toEqual({ blueCardCheck: 'NOT_APPLICABLE', warnings: [] });
  });

  it('checks the Blue Card thresholds of the start year (from the case-AI settings, not hard-coded)', () => {
    const t = BLUE_CARD['2026'];
    const at = (yearly: number) => checkContract({ ...base, grossMonthly: null, grossYearly: yearly }, blue, settings);
    expect(at(t.standard).blueCardCheck).toBe('OK');
    expect(at(t.standard - 1)).toMatchObject({ blueCardCheck: 'SHORTAGE_OK', warnings: [{ code: 'BLUE_CARD_SHORTAGE_ONLY', severity: 'WARNING' }] });
    expect(at(t.shortage - 1)).toMatchObject({ blueCardCheck: 'BELOW', warnings: [{ code: 'BLUE_CARD_BELOW', severity: 'BLOCKER', params: { min: t.shortage, year: 2026 } }] });
    // Unknown salary: no verdict yet.
    expect(checkContract({ ...base, grossMonthly: null }, blue, settings).blueCardCheck).toBeNull();
    // Admin-edited thresholds are used as given.
    expect(checkContract(base, blue, { ...settings, blueCard: { '2026': { standard: 60_000, shortage: 55_000 } } }).blueCardCheck).toBe('BELOW');
  });

  it('flags pay below the minimum wage, except for trainees', () => {
    const low = { ...base, grossMonthly: 1500 };
    expect(codes(low)).toEqual(['BELOW_MINIMUM_WAGE']);
    expect(codes({ ...low, contractType: 'AUSBILDUNG' })).toEqual([]);
    expect(codes(low, { blueCard: false, visaType: 'AUSBILDUNG' as never })).toEqual([]);
    // Part time: the hourly wage counts, not the monthly amount.
    expect(codes({ ...low, weeklyHours: 20 })).toEqual([]);
  });

  it('flags more than 48 hours, fewer than 20 vacation days and probation over 6 months', () => {
    expect(codes({ ...base, weeklyHours: 50, grossMonthly: 6000 })).toEqual(['HOURS_TOO_HIGH']);
    expect(codes({ ...base, weeklyHours: 48 })).toEqual([]);
    expect(codes({ ...base, vacationDays: 18 })).toEqual(['VACATION_TOO_LOW']);
    expect(codes({ ...base, vacationDays: 20 })).toEqual([]);
    expect(codes({ ...base, probationMonths: 9 })).toEqual(['PROBATION_TOO_LONG']);
  });

  it('flags a fixed term without an end date and an end before the start', () => {
    expect(codes({ ...base, contractType: 'FIXED' })).toEqual(['FIXED_WITHOUT_END']);
    expect(codes({ ...base, contractType: 'FIXED', endDate: d('2027-02-28') })).toEqual([]);
    expect(codes({ ...base, endDate: d('2025-12-31') })).toEqual(['END_BEFORE_START']);
  });
});

describe('isBlueCardCategory', () => {
  it('recognises § 18g by label or slug', () => {
    expect(isBlueCardCategory({ visaLabel: '§18g', slug: 'x' })).toBe(true);
    expect(isBlueCardCategory({ visaLabel: 'EU', slug: 'blue-card' })).toBe(true);
    expect(isBlueCardCategory({ visaLabel: '§18a', slug: 'fachkraft' })).toBe(false);
    expect(isBlueCardCategory(null)).toBe(false);
  });
});
