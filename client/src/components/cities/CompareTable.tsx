import { useTranslation } from 'react-i18next';
import { Scale, X } from 'lucide-react';
import { DEUTSCHLANDTICKET, type City } from '@/lib/cities/data';
import { estimate, flatRent } from '@/lib/cities/calc';
import { useCityFormat } from './format';
import { EmptyState } from '@/components/ui/EmptyState';

/** Side-by-side comparison of up to three cities. */
export const CompareTable = ({ cities, onRemove, onClear }: { cities: City[]; onRemove: (slug: string) => void; onClear: () => void }) => {
  const { t } = useTranslation();
  const f = useCityFormat();

  if (!cities.length) {
    return (
      <EmptyState className="rounded-2xl border border-dashed border-line bg-card" icon={Scale} title={t('citiesPage.compare.empty')} text={t('citiesPage.compare.hint')} />
    );
  }

  const rows: { key: string; value: (c: City) => string; highlight?: boolean }[] = [
    { key: 'state', value: (c) => c.state },
    { key: 'population', value: (c) => f.num(c.population) },
    { key: 'rent1', value: (c) => f.range(flatRent(c, 'room1')) },
    { key: 'rent2', value: (c) => f.range(flatRent(c, 'room2')) },
    { key: 'wg', value: (c) => f.range(c.wgRoom) },
    { key: 'utilities', value: (c) => `${f.dec(c.utilities[0])}–${f.dec(c.utilities[1])}` },
    { key: 'groceries', value: (c) => f.range(c.groceries) },
    { key: 'transport', value: () => `${DEUTSCHLANDTICKET} €` },
    { key: 'single', value: (c) => f.range(estimate(c, { household: 'single', children: 0, housing: 'room1', car: false }).total), highlight: true },
    { key: 'family', value: (c) => f.range(estimate(c, { household: 'family', children: 1, housing: 'room2', car: false }).total), highlight: true },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-line bg-surface/70">
            <tr>
              <th className="px-4 py-3">
                <button type="button" onClick={onClear} className="text-xs font-semibold text-muted hover:text-ink">
                  {t('citiesPage.compare.clear')}
                </button>
              </th>
              {cities.map((c) => (
                <th key={c.slug} className="px-4 py-3 font-display text-base font-extrabold text-ink">
                  <span className="inline-flex items-center gap-1.5">
                    {f.l4(c.name)}
                    <button type="button" onClick={() => onRemove(c.slug)} className="grid size-6 place-items-center rounded-full text-muted hover:bg-card hover:text-ink" aria-label={t('citiesPage.card.remove')}>
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.key} className={r.highlight ? 'bg-brand-50/60' : undefined}>
                <th scope="row" className="px-4 py-2.5 text-xs font-semibold text-muted">
                  {t(`citiesPage.compare.rows.${r.key}`)}
                </th>
                {cities.map((c) => (
                  <td key={c.slug} className={r.highlight ? 'px-4 py-2.5 font-bold text-brand-700 tabular-nums' : 'px-4 py-2.5 text-ink tabular-nums'}>
                    {r.value(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
