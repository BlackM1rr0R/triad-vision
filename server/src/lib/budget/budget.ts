import { CURRENT_PARAMS, type BudgetParams, type FederalState, type Range } from './params.js';
import { estimatePayroll, type PayrollResult, type TaxClass } from './payroll.js';
import type { PublicCity } from './cities.js';

/**
 * First-month budget (pure, unit tested): net salary, one-off costs until the first salary, the monthly
 * budget afterwards and how much money to bring (with the blocked account, if the visa needs one).
 *
 * Timeline model: the client arrives `arrival` (default: 7 days before the start date) and moves in that
 * day; the first salary arrives at the end of the month after the start month (conservative — many
 * employers pay the first month only with the next payroll run). Costs are [low, high] ranges in euros.
 */

export const HOUSEHOLDS = ['single', 'couple', 'family'] as const;
export type Household = (typeof HOUSEHOLDS)[number];
export const HOUSING = ['wg', 'flat', 'company'] as const;
export type Housing = (typeof HOUSING)[number];

export interface BudgetInput {
  gross: number;
  taxClass: TaxClass;
  church: boolean;
  age: number;
  /** Total Zusatzbeitrag as a fraction; default: the average. */
  zusatzbeitrag?: number;
  state: FederalState;
  household: Household;
  /** Only for `family` (1–6). */
  children: number;
  housing: Housing;
  /** Company housing: rent / monthly deduction the employer named (EUR), null = typical range. */
  companyRent: number | null;
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD; null = start − 7 days */
  arrival: string | null;
  /** Blocked account (Sperrkonto) of the visa, EUR for 12 months; 0 = not needed. */
  blockedAccountYear: number;
}

export const ONE_OFF_KEYS = ['deposit', 'rent', 'furniture', 'transport', 'phone', 'rundfunk', 'liability', 'healthGap', 'food', 'living'] as const;
export type OneOffKey = (typeof ONE_OFF_KEYS)[number];
export const MONTHLY_KEYS = ['rent', 'electricity', 'internet', 'phone', 'food', 'transport', 'rundfunk', 'insurance', 'children', 'personal'] as const;
export type MonthlyKey = (typeof MONTHLY_KEYS)[number];

export interface Line<K extends string> {
  key: K;
  amount: Range;
  /** Numbers behind the line for the explanation (months, people, rate …). */
  meta?: Record<string, number | string>;
}

export interface BudgetResult {
  year: number;
  checkedAt: string;
  input: BudgetInput & { housingUsed: Housing };
  adults: number;
  children: number;
  net: PayrollResult;
  timeline: {
    arrival: string;
    start: string;
    firstPay: string;
    /** Days from arrival to the first salary. */
    daysUntilPay: number;
    weeksUntilPay: number;
    /** Calendar months from the arrival month to the pay month (both included). */
    monthsTouched: number;
    /** Days without statutory health insurance (arrival → start). */
    daysBeforeStart: number;
  };
  oneOff: { items: Line<OneOffKey>[]; total: Range };
  monthly: {
    items: Line<MonthlyKey>[];
    total: Range;
    income: { net: number; kindergeld: number; total: number };
    /** Left over per month: [worst case, best case]. */
    remaining: Range;
  };
  bring: {
    /** Recommended cash for the time until the first salary (high estimate + buffer, rounded up). */
    recommended: number;
    buffer: number;
    blockedAccount: null | {
      year: number;
      monthly: number;
      /** Monthly releases expected before the first salary. */
      releasesBeforePay: number;
      releasedBeforePay: number;
      /** Part of the recommended cash the releases can cover (running costs only, not deposit / furniture). */
      covered: number;
      /** Cash to bring on top of the funded blocked account. */
      cashBesides: number;
    };
  };
  warnings: string[];
}

const DAY = 86_400_000;
export const MAX_DAYS_BEFORE_START = 92;
const r0 = (n: number) => Math.round(n);
const rr = (a: Range): Range => [r0(a[0]), r0(a[1])];
const mul = (a: Range, k: number): Range => [a[0] * k, a[1] * k];
const add = (...xs: Range[]): Range => xs.reduce<Range>((acc, x) => [acc[0] + x[0], acc[1] + x[1]], [0, 0]);
const fixed = (n: number): Range => [n, n];

const parseDay = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return NaN;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(t);
  return d.getUTCMonth() === Number(m[2]) - 1 ? t : NaN;
};
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** Last day of the month `monthsAfter` months after the start month. */
export const firstPayDate = (start: string, monthsAfter = CURRENT_PARAMS.costs.firstPayMonthsAfterStart) => {
  const d = new Date(parseDay(start));
  return isoDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthsAfter + 1, 0));
};

export const isValidDay = (s: string) => Number.isFinite(parseDay(s));

