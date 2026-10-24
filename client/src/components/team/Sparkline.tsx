import { useId } from 'react';
import { ACCENT } from '@/components/admin/charts';

/**
 * Tiny inline-SVG trend line (no axes) for KPI tiles and table rows. Nulls are gaps; the last point is
 * marked. The accessible label carries the values, the drawing itself is decorative.
 */
export const Sparkline = ({ values, label, color = ACCENT, width = 96, height = 28 }: { values: (number | null)[]; label: string; color?: string; width?: number; height?: number }) => {
  const id = useId();
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return <span className="inline-block text-[11px] text-muted" style={{ width, height }} aria-label={label} />;
  const min = Math.min(...nums, 0);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const step = values.length > 1 ? (width - 4) / (values.length - 1) : 0;
  const pt = (v: number, i: number) => [2 + i * step, height - 3 - ((v - min) / span) * (height - 6)] as const;
  const segments: string[] = [];
  let cur = '';
  values.forEach((v, i) => {
    if (v === null) {
      if (cur) segments.push(cur);
      cur = '';
      return;
    }
    const [x, y] = pt(v, i);
    cur += `${cur ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  });
  if (cur) segments.push(cur);
  const lastIndex = values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop()!;
  const [lx, ly] = pt(values[lastIndex]!, lastIndex);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={id} className="shrink-0 overflow-visible">
      <title id={id}>{label}</title>
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      <circle cx={lx} cy={ly} r={2.5} fill={color} />
    </svg>
  );
};
