import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Building2, Coffee, ExternalLink, Globe, Info, Landmark, MapPin, MessageSquarePlus, Phone, Users } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Germany } from '@/components/illustrations';
import { buttonClass } from '@/components/ui/Button';
import { currentLocale, registerCopy } from '@/i18n';
import { pagesAzInGermany } from '@/i18n/pagesAzInGermany';
import { usePageTitle } from '@/lib/usePageTitle';
import { AZ_PLACES, PLACE_TYPES, VERIFIED_ON, clusterByCity, filterPlaces, osmMapUrl, osmUrl, placeCities, type AzPlace, type PlaceType } from '@/lib/azInGermany/data';
import { GERMANY_PATH, OUTLINE, project } from '@/lib/azInGermany/germanyOutline';

registerCopy(pagesAzInGermany);

const TYPE_ICON: Record<PlaceType, typeof Landmark> = { official: Landmark, culture: Building2, community: Users, food: Coffee };
/** dd.mm.yyyy, the same on server and client. */
const deDate = (iso: string) => iso.split('-').reverse().join('.');

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={clsx(
      'min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:outline-none sm:min-h-9',
      active ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken',
    )}
  >
    {children}
  </button>
);

/** Self-drawn map: Natural Earth outline + one numbered button per city (no tiles). */
const GermanyMap = ({ places, city, onCity }: { places: AzPlace[]; city: string | null; onCity: (c: string | null) => void }) => {
  const { t } = useTranslation();
  const clusters = clusterByCity(places);
  return (
    <figure className="relative mx-auto w-full max-w-sm">
      <svg viewBox={`0 0 ${OUTLINE.width} ${OUTLINE.height}`} className="block h-auto w-full" role="img" aria-label={t('azde.mapTitle')}>
        <path d={GERMANY_PATH} className="fill-primary/10 stroke-primary/60" strokeWidth={2} strokeLinejoin="round" />
      </svg>
      {clusters.map((c) => {
        const { x, y } = project(c.lon, c.lat);
        const active = city === c.city;
        return (
          <button
            key={c.city}
            type="button"
            aria-pressed={active}
            aria-label={t('azde.cluster', { city: c.city, n: c.items.length })}
            onClick={() => onCity(active ? null : c.city)}
            style={{ left: `${(x / OUTLINE.width) * 100}%`, top: `${(y / OUTLINE.height) * 100}%` }}
            className={clsx(
              'absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-1 rounded-full border-2 px-2 text-sm font-bold shadow-[var(--tv-shadow-raised)] focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none',
              active ? 'border-primary bg-primary text-primary-contrast' : 'border-card bg-card text-ink hover:border-primary',
            )}
          >
            <MapPin className="size-4" aria-hidden /> {c.items.length}
            <span className="sr-only">{c.city}</span>
          </button>
        );
      })}
      <figcaption className="mt-2 text-center text-xs text-muted">{t('azde.mapHint')}</figcaption>
    </figure>
  );
};

