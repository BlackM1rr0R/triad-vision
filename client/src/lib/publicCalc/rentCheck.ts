/**
 * Fair rent check (/rent-check): compares a cold rent per m² with the typical new-contract range of the city.
 * Pure; the city ranges come from the CityCost table (Admin → Şəhər xərcləri, GET /api/budget/config: 1-room flat
 * of 35 m² and 2-room flat of 55 m², monthly cold rent and utilities). Unit-tested in server/tests/unit/publicCalc.test.ts.
 *
 * The comparison is an orientation heuristic, not the legal "ortsübliche Vergleichsmiete" (that is set by the local
 * Mietspiegel). Mietpreisbremse (§556d ff. BGB, extended until 31.12.2029): in areas the state has designated, the
 * rent at the start of a new contract may be at most 10 % above the local comparative rent; exceptions: first letting
 * of new buildings after 1 Oct 2014, first letting after comprehensive modernisation, a higher previous rent (§556e, §556f BGB).
 */

export type Range = readonly [number, number];
export type Condition = 'newBuild' | 'modernised' | 'standard' | 'basic';
export type Verdict = 'cheap' | 'normal' | 'expensive' | 'veryExpensive';
export type UtilitiesVerdict = 'low' | 'normal' | 'high';

export const RENT_CHECKED = '2026-11-16';
/** m² of the CityCost reference flats (server/src/lib/budget/cities.ts). */
export const FLAT1_M2 = 35;
export const FLAT2_M2 = 55;

/** Typical per-m² level by condition relative to an average flat (heuristic). */
export const CONDITION_FACTOR: Record<Condition, number> = { newBuild: 1.15, modernised: 1.05, standard: 1, basic: 0.9 };

export interface CityRents {
  /** Monthly cold rent of the 35 m² / 55 m² reference flats. */
  flat1Cold: Range;
  flat2Cold: Range;
  /** Monthly utilities (incl. heating) of the reference flats. */
  flat1Util: Range;
  flat2Util: Range;
}

export interface RentInput {
  sizeM2: number;
  cold: number;
  /** Warm rent (cold + Nebenkosten incl. heating); 0 = not known. */
  warm: number;
  condition: Condition;
}

export interface RentResult {
  coldPerM2: number;
  expectedPerM2: Range;
  expectedCold: Range;
  verdict: Verdict;
  /** Cold rent minus the upper end of the range (≥ 0 only when above). */
  overTop: number;
  utilitiesPerM2: number | null;
  utilitiesExpectedPerM2: Range;
  utilitiesVerdict: UtilitiesVerdict | null;
  /** Mietpreisbremse exception likely (new build / comprehensive modernisation). */
  bremseException: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const per = (x: Range, m2: number): Range => [x[0] / m2, x[1] / m2];

/** Per-m² cold range for a flat size: small flats cost more per m² (≤ 40 m²: 1-room rate, ≥ 70 m²: 2-room rate − 5 %, linear between). */
export const perM2Range = (c: CityRents, sizeM2: number): Range => {
  const one = per(c.flat1Cold, FLAT1_M2);
  const two = per(c.flat2Cold, FLAT2_M2);
  const big: Range = [two[0] * 0.95, two[1] * 0.95];
  if (sizeM2 <= 40) return one;
  if (sizeM2 <= 55) {
    const t = (sizeM2 - 40) / 15;
    return [one[0] + (two[0] - one[0]) * t, one[1] + (two[1] - one[1]) * t];
  }
  if (sizeM2 >= 70) return big;
  const t = (sizeM2 - 55) / 15;
  return [two[0] + (big[0] - two[0]) * t, two[1] + (big[1] - two[1]) * t];
};

export const utilitiesPerM2Range = (c: CityRents): Range => {
  const a = per(c.flat1Util, FLAT1_M2);
  const b = per(c.flat2Util, FLAT2_M2);
  return [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
};

export const checkRent = (c: CityRents, i: RentInput): RentResult | null => {
  if (!(i.sizeM2 >= 8 && i.sizeM2 <= 400) || !(i.cold > 0)) return null;
  const f = CONDITION_FACTOR[i.condition] ?? 1;
  const base = perM2Range(c, i.sizeM2);
  const expectedPerM2: Range = [r2(base[0] * f), r2(base[1] * f)];
  const coldPerM2 = r2(i.cold / i.sizeM2);
  const expectedCold: Range = [Math.round(expectedPerM2[0] * i.sizeM2), Math.round(expectedPerM2[1] * i.sizeM2)];
  const verdict: Verdict =
    coldPerM2 < expectedPerM2[0] ? 'cheap' : coldPerM2 <= expectedPerM2[1] ? 'normal' : coldPerM2 <= expectedPerM2[1] * 1.1 ? 'expensive' : 'veryExpensive';
  const util = utilitiesPerM2Range(c);
  const utilitiesExpectedPerM2: Range = [r2(util[0]), r2(util[1])];
  const utilitiesPerM2 = i.warm > i.cold ? r2((i.warm - i.cold) / i.sizeM2) : null;
  const utilitiesVerdict: UtilitiesVerdict | null =
    utilitiesPerM2 == null ? null : utilitiesPerM2 < utilitiesExpectedPerM2[0] ? 'low' : utilitiesPerM2 <= utilitiesExpectedPerM2[1] ? 'normal' : 'high';
  return {
    coldPerM2,
    expectedPerM2,
    expectedCold,
    verdict,
    overTop: Math.max(0, Math.round(i.cold - expectedCold[1])),
    utilitiesPerM2,
    utilitiesExpectedPerM2,
    utilitiesVerdict,
    bremseException: i.condition === 'newBuild' || i.condition === 'modernised',
  };
};
