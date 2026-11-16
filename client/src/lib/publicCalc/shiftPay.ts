/**
 * Night, Sunday and holiday supplements (Zuschläge) and their tax / social-insurance exemption (/shift-pay-calculator).
 * Pure; taxes and contributions come from the site's single payroll engine (server/src/lib/budget/payroll.ts).
 * Unit-tested in server/tests/unit/publicCalc.test.ts.
 *
 * Rules (checked 2026-11 against the law texts):
 *  - §3b Abs. 1 EStG: tax-free up to 25 % (night work 20:00 – 6:00), 50 % (Sunday), 125 % (public holidays and
 *    31 Dec from 14:00), 150 % (24 Dec from 14:00, 25 / 26 Dec, 1 May) of the base wage.
 *  - §3b Abs. 2: base wage at most 50 € per hour for the tax exemption.
 *  - §3b Abs. 3: night work started before midnight: 40 % for 0:00 – 4:00; 0:00 – 4:00 after a Sunday / holiday
 *    counts as Sunday / holiday work.
 *  - Night supplements can be added to Sunday / holiday supplements (an hour can be in both rows); Sunday and
 *    holiday rates do not add up (a holiday on a Sunday counts as holiday only).
 *  - §1 Abs. 1 Satz 1 Nr. 1 SvEV: free of social insurance only as far as the base wage is ≤ 25 € per hour.
 */
import { estimatePayroll, type Steuerklasse } from '../../../../server/src/lib/budget/payroll';
import type { FederalState } from '../../../../server/src/lib/budget/params';

export type ShiftKind = 'night' | 'nightCore' | 'sunday' | 'holiday' | 'special';
export const SHIFT_KINDS: ShiftKind[] = ['night', 'nightCore', 'sunday', 'holiday', 'special'];

/** Tax-free maximum per kind (fraction of the base hourly wage). */
export const TAX_FREE_RATE: Record<ShiftKind, number> = { night: 0.25, nightCore: 0.4, sunday: 0.5, holiday: 1.25, special: 1.5 };
export const TAX_BASE_CAP = 50;
export const SOCIAL_BASE_CAP = 25;
export const SHIFT_CHECKED = '2026-11-16';

export interface ShiftInput {
  /** Base hourly wage (€). */
  hourly: number;
  /** Paid hours per month (base salary = hourly × hours). */
  monthlyHours: number;
  /** Hours per month with each supplement. */
  hours: Record<ShiftKind, number>;
  /** Supplement the employer pays (fraction, e.g. 0.25), per kind. */
  rates: Record<ShiftKind, number>;
  taxClass: Steuerklasse;
  state: FederalState;
  church: boolean;
  childless: boolean;
}

export interface ShiftLine {
  kind: ShiftKind;
  hours: number;
  rate: number;
  /** Supplement paid. */
  amount: number;
  /** Part free of income tax. */
  taxFree: number;
  /** Part free of social insurance. */
  socialFree: number;
}

export interface ShiftResult {
  base: number;
  lines: ShiftLine[];
  supplements: number;
  gross: number;
  taxFree: number;
  socialFree: number;
  /** Net with the exemptions (as on a correct payslip). */
  net: number;
  /** Net if every supplement were fully taxed and subject to contributions. */
  netFullyTaxed: number;
  /** net − netFullyTaxed. */
  advantage: number;
  taxes: number;
  social: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const clampNum = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);

export const PRESETS: Record<'nurse' | 'cook' | 'driver', Pick<ShiftInput, 'hourly' | 'monthlyHours' | 'hours' | 'rates'>> = {
  // Hospital nurse, 3-shift rota. Presets are illustrative examples; the page asks for the contract's own rates.
  nurse: {
    hourly: 22,
    monthlyHours: 169,
    hours: { night: 40, nightCore: 16, sunday: 16, holiday: 8, special: 0 },
    rates: { night: 0.2, nightCore: 0.2, sunday: 0.25, holiday: 0.35, special: 1 },
  },
  // Restaurant cook: late evenings and weekends.
  cook: {
    hourly: 16,
    monthlyHours: 173,
    hours: { night: 24, nightCore: 0, sunday: 24, holiday: 8, special: 0 },
    rates: { night: 0.25, nightCore: 0.4, sunday: 0.5, holiday: 1, special: 1.5 },
  },
  // Truck / bus driver with night tours.
  driver: {
    hourly: 17,
    monthlyHours: 173,
    hours: { night: 50, nightCore: 30, sunday: 8, holiday: 0, special: 0 },
    rates: { night: 0.25, nightCore: 0.25, sunday: 0.5, holiday: 1, special: 1.5 },
  },
};

export const DEFAULT_SHIFT: ShiftInput = {
  ...PRESETS.nurse,
  taxClass: 1,
  state: 'BE',
  church: false,
  childless: true,
};

export const sanitizeShift = (i: ShiftInput): ShiftInput => ({
  ...i,
  hourly: clampNum(i.hourly, 0, 500),
  monthlyHours: clampNum(i.monthlyHours, 0, 300),
  hours: Object.fromEntries(SHIFT_KINDS.map((k) => [k, clampNum(i.hours[k], 0, 300)])) as Record<ShiftKind, number>,
  rates: Object.fromEntries(SHIFT_KINDS.map((k) => [k, clampNum(i.rates[k], 0, 3)])) as Record<ShiftKind, number>,
});

/** Supplement lines with their tax- and social-insurance-free parts. */
export const supplementLines = (i: ShiftInput): ShiftLine[] =>
  SHIFT_KINDS.map((kind) => {
    const hours = i.hours[kind];
    const rate = i.rates[kind];
    const free = Math.min(rate, TAX_FREE_RATE[kind]);
    return {
      kind,
      hours,
      rate,
      amount: round2(i.hourly * rate * hours),
      taxFree: round2(Math.min(i.hourly, TAX_BASE_CAP) * free * hours),
      socialFree: round2(Math.min(i.hourly, SOCIAL_BASE_CAP) * free * hours),
    };
  });

export const calculateShift = (input: ShiftInput): ShiftResult => {
  const i = sanitizeShift(input);
  const base = round2(i.hourly * i.monthlyHours);
  const lines = supplementLines(i);
  const supplements = round2(lines.reduce((s, l) => s + l.amount, 0));
  const taxFree = round2(lines.reduce((s, l) => s + l.taxFree, 0));
  const socialFree = round2(lines.reduce((s, l) => s + l.socialFree, 0));
  const gross = round2(base + supplements);
  // Example employee aged 30 (the childless care surcharge applies from 23).
  const run = (g: number) =>
    estimatePayroll({ taxClass: i.taxClass, state: i.state, church: i.church, children: i.childless ? 0 : 1, age: 30, lowWageRules: true, grossMonthly: g });
  // Wage tax on the taxable wage, contributions on the contributory wage (two runs of the same engine).
  const taxed = run(gross - taxFree);
  const insured = run(gross - socialFree);
  const taxes = round2(taxed.incomeTax + taxed.soli + taxed.churchTax);
  const social = insured.social;
  const net = round2(gross - taxes - social);
  const full = run(gross);
  const netFullyTaxed = full.net;
  return { base, lines, supplements, gross, taxFree, socialFree, net, netFullyTaxed, advantage: round2(net - netFullyTaxed), taxes, social };
};
