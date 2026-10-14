import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { Table2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Inline-SVG charts for the admin panel (no chart library). Marks follow one spec:
 * 2px lines, bars at most 24px wide with a 4px rounded cap, hairline gridlines, text in the
 * ink/muted tokens (never the series colour) and a legend whenever there is more than one series.
 */

/** Categorical palette, fixed slot order (validated for CVD separation; slot 1 = brand blue). */
export const SERIES_COLORS = ['#2f7bff', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'] as const;
/** Single-series accent (brand) and the reserved "critical" status colour. */
export const ACCENT = '#2f7bff';
export const CRITICAL = '#d92d3a';

// Theme tokens, so axes and grid lines follow light/dark mode.
const GRID = 'var(--color-line)';
const MUTED = 'var(--color-muted)';
const INK = 'var(--color-ink)';

export interface Series {
  key: string;
  label: string;
  color: string;
}

const useWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
};

/** A "nice" axis step so the 4 gridlines land on round numbers. */
const niceStep = (max: number) => {
  if (max <= 0) return 1;
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return m * p;
};

export const compactNumber = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}K` : String(Math.round(n * 10) / 10);

const Tooltip = ({ left, width, children }: { left: number; width: number; children: ReactNode }) => {
  const flip = left > width * 0.6;
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-2 z-10 min-w-[9rem] rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg"
      style={flip ? { right: Math.max(0, width - left + 10) } : { left: left + 10 }}
    >
      {children}
    </div>
  );
};

const TableToggle = ({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className={clsx(
        'inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition',
        open ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-muted hover:text-navy-900',
      )}
    >
      <Table2 className="size-3.5" aria-hidden /> {t('admin.charts.table')}
    </button>
  );
};

// ─── Multi-series line chart ────────────────────────────────────────────

export const LineChart = ({
  points,
  series,
  hidden,
  onToggle,
  xLabel,
  xTitle,
  height = 240,
  ariaLabel,
  emptyText,
}: {
  points: { x: string; values: Record<string, number> }[];
  series: Series[];
  /** Keys currently hidden by the legend toggles. */
  hidden: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** Short axis label for a point. */
  xLabel: (x: string) => string;
  /** Full label used in the tooltip and table. */
  xTitle?: (x: string) => string;
  height?: number;
  ariaLabel: string;
  emptyText?: string;
}) => {
  const { t } = useTranslation();
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const tableId = useId();
  const visible = series.filter((s) => !hidden.has(s.key));
  const n = points.length;

  const pad = { l: 40, r: 14, t: 14, b: 26 };
  const innerW = Math.max(0, width - pad.l - pad.r);
  const innerH = height - pad.t - pad.b;
  const rawMax = Math.max(0, ...points.flatMap((p) => visible.map((s) => p.values[s.key] ?? 0)));
  const step = niceStep(rawMax);
  const max = step * 4;
  const xAt = (i: number) => pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => pad.t + innerH - (v / max) * innerH;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 64))));

  const pathOf = (s: Series) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.values[s.key] ?? 0).toFixed(1)}`).join(' ');

  const locate = (clientX: number, el: SVGSVGElement) => {
    if (n === 0) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left - pad.l;
    const i = n <= 1 ? 0 : Math.round((x / innerW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };
  const onKey = (e: KeyboardEvent) => {
    if (n === 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setHover((h) => Math.min(n - 1, Math.max(0, (h ?? (e.key === 'ArrowRight' ? -1 : n)) + (e.key === 'ArrowRight' ? 1 : -1))));
    } else if (e.key === 'Escape') setHover(null);
  };

  const hp = hover !== null ? points[hover] : null;
  const title = xTitle ?? xLabel;

  return (
    <div>
      {/* Legend (always present for >= 2 series) with toggles */}
      <div className="mb-3 flex flex-wrap items-center gap-x-1 gap-y-1">
        {series.map((s) => {
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onToggle(s.key)}
              aria-pressed={!off}
              className={clsx(
                'inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold transition hover:bg-surface',
                off ? 'text-muted/70 line-through' : 'text-ink',
              )}
            >
              <span className="h-0.5 w-4 shrink-0 rounded-full" style={{ background: off ? GRID : s.color }} aria-hidden />
              {s.label}
            </button>
          );
        })}
        <span className="ml-auto">
          <TableToggle open={table} onToggle={() => setTable((v) => !v)} controls={tableId} />
        </span>
      </div>

      <div ref={ref} role="group" className="relative w-full outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40" tabIndex={0} onKeyDown={onKey} onBlur={() => setHover(null)} aria-label={ariaLabel}>
        {width > 0 && n > 0 && visible.length > 0 ? (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={ariaLabel}
            className="block select-none"
            onPointerMove={(e) => locate(e.clientX, e.currentTarget)}
            onPointerLeave={() => setHover(null)}
          >
            {[0, 1, 2, 3, 4].map((k) => {
              const v = step * k;
              const y = yAt(v);
              return (
                <g key={k}>
                  <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
                  <text x={pad.l - 8} y={y + 3.5} fontSize={10} textAnchor="end" fill={MUTED}>
                    {compactNumber(v)}
                  </text>
                </g>
              );
            })}
            {points.map((p, i) =>
              i % every === 0 || i === n - 1 ? (
                <text key={p.x} x={xAt(i)} y={height - 8} fontSize={10} textAnchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'} fill={MUTED}>
                  {xLabel(p.x)}
                </text>
              ) : null,
            )}
            {hp && <line x1={xAt(hover!)} x2={xAt(hover!)} y1={pad.t} y2={pad.t + innerH} stroke={INK} strokeOpacity={0.35} strokeWidth={1} />}
            {visible.map((s) => (
              <path key={s.key} d={pathOf(s)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {visible.map((s) => {
              const i = hover ?? n - 1;
              return <circle key={s.key} cx={xAt(i)} cy={yAt(points[i].values[s.key] ?? 0)} r={4} fill={s.color} stroke="var(--color-card)" strokeWidth={2} />;
            })}
          </svg>
        ) : (
          <div className="grid place-items-center text-sm text-muted" style={{ height }}>
            {visible.length === 0 ? t('admin.charts.pickSeries') : (emptyText ?? t('admin.charts.noDataPeriod'))}
          </div>
        )}
        {hp && hover !== null && (
          <Tooltip left={xAt(hover)} width={width}>
            <p className="mb-1 font-semibold text-navy-900">{title(hp.x)}</p>
            <ul className="space-y-0.5">
              {visible.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
                    {s.label}
                  </span>
                  <span className="font-semibold text-navy-900 tabular-nums">{hp.values[s.key] ?? 0}</span>
                </li>
              ))}
            </ul>
          </Tooltip>
        )}
      </div>

      {table && (
        <div id={tableId} className="mt-3 max-h-72 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface/90 text-[10px] font-semibold tracking-wide text-muted uppercase">
              <tr>
                <th className="px-3 py-2">{t('admin.charts.day')}</th>
                {visible.map((s) => (
                  <th key={s.key} className="px-3 py-2 text-right whitespace-nowrap">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {points.map((p) => (
                <tr key={p.x}>
                  <td className="px-3 py-1.5 whitespace-nowrap text-ink">{title(p.x)}</td>
                  {visible.map((s) => (
                    <td key={s.key} className="px-3 py-1.5 text-right text-navy-900 tabular-nums">
                      {p.values[s.key] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── Single-series bar chart ────────────────────────────────────────────

export interface Bar {
  label: string;
  value: number;
  /** Longer label for the tooltip / table. */
  title?: string;
  /** Marks a bar (e.g. today, current hour) with a darker fill. */
  emphasis?: boolean;
}

export const BarChart = ({
  bars,
  color = ACCENT,
  height = 160,
  format = (v) => String(v),
  axisFormat = compactNumber,
  xEvery,
  ariaLabel,
  tableLabel,
}: {
  bars: Bar[];
  color?: string;
  height?: number;
  format?: (v: number) => string;
  axisFormat?: (v: number) => string;
  /** Show every n-th x label (auto when omitted). */
  xEvery?: number;
  ariaLabel: string;
  tableLabel?: string;
}) => {
  const { t } = useTranslation();
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const tableId = useId();
  const n = bars.length;
  const pad = { l: 36, r: 8, t: 16, b: 22 };
  const innerW = Math.max(0, width - pad.l - pad.r);
  const innerH = height - pad.t - pad.b;
  const rawMax = Math.max(0, ...bars.map((b) => b.value));
  const step = niceStep(rawMax);
  const max = step * 4;
  const slot = n ? innerW / n : 0;
  const bw = Math.min(24, Math.max(2, slot - 2));
  const r = Math.min(4, bw / 2);
  const every = xEvery ?? Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 48))));
  const maxIdx = bars.reduce((m, b, i) => (b.value > bars[m].value ? i : m), 0);
  const baseline = pad.t + innerH;
  const onKey = (e: KeyboardEvent) => {
    if (n === 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setHover((h) => Math.min(n - 1, Math.max(0, (h ?? (e.key === 'ArrowRight' ? -1 : n)) + (e.key === 'ArrowRight' ? 1 : -1))));
    } else if (e.key === 'Escape') setHover(null);
  };

  return (
    <div>
      <div ref={ref} role="group" className="relative w-full outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40" tabIndex={0} onKeyDown={onKey} onBlur={() => setHover(null)} aria-label={ariaLabel}>
        {width > 0 && n > 0 ? (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="block select-none" onPointerLeave={() => setHover(null)}>
            {[0, 1, 2, 3, 4].map((k) => {
              const y = baseline - (innerH * k) / 4;
              return (
                <g key={k}>
                  <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
                  <text x={pad.l - 6} y={y + 3.5} fontSize={10} textAnchor="end" fill={MUTED}>
                    {axisFormat(step * k)}
                  </text>
                </g>
              );
            })}
            {bars.map((b, i) => {
              const x = pad.l + i * slot + (slot - bw) / 2;
              const h = max ? (b.value / max) * innerH : 0;
              const y = baseline - h;
              const active = hover === i;
              const d =
                h <= r
                  ? `M${x},${baseline} v${-h} h${bw} v${h} Z`
                  : `M${x},${baseline} V${y + r} a${r},${r} 0 0 1 ${r},${-r} h${bw - 2 * r} a${r},${r} 0 0 1 ${r},${r} V${baseline} Z`;
              return (
                <g key={i}>
                  {h > 0 && <path d={d} fill={color} fillOpacity={b.emphasis || active ? 1 : 0.8} />}
                  {i === maxIdx && b.value > 0 && hover === null && (
                    <text x={x + bw / 2} y={y - 4} fontSize={10} fontWeight={600} textAnchor="middle" fill={INK}>
                      {format(b.value)}
                    </text>
                  )}
                  {i % every === 0 && (
                    <text x={x + bw / 2} y={height - 7} fontSize={10} textAnchor="middle" fill={MUTED}>
                      {b.label}
                    </text>
                  )}
                  {/* Hit target spans the whole slot and height */}
                  <rect x={pad.l + i * slot} y={pad.t} width={slot} height={innerH} fill="transparent" onPointerEnter={() => setHover(i)} onPointerMove={() => setHover(i)} />
                </g>
              );
            })}
          </svg>
        ) : (
          <div className="grid place-items-center text-sm text-muted" style={{ height }}>
            {t('admin.charts.noData')}
          </div>
        )}
        {hover !== null && bars[hover] && (
          <Tooltip left={pad.l + hover * slot + slot / 2} width={width}>
            <p className="font-semibold text-navy-900 tabular-nums">{format(bars[hover].value)}</p>
            <p className="text-muted">{bars[hover].title ?? bars[hover].label}</p>
          </Tooltip>
        )}
      </div>
      <div className="mt-2 flex justify-end">
        <TableToggle open={table} onToggle={() => setTable((v) => !v)} controls={tableId} />
      </div>
      {table && (
        <div id={tableId} className="mt-2 max-h-60 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface/90 text-[10px] font-semibold tracking-wide text-muted uppercase">
              <tr>
                <th className="px-3 py-2">{t('admin.charts.period')}</th>
                <th className="px-3 py-2 text-right">{tableLabel ?? t('admin.charts.value')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {bars.map((b, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 whitespace-nowrap text-ink">{b.title ?? b.label}</td>
                  <td className="px-3 py-1.5 text-right text-navy-900 tabular-nums">{format(b.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── Horizontal bar list (HTML) ─────────────────────────────────────────

/** Compact label / bar / value rows for a categorical breakdown (same pattern as the status list on the Panel page). */
export const BarList = ({
  rows,
  format = (v) => String(v),
}: {
  rows: { key: string; label: ReactNode; value: number; tone: string }[];
  format?: (v: number) => string;
}) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_3rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_3.5rem]">
          <span className="truncate text-xs text-ink/80">{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-surface" aria-hidden>
            <span className={clsx('block h-full rounded-full transition-[width] duration-700 ease-out', r.tone)} style={{ width: `${r.value === 0 ? 0 : Math.max(3, (r.value / max) * 100)}%` }} />
          </span>
          <span className="text-right text-xs font-semibold text-navy-900 tabular-nums">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
};
