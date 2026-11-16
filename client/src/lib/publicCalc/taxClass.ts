/**
 * Steuerklassen chooser for married couples / civil partners (/tax-class-chooser): III/V, V/III, IV/IV and IV/IV
 * with Faktor compared month by month and over the year. Pure; payroll from the site's single engine
 * (server/src/lib/budget/payroll.ts, BMF Programmablaufplan 2026). Unit-tested in
 * server/tests/unit/publicCalcWork.test.ts.
 *
 *  - Monthly wage tax per partner: the PAP for the chosen class (social contributions do not depend on the class).
 *  - Faktorverfahren (§39f EStG): F = Y / X with three decimals, cut off (not rounded); only if F < 1.
 *    X = sum of both partners' yearly wage tax in class IV, Y = splitting tax (§32a Abs. 5) on the sum of the
 *    taxable incomes the PAP uses for class IV. Monthly wage tax in IV × F; soli / church tax on that base.
 *  - Yearly tax after the return (joint assessment, the same for every combination): simplified as in
 *    lib/publicCalc/taxRefund.ts — wages − 1,230 € Pauschbetrag each − Vorsorgeaufwendungen − 72 €, splitting
 *    tariff, soli with the doubled Freigrenze, church tax. Children, other income and deductions not modelled.
 *  - III/V and IV/IV with Faktor oblige the couple to file a return (§46 Abs. 2 Nr. 3a EStG).
 */
import { churchRateOf, estimatePayroll, lohnsteuerJahr, soliJahr, tariff, type PayrollResult, type Steuerklasse } from '../../../../server/src/lib/budget/payroll';
import type { FederalState } from '../../../../server/src/lib/budget/params';
import { TAX_REFUND_RULES, vorsorgeOf } from './taxRefund';

export const TAX_CLASS_CHECKED = '2026-11-16';

export interface TaxClassInput {
  /** Monthly gross of partner A / B. */
  grossA: number;
  grossB: number;
  state: FederalState;
  church: boolean;
  /** Children under 25 (care-insurance rate, Kinderfreibetrag in soli / church tax). */
  children: number;
}

export const DEFAULT_TAX_CLASS: TaxClassInput = { grossA: 4_200, grossB: 2_200, state: 'BE', church: false, children: 0 };

export type Combo = 'III/V' | 'V/III' | 'IV/IV' | 'IV/IV+F';
export const COMBOS: Combo[] = ['III/V', 'IV/IV', 'IV/IV+F', 'V/III'];

export interface PartnerMonth {
  taxClass: Steuerklasse;
  gross: number;
  /** Wage tax + soli + church tax per month. */
  tax: number;
  social: number;
  net: number;
}

export interface ComboResult {
  combo: Combo;
  a: PartnerMonth;
  b: PartnerMonth;
  netMonthly: number;
  /** Tax withheld over the year (both partners). */
  withheldYear: number;
  /** Positive: refund after the return; negative: back payment. */
  settlement: number;
  /** A tax return is compulsory (§46 Abs. 2 Nr. 3a EStG). */
  mandatoryReturn: boolean;
}

export interface TaxClassResult {
  combos: ComboResult[];
  /** Faktor (3 decimals) or 1 when it would not be < 1. */
  factor: number;
  /** Yearly income tax + soli + church tax of the joint assessment (simplified). */
  annualTax: number;
  /** Combination with the highest monthly net (ties: IV/IV+F, then IV/IV). */
  bestMonthly: Combo;
  /** Combination whose withholding is closest to the annual tax. */
  closest: Combo;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const floor2 = (n: number) => Math.floor(n * 100 + 1e-7) / 100;
const num = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);

export const sanitizeTaxClass = (i: TaxClassInput): TaxClassInput => ({
  grossA: num(i.grossA, 0, 30_000),
  grossB: num(i.grossB, 0, 30_000),
  state: i.state,
  church: !!i.church,
  children: Math.round(num(i.children, 0, 10)),
});

const month = (p: PayrollResult, taxClass: Steuerklasse, tax = round2(p.incomeTax + p.soli + p.churchTax)): PartnerMonth => ({
  taxClass,
  gross: p.gross,
  tax,
  social: p.social,
  net: round2(p.gross - tax - p.social),
});

