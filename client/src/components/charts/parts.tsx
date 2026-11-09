import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Table2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { registerCopy } from '@/i18n';
import { chartsCopy } from '@/i18n/charts';

registerCopy(chartsCopy);

/** Width of a container (ResizeObserver), for SVGs drawn in real pixels so text never scales. */
export const useWidth = <T extends HTMLElement = HTMLDivElement>() => {
  const ref = useRef<T>(null);
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

/** "Table" switch under a chart: the accessible (and hover-free) way to read every value. */
export const TableToggle = ({ open, onToggle, controls, className }: { open: boolean; onToggle: () => void; controls: string; className?: string }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className={clsx(
        'inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors',
        open ? 'border-line-strong bg-sunken text-ink' : 'border-line bg-card text-muted hover:text-ink',
        className,
      )}
    >
      <Table2 className="size-3.5" aria-hidden /> {t('viz.table')}
    </button>
  );
};

/** Floating readout next to the crosshair / hovered mark; flips to the left near the right edge. */
export const ChartTooltip = ({ left, width, top = 8, children }: { left: number; width: number; top?: number; children: ReactNode }) => {
  const flip = left > width * 0.58;
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[9.5rem] rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-[var(--tv-shadow-raised)]"
      style={flip ? { top, right: Math.max(0, width - left + 12) } : { top, left: left + 12 }}
      aria-hidden
    >
      {children}
    </div>
  );
};

/** Compact segmented switch (tabs inside a card): buttons with aria-pressed in one group. */
export const Segmented = <K extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: { key: K; label: ReactNode }[];
  value: K;
  onChange: (k: K) => void;
  label: string;
  className?: string;
}) => (
  <div role="group" aria-label={label} className={clsx('inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-line bg-sunken p-0.5', className)}>
    {items.map((i) => (
      <button
        key={i.key}
        type="button"
        aria-pressed={value === i.key}
        onClick={() => onChange(i.key)}
        className={clsx(
          'min-h-9 shrink-0 rounded-md px-2.5 text-xs whitespace-nowrap transition-colors sm:min-h-7',
          value === i.key ? 'bg-card font-semibold text-ink shadow-[var(--tv-shadow-card)]' : 'font-medium text-muted hover:text-ink',
        )}
      >
        {i.label}
      </button>
    ))}
  </div>
);

/** Plain data table used as every chart's table view. */
export const DataTable = ({ id, head, rows, className }: { id: string; head: ReactNode[]; rows: ReactNode[][]; className?: string }) => (
  <div id={id} className={clsx('max-h-72 overflow-auto rounded-lg border border-line', className)}>
    <table className="w-full text-left text-xs">
      <thead className="sticky top-0 bg-sunken text-muted">
        <tr>
          {head.map((h, i) => (
            <th key={i} scope="col" className={clsx('px-3 py-2 font-medium whitespace-nowrap', i > 0 && 'text-right')}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) =>
              j === 0 ? (
                <th key={j} scope="row" className="px-3 py-1.5 font-normal whitespace-nowrap text-ink">
                  {c}
                </th>
              ) : (
                <td key={j} className="px-3 py-1.5 text-right text-ink tabular-nums">
                  {c}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** Rounded-top bar path (4px data end, square at the baseline). Vertical: grows up from `base`. */
export const barPath = (x: number, y: number, w: number, h: number, r = 4) => {
  if (h <= 0 || w <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} a${rr},${rr} 0 0 1 ${rr},${-rr} h${w - 2 * rr} a${rr},${rr} 0 0 1 ${rr},${rr} V${y + h} Z`;
};