export const computeBudget = (input: BudgetInput, city: PublicCity, P: BudgetParams = CURRENT_PARAMS): BudgetResult => {
  const c = P.costs;
  const warnings: string[] = [];
  const adults = input.household === 'single' ? 1 : 2;
  const kids = input.household === 'family' ? Math.max(1, Math.min(6, Math.round(input.children || 1))) : 0;
  const people = adults + kids;

  // A WG is for single people or couples; families get a flat.
  let housing: Housing = input.housing;
  if (housing === 'wg' && kids > 0) {
    housing = 'flat';
    warnings.push('WG_FAMILY');
  }

  // ─── Net salary ───────────────────────────────────────────────────────
  const net = estimatePayroll(
    { grossMonthly: input.gross, taxClass: input.taxClass, state: input.state, church: input.church, children: kids, age: input.age, zusatzbeitrag: input.zusatzbeitrag },
    P.payroll,
  );
  if (net.midijob) warnings.push('MIDIJOB');
  if (input.taxClass === 3 && input.household === 'single') warnings.push('CLASS3_SINGLE');

  // ─── Timeline ─────────────────────────────────────────────────────────
  const startT = parseDay(input.start);
  let arrivalT = input.arrival ? parseDay(input.arrival) : NaN;
  if (!Number.isFinite(arrivalT)) arrivalT = startT - c.arrivalDaysBeforeStart * DAY;
  // Arrival after the start makes no sense; more than ~3 months before it is outside this model.
  arrivalT = Math.min(startT, Math.max(arrivalT, startT - MAX_DAYS_BEFORE_START * DAY));
  const payT = parseDay(firstPayDate(input.start, c.firstPayMonthsAfterStart));
  const daysUntilPay = Math.max(1, Math.round((payT - arrivalT) / DAY));
  const daysBeforeStart = Math.max(0, Math.round((startT - arrivalT) / DAY));
  const a = new Date(arrivalT);
  const p = new Date(payT);
  const monthsTouched = (p.getUTCFullYear() - a.getUTCFullYear()) * 12 + (p.getUTCMonth() - a.getUTCMonth()) + 1;
  const arrDay = a.getUTCDate();
  const dim = daysInMonth(a.getUTCFullYear(), a.getUTCMonth());
  // Rent: the rest of the arrival month (pro rata) + every month starting before the first salary.
  const rentMonths = (dim - arrDay + 1) / dim + (monthsTouched - 1);
  // Monthly tickets / phone plans: every month touched, except a late arrival month (single tickets then).
  const paidMonths = Math.max(1, monthsTouched - (arrDay > c.arrivalLateDay ? 1 : 0));
  const gapMonths = daysUntilPay / 30.44;

  // ─── Housing ──────────────────────────────────────────────────────────
  const flat = adults === 1 && kids === 0 ? city.flat1 : city.flat2;
  const flatFactor = kids >= 3 ? c.largeFamilyRentFactor : 1;
  let rent: Range;
  let depositBase: Range;
  let deposit: Range;
  if (housing === 'wg') {
    rent = mul(city.wg, adults);
    depositBase = rent;
    deposit = mul(rent, city.depositMonths);
  } else if (housing === 'flat') {
    const cold = mul(flat.cold, flatFactor);
    rent = add(cold, mul(flat.utilities, flatFactor));
    depositBase = cold;
    deposit = mul(cold, city.depositMonths);
  } else {
    rent = input.companyRent != null ? fixed(input.companyRent) : mul(city.company, adults);
    depositBase = rent;
    deposit = [rent[0] * c.companyDepositMonths[0], rent[1] * c.companyDepositMonths[1]];
  }
  rent = rr(rent);
  const foodMonthly = mul(city.food, adults + kids * c.childFoodFactor);
  const electricity = housing === 'flat' ? add(c.electricity.base, mul(c.electricity.perExtraPerson, people - 1)) : fixed(0);
  const internet = housing === 'flat' ? c.internet : fixed(0);
  const personal = mul(c.personalPerAdult, adults);
  const childCosts = mul(c.childPerMonth, kids);
  const liability = adults === 1 && kids === 0 ? c.liabilityYear.single : c.liabilityYear.household;
  const rundfunkMonthly: Range = housing === 'flat' ? fixed(c.rundfunkMonthly) : [0, c.rundfunkMonthly];

  // ─── One-off costs until the first salary ─────────────────────────────
  const furniture =
    housing === 'wg' ? c.furniture.wg : housing === 'company' ? c.furniture.company : add(c.furniture.flat, mul(c.furniture.flatPerExtraPerson, people - 1));
  const healthMonths = daysBeforeStart > 0 ? Math.ceil(daysBeforeStart / 30) : 0;
  const oneOffItems: Line<OneOffKey>[] = [
    { key: 'deposit', amount: rr(deposit), meta: { months: city.depositMonths, baseMin: r0(depositBase[0]), baseMax: r0(depositBase[1]) } },
    { key: 'rent', amount: rr(mul(rent, rentMonths)), meta: { months: Math.round(rentMonths * 10) / 10 } },
    { key: 'furniture', amount: rr(furniture) },
    { key: 'transport', amount: rr(fixed(city.transport * adults * paidMonths)), meta: { months: paidMonths, tickets: adults, price: city.transport } },
    { key: 'phone', amount: rr(add(mul(c.sim.starter, adults), mul(c.sim.monthlyPerAdult, adults * paidMonths))), meta: { months: paidMonths } },
    { key: 'rundfunk', amount: housing === 'flat' ? rr(fixed(c.rundfunkMonthly * 3)) : rr([0, c.rundfunkMonthly]), meta: { monthly: c.rundfunkMonthly } },
    { key: 'liability', amount: rr(liability) },
    { key: 'healthGap', amount: rr(mul(c.incomingInsuranceMonthly, people * healthMonths)), meta: { days: daysBeforeStart, people } },
    { key: 'food', amount: rr(mul(foodMonthly, gapMonths)), meta: { weeks: Math.round((daysUntilPay / 7) * 10) / 10, people } },
    { key: 'living', amount: rr(mul(add(electricity, internet, personal, childCosts), gapMonths)), meta: { months: Math.round(gapMonths * 10) / 10 } },
  ];
  const oneOffTotal = rr(add(...oneOffItems.map((l) => l.amount)));

  // ─── Monthly budget after the first salary ────────────────────────────
  const monthlyItems: Line<MonthlyKey>[] = (
    [
      { key: 'rent', amount: rent },
      { key: 'electricity', amount: rr(electricity) },
      { key: 'internet', amount: rr(internet) },
      { key: 'phone', amount: rr(mul(c.sim.monthlyPerAdult, adults)) },
      { key: 'food', amount: rr(foodMonthly), meta: { people } },
      { key: 'transport', amount: rr(fixed(city.transport * adults)), meta: { tickets: adults } },
      { key: 'rundfunk', amount: [Math.round(rundfunkMonthly[0] * 100) / 100, Math.round(rundfunkMonthly[1] * 100) / 100] as Range },
      { key: 'insurance', amount: rr(mul(liability, 1 / 12)) },
      { key: 'children', amount: rr(childCosts), meta: { children: kids } },
      { key: 'personal', amount: rr(personal) },
    ] as Line<MonthlyKey>[]
  ).filter((l) => l.amount[1] > 0);
  const monthlyTotal = rr(add(...monthlyItems.map((l) => l.amount)));
  const kindergeld = kids * c.kindergeld;
  const income = Math.round((net.net + kindergeld) * 100) / 100;
  const remaining: Range = [r0(income - monthlyTotal[1]), r0(income - monthlyTotal[0])];
  if (remaining[0] < 0) warnings.push('MONTHLY_DEFICIT');

  // ─── How much money to bring ──────────────────────────────────────────
  const high = oneOffTotal[1];
  const roundUp = (n: number) => Math.ceil(n / c.buffer.roundTo) * c.buffer.roundTo;
  const buffer = roundUp(Math.max(c.buffer.min, high * c.buffer.percent));
  const recommended = roundUp(high + buffer);
  let blockedAccount: BudgetResult['bring']['blockedAccount'] = null;
  if (input.blockedAccountYear > 0) {
    const monthly = Math.round((input.blockedAccountYear / 12) * 100) / 100;
    const releasesBeforePay = Math.max(0, monthsTouched - 1);
    const releasedBeforePay = Math.round(monthly * releasesBeforePay);
    const upfront = ['deposit', 'furniture', 'healthGap', 'liability'];
    const running = oneOffItems.filter((l) => !upfront.includes(l.key)).reduce((s, l) => s + l.amount[1], 0);
    const covered = Math.min(releasedBeforePay, running);
    blockedAccount = { year: input.blockedAccountYear, monthly, releasesBeforePay, releasedBeforePay, covered, cashBesides: roundUp(Math.max(0, recommended - covered)) };
  }

  return {
    year: P.year,
    checkedAt: city.checkedAt,
    input: { ...input, children: kids, housingUsed: housing },
    adults,
    children: kids,
    net,
    timeline: {
      arrival: isoDay(arrivalT),
      start: isoDay(startT),
      firstPay: isoDay(payT),
      daysUntilPay,
      weeksUntilPay: Math.round((daysUntilPay / 7) * 10) / 10,
      monthsTouched,
      daysBeforeStart,
    },
    oneOff: { items: oneOffItems, total: oneOffTotal },
    monthly: { items: monthlyItems, total: monthlyTotal, income: { net: net.net, kindergeld, total: income }, remaining },
    bring: { recommended, buffer, blockedAccount },
    warnings,
  };
};