/** Faktor of §39f EStG for two yearly wages (both in class IV). */
export const faktor = (yearA: { taxableIncome: number; incomeTax: number }, yearB: { taxableIncome: number; incomeTax: number }) => {
  const x = yearA.incomeTax + yearB.incomeTax;
  if (x <= 0) return 1;
  const y = 2 * tariff(Math.floor((Math.floor(yearA.taxableIncome) + Math.floor(yearB.taxableIncome)) / 2));
  const f = Math.floor((y / x) * 1000 + 1e-9) / 1000;
  return f < 1 ? f : 1;
};

export const compareTaxClasses = (input: TaxClassInput): TaxClassResult => {
  const i = sanitizeTaxClass(input);
  const base = { state: i.state, church: i.church, children: i.children, age: 30, lowWageRules: true } as const;
  const pay = (gross: number, c: Steuerklasse) => estimatePayroll({ ...base, grossMonthly: gross, taxClass: c });
  const a4 = pay(i.grossA, 4);
  const b4 = pay(i.grossB, 4);

  // Faktor: X and Y from the PAP yearly values in class IV.
  const yearOf = (p: PayrollResult) => lohnsteuerJahr(p.lowWage === 'minijob' ? 0 : p.gross * 12, { taxClass: 4, children: i.children, pvRate: p.careRate, zusatzbeitrag: p.zusatzbeitrag });
  const ya = yearOf(a4);
  const yb = yearOf(b4);
  const f = faktor(ya, yb);
  const withFactor = (p: PayrollResult, y: ReturnType<typeof lohnsteuerJahr>): PartnerMonth => {
    const yearTax = Math.floor(y.incomeTax * f);
    const surcharge = Math.floor(y.surchargeBase * f);
    const tax = floor2(yearTax / 12) + floor2(soliJahr(surcharge, 4) / 12) + (i.church ? floor2((surcharge / 12) * churchRateOf(i.state)) : 0);
    return month(p, 4, round2(tax));
  };

  // Joint assessment (same for every combination).
  const wageA = i.grossA * 12;
  const wageB = i.grossB * 12;
  const income = Math.max(0, wageA - TAX_REFUND_RULES.werbungskostenPauschbetrag) + Math.max(0, wageB - TAX_REFUND_RULES.werbungskostenPauschbetrag);
  const vorsorge = (a4.lowWage === 'minijob' ? 0 : vorsorgeOf(a4, 12)) + (b4.lowWage === 'minijob' ? 0 : vorsorgeOf(b4, 12));
  const zvE = Math.max(0, Math.floor(income - vorsorge - 2 * TAX_REFUND_RULES.sonderausgabenPauschbetrag));
  const incomeTax = 2 * tariff(Math.floor(zvE / 2));
  const annualTax = round2(incomeTax + soliJahr(incomeTax, 3) + (i.church ? incomeTax * churchRateOf(i.state) : 0));

  const make = (combo: Combo, a: PartnerMonth, b: PartnerMonth): ComboResult => {
    const withheldYear = round2((a.tax + b.tax) * 12);
    return {
      combo,
      a,
      b,
      netMonthly: round2(a.net + b.net),
      withheldYear,
      settlement: round2(withheldYear - annualTax),
      mandatoryReturn: combo !== 'IV/IV',
    };
  };
  const combos: ComboResult[] = [
    make('III/V', month(pay(i.grossA, 3), 3), month(pay(i.grossB, 5), 5)),
    make('IV/IV', month(a4, 4), month(b4, 4)),
    make('IV/IV+F', withFactor(a4, ya), withFactor(b4, yb)),
    make('V/III', month(pay(i.grossA, 5), 5), month(pay(i.grossB, 3), 3)),
  ];
  const pref: Combo[] = ['IV/IV+F', 'IV/IV', 'III/V', 'V/III'];
  const byPref = [...combos].sort((x, y) => pref.indexOf(x.combo) - pref.indexOf(y.combo));
  const bestMonthly = byPref.reduce((best, c) => (c.netMonthly > best.netMonthly + 0.005 ? c : best)).combo;
  const closest = byPref.reduce((best, c) => (Math.abs(c.settlement) < Math.abs(best.settlement) - 0.005 ? c : best)).combo;
  return { combos, factor: f, annualTax, bestMonthly, closest };
};
