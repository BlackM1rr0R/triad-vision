import { useState } from 'react';
import { Link } from 'react-router-dom';
import { m } from 'framer-motion';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesDashboards } from '@/i18n/pagesDashboards';
import { statusLabel } from '@/components/admin/labels';
import { ErrorBlock, LoadingBlock } from '@/components/admin/ui';
import { useVizFormat } from '@/components/charts';
import { fmtDate } from '@/components/admin/labels';
import { useHeatCases, useStageHeatmap, type HeatBucket, type HeatStage } from './api';

registerCopy(pagesDashboards);

/** Cell colour: neutral blue for normal waits, red for stuck ones; intensity follows the count (readable in both themes). */
const cellStyle = (count: number, max: number, stuck: boolean) => {
  if (count === 0) return undefined;
  const alpha = 14 + Math.round((count / Math.max(1, max)) * 56);
  return { background: `color-mix(in oklab, ${stuck ? 'var(--color-danger)' : 'var(--viz-1)'} ${alpha}%, transparent)` };
};

/**
 * Stage × waiting-time heatmap of the open cases: red cells = cases that have waited 30+ days in their stage. A cell
 * is a button: it opens the list of the cases behind it (the server applies the viewer's case scope to grid and
 * list). Cells fade in row by row (opacity only). Every number is also in the cells' text, so the grid is its own
 * text alternative; the figure caption summarises the stuck cases per stage.
 */
export const StageHeatmapView = ({ visaCategoryId = '' }: { visaCategoryId?: string }) => {
  const { t } = useTranslation();
  const f = useVizFormat();
  const q = useStageHeatmap(visaCategoryId);
  const [sel, setSel] = useState<{ stage: HeatStage; bucket: HeatBucket } | null>(null);
  const list = useHeatCases(sel, visaCategoryId);

  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  if (!d) return null;
  if (!d.totalOpen) return <p className="py-8 text-center text-sm text-muted">{t('dash.heat.empty')}</p>;

  const summary = d.rows
    .filter((r) => r.total > 0)
    .map((r) => t('dash.heat.summary', { stage: statusLabel(r.stage), total: r.total, stuck: r.stuck }))
    .join('; ');
  const bucketLabel = (b: HeatBucket) => t(`dash.heat.buckets.${b}`);

  return (
    <figure className="m-0 space-y-4">
      <figcaption className="sr-only">{t('dash.heat.aria', { summary })}</figcaption>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        <span>
          {t('dash.heat.openTotal')}: <b className="text-ink tabular-nums">{f.num(d.totalOpen)}</b>
        </span>
        <span>
          {t('dash.heat.stuckTotal')}: <b className={clsx('tabular-nums', d.totalStuck ? 'text-danger-fg' : 'text-ink')}>{f.num(d.totalStuck)}</b>
        </span>
        <span className="ml-auto inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm" style={{ background: 'color-mix(in oklab, var(--viz-1) 50%, transparent)' }} /> {t('dash.heat.okLegend')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm" style={{ background: 'color-mix(in oklab, var(--color-danger) 50%, transparent)' }} /> {t('dash.heat.stuckLegend')}
          </span>
        </span>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[560px] border-separate border-spacing-1 text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="px-2 py-1 text-left font-medium">
                {t('dash.heat.stage')}
              </th>
              {d.buckets.map((b) => (
                <th key={b.key} scope="col" className={clsx('px-2 py-1 text-center font-medium', b.stuck && 'text-danger-fg')}>
                  {bucketLabel(b.key)}
                </th>
              ))}
              <th scope="col" className="px-2 py-1 text-right font-medium">
                {t('dash.heat.total')}
              </th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r, ri) => (
              <tr key={r.stage}>
                <th scope="row" className="max-w-[12rem] truncate px-2 py-1 text-left text-xs font-medium text-ink" title={statusLabel(r.stage)}>
                  {statusLabel(r.stage)}
                </th>
                {d.buckets.map((b, bi) => {
                  const count = r.counts[b.key];
                  const active = sel?.stage === r.stage && sel.bucket === b.key;
                  return (
                    <td key={b.key} className="p-0">
                      <m.button
                        type="button"
                        disabled={count === 0}
                        aria-pressed={active}
                        aria-label={t('dash.heat.cellAria', { stage: statusLabel(r.stage), bucket: bucketLabel(b.key), count })}
                        onClick={() => setSel(active ? null : { stage: r.stage, bucket: b.key })}
                        className={clsx(
                          'flex h-11 w-full items-center justify-center rounded-md border text-sm font-semibold tabular-nums transition-colors',
                          count === 0 ? 'cursor-default border-transparent bg-sunken/50 text-muted/60' : 'cursor-pointer text-ink hover:border-line-strong',
                          active ? 'border-ink' : count > 0 && 'border-transparent',
                          b.stuck && count > 0 && 'text-danger-fg',
                        )}
                        style={cellStyle(count, d.max, b.stuck)}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: ri * 0.05 + bi * 0.03 }}
                      >
                        {count || '·'}
                      </m.button>
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-right text-xs font-semibold text-ink tabular-nums">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && (
        <div className="rounded-xl border border-line bg-surface/60 p-3 sm:p-4" role="region" aria-live="polite" aria-label={t('dash.heat.listTitle', { stage: statusLabel(sel.stage), bucket: bucketLabel(sel.bucket) })}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">{t('dash.heat.listTitle', { stage: statusLabel(sel.stage), bucket: bucketLabel(sel.bucket) })}</h3>
            <button type="button" className="btn-ghost btn-sm min-h-9" onClick={() => setSel(null)} aria-label={t('dash.heat.close')}>
              <X className="size-4" aria-hidden />
            </button>
          </div>
          {list.isLoading ? (
            <LoadingBlock />
          ) : list.error ? (
            <p className="text-sm text-muted">{(list.error as { response?: { status?: number } }).response?.status === 403 ? t('dash.heat.noCasesPermission') : t('dash.heat.listEmpty')}</p>
          ) : !list.data?.items.length ? (
            <p className="text-sm text-muted">{t('dash.heat.listEmpty')}</p>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {list.data.items.map((c) => (
                  <li key={c.id}>
                    <Link to={`/admin/cases/${c.id}`} className="-mx-2 flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-sunken">
                      <span className="min-w-0">
                        <span className="font-mono text-xs text-muted">{c.number}</span>
                        {c.client && <span className="ml-2 font-medium text-ink">{c.client}</span>}
                      </span>
                      <span className="text-xs text-muted tabular-nums">
                        <b className={clsx(c.waitingDays >= 30 ? 'text-danger-fg' : 'text-ink')}>{t('dash.heat.waiting', { count: c.waitingDays })}</b> · {fmtDate(c.since)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {list.data.total > list.data.items.length && <p className="mt-2 text-xs text-muted">{t('dash.heat.more', { count: list.data.total - list.data.items.length })}</p>}
            </>
          )}
        </div>
      )}
    </figure>
  );
};
