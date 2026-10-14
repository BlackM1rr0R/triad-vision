import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2, Clock, Compass, Euro, FileStack, Info, Languages, ListFilter, Stamp } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { Magnetic, Reveal, Stagger, StaggerItem } from '@/components/motion';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { VisaCard } from '@/components/cards';
import { PageLoader } from '@/components/ui/Spinner';
import { ComparisonTable } from '@/components/visa/ComparisonTable';
import { RangeBars } from '@/components/visa/Charts';
import { PageCta } from '@/components/visa/PageCta';
import { MIN_WAGE_MONTHLY, hasProcessing, hasSalary, isSeasonal, isTrainee, levelRank, useEuro } from '@/components/visa/utils';
import { useSiteContent } from '@/lib/content';
import { useL10n } from '@/lib/l10n';
import type { VisaCategory } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesVisa } from '@/i18n/pagesVisa';

registerCopy(pagesVisa);

type Filter = 'all' | 'basic' | 'advanced' | 'family' | 'longTerm' | 'seasonal';
type Sort = 'recommended' | 'salary' | 'speed' | 'level';

const FILTERS: Filter[] = ['all', 'basic', 'advanced', 'family', 'longTerm', 'seasonal'];
const SORTS: Sort[] = ['recommended', 'salary', 'speed', 'level'];

const matches = (v: VisaCategory, f: Filter) => {
  switch (f) {
    case 'basic':
      return levelRank(v.germanLevel) <= 1;
    case 'advanced':
      return levelRank(v.germanLevel) >= 2 && Number.isFinite(levelRank(v.germanLevel));
    case 'family':
      return v.familyReunion === true;
    case 'longTerm':
      return !isSeasonal(v);
    case 'seasonal':
      return isSeasonal(v);
    default:
      return true;
  }
};

const sorter: Record<Sort, (a: VisaCategory, b: VisaCategory) => number> = {
  recommended: (a, b) => a.sortOrder - b.sortOrder,
  salary: (a, b) => (b.salaryMax ?? -1) - (a.salaryMax ?? -1),
  speed: (a, b) => (a.processingMax ?? 999) - (b.processingMax ?? 999),
  level: (a, b) => levelRank(a.germanLevel) - levelRank(b.germanLevel),
};

