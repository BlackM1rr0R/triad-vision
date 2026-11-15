import type { BudgetResult, MonthlyKey } from '../budget/budget.js';
import type { Range } from '../budget/params.js';

/**
 * "Life in Germany" simulator maths (pure, unit tested): turns the monthly part of the first-month budget
 * (lib/budget/budget.ts — net salary from the payroll engine, rent by city and household, food, Deutschlandticket,
 * electricity, internet, phone, Rundfunkbeitrag, liability insurance, personal and child costs) into the
 * categories of the chart, adds household contents insurance for a flat, computes what is left to save, and
 * converts everything to AZN with the CBAR rate. Amounts are [low, high] EUR ranges; the chart uses the middle.
 */

export const LIFE_CATEGORIES = ['rent', 'utilities', 'food', 'transport', 'phoneInternet', 'insurance', 'personal'] as const;
export type LifeCategory = (typeof LIFE_CATEGORIES)[number];

/** Budget line → simulator category. */
export const CATEGORY_OF: Record<MonthlyKey, LifeCategory> = {
  rent: 'rent',
  electricity: 'utilities',
  rundfunk: 'utilities',
  food: 'food',
  transport: 'transport',
  phone: 'phoneInternet',
  internet: 'phoneInternet',
  insurance: 'insurance',
  children: 'personal',
  personal: 'personal',
};

/**
 * Household contents insurance (Hausratversicherung) for a rented flat, EUR per month: typical online tariffs for
 * 35–70 m² in 2026. Not in the first-month budget (optional there), but part of normal monthly life.
 */
export const CONTENTS_INSURANCE: Range = [4, 10];

export interface LifeLine {
  key: LifeCategory;
  amount: Range;
  /** middle of the range, rounded (chart value) */
  mid: number;
}

export interface LifeMoney {
  eur: number;
  azn: number | null;
}

export interface LifeSimulation {
  gross: number;
  net: number;
  kindergeld: number;
  income: number;
  /** deductions = gross − net (tax + social insurance) */
  deductions: number;
  lines: LifeLine[];
  costs: Range;
  costsMid: number;
  /** income − costs: [worst, best] and the middle */
  savings: Range;
  savingsMid: number;
  /** share of the net income left (middle), 0–1, may be negative */
  savingsRate: number;
  azn: {
    rate: number | null;
    gross: number | null;
    net: number | null;
    income: number | null;
    costs: number | null;
    savings: number | null;
    lines: Partial<Record<LifeCategory, number>>;
  };
}

const r0 = Math.round;
const mid = (a: Range) => r0((a[0] + a[1]) / 2);

export const simulateLife = (b: Pick<BudgetResult, 'net' | 'monthly' | 'input'>, rate: number | null): LifeSimulation => {
  const sums = new Map<LifeCategory, Range>();
  for (const l of b.monthly.items) {
    const k = CATEGORY_OF[l.key];
    const cur = sums.get(k) ?? [0, 0];
    sums.set(k, [cur[0] + l.amount[0], cur[1] + l.amount[1]]);
  }
  if (b.input.housingUsed === 'flat') {
    const cur = sums.get('insurance') ?? [0, 0];
    sums.set('insurance', [cur[0] + CONTENTS_INSURANCE[0], cur[1] + CONTENTS_INSURANCE[1]]);
  }
  const lines: LifeLine[] = LIFE_CATEGORIES.filter((k) => (sums.get(k)?.[1] ?? 0) > 0).map((k) => {
    const a = sums.get(k)!;
    const amount: Range = [r0(a[0]), r0(a[1])];
    return { key: k, amount, mid: mid(amount) };
  });
  const costs: Range = [lines.reduce((s, l) => s + l.amount[0], 0), lines.reduce((s, l) => s + l.amount[1], 0)];
  const costsMid = lines.reduce((s, l) => s + l.mid, 0);
  const income = Math.round(b.monthly.income.total * 100) / 100;
  const savings: Range = [r0(income - costs[1]), r0(income - costs[0])];
  const savingsMid = r0(income - costsMid);
  const conv = (eur: number) => (rate ? r0(eur * rate) : null);
  return {
    gross: b.net.gross,
    net: b.net.net,
    kindergeld: b.monthly.income.kindergeld,
    income,
    deductions: Math.round((b.net.gross - b.net.net) * 100) / 100,
    lines,
    costs,
    costsMid,
    savings,
    savingsMid,
    savingsRate: income > 0 ? Math.round((savingsMid / income) * 1000) / 1000 : 0,
    azn: {
      rate,
      gross: conv(b.net.gross),
      net: conv(b.net.net),
      income: conv(income),
      costs: conv(costsMid),
      savings: conv(savingsMid),
      lines: rate ? Object.fromEntries(lines.map((l) => [l.key, r0(l.mid * rate)])) : {},
    },
  };
};

export interface BakuComparison {
  /** gross AZN per month in Baku / Azerbaijan */
  grossAzn: number;
  kind: 'profession' | 'national';
  year: number | null;
  source: string;
  /** German gross / Baku gross (e.g. 4.2 = 4.2 times), one decimal */
  grossRatio: number | null;
  /** German savings left (AZN) / Baku gross: how many Baku salaries the monthly savings are */
  savingsInBakuSalaries: number | null;
}

/** Comparison with a typical Baku salary; null when switched off, no figure exists or no rate is known. */
export const bakuComparison = (
  sim: Pick<LifeSimulation, 'azn'>,
  ref: { enabled: boolean; profession?: { grossAzn: number | null; note: string } | null; national: { grossAzn: number | null; year: number; source: string } },
): BakuComparison | null => {
  if (!ref.enabled || !sim.azn.rate || sim.azn.gross == null) return null;
  const prof = ref.profession?.grossAzn && ref.profession.grossAzn > 0 ? ref.profession : null;
  const grossAzn = prof?.grossAzn ?? ref.national.grossAzn;
  if (!grossAzn || grossAzn <= 0) return null;
  const one = (n: number) => Math.round(n * 10) / 10;
  return {
    grossAzn: Math.round(grossAzn),
    kind: prof ? 'profession' : 'national',
    year: prof ? null : ref.national.year,
    source: prof ? prof.note : ref.national.source,
    grossRatio: one(sim.azn.gross / grossAzn),
    savingsInBakuSalaries: sim.azn.savings != null ? one(sim.azn.savings / grossAzn) : null,
  };
};
