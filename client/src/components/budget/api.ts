import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { L10n } from '@/lib/types';

/** Types and hooks of the first-month budget (GET /api/budget/*; shapes of server/src/lib/budget). */

export type Range = [number, number];
export type Household = 'single' | 'couple' | 'family';
export type Housing = 'wg' | 'flat' | 'company';
export type TaxClass = 1 | 3 | 4;
export type SizeClass = 'METRO' | 'LARGE' | 'MEDIUM' | 'SMALL';

export const FEDERAL_STATES = ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'] as const;
export type FederalState = (typeof FEDERAL_STATES)[number];
/** German state names (proper names, identical in every language). */
export const STATE_NAMES: Record<FederalState, string> = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};

export interface BudgetCity {
  slug: string;
  name: string;
  kind: 'CITY' | 'GENERIC';
  state: FederalState | null;
  sizeClass: SizeClass;
  wg: Range;
  flat1: { cold: Range; utilities: Range };
  flat2: { cold: Range; utilities: Range };
  company: Range;
  food: Range;
  transport: number;
  depositMonths: number;
  sourceNote: string | null;
  checkedAt: string;
}

export interface BudgetVisa {
  slug: string;
  title: L10n;
  visaLabel: string;
  salaryMin: number | null;
  salaryMax: number | null;
  blockedAccount: number;
}

export interface BudgetConfig {
  year: number;
  checkedAt: string;
  cities: BudgetCity[];
  visas: BudgetVisa[];
  defaults: { start: string; gross: number; city: string | null };
  params: {
    averageZusatzbeitrag: number;
    deutschlandticket: number;
    rundfunk: number;
    kindergeld: number;
    blockedAccountYear: number;
    arrivalDaysBeforeStart: number;
    firstPayMonthsAfterStart: number;
  };
}

export type OneOffKey = 'deposit' | 'rent' | 'furniture' | 'transport' | 'phone' | 'rundfunk' | 'liability' | 'healthGap' | 'food' | 'living';
export type MonthlyKey = 'rent' | 'electricity' | 'internet' | 'phone' | 'food' | 'transport' | 'rundfunk' | 'insurance' | 'children' | 'personal';
export interface Line<K extends string> {
  key: K;
  amount: Range;
  meta?: Record<string, number | string>;
}

export interface BudgetResult {
  year: number;
  checkedAt: string;
  input: {
    gross: number;
    taxClass: TaxClass;
    church: boolean;
    age: number;
    zusatzbeitrag?: number;
    state: FederalState;
    household: Household;
    children: number;
    housing: Housing;
    housingUsed: Housing;
    companyRent: number | null;
    start: string;
    arrival: string | null;
    blockedAccountYear: number;
  };
  adults: number;
  children: number;
  net: {
    year: number;
    gross: number;
    incomeTax: number;
    soli: number;
    churchTax: number;
    pension: number;
    unemployment: number;
    health: number;
    care: number;
    social: number;
    net: number;
    careRate: number;
    zusatzbeitrag: number;
    midijob: boolean;
  };
  timeline: { arrival: string; start: string; firstPay: string; daysUntilPay: number; weeksUntilPay: number; monthsTouched: number; daysBeforeStart: number };
  oneOff: { items: Line<OneOffKey>[]; total: Range };
  monthly: { items: Line<MonthlyKey>[]; total: Range; income: { net: number; kindergeld: number; total: number }; remaining: Range };
  bring: {
    recommended: number;
    buffer: number;
    blockedAccount: null | { year: number; monthly: number; releasesBeforePay: number; releasedBeforePay: number; covered: number; cashBesides: number };
  };
  warnings: string[];
  city: BudgetCity;
  visa: { slug: string; title: L10n; visaLabel: string; blockedAccount: number } | null;
  /** Canonical query string of the inputs (share link / PDF). */
  share: string;
}

export interface BudgetPrefill {
  hasCase: boolean;
  prefill: Partial<Record<'gross' | 'city' | 'place' | 'start' | 'arrival' | 'visa' | 'household' | 'children', string | number>>;
  sources: Partial<Record<'gross' | 'city' | 'start' | 'arrival' | 'household', string>>;
}

export const useBudgetConfig = () =>
  useQuery({ queryKey: ['budget', 'config'], queryFn: async () => (await api.get<BudgetConfig>('/budget/config')).data, staleTime: 5 * 60 * 1000 });

export const useBudgetEstimate = (query: string | null) =>
  useQuery({
    queryKey: ['budget', 'estimate', query],
    queryFn: async () => (await api.get<BudgetResult>(`/budget/estimate?${query}`)).data,
    enabled: query !== null,
    placeholderData: (prev) => prev,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

export const useBudgetPrefill = (enabled: boolean) =>
  useQuery({ queryKey: ['budget', 'me'], queryFn: async () => (await api.get<BudgetPrefill>('/budget/me')).data, enabled, staleTime: 60 * 1000 });

/** Query keys the page keeps in the URL (same names as the API). */
export const QUERY_KEYS = ['city', 'place', 'state', 'gross', 'household', 'children', 'taxClass', 'church', 'age', 'zusatz', 'housing', 'companyRent', 'start', 'arrival', 'visa', 'blocked'] as const;
export type QueryKey = (typeof QUERY_KEYS)[number];
export type BudgetForm = Partial<Record<QueryKey, string>>;

/** Builds /budget?… for links from vacancy / visa pages (gross = middle of the salary range). */
export const budgetHref = (o: { gross?: number | null; grossMax?: number | null; place?: string | null; visa?: string | null; base?: string } = {}) => {
  const p = new URLSearchParams();
  const lo = o.gross && o.gross > 0 ? o.gross : null;
  const hi = o.grossMax && o.grossMax > 0 ? o.grossMax : null;
  const gross = lo && hi ? Math.round((lo + hi) / 2) : lo ?? hi;
  if (gross) p.set('gross', String(gross));
  if (o.place) p.set('place', o.place);
  if (o.visa) p.set('visa', o.visa);
  const q = p.toString();
  return `${o.base ?? '/budget'}${q ? `?${q}` : ''}`;
};
