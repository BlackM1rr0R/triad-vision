import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { m as motion, useReducedMotion } from 'framer-motion';
import { registerCopy } from '@/i18n';
import { pagesVisualPlus } from '@/i18n/pagesVisualPlus';
import type { CostLine } from '@/lib/cities/calc';
import { moneyBars, type BarKey } from '@/lib/cities/chart';
import { useCityFormat } from './format';

registerCopy(pagesVisualPlus);

const FILL: Record<BarKey, string> = {
  net: 'bg-success',
  rent: 'bg-primary',
  food: 'bg-highlight',
  other: 'bg-subtle',
  left: 'bg-success',
};

/**
 * Animated bars "net salary / rent / food / other / left" for the chosen city (monthly estimates, middle of the ranges
 * of the cities calculator; the net salary is the visitor's own input). Bars re-grow when the city or the household
 * changes. Theme tokens only (readable in light and dark); a text summary is the accessible alternative.
 */
export const MoneyBars = ({ lines, total, net, cityName }: { lines: readonly CostLine[]; total: readonly [number, number]; net: number | null; cityName: string }) => {
  const { t } = useTranslation();
  const f = useCityFormat();
  const reduce = useReducedMotion();
  const { bars, deficit } = moneyBars(lines, total, net);
  const label = (k: BarKey) => (k === 'net' ? t('citiesPage.calc.net') : k === 'rent' ? t('citiesPage.calc.lines.rent') : k === 'food' ? t('citiesPage.calc.lines.groceries') : k === 'other' ? t('vizp.chart.other') : deficit ? t('citiesPage.calc.deficit') : t('citiesPage.calc.remaining'));
  const summary = bars.map((b) => `${label(b.key)} ${f.euro(b.value)}`).join(', ');

  return (
    <section className="mt-5" aria-label={t('vizp.chart.title')} data-testid="money-bars">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-ink">{t('vizp.chart.title')}</h4>
        <span className="rounded-full bg-sunken px-2.5 py-1 text-[11px] font-semibold text-muted">{t('vizp.chart.approx')}</span>
      </div>
      <div role="img" aria-label={t('vizp.chart.aria', { city: cityName, summary })} className="mt-3 space-y-2.5">
        {bars.map((b) => (
          <div key={b.key} aria-hidden className="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-xs sm:grid-cols-[8rem_minmax(0,1fr)_5rem]">
            <span className="truncate text-ink/85">{label(b.key)}</span>
            <span className="h-3 overflow-hidden rounded-full bg-sunken">
              <motion.span
                key={`${b.key}-${cityName}`}
                className={clsx('block h-full origin-left rounded-full', b.key === 'left' && deficit ? 'bg-danger' : FILL[b.key])}
                style={{ width: `${b.percent}%` }}
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
            <span className={clsx('text-right font-semibold tabular-nums', b.key === 'left' && deficit ? 'text-danger-fg' : 'text-ink')}>{f.euro(b.value)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">{t('vizp.chart.note')}</p>
    </section>
  );
};
