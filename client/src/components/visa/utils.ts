import { useMemo } from 'react';
import type { Service, VisaCategory } from '@/lib/types';
import { useL10n } from '@/lib/l10n';

/**
 * Approximate full-time statutory minimum wage in Germany, EUR gross per month.
 * Only used as a labelled, indicative reference line in charts — never as a legal figure.
 */
export const MIN_WAGE_MONTHLY = 2400;

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Rank of the first CEFR level in strings like "A2", "B1–B2"; Infinity when unknown. */
export const levelRank = (level?: string | null) => {
  const m = level?.toUpperCase().match(/[ABC][12]/);
  return m ? CEFR.indexOf(m[0]) : Number.POSITIVE_INFINITY;
};

export const isSeasonal = (v: VisaCategory) => /saison|season/i.test(v.visaLabel) || v.slug === 'landwirtschaft';
/** Trainee pay is not measured against the minimum wage (a minimum training allowance applies instead). */
export const isTrainee = (v: VisaCategory) => v.slug === 'ausbildung';

export const hasSalary = (v: VisaCategory): v is VisaCategory & { salaryMin: number; salaryMax: number } =>
  typeof v.salaryMin === 'number' && typeof v.salaryMax === 'number' && v.salaryMax > 0;
export const hasProcessing = (v: VisaCategory): v is VisaCategory & { processingMin: number; processingMax: number } =>
  typeof v.processingMin === 'number' && typeof v.processingMax === 'number' && v.processingMax > 0;

const NUM_LOCALE = {
  az: 'az-Latn-AZ',
  de: 'de-DE',
  en: 'en-GB',
  ru: 'ru-RU',
} as const;

/** Locale-aware "€2,800"-style formatter. */
export const useEuro = () => {
  const { locale } = useL10n();
  return useMemo(() => {
    const f = new Intl.NumberFormat(NUM_LOCALE[locale], {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    });
    const fmt = (n: number) => f.format(n);
    const range = (a: number, b: number) => `${fmt(a)} – ${fmt(b)}`;
    return { fmt, range };
  }, [locale]);
};

/** Which services matter most for a visa (by slug). Unknown visas fall back to the core trio. */
const VISA_SERVICES: Record<string, string[]> = {
  'lkw-fahrer': ['documents', 'visa-support', 'german-courses', 'arrival-integration'],
  kurierfahrer: ['german-courses', 'documents', 'visa-support', 'arrival-integration'],
  'gastronomie-hotel': ['german-courses', 'documents', 'visa-support', 'arrival-integration'],
  'bau-handwerk': ['recognition', 'documents', 'visa-support', 'german-courses'],
  'pflege-gesundheit': ['recognition', 'german-courses', 'documents', 'visa-support'],
  landwirtschaft: ['visa-support', 'documents', 'arrival-integration'],
  'industrie-technik': ['recognition', 'documents', 'visa-support', 'german-courses'],
  ausbildung: ['ausbildung-placement', 'german-courses', 'visa-support', 'arrival-integration'],
  'it-buero': ['recognition', 'documents', 'visa-support', 'arrival-integration'],
};
const DEFAULT_SERVICES = ['documents', 'visa-support', 'arrival-integration'];

export const servicesForVisa = (visaSlug: string, services: Service[]) => {
  const slugs = VISA_SERVICES[visaSlug] ?? DEFAULT_SERVICES;
  return slugs.map((s) => services.find((x) => x.slug === s)).filter((x): x is Service => !!x);
};

/** Visas in which a service is used, in the order of the visa list. */
export const visasForService = (serviceSlug: string, visas: VisaCategory[]) => {
  const direct = visas.filter((v) => (VISA_SERVICES[v.slug] ?? DEFAULT_SERVICES).includes(serviceSlug));
  // Selection / HR services apply to every visa — show the first few instead of all.
  return direct.length ? direct : visas;
};

/** Journey stage (0 selection, 1 preparation, 2 visa, 3 arrival) of each service. */
const SERVICE_PHASE: Record<string, 0 | 1 | 2 | 3> = {
  'candidate-selection': 0,
  'employer-services': 0,
  'german-courses': 1,
  documents: 1,
  recognition: 1,
  'ausbildung-placement': 1,
  'visa-support': 2,
  'arrival-integration': 3,
};
export const servicePhase = (slug: string) => SERVICE_PHASE[slug] ?? 1;

/** "Nice" axis ticks from 0 to >= max. */
export const ticks = (max: number, target = 5) => {
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => max / s <= target) ?? mag * 10;
  const top = Math.ceil(max / step) * step;
  return {
    top,
    values: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step),
  };
};
