/**
 * German payslip (Lohnabrechnung) explainer, /payslip-explained: the lines of a simplified monthly payslip, every
 * amount taken from the site's single payroll engine (server/src/lib/budget/payroll.ts, estimatePayroll) — nothing is
 * computed here except the sums the engine's result already implies. Pure (unit-tested in
 * server/tests/unit/payslip.test.ts against estimatePayroll).
 */
import { estimatePayroll, churchRateOf, type PayrollResult, type Steuerklasse } from '../../../../server/src/lib/budget/payroll';
import { CURRENT_PARAMS, FEDERAL_STATES, type FederalState } from '../../../../server/src/lib/budget/params';

export interface PayslipInput {
  gross: number;
  taxClass: Steuerklasse;
  church: boolean;
  /** No children: the childless care surcharge (from age 23) applies. */
  childless: boolean;
  state: FederalState;
  /** Total Zusatzbeitrag of the health insurance fund (fraction, 0.029 = 2.9 %), half paid by the employee. */
  zusatzbeitrag: number;
  /** First name shown on the payslip (optional, default "Max"). */
  firstName: string;
}

const P = CURRENT_PARAMS.payroll;
/** Above the Übergangsbereich (Midijob) so every line follows the ordinary rules; a full-time minimum wage is ≈ 2,410 €. */
export const PAYSLIP_GROSS_MIN = 2_100;
export const PAYSLIP_GROSS_MAX = 15_000;
/** Age assumed for the example employee (the childless surcharge applies from 23). */
export const PAYSLIP_AGE = 30;

export const DEFAULT_PAYSLIP: PayslipInput = {
  gross: 3_000,
  taxClass: 1,
  church: false,
  childless: true,
  state: 'BE',
  zusatzbeitrag: P.social.averageZusatzbeitrag,
  firstName: '',
};

const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);

