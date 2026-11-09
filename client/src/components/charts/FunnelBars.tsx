import { Fragment, useId, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useVizFormat } from './format';
import { DataTable, TableToggle } from './parts';

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  /** Same step in the previous period (dashed marker). */
  prev?: number | null;
}

const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/**
 * Step funnel: every step shows its value and share of the first step; a badge between two steps gives the
 * step conversion. Bars share one scale (the largest value of either period), a dashed line marks the previous
 * period. Columns from `sm` up, stacked rows on phones. The table view lists current, previous and rates.
 */
export const FunnelBars = ({ steps, ariaLabel, height = 132, showPrev = true }: { steps: FunnelStep[]; ariaLabel: string; height?: number; showPrev?: boolean }) => {
  const { t } = useTranslation();
  const f = useVizFormat();
  const tableId = useId();
  const [table, setTable] = useState(false);
  const first = steps[0]?.count ?? 0;
  const max = Math.max(1, ...steps.map((s) => s.count), ...(showPrev ? steps.map((s) => s.prev ?? 0) : []));
  const h = (v: number) => (v <= 0 ? 0 : Math.max(2, (v / max) * 100));
  const summary = steps.map((s) => `${s.label} ${f.num(s.count)}`).join(', ');

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{t('viz.funnelAria', { summary })}</figcaption>

      {/* sm+: columns */}
      <ol className="hidden gap-2 sm:grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-hidden>
        {steps.map((s, i) => {
          const conv = i > 0 ? pctOf(s.count, steps[i - 1].count) : null;
          return (
            <li key={s.key} className="relative min-w-0">
              <p className="truncate text-[11px] font-medium text-muted" title={s.label}>
                {i + 1}. {s.label}
              </p>
              <p className="mt-0.5 text-xl leading-tight font-semibold text-ink">{f.num(s.count)}</p>
              <p className="min-h-8 text-[11px] leading-4 text-muted tabular-nums">{t('viz.ofStart', { pct: f.pct(pctOf(s.count, first) ?? (i === 0 ? 100 : null)) })}</p>
              <div className="relative mt-2">
                <div className="relative overflow-hidden rounded-lg bg-sunken" style={{ height }} title={showPrev && s.prev != null ? `${t('viz.previous')}: ${f.num(s.prev)}` : undefined}>
                  <div className="absolute inset-x-0 bottom-0 motion-safe:transition-[height] motion-safe:duration-500" style={{ height: `${h(s.count)}%` }}>
                    <div className="absolute inset-0 bg-[var(--viz-1)] opacity-20" />
                    <div className="absolute inset-x-0 top-0 h-[3px] rounded-full bg-[var(--viz-1)]" />
                  </div>
                  {showPrev && s.prev != null && s.prev > 0 && (
                    <div className="absolute inset-x-1.5 border-t-2 border-dashed border-[var(--viz-ghost)]" style={{ bottom: `${h(s.prev)}%` }} />
                  )}
                </div>
                {conv !== null && (
                  <span className="absolute top-1/2 -left-1 z-[1] -translate-x-1/2 -translate-y-1/2 rounded-full border border-line bg-raised px-1.5 py-0.5 text-[10px] font-semibold text-ink tabular-nums shadow-[var(--tv-shadow-card)]">
                    {f.pct(conv)}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* phones: rows */}
      <ol className="space-y-2.5 sm:hidden" aria-hidden>
        {steps.map((s, i) => {
          const conv = i > 0 ? pctOf(s.count, steps[i - 1].count) : null;
          return (
            <Fragment key={s.key}>
              {conv !== null && <li className="-my-1 pl-1 text-[11px] text-muted tabular-nums">↓ {f.pct(conv)}</li>}
              <li>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-xs font-medium text-ink">
                    {i + 1}. {s.label}
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">
                    <span className="text-sm font-semibold text-ink">{f.num(s.count)}</span> · {f.pct(pctOf(s.count, first) ?? (i === 0 ? 100 : null))}
                  </span>
                </div>
                <div className="relative mt-1 h-2 rounded-full bg-sunken">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--viz-1)]" style={{ width: `${h(s.count)}%` }} />
                  {showPrev && s.prev != null && s.prev > 0 && <div className="absolute -inset-y-1 border-l-2 border-dashed border-[var(--viz-ghost)]" style={{ left: `${h(s.prev)}%` }} />}
                </div>
              </li>
            </Fragment>
          );
        })}
      </ol>

      <div className="mt-3 flex items-center justify-between gap-3">
        {showPrev ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <span className="w-4 border-t-2 border-dashed border-[var(--viz-ghost)]" aria-hidden /> {t('viz.prevMarker')}
          </span>
        ) : (
          <span />
        )}
        <TableToggle open={table} onToggle={() => setTable((v) => !v)} controls={tableId} />
      </div>
      {table ? (
        <DataTable
          id={tableId}
          className="mt-2"
          head={[ariaLabel, t('viz.value'), ...(showPrev ? [t('viz.previous')] : []), t('viz.ofStart', { pct: '%' }), t('viz.stepRate')]}
          rows={steps.map((s, i) => [
            `${i + 1}. ${s.label}`,
            f.num(s.count),
            ...(showPrev ? [s.prev == null ? '—' : f.num(s.prev)] : []),
            f.pct(pctOf(s.count, first) ?? (i === 0 ? 100 : null)),
            i === 0 ? '—' : f.pct(pctOf(s.count, steps[i - 1].count)),
          ])}
        />
      ) : (
        <span id={tableId} hidden />
      )}
      <span className={clsx('sr-only')}>
        {steps.map((s, i) => `${i + 1}. ${s.label}: ${f.num(s.count)}${showPrev && s.prev != null ? ` (${t('viz.previous')}: ${f.num(s.prev)})` : ''}`).join('; ')}
      </span>
    </figure>
  );
};
