import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Building2, ChevronRight, Cloud, Droplets, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Home, Landmark, MapPin, Plane, Sun } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useChosenCase } from '@/lib/caseContext';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesClientPlus } from '@/i18n/pagesClientPlus';

registerCopy(pagesClientPlus);

/** GET /api/account/plus/countdowns (server: lib/clientPlus/portal.ts + weather.ts). */
export type CountdownKind = 'EMBASSY' | 'FLIGHT' | 'ANMELDUNG' | 'BUERGERAMT';
export interface Countdown {
  kind: CountdownKind;
  at: string;
  days: number;
  place: string | null;
  detail: string | null;
  to: string;
}
export type WeatherIcon = 'sun' | 'partly' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';
export interface Countdowns {
  caseId: string | null;
  cards: Countdown[];
  city: string | null;
  weather: { city: string; country: string | null; days: { date: string; icon: WeatherIcon; max: number | null; min: number | null; rain: number | null }[] } | null;
}

const KIND_ICON: Record<CountdownKind, LucideIcon> = { EMBASSY: Landmark, FLIGHT: Plane, ANMELDUNG: Home, BUERGERAMT: Building2 };
const KIND_TONE: Record<CountdownKind, string> = { EMBASSY: 'chip-sky', FLIGHT: 'chip-soft', ANMELDUNG: 'chip-sage', BUERGERAMT: 'chip-peach' };
const WEATHER_ICON: Record<WeatherIcon, LucideIcon> = { sun: Sun, partly: CloudSun, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };

export const countdownText = (t: (k: string, o?: Record<string, unknown>) => string, c: Pick<Countdown, 'kind' | 'days'>) => {
  if (c.days === 0) return t(`cplus.countdown.${c.kind}_today`);
  if (c.days < 0) return t('cplus.countdown.ANMELDUNG_overdue', { count: -c.days });
  return t(`cplus.countdown.${c.kind}`, { count: c.days });
};

export const useCountdowns = () => {
  const { user } = useAuth();
  const chosen = useChosenCase(user?.id);
  return useQuery({
    queryKey: ['account-plus-countdowns', chosen ?? 'default'],
    queryFn: async () => (await api.get<Countdowns>('/account/plus/countdowns', { params: chosen ? { case: chosen } : undefined })).data,
    staleTime: 10 * 60_000,
    enabled: user?.role === 'CLIENT',
    retry: false,
  });
};

const WeatherStrip = ({ w }: { w: NonNullable<Countdowns['weather']> }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="cd-weather">
      <h3 id="cd-weather" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <MapPin className="size-4 text-primary" aria-hidden /> {t('cplus.countdown.weather', { city: w.city })}
      </h3>
      <ul className="mt-3 grid grid-cols-4 gap-2">
        {w.days.map((d, i) => {
          const Icon = WEATHER_ICON[d.icon] ?? Cloud;
          const label = t(`cplus.countdown.icon.${d.icon}`);
          return (
            <li key={d.date} className="flex flex-col items-center gap-1 rounded-xl bg-sunken px-1 py-2.5 text-center">
              <span className="text-[11px] font-semibold text-muted">{i === 0 ? t('cplus.countdown.today') : date(`${d.date}T12:00:00`, { weekday: 'short' })}</span>
              <Icon className={clsx('size-6', d.icon === 'sun' || d.icon === 'partly' ? 'text-highlight' : 'text-primary')} aria-hidden />
              <span className="sr-only">{label}</span>
              <span className="text-sm font-semibold text-ink tabular-nums">
                {d.max ?? '–'}° <span className="font-normal text-muted">{d.min ?? '–'}°</span>
                <span className="sr-only"> ({t('cplus.countdown.temps', { max: d.max ?? '–', min: d.min ?? '–' })})</span>
              </span>
              {d.rain != null && d.rain > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted" title={t('cplus.countdown.rain', { n: d.rain })}>
                  <Droplets className="size-3" aria-hidden /> {d.rain}%
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-right text-[10px] text-muted">{t('cplus.countdown.source')}</p>
    </section>
  );
};

/**
 * Portal home: "Səfirlik görüşünə 12 gün qaldı", "Almaniyaya uçuşa 34 gün", Anmeldung deadline / Bürgeramt — one
 * card per known date of the current case (family switcher aware) and the destination city's forecast (today + 3
 * days, fetched by our server from Open-Meteo, so the CSP is unchanged). Nothing without dates.
 */
export const CountdownCards = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const { dateTime, date } = useL10n();
  const { data } = useCountdowns();
  if (!data?.cards.length) return null;
  return (
    <div className={clsx('grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0', className)}>
      {data.cards.map((c) => {
        const Icon = KIND_ICON[c.kind];
        const deadline = c.kind === 'ANMELDUNG';
        const overdue = c.days < 0;
        return (
          <section key={`${c.kind}-${c.at}`} className={clsx('card flex flex-col p-4 sm:p-5', overdue && 'border-danger-border')} aria-label={t(`cplus.countdown.label.${c.kind}`)}>
            <div className="flex items-start gap-3">
              <span className={clsx('grid size-11 shrink-0 place-items-center rounded-xl', KIND_TONE[c.kind])}>
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-muted">{t(`cplus.countdown.label.${c.kind}`)}</p>
                <p className={clsx('mt-0.5 font-semibold text-ink', overdue && 'text-danger-fg')}>{countdownText(t, c)}</p>
              </div>
              <span className={clsx('font-display text-3xl leading-none font-bold tabular-nums', overdue ? 'text-danger-fg' : 'text-primary')} aria-hidden>
                {Math.abs(c.days)}
              </span>
            </div>
            <p className="mt-3 text-sm text-muted">
              {deadline ? date(c.at, { day: 'numeric', month: 'long', year: 'numeric' }) : dateTime(c.at)}
              {c.detail && <> · {c.detail}</>}
            </p>
            {c.place && <p className="mt-0.5 truncate text-sm text-muted">{c.place}</p>}
            <Link to={c.to} className="mt-3 inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-link hover:underline sm:min-h-9">
              {t('cplus.countdown.details')} <ChevronRight className="size-4" aria-hidden />
            </Link>
          </section>
        );
      })}
      {data.weather && <WeatherStrip w={data.weather} />}
    </div>
  );
};

export default CountdownCards;
