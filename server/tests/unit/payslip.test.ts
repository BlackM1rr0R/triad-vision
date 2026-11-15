import { describe, expect, it } from 'vitest';
import { estimatePayroll } from '../../src/lib/budget/payroll.js';
import { CURRENT_PARAMS, FEDERAL_STATES } from '../../src/lib/budget/params.js';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { FederalState } from '../../src/lib/budget/params.js';
import type { PayrollResult, Steuerklasse } from '../../src/lib/budget/payroll.js';

// The payslip builder lives in the client (it ships with the page); loaded like the other client libs in these tests.
const here = path.dirname(fileURLToPath(import.meta.url));
interface Input { gross: number; taxClass: Steuerklasse; church: boolean; childless: boolean; state: FederalState; zusatzbeitrag: number; firstName: string }
interface Slip {
  input: Input;
  result: PayrollResult;
  lines: { key: string; label: string; amount: number; rate: number | null }[];
  employer: { key: string; amount: number; rate: number | null }[] | null;
  taxes: number;
  social: number;
  capped: { pension: boolean; health: boolean };
}
const lib = (await import(/* @vite-ignore */ pathToFileURL(path.resolve(here, '../../../client/src/lib/salary/payslip.ts')).href)) as {
  buildPayslip: (i: Partial<Input>) => Slip;
  payslipFromParams: (p: URLSearchParams) => Input;
  payslipToParams: (i: Input) => string;
  sanitizePayslip: (i: Partial<Input>) => Input;
  DEFAULT_PAYSLIP: Input;
  PAYSLIP_AGE: number;
  PAYSLIP_GROSS_MIN: number;
};
const { buildPayslip, payslipFromParams, payslipToParams, sanitizePayslip, DEFAULT_PAYSLIP, PAYSLIP_AGE, PAYSLIP_GROSS_MIN } = lib;

/*
 * Payslip explainer (/payslip-explained): every line is the payroll engine's figure (estimatePayroll), never a
 * second calculation; employer shares; URL round trip.
 */

const S = CURRENT_PARAMS.payroll.social;
const cases = [
  { gross: 3_000, taxClass: 1 as const, church: false, childless: true, state: 'BE' as const, zusatzbeitrag: 0.029 },
  { gross: 4_200, taxClass: 3 as const, church: true, childless: false, state: 'BY' as const, zusatzbeitrag: 0.025 },
  { gross: 2_450, taxClass: 1 as const, church: true, childless: true, state: 'SN' as const, zusatzbeitrag: 0.034 },
  { gross: 9_000, taxClass: 4 as const, church: false, childless: true, state: 'HH' as const, zusatzbeitrag: 0.029 },
  { gross: 5_500, taxClass: 5 as const, church: true, childless: false, state: 'NW' as const, zusatzbeitrag: 0.031 },
  { gross: 3_300, taxClass: 6 as const, church: false, childless: true, state: 'BW' as const, zusatzbeitrag: 0.029 },
];

