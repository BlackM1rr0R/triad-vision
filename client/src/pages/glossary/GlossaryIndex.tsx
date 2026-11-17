import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesGlossary } from '@/i18n/pagesGlossary';
import { PageHero, PageHeroSkeleton } from '@/components/layout/PageHero';
import { Documents } from '@/components/illustrations';
import { PageCta } from '@/components/visa/PageCta';
import { useWorldLang } from '@/components/world/locale';
import { GLOSSARY_CATEGORIES, letterOf, searchGlossary, type GlossaryCategory, type GlossaryListItem, type GlossaryListResponse } from '@/lib/glossary';

registerCopy(pagesGlossary);

const isCategory = (v: string | null): v is GlossaryCategory => !!v && (GLOSSARY_CATEGORIES as readonly string[]).includes(v);

export const useGlossaryList = () => {
  const lng = useWorldLang();
  return useQuery({
    queryKey: ['glossary', lng],
    queryFn: async () => (await api.get<GlossaryListResponse>('/glossary', { params: { lng } })).data,
    staleTime: 60 * 60_000,
  });
};

const TermCard = ({ item }: { item: GlossaryListItem }) => {
  const { t } = useTranslation();
  return (
    <li>
      <Link
        to={`/glossary/${item.slug}`}
        className="group flex h-full flex-col rounded-2xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)] transition hover:border-line-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus/30"
      >
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span lang="de" className="font-display text-lg font-semibold text-ink group-hover:text-link">
            {item.article && <span className="mr-1 text-base font-normal text-muted">{item.article}</span>}
            {item.term}
            {item.pluralOnly && <span className="ml-1 text-sm font-normal text-muted">(Pl.)</span>}
          </span>
          <span lang="de" className="text-xs text-subtle">
            [{item.pron}]
          </span>
        </span>
        <span className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{item.short}</span>
        <span className="mt-3 self-start rounded-full bg-sunken px-2 py-0.5 text-xs font-semibold text-muted">{t(`glossary.categories.${item.category}`)}</span>
      </Link>
    </li>
  );
};

/** /glossary — every German bureaucracy term: search (term, aliases, definition), category filter, A–Z. */
export default function GlossaryIndex() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const cat = isCategory(params.get('cat')) ? (params.get('cat') as GlossaryCategory) : null;
  const { data, isLoading, isError } = useGlossaryList();
  usePageTitle(t('glossary.heroTitle'));

  const setParam = (key: 'q' | 'cat', value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const items = useMemo(() => {
    const all = data?.items ?? [];
    return searchGlossary(cat ? all.filter((i) => i.category === cat) : all, q);
  }, [data, cat, q]);
  const searching = q.trim().length > 0;
  // A–Z groups (search results keep their relevance order in one list).
  const groups = useMemo(() => {
    const map = new Map<string, GlossaryListItem[]>();
    for (const i of items) {
      const l = letterOf(i.term);
      map.set(l, [...(map.get(l) ?? []), i]);
    }
    return [...map.entries()];
  }, [items]);

  if (isLoading) return <PageHeroSkeleton />;

  const chip = (key: GlossaryCategory | null, label: string, count?: number) => {
    const active = cat === key;
    return (
      <button
        key={key ?? 'all'}
        type="button"
        aria-pressed={active}
        onClick={() => setParam('cat', key)}
        className={clsx(
          'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition',
          active ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong',
        )}
      >
        {label}
        {count != null && <span className={clsx('text-xs', active ? 'opacity-80' : 'text-muted')}>{count}</span>}
      </button>
    );
  };

  return (
    <>
      <PageHero title={t('glossary.heroTitle')} subtitle={t('glossary.heroSubtitle')} illustration={<Documents className="w-full" />} crumb={{ to: '/tools', label: t('siteNav.tools') }}>
        <form
          className="mt-7 flex max-w-2xl items-center gap-2 rounded-2xl border border-line-strong/70 bg-card p-2 shadow-[var(--tv-shadow-raised)] focus-within:border-focus focus-within:ring-[3px] focus-within:ring-focus/20"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setParam('q', q.trim() || null);
          }}
        >
          <Search className="ml-2 size-5 shrink-0 text-muted" aria-hidden />
          <label htmlFor="glossary-search" className="sr-only">
            {t('glossary.search')}
          </label>
          <input
            id="glossary-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => setParam('q', q.trim() || null)}
            placeholder={t('glossary.searchPlaceholder')}
            autoComplete="off"
            className="min-h-11 min-w-0 flex-1 bg-transparent px-1 py-2.5 text-base text-ink outline-none placeholder:text-subtle"
          />
          {searching && (
            <button
              type="button"
              onClick={() => {
                setQ('');
                setParam('q', null);
              }}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:text-ink"
              aria-label={t('glossary.clear')}
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </form>
      </PageHero>

      <section className="section-sm bg-sunken">
        <div className="container-x">
          <div role="group" aria-label={t('glossary.categoryFilter')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
            {chip(null, t('glossary.all'), data?.items.length)}
            {(data?.categories ?? []).map((c) => chip(c.key, t(`glossary.categories.${c.key}`), c.count))}
          </div>

          {!searching && groups.length > 1 && (
            <nav aria-label={t('glossary.letters')} className="mt-4">
              <ul className="flex flex-wrap gap-1">
                {groups.map(([l]) => (
                  <li key={l}>
                    <a href={`#letter-${l}`} className="inline-flex size-11 items-center justify-center rounded-xl border border-line bg-card font-semibold text-ink hover:border-line-strong">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <p className="mt-5 text-sm text-muted" aria-live="polite">
            {t('glossary.results', { count: items.length })}
          </p>

          {isError ? (
            <p className="mt-6 text-ink">{t('glossary.empty')}</p>
          ) : items.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-line bg-card p-6 text-ink">{t('glossary.empty')}</p>
          ) : searching ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((i) => (
                <TermCard key={i.slug} item={i} />
              ))}
            </ul>
          ) : (
            groups.map(([l, list]) => (
              <section key={l} id={`letter-${l}`} aria-labelledby={`letter-h-${l}`} className="mt-8 scroll-mt-28">
                <h2 id={`letter-h-${l}`} className="font-display text-2xl font-semibold text-ink">
                  {l}
                </h2>
                {/* content-visibility: letters below the screen skip style / layout / paint until scrolled near
                    (200 cards in the server markup); still found by in-page search, the heading stays the anchor. The
                    padding (cancelled by the negative margins) keeps card shadows and focus rings clear of the paint clip. */}
                <ul className="-mx-3 mt-3 -mb-5 grid gap-3 px-3 pb-5 [contain-intrinsic-size:auto_40rem] [content-visibility:auto] sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((i) => (
                    <TermCard key={i.slug} item={i} />
                  ))}
                </ul>
              </section>
            ))
          )}

          {data && (
            <p className="mt-10 max-w-3xl text-xs leading-relaxed text-muted">
              {t('glossary.asOf', { date: data.asOf })}. {t('glossary.disclaimer')}
            </p>
          )}
        </div>
      </section>
      <PageCta title={t('glossary.ctaTitle')} text={t('glossary.ctaText')} primary={{ to: '/booking', label: t('siteNav.book') }} secondary={{ to: '/guides', label: t('glossary.guides') }} />
    </>
  );
}

