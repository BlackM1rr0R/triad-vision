import { CURRENT_PARAMS, type FederalState } from '@/lib/salary';
import { KASSEN, type Kasse } from './data';

/**
 * Employee contribution per health insurance fund: (general rate / 2 + Zusatzbeitrag / 2) × gross wage, the wage
 * capped at the Beitragsbemessungsgrenze. Pure and deterministic (also used in SSR). Care insurance (Pflege) is
 * the same in every fund and therefore left out of the comparison.
 */

const S = CURRENT_PARAMS.payroll.social;
/** General rate 14.6 % (§ 241 SGB V); employee and employer pay half each. */
export const GENERAL_RATE = Math.round(S.healthEmployee * 2 * 1000) / 10; // 14.6
export const AVERAGE_ZB = Math.round(S.averageZusatzbeitrag * 1000) / 10; // 2.9
export const BBG_MONTH = S.bbgKvPvYear / 12; // 5,812.50 €
export const GROSS_MIN = 0;
export const GROSS_MAX = 50_000;

export type ScopeFilter = 'all' | 'nationwide' | 'regional';

export interface CompareInput {
  /** Gross monthly wage in euro. */
  gross: number;
  /** The state the person works / lives in (regional funds outside it are left out). */
  state: FederalState;
  scope: ScopeFilter;
}

export interface CompareRow {
  kasse: Kasse;
  /** Employee share in percent (7.3 + Zusatzbeitrag / 2). */
  employeeRate: number;
  monthly: number;
  yearly: number;
  /** Positive: cheaper than the average Zusatzbeitrag (per year). */
  vsAverageYear: number;
  /** Savings against the most expensive fund in the list (per year, ≥ 0). */
  vsMaxYear: number;
}

export interface CompareResult {
  base: number;
  capped: boolean;
  rows: CompareRow[];
  average: { monthly: number; yearly: number };
  cheapest: CompareRow | null;
  priciest: CompareRow | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Funds a person in this state can join under the filter. */
export const availableKassen = (state: FederalState, scope: ScopeFilter, list: Kasse[] = KASSEN) =>
  list.filter((k) => (k.scope === 'nationwide' ? scope !== 'regional' : scope !== 'nationwide' && (k.states ?? []).includes(state)));

/** Employee contribution per month for a Zusatzbeitrag (percent) on a capped base. */
export const employeeMonthly = (base: number, zbPercent: number) => round2((base * (GENERAL_RATE / 2 + zbPercent / 2)) / 100);

export const compareKassen = (input: CompareInput, list: Kasse[] = KASSEN): CompareResult => {
  const gross = Number.isFinite(input.gross) ? Math.min(GROSS_MAX, Math.max(GROSS_MIN, input.gross)) : 0;
  const base = Math.min(gross, BBG_MONTH);
  const avgMonthly = employeeMonthly(base, AVERAGE_ZB);
  const funds = availableKassen(input.state, input.scope, list);
  const maxZb = funds.reduce((m, k) => Math.max(m, k.zb), 0);
  const maxYear = round2(employeeMonthly(base, maxZb) * 12);
  const rows = funds
    .map((kasse): CompareRow => {
      const monthly = employeeMonthly(base, kasse.zb);
      const yearly = round2(monthly * 12);
      return {
        kasse,
        employeeRate: Math.round((GENERAL_RATE / 2 + kasse.zb / 2) * 1000) / 1000,
        monthly,
        yearly,
        vsAverageYear: round2(avgMonthly * 12 - yearly),
        vsMaxYear: round2(maxYear - yearly),
      };
    })
    .sort((a, b) => a.kasse.zb - b.kasse.zb || a.kasse.name.localeCompare(b.kasse.name, 'de'));
  return {
    base: round2(base),
    capped: gross > BBG_MONTH,
    rows,
    average: { monthly: avgMonthly, yearly: round2(avgMonthly * 12) },
    cheapest: rows[0] ?? null,
    priciest: rows[rows.length - 1] ?? null,
  };
};