export default function Visas() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const euro = useEuro();
  const { data, isLoading } = useSiteContent();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recommended');

  const visas = useMemo(() => [...(data?.visaCategories ?? [])].sort(sorter.recommended), [data]);
  const shown = useMemo(() => visas.filter((v) => matches(v, filter)).sort(sorter[sort]), [visas, filter, sort]);

  const withSalary = visas.filter(hasSalary);
  const withTime = visas.filter(hasProcessing);
  const lowest = [...visas].sort(sorter.level)[0]?.germanLevel?.match(/[ABC][12]/)?.[0];
  const pMin = withTime.length ? Math.min(...withTime.map((v) => v.processingMin)) : null;
  const pMax = withTime.length ? Math.max(...withTime.map((v) => v.processingMax)) : null;
  const anyTrainee = withSalary.some(isTrainee);

  return (
    <>
      <PageHero
        title={t('visasPage.heroTitle')}
        subtitle={t('visasPage.heroSubtitle')}
        image="https://images.unsplash.com/photo-1560969184-10fe8719e047?auto=format&fit=crop&w=2000&q=70"
      >
        {visas.length > 0 && (
          <ul className="mt-6 flex flex-wrap gap-2 text-sm font-semibold">
            <li className="glass inline-flex items-center gap-2 rounded-full px-4 py-2">
              <Stamp className="size-4 text-brand-400" /> {t('visasPage.heroTypes', { count: visas.length })}
            </li>
            {lowest && (
              <li className="glass inline-flex items-center gap-2 rounded-full px-4 py-2">
                <Languages className="size-4 text-brand-400" /> {t('visasPage.heroLevels', { from: lowest })}
              </li>
            )}
            {pMin !== null && (
              <li className="glass inline-flex items-center gap-2 rounded-full px-4 py-2">
                <Clock className="size-4 text-brand-400" /> {t('visasPage.heroWeeks', { min: pMin, max: pMax })}
              </li>
            )}
          </ul>
        )}
      </PageHero>

      {/* Catalogue with filters */}
      <section className="section">
        <div className="container-x">
          <SectionHeading eyebrow={t('visasPage.grid.eyebrow')} title={t('visasPage.grid.title')} subtitle={t('visasPage.grid.subtitle')} />
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wider text-muted uppercase">
                <ListFilter className="size-3.5" /> {t('visasPage.grid.filterLabel')}
              </p>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                    className={clsx(
                      'h-10 shrink-0 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition',
                      filter === f ? 'border-brand-600 bg-brand-600 text-white shadow-md shadow-brand-600/25' : 'border-line bg-white text-navy-900 hover:border-brand-400',
                    )}
                  >
                    {t(`visasPage.grid.filters.${f}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1 lg:w-60 lg:flex-none">
                <label htmlFor="visa-sort" className="label">
                  {t('visasPage.grid.sortLabel')}
                </label>
                <select id="visa-sort" className="input h-10 py-0" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  {SORTS.map((s) => (
                    <option key={s} value={s}>
                      {t(`visasPage.grid.sort.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <p className="mb-5 text-sm text-muted" aria-live="polite">
            {t('visasPage.grid.results', {
              count: shown.length,
              total: visas.length,
            })}
          </p>
          {isLoading ? (
            <PageLoader />
          ) : shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
              <p className="font-semibold text-navy-900">{t('visasPage.grid.empty')}</p>
              <button type="button" className="btn-ghost btn-sm mt-4" onClick={() => setFilter('all')}>
                {t('visasPage.grid.reset')}
              </button>
            </div>
          ) : (
            <Stagger key={`${filter}-${sort}`} className="grid-cards sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((v) => (
                <StaggerItem key={v.id}>
                  <VisaCard visa={v} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </section>

      {/* Comparison table */}
      {visas.length > 0 && (
        <section className="section bg-surface">
          <div className="container-x">
            <SectionHeading eyebrow={t('visasPage.compare.eyebrow')} title={t('visasPage.compare.title')} subtitle={t('visasPage.compare.subtitle')} />
            <Reveal>
              <ComparisonTable visas={visas} />
            </Reveal>
            <p className="mt-4 flex items-start gap-2 text-xs text-muted">
              <Info className="mt-px size-3.5 shrink-0" />
              <span>
                {t('visasPage.indicative')} {anyTrainee && t('visasPage.charts.traineeNote')}
              </span>
            </p>
          </div>
        </section>
      )}

      {/* Charts */}
      {(withSalary.length > 0 || withTime.length > 0) && (
        <section className="section">
          <div className="container-x">
            <SectionHeading eyebrow={t('visasPage.charts.eyebrow')} title={t('visasPage.charts.title')} subtitle={t('visasPage.charts.subtitle')} />
            <div className="grid gap-5 xl:grid-cols-2 xl:gap-6">
              {withSalary.length > 0 && (
                <Reveal className="card card-pad min-w-0">
                  <h3 className="mb-5 flex items-center gap-2 font-display text-lg font-bold text-navy-900">
                    <Euro className="size-5 text-brand-600" /> {t('visasPage.charts.salaryTitle')}
                  </h3>
                  <RangeBars
                    title={t('visasPage.charts.salaryAria')}
                    rows={[...withSalary]
                      .sort((a, b) => b.salaryMax - a.salaryMax)
                      .map((v) => ({
                        key: v.id,
                        label: tr(v.title),
                        min: v.salaryMin,
                        max: v.salaryMax,
                        href: `/visas/${v.slug}`,
                        muted: isTrainee(v),
                        suffix: isTrainee(v) ? ' *' : '',
                      }))}
                    format={euro.fmt}
                    rangeText={euro.range}
                    reference={{
                      value: MIN_WAGE_MONTHLY,
                      label: t('visasPage.charts.minWage'),
                    }}
                  />
                  {anyTrainee && <p className="mt-3 text-xs text-muted">{t('visasPage.charts.traineeNote')}</p>}
                </Reveal>
              )}
              {withTime.length > 0 && (
                <Reveal delay={0.1} className="card card-pad min-w-0">
                  <h3 className="mb-5 flex items-center gap-2 font-display text-lg font-bold text-navy-900">
                    <Clock className="size-5 text-brand-600" /> {t('visasPage.charts.processingTitle')}
                  </h3>
                  <RangeBars
                    title={t('visasPage.charts.processingAria')}
                    tone="navy"
                    rows={[...withTime]
                      .sort((a, b) => a.processingMax - b.processingMax)
                      .map((v) => ({
                        key: v.id,
                        label: tr(v.title),
                        min: v.processingMin,
                        max: v.processingMax,
                        href: `/visas/${v.slug}`,
                      }))}
                    format={(n) => String(n)}
                    rangeText={(a, b) => t('visaDetail.facts.weeks', { min: a, max: b })}
                  />
                  <p className="mt-3 text-xs text-muted">{t('visasPage.charts.embassyAvg')}</p>
                </Reveal>
              )}
            </div>
            <p className="mt-5 flex items-start gap-2 text-xs text-muted">
              <Info className="mt-px size-3.5 shrink-0" /> {t('visasPage.indicative')}
            </p>
          </div>
        </section>
      )}

      {/* "Which visa fits me?" teaser */}
      <section className="pb-16 sm:pb-20 lg:pb-28">
        <div className="container-x">
          <Reveal>
            <div className="grid overflow-hidden rounded-3xl border border-line bg-surface lg:grid-cols-[1.25fr_1fr] lg:rounded-[2rem]">
              <div className="p-6 sm:p-10 lg:p-14">
                <span className="eyebrow">
                  <Compass className="size-4" /> {t('visasPage.fit.eyebrow')}
                </span>
                <h2 className="mt-3 font-display text-[1.6rem] leading-tight font-extrabold text-navy-900 text-balance sm:text-4xl">{t('visasPage.fit.title')}</h2>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-base">{t('visasPage.fit.text')}</p>
                <ul className="mt-6 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  {(
                    t('visasPage.fit.points', {
                      returnObjects: true,
                    }) as string[]
                  ).map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm font-semibold text-navy-900">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> {p}
                    </li>
                  ))}
                </ul>
                <Magnetic className="mt-8">
                  <Link to="/eligibility" className="btn-primary group">
                    {t('visasPage.fit.button')} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                  </Link>
                </Magnetic>
              </div>
              <FitIllustration />
            </div>
          </Reveal>
        </div>
      </section>

      <PageCta
        icon={<FileStack className="size-7" />}
        title={t('visasPage.cta.title')}
        text={t('visasPage.cta.text')}
        primary={{ to: '/register', label: t('visasPage.cta.primary') }}
        secondary={{ to: '/contact', label: t('visasPage.cta.secondary') }}
      />
    </>
  );
}

