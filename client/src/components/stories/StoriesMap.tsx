import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { List, Map as MapIcon, MapPin, Quote, ShieldCheck, X } from 'lucide-react';
import { cityCoords, makeProjection } from '@/components/about/geo';
import { GERMAN_STATES } from '@/components/growth/germanyStates';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { AuthorAvatar, initialsOf } from '@/components/ui/AuthorAvatar';
import { registerCopy } from '@/i18n';
import { pagesStoriesMap } from '@/i18n/pagesStoriesMap';
import { useL10n } from '@/lib/l10n';
import { sized } from '@/lib/img';
import type { Testimonial } from '@/lib/types';

registerCopy(pagesStoriesMap);

const proj = makeProjection({ w: 5.7, e: 15.2, s: 47.15, n: 55.15 }, 460, 18);

interface Story {
  t: Testimonial;
  name: string;
  quote: string;
  city: string;
  x: number;
  y: number;
}
interface Cluster {
  key: string;
  x: number;
  y: number;
  stories: Story[];
}

/**
 * Greedy clustering in map units: a story joins the first cluster whose centre is within `radius`, the centre
 * moves to the mean. Wider radius on phones (pins would overlap at the smaller scale).
 */
export const clusterStories = (stories: Story[], radius: number): Cluster[] => {
  const out: Cluster[] = [];
  for (const s of [...stories].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const c = out.find((k) => Math.hypot(k.x - s.x, k.y - s.y) <= radius);
    if (c) {
      c.stories.push(s);
      c.x = c.stories.reduce((n, x) => n + x.x, 0) / c.stories.length;
      c.y = c.stories.reduce((n, x) => n + x.y, 0) / c.stories.length;
    } else out.push({ key: s.t.id, x: s.x, y: s.y, stories: [s] });
  }
  return out;
};

const StoryCard = ({ s, compact = false }: { s: Story; compact?: boolean }) => {
  const { tr } = useL10n();
  const role = tr(s.t.role);
  return (
    <figure className={clsx('flex flex-col rounded-2xl border border-line bg-card', compact ? 'p-4' : 'p-5')}>
      <Quote className="size-5 text-highlight-fg" aria-hidden />
      <blockquote className="mt-2 flex-1 text-[0.95rem] leading-relaxed whitespace-pre-line text-ink/90">„{s.quote}"</blockquote>
      <figcaption className="mt-4 flex items-center gap-3 border-t border-line pt-3">
        <AuthorAvatar name={s.name} photo={s.t.authorPhoto ? sized(s.t.authorPhoto, 160) : null} className="size-11" fallbackClassName="chip-soft" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-ink">{s.name}</span>
          <span className="flex items-center gap-1 text-xs text-muted">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{[role, s.city].filter(Boolean).join(' · ')}</span>
          </span>
        </span>
      </figcaption>
    </figure>
  );
};

/**
 * Germany map with the photos and short quotes of candidate success stories (CMS testimonials of kind
 * "candidate" with a German city; only published ones reach the site, which is where the editor records the
 * person's consent). Clustered on phones, keyboard operable, and a list view as the accessible alternative.
 * Renders nothing when no story has a known city.
 */
