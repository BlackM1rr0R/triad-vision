import { currentLocale, type Locale } from '@/i18n';

const INTL: Record<Locale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };
const AZ_MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];

/** "1.234,50 €" style amount in the UI language; falls back to "1234.50 EUR". */
export const money = (cents: number, currency = 'EUR') => {
  try {
    return new Intl.NumberFormat(INTL[currentLocale()], { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
};

/** Basis points as a percentage ("12,5 %"). */
export const percent = (bps: number) =>
  new Intl.NumberFormat(INTL[currentLocale()], { style: 'percent', maximumFractionDigits: 2 }).format(bps / 10000);

export const day = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const l = currentLocale();
  // Browsers ship incomplete Azerbaijani month names, so they are our own.
  if (l === 'az') return `${String(d.getDate()).padStart(2, '0')} ${AZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return new Intl.DateTimeFormat(INTL[l], { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
};

/** Short month label for chart axes from "YYYY-MM". */
export const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  const l = currentLocale();
  if (l === 'az') return AZ_MONTHS[m - 1];
  return new Intl.DateTimeFormat(INTL[l], { month: 'short' }).format(new Date(Date.UTC(y, m - 1, 15)));
};