/** Static "matching" illustration: a profile card linked to three visa options, one highlighted. */
const FitIllustration = () => (
  <div className="relative hidden min-h-[320px] items-center justify-center bg-navy-950 p-10 sm:flex" aria-hidden>
    <div className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" />
    <svg viewBox="0 0 360 240" className="relative w-full max-w-md">
      <defs>
        <linearGradient id="fit-g" x1="0" x2="1">
          <stop offset="0" stopColor="#2f7bff" />
          <stop offset="1" stopColor="#1565e8" />
        </linearGradient>
      </defs>
      <rect x="10" y="80" width="120" height="80" rx="14" fill="#112b5c" stroke="#18397a" />
      <circle cx="40" cy="110" r="13" fill="#5c9bff" />
      <rect x="60" y="102" width="56" height="7" rx="3.5" fill="#ffffff" opacity="0.7" />
      <rect x="60" y="114" width="38" height="6" rx="3" fill="#ffffff" opacity="0.35" />
      <rect x="26" y="134" width="88" height="6" rx="3" fill="#ffffff" opacity="0.25" />
      {[40, 120, 200].map((y, i) => (
        <g key={y}>
          <path
            d={`M130 120 C 180 120, 190 ${y + 20}, 230 ${y + 20}`}
            fill="none"
            stroke={i === 1 ? '#2f7bff' : '#18397a'}
            strokeWidth={i === 1 ? 3 : 2}
            strokeDasharray={i === 1 ? undefined : '5 5'}
          />
          <rect x="230" y={y} width="120" height="40" rx="10" fill={i === 1 ? 'url(#fit-g)' : '#0b1f44'} stroke={i === 1 ? 'none' : '#18397a'} />
          <rect x="246" y={y + 12} width={i === 1 ? 70 : 60} height="7" rx="3.5" fill="#ffffff" opacity={i === 1 ? 0.95 : 0.4} />
          <rect x="246" y={y + 24} width="40" height="5" rx="2.5" fill="#ffffff" opacity={i === 1 ? 0.6 : 0.2} />
          {i === 1 && <circle cx="334" cy={y + 20} r="8" fill="#12a150" />}
          {i === 1 && <path d={`M330 ${y + 20} l3 3 l5 -6`} stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />}
        </g>
      ))}
    </svg>
  </div>
);
