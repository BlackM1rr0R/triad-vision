import { useCallback, useId, useState, type ComponentProps, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { Table2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { registerCopy } from '@/i18n';
import { pagesAdminUx } from '@/i18n/pagesAdminUx';
import { ACCENT, LineChart, SERIES_COLORS } from './charts';

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

/**
 * Tiny trend line (no axes) for KPI tiles and table rows, with a hover / keyboard highlight of one point.
 * Nulls are gaps; the last point is marked. `label` carries the values for screen readers.
 */
export const Sparkline = ({
  values,
  label,
  color = ACCENT,
  width = 96,
  height = 28,
  format = (v: number) => String(v),
  pointLabel,
  area = false,
}: {
  values: (number | null)[];
  label: string;
  color?: string;
  width?: number;
  height?: number;
  format?: (v: number) => string;
  /** Text for the i-th point in the tooltip (e.g. the week). */
  pointLabel?: (i: number) => string;
  area?: boolean;
}) => {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return <span className="inline-block text-[11px] text-muted" style={{ width, height }} aria-label={label} role="img" />;
  const min = Math.min(...nums, 0);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const step = values.length > 1 ? (width - 4) / (values.length - 1) : 0;
  const pt = (v: number, i: number) => [2 + i * step, height - 3 - ((v - min) / span) * (height - 6)] as const;
  const segments: { d: string; first: number; last: number }[] = [];
  let cur: { d: string; first: number; last: number } | null = null;
  values.forEach((v, i) => {
    if (v === null) {
      if (cur) segments.push(cur);
      cur = null;
      return;
    }
    const [x, y] = pt(v, i);
    if (!cur) cur = { d: `M${x.toFixed(1)},${y.toFixed(1)}`, first: i, last: i };
    else {
      cur.d += `L${x.toFixed(1)},${y.toFixed(1)}`;
      cur.last = i;
    }
  });
  if (cur) segments.push(cur);
  const present = values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
  const mark = hover !== null && values[hover] !== null ? hover : present[present.length - 1];
  const [mx, my] = pt(values[mark]!, mark);
  const nearest = (clientX: number, el: SVGSVGElement) => {
    const x = clientX - el.getBoundingClientRect().left;
    const i = step ? Math.round((x - 2) / step) : 0;
    const clamped = Math.min(values.length - 1, Math.max(0, i));
    // Snap to the closest point that has a value.
    const best = present.reduce((b, p) => (Math.abs(p - clamped) < Math.abs(b - clamped) ? p : b), present[0]);
    setHover(best);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const pos = present.indexOf(hover ?? present[present.length - 1]);
    const next = Math.min(present.length - 1, Math.max(0, pos + (e.key === 'ArrowRight' ? 1 : -1)));
    setHover(present[next]);
  };
  return (
    <span
      className="relative inline-flex shrink-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-focus/40"
      tabIndex={0}
      onKeyDown={onKey}
      onBlur={() => setHover(null)}
      aria-labelledby={id}
      role="img"
    >
      <span id={id} className="sr-only">
        {label}
      </span>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible" onPointerMove={(e) => nearest(e.clientX, e.currentTarget)} onPointerLeave={() => setHover(null)}>
        {area &&
          segments.map((s, i) => (
            <path key={`a${i}`} d={`${s.d}L${pt(0, s.last)[0].toFixed(1)},${height - 1}L${pt(0, s.first)[0].toFixed(1)},${height - 1}Z`} fill={color} fillOpacity={0.12} />
          ))}
        {segments.map((s, i) => (
          <path key={i} d={s.d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hover !== null && <line x1={mx} x2={mx} y1={1} y2={height - 1} stroke="var(--color-ink)" strokeOpacity={0.25} strokeWidth={1} />}
        <circle cx={mx} cy={my} r={hover !== null ? 3 : 2.5} fill={color} stroke="var(--color-card)" strokeWidth={hover !== null ? 1.5 : 0} />
      </svg>
      {hover !== null && values[hover] !== null && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 rounded-md bg-navy-950 px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-white shadow-[var(--tv-shadow-card)]" aria-hidden>
          {pointLabel ? `${pointLabel(hover)}: ` : ''}
          {format(values[hover]!)}
        </span>
      )}
    </span>
  );
};
