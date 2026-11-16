import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, CalendarDays, Clock, ExternalLink, Info, MapPin, TrainFront, Ticket, Lightbulb } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Traveller } from '@/components/illustrations';
import { TripArt } from '@/components/weekendTrips/TripArt';
import { currentLocale, registerCopy } from '@/i18n';
import { pagesWeekendTrips } from '@/i18n/pagesWeekendTrips';
import { usePageTitle } from '@/lib/usePageTitle';
import { CITIES, DEUTSCHLANDTICKET } from '@/lib/cities/data';
import { TRIP_ORIGINS, bahnUrl, osmSearchUrl, sortTrips, tripOrigin, type Season, type Trip } from '@/lib/weekendTrips/data';

registerCopy(pagesWeekendTrips);

const AS_OF = '11.2026';
/** Announced price from 1 January 2027 (Bavarian Ministry of Transport press release of 30 Sep 2026). */
const DEUTSCHLANDTICKET_2027 = '66,80';
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const SOURCES = [
  { label: 'regional.bahn.de: Deutschland-Ticket', href: 'https://regional.bahn.de/tickets/Deutschlandticket' },
  { label: 'StMB Bayern, PM 30.09.2026', href: 'https://www.stmb.bayern.de/med/pressemitteilungen/pressearchiv/2026/115/index.php' },
  { label: 'bahn.de', href: 'https://www.bahn.de' },
];

const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

