import { useId, useState } from 'react';
import { m } from 'framer-motion';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { registerCopy } from '@/i18n';
import { pagesDashboards } from '@/i18n/pagesDashboards';
import { VIZ, useVizFormat } from './format';
import { DataTable, TableToggle } from './parts';

registerCopy(pagesDashboards);

export interface PipelineStep {
  key: string;
  count: number;
  /** % of the previous step. */
  rate: number | null;
  /** % of the first step. */
  ofFirst: number | null;
  /** People who reached the previous step but not this one. */
  dropped: number;
}

/**
 * Animated funnel of the application path (registration → documents → contract → embassy → visa): centred bars that
 * grow from the middle one after another when the chart scrolls into view (transform only, so "reduce motion"
 * switches it off through MotionConfig), each with its count, its share of the registered and the drop-off to the
 * next step. The biggest loss is spelled out below; a table view lists every number (text alternative).
 */
export const AnimatedFunnel = ({ steps }: { steps: PipelineStep[] }) => {
  const { t } = useTranslation();
  const f = useVizFormat();
  const tableId = useId();
  const [table, setTable] = useState(false);
  const first = steps[0]?.count ?? 0;
  const label = (key: string) => t(`dash.funnel.steps.${key}`);
  const summary = steps.map((s) => `${label(s.key)} ${f.num(s.count)}`).join(', ');
  const worst = steps.slice(1).reduce<{ i: number; dropped: number } | null>((w, s, k) => (s.dropped > (w?.dropped ?? 0) ? { i: k + 1, dropped: s.dropped } : w), null);

  if (!first) return <p className="py-8 text-center text-sm text-muted">{t('dash.funnel.none')}</p>;
  return (
    <figure className="m-0">
      <figcaption className="sr-only">{t('dash.funnel.aria', { summary })}</figcaption>
      <ol className="space-y-2" aria-hidden>
        {steps.map((s, i) => {
          const width = s.count === 0 ? 0 : Math.max(6, (s.count / first) * 100);
          return (
            <li key={s.key} className="grid items-center gap-x-3 gap-y-1 sm:grid-cols-[7.5rem_minmax(0,1fr)_7.5rem]">
              <span className="text-xs font-medium text-ink sm:text-right">
                {i + 1}. {label(s.key)}
              </span>
              <div className="relative h-9 rounded-lg bg-sunken">
                <m.div
                  className="absolute inset-y-0 left-1/2 flex origin-center items-center justify-center rounded-lg"
                  style={{ width: `${width}%`, marginLeft: `${-width / 2}%`, background: VIZ[0], opacity: 1 - i * 0.12 }}
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.6, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums mix-blend-normal" style={{ color: 'var(--color-ink)' }}>
                  <span className="rounded bg-card/80 px-1.5">{f.num(s.count)}</span>
                </span>
              </div>
              <span className="text-[11px] leading-4 text-muted tabular-nums">
                {i === 0 ? (
                  '100%'
                ) : (
                  <>
                    {f.pct(s.ofFirst)} {t('dash.funnel.ofFirst')}
                    {s.dropped > 0 && <span className={clsx('block font-semibold', worst?.i === i ? 'text-danger-fg' : 'text-warning-fg')}>{t('dash.funnel.dropped', { count: s.dropped })}</span>}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {worst && <p className="mt-4 rounded-lg border border-line bg-sunken px-3 py-2 text-xs text-ink/80">{t('dash.funnel.biggest', { from: label(steps[worst.i - 1].key), to: label(steps[worst.i].key), count: worst.dropped })}</p>}
      <div className="mt-3 flex justify-end">
        <TableToggle open={table} onToggle={() => setTable((v) => !v)} controls={tableId} />
      </div>
      {table ? (
        <DataTable
          id={tableId}
          className="mt-2"
          head={[t('dash.funnel.table'), t('dash.funnel.count'), t('dash.funnel.lost'), t('viz.ofStart', { pct: '%' }), t('viz.stepRate')]}
          rows={steps.map((s, i) => [`${i + 1}. ${label(s.key)}`, f.num(s.count), i === 0 ? '—' : f.num(s.dropped), f.pct(s.ofFirst), i === 0 ? '—' : f.pct(s.rate)])}
        />
      ) : (
        <span id={tableId} hidden />
      )}
    </figure>
  );
};
