import { useId, useState } from 'react';
import { m } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { registerCopy } from '@/i18n';
import { pagesDashboards } from '@/i18n/pagesDashboards';
import { GRID, VIZ, niceStep, useVizFormat } from './format';
import { DataTable, TableToggle } from './parts';

registerCopy(pagesDashboards);

export interface PlanMonth {
  month: string;
  expected: number;
  received: number;
  prevExpected: number | null;
  prevReceived: number | null;
}

/**
 * Expected vs received money by month: two bars per month (expected = invoices due, received = paid), a dashed tick
 * on each bar for the same month of the previous period. Bars grow from the baseline (scaleY, transform only: reduced
 * motion turns it off). Values in cents. Table view = text alternative; the aria summary lists the totals.
 */
export const PlanBars = ({ months, height = 220, monthLabel }: { months: PlanMonth[]; height?: number; monthLabel: (m: string) => string }) => {
  const { t } = useTranslation();
  const f = useVizFormat();
  const tableId = useId();
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...months.flatMap((x) => [x.expected, x.received, x.prevExpected ?? 0, x.prevReceived ?? 0]));
  const step = niceStep(max / 100, 4) * 100;
  const top = Math.ceil(max / step) * step || step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const pct = (v: number) => `${Math.max(0, (v / top) * 100)}%`;
  const total = months.reduce((a, x) => ({ e: a.e + x.expected, r: a.r + x.received }), { e: 0, r: 0 });
  const summary = `${t('dash.plan.expected')} ${f.eur(total.e)}, ${t('dash.plan.received')} ${f.eur(total.r)}`;

  return (
    <figure className="m-0">
      <figcaption className="sr-only">
        {t('dash.plan.aria')}: {summary}
      </figcaption>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: VIZ[0] }} /> {t('dash.plan.expected')} <b className="text-ink tabular-nums">{f.eurCompact(total.e)}</b>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: VIZ[2] }} /> {t('dash.plan.received')} <b className="text-ink tabular-nums">{f.eurCompact(total.r)}</b>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-[var(--viz-ghost)]" /> {t('dash.plan.prev')}
        </span>
        {total.e > 0 && (
          <span className="ml-auto">
            {t('dash.plan.collected')}: <b className="text-ink tabular-nums">{f.pct(Math.round((total.r / total.e) * 1000) / 10)}</b>
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2" aria-hidden>
        <div className="relative w-12 shrink-0 text-right text-[10px] text-muted tabular-nums" style={{ height }}>
          {ticks.map((v) => (
            <span key={v} className="absolute right-0 -translate-y-1/2" style={{ bottom: pct(v) }}>
              {f.eurCompact(v)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 overflow-x-auto">
          <div className="relative" style={{ height, minWidth: months.length * 34 }}>
            {ticks.map((v) => (
              <span key={v} className="absolute inset-x-0 border-t" style={{ bottom: pct(v), borderColor: GRID }} />
            ))}
            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
              {months.map((x, i) => (
                <div key={x.month} className="relative flex items-end justify-center gap-1 px-1" title={`${monthLabel(x.month)}: ${t('dash.plan.expected')} ${f.eur(x.expected)}, ${t('dash.plan.received')} ${f.eur(x.received)}`}>
                  {(
                    [
                      { v: x.expected, prev: x.prevExpected, color: VIZ[0] },
                      { v: x.received, prev: x.prevReceived, color: VIZ[2] },
                    ] as const
                  ).map((b, k) => (
                    <div key={k} className="relative h-full w-full max-w-[14px]">
                      <m.div
                        className="absolute inset-x-0 bottom-0 origin-bottom rounded-t-[4px]"
                        style={{ height: pct(b.v), background: b.color, minHeight: b.v > 0 ? 2 : 0 }}
                        initial={{ scaleY: 0 }}
                        whileInView={{ scaleY: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.55, delay: i * 0.04 + k * 0.05, ease: [0.22, 1, 0.36, 1] }}
                      />
                      {b.prev != null && b.prev > 0 && <span className="absolute -inset-x-0.5 border-t-2 border-dashed border-[var(--viz-ghost)]" style={{ bottom: pct(b.prev) }} />}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1 grid text-center text-[10px] text-muted" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))`, minWidth: months.length * 34 }}>
            {months.map((x) => (
              <span key={x.month}>{monthLabel(x.month)}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <TableToggle open={table} onToggle={() => setTable((v) => !v)} controls={tableId} />
      </div>
      {table ? (
        <DataTable
          id={tableId}
          className="mt-2"
          head={[t('dash.plan.table'), t('dash.plan.expected'), t('dash.plan.received'), `${t('dash.plan.prev')}: ${t('dash.plan.expected')}`, `${t('dash.plan.prev')}: ${t('dash.plan.received')}`]}
          rows={[
            ...months.map((x) => [monthLabel(x.month), f.eur(x.expected), f.eur(x.received), x.prevExpected == null ? '—' : f.eur(x.prevExpected), x.prevReceived == null ? '—' : f.eur(x.prevReceived)]),
            [t('dash.plan.total'), f.eur(total.e), f.eur(total.r), '', ''],
          ]}
        />
      ) : (
        <span id={tableId} hidden />
      )}
    </figure>
  );
};
