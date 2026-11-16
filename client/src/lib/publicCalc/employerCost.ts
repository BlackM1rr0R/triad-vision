/**
 * Employer cost calculator (/employer-cost-calculator, B2B): gross salary → employer social contributions 2026,
 * total monthly / yearly cost, one-off costs of hiring from abroad and the cost of the vacancy. Pure; rates from
 * the site's payroll parameters (server/src/lib/budget/params.ts). Unit-tested in
 * server/tests/unit/publicCalcWork.test.ts.
 *
 * 2026 (checked 2026-11): pension 18.6 % (employer 9.3 %), unemployment 2.6 % (1.3 %), health 14.6 % (7.3 %) + half
 * the Zusatzbeitrag (average 2.9 %), care 3.6 % (employer 1.8 %, Saxony 1.3 %; the childless surcharge is paid by
 * the employee only). Ceilings: 8,450 € / month (pension, unemployment, U1 – U3), 5,812.50 € / month (health,
 * care). Insolvenzgeldumlage U3 0.15 % (§360 SGB III, no deviating ordinance for 2026). U1 / U2 (Aufwendungs-
 * ausgleichsgesetz) depend on the health insurer and the chosen refund rate; accident insurance (BG) on the trade —
 * both are visitor inputs with indicative defaults.
 * Minijob (≤ 603 €) and the Übergangsbereich (≤ 2,000 €) follow special rules: not modelled (flagged).
 *
 * One-off costs of international hiring: national visa 75 € (§46 Abs. 2 Nr. 1 AufenthV), accelerated skilled-
 * worker procedure §81a AufenthG 411 € (§47 Abs. 1 Nr. 15 AufenthV); recognition fees vary by authority (estimate
 * 100 – 600 €); relocation, housing support and an agency fee are visitor inputs — nothing is hard-coded.
 */
import { CURRENT_PARAMS } from '../../../../server/src/lib/budget/params';

export const EMPLOYER_COST_CHECKED = '2026-11-16';

const P = CURRENT_PARAMS.payroll;
export const EMPLOYER_RATES = {
  pension: P.social.pensionEmployer,
  unemployment: P.social.unemploymentEmployer,
  health: P.social.healthEmployer,
  care: P.social.careEmployer,
  careSaxony: P.social.careEmployerSaxony,
  averageZusatzbeitrag: P.social.averageZusatzbeitrag,
  u3: 0.0015,
  bbgRvMonth: P.social.bbgRvAlvYear / 12,
  bbgKvMonth: P.social.bbgKvPvYear / 12,
  minijobUpTo: P.minijobUpTo,
  midijobUpTo: P.midijobUpTo,
  visaFee: 75,
  acceleratedFee: 411,
  recognitionRange: [100, 600] as [number, number],
} as const;

export interface EmployerCostInput {
  grossMonthly: number;
  /** Salaries per year (12; 13 with a 13th salary …). */
  salariesPerYear: number;
  saxony: boolean;
  /** Total Zusatzbeitrag of the employee's health fund (fraction). */
  zusatzbeitrag: number;
  /** Umlage U1 (sick pay), U2 (maternity), accident insurance (BG) — fractions. */
  u1: number;
  u2: number;
  accident: number;
  /** Number of hires (one-off costs and vacancy cost are per hire). */
  hires: number;
  /** One-off, per hire. */
  visa: boolean;
  accelerated: boolean;
  recognition: number;
  relocation: number;
  /** Housing support per month × months. */
  housingMonthly: number;
  housingMonths: number;
  agencyFee: number;
  /** Cost of the vacancy: revenue / output lost per working day × working days the job stays open. */
  vacancyDailyLoss: number;
  vacancyDays: number;
}

export const DEFAULT_EMPLOYER_COST: EmployerCostInput = {
  grossMonthly: 3_200,
  salariesPerYear: 12,
  saxony: false,
  zusatzbeitrag: EMPLOYER_RATES.averageZusatzbeitrag,
  u1: 0.016,
  u2: 0.0044,
  accident: 0.013,
  hires: 1,
  visa: true,
  accelerated: true,
  recognition: 300,
  relocation: 0,
  housingMonthly: 0,
  housingMonths: 0,
  agencyFee: 0,
  vacancyDailyLoss: 0,
  vacancyDays: 0,
};