const PlaceCard = ({ p }: { p: AzPlace }) => {
  const { t } = useTranslation();
  const lng = currentLocale();
  const Icon = TYPE_ICON[p.type];
  return (
    <li className="rounded-3xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)] sm:p-5">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
        <Icon className="size-4 text-primary" aria-hidden /> {t(`azde.types.${p.type}`)} · {p.city}
      </p>
      <h3 className="mt-1 font-display text-lg leading-snug font-semibold text-ink" translate="no">
        {p.name}
      </h3>
      <p className="mt-1 text-sm text-ink" translate="no">
        {p.address}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink">{p.note[lng]}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {p.website && (
          <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold text-link hover:underline">
            <Globe className="size-4" aria-hidden /> {t('azde.website')} <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
        <a href={p.osm ? osmUrl(p.osm) : osmMapUrl(p.lat, p.lon)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold text-link hover:underline">
          <MapPin className="size-4" aria-hidden /> {t('azde.osm')} <ExternalLink className="size-3" aria-hidden />
        </a>
        {p.phone && (
          <a href={`tel:${p.phone.replace(/\s/g, '')}`} className="inline-flex min-h-11 items-center gap-1 font-semibold text-link hover:underline">
            <Phone className="size-4" aria-hidden /> {p.phone}
          </a>
        )}
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer py-2 font-semibold">
          {t('azde.sources')} · {t('azde.verified', { date: deDate(p.verifiedOn) })}
        </summary>
        <ul className="space-y-1 pb-1">
          {p.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
                {s.label} <ExternalLink className="size-3" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
};

/**
 * /azerbaijan-in-germany — curated, source-backed list of Azerbaijani institutions, culture, associations and food
 * places in Germany (lib/azInGermany/data.ts) on a self-drawn map (Natural Earth outline, no tiles) with type and
 * city filters in the URL (?type=food&city=Berlin).
 */
export default function AzerbaijanInGermanyPage() {
  const { t } = useTranslation();
  usePageTitle(t('azde.heroTitle'));
  const [params, setParams] = useSearchParams();
  const cities = placeCities();
  const typeParam = params.get('type');
  const type = PLACE_TYPES.includes(typeParam as PlaceType) ? (typeParam as PlaceType) : null;
  const cityParam = params.get('city');
  const city = cityParam && cities.includes(cityParam) ? cityParam : null;
  const shown = useMemo(() => filterPlaces(AZ_PLACES, type, city), [type, city]);
  const onMap = useMemo(() => filterPlaces(AZ_PLACES, type, null), [type]);

  const update = (patch: { type?: PlaceType | null; city?: string | null }) => {
    const next = new URLSearchParams();
    const ty = patch.type === undefined ? type : patch.type;
    const ci = patch.city === undefined ? city : patch.city;
    if (ty) next.set('type', ty);
    if (ci) next.set('city', ci);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <>
      <PageHero title={t('azde.heroTitle')} subtitle={t('azde.heroSubtitle')} illustration={<Germany />} crumb={{ to: '/tools', label: t('siteNav.tools') }} />

      <section className="section">
        <div className="container-x grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-start">
          <div className="lg:sticky lg:top-24">
            <GermanyMap places={onMap} city={city} onCity={(c) => update({ city: c })} />
          </div>
          <div className="space-y-5">
            <div className="space-y-3 rounded-3xl border border-line bg-card p-4 sm:p-5" role="group" aria-label={t('azde.filters')}>
              <fieldset>
                <legend className="mb-1 text-sm font-semibold text-ink">{t('azde.type')}</legend>
                <div className="flex flex-wrap gap-2">
                  <Chip active={!type} onClick={() => update({ type: null })}>
                    {t('azde.all')}
                  </Chip>
                  {PLACE_TYPES.map((ty) => (
                    <Chip key={ty} active={type === ty} onClick={() => update({ type: ty })}>
                      {t(`azde.types.${ty}`)}
                    </Chip>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-1 text-sm font-semibold text-ink">{t('azde.city')}</legend>
                <div className="flex flex-wrap gap-2">
                  <Chip active={!city} onClick={() => update({ city: null })}>
                    {t('azde.all')}
                  </Chip>
                  {cities.map((c) => (
                    <Chip key={c} active={city === c} onClick={() => update({ city: c })}>
                      <span translate="no">{c}</span>
                    </Chip>
                  ))}
                </div>
              </fieldset>
            </div>
            <p className="text-sm font-semibold text-ink" aria-live="polite">
              {shown.length ? t('azde.count', { n: shown.length }) : t('azde.none')}
            </p>
            <ul className="grid gap-4 md:grid-cols-2">
              {shown.map((p) => (
                <PlaceCard key={p.id} p={p} />
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section bg-sunken">
        <div className="container-x grid gap-6 md:grid-cols-2">
          <section className="rounded-3xl border border-line bg-card p-5 sm:p-6" aria-labelledby="azde-suggest-h">
            <h2 id="azde-suggest-h" className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
              <MessageSquarePlus className="size-5 text-primary" aria-hidden /> {t('azde.suggest')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink">{t('azde.suggestText')}</p>
            <Link to="/contact" className={buttonClass({ className: 'mt-4' })}>
              {t('azde.suggest')}
            </Link>
          </section>
          <section className="rounded-3xl border border-line bg-card p-5 sm:p-6" aria-labelledby="azde-method-h">
            <h2 id="azde-method-h" className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
              <Info className="size-5 text-primary" aria-hidden /> {t('azde.method.title')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink">{t('azde.method.text')}</p>
            <h3 className="mt-4 text-sm font-semibold text-ink">{t('azde.related')}</h3>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <li>
                <Link to="/glossary/botschaft" className="inline-flex min-h-11 items-center font-semibold text-link hover:underline">
                  {t('azde.glossaryBotschaft')}
                </Link>
              </li>
              <li>
                <Link to="/weekend-trips" className="inline-flex min-h-11 items-center font-semibold text-link hover:underline">
                  {t('azde.relatedTrips')}
                </Link>
              </li>
              <li>
                <Link to="/cities" className="inline-flex min-h-11 items-center font-semibold text-link hover:underline">
                  {t('azde.relatedCities')}
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </section>

      <section className="py-10">
        <div className="container-x max-w-3xl space-y-2 text-xs text-muted">
          <p>
            {t('azde.attribution')}{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
              openstreetmap.org/copyright
            </a>{' '}
            ·{' '}
            <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
              naturalearthdata.com
            </a>
          </p>
          <p>{t('azde.asOf', { date: deDate(VERIFIED_ON) })}</p>
          <p className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg" role="note">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('azde.disclaimer')}
          </p>
        </div>
      </section>
    </>
  );
}
