/**
 * Tax refund estimate for employees (Steuererklärung, /tax-refund-calculator). Pure; the wage tax withheld and the
 * tariff come from the site's single payroll engine (server/src/lib/budget/payroll.ts: BMF Programmablaufplan 2026,
 * §32a EStG tariff). Unit-tested in server/tests/unit/publicCalc.test.ts.
 *
 * Withheld: the monthly wage tax / soli / church tax of the payroll engine × months worked (the employer withholds
 * as if the monthly wage were earned all year — which is why newcomers who start mid-year often get money back).
 * Due: income tax assessment of the year (Veranlagung), simplified:
 *   wage − max(Arbeitnehmer-Pauschbetrag 1,230 €, Werbungskosten) − Vorsorgeaufwendungen − Sonderausgaben,
 *   §32a tariff (married: splitting), Progressionsvorbehalt for foreign wages of the same year before moving
 *   (§32b Abs. 1 Nr. 2 EStG), soli with Freigrenze, church tax 8 / 9 %.
 * Not modelled: children (Kinderfreibetrag / Kindergeld), other incomes, Lohnersatzleistungen, extraordinary burdens,
 * household services, Verpflegungsmehraufwand, the 4,500 € cap exemption details for public transport.
 *
 * Figures (checked 2026-11 against gesetze-im-internet.de, §9, §9a, §4 Nr. 6b EStG):
 *  - Entfernungspauschale 0.38 € per full km from the first km (§9 Abs. 1 S. 3 Nr. 4 EStG as of 2026), max 4,500 €
 *    a year unless an own / provided car is used.
 *  - Homeoffice-Tagespauschale 6 € per day, max 210 days = 1,260 € (§4 Abs. 5 S. 1 Nr. 6c EStG).
 *  - Doppelte Haushaltsführung: accommodation max 1,000 € per month; one family-home trip per week at 0.38 € per km.
 *  - Arbeitnehmer-Pauschbetrag 1,230 € (§9a S. 1 Nr. 1a EStG); Sonderausgaben-Pauschbetrag 36 € / 72 € married.
 *  - Vorsorgeaufwendungen: employee pension contribution in full (§10 Abs. 3 EStG); basic health contribution
 *    reduced by 4 % (sick-pay share) plus care in full; with unemployment insurance up to 1,900 € per person.
 */
import { estimatePayroll, soliJahr, tariff, churchRateOf, type Steuerklasse, type PayrollResult } from '../../../../server/src/lib/budget/payroll';
import type { FederalState } from '../../../../server/src/lib/budget/params';

export const TAX_REFUND_RULES = {
  year: 2026,
  checked: '2026-11-16',
  perKm: 0.38,
  commuteCap: 4_500,
  homeOfficePerDay: 6,
  homeOfficeMaxDays: 210,
  secondHomeRentCap: 1_000,
  werbungskostenPauschbetrag: 1_230,
  sonderausgabenPauschbetrag: 36,
  vorsorgeOtherCap: 1_900,
  healthSickPayReduction: 0.04,
} as const;

export interface TaxRefundInput {
  grossMonthly: number;
  /** Months worked in Germany this year (1 – 12). */
  months: number;
  taxClass: Steuerklasse;
  state: FederalState;
  church: boolean;
  /** Married / civil partners assessed jointly (classes III / IV / V): the partner's yearly gross in Germany. */
  partnerGrossYear: number;
  commuteKm: number;
  commuteDays: number;
  /** Commuting by own / company car: no 4,500 € cap. */
  car: boolean;
  homeOfficeDays: number;
  equipment: number;
  unionFees: number;
  /** Double household: monthly rent of the second flat, months, one-way km to the family home and trips. */
  secondHomeRent: number;
  secondHomeMonths: number;
  homeTripKm: number;
  homeTrips: number;
  movingCosts: number;
  /** Wages earned abroad in the same year before moving (Progressionsvorbehalt). */
  foreignIncome: number;
}

export const DEFAULT_TAX_REFUND: TaxRefundInput = {
  grossMonthly: 3_000,
  months: 8,
  taxClass: 1,
  state: 'BE',
  church: false,
  partnerGrossYear: 0,
  commuteKm: 15,
  commuteDays: 120,
  car: false,
  homeOfficeDays: 0,
  equipment: 110,
  unionFees: 0,
  secondHomeRent: 0,
  secondHomeMonths: 0,
  homeTripKm: 0,
  homeTrips: 0,
  movingCosts: 0,
  foreignIncome: 0,
};

export interface WerbungskostenBreakdown {
  commute: number;
  homeOffice: number;
  equipment: number;
  union: number;
  secondHome: number;
  homeTrips: number;
  moving: number;
  total: number;
  /** Amount actually deducted: max(total, 1,230 €). */
  deducted: number;
  /** total ≤ Pauschbetrag: the receipts add nothing. */
  pauschbetragWins: boolean;
  commuteCapped: boolean;
}

export interface TaxRefundResult {
  married: boolean;
  wage: number;
  partnerWage: number;
  werbungskosten: WerbungskostenBreakdown;
  vorsorge: number;
  sonderausgaben: number;
  taxableIncome: number;
  withheld: { incomeTax: number; soli: number; church: number; total: number };
  due: { incomeTax: number; soli: number; church: number; total: number };
  /** Positive: refund; negative: back payment. */
  refund: number;
  /** Average tax rate applied (with Progressionsvorbehalt). */
  rate: number;
  progression: boolean;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);
const R = TAX_REFUND_RULES;

