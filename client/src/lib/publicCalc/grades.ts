/**
 * Foreign grade → German grade (/grade-converter) with the "modifizierte bayerische Formel" of the
 * Kultusministerkonferenz: N = 1 + 3 · (Nmax − Nd) / (Nmax − Nmin), Nmax = best grade, Nmin = lowest pass grade,
 * Nd = the grade to convert. Pure (unit-tested in server/tests/unit/publicCalc.test.ts).
 *
 * The result is cut (not rounded) to one decimal, as the KMK "Vereinbarung über die Festsetzung der Gesamtnote bei
 * ausländischen Hochschulzugangszeugnissen" (15.03.1991 i.d.F. 12.09.2013, Nr. 4: "auf eine Stelle nach dem Komma
 * bestimmt; es wird nicht gerundet") prescribes (checked 2026-11-17), and kept within
 * 1.0 – 4.0. Universities and uni-assist decide officially; this is an orientation value.
 *
 * Azerbaijani scales (checked 2026-11, university regulations and admission guides):
 *  - School / attestat: 5-point scale, 5 = "əla" (excellent), 3 = lowest pass ("kafi"), 2 = fail.
 *  - University: 100-point scale, 51 = lowest pass, 91 – 100 = "əla" (A).
 */

export type GradeSystem = 'azSchool' | 'azUniversity' | 'custom';

export const GRADE_SYSTEMS: Record<Exclude<GradeSystem, 'custom'>, { max: number; min: number; step: number }> = {
  azSchool: { max: 5, min: 3, step: 0.01 },
  azUniversity: { max: 100, min: 51, step: 0.1 },
};

export type GermanBand = 'veryGood' | 'good' | 'satisfactory' | 'sufficient' | 'fail';

export interface GradeResult {
  /** Exact value of the formula (may be outside 1 – 4). */
  raw: number;
  /** One decimal, cut, within 1.0 – 4.0; null when the grade is below the pass mark. */
  german: number | null;
  band: GermanBand;
  passed: boolean;
}

/** German grade band (KMK / university practice): 1.0–1.5 sehr gut, 1.6–2.5 gut, 2.6–3.5 befriedigend, 3.6–4.0 ausreichend. */
export const bandOf = (g: number): Exclude<GermanBand, 'fail'> => (g <= 1.5 ? 'veryGood' : g <= 2.5 ? 'good' : g <= 3.5 ? 'satisfactory' : 'sufficient');

export const bavarianFormula = (nd: number, nmax: number, nmin: number) => 1 + (3 * (nmax - nd)) / (nmax - nmin);

/** Converts; returns null for invalid scales (max = min, non-finite numbers). Works for "lower is better" scales too. */
export const convertGrade = (nd: number, nmax: number, nmin: number): GradeResult | null => {
  if (![nd, nmax, nmin].every(Number.isFinite) || nmax === nmin) return null;
  const raw = bavarianFormula(nd, nmax, nmin);
  const higherIsBetter = nmax > nmin;
  const passed = higherIsBetter ? nd >= nmin : nd <= nmin;
  if (!passed) return { raw, german: null, band: 'fail', passed: false };
  const clamped = Math.min(4, Math.max(1, raw));
  // Cut to one decimal (1e-9 guards against 2.0 being represented as 1.9999999).
  const german = Math.floor(clamped * 10 + 1e-9) / 10;
  return { raw, german, band: bandOf(german), passed: true };
};

/** Average of single grades (e.g. the attestat's subject grades), ignoring empty / invalid entries. */
export const averageOf = (grades: number[]) => {
  const ok = grades.filter((g) => Number.isFinite(g));
  return ok.length ? ok.reduce((s, g) => s + g, 0) / ok.length : null;
};
