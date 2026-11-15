import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, GraduationCap, Search, SlidersHorizontal, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesStudy } from '@/i18n/pagesStudy';
import { PageHero } from '@/components/layout/PageHero';
import { Spinner } from '@/components/ui/Spinner';
import { Button, buttonClass } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGrid } from '@/components/ui/Skeleton';
import { Lost, SearchEmpty } from '@/components/illustrations';
import { StudyCard } from '@/components/study/StudyCard';
import { STUDY_DEGREES, STUDY_LANG_FILTERS, STUDY_STATES, STUDY_SUBJECTS, STUDY_WITHIN, type StudyCatalogue as Catalogue } from '@/lib/study';

registerCopy(pagesStudy);

const HERO = 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=2000&q=70';
const FILTER_KEYS = ['q', 'degree', 'subject', 'city', 'state', 'lang', 'free', 'within'] as const;

/** /study — the programme catalogue (server routes/study.ts): filters live in the URL, sorted by the next deadline. */
export default function StudyCatalogue() {
  const { t } = useTranslation();
  usePageTitle(t('study.hero.title'));
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [qInput, setQInput] = useState(params.get('q') ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  // Debounced free-text search.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if ((params.get('q') ?? '') !== qInput.trim()) set('q', qInput.trim() || null);
    }, 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  const query = Object.fromEntries(FILTER_KEYS.flatMap((k) => (params.get(k) ? [[k, params.get(k)!]] : [])));
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['study-programmes', query],
    queryFn: async () => (await api.get<Catalogue>('/study/programmes', { params: query })).data,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const active = FILTER_KEYS.filter((k) => k !== 'q' && params.get(k)).length;
  const catalogueEmpty = !!data && data.facets.degrees.length === 0;
  const reset = () => {
    setQInput('');
    setParams(new URLSearchParams(), { replace: true });
  };

  const select = (key: string, label: string, all: string, options: { value: string; label: string }[]) => (
    <div>
      <label className="label" htmlFor={`sf-${key}`}>
        {label}
      </label>
      <select id={`sf-${key}`} className="input" value={params.get(key) ?? ''} onChange={(e) => set(key, e.target.value || null)}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
  const count = (list: { value: string; count: number }[] | undefined, v: string) => {
    const n = list?.find((f) => f.value === v)?.count;
    return n ? ` (${n})` : '';
  };

  const filters = (
    <div className="grid gap-4">
      {select(
        'degree',
        t('study.filters.degree'),
        t('study.filters.anyDegree'),
        STUDY_DEGREES.map((d) => ({ value: d, label: `${t(`study.degree.${d}`)}${count(data?.facets.degrees, d)}` })),
      )}
      {select(
        'subject',
        t('study.filters.subject'),
        t('study.filters.anySubject'),
        STUDY_SUBJECTS.filter((s) => !data || data.facets.subjects.some((f) => f.value === s) || params.get('subject') === s).map((s) => ({
          value: s,
          label: `${t(`study.subject.${s}`)}${count(data?.facets.subjects, s)}`,
        })),
      )}
      {select(
        'state',
        t('study.filters.state'),
        t('study.filters.anyState'),
        Object.entries(STUDY_STATES)
          .filter(([code]) => !data || data.facets.states.some((f) => f.value === code) || params.get('state') === code)
          .map(([code, name]) => ({ value: code, label: `${name}${count(data?.facets.states, code)}` })),
      )}
      {select(
        'city',
        t('study.filters.city'),
        t('study.filters.anyCity'),
        [...(data?.facets.cities ?? []), ...(params.get('city') && !data?.facets.cities.some((c) => c.value === params.get('city')) ? [{ value: params.get('city')!, count: 0 }] : [])].map((c) => ({
          value: c.value,
          label: `${c.value}${c.count ? ` (${c.count})` : ''}`,
        })),
      )}
      {select(
        'lang',
        t('study.filters.language'),
        t('study.filters.anyLanguage'),
        STUDY_LANG_FILTERS.map((l) => ({ value: l, label: t(`study.filters.langOpts.${l}`) })),
      )}
      {select(
        'within',
        t('study.filters.within'),
        t('study.filters.anyTime'),
        STUDY_WITHIN.map((m) => ({ value: m, label: t(`study.filters.months.${m}`) })),
      )}
      <label className="flex min-h-11 items-center gap-2.5 text-sm font-semibold text-ink">
        <input type="checkbox" className="size-5 accent-brand-600" checked={params.get('free') === '1'} onChange={(e) => set('free', e.target.checked ? '1' : null)} />
        {t('study.filters.free')}
      </label>
      {active > 0 && (
        <button type="button" onClick={reset} className="inline-flex min-h-11 items-center gap-1.5 justify-self-start text-sm font-semibold text-link hover:text-link-hover">
          <X className="size-4" aria-hidden /> {t('study.filters.reset')}
        </button>
      )}
    </div>
  );

  return (
    <>
      <PageHero title={t('study.hero.title')} subtitle={t('study.hero.subtitle')} image={HERO}>
        <form
          className="mt-7 flex max-w-2xl items-center gap-2 rounded-2xl border border-line-strong/70 bg-card p-2 shadow-[var(--tv-shadow-raised)] focus-within:border-focus focus-within:ring-[3px] focus-within:ring-focus/20"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            set('q', qInput.trim() || null);
          }}
        >
          <Search className="ml-2 size-5 shrink-0 text-muted" aria-hidden />
          <label htmlFor="study-search" className="sr-only">
            {t('study.filters.search')}
          </label>
          <input
            id="study-search"
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={t('study.filters.searchPlaceholder')}
            className="min-h-11 min-w-0 flex-1 bg-transparent px-1 py-2.5 text-base text-ink outline-none placeholder:text-subtle"
          />
          <button type="submit" className={buttonClass({ className: 'h-11 shrink-0 px-4 sm:px-5' })}>
            {t('study.filters.search')}
          </button>
        </form>
      </PageHero>

      <section className="section-sm bg-sunken">
        <div className="container-x grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
          <aside className="hidden lg:block">
            <div className="card sticky top-28 rounded-3xl p-5">
              <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
                <SlidersHorizontal className="size-4 text-muted" aria-hidden /> {t('study.filters.title')}
              </p>
              {filters}
            </div>
          </aside>

          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
                {data ? `${t('study.filters.results', { count: data.total })} · ${t('study.filters.sorted')}` : ' '}
                {isFetching && !isLoading && <Spinner className="size-3.5 text-primary" />}
              </p>
              <button type="button" className={buttonClass({ variant: 'secondary', className: 'lg:hidden' })} onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
                <SlidersHorizontal className="size-3.5" aria-hidden /> {t('study.filters.show')}
                {active > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-contrast">{active}</span>}
              </button>
            </div>

            {filtersOpen && <div className="card mb-5 rounded-3xl p-5 lg:hidden">{filters}</div>}

            {isLoading ? (
              <SkeletonGrid count={6} lines={3} footer className="grid-cards cards-balanced grid-cols-1 [--cols:1] md:[--cols:2] 2xl:[--cols:3]" />
            ) : isError ? (
              <div className="card rounded-3xl">
                <EmptyState
                  illustration={<Lost />}
                  text={t('study.apply.errors.generic')}
                  action={
                    <Button variant="outline" onClick={() => refetch()}>
                      {t('study.filters.reset')}
                    </Button>
                  }
                />
              </div>
            ) : catalogueEmpty ? (
              <div className="card rounded-3xl">
                <EmptyState
                  size="lg"
                  icon={GraduationCap}
                  title={t('study.empty.title')}
                  text={t('study.empty.text')}
                  action={
                    <>
                      <Link to="/booking" className={buttonClass()}>
                        {t('study.empty.cta')}
                      </Link>
                      {user && hasMinRole(user.role, 'STAFF') && (
                        <Link to="/admin/study" className={buttonClass({ variant: 'outline' })}>
                          {t('study.empty.staff')}
                        </Link>
                      )}
                    </>
                  }
                />
              </div>
            ) : !data?.items.length ? (
              <div className="card rounded-3xl">
                <EmptyState
                  illustration={<SearchEmpty />}
                  title={t('study.noResults')}
                  action={
                    <Button variant="outline" onClick={reset}>
                      {t('study.filters.reset')}
                    </Button>
                  }
                />
              </div>
            ) : (
              <ul className={clsx('grid-cards cards-balanced grid-cols-1 [--cols:1] md:[--cols:2] 2xl:[--cols:3]', isFetching && 'opacity-70 transition-opacity')}>
                {data.items.map((p) => (
                  <li key={p.slug}>
                    <StudyCard p={p} />
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              <Link to="/ausbildung" className="card flex min-h-14 items-center justify-between gap-3 rounded-2xl px-5 py-4 font-semibold text-ink hover:border-line-strong">
                {t('study.links.ausbildung')} <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />
              </Link>
              <Link to="/anerkennung" className="card flex min-h-14 items-center justify-between gap-3 rounded-2xl px-5 py-4 font-semibold text-ink hover:border-line-strong">
                {t('study.links.recognition')} <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
