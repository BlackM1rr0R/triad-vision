import { useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Briefcase, ExternalLink, Info } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { GlossaryChips } from '@/components/glossary/GlossaryChips';
import { registerCopy } from '@/i18n';
import { pagesShortage } from '@/i18n/pagesShortage';
import { usePageTitle } from '@/lib/usePageTitle';
import { GERMANY_MAP_ATTRIBUTION, GERMANY_MAP_SOURCE_URL, GERMANY_STATES, GERMANY_VIEWBOX } from '@/lib/shortage/germanyStatesPaths';
import {
  LEVELS,
  REGION_STATES,
  SHORTAGE_AS_OF,
  SHORTAGE_EDITION,
  SHORTAGE_PROFESSIONS,
  SHORTAGE_SOURCES,
  professionByKey,
  rankedRegions,
  regionOfState,
  regionalLevels,
  type Category,
  type Level,
  type Rating,
  type Region,
} from '@/lib/shortage/data';

registerCopy(pagesShortage);

const REGION_NAMES: Record<Region, string> = {
  NW: 'Nordrhein-Westfalen',
  HE: 'Hessen',
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  MV: 'Mecklenburg-Vorpommern',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  TH: 'Thüringen',
  NI_HB: 'Niedersachsen + Bremen',
  BB_BE: 'Berlin + Brandenburg',
  RP_SL: 'Rheinland-Pfalz + Saarland',
  SH_HH: 'Schleswig-Holstein + Hamburg',
};
const STATE_NAME = Object.fromEntries(GERMANY_STATES.map((s) => [s.code, s.name]));

const FILL: Record<Category, string> = { E: 'fill-danger', B: 'fill-warning', K: 'fill-success' };
const BG: Record<Category, string> = { E: 'bg-danger', B: 'bg-warning', K: 'bg-success' };
const CHIP: Record<Category, string> = { E: 'bg-danger-bg text-danger-fg border-danger-border', B: 'bg-warning-bg text-warning-fg border-warning-border', K: 'bg-success-bg text-success-fg border-success-border' };

/** Score with the visitor's decimal separator (2,7 / 2.7). */
const scoreIn = (n: number, lng: string) => (lng === 'en' ? n.toFixed(1) : n.toFixed(1).replace('.', ','));

const RatingChip = ({ rating, lng }: { rating: Rating | null | undefined; lng: string }) => {
  const { t } = useTranslation();
  if (!rating) return <span className="text-sm text-muted">{t('shortage.national.notRated')}</span>;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold', CHIP[rating.cat])}>
      {t(`shortage.cats.${rating.cat}`)} · {scoreIn(rating.score, lng)}
    </span>
  );
};

/** Diagonal hatch for states without a published rating. */
const HatchDefs = ({ id }: { id: string }) => (
  <defs>
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" className="fill-neutral-bg" />
      <line x1="0" y1="0" x2="0" y2="6" className="stroke-neutral-border" strokeWidth="2" />
    </pattern>
  </defs>
);

/**
 * /shortage-barometer — BA Engpassanalyse 2025 for our target professions: national result per occupation and
 * level, the Länder map (12 BA regions; four pairs of states rated together) and a ranking. Static data with
 * source + as-of (lib/shortage/data.ts); the selection lives in the URL (?p=nursing&l=F), so it is shareable and
 * server-rendered as chosen.
 */
