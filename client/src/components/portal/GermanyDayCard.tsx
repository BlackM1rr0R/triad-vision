import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import {
  Check,
  ChevronRight,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  IdCard,
  Languages,
  Luggage,
  MapPin,
  Plane,
  PlaneLanding,
  Sun,
  Thermometer,
  Volume2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesGermanyDay } from '@/i18n/pagesGermanyDay';
import { pagesClientPlus } from '@/i18n/pagesClientPlus';
import { GERMANY_DAY_KEY, germanVoice, PHRASES, phraseLang, speakGerman, timeLeft, useGermanyDay, type DayWeather, type GermanyDay, type PackingState, type WeatherIcon } from '@/lib/germanyDay';

registerCopy(pagesClientPlus); // weather icon names (cplus.countdown.icon.*)
registerCopy(pagesGermanyDay);

const WEATHER_ICON: Record<WeatherIcon, LucideIcon> = { sun: Sun, partly: CloudSun, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };

/** Re-renders every 30 s (the countdown's hours / minutes). */
const useNow = (active: boolean) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
};

/** The browser's German voice appears asynchronously in some browsers (voiceschanged). */
const useGermanVoice = () => {
  const [has, setHas] = useState(() => !!germanVoice());
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const update = () => setHas(!!germanVoice());
    update();
    window.speechSynthesis.addEventListener?.('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', update);
  }, []);
  return has;
};

