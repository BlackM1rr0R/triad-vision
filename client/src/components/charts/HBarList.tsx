import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { VIZ, useVizFormat } from './format';
import './parts';

export interface HBarRow {
  key: string;
  label: ReactNode;
  /** Plain-text name for screen readers when `label` is a link or element. */
  name?: string;
  value: number;
  /** Previous period: a grey ghost bar behind the current one. */
  prev?: number | null;
  color?: string;
  /** Extra cell after the value (e.g. a DeltaPill). */
  extra?: ReactNode;
}

/**
 * Ranked horizontal bars (label · bar · value) on one shared scale. One series = one colour (slot 1) unless the
 * caller colours by entity; the previous period sits behind as a ghost bar. 8px bars, fully rounded ends.
 */
export const HBarList = ({ rows, format, className, labelWidth = 'sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]' }: { rows: HBarRow[]; format?: (v: number) => string; className?: string; labelWidth?: string }) => {
  const { t } = useTranslation();
  const f = useVizFormat();
  const fmt = format ?? f.num;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.value, r.prev ?? 0)));
  const w = (v: number) => (v <= 0 ? 0 : Math.max(1.5, (v / max) * 100));
  return (
    <ul className={clsx('space-y-2.5', className)}>
      {rows.map((r) => (
        <li key={r.key} className={clsx('grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm', labelWidth)}>
          <span className="truncate text-xs text-ink">{r.label}</span>
          <span className="relative h-2 rounded-full bg-sunken" aria-hidden title={r.prev != null ? `${t('viz.previous')}: ${fmt(r.prev)}` : undefined}>
            {r.prev != null && r.prev > 0 && <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--viz-ghost)]" style={{ width: `${w(r.prev)}%` }} />}
            <span className="absolute inset-y-0 left-0 rounded-full motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${w(r.value)}%`, background: r.color ?? VIZ[0] }} />
          </span>
          <span className="flex items-center justify-end gap-2">
            <span className="min-w-[2.5rem] text-right text-xs font-semibold text-ink tabular-nums">
              {fmt(r.value)}
              {r.name !== undefined || r.prev != null ? (
                <span className="sr-only">
                  {r.name ? ` ${r.name}` : ''}
                  {r.prev != null ? `, ${t('viz.previous')}: ${fmt(r.prev)}` : ''}
                </span>
              ) : null}
            </span>
            {r.extra !== undefined && <span className="flex w-[4.5rem] justify-end">{r.extra}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
};