export default function ShortageBarometerPage() {
  const { t, i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  usePageTitle(t('shortage.heroTitle'));
  const [params, setParams] = useSearchParams();
  const profession = professionByKey(params.get('p')) ?? SHORTAGE_PROFESSIONS[0];
  const levels = regionalLevels(profession);
  const levelParam = params.get('l') as Level | null;
  const level: Level | null = levelParam && levels.includes(levelParam) ? levelParam : (levels[0] ?? null);
  const row = profession.regional?.find((r) => r.level === level) ?? null;
  const [selected, setSelected] = useState<Region | null>(null);
  const hatch = useId().replace(/:/g, '');
  const selectId = useId();

  const set = (p: string, l?: Level | null) => {
    const q = new URLSearchParams();
    q.set('p', p);
    if (l) q.set('l', l);
    setSelected(null);
    setParams(q, { replace: true, preventScrollReset: true });
  };

  // Berlin and Bremen lie inside Brandenburg / Niedersachsen: draw them last.
  const states = useMemo(() => [...GERMANY_STATES].sort((a, b) => Number(['BE', 'HB', 'HH'].includes(a.code)) - Number(['BE', 'HB', 'HH'].includes(b.code))), []);
  const professionName = t(`shortage.professions.${profession.key}`);
  const levelName = level ? t(`shortage.levelsShort.${level}`) : '';
  const ratingOf = (region: Region | null) => (region && row ? (row.states[region] ?? null) : null);
  const describe = (region: Region) => {
    const r = ratingOf(region);
    return t('shortage.map.selected', { state: REGION_NAMES[region], value: r ? `${t(`shortage.cats.${r.cat}`)} (${scoreIn(r.score, lng)})` : t('shortage.map.noData') });
  };

  return (
    <>
      <PageHero title={t('shortage.heroTitle')} subtitle={t('shortage.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x space-y-6">
          {/* Profession + level */}
          <div className="flex flex-col gap-4 rounded-3xl border border-line bg-card p-4 sm:p-5 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor={selectId} className="label">
                {t('shortage.profession')}
              </label>
              <select id={selectId} className="input" value={profession.key} onChange={(e) => set(e.target.value)}>
                {SHORTAGE_PROFESSIONS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {t(`shortage.professions.${p.key}`)}
                  </option>
                ))}
              </select>
            </div>
            {levels.length > 0 && (
              <div role="radiogroup" aria-label={t('shortage.level')} className="flex flex-wrap gap-1 rounded-xl border border-line bg-sunken p-1">
                {levels.map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={level === l} onClick={() => set(profession.key, l)} className={clsx('min-h-10 rounded-lg px-3 text-sm font-semibold', level === l ? 'bg-primary text-primary-contrast shadow-sm' : 'text-muted hover:text-ink')}>
                    {t(`shortage.levelsShort.${l}`)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* National result */}
          <section aria-labelledby="sb-national" className="rounded-3xl border border-line bg-card p-4 sm:p-5">
            <h2 id="sb-national" className="font-display text-xl font-semibold text-ink">
              {t('shortage.national.title')} — {professionName}
            </h2>
            <ul className="mt-3 divide-y divide-line">
              {profession.national.map((occ) => (
                <li key={occ.kldb} className="py-3">
                  <p className="font-semibold text-ink" lang="de">
                    {occ.name}
                  </p>
                  <p className="text-xs text-muted">{t('shortage.national.occupation', { code: occ.kldb })}</p>
                  <dl className="mt-2 grid gap-2 sm:grid-cols-3">
                    {LEVELS.filter((l) => occ.ratings[l]).map((l) => (
                      <div key={l} className="rounded-xl bg-sunken p-2.5">
                        <dt className="text-xs font-semibold text-muted">{t(`shortage.levels.${l}`)}</dt>
                        <dd className="mt-1 space-y-1">
                          <RatingChip rating={occ.ratings[l]} lng={lng} />
                          {occ.prev?.[l] && <p className="text-[11px] text-muted">{t('shortage.national.prev', { year: SHORTAGE_EDITION.previousYear, value: `${t(`shortage.cats.${occ.prev[l]!.cat}`)} ${scoreIn(occ.prev[l]!.score, lng)}` })}</p>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
            {profession.note && (
              <p className="mt-3 flex items-start gap-2 rounded-2xl border border-info-border bg-info-bg p-3 text-sm text-info-fg" role="note">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t(`shortage.notes.${profession.note}`)}
              </p>
            )}
          </section>

          {/* Map + ranking */}
          {row ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <section aria-labelledby="sb-map" className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                <h2 id="sb-map" className="font-display text-xl font-semibold text-ink">
                  {t('shortage.map.title')}
                </h2>
                <p className="mt-1 text-xs text-muted" lang="de">
                  {t('shortage.map.group', { group: row.group, name: row.name, level: levelName })}
                </p>
                <svg viewBox={GERMANY_VIEWBOX} className="mx-auto mt-3 w-full max-w-md" role="group" aria-label={t('shortage.map.aria', { profession: professionName, level: levelName })}>
                  <HatchDefs id={hatch} />
                  {states.map((s) => {
                    const region = regionOfState(s.code);
                    const rating = ratingOf(region);
                    const active = selected !== null && region === selected;
                    return (
                      <g
                        key={s.code}
                        role="button"
                        tabIndex={0}
                        aria-pressed={active}
                        aria-label={region ? describe(region) : s.name}
                        onClick={() => setSelected(region)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelected(region);
                          }
                        }}
                        className="cursor-pointer outline-none [&:focus-visible>path]:stroke-focus [&:focus-visible>path]:[stroke-width:3]"
                      >
                        <path d={s.d} className={clsx(rating ? FILL[rating.cat] : undefined, 'stroke-card transition-opacity hover:opacity-80 motion-reduce:transition-none', active && 'stroke-ink')} fill={rating ? undefined : `url(#${hatch})`} strokeWidth={active ? 2.5 : 1} strokeLinejoin="round" />
                        <title>{region ? describe(region) : s.name}</title>
                      </g>
                    );
                  })}
                  {GERMANY_STATES.filter((s) => !['BE', 'HB', 'HH', 'SL'].includes(s.code)).map((s) => (
                    <text key={`l-${s.code}`} x={s.labelX} y={s.labelY} textAnchor="middle" className="pointer-events-none fill-ink text-[15px] font-bold" aria-hidden>
                      {s.code}
                    </text>
                  ))}
                </svg>
                <ul className="mt-3 flex flex-wrap gap-3 text-xs text-ink/80" aria-label={t('shortage.level')}>
                  {(['E', 'B', 'K'] as const).map((c) => (
                    <li key={c} className="inline-flex items-center gap-1.5">
                      <span className={clsx('size-3 rounded-sm', BG[c])} aria-hidden /> {t(`shortage.cats.${c}`)} ({t(`shortage.catRange.${c}`)})
                    </li>
                  ))}
                  <li className="inline-flex items-center gap-1.5">
                    <svg className="size-3" aria-hidden>
                      <rect width="12" height="12" fill={`url(#${hatch})`} />
                    </svg>
                    {t('shortage.map.noData')}
                  </li>
                </ul>
                <p className="mt-3 min-h-10 rounded-xl bg-sunken p-2.5 text-sm text-ink" aria-live="polite">
                  {selected ? (
                    <>
                      {describe(selected)}
                      {REGION_STATES[selected].length > 1 && <span className="block text-xs text-muted">{t('shortage.map.together', { other: REGION_STATES[selected].map((c) => STATE_NAME[c]).join(' + ') })}</span>}
                    </>
                  ) : (
                    <span className="text-muted">{t('shortage.map.select')}</span>
                  )}
                </p>
              </section>

              <section aria-labelledby="sb-rank" className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                <h2 id="sb-rank" className="font-display text-xl font-semibold text-ink">
                  {t('shortage.chart.title')}
                </h2>
                <ol className="mt-3 space-y-1.5">
                  {[{ region: null as Region | null, rating: row.national }, ...rankedRegions(row)].map(({ region, rating }) => (
                    <li key={region ?? 'D'}>
                      <button type="button" disabled={!region} onClick={() => region && setSelected(region)} className={clsx('grid w-full grid-cols-[9.5rem_1fr_2.5rem] items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm sm:grid-cols-[12rem_1fr_2.5rem]', region ? 'hover:bg-sunken' : 'font-semibold', region && region === selected && 'bg-sunken ring-1 ring-line')}>
                        <span className="truncate text-ink">{region ? REGION_NAMES[region] : t('shortage.chart.germany')}</span>
                        <span className="relative h-3 rounded-full bg-sunken">
                          {rating && <span className={clsx('absolute inset-y-0 left-0 rounded-full', BG[rating.cat])} style={{ width: `${(rating.score / 3) * 100}%` }} />}
                          <span className="absolute inset-y-[-3px] w-px bg-ink/60" style={{ left: `${(2 / 3) * 100}%` }} aria-hidden />
                        </span>
                        <span className="text-right tabular-nums text-ink/80">{rating ? scoreIn(rating.score, lng) : '–'}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-[11px] text-muted">
                  <span className="mr-1 inline-block h-3 w-px translate-y-0.5 bg-ink/60" aria-hidden /> {t('shortage.chart.threshold')}
                </p>
              </section>
            </div>
          ) : (
            <p className="rounded-2xl border border-line bg-card p-4 text-sm text-muted">{t('shortage.nationalOnly')}</p>
          )}

          {/* CTA */}
          <section className="flex flex-col gap-3 rounded-3xl border border-highlight/40 bg-highlight-bg p-5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-semibold text-ink">{t('shortage.cta.title')}</h2>
              <p className="text-sm text-ink/80">{t('shortage.cta.text')}</p>
            </div>
            <Link to={`/jobs/germany?q=${encodeURIComponent(profession.jobQuery)}`} className={buttonClass({ className: 'w-full sm:w-auto' })}>
              <Briefcase className="size-4" aria-hidden /> {t('shortage.cta.button', { q: profession.jobQuery })}
            </Link>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="sb-method" className="rounded-3xl border border-line bg-card p-4 sm:p-5">
              <h2 id="sb-method" className="font-display text-lg font-semibold text-ink">
                {t('shortage.method.title')}
              </h2>
              <p className="mt-2 text-sm text-ink/85">{t('shortage.method.text')}</p>
              <p className="mt-3 rounded-xl border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg" role="note">
                {t('shortage.method.blueCard')}
              </p>
            </section>
            <section aria-labelledby="sb-source" className="rounded-3xl border border-line bg-card p-4 sm:p-5">
              <h2 id="sb-source" className="font-display text-lg font-semibold text-ink">
                {t('shortage.source.title')}
              </h2>
              <p className="mt-2 text-sm text-ink/85">{t('shortage.source.text', { year: SHORTAGE_EDITION.year, published: SHORTAGE_EDITION.published, asOf: SHORTAGE_AS_OF })}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {(['page', 'press', 'data'] as const).map((k) => (
                  <li key={k}>
                    <a href={SHORTAGE_SOURCES[k]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link underline hover:text-link-hover">
                      {t(`shortage.source.${k}`)} <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  </li>
                ))}
                <li className="text-xs text-muted">
                  <a href={GERMANY_MAP_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline">
                    {t('shortage.source.map', { attribution: GERMANY_MAP_ATTRIBUTION })}
                  </a>
                </li>
              </ul>
              <h3 className="mt-4 text-sm font-semibold text-ink">{t('shortage.glossaryTitle')}</h3>
              <GlossaryChips slugs={['bundesagentur-fuer-arbeit', 'zustimmung-der-bundesagentur', 'blaue-karte-eu', ...profession.glossary]} className="mt-2 flex flex-wrap gap-2" />
            </section>
          </div>
        </div>
      </section>
      <RelatedGuides tool="/shortage-barometer" />
    </>
  );
}