export const sanitizePayslip = (i: Partial<PayslipInput>): PayslipInput => {
  const tc = Math.round(Number(i.taxClass));
  return {
    gross: Math.round(clamp(Number(i.gross ?? DEFAULT_PAYSLIP.gross), PAYSLIP_GROSS_MIN, PAYSLIP_GROSS_MAX) * 100) / 100,
    taxClass: (tc >= 1 && tc <= 6 ? tc : 1) as Steuerklasse,
    church: Boolean(i.church),
    childless: i.childless ?? true,
    state: (FEDERAL_STATES as readonly string[]).includes(String(i.state)) ? (i.state as FederalState) : DEFAULT_PAYSLIP.state,
    zusatzbeitrag: Math.round(clamp(Number(i.zusatzbeitrag ?? DEFAULT_PAYSLIP.zusatzbeitrag), 0, 0.05) * 10_000) / 10_000,
    firstName: String(i.firstName ?? '')
      .replace(/[^\p{L}\p{M}' -]/gu, '')
      .trim()
      .slice(0, 30),
  };
};

export type PayslipLineKey =
  | 'brutto'
  | 'steuerBrutto'
  | 'svBrutto'
  | 'lohnsteuer'
  | 'soli'
  | 'kirchensteuer'
  | 'kv'
  | 'rv'
  | 'av'
  | 'pv'
  | 'netto'
  | 'auszahlung';

export interface PayslipLine {
  key: PayslipLineKey;
  /** German label as printed on a payslip. */
  label: string;
  amount: number;
  /** Rate of the line (fraction) when it has one: of the gross / base (social), of the Lohnsteuer (soli, church). */
  rate: number | null;
  kind: 'base' | 'tax' | 'social' | 'total';
}

export interface EmployerLine {
  key: 'kv' | 'rv' | 'av' | 'pv' | 'total' | 'cost';
  label: string;
  amount: number;
  rate: number | null;
}

export interface Payslip {
  input: PayslipInput;
  year: number;
  result: PayrollResult;
  lines: PayslipLine[];
  employer: EmployerLine[] | null;
  /** Sums shown as subtotals. */
  taxes: number;
  social: number;
  /** Bases after the ceilings (shown when the gross is above a ceiling). */
  capped: { pension: boolean; health: boolean };
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const buildPayslip = (raw: Partial<PayslipInput>): Payslip => {
  const input = sanitizePayslip(raw);
  const r = estimatePayroll({
    grossMonthly: input.gross,
    taxClass: input.taxClass,
    state: input.state,
    church: input.church,
    children: input.childless ? 0 : 1,
    age: PAYSLIP_AGE,
    zusatzbeitrag: input.zusatzbeitrag,
    lowWageRules: true,
  });
  const s = P.social;
  const healthRate = s.healthEmployee + r.zusatzbeitrag / 2;
  const lines: PayslipLine[] = [
    { key: 'brutto', label: 'Gesamtbrutto', amount: r.gross, rate: null, kind: 'base' },
    { key: 'steuerBrutto', label: 'Steuer-Brutto', amount: r.gross, rate: null, kind: 'base' },
    { key: 'svBrutto', label: 'SV-Brutto', amount: r.gross, rate: null, kind: 'base' },
    { key: 'lohnsteuer', label: 'Lohnsteuer', amount: r.incomeTax, rate: null, kind: 'tax' },
    { key: 'soli', label: 'Solidaritätszuschlag', amount: r.soli, rate: P.soli.rate, kind: 'tax' },
    { key: 'kirchensteuer', label: 'Kirchensteuer', amount: r.churchTax, rate: input.church ? churchRateOf(input.state) : null, kind: 'tax' },
    { key: 'kv', label: 'Krankenversicherung (KV)', amount: r.health, rate: healthRate, kind: 'social' },
    { key: 'rv', label: 'Rentenversicherung (RV)', amount: r.pension, rate: s.pensionEmployee, kind: 'social' },
    { key: 'av', label: 'Arbeitslosenversicherung (AV)', amount: r.unemployment, rate: s.unemploymentEmployee, kind: 'social' },
    { key: 'pv', label: 'Pflegeversicherung (PV)', amount: r.care, rate: r.careRate, kind: 'social' },
    { key: 'netto', label: 'Nettoverdienst', amount: r.net, rate: null, kind: 'total' },
    { key: 'auszahlung', label: 'Auszahlungsbetrag', amount: r.net, rate: null, kind: 'total' },
  ];
  const e = r.employer;
  const employer: EmployerLine[] | null = e
    ? [
        { key: 'kv', label: 'KV Arbeitgeberanteil', amount: e.health, rate: s.healthEmployer + r.zusatzbeitrag / 2 },
        { key: 'rv', label: 'RV Arbeitgeberanteil', amount: e.pension, rate: s.pensionEmployer },
        { key: 'av', label: 'AV Arbeitgeberanteil', amount: e.unemployment, rate: s.unemploymentEmployer },
        { key: 'pv', label: 'PV Arbeitgeberanteil', amount: e.care, rate: e.careRate },
        { key: 'total', label: 'Arbeitgeberanteile gesamt', amount: e.total, rate: null },
        { key: 'cost', label: 'Gesamtkosten Arbeitgeber', amount: round2(r.gross + e.total), rate: null },
      ]
    : null;
  return {
    input,
    year: r.year,
    result: r,
    lines,
    employer,
    taxes: round2(r.incomeTax + r.soli + r.churchTax),
    social: r.social,
    capped: { pension: r.bases.pension < r.gross, health: r.bases.health < r.gross },
  };
};

/** URL ⇄ input: ?gross=&class=&church=1&kids=1&state=&zb=&name= (all optional). */
export const payslipFromParams = (p: URLSearchParams): PayslipInput => {
  const zb = p.get('zb');
  return sanitizePayslip({
    gross: p.has('gross') ? Number(String(p.get('gross')).replace(',', '.')) : DEFAULT_PAYSLIP.gross,
    taxClass: (Number(p.get('class')) || 1) as Steuerklasse,
    church: p.get('church') === '1',
    childless: p.get('kids') !== '1',
    state: (p.get('state') ?? '').toUpperCase() as FederalState,
    zusatzbeitrag: zb ? Number(zb.replace(',', '.')) / 100 : DEFAULT_PAYSLIP.zusatzbeitrag,
    firstName: p.get('name') ?? '',
  });
};

export const payslipToParams = (i: PayslipInput): string => {
  const p = new URLSearchParams();
  if (i.gross !== DEFAULT_PAYSLIP.gross) p.set('gross', String(i.gross));
  if (i.taxClass !== 1) p.set('class', String(i.taxClass));
  if (i.church) p.set('church', '1');
  if (!i.childless) p.set('kids', '1');
  if (i.state !== DEFAULT_PAYSLIP.state) p.set('state', i.state);
  if (Math.abs(i.zusatzbeitrag - DEFAULT_PAYSLIP.zusatzbeitrag) > 1e-9) p.set('zb', String(Math.round(i.zusatzbeitrag * 1000) / 10));
  if (i.firstName) p.set('name', i.firstName);
  return p.toString();
};
