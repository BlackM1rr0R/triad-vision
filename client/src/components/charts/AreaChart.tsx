import { useCallback, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { AXIS, GRID, INK, SURFACE, niceStep } from './format';
import { ChartTooltip, DataTable, TableToggle, useWidth } from './parts';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

export interface ChartPoint {
  x: string;
  values: Record<string, number | null>;
}

/** Legend toggle state for multi-series charts (colour stays with the series when others are hidden). */
export const useSeriesToggle = (initial: string[] = []) => {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set(initial));
  const toggle = useCallback(
    (key: string) =>
      setHidden((h) => {
        const next = new Set(h);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );
  return { hidden, toggle };
};

/**
 * Time-series chart in three modes: `stacked` (stacked areas — parts of a total), `area` (overlapping lines
 * with a 10 % wash) and `line`. One y-axis, hairline grid, 2px lines; a crosshair snaps to the nearest x and
 * the tooltip lists every visible series (plus the total when stacked). Keyboard: focus the plot, ← / → move
 * the crosshair, Esc clears it. Legend chips toggle series and show a value per series (`legendValue`); the
 * table view lists every number.
 */
export const AreaChart = ({
  points,
  series,
  mode = 'stacked',
  hidden: hiddenProp,
  onToggle: onToggleProp,
  format = (v) => String(v),
  axisFormat,
  xLabel,
  xTitle,
  legendValue,
  height = 260,
  ariaLabel,
  emptyText,
  tableHead,
  actions,
  partial,
}: {
  points: ChartPoint[];
  series: ChartSeries[];
  mode?: 'stacked' | 'area' | 'line';
  hidden?: ReadonlySet<string>;
  onToggle?: (key: string) => void;
  format?: (v: number) => string;
  axisFormat?: (v: number) => string;
  xLabel: (x: string) => string;
  xTitle?: (x: string) => string;
  /** Value printed in the legend chip (e.g. the latest month); omit for plain chips. */
  legendValue?: (key: string) => string;
  height?: number;
  ariaLabel: string;
  emptyText?: string;
  /** First header of the table view (default "Period"). */
  tableHead?: string;
  /** Extra controls on the legend row (right side). */
  actions?: ReactNode;
  /**
   * The last point covers an unfinished period (the current month): it is drawn at its pace (`factor` × value)
   * as a dashed, lighter segment, the tooltip shows the actual value plus the projection, and the table marks it.
   */
  partial?: { factor: number; note: string };
}) => {
  const { t } = useTranslation();
  const own = useSeriesToggle();
  const hidden = hiddenProp ?? own.hidden;
  const onToggle = onToggleProp ?? own.toggle;
  const gid = useId().replace(/:/g, '');
  const tableId = useId();
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const visible = series.filter((s) => !hidden.has(s.key));
  const n = points.length;
  const stacked = mode === 'stacked';
  const val = (p: ChartPoint, k: string) => p.values[k] ?? 0;
  const pi = partial && n > 1 ? n - 1 : -1; // index of the partial point
  const factor = partial ? Math.max(1, partial.factor) : 1;
  // Geometry value: the partial point is drawn at its pace.
  const gv = (p: ChartPoint, k: string, i: number) => (i === pi ? val(p, k) * factor : val(p, k));

  // Cumulative tops per point (stacked) in series order.
  const tops = points.map((p, i) => {
    let acc = 0;
    return Object.fromEntries(
      visible.map((s) => {
        acc += stacked ? gv(p, s.key, i) : 0;
        return [s.key, stacked ? acc : gv(p, s.key, i)];
      }),
    ) as Record<string, number>;
  });
  const rawMax = Math.max(0, ...tops.flatMap((tp) => Object.values(tp)));
  const step = niceStep(rawMax);
  const max = step * 4;
  const fmtAxis = axisFormat ?? format;
  const pad = { l: Math.max(34, Math.min(64, fmtAxis(max).length * 6.5 + 12)), r: 12, t: 12, b: 26 };
  const innerW = Math.max(0, width - pad.l - pad.r);
  const innerH = height - pad.t - pad.b;
  const xAt = (i: number) => pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => pad.t + innerH - (max ? (v / max) * innerH : 0);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 56))));
  const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, j) => a + j);
  const lineOf = (k: string, a = 0, b = n - 1) => range(a, b).map((i, j) => `${j === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(tops[i][k]).toFixed(1)}`).join(' ');
  const areaOf = (k: string, idx: number, a = 0, b = n - 1) => {
    const below = stacked && idx > 0 ? visible[idx - 1].key : null;
    const bottom = range(a, b)
      .reverse()
      .map((i) => `L${xAt(i).toFixed(1)},${yAt(below ? tops[i][below] : 0).toFixed(1)}`)
      .join(' ');
    return `${lineOf(k, a, b)} ${bottom} Z`;
  };
  // Solid part ends before the partial point; the partial segment joins the last two points.
  const solidEnd = pi > 0 ? pi - 1 : n - 1;

  const locate = (clientX: number, el: SVGSVGElement) => {
    if (!n) return;
    const x = clientX - el.getBoundingClientRect().left - pad.l;
    setHover(Math.min(n - 1, Math.max(0, n <= 1 ? 0 : Math.round((x / innerW) * (n - 1)))));
  };
  const onKey = (e: KeyboardEvent) => {
    if (!n) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const d = e.key === 'ArrowRight' ? 1 : -1;
      setHover((h) => Math.min(n - 1, Math.max(0, (h ?? (d > 0 ? -1 : n)) + d)));
    } else if (e.key === 'Home') setHover(0);
    else if (e.key === 'End') setHover(n - 1);
    else if (e.key === 'Escape') setHover(null);
  };
  const title = xTitle ?? xLabel;
  const hp = hover !== null ? points[hover] : null;
  const total = (p: ChartPoint) => visible.reduce((a, s) => a + val(p, s.key), 0);
  const fillOpacity = stacked ? 0.22 : mode === 'area' ? 0.1 : 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5" aria-label={t('viz.legend')} role="group">
        {series.length > 1 &&
          series.map((s) => {
            const off = hidden.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={!off}
                onClick={() => onToggle(s.key)}
                className={clsx(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors sm:min-h-7',
                  off ? 'border-dashed border-line text-muted' : 'border-line bg-card text-ink hover:border-line-strong',
                )}
              >
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: off ? GRID : s.color }} aria-hidden />
                <span className={clsx('font-medium', off && 'line-through')}>{s.label}</span>
                {legendValue && !off && <span className="font-semibold tabular-nums">{legendValue(s.key)}</span>}
              </button>
            );
          })}
        <span className="ml-auto flex items-center gap-2">
          {actions}
          <TableToggle open={table} onToggle={() => setTable((v) => !v)} controls={tableId} />
        </span>
      </div>

      <div
        ref={ref}
        role="group"
        tabIndex={0}
        aria-label={ariaLabel}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
        className="relative w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-focus/40"
      >
        {width > 0 && n > 0 && visible.length > 0 ? (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block touch-pan-y select-none" aria-hidden onPointerMove={(e) => locate(e.clientX, e.currentTarget)} onPointerDown={(e) => locate(e.clientX, e.currentTarget)} onPointerLeave={() => setHover(null)}>
            <defs>
              {visible.map((s) => (
                <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={fillOpacity * 1.3} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={stacked ? fillOpacity * 0.8 : 0} />
                </linearGradient>
              ))}
            </defs>
            {[0, 1, 2, 3, 4].map((k) => (
              <g key={k}>
                <line x1={pad.l} x2={width - pad.r} y1={yAt(step * k)} y2={yAt(step * k)} stroke={GRID} strokeWidth={1} />
                <text x={pad.l - 8} y={yAt(step * k) + 3.5} fontSize={10} textAnchor="end" fill={AXIS} className="tabular-nums">
                  {fmtAxis(step * k)}
                </text>
              </g>
            ))}
            {points.map((p, i) =>
              (i % every === 0 && (n - 1 - i) * (innerW / Math.max(1, n - 1)) >= 44) || i === n - 1 ? (
                <text key={p.x} x={xAt(i)} y={height - 8} fontSize={10} textAnchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'} fill={i === n - 1 ? INK : AXIS} fontWeight={i === n - 1 ? 600 : 400}>
                  {xLabel(p.x)}
                  {i === pi ? '*' : ''}
                </text>
              ) : null,
            )}
            {fillOpacity > 0 && n > 1 && solidEnd > 0 && visible.map((s, idx) => <path key={`a-${s.key}`} d={areaOf(s.key, idx, 0, solidEnd)} fill={`url(#${gid}-${s.key})`} />)}
            {fillOpacity > 0 && pi > 0 && visible.map((s, idx) => <path key={`ap-${s.key}`} d={areaOf(s.key, idx, pi - 1, pi)} fill={`url(#${gid}-${s.key})`} opacity={0.45} />)}
            {n > 1 &&
              visible.map((s) => (
                <g key={`l-${s.key}`}>
                  {solidEnd > 0 && stacked && <path d={lineOf(s.key, 0, solidEnd)} fill="none" stroke={SURFACE} strokeWidth={4} strokeLinejoin="round" />}
                  {solidEnd > 0 && <path d={lineOf(s.key, 0, solidEnd)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
                  {pi > 0 && <path d={lineOf(s.key, pi - 1, pi)} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray="4 4" strokeOpacity={0.75} strokeLinecap="round" />}
                </g>
              ))}
            {hp && <line x1={xAt(hover!)} x2={xAt(hover!)} y1={pad.t} y2={pad.t + innerH} stroke={INK} strokeOpacity={0.3} strokeWidth={1} />}
            {visible.map((s) => {
              const i = hover ?? n - 1;
              return <circle key={`d-${s.key}`} cx={xAt(i)} cy={yAt(tops[i][s.key])} r={4} fill={s.color} stroke={SURFACE} strokeWidth={2} />;
            })}
          </svg>
        ) : (
          <div className="grid place-items-center text-sm text-muted" style={{ height }}>
            {visible.length === 0 ? t('viz.pickSeries') : (emptyText ?? t('viz.noData'))}
          </div>
        )}
        {hp && hover !== null && (
          <ChartTooltip left={xAt(hover)} width={width}>
            <p className="mb-1.5 font-semibold text-ink">{title(hp.x)}</p>
            {hover === pi && partial && <p className="-mt-1 mb-1.5 text-[11px] text-muted">{partial.note}</p>}
            <ul className="space-y-1">
              {[...visible].reverse().map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
                    {s.label}
                  </span>
                  <span className="font-semibold text-ink tabular-nums">{hp.values[s.key] == null ? '—' : format(val(hp, s.key))}</span>
                </li>
              ))}
              {stacked && visible.length > 1 && (
                <li className="flex items-center justify-between gap-4 border-t border-line pt-1">
                  <span className="text-muted">{t('viz.total')}</span>
                  <span className="font-semibold text-ink tabular-nums">{format(total(hp))}</span>
                </li>
              )}
              {hover === pi && factor > 1 && (
                <li className="flex items-center justify-between gap-4 border-t border-dashed border-line pt-1">
                  <span className="text-muted">{t('viz.atPace')}</span>
                  <span className="font-semibold text-ink tabular-nums">~{format(Math.round(total(hp) * factor))}</span>
                </li>
              )}
            </ul>
          </ChartTooltip>
        )}
        <span className="sr-only" aria-live="polite">
          {hp ? `${title(hp.x)}: ${visible.map((s) => `${s.label} ${format(val(hp, s.key))}`).join(', ')}` : ''}
        </span>
      </div>

      {table ? (
        <DataTable
          id={tableId}
          className="mt-3"
          head={[tableHead ?? t('viz.period'), ...visible.map((s) => s.label), ...(stacked && visible.length > 1 ? [t('viz.total')] : [])]}
          rows={points.map((p, i) => [i === pi && partial ? `${title(p.x)} (${partial.note})` : title(p.x), ...visible.map((s) => (p.values[s.key] == null ? '—' : format(val(p, s.key)))), ...(stacked && visible.length > 1 ? [format(total(p))] : [])])}
        />
      ) : (
        <span id={tableId} hidden />
      )}
    </div>
  );
};