export interface EmployerCostResult {
  gross: number;
  lines: { pension: number; unemployment: number; health: number; care: number; u1: number; u2: number; u3: number; accident: number };
  /** Employer social costs per month. */
  social: number;
  /** Gross + employer social costs per month. */
  monthly: number;
  /** Per year (salaries per year × monthly). */
  yearly: number;
  /** Employer costs on top of the gross, in % of the gross. */
  surchargePct: number;
  oneOff: { visa: number; accelerated: number; recognition: number; relocation: number; housing: number; agency: number; total: number };
  /** All hires: first-year cost (yearly × hires + one-off × hires). */
  firstYear: number;
  vacancy: number;
  /** Months of salary cost the vacancy loss equals (null without a vacancy input). */
  vacancyMonths: number | null;
  lowWage: 'minijob' | 'midijob' | null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);

export const sanitizeEmployerCost = (i: EmployerCostInput): EmployerCostInput => ({
  grossMonthly: num(i.grossMonthly, 0, 50_000),
  salariesPerYear: num(i.salariesPerYear, 12, 14),
  saxony: !!i.saxony,
  zusatzbeitrag: num(i.zusatzbeitrag, 0, 0.1),
  u1: num(i.u1, 0, 0.1),
  u2: num(i.u2, 0, 0.05),
  accident: num(i.accident, 0, 0.15),
  hires: Math.round(num(i.hires, 1, 500)),
  visa: !!i.visa,
  accelerated: !!i.accelerated,
  recognition: num(i.recognition, 0, 10_000),
  relocation: num(i.relocation, 0, 100_000),
  housingMonthly: num(i.housingMonthly, 0, 10_000),
  housingMonths: Math.round(num(i.housingMonths, 0, 36)),
  agencyFee: num(i.agencyFee, 0, 100_000),
  vacancyDailyLoss: num(i.vacancyDailyLoss, 0, 1_000_000),
  vacancyDays: Math.round(num(i.vacancyDays, 0, 1_000)),
});

export const calculateEmployerCost = (input: EmployerCostInput): EmployerCostResult => {
  const i = sanitizeEmployerCost(input);
  const R = EMPLOYER_RATES;
  const gross = round2(i.grossMonthly);
  const rv = Math.min(gross, R.bbgRvMonth);
  const kv = Math.min(gross, R.bbgKvMonth);
  const lines = {
    pension: round2(rv * R.pension),
    unemployment: round2(rv * R.unemployment),
    health: round2(kv * (R.health + i.zusatzbeitrag / 2)),
    care: round2(kv * (i.saxony ? R.careSaxony : R.care)),
    u1: round2(rv * i.u1),
    u2: round2(rv * i.u2),
    u3: round2(rv * R.u3),
    accident: round2(gross * i.accident),
  };
  const social = round2(Object.values(lines).reduce((s, v) => s + v, 0));
  const monthly = round2(gross + social);
  // Special payments (13th salary) are charged like a monthly salary — an approximation above the ceilings.
  const yearly = round2(monthly * i.salariesPerYear);
  const oneOff = {
    visa: i.visa ? R.visaFee : 0,
    accelerated: i.accelerated ? R.acceleratedFee : 0,
    recognition: round2(i.recognition),
    relocation: round2(i.relocation),
    housing: round2(i.housingMonthly * i.housingMonths),
    agency: round2(i.agencyFee),
    total: 0,
  };
  oneOff.total = round2(oneOff.visa + oneOff.accelerated + oneOff.recognition + oneOff.relocation + oneOff.housing + oneOff.agency);
  const vacancy = round2(i.vacancyDailyLoss * i.vacancyDays * i.hires);
  return {
    gross,
    lines,
    social,
    monthly,
    yearly,
    surchargePct: gross > 0 ? round2((social / gross) * 100) : 0,
    oneOff,
    firstYear: round2((yearly + oneOff.total) * i.hires),
    vacancy,
    vacancyMonths: vacancy > 0 && monthly > 0 ? round2(vacancy / (monthly * i.hires)) : null,
    lowWage: gross > 0 && gross <= R.minijobUpTo ? 'minijob' : gross > 0 && gross <= R.midijobUpTo ? 'midijob' : null,
  };
};
