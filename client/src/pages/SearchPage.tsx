import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { SearchEmpty } from '@/components/illustrations';
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
            className="input h-12 min-w-0 flex-1 text-base shadow-[var(--tv-shadow-card)]"
            autoComplete="off"
          />
          <button type="submit" className="btn-primary h-12 shrink-0 px-5">
            <Search className="size-4" aria-hidden /> <span className="hidden sm:inline">{t('discover.search.submit')}</span>
          </button>
        </form>
      </PageHero>

      <section className="section-sm">
        <div className="container-x max-w-4xl">
          {!enabled ? (
            <div className="card card-pad rounded-3xl text-center">
              <p className="text-sm text-muted">{t('discover.search.empty')}</p>
              <TermChips terms={terms} heading={t('discover.search.popular')} />
            </div>
          ) : isLoading ? (
            <div className="grid min-h-[30vh] place-items-center">
              <Spinner className="size-8 text-muted" />
            </div>
          ) : isError ? (
            <div className="card card-pad rounded-3xl text-center">
              <p className="text-sm text-muted">{t('discover.search.offline')}</p>
              <button type="button" className="btn-secondary mt-4" onClick={() => refetch()}>
                {t('discover.compare.retry')}
              </button>
            </div>
          ) : !items.length ? (
            <div className="card card-pad rounded-3xl py-10 text-center sm:py-12">
              <SearchEmpty className="mx-auto w-36 sm:w-44" />
              <h2 className="mt-5 font-display text-xl font-semibold break-words text-ink">{t('discover.search.noResults', { query: q })}</h2>
              <p className="mt-1 text-sm text-muted">{t('discover.search.noResultsHint')}</p>
              <TermChips terms={terms} heading={t('discover.search.popular')} />
              <Link to="/contact" className="btn-primary mt-6">
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
                      'inline-flex min-h-11 items-center gap-1 rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                      type === x ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong',
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
                        <Icon className="size-4" aria-hidden /> {t(`discover.search.groups.${g.type}`)}
                      </h2>
                      <ul className="space-y-3">
                        {g.items.map((h) => (
                          <li key={h.id}>
                            <PathLink path={h.url} className="group card card-interactive block p-4 sm:p-5">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-display text-base font-semibold text-ink group-hover:underline">
                                  <Marked text={h.title} ranges={h.titleHighlights} />
                                </span>
                                {h.meta && <span className="rounded-md bg-sunken px-1.5 py-0.5 text-[11px] font-bold text-ink">{h.meta}</span>}
                              </span>
                              {h.snippet && (
                                <span className="mt-1.5 block text-sm leading-relaxed text-muted">
                                  <Marked text={h.snippet} ranges={h.highlights} />
                                </span>
                              )}
                              <span className="mt-2 block truncate text-xs text-muted">{h.url}</span>
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
      <p className="type-overline text-muted">{heading}</p>
      <ul className="mt-3 flex flex-wrap justify-center gap-2">
        {terms.map((term) => (
          <li key={term}>
            <Link
              to={{ search: `?q=${encodeURIComponent(term)}` }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-line-strong hover:bg-sunken"
            >
              <Sparkles className="size-3.5 text-highlight-fg" aria-hidden /> {term}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};
