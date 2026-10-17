import {
  CHURCH_LOW_STATES,
  CHURCH_RATE_DEFAULT,
  CHURCH_RATE_LOW,
  HOURS_PER_MONTH,
  SOCIAL,
  SOLI,
  TAX,
  type FederalState,
} from './constants';

/**
 * German net-salary estimate (2026, employee in statutory health/pension insurance).
 * Pure functions, no DOM / React — usable from pages, widgets and the self-check.
 *
 * Simplifications (also listed on the calculator page):
 *  - Vorsorgepauschale approximated from the employee's own contributions (pension + unemployment +
 *    health at the reduced rate + care); no private-insurance case.
 *  - Mini-/Midijob rules (≤ 2,000 €/month), one-off payments, allowances (Freibeträge), Faktorverfahren
 *    and the employer's share are not modelled.
 *  - Classes V/VI use the PAP formula with approximate 2026 thresholds.
 *  - Children count = children under 25 living with you (care-insurance discount and child allowance
 *    for soli / church tax).
 */

export type TaxClass = 1 | 2 | 3 | 4 | 5 | 6;

export interface SalaryInput {
  /** Gross salary in EUR for the chosen period. */
  gross: number;
  period: 'month' | 'year';
  taxClass: TaxClass;
  state: FederalState;
  church: boolean;
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
  /** Taxable income used for the income tax (EUR/year). */
  taxableIncome: number;
  /** Employee care-insurance rate actually applied. */
  careRate: number;
  /** Total deductions / gross (0..1). */
  deductionRate: number;
}