describe('payslip lines', () => {
  it('equal the payroll engine results for every line', () => {
    for (const c of cases) {
      const slip = buildPayslip({ ...c, firstName: '' });
      const r = estimatePayroll({ grossMonthly: c.gross, taxClass: c.taxClass, state: c.state, church: c.church, children: c.childless ? 0 : 1, age: PAYSLIP_AGE, zusatzbeitrag: c.zusatzbeitrag, lowWageRules: true });
      const amount = (k: string) => slip.lines.find((l) => l.key === k)!.amount;
      expect(amount('brutto'), JSON.stringify(c)).toBe(r.gross);
      expect(amount('steuerBrutto')).toBe(r.gross);
      expect(amount('svBrutto')).toBe(r.gross);
      expect(amount('lohnsteuer')).toBe(r.incomeTax);
      expect(amount('soli')).toBe(r.soli);
      expect(amount('kirchensteuer')).toBe(r.churchTax);
      expect(amount('kv')).toBe(r.health);
      expect(amount('rv')).toBe(r.pension);
      expect(amount('av')).toBe(r.unemployment);
      expect(amount('pv')).toBe(r.care);
      expect(amount('netto')).toBe(r.net);
      expect(amount('auszahlung')).toBe(r.net);
      expect(slip.social).toBe(r.social);
      expect(slip.taxes).toBeCloseTo(r.incomeTax + r.soli + r.churchTax, 2);
      // the payslip adds up: gross − taxes − social = net (to the cent)
      expect(Math.round((r.gross - slip.taxes - slip.social) * 100) / 100).toBeCloseTo(r.net, 2);
      // shown rates are the engine's parameters
      expect(slip.lines.find((l) => l.key === 'pv')!.rate).toBe(r.careRate);
      expect(slip.lines.find((l) => l.key === 'kv')!.rate).toBeCloseTo(S.healthEmployee + c.zusatzbeitrag / 2, 6);
      if (!c.church) expect(r.churchTax).toBe(0);
    }
  });

  it('shows the employer shares of the engine on the capped bases', () => {
    const slip = buildPayslip({ gross: 3_000, taxClass: 1, state: 'BE', church: false, childless: true, zusatzbeitrag: 0.029 });
    const e = slip.result.employer!;
    expect(e.pension).toBe(279);
    expect(e.unemployment).toBe(39);
    expect(e.health).toBeCloseTo(3_000 * (0.073 + 0.0145), 2);
    expect(e.care).toBe(54);
    const cost = slip.employer!.find((l) => l.key === 'cost')!;
    expect(cost.amount).toBeCloseTo(3_000 + e.total, 2);
    // above both ceilings the contributions stop there (employee and employer alike)
    const high = buildPayslip({ ...DEFAULT_PAYSLIP, gross: 9_000 });
    expect(high.capped).toEqual({ pension: true, health: true });
    expect(high.result.employer!.pension).toBeCloseTo((S.bbgRvAlvYear / 12) * S.pensionEmployer, 2);
    expect(high.result.employer!.health).toBeCloseTo((S.bbgKvPvYear / 12) * (S.healthEmployer + S.averageZusatzbeitrag / 2), 2);
    // Saxony: the employer pays the lower care share
    expect(buildPayslip({ ...DEFAULT_PAYSLIP, state: 'SN' }).result.employer!.careRate).toBe(S.careEmployerSaxony);
    // the employer shares never change the employee's figures
    expect(estimatePayroll({ grossMonthly: 1_500, taxClass: 1, state: 'BE', church: false, children: 0, age: 30, lowWageRules: true }).employer).toBeNull();
  });
});

describe('payslip input', () => {
  it('clamps the gross above the Midijob range and keeps a safe first name', () => {
    expect(sanitizePayslip({ gross: 900 }).gross).toBe(PAYSLIP_GROSS_MIN);
    expect(sanitizePayslip({ gross: NaN }).gross).toBe(PAYSLIP_GROSS_MIN);
    expect(sanitizePayslip({ firstName: '<b>Leyla</b>' }).firstName).toBe('bLeylab');
    expect(sanitizePayslip({ firstName: 'Ülviyyə' }).firstName).toBe('Ülviyyə');
    expect(sanitizePayslip({ state: 'XX' as FederalState }).state).toBe('BE');
    expect(FEDERAL_STATES).toContain(sanitizePayslip({ state: 'SN' }).state);
  });

  it('round-trips through the URL with only the changed values', () => {
    expect(payslipToParams(DEFAULT_PAYSLIP)).toBe('');
    const i = sanitizePayslip({ gross: 4_100, taxClass: 3, church: true, childless: false, state: 'BY', zusatzbeitrag: 0.025, firstName: 'Orxan' });
    const q = payslipToParams(i);
    expect(payslipFromParams(new URLSearchParams(q))).toEqual(i);
  });
});
