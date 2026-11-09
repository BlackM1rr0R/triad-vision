import { useCallback, useId, useState, type ComponentProps, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { Table2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { registerCopy } from '@/i18n';
import { pagesAdminUx } from '@/i18n/pagesAdminUx';
import { LineChart, SERIES_COLORS } from './charts';

registerCopy(pagesAdminUx);

/**
 * Additions to the admin chart set (components/admin/charts.tsx: LineChart, BarChart, BarList): area chart,
 * interactive donut and sparkline. Same mark spec and theme tokens; every chart is keyboard operable (arrow
 * keys move the highlight), has hover tooltips and a "show as table" fallback for screen readers.
 */

const GRID = 'var(--color-line)';

/** Legend toggle state shared by multi-series charts. */
export const useSeriesToggle = (initial: string[] = []) => {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set(initial));
  const toggle = useCallback((key: string) => setHidden((h) => {
    const next = new Set(h);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }), []);
  return { hidden, toggle };
};

/** LineChart with a gradient fill under each series. */
export const AreaChart = (props: Omit<ComponentProps<typeof LineChart>, 'area'>) => <LineChart {...props} area />;

// ─── Donut ──────────────────────────────────────────────────────────────

export interface Slice {
  key: string;
  label: string;
  value: number;
  color?: string;
  /** Optional link / action when the slice or its legend row is activated. */
  onSelect?: () => void;
}

export const DonutChart = ({
  slices,
  format = (v) => String(v),
  ariaLabel,
  size = 180,
  centerLabel,
  className,
}: {
  slices: Slice[];
  format?: (v: number) => string;
  ariaLabel: string;
  size?: number;
  /** Text under the total in the middle (default "Total"). */
  centerLabel?: string;
  className?: string;
}) => {
  const { t } = useTranslation();
  const { hidden, toggle } = useSeriesToggle();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const tableId = useId();
  const colored = slices.map((s, i) => ({ ...s, color: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length] }));
  const visible = colored.filter((s) => !hidden.has(s.key) && s.value > 0);
  const total = visible.reduce((a, s) => a + s.value, 0);
  const R = 80;
  const r = 54;
  let angle = -Math.PI / 2;
  const arcs = visible.map((s) => {
    const frac = total ? s.value / total : 0;
    const a0 = angle;
    const a1 = angle + frac * 2 * Math.PI;
    angle = a1;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, a: number) => `${(100 + rad * Math.cos(a)).toFixed(2)},${(100 + rad * Math.sin(a)).toFixed(2)}`;
    const d =
      frac >= 0.9999
        ? `M100,${100 - R} A${R},${R} 0 1 1 99.99,${100 - R} L99.99,${100 - r} A${r},${r} 0 1 0 100,${100 - r} Z`
        : `M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${large} 0 ${p(r, a0)} Z`;
    return { ...s, d, frac };
  });
  const active = hover !== null ? arcs[hover] : null;
  const onKey = (e: KeyboardEvent) => {
    if (!arcs.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      setHover((h) => ((h ?? -1) + 1) % arcs.length);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      setHover((h) => ((h ?? arcs.length) - 1 + arcs.length) % arcs.length);
    } else if (e.key === 'Enter' && active?.onSelect) {
      e.preventDefault();
      active.onSelect();
    } else if (e.key === 'Escape') setHover(null);
  };
  const pct = (f: number) => `${Math.round(f * 1000) / 10}%`;

  return (
    <div className={className}>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div
          role="group"
          tabIndex={0}
          aria-label={ariaLabel}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
          className="relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus/40"
          style={{ width: size, height: size }}
        >
          <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={ariaLabel} onPointerLeave={() => setHover(null)}>
            {arcs.length === 0 && <circle cx={100} cy={100} r={(R + r) / 2} fill="none" stroke={GRID} strokeWidth={R - r} />}
            {arcs.map((a, i) => (
              <path
                key={a.key}
                d={a.d}
                fill={a.color}
                stroke="var(--color-card)"
                strokeWidth={1.5}
                opacity={hover === null || hover === i ? 1 : 0.45}
                style={{ transition: 'opacity 150ms', cursor: a.onSelect ? 'pointer' : undefined }}
                onPointerEnter={() => setHover(i)}
                onClick={a.onSelect}
              />
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center" aria-hidden>
            <div>
              <p className="font-display text-xl font-bold text-ink tabular-nums">{format(active ? active.value : total)}</p>
              <p className="max-w-[7rem] truncate text-[11px] text-muted">{active ? `${active.label} · ${pct(active.frac)}` : (centerLabel ?? t('ux.charts.total'))}</p>
            </div>
          </div>
          <span className="sr-only" aria-live="polite">
            {active ? `${active.label}: ${format(active.value)} (${pct(active.frac)})` : ''}
          </span>
        </div>
        <ul className="min-w-0 flex-1 space-y-0.5 text-sm" aria-label={t('ux.charts.legend')}>
          {colored.map((s) => {
            const off = hidden.has(s.key);
            const i = arcs.findIndex((a) => a.key === s.key);
            const frac = total && !off ? s.value / total : 0;
            return (
              <li key={s.key} className={clsx('flex items-center gap-2 rounded-md px-1', hover !== null && hover === i && 'bg-sunken')} onPointerEnter={() => setHover(i >= 0 ? i : null)} onPointerLeave={() => setHover(null)}>
                <button
                  type="button"
                  aria-pressed={!off}
                  onClick={() => toggle(s.key)}
                  className={clsx('inline-flex min-h-8 min-w-0 flex-1 items-center gap-2 text-left text-xs font-medium transition', off ? 'text-muted line-through' : 'text-ink')}
                >
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ background: off ? GRID : s.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                </button>
                <span className="w-12 text-right text-[11px] text-muted tabular-nums">{off ? '—' : pct(frac)}</span>
                <span className="w-14 text-right text-xs font-semibold text-ink tabular-nums">{format(s.value)}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => setTable((v) => !v)}
          aria-expanded={table}
          aria-controls={tableId}
          className={clsx(
            'inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition',
            table ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line bg-card text-muted hover:text-ink',
          )}
        >
          <Table2 className="size-3.5" aria-hidden /> {t('admin.charts.table')}
        </button>
      </div>
      {table && (
        <div id={tableId} className="mt-2 max-h-60 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface/90 text-xs font-medium text-muted">
              <tr>
                <th className="px-3 py-2">{t('ux.charts.category')}</th>
                <th className="px-3 py-2 text-right">{t('ux.charts.value')}</th>
                <th className="px-3 py-2 text-right">{t('ux.charts.share')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {colored.map((s) => {
                const all = colored.reduce((a, x) => a + Math.max(0, x.value), 0);
                return (
                  <tr key={s.key}>
                    <td className="px-3 py-1.5 text-ink">{s.label}</td>
                    <td className="px-3 py-1.5 text-right text-ink tabular-nums">{format(s.value)}</td>
                    <td className="px-3 py-1.5 text-right text-muted tabular-nums">{all ? pct(Math.max(0, s.value) / all) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── Sparkline ──────────────────────────────────────────────────────────

/** The interactive sparkline of the data-viz kit (components/charts), re-exported for existing imports. */
export { Sparkline } from '@/components/charts/Sparkline';
