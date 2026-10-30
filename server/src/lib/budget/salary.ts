import { CURRENT_PARAMS, type FederalState } from './params.js';
import { estimatePayroll, type Steuerklasse } from './payroll.js';

/**
 * Public net-salary calculator (/salary-calculator, the vacancy "≈ net" hint, the guide widget and the client
 * AI assistant): a thin month / year wrapper around estimatePayroll — no own tables or formulas, so the
 * calculator and the first-month budget always give the same net for the same input.
 * Imported by the client bundle (client/src/lib/salary) — keep it pure (only ./params.ts and ./payroll.ts).
 */

export interface SalaryInput {
  /** Gross salary in EUR for the chosen period. */
  gross: number;
  period: 'month' | 'year';
  taxClass: Steuerklasse;
  state: FederalState;
  church: boolean;
  /** Children under 25 (child allowances for soli / church tax, care-insurance discount). */
  children: number;
  age: number;
  /** Total health-insurance Zusatzbeitrag as a fraction (0.029 = 2.9 %), half paid by the employee. */
  zusatzbeitrag: number;
}

export interface SalaryAmounts {
  gross: number;
  incomeTax: number;
  soli: number;
  churchTax: number;
  pension: number;
  unemployment: number;
  health: number;
  care: number;
  net: number;
}

export interface SalaryResult {
  yearly: SalaryAmounts;
  monthly: SalaryAmounts;
  /** Net per hour at 40 h/week. */
  hourlyNet: number;
  /** Taxable income behind the Lohnsteuer (EUR/year). */
  taxableIncome: number;
  /** Employee care-insurance rate actually applied. */
  careRate: number;
  /** Total deductions / gross (0..1). */
  deductionRate: number;
  /** Low-wage rule applied to the monthly gross (Minijob ≤ 603 €, Übergangsbereich ≤ 2,000 €). */
  lowWage: 'minijob' | 'midijob' | null;
}

const P = CURRENT_PARAMS.payroll;

export const SALARY_YEAR = P.year;
/** Figures shown on the calculator page. */
export const TAX = { grundfreibetrag: P.tax.gfb } as const;
export const SOCIAL = {
  bbgPension: P.social.bbgRvAlvYear,
  bbgHealth: P.social.bbgKvPvYear,
  defaultZusatzbeitrag: P.social.averageZusatzbeitrag,
} as const;
export const LOW_WAGE = { minijobUpTo: P.minijobUpTo, midijobUpTo: P.midijobUpTo } as const;

/** 40 h/week × 52 weeks / 12 months. */
export const HOURS_PER_MONTH = (40 * 52) / 12;

/** Newly arrived single worker: class I, no church tax, childless and over 23 (childless care surcharge). */
export const DEFAULT_INPUT: SalaryInput = {
  gross: 3_000,
  period: 'month',
  taxClass: 1,
  state: 'BE',
  church: false,
  children: 0,
  age: 30,
  zusatzbeitrag: P.social.averageZusatzbeitrag,
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const clampNum = (n: number, min: number, max: number) => (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);

/** Normalises a raw input (NaN, negatives, out-of-range values). */
export const sanitizeInput = (i: Partial<SalaryInput>): SalaryInput => {
  const d = DEFAULT_INPUT;
  const tc = Number(i.taxClass);
  return {
    gross: clampNum(Number(i.gross ?? d.gross), 0, 10_000_000),
    period: i.period === 'year' ? 'year' : 'month',
    taxClass: (tc >= 1 && tc <= 6 ? Math.round(tc) : d.taxClass) as Steuerklasse,
    state: i.state ?? d.state,
    church: Boolean(i.church),
    children: Math.round(clampNum(Number(i.children ?? 0), 0, 15)),
    age: Math.round(clampNum(Number(i.age ?? d.age), 14, 100)),
    zusatzbeitrag: clampNum(Number(i.zusatzbeitrag ?? d.zusatzbeitrag), 0, 0.1),
  };
};

const DEDUCTIONS = ['incomeTax', 'soli', 'churchTax', 'pension', 'unemployment', 'health', 'care'] as const;

export const calculateSalary = (raw: Partial<SalaryInput>): SalaryResult => {
  const i = sanitizeInput(raw);
  // Payroll runs per month (Lohnsteuer = Jahreslohnsteuer of 12 × the monthly wage / 12); a yearly gross is
  // spread over 12 equal months.
  const r = estimatePayroll({
    grossMonthly: i.period === 'year' ? i.gross / 12 : i.gross,
    taxClass: i.taxClass,
    state: i.state,
    church: i.church,
    children: i.children,
    age: i.age,
    zusatzbeitrag: i.zusatzbeitrag,
    lowWageRules: true,
  });

  const monthly = { gross: r.gross, net: r.net } as SalaryAmounts;
  const yearly = { gross: i.period === 'year' ? i.gross : round2(r.gross * 12) } as SalaryAmounts;
  let yearlyDeductions = 0;
  for (const k of DEDUCTIONS) {
    monthly[k] = r[k];
    yearly[k] = round2(r[k] * 12);
    yearlyDeductions += yearly[k];
  }
  yearly.net = round2(yearly.gross - yearlyDeductions);

  return {
    yearly,
    monthly,
    hourlyNet: round2(monthly.net / HOURS_PER_MONTH),
    taxableIncome: r.yearly.taxableIncome,
    careRate: r.careRate,
    deductionRate: yearly.gross > 0 ? (yearly.gross - yearly.net) / yearly.gross : 0,
    lowWage: r.lowWage,
  };
};

/** Quick estimate of the monthly net for a monthly gross with the defaults (vacancy widget). */
export const quickNetMonthly = (grossMonthly: number, taxClass: Steuerklasse = 1): number =>
  calculateSalary({ ...DEFAULT_INPUT, gross: grossMonthly, period: 'month', taxClass }).monthly.net;