const TripCard = ({ trip, index, origin }: { trip: Trip; index: number; origin: string }) => {
  const { t } = useTranslation();
  const lng = currentLocale();
  const seasons = trip.seasons.length === 4 ? t('wt.allYear') : trip.seasons.map((s) => t(`wt.seasons.${s}`)).join(', ');
  return (
    <li className="flex flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-[var(--tv-shadow-card)]">
      <div className="aspect-[2/1] overflow-hidden">
        <TripArt kind={trip.kind} variant={index} label={t('wt.illustration', { kind: t(`wt.kinds.${trip.kind}`) })} />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t(`wt.kinds.${trip.kind}`)}</p>
        <h3 className="font-display text-lg leading-snug font-semibold text-ink" translate="no">
          {trip.name}
        </h3>
        <p className="text-sm leading-relaxed text-ink">{trip.why[lng]}</p>
        <dl className="mt-1 space-y-1.5 text-sm text-ink">
          <div className="flex items-start gap-2">
            <dt className="sr-only">{t('wt.duration')}</dt>
            <Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <dd>
              <span className="font-semibold">{t('wt.travel', { from: trip.minutes[0], to: trip.minutes[1] })}</span>{' '}
              <span className="text-xs text-muted">({t('wt.approx')})</span>
            </dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="sr-only">{t('wt.lines')}</dt>
            <TrainFront className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <dd translate="no">{trip.lines}</dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="sr-only">{t('wt.bestSeason')}</dt>
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <dd>
              {t('wt.bestSeason')}: {seasons}
            </dd>
          </div>
        </dl>
        {trip.note && (
          <p className="flex items-start gap-2 rounded-xl bg-warning-bg p-2.5 text-xs text-warning-fg">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold">{t('wt.notIncluded')}:</span> {trip.note[lng]}
            </span>
          </p>
        )}
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-2">
          <a href={bahnUrl(origin, trip.station)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-link hover:underline">
            <TrainFront className="size-4" aria-hidden /> {t('wt.bahn')} <ExternalLink className="size-3" aria-hidden />
          </a>
          <a href={osmSearchUrl(trip.osm)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-link hover:underline">
            <MapPin className="size-4" aria-hidden /> {t('wt.osm')} <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
      </div>
    </li>
  );
};

/**
 * /weekend-trips — day trips with the Deutschlandticket: pick a city of the city guide and get ten destinations
 * reachable with regional transport only (lib/weekendTrips/data.ts), with an approximate travel time, why to go,
 * the best season, a self-drawn illustration and links to bahn.de and openstreetmap.org. City and season live in
 * the URL (?city=hamburg&season=summer), so the server renders the same list.
 */
export default function WeekendTripsPage() {
  const { t } = useTranslation();
  usePageTitle(t('wt.heroTitle'));
  const lng = currentLocale();
  const [params, setParams] = useSearchParams();
  const origin = tripOrigin(params.get('city')) ?? TRIP_ORIGINS[0];
  const seasonParam = params.get('season');
  const season = SEASONS.includes(seasonParam as Season) ? (seasonParam as Season) : null;
  const cityName = (slug: string) => CITIES.find((c) => c.slug === slug)?.name[lng] ?? slug;
  const trips = useMemo(() => sortTrips(origin.trips, season), [origin, season]);

  const update = (patch: { city?: string; season?: Season | null }) => {
    const next = new URLSearchParams();
    const city = patch.city ?? origin.city;
    if (city !== TRIP_ORIGINS[0].city) next.set('city', city);
    const s = patch.season === undefined ? season : patch.season;
    if (s) next.set('season', s);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <>
      <PageHero title={t('wt.heroTitle')} subtitle={t('wt.heroSubtitle')} illustration={<Traveller />} crumb={{ to: '/tools', label: t('siteNav.tools') }} />

      <section className="section">
        <div className="container-x space-y-6">
          <div className="grid gap-4 rounded-3xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)] sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-end sm:p-5">
            <div>
              <label htmlFor="wt-city" className="mb-1 block text-sm font-semibold text-ink">
                {t('wt.pickCity')}
              </label>
              <select id="wt-city" className="input" value={origin.city} onChange={(e) => update({ city: e.target.value })}>
                {TRIP_ORIGINS.map((o) => (
                  <option key={o.city} value={o.city}>
                    {cityName(o.city)}
                  </option>
                ))}
              </select>
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-semibold text-ink">{t('wt.season')}</legend>
              <div className="flex flex-wrap gap-2">
                {[null, ...SEASONS].map((s) => (
                  <button
                    key={s ?? 'any'}
                    type="button"
                    aria-pressed={season === s}
                    onClick={() => update({ season: s })}
                    className={clsx(
                      'min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:outline-none sm:min-h-9',
                      season === s ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken',
                    )}
                  >
                    {s ? t(`wt.seasons.${s}`) : t('wt.seasonAny')}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <div aria-live="polite">
            <h2 className="font-display text-2xl font-semibold text-ink">{t('wt.count', { n: trips.length, city: cityName(origin.city) })}</h2>
            <p className="mt-1 text-sm text-muted" translate="no">
              {t('wt.from', { city: cityName(origin.city), station: origin.station })}
            </p>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {trips.map((trip, i) => (
              <TripCard key={trip.id} trip={trip} index={i} origin={origin.station} />
            ))}
          </ul>
        </div>
      </section>

      <section className="section bg-sunken">
        <div className="container-x grid gap-6 md:grid-cols-2">
          <section className="rounded-3xl border border-line bg-card p-5 sm:p-6" aria-labelledby="wt-ticket-h">
            <h2 id="wt-ticket-h" className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
              <Ticket className="size-5 text-primary" aria-hidden /> {t('wt.ticket.title')}
            </h2>
            <p className="mt-2 text-sm font-semibold text-ink">{t('wt.ticket.price', { price: DEUTSCHLANDTICKET, next: DEUTSCHLANDTICKET_2027 })}</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink">
              {list(t('wt.ticket.items', { returnObjects: true })).map((s) => (
                <li key={s.slice(0, 30)}>{s}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">{t('wt.ticket.source')}</p>
          </section>
          <section className="rounded-3xl border border-line bg-card p-5 sm:p-6" aria-labelledby="wt-tips-h">
            <h2 id="wt-tips-h" className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
              <Lightbulb className="size-5 text-primary" aria-hidden /> {t('wt.tips.title')}
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink">
              {list(t('wt.tips.items', { returnObjects: true })).map((s) => (
                <li key={s.slice(0, 30)}>{s}</li>
              ))}
            </ul>
            <h3 className="mt-5 text-sm font-semibold text-ink">{t('wt.related')}</h3>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <li>
                <Link to="/glossary/deutschlandticket" className="inline-flex min-h-11 items-center font-semibold text-link hover:underline">
                  {t('wt.glossary')}
                </Link>
              </li>
              <li>
                <Link to="/cities" className="inline-flex min-h-11 items-center font-semibold text-link hover:underline">
                  {t('wt.relatedCities')}
                </Link>
              </li>
              <li>
                <Link to="/life-in-germany" className="inline-flex min-h-11 items-center font-semibold text-link hover:underline">
                  {t('wt.relatedLife')}
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </section>

      <section className="py-10" aria-label={t('wt.asOf', { date: AS_OF })}>
        <div className="container-x max-w-3xl space-y-3 text-sm text-ink">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {SOURCES.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
                  {s.label} <ExternalLink className="size-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{t('wt.asOf', { date: AS_OF })}</p>
          <p className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning-bg p-3 text-warning-fg" role="note">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('wt.disclaimer')}
          </p>
        </div>
      </section>
    </>
  );
}
