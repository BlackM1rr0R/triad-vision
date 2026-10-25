import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Bus, Calculator, Check, ChevronDown, CloudSun, ExternalLink, Factory, Home, MapPin, Plane, Plus, Smartphone, Users } from 'lucide-react';
import { DATA_YEAR, DEUTSCHLANDTICKET, type City } from '@/lib/cities/data';
import { keyFigures } from '@/lib/cities/calc';
import { useCityFormat } from './format';

export const CityCard = ({
  city,
  selected,
  canSelect,
  onToggle,
  onCalc,
}: {
  city: City;
  selected: boolean;
  canSelect: boolean;
  onToggle: () => void;
  onCalc: () => void;
}) => {
  const { t } = useTranslation();
  const f = useCityFormat();
  const [open, setOpen] = useState(false);
  const k = keyFigures(city);
  const small = city.slug === 'small-town';

  return (
    <article className={clsx('flex flex-col rounded-2xl border bg-card p-5 shadow-[var(--tv-shadow-card)] transition-[border-color,box-shadow] duration-200 sm:p-6', selected ? 'border-primary ring-2 ring-focus/40' : 'border-line hover:border-line-strong hover:shadow-[var(--tv-shadow-raised)]')}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-ink">{f.l4(city.name)}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {!small && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden /> {city.state}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" aria-hidden /> {small ? `≈ ${t('citiesPage.pop', { n: f.num(city.population) })}` : t('citiesPage.pop', { n: f.num(city.population) })}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={!selected && !canSelect}
          aria-pressed={selected}
          title={selected ? t('citiesPage.card.remove') : canSelect ? t('citiesPage.card.compare') : t('citiesPage.compare.max')}
          className={clsx(
            'grid size-11 shrink-0 place-items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            selected ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-sunken text-ink hover:border-line-strong hover:bg-card',
          )}
        >
          {selected ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          <span className="sr-only">{selected ? t('citiesPage.card.remove') : t('citiesPage.card.compare')}</span>
        </button>
      </header>

      <p className="mt-3 text-sm leading-relaxed text-muted">{f.l4(city.description)}</p>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-sunken p-3">
          <dt className="text-[11px] leading-tight text-muted">{t('citiesPage.card.rent1')}</dt>
          <dd className="mt-1 font-bold text-ink tabular-nums">{f.range(k.oneRoom)}</dd>
        </div>
        <div className="rounded-xl bg-sunken p-3">
          <dt className="text-[11px] leading-tight text-muted">{t('citiesPage.card.wg')}</dt>
          <dd className="mt-1 font-bold text-ink tabular-nums">{f.range(k.wg)}</dd>
        </div>
        <div className="rounded-xl bg-sunken p-3">
          <dt className="text-[11px] leading-tight text-muted">{t('citiesPage.card.groceries')}</dt>
          <dd className="mt-1 font-bold text-ink tabular-nums">{f.range(k.groceries)}</dd>
        </div>
        <div className="rounded-xl border border-line-strong bg-card p-3">
          <dt className="text-[11px] leading-tight text-muted">{t('citiesPage.card.single')}</dt>
          <dd className="mt-1 font-bold text-ink tabular-nums">{f.range(k.single)}</dd>
        </div>
      </dl>

      <div className={clsx('grid transition-[grid-template-rows] duration-300 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className={clsx('mt-4 space-y-3 border-t border-line pt-4 text-sm transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')}>
            <Row icon={Factory} title={t('citiesPage.detail.industries')}>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {city.industries.map((i) => (
                  <li key={i} className="rounded-full border border-line bg-sunken px-2 py-0.5 text-xs text-ink/80">
                    {t(`citiesPage.industries.${i}`)}
                  </li>
                ))}
              </ul>
            </Row>
            <Row icon={Home} title={t('citiesPage.detail.rent')}>
              <p className="text-muted">
                {t('citiesPage.detail.oneRoom')}: <span className="font-semibold text-ink tabular-nums">{t('citiesPage.card.perM2', { lo: f.dec(city.rent.oneRoom[0]), hi: f.dec(city.rent.oneRoom[1]) })}</span> · {t('citiesPage.detail.twoRoom')}:{' '}
                <span className="font-semibold text-ink tabular-nums">{t('citiesPage.card.perM2', { lo: f.dec(city.rent.twoRoom[0]), hi: f.dec(city.rent.twoRoom[1]) })}</span>
              </p>
              <p className="text-muted">
                {t('citiesPage.detail.utilities')}: {t('citiesPage.detail.utilitiesValue', { lo: f.dec(city.utilities[0]), hi: f.dec(city.utilities[1]) })}
              </p>
            </Row>
            <Row icon={Bus} title={t('citiesPage.detail.transport')}>
              <p className="text-muted">
                {t('citiesPage.detail.ticket', { price: DEUTSCHLANDTICKET, year: DATA_YEAR })} {t('citiesPage.detail.jobticket')}
              </p>
              {city.transport !== '—' && <p className="text-muted">{t('citiesPage.detail.local', { ops: city.transport })}</p>}
            </Row>
            <Row icon={Smartphone} title={t('citiesPage.detail.mobile')}>
              <p className="text-muted">{t('citiesPage.detail.mobileValue')}</p>
            </Row>
            <Row icon={Users} title={t('citiesPage.detail.community')}>
              <p className="text-muted">{t(`citiesPage.community.${city.community}`)}</p>
            </Row>
            <Row icon={CloudSun} title={t('citiesPage.detail.climate')}>
              <p className="text-muted">{t(`citiesPage.climate.${city.climate}`)}</p>
            </Row>
            {city.airport && (
              <Row icon={Plane} title={t('citiesPage.detail.airport')}>
                <p className="font-semibold text-ink">{city.airport}</p>
              </Row>
            )}
            {city.website && (
              <a href={city.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-link hover:underline">
                <ExternalLink className="size-3.5" aria-hidden /> {t('citiesPage.card.website')} ({new URL(city.website).hostname.replace(/^www\./, '')})
              </a>
            )}
          </div>
        </div>
      </div>

      <footer className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-ink/80 transition-colors hover:bg-sunken hover:text-ink">
          {open ? t('citiesPage.card.less') : t('citiesPage.card.more')}
          <ChevronDown className={clsx('size-4 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
        </button>
        <button type="button" onClick={onCalc} className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-link transition-colors hover:bg-sunken">
          <Calculator className="size-4" aria-hidden /> {t('citiesPage.card.calc')}
        </button>
      </footer>
    </article>
  );
};

const Row = ({ icon: Icon, title, children }: { icon: typeof Home; title: string; children: ReactNode }) => (
  <div className="flex gap-2.5">
    <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
    <div className="min-w-0">
      <p className="text-xs font-bold tracking-wide text-ink uppercase">{title}</p>
      <div className="mt-0.5 space-y-1">{children}</div>
    </div>
  </div>
);
