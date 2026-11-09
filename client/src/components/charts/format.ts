import { useMemo } from 'react';
import { useL10n } from '@/lib/l10n';

/** Categorical series colours (fixed slot order — colour follows the entity, never its rank). index.css → --viz-*. */
export const VIZ = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)', 'var(--viz-6)', 'var(--viz-7)', 'var(--viz-8)'] as const;
export const VIZ_GHOST = 'var(--viz-ghost)';
export const VIZ_TRACK = 'var(--viz-track)';
export const GRID = 'var(--color-line)';
export const AXIS = 'var(--color-muted)';
export const INK = 'var(--color-ink)';
export const SURFACE = 'var(--color-card)';

const NUM_LOCALE = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' } as const;
const AZ_MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];

/** Locale-aware formatters of the chart kit: counts, compact axis ticks, euro (from cents), percent, months. */
export const useVizFormat = () => {
  const { locale } = useL10n();
  return useMemo(() => {
    const tag = NUM_LOCALE[locale as keyof typeof NUM_LOCALE] ?? 'en-GB';
    const int = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
    const one = new Intl.NumberFormat(tag, { maximumFractionDigits: 1 });
    const compact = new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 });
    const eur = new Intl.NumberFormat(tag, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
    const eurCompact = new Intl.NumberFormat(tag, { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
    const monthLong = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const monthShort = new Intl.DateTimeFormat(tag, { month: 'short', timeZone: 'UTC' });
    const day = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', timeZone: 'Asia/Baku' });
    const dayYear = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Baku' });
    const time = new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baku' });
    const monthDate = (key: string) => {
      const [y, m] = key.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, 15));
    };
    return {
      tag,
      num: (v: number | null | undefined) => (v == null ? '—' : int.format(v)),
      num1: (v: number | null | undefined) => (v == null ? '—' : one.format(v)),
      /** Axis ticks: 0 / 1,000 / 2,000 under 10,000, compact (10K) above. */
      tick: (v: number) => (Math.abs(v) >= 10_000 ? compact.format(v) : int.format(v)),
      compact: (v: number) => compact.format(v),
      eur: (cents: number | null | undefined) => (cents == null ? '—' : eur.format(cents / 100)),
      eurCompact: (cents: number | null | undefined) => (cents == null ? '—' : Math.abs(cents) >= 1_000_000 ? eurCompact.format(cents / 100) : eur.format(cents / 100)),
      pct: (v: number | null | undefined) => (v == null ? '—' : `${one.format(v)}%`),
      /** 'YYYY-MM' → "Okt" / "Oct" (axis). */
      monthShort: (key: string) => {
        const d = monthDate(key);
        if (locale === 'az') return AZ_MONTHS[d.getUTCMonth()];
        return monthShort.format(d);
      },
      /** 'YYYY-MM' → "oktyabr 2026" / "October 2026" (tooltip, table). */
      monthLong: (key: string) => monthLong.format(monthDate(key)),
      /** Baku calendar day: "28 okt" / "28 Oct". */
      day: (iso: string | Date) => day.format(typeof iso === 'string' && iso.length === 10 ? new Date(`${iso}T12:00:00+04:00`) : new Date(iso)),
      dayYear: (iso: string | Date) => dayYear.format(typeof iso === 'string' && iso.length === 10 ? new Date(`${iso}T12:00:00+04:00`) : new Date(iso)),
      time: (iso: string | Date) => time.format(new Date(iso)),
    };
  }, [locale]);
};

export type VizFormat = ReturnType<typeof useVizFormat>;

/** A "nice" axis step so `ticks` gridlines land on round numbers. */
export const niceStep = (max: number, ticks = 4) => {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return Math.max(m * p, max < ticks ? 1 : 0);
};
