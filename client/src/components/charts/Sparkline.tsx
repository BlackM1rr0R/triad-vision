import { useId, useState, type KeyboardEvent } from 'react';
import { SURFACE, VIZ } from './format';

/**
 * Tiny trend line (no axes) for stat cards and table rows. Nulls are gaps; the last point is marked; hover or
 * the arrow keys (when focusable) highlight one point. `label` carries every value for screen readers, so the
 * picture never gates a number.
 */
export const Sparkline = ({
  values,
  label,
  color = VIZ[0],
  width = 96,
  height = 28,
  format = (v: number) => String(v),
  pointLabel,
  area = false,
  focusable = true,
  className,
}: {
  values: (number | null)[];
  label: string;
  color?: string;
  width?: number;
  height?: number;
  format?: (v: number) => string;
  /** Text for the i-th point in the tooltip (e.g. the month). */
  pointLabel?: (i: number) => string;
  /** 10 % wash under the line. */
  area?: boolean;
  /** Tab stop with arrow-key highlight (off inside dense tables: the row link is the stop there). */
  focusable?: boolean;
  className?: string;
}) => {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const nums = values.filter((v): v is number => v !== null && v !== undefined);
  if (nums.length === 0) return <span className={className} style={{ display: 'inline-block', width, height }} aria-label={label} role="img" />;
  const min = Math.min(...nums, 0);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const step = values.length > 1 ? (width - 6) / (values.length - 1) : 0;
  const pt = (v: number, i: number) => [3 + i * step, height - 3 - ((v - min) / span) * (height - 6)] as const;
  const segments: { d: string; first: number; last: number }[] = [];
  let cur: { d: string; first: number; last: number } | null = null;
  values.forEach((v, i) => {
    if (v === null || v === undefined) {
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
  const present = values.map((v, i) => (v === null || v === undefined ? -1 : i)).filter((i) => i >= 0);
  const mark = hover !== null && values[hover] != null ? hover : present[present.length - 1];
  const [mx, my] = pt(values[mark]!, mark);
  const nearest = (clientX: number, el: SVGSVGElement) => {
    const x = clientX - el.getBoundingClientRect().left;
    const i = Math.min(values.length - 1, Math.max(0, step ? Math.round((x - 3) / step) : 0));
    setHover(present.reduce((b, p) => (Math.abs(p - i) < Math.abs(b - i) ? p : b), present[0]));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const pos = present.indexOf(hover ?? present[present.length - 1]);
    setHover(present[Math.min(present.length - 1, Math.max(0, pos + (e.key === 'ArrowRight' ? 1 : -1)))]);
  };
  return (
    <span
      className={`relative inline-flex shrink-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-focus/40 ${className ?? ''}`}
      tabIndex={focusable ? 0 : undefined}
      onKeyDown={focusable ? onKey : undefined}
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
            <path key={`a${i}`} d={`${s.d}L${pt(min, s.last)[0].toFixed(1)},${height - 1}L${pt(min, s.first)[0].toFixed(1)},${height - 1}Z`} fill={color} fillOpacity={0.1} />
          ))}
        {segments.map((s, i) => (
          <path key={i} d={s.d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hover !== null && <line x1={mx} x2={mx} y1={1} y2={height - 1} stroke="var(--color-ink)" strokeOpacity={0.25} strokeWidth={1} />}
        <circle cx={mx} cy={my} r={hover !== null ? 3.5 : 3} fill={color} stroke={SURFACE} strokeWidth={1.5} />
      </svg>
      {hover !== null && values[hover] != null && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 rounded-md border border-line bg-raised px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-ink shadow-[var(--tv-shadow-raised)]" aria-hidden>
          {pointLabel ? `${pointLabel(hover)}: ` : ''}
          {format(values[hover]!)}
        </span>
      )}
    </span>
  );
};
