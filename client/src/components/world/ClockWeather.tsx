import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Clock3, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useClientOnly } from '@/lib/ssr';
import { registerCopy } from '@/i18n';
import { worldCopy } from '@/i18n/world';
import { useClockWeather, type CurrentWeather, type WeatherIcon } from './api';
import { INTL_LOCALE, useWorldLang } from './locale';
import { BAKU_TZ, BERLIN_TZ, berlinSummerTime, bothInOfficeHours, clockTime, zoneDifferenceMinutes } from './twinTime';

registerCopy(worldCopy);

const ICON: Record<WeatherIcon, LucideIcon> = { sun: Sun, partly: CloudSun, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };

/** Re-renders at every full minute (the clocks show hours and minutes). */
const useMinuteClock = (on: boolean) => {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    if (!on) return;
    let timer = 0;
    const tick = () => {
      const d = new Date();
      setNow(d);
      timer = window.setTimeout(tick, 60_000 - (d.getTime() % 60_000) + 50);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [on]);
  return now;
};

const WeatherLine = ({ w, loading }: { w: CurrentWeather | null | undefined; loading: boolean }) => {
  const { t } = useTranslation();
  if (loading) return <span className="block h-5 w-28 animate-pulse rounded bg-sunken" aria-hidden />;
  if (!w || w.temp == null) return <span className="text-xs text-muted">{t('world.clock.noWeather')}</span>;
  const night = !w.isDay && (w.icon === 'sun' || w.icon === 'partly');
  const Icon = night ? (w.icon === 'sun' ? Moon : CloudMoon) : ICON[w.icon] ?? Cloud;
  const sky = night && w.icon === 'sun' ? t('world.clock.sky.clear') : t(`world.clock.sky.${w.icon}`);
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink">
      <Icon className="size-5 shrink-0 text-chart-1" aria-hidden />
      <span className="font-semibold tabular-nums">{w.temp > 0 ? '+' : ''}{w.temp}°C</span>
      <span className="truncate text-muted">{sky}</span>
    </span>
  );
};

/**
 * Baku ↔ Berlin: the time in both cities, the difference (2 h in German summer time, 3 h in winter — from the
 * browser's time-zone data, never hard-coded) and the current weather (GET /life/clock-weather, Open-Meteo via our
 * server, cached 30 min). Times depend on the visitor's clock, so the server and the hydrating render show
 * placeholders of the same size; the real times appear right after hydration. Fixed heights: no layout shift.
 */
export const ClockWeather = () => {
  const { t } = useTranslation();
  const lang = useWorldLang();
  const client = useClientOnly();
  const now = useMinuteClock(client);
  const weather = useClockWeather(client);
  const byKey = (k: 'baku' | 'berlin') => weather.data?.cities.find((c) => c.key === k)?.weather ?? null;
  const diffH = now ? zoneDifferenceMinutes(now) / 60 : null;

  const city = (key: 'baku' | 'berlin', tz: string) => (
    <div className="min-w-0 flex-1 rounded-2xl bg-sunken p-4">
      <p className="text-sm font-semibold text-muted">{t(`world.clock.${key}`)}</p>
      <p className="mt-1 font-display text-4xl leading-none font-semibold text-ink tabular-nums" suppressHydrationWarning>
        {now ? clockTime(tz, now) : '--:--'}
      </p>
      <p className="mt-1.5 h-5 truncate text-xs text-muted">{now ? new Intl.DateTimeFormat(INTL_LOCALE[lang], { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(now) : ''}</p>
      <div className="mt-2 h-6">
        <WeatherLine w={byKey(key)} loading={!client || weather.isPending} />
      </div>
    </div>
  );

  return (
    <div className="card flex h-full flex-col rounded-3xl p-5 sm:p-6">
      <p className="eyebrow flex items-center gap-2">
        <Clock3 className="size-3.5" aria-hidden /> {t('world.clock.eyebrow')}
      </p>
      <h2 className="mt-2 text-xl font-semibold text-ink">{t('world.clock.title')}</h2>
      <div className="mt-4 flex gap-3">
        {city('baku', BAKU_TZ)}
        {city('berlin', BERLIN_TZ)}
      </div>
      <div className="mt-4 min-h-[3.75rem] space-y-1 text-sm">
        <p className="font-semibold text-ink">{diffH == null ? ' ' : diffH === 0 ? t('world.clock.same') : t('world.clock.behind', { h: Number.isInteger(diffH) ? diffH : diffH.toFixed(1) })}</p>
        <p className="text-muted">{now ? t(berlinSummerTime(now) ? 'world.clock.summer' : 'world.clock.winter') : ' '}</p>
      </div>
      <p className="mt-auto min-h-[2.75rem] pt-3 text-xs text-muted">
        {now && bothInOfficeHours(now) ? t('world.clock.office') : t('world.clock.offHours')} <span className="whitespace-nowrap">· {t('world.clock.source')}</span>
      </p>
    </div>
  );
};

export default ClockWeather;
