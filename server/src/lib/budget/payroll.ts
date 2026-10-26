import { CURRENT_PARAMS, type FederalState, type PayrollParams } from './params.js';

/**
 * Simplified German payroll estimate (employee in statutory health, care, pension and unemployment insurance).
 * Pure functions, unit tested against the official BMF "Prüftabelle" of the Programmablaufplan.
 *
 * Lohnsteuer follows the Programmablaufplan (PAP) for tax classes I, III and IV with these simplifications:
 * monthly pay period, no allowances (Freibeträge), no Faktorverfahren, no one-off payments, no
 * Versorgungsbezüge / Altersentlastungsbetrag, no private health insurance. The Midijob rules
 * (Übergangsbereich up to 2,000 € gross) are not modelled: the result is flagged instead.
 * Social contributions use the monthly contribution ceilings and the average Zusatzbeitrag.
 */

export type TaxClass = 1 | 3 | 4;
export const TAX_CLASSES: readonly TaxClass[] = [1, 3, 4];

export interface PayrollInput {
  grossMonthly: number;
  taxClass: TaxClass;
  state: FederalState;
  church: boolean;
  /** Children under 25 (Kinderfreibeträge for soli / church tax, care-insurance discount). */
  children: number;
  age: number;
  /** Total Zusatzbeitrag as a fraction (0.029 = 2.9 %); half is paid by the employee. */
  zusatzbeitrag?: number;
}

export interface PayrollResult {
  year: number;
  gross: number;
  incomeTax: number;
  soli: number;
  churchTax: number;
  pension: number;
  unemployment: number;
  health: number;
  care: number;
  /** Sum of the four social contributions. */
  social: number;
  net: number;
  /** Employee care rate actually applied (fraction). */
  careRate: number;
  zusatzbeitrag: number;
  /** Yearly values behind the monthly tax (for transparency). */
  yearly: { gross: number; vorsorgepauschale: number; taxableIncome: number; incomeTax: number };
  /** Gross in the Midijob range: real deductions are lower than shown. */
  midijob: boolean;
}

const floor2 = (n: number) => Math.floor(n * 100 + 1e-7) / 100;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** §32a EStG tariff (PAP UPTAB26) for one taxable income in full euros. */
export const tariff = (zvE: number, p: PayrollParams = CURRENT_PARAMS.payroll): number => {
  const t = p.tax;
  const x = Math.floor(Math.max(0, zvE));
  let st: number;
  if (x < t.gfb + 1) st = 0;
  else if (x < t.zone3From) {
    const y = (x - t.gfb) / 10_000;
    st = (t.zone2.a * y + t.zone2.b) * y;
  } else if (x < t.zone4From) {
    const y = (x - (t.zone3From - 1)) / 10_000;
    st = (t.zone3.a * y + t.zone3.b) * y + t.zone3.c;
  } else if (x < t.zone5From) st = x * t.zone4.rate - t.zone4.d;
  else st = x * t.zone5.rate - t.zone5.d;
  return Math.floor(st + 1e-7);
};

/** Employee care-insurance rate (PVSATZAN). */
export const careRate = (state: FederalState, children: number, age: number, p: PayrollParams = CURRENT_PARAMS.payroll): number => {
  const s = p.social;
  let rate = state === 'SN' ? s.careEmployeeSaxony : s.careEmployee;
  if (children <= 0) {
    if (age >= s.careChildlessFromAge) rate += s.careChildlessSurcharge;
  } else {
    rate -= Math.min(Math.max(children - 1, 0), s.careReductionMaxChildren) * s.careReductionPerChild;
  }
  return Math.round(rate * 1e6) / 1e6;
};

export interface LohnsteuerYear {
  vorsorgepauschale: number;
  taxableIncome: number;
  /** Jahreslohnsteuer (full euros). */
  incomeTax: number;
  /** Tax after the Freibeträge für Kinder: base of soli and church tax (JBMG). */
  surchargeBase: number;
}

/**
 * Jahreslohnsteuer per PAP (MZTABFB, UPEVP, MVSPHB, UPMLST) for a yearly gross in euros.
 * `pvRate` and `zusatzbeitrag` as fractions.
 */
