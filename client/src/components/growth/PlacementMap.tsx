import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, MapPin, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import { buttonClass } from '@/components/ui/Button';
import { cityCoords, makeProjection } from '@/components/about/geo';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { registerCopy } from '@/i18n';
import { pagesGrowthPlus } from '@/i18n/pagesGrowthPlus';
import { GERMAN_STATES, stateCentre } from './germanyStates';
import { usePlacementMap, type MapCity, type PublicMap } from './api';

registerCopy(pagesGrowthPlus);

const proj = makeProjection({ w: 5.7, e: 15.2, s: 47.15, n: 55.15 }, 460, 12);

type Placed = MapCity & { x: number; y: number; r: number };

const place = (cities: MapCity[]) => {
  const placed: Placed[] = [];
  const unplaced: MapCity[] = [];
  const max = Math.max(1, ...cities.map((c) => c.workers));
  for (const c of cities) {
    const ll = c.lat != null && c.lng != null ? ([c.lng, c.lat] as [number, number]) : cityCoords(c.city);
    if (!ll) {
      unplaced.push(c);
      continue;
    }
    const [x, y] = proj.project(ll);
    placed.push({ ...c, x, y, r: 5 + 13 * Math.sqrt(c.workers / max) });
  }
  // Big dots first so small ones stay clickable on top.
  return { placed: placed.sort((a, b) => b.r - a.r), unplaced };
};

/** SVG map of the 16 states with city dots sized by the number of workers; tooltip on hover / focus / tap. */
export const PlacementMap = ({ data, compact = false }: { data: PublicMap; compact?: boolean }) => {
  const { t } = useTranslation();
  const { placed, unplaced } = useMemo(() => place(data.cities), [data.cities]);
  const [active, setActive] = useState<string | null>(null);
  const current = placed.find((p) => p.city === active) ?? null;
  const label = (c: MapCity) => `${t('gp.map.tooltip', { city: c.city, count: c.workers })}${c.professions.length ? ` · ${c.professions.join(', ')}` : ''}`;

  return (
    <div className={clsx('grid gap-6', !compact && 'lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start')}>
      <div className="relative mx-auto w-full max-w-[480px]">
        <svg viewBox={`0 0 ${proj.width} ${proj.height}`} className="h-auto w-full" role="group" aria-label={t('gp.map.mapLabel')}>
          {GERMAN_STATES.map((s) => (
            <g key={s.code}>
              {s.rings.map((ring, i) => (
                <path key={i} d={proj.path(ring)} className="fill-sunken stroke-line-strong" strokeWidth={1.2} strokeLinejoin="round">
                  <title>{s.name}</title>
                </path>
              ))}
            </g>
          ))}
          {!compact &&
            GERMAN_STATES.filter((s) => !['BE', 'HH', 'HB', 'SL'].includes(s.code)).map((s) => {
              const [x, y] = proj.project(stateCentre(s));
              return (
                <text key={s.code} x={x} y={y} textAnchor="middle" className="pointer-events-none fill-muted text-[9px] font-semibold tracking-wider opacity-60" aria-hidden>
                  {s.code}
                </text>
              );
            })}
          {placed.map((c) => {
            const on = active === c.city;
            return (
              <g
                key={c.city}
                role="button"
                tabIndex={0}
                aria-label={label(c)}
                className="cursor-pointer outline-none"
                onMouseEnter={() => setActive(c.city)}
                onMouseLeave={() => setActive((a) => (a === c.city ? null : a))}
                onFocus={() => setActive(c.city)}
                onBlur={() => setActive((a) => (a === c.city ? null : a))}
                onClick={() => setActive((a) => (a === c.city ? null : c.city))}
              >
                <circle cx={c.x} cy={c.y} r={c.r + 4} className="fill-chart-1/15" />
                <circle cx={c.x} cy={c.y} r={c.r} className={clsx('stroke-card', on ? 'fill-primary' : 'fill-chart-1')} strokeWidth={2} />
              </g>
            );
          })}
        </svg>
        {current && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 w-max max-w-[220px] -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-raised px-3 py-2 text-xs leading-snug text-ink shadow-[var(--tv-shadow-raised)]"
            style={{ left: `${(current.x / proj.width) * 100}%`, top: `calc(${(current.y / proj.height) * 100}% - ${current.r + 6}px)` }}
          >
            <span className="font-semibold">{t('gp.map.tooltip', { city: current.city, count: current.workers })}</span>
            {current.professions.length > 0 && <span className="block text-muted">{current.professions.join(', ')}</span>}
          </div>
        )}
      </div>

      {!compact && (
        <div>
          <p className="text-sm font-semibold text-ink">{t('gp.map.total', { count: data.total, cities: data.cities.length })}</p>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--tv-shadow-card)]">
            {[...placed].sort((a, b) => b.workers - a.workers).concat(unplaced.map((c) => ({ ...c, x: 0, y: 0, r: 0 }))).map((c) => (
              <li key={c.city}>
                <button
                  type="button"
                  className={clsx('flex min-h-11 w-full items-start gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-sunken', active === c.city && 'bg-sunken')}
                  onMouseEnter={() => setActive(c.city)}
                  onFocus={() => setActive(c.city)}
                  onClick={() => setActive(c.city)}
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-chart-1" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-ink">{c.city}</span>
                    {c.professions.length > 0 && <span className="block truncate text-xs text-muted">{c.professions.join(', ')}</span>}
                  </span>
                  <span className="shrink-0 font-semibold text-ink tabular-nums">{t('gp.map.workers', { count: c.workers })}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-start gap-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('gp.map.privacy', { min: data.minPerCity })}
          </p>
        </div>
      )}
    </div>
  );
};

/** Home / Stories section; renders nothing when the map is off for that place or has no city yet. */
export const PlacementMapSection = ({ where }: { where: 'home' | 'stories' }) => {
  const { t } = useTranslation();
  const { data } = usePlacementMap();
  if (!data?.enabled || data.cities.length === 0) return null;
  if (where === 'home' ? !data.showOnHome : !data.showOnStories) return null;
  return (
    <section className="section">
      <div className="container-x">
        <SectionHeading eyebrow={t('gp.map.eyebrow')} title={t('gp.map.title')} subtitle={t('gp.map.subtitle')} />
        <PlacementMap data={data} />
        <div className="mt-6 text-center">
          <Link to="/map" className={buttonClass({ variant: 'outline', size: 'lg' })}>
            {t('gp.map.cta')} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
};
