import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Types and hooks of "Life in Germany" (GET /api/life/*; shapes of server/src/lib/life). */

export type Range = [number, number];
export const LIFE_PROFESSIONS = ['driver', 'care', 'construction', 'technical', 'hospitality', 'it', 'logistics'] as const;
export type LifeProfession = (typeof LIFE_PROFESSIONS)[number];
export type Household = 'single' | 'couple' | 'family';
export type LifeCategory = 'rent' | 'utilities' | 'food' | 'transport' | 'phoneInternet' | 'insurance' | 'personal';
export const LIFE_CATEGORIES: LifeCategory[] = ['rent', 'utilities', 'food', 'transport', 'phoneInternet', 'insurance', 'personal'];

export interface EurAzn {
  rate: number;
  date: string;
  fetchedAt: string;
  stale: boolean;
  source: 'CBAR';
}

export interface LifeConfig {
  year: number;
  checkedAt: string;
  professions: { key: LifeProfession; grossMin: number; grossMax: number; gross: number; source: 'vacancies' | 'reference'; vacancies: number }[];
  cities: { slug: string; name: string; state: string | null }[];
  defaults: { profession: LifeProfession; city: string | null; household: Household; taxClass: 1 };
  params: { deutschlandticket: number; rundfunk: number; kindergeld: number };
  baku: { enabled: boolean; nationalAverage: { grossAzn: number | null; year: number; source: string } };
  rate: EurAzn | null;
}

export interface LifeEstimate {
  input: { profession: LifeProfession; city: string; household: Household; children: number; taxClass: 1 | 3 | 4; housing: 'wg' | 'flat'; gross: number; grossIsDefault: boolean };
  salary: { grossMin: number; grossMax: number; source: 'vacancies' | 'reference'; vacancies: number };
  city: { slug: string; name: string; state: string; checkedAt: string };
  payroll: { gross: number; incomeTax: number; soli: number; churchTax: number; social: number; net: number; midijob: boolean };
  sim: {
    gross: number;
    net: number;
    kindergeld: number;
    income: number;
    deductions: number;
    lines: { key: LifeCategory; amount: Range; mid: number }[];
    costs: Range;
    costsMid: number;
    savings: Range;
    savingsMid: number;
    savingsRate: number;
    azn: { rate: number | null; gross: number | null; net: number | null; income: number | null; costs: number | null; savings: number | null; lines: Partial<Record<LifeCategory, number>> };
  };
  baku: null | { grossAzn: number; kind: 'profession' | 'national'; year: number | null; source: string; grossRatio: number | null; savingsInBakuSalaries: number | null };
  rate: EurAzn | null;
  warnings: string[];
  year: number;
  share: string;
}

export interface LiveNumbers {
  enabled: boolean;
  showOnHome: boolean;
  showOnAbout: boolean;
  data: null | {
    month: string;
    period: 'current' | 'previous';
    visas: number | null;
    arrivals: number | null;
    professions: { key: string; labels: Record<string, string>; count: number }[];
    cities: { city: string; count: number }[];
    minCount: number;
    computedAt: string;
  };
}

export const useLifeConfig = () =>
  useQuery({ queryKey: ['life-config'], queryFn: async () => (await api.get<LifeConfig>('/life/config')).data, staleTime: 5 * 60 * 1000 });

export const useLifeEstimate = (query: string | null) =>
  useQuery({
    queryKey: ['life-estimate', query],
    queryFn: async () => (await api.get<LifeEstimate>(`/life/estimate?${query}`)).data,
    enabled: query !== null,
    placeholderData: (prev) => prev,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

export const useLiveNumbers = () =>
  useQuery({ queryKey: ['live-numbers'], queryFn: async () => (await api.get<LiveNumbers>('/life/live-numbers')).data, staleTime: 10 * 60 * 1000 });

/** Query keys of the simulator kept in the URL (same names as the API). */
export const LIFE_QUERY_KEYS = ['profession', 'city', 'household', 'children', 'taxClass', 'housing', 'gross'] as const;
export type LifeForm = Partial<Record<(typeof LIFE_QUERY_KEYS)[number], string>>;

/**
 * Deterministic money formatting (no Intl: Chrome has no "az" ICU data, Node has — server and browser would
 * render different text). Same grouping rules as lib/seoContent/types.ts formatEuro.
 */
export const formatAzn = (n: number, lng: string) => {
  const int = Math.round(Math.abs(n)).toString();
  const group = lng === 'en' ? ',' : lng === 'de' || lng === 'tr' ? '.' : ' ';
  return `${n < 0 ? '−' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, group)} ₼`;
};