export const DEFAULT_INPUT: SalaryInput = {
  gross: 3_000,
  period: 'month',
  taxClass: 1,
  state: 'BE',
  church: false,
  children: 0,
  age: 30,
  zusatzbeitrag: SOCIAL.defaultZusatzbeitrag,
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const clampNum = (n: number, min: number, max: number) => (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);

/** Income tax per §32a EStG (Grundtabelle) for a taxable income, full euros. */
export const tariff = (zvE: number): number => {
  const x = Math.floor(Math.max(0, zvE));
  let tax: number;
  if (x <= TAX.grundfreibetrag) tax = 0;
  else if (x <= TAX.zone2End) {
    const y = (x - TAX.grundfreibetrag) / 10_000;
    tax = (TAX.zone2.a * y + TAX.zone2.b) * y;
  } else if (x <= TAX.zone3End) {
    const z = (x - TAX.zone2End) / 10_000;
    tax = (TAX.zone3.a * z + TAX.zone3.b) * z + TAX.zone3.c;
  } else if (x <= TAX.zone4End) tax = TAX.zone4.rate * x - TAX.zone4.d;
  else tax = TAX.zone5.rate * x - TAX.zone5.d;
  return Math.floor(tax);
};

/** Splitting tariff (class III): twice the tax on half the income. */
export const splittingTariff = (zvE: number): number => 2 * tariff(Math.floor(Math.max(0, zvE) / 2));

/** Classes V/VI per the official Programmablaufplan (MST5_6 / UP5_6). */
export const tariffClass56 = (zvE: number): number => {
  const up56 = (zx: number) => {
    const diff = 2 * (tariff(zx * 1.25) - tariff(zx * 0.75));
    return Math.max(diff, Math.floor(zx * 0.14));
  };
  const x = Math.floor(Math.max(0, zvE));
  if (x > TAX.w2) {
    let st = up56(TAX.w2);
    if (x > TAX.w3) st += (TAX.w3 - TAX.w2) * 0.42 + (x - TAX.w3) * 0.45;
    else st += (x - TAX.w2) * 0.42;
    return Math.floor(st);
  }
  let st = up56(x);
  if (x > TAX.w1) st = Math.min(st, up56(TAX.w1) + (x - TAX.w1) * 0.42);
  return Math.floor(st);
};

const taxFor = (taxClass: TaxClass, zvE: number) =>
  taxClass === 3 ? splittingTariff(zvE) : taxClass === 5 || taxClass === 6 ? tariffClass56(zvE) : tariff(zvE);

/** Solidarity surcharge with Freigrenze and Milderungszone. */
export const solidarity = (incomeTax: number, splitting: boolean): number => {
  const limit = SOLI.freigrenzeSingle * (splitting ? 2 : 1);
  if (incomeTax <= limit) return 0;
  return round2(Math.min(incomeTax * SOLI.rate, (incomeTax - limit) * SOLI.milderung));
};

export const churchRate = (state: FederalState) =>
  (CHURCH_LOW_STATES as readonly string[]).includes(state) ? CHURCH_RATE_LOW : CHURCH_RATE_DEFAULT;

/** Employee care-insurance rate (fraction). */
export const careRateFor = (state: FederalState, children: number, age: number): number => {
  let rate = SOCIAL.careEmployee + (state === 'SN' ? SOCIAL.careSaxonyExtra : 0);
  if (children <= 0) {
    if (age >= SOCIAL.careChildlessFromAge) rate += SOCIAL.careChildlessSurcharge;
  } else {
    const discounted = Math.min(Math.max(children - 1, 0), SOCIAL.careReductionMaxChildren);
    rate -= discounted * SOCIAL.careReductionPerChild;
  }
  return Math.max(0, rate);
};

/** Normalises a raw input (NaN, negatives, out-of-range values). */
export const sanitizeInput = (i: Partial<SalaryInput>): SalaryInput => {
  const d = DEFAULT_INPUT;
  const tc = Number(i.taxClass);
  return {
    gross: clampNum(Number(i.gross ?? d.gross), 0, 10_000_000),
    period: i.period === 'year' ? 'year' : 'month',
    taxClass: (tc >= 1 && tc <= 6 ? Math.round(tc) : d.taxClass) as TaxClass,
    state: i.state ?? d.state,
    church: Boolean(i.church),
    children: Math.round(clampNum(Number(i.children ?? 0), 0, 15)),
    age: Math.round(clampNum(Number(i.age ?? d.age), 14, 100)),
    zusatzbeitrag: clampNum(Number(i.zusatzbeitrag ?? d.zusatzbeitrag), 0, 0.1),
  };
};

export const calculateSalary = (raw: Partial<SalaryInput>): SalaryResult => {
  const i = sanitizeInput(raw);
  const gross = i.period === 'year' ? i.gross : i.gross * 12;

  // --- Social contributions (employee share, yearly) ---
  const basePension = Math.min(gross, SOCIAL.bbgPension);
  const baseHealth = Math.min(gross, SOCIAL.bbgHealth);
  const careRate = careRateFor(i.state, i.children, i.age);
  const pension = round2(basePension * SOCIAL.pensionEmployee);
  const unemployment = round2(basePension * SOCIAL.unemploymentEmployee);
  const health = round2(baseHealth * (SOCIAL.healthEmployee + i.zusatzbeitrag / 2));
  const care = round2(baseHealth * careRate);

  // --- Taxable income (Lohnsteuer approximation) ---
  const vorsorge =
    pension + unemployment + baseHealth * (SOCIAL.healthReducedEmployee + i.zusatzbeitrag / 2) + care;
  const class6 = i.taxClass === 6;
  let zvE = gross - vorsorge;
  if (!class6) zvE -= TAX.arbeitnehmerPauschbetrag + TAX.sonderausgabenPauschbetrag;
  if (i.taxClass === 2 && i.children > 0)
    zvE -= TAX.entlastungAlleinerziehende + (i.children - 1) * TAX.entlastungPerExtraChild;
  zvE = Math.max(0, Math.floor(zvE));

  const incomeTax = taxFor(i.taxClass, zvE);

  // Soli and church tax are computed on the tax after child allowances (none in classes V/VI).
  const kfbPerChild = i.taxClass === 3 ? TAX.kinderfreibetragFull : i.taxClass <= 4 ? TAX.kinderfreibetragFull / 2 : 0;
  const taxForSurcharges = i.children > 0 && kfbPerChild > 0 ? taxFor(i.taxClass, Math.max(0, zvE - i.children * kfbPerChild)) : incomeTax;
  const soli = solidarity(taxForSurcharges, i.taxClass === 3);
  const churchTax = i.church ? round2(taxForSurcharges * churchRate(i.state)) : 0;

  const net = round2(gross - incomeTax - soli - churchTax - pension - unemployment - health - care);
  const yearly: SalaryAmounts = { gross, incomeTax, soli, churchTax, pension, unemployment, health, care, net };
  const monthly = Object.fromEntries(Object.entries(yearly).map(([k, v]) => [k, round2(v / 12)])) as unknown as SalaryAmounts;

  return {
    yearly,
    monthly,
    hourlyNet: round2(monthly.net / HOURS_PER_MONTH),
    taxableIncome: zvE,
    careRate,
    deductionRate: gross > 0 ? (gross - net) / gross : 0,
  };
};

/** Quick class-I estimate of the monthly net for a monthly gross (used by the vacancy widget). */
export const quickNetMonthly = (grossMonthly: number, taxClass: TaxClass = 1): number =>
  calculateSalary({ ...DEFAULT_INPUT, gross: grossMonthly, period: 'month', taxClass }).monthly.net;