export const sanitizeTaxRefund = (i: TaxRefundInput): TaxRefundInput => ({
  ...i,
  grossMonthly: num(i.grossMonthly, 0, 30_000),
  months: Math.round(num(i.months, 1, 12)),
  taxClass: ([1, 2, 3, 4, 5].includes(i.taxClass) ? i.taxClass : 1) as Steuerklasse,
  partnerGrossYear: [3, 4, 5].includes(i.taxClass) ? num(i.partnerGrossYear, 0, 500_000) : 0,
  commuteKm: num(i.commuteKm, 0, 500),
  commuteDays: Math.round(num(i.commuteDays, 0, 260)),
  homeOfficeDays: Math.round(num(i.homeOfficeDays, 0, 260)),
  equipment: num(i.equipment, 0, 50_000),
  unionFees: num(i.unionFees, 0, 10_000),
  secondHomeRent: num(i.secondHomeRent, 0, 10_000),
  secondHomeMonths: Math.round(num(i.secondHomeMonths, 0, 12)),
  homeTripKm: num(i.homeTripKm, 0, 5_000),
  homeTrips: Math.round(num(i.homeTrips, 0, 53)),
  movingCosts: num(i.movingCosts, 0, 100_000),
  foreignIncome: num(i.foreignIncome, 0, 1_000_000),
});

export const werbungskosten = (i: TaxRefundInput): WerbungskostenBreakdown => {
  const commuteRaw = Math.floor(i.commuteKm) * R.perKm * i.commuteDays;
  const commuteCapped = !i.car && commuteRaw > R.commuteCap;
  const commute = round2(commuteCapped ? R.commuteCap : commuteRaw);
  const homeOffice = Math.min(i.homeOfficeDays, R.homeOfficeMaxDays) * R.homeOfficePerDay;
  const secondHome = round2(Math.min(i.secondHomeRent, R.secondHomeRentCap) * i.secondHomeMonths);
  const homeTrips = round2(Math.floor(i.homeTripKm) * R.perKm * i.homeTrips);
  const parts = { commute, homeOffice, equipment: round2(i.equipment), union: round2(i.unionFees), secondHome, homeTrips, moving: round2(i.movingCosts) };
  const total = round2(Object.values(parts).reduce((s, v) => s + v, 0));
  return { ...parts, total, deducted: Math.max(total, R.werbungskostenPauschbetrag), pauschbetragWins: total <= R.werbungskostenPauschbetrag, commuteCapped };
};

/** Deductible Vorsorgeaufwendungen of one employee for the contributions actually paid. */
export const vorsorgeOf = (p: PayrollResult, months: number) => {
  const pension = p.pension * months;
  const basic = p.health * months * (1 - R.healthSickPayReduction) + p.care * months;
  const withUnemployment = basic + p.unemployment * months;
  return round2(pension + Math.max(basic, Math.min(withUnemployment, R.vorsorgeOtherCap)));
};

const partnerClass = (c: Steuerklasse): Steuerklasse => (c === 3 ? 5 : c === 5 ? 3 : 4);

export const estimateTaxRefund = (input: TaxRefundInput): TaxRefundResult => {
  const i = sanitizeTaxRefund(input);
  const married = [3, 4, 5].includes(i.taxClass);
  const base = { state: i.state, church: i.church, children: 0, age: 30, lowWageRules: true } as const;
  const me = estimatePayroll({ ...base, grossMonthly: i.grossMonthly, taxClass: i.taxClass });
  const partner = married && i.partnerGrossYear > 0 ? estimatePayroll({ ...base, grossMonthly: i.partnerGrossYear / 12, taxClass: partnerClass(i.taxClass) }) : null;

  const wage = round2(i.grossMonthly * i.months);
  const partnerWage = partner ? round2(i.partnerGrossYear) : 0;
  const wk = werbungskosten(i);

  const withheldTax = round2(me.incomeTax * i.months + (partner ? partner.incomeTax * 12 : 0));
  const withheldSoli = round2(me.soli * i.months + (partner ? partner.soli * 12 : 0));
  const withheldChurch = round2(me.churchTax * i.months + (partner ? partner.churchTax * 12 : 0));

  const income = Math.max(0, wage - wk.deducted) + (partner ? Math.max(0, partnerWage - R.werbungskostenPauschbetrag) : 0);
  const vorsorge = round2(vorsorgeOf(me, i.months) + (partner ? vorsorgeOf(partner, 12) : 0));
  const sonderausgaben = round2(Math.max(withheldChurch, R.sonderausgabenPauschbetrag * (married ? 2 : 1)));
  const zvE = Math.max(0, Math.floor(income - vorsorge - sonderausgaben));

  const tax = (x: number) => (married ? 2 * tariff(Math.floor(x / 2)) : tariff(x));
  const progression = i.foreignIncome > 0 && zvE > 0;
  let incomeTax = tax(zvE);
  if (progression) {
    const rateBase = Math.floor(zvE + i.foreignIncome);
    incomeTax = Math.floor(zvE * (tax(rateBase) / rateBase));
  }
  const soli = soliJahr(incomeTax, married ? 3 : 1);
  const church = i.church ? round2(incomeTax * churchRateOf(i.state)) : 0;

  const withheld = { incomeTax: withheldTax, soli: withheldSoli, church: withheldChurch, total: round2(withheldTax + withheldSoli + withheldChurch) };
  const due = { incomeTax, soli, church, total: round2(incomeTax + soli + church) };
  return {
    married,
    wage,
    partnerWage,
    werbungskosten: wk,
    vorsorge,
    sonderausgaben,
    taxableIncome: zvE,
    withheld,
    due,
    refund: round2(withheld.total - due.total),
    rate: zvE > 0 ? incomeTax / zvE : 0,
    progression,
  };
};
