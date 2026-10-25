import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, Building2, ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesJobs } from '@/i18n/pagesJobs';
import { PageHero } from '@/components/layout/PageHero';
import { Spinner } from '@/components/ui/Spinner';
import { Button, buttonClass } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Employer, Lost, SearchEmpty } from '@/components/illustrations';
import { SkeletonGrid } from '@/components/ui/Skeleton';
import { JobCard } from '@/components/jobs/JobCard';
import { JobAlertForm } from '@/components/jobs/JobAlertForm';
import { useJobLabels } from '@/components/jobs/labels';
import { EMPLOYMENT_TYPES, GERMAN_LEVELS, SECTORS, type VacancyList } from '@/components/jobs/types';

registerCopy(pagesJobs);

const HERO = 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=2000&q=70';
const SORTS = ['newest', 'salary', 'closing'] as const;
const FILTER_KEYS = ['search', 'sector', 'city', 'germanLevel', 'employmentType', 'salaryMin', 'sort'] as const;
const PAGE_SIZE = 12;

export default function Jobs() {
  const { t } = useTranslation();
  usePageTitle(t('jobsArea.board.title'));
  const L = useJobLabels();
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const page = Math.max(1, Number(params.get('page')) || 1);

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: key !== 'page' });
  };

  // Debounced free-text search.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if ((params.get('search') ?? '') !== searchInput.trim()) set('search', searchInput.trim() || null);
    }, 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const query = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || undefined]));
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['jobs', query, page],
    queryFn: async () => (await api.get<VacancyList>('/vacancies', { params: { ...query, page, pageSize: PAGE_SIZE } })).data,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const activeFilters = FILTER_KEYS.filter((k) => k !== 'sort' && k !== 'search' && params.get(k)).length;

  const reset = () => {
    setSearchInput('');
    setParams(new URLSearchParams(), { replace: true });
  };

  const filters = (
    <div className="grid gap-4">
      <div>
        <label className="label" htmlFor="f-sector">{t('jobsArea.board.sector')}</label>
        <select id="f-sector" className="input" value={params.get('sector') ?? ''} onChange={(e) => set('sector', e.target.value || null)}>
          <option value="">{t('jobsArea.board.allSectors')}</option>
          {SECTORS.map((s) => {
            const n = data?.facets.sectors.find((f) => f.value === s)?.count;
            return (
              <option key={s} value={s}>
                {L.sector(s)}{n ? ` (${n})` : ''}
              </option>
            );
          })}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="f-city">{t('jobsArea.board.city')}</label>
        <select id="f-city" className="input" value={params.get('city') ?? ''} onChange={(e) => set('city', e.target.value || null)}>
          <option value="">{t('jobsArea.board.allCities')}</option>
          {params.get('city') && !data?.facets.cities.some((c) => c.value === params.get('city')) && <option value={params.get('city')!}>{params.get('city')}</option>}
          {data?.facets.cities.map((c) => (
            <option key={c.value} value={c.value}>
              {c.value} ({c.count})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="f-german">{t('jobsArea.board.myGerman')}</label>
        <select id="f-german" className="input" value={params.get('germanLevel') ?? ''} onChange={(e) => set('germanLevel', e.target.value || null)}>
          <option value="">{t('jobsArea.board.anyGerman')}</option>
          {GERMAN_LEVELS.map((g) => (
            <option key={g} value={g}>
              {L.german(g)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">{t('jobsArea.board.myGermanHint')}</p>
      </div>
      <div>
        <label className="label" htmlFor="f-type">{t('jobsArea.board.type')}</label>
        <select id="f-type" className="input" value={params.get('employmentType') ?? ''} onChange={(e) => set('employmentType', e.target.value || null)}>
          <option value="">{t('jobsArea.board.anyType')}</option>
          {EMPLOYMENT_TYPES.map((e) => (
            <option key={e} value={e}>
              {L.employmentType(e)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="f-salary">{t('jobsArea.board.salaryMin')}</label>
        <select id="f-salary" className="input" value={params.get('salaryMin') ?? ''} onChange={(e) => set('salaryMin', e.target.value || null)}>
          <option value="">{t('jobsArea.board.anySalary')}</option>
          {[2000, 2500, 3000, 3500, 4000].map((n) => (
            <option key={n} value={n}>
              {t('jobsArea.common.salaryFrom', { value: L.euro(n) })}
            </option>
          ))}
        </select>
      </div>
      {activeFilters > 0 && (
        <button type="button" onClick={reset} className="inline-flex min-h-11 items-center gap-1.5 justify-self-start text-sm font-semibold text-link hover:text-link-hover">
          <X className="size-4" /> {t('jobsArea.board.reset')}
        </button>
      )}
    </div>
  );

  return (
    <>
      <PageHero title={t('jobsArea.board.title')} subtitle={t('jobsArea.board.subtitle')} image={HERO}>
        <form
          className="mt-7 flex max-w-2xl items-center gap-2 rounded-2xl border border-line-strong/70 bg-card p-2 shadow-[var(--tv-shadow-raised)] focus-within:border-focus focus-within:ring-[3px] focus-within:ring-focus/20"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            set('search', searchInput.trim() || null);
          }}
        >
          <Search className="ml-2 size-5 shrink-0 text-muted" aria-hidden />
          <label htmlFor="job-search" className="sr-only">{t('jobsArea.board.searchLabel')}</label>
          <input
            id="job-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('jobsArea.board.searchPlaceholder')}
            className="min-h-11 min-w-0 flex-1 bg-transparent px-1 py-2.5 text-base text-ink outline-none placeholder:text-subtle"
          />
          <button type="submit" className={buttonClass({ className: 'h-11 shrink-0 px-4 sm:px-5' })}>
            {t('jobsArea.board.searchButton')}
          </button>
        </form>
      </PageHero>

      <section className="section-sm bg-sunken">
        <div className="container-x grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
          <aside className="hidden lg:block">
            <div className="card sticky top-28 rounded-3xl p-5">
              <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
                <SlidersHorizontal className="size-4 text-muted" aria-hidden /> {t('jobsArea.board.filters')}
              </p>
              {filters}
            </div>
          </aside>

          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
                {data ? t('jobsArea.board.results', { count: data.total }) : ' '}
                {isFetching && !isLoading && <Spinner className="size-3.5 text-primary" />}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" className={buttonClass({ variant: 'secondary', className: 'lg:hidden' })} onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
                  <SlidersHorizontal className="size-3.5" /> {t('jobsArea.board.filters')}
                  {activeFilters > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-contrast">{activeFilters}</span>}
                </button>
                <label htmlFor="f-sort" className="sr-only">{t('jobsArea.board.sortLabel')}</label>
                <select id="f-sort" className="input h-11 w-auto py-0 text-sm" value={params.get('sort') ?? 'newest'} onChange={(e) => set('sort', e.target.value === 'newest' ? null : e.target.value)}>
                  {SORTS.map((s) => (
                    <option key={s} value={s}>
                      {t(`jobsArea.board.sort.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filtersOpen && <div className="card mb-5 rounded-3xl p-5 lg:hidden">{filters}</div>}

            {isLoading ? (
              <SkeletonGrid count={6} lines={3} footer className="grid-cards grid-cols-1 md:grid-cols-2 2xl:grid-cols-3" />
            ) : isError ? (
              <div className="card rounded-3xl">
                <EmptyState
                  illustration={<Lost />}
                  text={t('jobsArea.errors.generic')}
                  action={
                    <Button variant="outline" onClick={() => refetch()}>
                      {t('jobsArea.common.retry')}
                    </Button>
                  }
                />
              </div>
            ) : !data?.items.length ? (
              <div className="card rounded-3xl">
                <EmptyState
                  size="lg"
                  illustration={<SearchEmpty />}
                  title={t('jobsArea.board.empty')}
                  text={t('jobsArea.board.emptyText')}
                  action={
                    <>
                      {(activeFilters > 0 || params.get('search')) && (
                        <Button variant="outline" onClick={reset}>
                          {t('jobsArea.board.reset')}
                        </Button>
                      )}
                      <Link to="/booking" className={buttonClass()}>
                        {t('jobsArea.board.consult')}
                      </Link>
                    </>
                  }
                />
              </div>
            ) : (
              <>
                <div className={clsx('grid-cards grid-cols-1 md:grid-cols-2 2xl:grid-cols-3', isFetching && 'opacity-70 transition-opacity')}>
                  {data.items.map((v) => (
                    <JobCard key={v.id} v={v} />
                  ))}
                </div>
                {pages > 1 && (
                  <nav className="mt-8 flex items-center justify-center gap-2" aria-label={t('jobsArea.board.pagination')}>
                    <button type="button" className={buttonClass({ variant: 'secondary' })} disabled={page <= 1} onClick={() => set('page', String(page - 1))}>
                      <ChevronLeft className="size-4" /> <span className="hidden sm:inline">{t('jobsArea.common.prev')}</span>
                    </button>
                    <span className="px-2 text-sm text-muted tabular-nums">{t('jobsArea.board.pageOf', { page, pages })}</span>
                    <button type="button" className={buttonClass({ variant: 'secondary' })} disabled={page >= pages} onClick={() => set('page', String(page + 1))}>
                      <span className="hidden sm:inline">{t('jobsArea.common.next')}</span> <ChevronRight className="size-4" />
                    </button>
                  </nav>
                )}
              </>
            )}

            {/* "Notify me about new jobs" (double opt-in, lib/jobAlerts on the server). */}
            <JobAlertForm className="mt-10" />

            <div className="mt-10 grid items-center gap-6 rounded-3xl border border-line bg-card p-6 shadow-[var(--tv-shadow-card)] sm:p-8 md:grid-cols-[auto_minmax(0,1fr)_auto]">
              <Employer className="hidden w-28 md:block" />
              <div className="max-w-xl">
                <p className="eyebrow">
                  <Building2 className="size-4" aria-hidden /> {t('jobsArea.board.employerEyebrow')}
                </p>
                <p className="mt-2 font-display text-xl font-semibold text-ink sm:text-2xl">{t('jobsArea.board.employerTitle')}</p>
                <p className="mt-1 text-muted">{t('jobsArea.board.employerText')}</p>
              </div>
              <Link to="/employers/register" className={buttonClass({ variant: 'outline', className: 'shrink-0' })}>
                {t('jobsArea.board.employerCta')} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
