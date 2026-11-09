import { useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useVizFormat } from './format';
import './parts';

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Fills where white text fails 3:1 (yellow / aqua / magenta steps) take near-black labels. */
const DARK_LABEL = new Set(['var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)']);

/**
 * One whole split into parts. `tall` (28px) prints each part's share inside its block when it fits (≥ 12 %),
 * `thin` (8px) prints nothing. 2px surface gaps between parts, 4px corners; hover / focus a part for its name,
 * amount and share. The legend (names in block order) comes from the caller's table or `legend`.
 */
export const SegmentBar = ({
  parts,
  ariaLabel,
  variant = 'tall',
  format,
  legend = false,
  className,
}: {
  parts: Segment[];
  ariaLabel: string;
  variant?: 'tall' | 'thin';
  format?: (v: number) => string;
  legend?: boolean;
  className?: string;
}) => {
  const { t } = useTranslation();
  const f = useVizFormat();
  const fmt = format ?? f.num;
  const [active, setActive] = useState<string | null>(null);
  const shown = parts.filter((p) => p.value > 0);
  const total = shown.reduce((a, p) => a + p.value, 0);
  const share = (v: number) => (total ? Math.round((v / total) * 1000) / 10 : 0);
  const summary = shown.map((p) => `${p.label} ${fmt(p.value)} (${f.pct(share(p.value))})`).join(', ');
  const act = shown.find((p) => p.key === active);
  return (
    <div className={className}>
      <div role="group" aria-label={t('viz.segmentAria', { label: ariaLabel, summary: summary || '—' })} className={clsx('relative flex w-full gap-[2px]', variant === 'tall' ? 'h-7' : 'h-2')}>
        {total === 0 && <div className="h-full w-full rounded bg-sunken" />}
        {shown.map((p) => {
          const s = share(p.value);
          return (
            <button
              key={p.key}
              type="button"
              className={clsx(
                'relative h-full min-w-[3px] outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-1',
                variant === 'tall' ? 'rounded' : 'rounded-full',
                active && active !== p.key && 'opacity-60',
              )}
              style={{ flexGrow: p.value, flexBasis: 0, background: p.color }}
              aria-label={`${p.label}: ${fmt(p.value)} (${f.pct(s)})`}
              onPointerEnter={() => setActive(p.key)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(p.key)}
              onBlur={() => setActive(null)}
            >
              {variant === 'tall' && s >= 12 && (
                <span className={clsx('absolute inset-y-0 left-2 flex items-center text-[11px] font-semibold tabular-nums', DARK_LABEL.has(p.color) ? 'text-[#0b0b0b]' : 'text-white')} aria-hidden>
                  {f.pct(Math.round(s))}
                </span>
              )}
            </button>
          );
        })}
        {act && (
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-lg border border-line bg-raised px-3 py-1.5 text-xs whitespace-nowrap shadow-[var(--tv-shadow-raised)]" aria-hidden>
            <span className="font-semibold text-ink tabular-nums">{fmt(act.value)}</span> <span className="text-muted">· {act.label} · {f.pct(share(act.value))}</span>
          </div>
        )}
      </div>
      {legend && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          {parts.map((p) => (
            <li key={p.key} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ background: p.color }} aria-hidden />
              {p.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
