import { useMemo } from 'react';
import { useL10n } from '@/lib/l10n';

const NUM_LOCALE = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' } as const;
const AZ_MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];

/** Euro amounts (from cents, two decimals), percentages, day counts and month labels in the UI language. */
export const useFinanceFormat = () => {
  const { locale } = useL10n();
  return useMemo(() => {
    const tag = NUM_LOCALE[locale];
    const eur = new Intl.NumberFormat(tag, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const num1 = new Intl.NumberFormat(tag, { maximumFractionDigits: 1 });
    const month = new Intl.DateTimeFormat(tag, { month: 'short', year: 'numeric', timeZone: 'UTC' });
    return {
      money: (cents: number | null | undefined) => (cents == null ? '—' : eur.format(cents / 100)),
      pct: (v: number | null | undefined) => (v == null ? '—' : `${num1.format(v)}%`),
      num: (v: number | null | undefined) => (v == null ? '—' : num1.format(v)),
      /** 'YYYY-MM' → "mar 2026" / "März 2026". */
      month: (key: string) => {
        const [y, m] = key.split('-').map(Number);
        if (locale === 'az') return `${AZ_MONTHS[m - 1]} ${y}`;
        return month.format(new Date(Date.UTC(y, m - 1, 15)));
      },
      /** 'YYYY-MM-DD' or ISO → localized date (UTC calendar day). */
      day: (iso: string) => {
        const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
        if (locale === 'az') return `${String(d.getUTCDate()).padStart(2, '0')} ${AZ_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
        return new Intl.DateTimeFormat(tag, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
      },
    };
  }, [locale]);
};

// ─── Period presets (calendar days in the browser's time zone, sent as YYYY-MM-DD) ─────────

export const PRESETS = ['thisMonth', 'lastMonth', 'thisQuarter', 'thisYear', 'lastYear', 'custom'] as const;
export type Preset = (typeof PRESETS)[number];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => {
  const dt = new Date(y, m, d);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

export const presetRange = (p: Exclude<Preset, 'custom'>, now = new Date()) => {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (p) {
    case 'thisMonth':
      return { from: ymd(y, m, 1), to: ymd(y, m + 1, 0) };
    case 'lastMonth':
      return { from: ymd(y, m - 1, 1), to: ymd(y, m, 0) };
    case 'thisQuarter': {
      const q = Math.floor(m / 3) * 3;
      return { from: ymd(y, q, 1), to: ymd(y, q + 3, 0) };
    }
    case 'thisYear':
      return { from: ymd(y, 0, 1), to: ymd(y, 11, 31) };
    case 'lastYear':
      return { from: ymd(y - 1, 0, 1), to: ymd(y - 1, 11, 31) };
  }
};
