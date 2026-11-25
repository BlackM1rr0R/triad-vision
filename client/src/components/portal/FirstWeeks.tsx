import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Check, Clock, Cloud, ExternalLink, MapPin, PlaneTakeoff, Users } from 'lucide-react';
import { api, getImpersonation } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { pagesFirstWeeks } from '@/i18n/pagesFirstWeeks';
import { BAKU_TZ, BERLIN_TZ, zoneDifferenceMinutes } from '@/components/world/twinTime';
import { RingGauge } from '@/components/charts';
import { useCountdowns, WEATHER_ICON } from './CountdownCards';
import { pagesClientPlus } from '@/i18n/pagesClientPlus';

registerCopy(pagesFirstWeeks);
registerCopy(pagesClientPlus); // weather icon names (cplus.countdown.icon.*)

/** Google Maps search link (opens in a new tab; no API key, no embedded map). */
export const mapsSearchUrl = (query: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

/** Checklist of the first weeks: key, the German office / shop searched on the map (not translated). */
export const FIRST_30_ITEMS = [
  { key: 'anmeldung', office: 'Bürgeramt' },
  { key: 'bank', office: 'Bank' },
  { key: 'krankenkasse', office: 'Krankenkasse' },
  { key: 'steuerid', office: 'Finanzamt' },
  { key: 'rente', office: 'Deutsche Rentenversicherung' },
  { key: 'sim', office: 'Mobilfunk Shop' },
  { key: 'aufenthalt', office: 'Ausländerbehörde' },
] as const;

const storageKey = (userId: string) => `tv_first30:${userId}`;
const readChecked = (userId: string): string[] => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(storageKey(userId)) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

/**
 * "First 30 days in Germany": the usual first errands with a short how-to and a Google Maps search for the office in
 * the client's destination city. Ticks are kept per user in this browser (the user record has no settings field);
 * while staff view the cabinet as the client (read-only impersonation) nothing is written.
 */
export const First30DaysCard = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const city = useCountdowns().data?.city ?? null;
  const readOnly = getImpersonation() !== null;
  const [checked, setChecked] = useState<string[]>(() => (userId ? readChecked(userId) : []));
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (userId) setChecked(readChecked(userId));
  }, [userId]);

  const toggle = (key: string) => {
    if (readOnly || !userId) return;
    const next = checked.includes(key) ? checked.filter((k) => k !== key) : [...checked, key];
    setChecked(next);
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
    } catch {
      // storage unavailable: the ticks last for this visit only
    }
  };

  const done = FIRST_30_ITEMS.filter((i) => checked.includes(i.key)).length;
  return (
    <section className={clsx('card p-5 sm:p-6', className)} aria-labelledby="first30-title" data-tour="portal-first30">
      <div className="flex items-start gap-4">
        <RingGauge value={done} max={FIRST_30_ITEMS.length} size={64} stroke={7} label={t('fw.first30.title')} center={`${done}/${FIRST_30_ITEMS.length}`} />
        <div className="min-w-0">
          <h2 id="first30-title" className="type-card-title">
            {t('fw.first30.title')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('fw.first30.sub')}</p>
          <p className="mt-1 text-xs font-semibold text-muted">{t('fw.first30.progress', { done, total: FIRST_30_ITEMS.length })}</p>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
        {FIRST_30_ITEMS.map((i) => {
          const isDone = checked.includes(i.key);
          const expanded = open === i.key;
          return (
            <li key={i.key} className="px-3 py-2.5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isDone}
                  aria-label={t(`fw.first30.items.${i.key}.title`)}
                  disabled={readOnly}
                  onClick={() => toggle(i.key)}
                  className={clsx(
                    'grid size-7 shrink-0 place-items-center rounded-lg border-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed',
                    isDone ? 'border-success bg-success text-white' : 'border-line-strong bg-card',
                  )}
                >
                  {isDone && <Check className="size-4" aria-hidden />}
                </button>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : i.key)}
                  className={clsx('min-h-10 min-w-0 flex-1 text-left text-sm font-semibold outline-none focus-visible:underline', isDone ? 'text-muted line-through' : 'text-ink')}
                >
                  {t(`fw.first30.items.${i.key}.title`)}
                </button>
              </div>
              {expanded && (
                <div className="mt-2 pl-10">
                  <p className="text-sm leading-relaxed text-ink/85">{t(`fw.first30.items.${i.key}.how`)}</p>
                  <a
                    href={mapsSearchUrl(city ? `${i.office} ${city}` : i.office)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-link hover:underline"
                  >
                    <MapPin className="size-4" aria-hidden /> {city ? t('fw.first30.mapIn', { city }) : t('fw.first30.map')} <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted">{readOnly ? t('fw.first30.readOnly') : t('fw.first30.note')}</p>
    </section>
  );
};

interface CityProfile {
  city: string;
  lat: number;
  lng: number;
  weather: { temp: number | null; icon: keyof typeof WEATHER_ICON; isDay: boolean } | null;
  flight: { km: number; minutes: number };
}

/** "My Germany": weather now, time difference to Baku, approximate flight time and a community / restaurant map search. */
export const MyGermanyCard = ({ className }: { className?: string }) => {
  const { t, i18n } = useTranslation();
  const city = useCountdowns().data?.city ?? null;
  const q = useQuery({
    queryKey: ['city-profile', city],
    queryFn: async () => (await api.get<{ profile: CityProfile | null }>('/life/city-profile', { params: { city } })).data.profile,
    enabled: !!city,
    staleTime: 30 * 60_000,
    retry: false,
  });
  const diffH = useMemo(() => zoneDifferenceMinutes(new Date(), BAKU_TZ, BERLIN_TZ) / 60, []);
  if (!city) return null;
  const p = q.data ?? null;
  const name = p?.city ?? city;
  const hm = (minutes: number) => t('fw.myde.hm', { h: Math.floor(minutes / 60), m: minutes % 60 });
  const WIcon = p?.weather ? (WEATHER_ICON[p.weather.icon] ?? Cloud) : Cloud;
  const km = p ? new Intl.NumberFormat(i18n.resolvedLanguage ?? 'az').format(p.flight.km) : '';
  return (
    <section className={clsx('card p-5 sm:p-6', className)} aria-labelledby="myde-title">
      <h2 id="myde-title" className="type-card-title flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-sky">
          <MapPin className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 truncate">{t('fw.myde.title', { city: name })}</span>
      </h2>
      <p className="mt-1 text-sm text-muted">{t('fw.myde.sub')}</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-sunken p-3">
          <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <WIcon className="size-4" aria-hidden /> {t('fw.myde.weather')}
          </dt>
          <dd className="mt-1 font-display text-xl font-semibold text-ink tabular-nums">
            {p?.weather?.temp != null ? `${p.weather.temp}°C` : q.isPending ? '…' : '–'}
          </dd>
          {p && !p.weather && <dd className="text-xs text-muted">{t('fw.myde.weatherNone')}</dd>}
        </div>
        <div className="rounded-xl bg-sunken p-3">
          <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Clock className="size-4" aria-hidden /> {t('fw.myde.time')}
          </dt>
          <dd className="mt-1 text-sm font-semibold text-ink">{diffH > 0 ? t('fw.myde.timeValue', { h: diffH }) : t('fw.myde.timeSame')}</dd>
        </div>
        <div className="rounded-xl bg-sunken p-3">
          <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <PlaneTakeoff className="size-4" aria-hidden /> {t('fw.myde.flight')}
          </dt>
          <dd className="mt-1 text-sm font-semibold text-ink">{p ? t('fw.myde.flightValue', { time: hm(p.flight.minutes) }) : q.isPending ? '…' : '–'}</dd>
        </div>
      </dl>
      {p && <p className="mt-2 text-xs text-muted">{t('fw.myde.flightNote', { km })}</p>}
      <a
        href={mapsSearchUrl(`Azerbaijani restaurant ${name}`)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-link hover:underline"
      >
        <Users className="size-4" aria-hidden /> {t('fw.myde.community')} <ExternalLink className="size-3.5" aria-hidden />
        <span className="sr-only"> ({t('fw.myde.communityHint')})</span>
      </a>
    </section>
  );
};