const Countdown = ({ data, now }: { data: GermanyDay; now: number }) => {
  const { t } = useTranslation();
  const { dateTime, date } = useL10n();
  if (!data.departureAt) return null;
  const left = timeLeft(data.departureAt, now);
  const units = data.dayOnly ? [{ v: data.days ?? 0, l: t('gday.days') }] : [
    { v: left.days, l: t('gday.days') },
    { v: left.hours, l: t('gday.hours') },
    { v: left.minutes, l: t('gday.minutes') },
  ];
  const label = data.dayOnly ? t('gday.countdownDay', { count: data.days ?? 0 }) : t('gday.countdown', { days: left.days, hours: left.hours });
  return (
    <div>
      <p className="sr-only" aria-live="off">
        {label}
      </p>
      <div className="flex flex-wrap items-end gap-3" aria-hidden>
        {units.map((u) => (
          <div key={u.l} className="min-w-16 rounded-2xl bg-sunken px-3 py-2 text-center">
            <span className="block font-display text-3xl leading-none font-bold text-primary tabular-nums sm:text-4xl">{u.v}</span>
            <span className="mt-1 block text-xs font-semibold text-muted">{u.l}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-1">
          <Plane className="size-4" aria-hidden /> {data.dayOnly ? date(data.departureAt, { day: 'numeric', month: 'long', year: 'numeric' }) : dateTime(data.departureAt)}
        </span>
        {data.flightNumber && <span>{t('gday.flight', { flight: data.flightNumber })}</span>}
        {(data.departureAirport || data.arrivalAirport) && <span>{[data.departureAirport, data.arrivalAirport].filter(Boolean).join(' → ')}</span>}
      </p>
    </div>
  );
};

const WeatherBlock = ({ w }: { w: DayWeather }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  if (w.mode === 'climate') {
    const month = date(new Date(2026, w.month - 1, 15), { month: 'long' });
    return (
      <div className="rounded-2xl bg-sunken p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Thermometer className="size-4 text-primary" aria-hidden />
          {w.generic || !w.city ? t('gday.climateGeneric', { month }) : t('gday.climate', { city: w.city, month })}
        </p>
        <p className="mt-1 text-lg font-semibold text-ink tabular-nums">{t('gday.climateTemps', { max: w.avgMax, min: w.avgMin })}</p>
        <p className="mt-1 text-xs text-muted">{t('gday.climateNote')}</p>
      </div>
    );
  }
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <MapPin className="size-4 text-primary" aria-hidden /> {t('gday.weatherWeek', { city: w.city })}
      </p>
      <ul className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
        {w.days.map((d, i) => {
          const Icon = WEATHER_ICON[d.icon] ?? Cloud;
          return (
            <li key={d.date} className={clsx('flex flex-col items-center gap-1 rounded-xl bg-sunken px-1 py-2 text-center', i >= 4 && 'hidden sm:flex')}>
              <span className="text-[11px] font-semibold text-muted">{date(`${d.date}T12:00:00`, { weekday: 'short' })}</span>
              <Icon className={clsx('size-5', d.icon === 'sun' || d.icon === 'partly' ? 'text-highlight' : 'text-primary')} aria-hidden />
              <span className="sr-only">{t(`cplus.countdown.icon.${d.icon}`)}</span>
              <span className="text-sm font-semibold text-ink tabular-nums">
                {d.max ?? '–'}° <span className="font-normal text-muted">{d.min ?? '–'}°</span>
              </span>
              {d.rain != null && d.rain > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted">
                  <Droplets className="size-3" aria-hidden /> {d.rain}%
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-right text-[10px] text-muted">{t('gday.source')}</p>
    </div>
  );
};

const Packing = ({ packing }: { packing: PackingState }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: async ({ key, done }: { key: string; done: boolean }) => (await api.put<{ packing: PackingState }>(`/account/germany/packing/${key}`, { done })).data.packing,
    onMutate: ({ key, done }) => {
      // Optimistic tick; the server's answer replaces it.
      qc.setQueriesData<GermanyDay>({ queryKey: [GERMANY_DAY_KEY] }, (old) =>
        old ? { ...old, packing: { ...old.packing, items: old.packing.items.map((i) => (i.key === key ? { ...i, checkedAt: done ? new Date().toISOString() : null } : i)) } } : old,
      );
    },
    onSuccess: (p) => qc.setQueriesData<GermanyDay>({ queryKey: [GERMANY_DAY_KEY] }, (old) => (old ? { ...old, packing: p } : old)),
    onError: () => {
      toast.error(t('gday.packingError'));
      void qc.invalidateQueries({ queryKey: [GERMANY_DAY_KEY] });
    },
  });
  if (!packing.open) {
    return packing.opensInDays != null ? (
      <p className="flex items-start gap-2 rounded-2xl bg-sunken p-3 text-sm text-muted">
        <Luggage className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('gday.packingSoon', { count: packing.opensInDays })}
      </p>
    ) : null;
  }
  const done = packing.items.filter((i) => i.checkedAt).length;
  return (
    <fieldset>
      <legend className="flex w-full items-center justify-between gap-2 text-sm font-semibold text-ink">
        <span className="inline-flex items-center gap-2">
          <Luggage className="size-4 text-primary" aria-hidden /> {t('gday.packing')}
        </span>
        <span className="text-xs font-normal text-muted">{t('gday.packingDone', { done, total: packing.total })}</span>
      </legend>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div className="h-full rounded-full bg-success transition-[width] motion-reduce:transition-none" style={{ width: `${packing.total ? (done / packing.total) * 100 : 0}%` }} />
      </div>
      <ul className="mt-2 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        {packing.items.map((i) => {
          const checked = !!i.checkedAt;
          return (
            <li key={i.key}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 accent-[var(--color-success)]"
                  checked={checked}
                  onChange={(e) => toggle.mutate({ key: i.key, done: e.target.checked })}
                />
                <span className={clsx(checked && 'text-muted line-through')}>{t(`gday.pack.${i.key}`)}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
};

/** First-day phrases: German, meaning, simple pronunciation; speaker button only with a German browser voice. */
export const FirstDayPhrases = ({ defaultOpen = false }: { defaultOpen?: boolean }) => {
  const { t, i18n } = useTranslation();
  const lang = phraseLang(i18n.resolvedLanguage ?? 'az');
  const voice = useGermanVoice();
  return (
    <details className="group rounded-2xl border border-line" open={defaultOpen}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <Languages className="size-4 text-primary" aria-hidden />
        <span className="flex-1">{t('gday.phrases')}</span>
        <ChevronRight className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
      </summary>
      <div className="px-4 pb-3">
        {lang && <p className="text-xs text-muted">{t('gday.phrasesHint')}</p>}
        <ul className="mt-2 divide-y divide-line">
          {PHRASES.map((p) => (
            <li key={p.de} className="flex items-start gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink" lang="de">
                  {p.de}
                </p>
                {lang && (
                  <>
                    <p className="text-sm text-muted">{p.tr[lang]}</p>
                    <p className="text-xs text-muted italic">[{p.say[lang]}]</p>
                  </>
                )}
              </div>
              {voice && (
                <button type="button" className="btn-ghost grid size-11 shrink-0 place-items-center rounded-full p-0" onClick={() => speakGerman(p.de)} aria-label={t('gday.listen', { text: p.de })}>
                  <Volume2 className="size-5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
};

/**
 * "My Germany day" (portal home, from the visa approval on): live countdown to the flight, the destination's weather
 * this week (or its typical climate when the flight is further than 16 days away), the packing checklist from 14 days
 * before the flight, first-day German phrases and the link to the offline arrival card. Hidden a few days after the
 * flight day.
 */
export const GermanyDayCard = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const { data } = useGermanyDay();
  const active = !!data && (data.phase === 'UPCOMING' || data.phase === 'TODAY') && !data.dayOnly;
  const now = useNow(active);
  if (!data || data.phase === 'NO_CASE') return null;
  // A few days after the flight the card has done its job.
  if (data.phase === 'ARRIVED' && data.days != null && data.days < -3) return null;

  const title = data.phase === 'ARRIVED' ? t('gday.titleArrived') : t('gday.title');
  return (
    <section className={clsx('card overflow-hidden p-5 sm:p-6', className)} aria-labelledby="gday-title">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-soft">
          {data.phase === 'ARRIVED' ? <PlaneLanding className="size-5" aria-hidden /> : <Plane className="size-5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="gday-title" className="font-display text-lg font-bold text-ink">
            {title}
          </h2>
          {data.city && <p className="text-sm text-muted">{t('gday.destination', { city: data.city })}</p>}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {data.phase === 'NO_FLIGHT' && (
          <div className="rounded-2xl bg-sunken p-4">
            <p className="text-sm text-ink">{t('gday.noFlight')}</p>
            <Link to="/account/arrival" className="btn-primary mt-3 min-h-11">
              {t('gday.addFlight')} <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
        )}
        {data.phase === 'TODAY' && (
          <p className="flex items-center gap-2 rounded-2xl bg-success-bg p-3 font-semibold text-success-fg">
            <Check className="size-5" aria-hidden /> {t('gday.today')}
          </p>
        )}
        {data.phase === 'ARRIVED' && <p className="text-sm text-muted">{t('gday.arrivedText')}</p>}
        {(data.phase === 'UPCOMING' || data.phase === 'TODAY') && <Countdown data={data} now={now} />}
        {data.weather && <WeatherBlock w={data.weather} />}
        {data.phase !== 'ARRIVED' && data.phase !== 'NO_FLIGHT' && <Packing packing={data.packing} />}
        <FirstDayPhrases />
        <Link to="/account/arrival-card" className="flex min-h-14 items-center gap-3 rounded-2xl border border-line px-4 py-2 hover:bg-sunken">
          <IdCard className="size-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">{t('gday.arrivalCard')}</span>
            <span className="block text-xs text-muted">{t('gday.arrivalCardHint')}</span>
          </span>
          <ChevronRight className="size-4 text-muted" aria-hidden />
        </Link>
      </div>
    </section>
  );
};

export default GermanyDayCard;
