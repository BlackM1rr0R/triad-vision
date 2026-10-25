import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2, Clock, Compass, Euro, FileStack, Info, Languages, ListFilter, Stamp } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { Reveal, Stagger, StaggerItem } from '@/components/motion';
import { Button, buttonClass } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchEmpty, Traveller } from '@/components/illustrations';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { VisaCard } from '@/components/cards';
import { SkeletonGrid } from '@/components/ui/Skeleton';
import { ComparisonTable } from '@/components/visa/ComparisonTable';
import { RangeBars } from '@/components/visa/Charts';
import { PageCta } from '@/components/visa/PageCta';
import { CostCalculatorTeaser } from '@/components/marketing/CostCalculatorTeaser';
import { MIN_WAGE_MONTHLY, hasProcessing, hasSalary, isSeasonal, isTrainee, levelRank, useEuro } from '@/components/visa/utils';
import { useSiteContent } from '@/lib/content';
import { useL10n } from '@/lib/l10n';
import type { VisaCategory } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesVisa } from '@/i18n/pagesVisa';
import { usePageTitle } from '@/lib/usePageTitle';

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
  usePageTitle(t('visasPage.heroTitle'));
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
        {/* While the catalogue loads, invisible chips hold the space so the page below does not jump (CLS). */}
        {isLoading && (
          <ul className="invisible mt-6 flex flex-wrap gap-2 text-sm font-semibold" aria-hidden>
            {['w-40', 'w-48', 'w-44'].map((w) => (
              <li key={w} className={clsx('h-9 rounded-full', w)} />
            ))}
          </ul>
        )}
        {visas.length > 0 && (
          <ul className="mt-6 flex flex-wrap gap-2 text-sm font-semibold">
            <li className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-ink shadow-[var(--tv-shadow-card)]">
              <Stamp className="size-4 text-muted" /> {t('visasPage.heroTypes', { count: visas.length })}
            </li>
            {lowest && (
              <li className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-ink shadow-[var(--tv-shadow-card)]">
                <Languages className="size-4 text-muted" /> {t('visasPage.heroLevels', { from: lowest })}
              </li>
            )}
            {pMin !== null && (
              <li className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-ink shadow-[var(--tv-shadow-card)]">
                <Clock className="size-4 text-muted" /> {t('visasPage.heroWeeks', { min: pMin, max: pMax })}
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
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
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
                      'h-11 shrink-0 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition',
                      filter === f ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-primary',
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
                <select id="visa-sort" className="input h-11 py-0" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
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
            <SkeletonGrid count={6} media mediaClassName="aspect-[16/11]" lines={3} className="grid-cards sm:grid-cols-2 lg:grid-cols-3" />
          ) : shown.length === 0 ? (
            <div className="rounded-3xl border border-line bg-card">
              <EmptyState
                size="lg"
                illustration={<SearchEmpty />}
                title={t('visasPage.grid.empty')}
                action={
                  <Button variant="outline" onClick={() => setFilter('all')}>
                    {t('visasPage.grid.reset')}
                  </Button>
                }
              />
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
        <section className="section bg-sunken">
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
                  <h3 className="mb-5 flex items-center gap-2 font-display text-lg font-semibold text-ink">
                    <span className="grid size-9 place-items-center rounded-xl chip-soft"><Euro className="size-4" /></span> {t('visasPage.charts.salaryTitle')}
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
                  <h3 className="mb-5 flex items-center gap-2 font-display text-lg font-semibold text-ink">
                    <span className="grid size-9 place-items-center rounded-xl chip-sky"><Clock className="size-4" /></span> {t('visasPage.charts.processingTitle')}
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
            <div className="grid overflow-hidden rounded-3xl border border-line bg-card shadow-[var(--tv-shadow-card)] lg:grid-cols-[1.25fr_1fr]">
              <div className="p-6 sm:p-10 lg:p-14">
                <span className="eyebrow">
                  <Compass className="size-4" /> {t('visasPage.fit.eyebrow')}
                </span>
                <h2 className="h-section mt-3 text-balance">{t('visasPage.fit.title')}</h2>
                <p className="mt-4 max-w-[65ch] leading-relaxed text-muted">{t('visasPage.fit.text')}</p>
                <ul className="mt-6 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  {(
                    t('visasPage.fit.points', {
                      returnObjects: true,
                    }) as string[]
                  ).map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm font-semibold text-ink">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> {p}
                    </li>
                  ))}
                </ul>
                <Link to="/eligibility" className={buttonClass({ size: 'lg', className: 'mt-8' })}>
                  {t('visasPage.fit.button')} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
              <FitIllustration />
            </div>
          </Reveal>
        </div>
      </section>

      <CostCalculatorTeaser />
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

/** Decorative drawing beside the "Which visa fits me?" teaser (warm sand panel, follows the theme). */
const FitIllustration = () => (
  <div className="hidden items-center justify-center bg-sunken p-10 sm:flex" aria-hidden>
    <Traveller className="w-full max-w-sm" />
  </div>
);