export const StoriesMap = ({ testimonials }: { testimonials: Testimonial[] }) => {
  const { t } = useTranslation();
  const { tr, locale } = useL10n();
  const uid = useId().replace(/:/g, '');
  const [view, setView] = useState<'map' | 'list'>('map');
  const [compact, setCompact] = useState(false); // phones: bigger pins and clusters (set after hydration)
  const [selected, setSelected] = useState<string | null>(null);
  const panelRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const { placed, elsewhere } = useMemo(() => {
    const placed: Story[] = [];
    const elsewhere: Story[] = [];
    for (const x of testimonials) {
      if (x.kind !== 'candidate' || !x.published) continue;
      const quote = tr(x.quote).trim();
      const name = tr(x.author).trim();
      if (!quote || !name) continue;
      const city = x.city?.trim() ?? '';
      const ll = cityCoords(city);
      const [px, py] = ll ? proj.project(ll) : [0, 0];
      (ll ? placed : elsewhere).push({ t: x, name, quote, city, x: px, y: py });
    }
    return { placed, elsewhere };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tr` changes with `locale`
  }, [testimonials, locale]);

  const r = compact ? 22 : 16;
  const clusters = useMemo(() => clusterStories(placed, compact ? 46 : 26), [placed, compact]);
  const current = clusters.find((c) => c.key === selected) ?? null;

  useEffect(() => {
    if (current) panelRef.current?.focus({ preventScroll: true });
  }, [current]);
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);
  // A cluster key can vanish when the clustering changes (rotation, resize).
  useEffect(() => {
    if (selected && !clusters.some((c) => c.key === selected)) setSelected(null);
  }, [clusters, selected]);

  if (!placed.length) return null;

  const all = [...placed, ...elsewhere];
  const byCity = [...all.reduce((m, s) => m.set(s.city || t('sm.elsewhere'), [...(m.get(s.city || t('sm.elsewhere')) ?? []), s]), new Map<string, Story[]>())].sort((a, b) => b[1].length - a[1].length);
  const pinLabel = (c: Cluster) =>
    c.stories.length === 1 ? t('sm.pin', { name: c.stories[0].name, city: c.stories[0].city }) : t('sm.cluster', { count: c.stories.length, city: c.stories[0].city });

  const toggle = (k: 'map' | 'list', label: string, Icon: typeof MapIcon) => (
    <button
      type="button"
      aria-pressed={view === k}
      onClick={() => setView(k)}
      className={clsx('inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors', view === k ? 'bg-primary text-primary-contrast' : 'text-ink hover:bg-sunken')}
    >
      <Icon className="size-4" aria-hidden /> {label}
    </button>
  );

  return (
    <section className="section" aria-label={t('sm.title')}>
      <div className="container-x">
        <SectionHeading eyebrow={t('sm.eyebrow')} title={t('sm.title')} subtitle={t('sm.subtitle')} />
        <div className="mb-5 flex justify-center">
          <div className="inline-flex gap-1 rounded-full border border-line bg-card p-1" role="group" aria-label={t('sm.view')}>
            {toggle('map', t('sm.viewMap'), MapIcon)}
            {toggle('list', t('sm.viewList'), List)}
          </div>
        </div>

        {view === 'map' ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
            <div className="relative mx-auto w-full max-w-[520px]">
              <svg viewBox={`0 0 ${proj.width} ${proj.height}`} className="h-auto w-full" role="group" aria-label={t('sm.mapLabel')}>
                <defs>
                  {clusters.map((c) => (
                    <clipPath key={c.key} id={`${uid}-clip-${c.key}`}>
                      <circle cx={c.x} cy={c.y} r={r} />
                    </clipPath>
                  ))}
                </defs>
                {GERMAN_STATES.map((s) => (
                  <g key={s.code} aria-hidden>
                    {s.rings.map((ring, i) => (
                      <path key={i} d={proj.path(ring)} className="fill-sunken stroke-line-strong" strokeWidth={1.2} strokeLinejoin="round" />
                    ))}
                  </g>
                ))}
                {clusters.map((c) => {
                  const first = c.stories[0];
                  const on = selected === c.key;
                  const many = c.stories.length > 1;
                  return (
                    <g
                      key={c.key}
                      role="button"
                      tabIndex={0}
                      aria-label={pinLabel(c)}
                      aria-pressed={on}
                      className="group cursor-pointer outline-none"
                      onClick={() => setSelected((k) => (k === c.key ? null : c.key))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelected((k) => (k === c.key ? null : c.key));
                        }
                      }}
                    >
                      <circle cx={c.x} cy={c.y} r={r + 8} className="fill-transparent" />
                      <circle cx={c.x} cy={c.y} r={r + 3} className={clsx('transition-colors motion-reduce:transition-none', on ? 'fill-primary' : 'fill-card group-hover:fill-primary group-focus-visible:fill-primary')} />
                      {first.t.authorPhoto ? (
                        <image href={sized(first.t.authorPhoto, 160)} x={c.x - r} y={c.y - r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${uid}-clip-${c.key})`} />
                      ) : (
                        <>
                          <circle cx={c.x} cy={c.y} r={r} className="fill-chart-1" />
                          <text x={c.x} y={c.y} textAnchor="middle" dominantBaseline="central" className="pointer-events-none fill-white text-[11px] font-bold" aria-hidden>
                            {initialsOf(first.name)}
                          </text>
                        </>
                      )}
                      {many && (
                        <g aria-hidden>
                          <circle cx={c.x + r * 0.8} cy={c.y - r * 0.8} r={9} className="fill-primary stroke-card" strokeWidth={2} />
                          <text x={c.x + r * 0.8} y={c.y - r * 0.8} textAnchor="middle" dominantBaseline="central" className="pointer-events-none fill-primary-contrast text-[10px] font-bold">
                            {c.stories.length}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            <div aria-live="polite">
              {current ? (
                <div className="rounded-3xl border border-line bg-sunken p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 ref={panelRef} tabIndex={-1} className="flex items-center gap-1.5 font-display text-lg font-semibold text-ink outline-none">
                      <MapPin className="size-4 text-chart-1" aria-hidden />
                      {current.stories.length > 1 ? t('sm.clusterTitle', { city: current.stories[0].city }) : current.stories[0].city}
                    </h3>
                    <button type="button" className="grid size-10 place-items-center rounded-lg text-muted hover:bg-card hover:text-ink" aria-label={t('sm.close')} onClick={() => setSelected(null)}>
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                  <div className="grid max-h-[32rem] gap-3 overflow-y-auto overscroll-contain">
                    {current.stories.map((s) => (
                      <StoryCard key={s.t.id} s={s} compact />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-line-strong p-6 text-center text-sm text-muted">
                  <p>{t('sm.hint')}</p>
                  <ul className="mt-4 flex flex-wrap justify-center gap-2">
                    {clusters.slice(0, 8).map((c) => (
                      <li key={c.key}>
                        <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-card py-1 pr-3 pl-1 text-xs font-semibold text-ink hover:bg-sunken" onClick={() => setSelected(c.key)}>
                          <AuthorAvatar name={c.stories[0].name} photo={c.stories[0].t.authorPhoto ? sized(c.stories[0].t.authorPhoto, 160) : null} className="size-8 text-[10px]" fallbackClassName="chip-soft" />
                          {c.stories[0].city}
                          {c.stories.length > 1 && <span className="text-muted">+{c.stories.length - 1}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {byCity.map(([city, list]) => (
              <div key={city}>
                <h3 className="mb-3 flex items-center gap-1.5 font-display text-lg font-semibold text-ink">
                  <MapPin className="size-4 text-chart-1" aria-hidden /> {city} <span className="text-sm font-normal text-muted">({list.length})</span>
                </h3>
                <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {list.map((s) => (
                    <li key={s.t.id}>
                      <StoryCard s={s} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-muted">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden /> {t('sm.consent')}
        </p>
      </div>
    </section>
  );
};

export default StoriesMap;
