import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, Info, Minus, Plus, Wallet } from 'lucide-react';
import { CITIES, DATA_YEAR, KINDERGELD, cityBySlug } from '@/lib/cities/data';
import { FLAT_SIZE, estimate, suggestedHousing, type Household, type Housing } from '@/lib/cities/calc';
import { useCityFormat } from './format';

const HOUSEHOLDS: Household[] = ['single', 'couple', 'family'];
const HOUSINGS: Housing[] = ['wg', 'room1', 'room2', 'room3'];

const Segmented = <T extends string>({ value, options, onChange, label, render }: { value: T; options: T[]; onChange: (v: T) => void; label: string; render: (v: T) => ReactNode }) => (
  <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-line bg-sunken p-1">
    {options.map((o) => (
      <button
        key={o}
        type="button"
        role="radio"
        aria-checked={value === o}
        onClick={() => onChange(o)}
        className={clsx('min-h-11 rounded-lg px-2 py-2 text-sm font-semibold transition-colors', value === o ? 'bg-card text-ink shadow-[var(--tv-shadow-card)]' : 'text-muted hover:text-ink')}
      >
        {render(o)}
      </button>
    ))}
  </div>
);

export const CostCalculator = ({ citySlug, onCityChange }: { citySlug: string; onCityChange: (slug: string) => void }) => {
  const { t } = useTranslation();
  const f = useCityFormat();
  const city = cityBySlug(citySlug) ?? CITIES[0];
  const [household, setHousehold] = useState<Household>('single');
  const [children, setChildren] = useState(1);
  const [housing, setHousing] = useState<Housing>('room1');
  const [housingTouched, setHousingTouched] = useState(false);
  const [car, setCar] = useState(false);
  const [net, setNet] = useState('');

  const result = useMemo(() => estimate(city, { household, children, housing, car }), [city, household, children, housing, car]);
  const netValue = Number(net.replace(/\s/g, '').replace(',', '.'));
  const hasNet = net.trim() !== '' && Number.isFinite(netValue) && netValue > 0;
  const left = hasNet ? netValue - result.mid : 0;

  const pickHousehold = (h: Household) => {
    setHousehold(h);
    if (!housingTouched) setHousing(suggestedHousing(h, children));
  };
  const changeChildren = (n: number) => {
    const v = Math.max(1, Math.min(6, n));
    setChildren(v);
    if (!housingTouched) setHousing(suggestedHousing('family', v));
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-5 rounded-3xl border border-line bg-card p-5 shadow-[var(--tv-shadow-card)] sm:p-7">
        <label className="block">
          <span className="label">{t('citiesPage.calc.city')}</span>
          <select className="input" value={city.slug} onChange={(e) => onCityChange(e.target.value)}>
            {CITIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {f.l4(c.name)}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="label">{t('citiesPage.calc.household')}</span>
          <Segmented value={household} options={HOUSEHOLDS} onChange={pickHousehold} label={t('citiesPage.calc.household')} render={(h) => t(`citiesPage.calc.${h}`)} />
          {household === 'family' && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-sunken px-3 py-2">
              <span className="text-sm font-medium text-ink">{t('citiesPage.calc.children')}</span>
              <span className="flex items-center gap-2">
                <button type="button" className="grid size-11 place-items-center rounded-xl border border-line bg-card text-ink transition-colors hover:border-line-strong disabled:opacity-40" onClick={() => changeChildren(children - 1)} disabled={children <= 1} aria-label="−">
                  <Minus className="size-4" aria-hidden />
                </button>
                <span className="w-6 text-center font-bold text-ink tabular-nums" aria-live="polite">
                  {children}
                </span>
                <button type="button" className="grid size-11 place-items-center rounded-xl border border-line bg-card text-ink transition-colors hover:border-line-strong disabled:opacity-40" onClick={() => changeChildren(children + 1)} disabled={children >= 6} aria-label="+">
                  <Plus className="size-4" aria-hidden />
                </button>
              </span>
            </div>
          )}
        </div>

        <div>
          <span className="label">{t('citiesPage.calc.housing')}</span>
          <Segmented
            value={housing}
            options={HOUSINGS}
            onChange={(h) => {
              setHousing(h);
              setHousingTouched(true);
            }}
            label={t('citiesPage.calc.housing')}
            render={(h) => (
              <span className="block leading-tight">
                {t(`citiesPage.calc.${h}`)}
                {h !== 'wg' && <span className="block text-[10px] font-normal opacity-70">{t('citiesPage.calc.size', { m2: FLAT_SIZE[h] })}</span>}
              </span>
            )}
          />
          {housing === 'wg' && household !== 'single' && <p className="mt-2 text-xs text-muted">{t('citiesPage.calc.wgHint')}</p>}
        </div>

        <div>
          <span className="label">{t('citiesPage.calc.car')}</span>
          <Segmented value={car ? 'yes' : 'no'} options={['no', 'yes']} onChange={(v) => setCar(v === 'yes')} label={t('citiesPage.calc.car')} render={(v) => t(`citiesPage.calc.${v}`)} />
        </div>

        <label className="block">
          <span className="label">{t('citiesPage.calc.net')}</span>
          <div className="relative">
            <input className="input pr-10" inputMode="decimal" placeholder="2 400" value={net} onChange={(e) => setNet(e.target.value.replace(/[^\d.,\s]/g, '').slice(0, 9))} />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">€</span>
          </div>
          <span className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            {t('citiesPage.calc.netHint')}
            <Link to="/salary-calculator" className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
              {t('citiesPage.calc.salaryLink')} <ArrowRight className="size-3" aria-hidden />
            </Link>
          </span>
        </label>
      </div>

      <div className="flex flex-col rounded-3xl border border-line bg-card p-5 shadow-[var(--tv-shadow-card)] sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-ink">
            {t('citiesPage.calc.breakdown')} · {f.l4(city.name)}
          </h3>
          <span className="rounded-full bg-sunken px-2.5 py-1 text-[11px] font-semibold text-muted">{t('citiesPage.approx', { year: DATA_YEAR })}</span>
        </div>
        <ul className="mt-4 divide-y divide-line text-sm">
          {result.lines.map((l) => {
            const share = result.total[1] ? (l.range[1] / result.total[1]) * 100 : 0;
            return (
              <li key={l.key} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink/85">{l.key === 'rent' && housing === 'wg' ? t('citiesPage.calc.wgRent') : t(`citiesPage.calc.lines.${l.key}`)}</span>
                  <span className="font-semibold whitespace-nowrap text-ink tabular-nums">{f.range(l.range)}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
                  <div className="h-full rounded-full bg-primary/70 transition-[width] duration-500 ease-out" style={{ width: `${Math.max(2, share)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 rounded-2xl bg-sunken p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold text-ink">{t('citiesPage.calc.total')}</span>
            <span className="font-display text-2xl font-semibold text-ink tabular-nums">{f.range(result.total)}</span>
          </div>
          {hasNet && (
            <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                <Wallet className="size-4" aria-hidden /> {left >= 0 ? t('citiesPage.calc.remaining') : t('citiesPage.calc.deficit')}
              </span>
              <span className={clsx('font-display text-xl font-semibold tabular-nums', left >= 0 ? 'text-success-fg' : 'text-danger-fg')}>{f.euro(Math.abs(left))}</span>
            </div>
          )}
        </div>
        <div className="mt-4 space-y-2 text-xs text-muted">
          {result.kids > 0 && <p>{t('citiesPage.calc.kindergeld', { amount: KINDERGELD, year: DATA_YEAR })}</p>}
          <p className="flex gap-1.5">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('citiesPage.calc.notIncluded')}
          </p>
        </div>
      </div>
    </div>
  );
};
