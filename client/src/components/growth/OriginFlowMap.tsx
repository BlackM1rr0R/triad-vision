import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, MapPin, ShieldCheck } from 'lucide-react';
import { cityCoords, makeProjection } from '@/components/about/geo';
import { registerCopy } from '@/i18n';
import { pagesMarketing } from '@/i18n/pagesMarketing';
import type { OriginCountry, PublicOrigins } from '@/components/marketing/api';
import { COUNTRY_LABELS as LABELS, COUNTRY_SHAPES, DE_CENTRE, ORIGIN_MAP_BOUNDS, arc } from './originMapShapes';

registerCopy(pagesMarketing);

const proj = makeProjection(ORIGIN_MAP_BOUNDS, 900, 10);

/**
 * "From → To" view of the public map: our clients' home cities (AZ / TR / UA, ≥ 3 people per point) and
 * flow lines to the German cities they work in (≥ 3 per route). Plain inline SVG, no map library.
 */
export const OriginFlowMap = ({ data }: { data: PublicOrigins }) => {
  const { t } = useTranslation();
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...data.origins.map((o) => o.count));
  const maxFlow = Math.max(1, ...data.flows.map((f) => f.count));
  const originName = (o: PublicOrigins['origins'][number]) => o.city ?? t('mk.origins.countryOnly', { country: t(`mk.origins.countries.${o.country}`) });

  const flows = useMemo(
    () =>
      data.flows
        .map((f) => {
          const o = data.origins.find((x) => x.key === f.from);
          if (!o) return null;
          const from = proj.project([o.lng, o.lat]);
          const to = proj.project(cityCoords(f.to) ?? DE_CENTRE);
          return { ...f, origin: o, d: arc(from, to), to2: to };
        })
        .filter((f): f is NonNullable<typeof f> => !!f),
    [data],
  );
  const destinations = useMemo(() => {
    const m = new Map<string, { city: string; x: number; y: number; count: number }>();
    for (const f of flows) {
      const cur = m.get(f.to) ?? { city: f.to, x: f.to2[0], y: f.to2[1], count: 0 };
      cur.count += f.count;
      m.set(f.to, cur);
    }
    return [...m.values()];
  }, [flows]);
  const current = data.origins.find((o) => o.key === active) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
      <div className="relative w-full">
        <svg viewBox={`0 0 ${proj.width} ${proj.height}`} className="h-auto w-full" role="group" aria-label={t('mk.origins.mapLabel')}>
          {COUNTRY_SHAPES.map((c) => (
            <g key={c.code}>
              {c.rings.map((ring, i) => (
                <path key={i} d={proj.path(ring)} className={clsx('stroke-brand-500/40', c.code === 'DE' ? 'fill-brand-50' : 'fill-surface')} strokeWidth={1.2} strokeLinejoin="round">
                  <title>{t(`mk.origins.countries.${c.code}`)}</title>
                </path>
              ))}
            </g>
          ))}
          {(Object.keys(LABELS) as (OriginCountry | 'DE')[]).map((c) => {
            const [x, y] = proj.project(LABELS[c]);
            return (
              <text key={c} x={x} y={y} textAnchor="middle" className="pointer-events-none fill-muted text-[13px] font-semibold tracking-wider opacity-70" aria-hidden>
                {t(`mk.origins.countries.${c}`)}
              </text>
            );
          })}
          {flows.map((f) => {
            const on = active === null || active === f.from;
            return (
              <path
                key={`${f.from}-${f.to}`}
                d={f.d}
                fill="none"
                className={clsx('stroke-brand-600 transition-opacity', on ? 'opacity-70' : 'opacity-10')}
                strokeWidth={1 + 4 * (f.count / maxFlow)}
                strokeLinecap="round"
                strokeDasharray="6 5"
              >
                <title>{t('mk.origins.flow', { from: originName(f.origin), to: f.to, count: f.count })}</title>
              </path>
            );
          })}
          {destinations.map((d) => (
            <circle key={d.city} cx={d.x} cy={d.y} r={4 + 5 * Math.sqrt(d.count / maxFlow)} className="fill-brand-700 stroke-white" strokeWidth={1.5}>
              <title>{`${d.city} · ${t('mk.origins.people', { count: d.count })}`}</title>
            </circle>
          ))}
          {data.origins.map((o) => {
            const [x, y] = proj.project([o.lng, o.lat]);
            const r = 5 + 11 * Math.sqrt(o.count / max);
            const on = active === o.key;
            return (
              <g
                key={o.key}
                role="button"
                tabIndex={0}
                aria-label={`${originName(o)}: ${t('mk.origins.people', { count: o.count })}`}
                className="cursor-pointer outline-none"
                onMouseEnter={() => setActive(o.key)}
                onMouseLeave={() => setActive((a) => (a === o.key ? null : a))}
                onFocus={() => setActive(o.key)}
                onBlur={() => setActive((a) => (a === o.key ? null : a))}
                onClick={() => setActive((a) => (a === o.key ? null : o.key))}
              >
                <circle cx={x} cy={y} r={r + 4} className="fill-warning/20" />
                <circle cx={x} cy={y} r={r} className={clsx('stroke-white', on ? 'fill-warning-fg' : 'fill-warning')} strokeWidth={2} />
              </g>
            );
          })}
        </svg>
        {current && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 w-max max-w-[240px] -translate-x-1/2 -translate-y-full rounded-lg bg-navy-900 px-3 py-2 text-xs leading-snug text-white shadow-lg"
            style={{ left: `${(proj.project([current.lng, current.lat])[0] / proj.width) * 100}%`, top: `calc(${(proj.project([current.lng, current.lat])[1] / proj.height) * 100}% - 18px)` }}
          >
            <span className="font-bold">{originName(current)}</span>
            <span className="block text-white/75">{t('mk.origins.people', { count: current.count })}</span>
          </div>
        )}
      </div>

      <div>
        <ul className="grid grid-cols-3 gap-2 text-center">
          {(['AZ', 'TR', 'UA'] as const).map((c) => (
            <li key={c} className="rounded-xl border border-line bg-card px-2 py-3">
              <span className="block font-display text-xl font-extrabold text-brand-600 tabular-nums">{data.countries[c] || '—'}</span>
              <span className="block text-xs text-muted">{t(`mk.origins.countries.${c}`)}</span>
            </li>
          ))}
        </ul>
        {data.flows.length > 0 && (
          <>
            <p className="mt-4 text-sm font-semibold text-ink">{t('mk.origins.topFlows')}</p>
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-card">
              {flows.slice(0, 8).map((f) => (
                <li key={`${f.from}-${f.to}`}>
                  <button
                    type="button"
                    className={clsx('flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-surface', active === f.from && 'bg-surface')}
                    onMouseEnter={() => setActive(f.from)}
                    onFocus={() => setActive(f.from)}
                    onClick={() => setActive(f.from)}
                  >
                    <MapPin className="size-4 shrink-0 text-warning" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                      {originName(f.origin)} <ArrowRight className="inline size-3.5 text-muted" aria-hidden /> {f.to}
                    </span>
                    <span className="shrink-0 font-semibold text-brand-600 tabular-nums">{t('mk.origins.people', { count: f.count })}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-3 flex items-start gap-2 text-xs text-muted">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('mk.origins.privacy', { min: data.minPerPoint })}
        </p>
      </div>
    </div>
  );
};