export const lohnsteuerJahr = (
  grossYear: number,
  o: { taxClass: TaxClass; children: number; pvRate: number; zusatzbeitrag: number },
  p: PayrollParams = CURRENT_PARAMS.payroll,
): LohnsteuerYear => {
  const s = p.social;
  const t = p.tax;
  const zre4 = Math.max(0, floor2(grossYear));
  const kztab = o.taxClass === 3 ? 2 : 1;
  // MZTABFB: Arbeitnehmer-Pauschbetrag (at most the wage, rounded up) + Sonderausgaben-Pauschbetrag
  const anp = Math.min(t.anp, Math.ceil(zre4));
  const ztabfb = anp + t.sap;
  // Freibeträge für Kinder: class III counts the full amount per child (ZKF 1.0), class I half (ZKF 0.5),
  // class IV 1.0 × the half amount — 9,756 € resp. 4,878 € per child.
  const kfb = o.children > 0 ? o.children * (o.taxClass === 3 ? t.kfbFull : t.kfbHalf) : 0;

  // UPEVP: pension part + health / care part; MVSPHB: with the unemployment part, capped at 1,900 €.
  const rvBase = Math.min(zre4, s.bbgRvAlvYear);
  const kvBase = Math.min(zre4, s.bbgKvPvYear);
  const vspr = floor2(rvBase * s.pensionEmployee);
  const vspkvpv = floor2(kvBase * (o.zusatzbeitrag / 2 + s.healthReducedForVsp + o.pvRate));
  const vspalv = floor2(rvBase * s.unemploymentEmployee);
  const vspn = round2(vspr + Math.min(vspalv + vspkvpv, s.vspCap));
  const vsp = Math.max(round2(vspr + vspkvpv), vspn);

  const taxFor = (zve: number) => (zve < 1 ? 0 : tariff(Math.floor(zve / kztab), p) * kztab);
  const zve = Math.max(0, floor2(zre4 - ztabfb - vsp));
  const incomeTax = taxFor(zve);
  const surchargeBase = kfb > 0 ? taxFor(Math.max(0, zve - kfb)) : incomeTax;
  return { vorsorgepauschale: vsp, taxableIncome: zve, incomeTax, surchargeBase };
};

/** Yearly solidarity surcharge (MSOLZ) with Freigrenze and Milderungszone. */
export const soliJahr = (jbmg: number, taxClass: TaxClass, p: PayrollParams = CURRENT_PARAMS.payroll): number => {
  const free = p.soli.freigrenze * (taxClass === 3 ? 2 : 1);
  if (jbmg <= free) return 0;
  const full = floor2(jbmg * p.soli.rate);
  const min = floor2((jbmg - free) * p.soli.milderung);
  return Math.min(full, min);
};

export const churchRateOf = (state: FederalState, p: PayrollParams = CURRENT_PARAMS.payroll) =>
  p.church.lowStates.includes(state) ? p.church.low : p.church.default;

/** Monthly payroll estimate. */
export const estimatePayroll = (i: PayrollInput, p: PayrollParams = CURRENT_PARAMS.payroll): PayrollResult => {
  const s = p.social;
  const gross = Math.max(0, round2(Number.isFinite(i.grossMonthly) ? i.grossMonthly : 0));
  const children = Math.max(0, Math.min(15, Math.round(i.children || 0)));
  const zusatz = Math.max(0, Math.min(0.1, i.zusatzbeitrag ?? s.averageZusatzbeitrag));
  const pv = careRate(i.state, children, i.age, p);

  const year = lohnsteuerJahr(gross * 12, { taxClass: i.taxClass, children, pvRate: pv, zusatzbeitrag: zusatz }, p);
  // Monthly share of the yearly amounts (UPANTEIL: rounded down to the cent).
  const incomeTax = floor2(year.incomeTax / 12);
  const soli = floor2(soliJahr(year.surchargeBase, i.taxClass, p) / 12);
  const churchTax = i.church ? floor2((year.surchargeBase / 12) * churchRateOf(i.state, p)) : 0;

  const rvBase = Math.min(gross, s.bbgRvAlvYear / 12);
  const kvBase = Math.min(gross, s.bbgKvPvYear / 12);
  const pension = round2(rvBase * s.pensionEmployee);
  const unemployment = round2(rvBase * s.unemploymentEmployee);
  const health = round2(kvBase * (s.healthEmployee + zusatz / 2));
  const care = round2(kvBase * pv);
  const social = round2(pension + unemployment + health + care);
  const net = round2(gross - incomeTax - soli - churchTax - social);

  return {
    year: p.year,
    gross,
    incomeTax,
    soli,
    churchTax,
    pension,
    unemployment,
    health,
    care,
    social,
    net,
    careRate: pv,
    zusatzbeitrag: zusatz,
    yearly: { gross: round2(gross * 12), vorsorgepauschale: year.vorsorgepauschale, taxableIncome: year.taxableIncome, incomeTax: year.incomeTax },
    midijob: gross > 0 && gross <= p.midijobUpTo,
  };
};
