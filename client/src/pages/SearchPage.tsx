import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { Spinner } from '@/components/ui/Spinner';
import { PathLink } from '@/components/guides/shared';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesDiscover } from '@/i18n/pagesDiscover';
import { usePageTitle } from '@/lib/usePageTitle';
import { MIN_QUERY, Marked, SEARCH_TYPES, TYPE_ICON, fetchSearch, groupHits, logSearch, rememberSearch, type SearchType } from '@/components/search/siteSearch';

registerCopy(pagesDiscover);

const HERO = 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=2000&q=70';

/** /search?q=… — full results of the site search, grouped by type (noindex: robots meta from the SEO catalogue). */
export default function SearchPage() {
  const { t } = useTranslation();
  usePageTitle(t('discover.search.pageTitle'));
  const id = useId();
  const lng = currentSiteLocale();
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim().slice(0, 200);
  const [input, setInput] = useState(q);
  const [type, setType] = useState<SearchType | 'all'>('all');
  useEffect(() => setInput(q), [q]);
  useEffect(() => setType('all'), [q]);

  const enabled = q.length >= MIN_QUERY;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['site-search-page', lng, q],
    queryFn: ({ signal }) => fetchSearch(q, lng, { limit: 60, signal }),
    enabled,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (enabled && data) {
      logSearch(q, lng);
      rememberSearch(q);
    }
  }, [enabled, data, q, lng]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    setParams(v ? { q: v } : {}, { replace: false });
  };

  const items = data?.items ?? [];
  const counts = Object.fromEntries(SEARCH_TYPES.map((x) => [x, items.filter((h) => h.type === x).length])) as Record<SearchType, number>;
  const shown = type === 'all' ? items : items.filter((h) => h.type === type);
  const groups = groupHits(shown);
  const popular = t('discover.search.popularTerms', { returnObjects: true }) as unknown;
  const terms = Array.isArray(popular) ? (popular as string[]) : [];

  return (
    <>
      <PageHero title={t('discover.search.pageTitle')} subtitle={t('discover.search.pageSubtitle')} image={HERO}>
        <form role="search" onSubmit={submit} className="mt-6 flex max-w-2xl gap-2">
          <label htmlFor={`${id}-q`} className="sr-only">
            {t('discover.search.label')}
          </label>
          <input
            id={`${id}-q`}
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('search.placeholder')}
            maxLength={200}
            className="input h-12 min-w-0 flex-1 text-base"
            autoComplete="off"
          />
          <button type="submit" className="btn-primary h-12 shrink-0 px-5">
            <Search className="size-4" aria-hidden /> <span className="hidden sm:inline">{t('discover.search.submit')}</span>
          </button>
        </form>
      </PageHero>

      <section className="section-sm bg-surface">
        <div className="container-x max-w-4xl">
          {!enabled ? (
            <div className="card card-pad text-center">
              <p className="text-sm text-muted">{t('discover.search.empty')}</p>
              <TermChips terms={terms} heading={t('discover.search.popular')} />
            </div>
          ) : isLoading ? (
            <div className="grid min-h-[30vh] place-items-center">
              <Spinner className="size-8 text-brand-600" />
            </div>
          ) : isError ? (
            <div className="card card-pad text-center">
              <p className="text-sm text-muted">{t('discover.search.offline')}</p>
              <button type="button" className="btn-ghost btn-sm mt-4" onClick={() => refetch()}>
                {t('discover.compare.retry')}
              </button>
            </div>
          ) : !items.length ? (
            <div className="card card-pad text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface text-muted">
                <Search className="size-6" aria-hidden />
              </span>
              <h2 className="mt-4 font-display text-lg font-bold break-words text-navy-900">{t('discover.search.noResults', { query: q })}</h2>
              <p className="mt-1 text-sm text-muted">{t('discover.search.noResultsHint')}</p>
              <TermChips terms={terms} heading={t('discover.search.popular')} />
              <Link to="/contact" className="btn-primary btn-sm mt-6">
                {t('discover.search.contact')}
              </Link>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted" aria-live="polite">
                {t('discover.search.resultsFor', { query: q, count: items.length })}
              </p>
              <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label={t('discover.search.filter')}>
                {(['all', ...SEARCH_TYPES.filter((x) => counts[x])] as (SearchType | 'all')[]).map((x) => (
                  <button
                    key={x}
                    type="button"
                    aria-pressed={type === x}
                    onClick={() => setType(x)}
                    className={clsx(
                      'rounded-full border px-3.5 py-1.5 text-sm font-semibold transition',
                      type === x ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-navy-900 hover:border-brand-400',
                    )}
                  >
                    {x === 'all' ? t('discover.search.all') : t(`discover.search.groups.${x}`)} <span className="opacity-60 tabular-nums">{x === 'all' ? items.length : counts[x]}</span>
                  </button>
                ))}
              </div>
              <div className="space-y-8">
                {groups.map((g) => {
                  const Icon = TYPE_ICON[g.type];
                  return (
                    <section key={g.type} aria-labelledby={`${id}-${g.type}`}>
                      <h2 id={`${id}-${g.type}`} className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-muted uppercase">
                        <Icon className="size-4 text-brand-600" aria-hidden /> {t(`discover.search.groups.${g.type}`)}
                      </h2>
                      <ul className="space-y-3">
                        {g.items.map((h) => (
                          <li key={h.id}>
                            <PathLink path={h.url} className="group card block p-4 transition hover:border-brand-400/60 sm:p-5">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-display text-base font-bold text-navy-900 group-hover:text-brand-700">
                                  <Marked text={h.title} ranges={h.titleHighlights} />
                                </span>
                                {h.meta && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">{h.meta}</span>}
                              </span>
                              {h.snippet && (
                                <span className="mt-1.5 block text-sm leading-relaxed text-muted">
                                  <Marked text={h.snippet} ranges={h.highlights} />
                                </span>
                              )}
                              <span className="mt-2 block truncate text-xs text-brand-700/80">{h.url}</span>
                            </PathLink>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}

const TermChips = ({ terms, heading }: { terms: string[]; heading: string }) => {
  if (!terms.length) return null;
  return (
    <div className="mt-6">
      <p className="text-xs font-bold tracking-[0.14em] text-muted uppercase">{heading}</p>
      <ul className="mt-3 flex flex-wrap justify-center gap-2">
        {terms.map((term) => (
          <li key={term}>
            <Link
              to={{ search: `?q=${encodeURIComponent(term)}` }}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-navy-900 hover:border-brand-400 hover:bg-brand-50"
            >
              <Sparkles className="size-3.5 text-brand-600" aria-hidden /> {term}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};
