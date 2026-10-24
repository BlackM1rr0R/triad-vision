import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * EU Blue Card salary check, shared by the full tool (/blue-card-check) and the compact calculator embedded in
 * guides. The thresholds come from the server (GET /api/seo/blue-card): the admin-maintained values the case
 * checks use; nothing is duplicated in the client.
 */

export type BlueCardGroup = 'standard' | 'shortage' | 'newEntrant' | 'it';
export const BLUE_CARD_GROUPS: BlueCardGroup[] = ['standard', 'shortage', 'newEntrant', 'it'];
export type BlueCardThresholds = Record<string, { standard: number; shortage: number }>;

export interface BlueCardInput {
  /** Raw amount as typed (spaces and a decimal comma are accepted). */
  salary: string;
  period: 'year' | 'month';
  group: BlueCardGroup;
  degree: boolean;
  contract: boolean;
}

export interface BlueCardResult {
  yearly: number;
  /** null while the thresholds are loading or the year is unknown. */
  threshold: number | null;
  salaryOk: boolean;
  degreeOk: boolean;
  ok: boolean;
  /** Distance to the threshold (always ≥ 0). */
  diff: number;
}

/** "52 000" / "4.350,5" style input → number (0 when empty / invalid). */
export const parseAmount = (raw: string) => Number(raw.replace(/\s/g, '').replace(',', '.')) || 0;

export const checkBlueCard = (i: BlueCardInput, thresholds: BlueCardThresholds | undefined, year: string): BlueCardResult => {
  const yearly = parseAmount(i.salary) * (i.period === 'month' ? 12 : 1);
  const t0 = thresholds && year ? thresholds[year] : undefined;
  const threshold = t0 ? (i.group === 'standard' ? t0.standard : t0.shortage) : null;
  const salaryOk = threshold != null && yearly >= threshold;
  const degreeOk = i.group === 'it' || i.degree;
  return { yearly, threshold, salaryOk, degreeOk, ok: salaryOk && degreeOk && i.contract, diff: threshold != null ? Math.abs(yearly - threshold) : 0 };
};

export const useBlueCardThresholds = () =>
  useQuery({
    queryKey: ['blue-card-thresholds'],
    queryFn: async () => (await api.get<{ year: string; thresholds: BlueCardThresholds }>('/seo/blue-card')).data,
    staleTime: 60 * 60_000,
  });

/** Intl locale for numbers per site language. */
export const NUMBER_LOCALE: Record<string, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU', tr: 'tr-TR', uk: 'uk-UA' };

/** Whole-euro currency formatter for a site language. */
export const euroFormat = (lng: string) => new Intl.NumberFormat(NUMBER_LOCALE[lng] ?? 'en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
