import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowRight, ArrowUp, CornerDownLeft, History, Search, Sparkles, X } from 'lucide-react';
import clsx from 'clsx';
import { Spinner } from '@/components/ui/Spinner';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesDiscover } from '@/i18n/pagesDiscover';
import { localePath, navigateToUrl } from '@/lib/localeRouter';
import { closeSearch } from './searchStore';
import { MIN_QUERY, Marked, TYPE_ICON, fetchSearch, groupHits, logSearch, readRecent, rememberSearch, writeRecent, type SearchHit } from './siteSearch';

registerCopy(pagesDiscover);

// The search palette dialog: its own chunk, downloaded the first time search is opened (SearchPalette.tsx).
// Results come from the server index (GET /api/search: guides, visas, services, FAQ, news, jobs, events, tools)
// in the site language, with typo tolerance and cross-language synonyms; this file only renders them.

type Item = { kind: 'hit'; hit: SearchHit } | { kind: 'recent'; query: string } | { kind: 'term'; query: string } | { kind: 'all' };

const PER_GROUP = 4;
/** A query counts as "settled" (logged for the anonymous statistics) after this pause in typing. */
const SETTLE_MS = 1500;

const PaletteDialog = () => {
  const { t } = useTranslation();
  const lng = currentSiteLocale();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Lock body scroll, focus input, restore focus on close.
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.setAttribute('data-search-palette-open', '');
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = prevOverflow;
      document.documentElement.removeAttribute('data-search-palette-open');
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 180);
    return () => window.clearTimeout(id);
  }, [query]);

  const enabled = debounced.length >= MIN_QUERY;
  const { data, isFetching, isError } = useQuery({
    queryKey: ['site-search', lng, debounced],
    queryFn: ({ signal }) => fetchSearch(debounced, lng, { limit: 30, signal }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });
  const hits = enabled && data?.q === debounced ? data.items : enabled ? (data?.items ?? []) : [];

  // Log the query once the visitor stopped typing for a moment.
  useEffect(() => {
    if (!enabled || !data || data.q !== debounced) return;
    const id = window.setTimeout(() => logSearch(debounced, lng), SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [enabled, data, debounced, lng]);

  const popular = t('discover.search.popularTerms', { returnObjects: true }) as unknown;
  const terms = Array.isArray(popular) ? (popular as string[]) : [];

  type Section = { key: string; heading: string; items: Item[]; clear?: boolean };
  const sections = useMemo((): Section[] => {
    if (!enabled) {
      const s: Section[] = [];
      if (recent.length) s.push({ key: 'recent', heading: t('search.recent'), items: recent.map((q) => ({ kind: 'recent', query: q })), clear: true });
      if (terms.length) s.push({ key: 'popular', heading: t('discover.search.popular'), items: terms.map((q) => ({ kind: 'term', query: q })) });
      return s;
    }
    const groups: Section[] = groupHits(hits, PER_GROUP).map((g) => ({ key: g.type, heading: t(`discover.search.groups.${g.type}`), items: g.items.map((hit): Item => ({ kind: 'hit', hit })) }));
    if (hits.length) groups.push({ key: 'all', heading: '', items: [{ kind: 'all' }] });
    return groups;
  }, [enabled, hits, recent, terms, t]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => setActive(0), [debounced]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const openResultsPage = () => {
    const q = query.trim();
    if (q.length < MIN_QUERY) return;
    setRecent(rememberSearch(q));
    closeSearch();
    navigateToUrl(`${localePath('/search', lng)}?q=${encodeURIComponent(q)}`);
  };

  const choose = (item: Item | undefined) => {
    if (!item) return openResultsPage();
    if (item.kind === 'recent' || item.kind === 'term') {
      setQuery(item.query);
      inputRef.current?.focus();
      return;
    }
    if (item.kind === 'all') return openResultsPage();
    logSearch(query, lng);
    setRecent(rememberSearch(query));
    closeSearch();
    navigateToUrl(item.hit.url);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flat.length) setActive((a) => (a + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length) setActive((a) => (a - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(flat[active]);
    } else if (e.key === 'Tab') {
      e.preventDefault(); // keep focus inside the dialog
      inputRef.current?.focus();
    }
  };

  const waiting = enabled && (isFetching || data?.q !== debounced) && !hits.length;
  const noResults = enabled && !isFetching && !isError && data?.q === debounced && hits.length === 0;
  let idx = -1;

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-start justify-center sm:px-4 sm:pt-[10vh]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onKeyDown={onKeyDown}
      data-lenis-prevent
    >
      <div className="absolute inset-0 bg-scrim" onClick={closeSearch} aria-hidden />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={t('search.button')}
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-[0_40px_120px_-30px_rgba(5,15,36,0.7)] sm:h-auto sm:max-h-[min(640px,80vh)] sm:max-w-[640px] sm:rounded-2xl sm:border sm:border-line"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-line px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:py-3">
          {isFetching && enabled ? <Spinner className="size-5 shrink-0 border-2 text-brand-600" /> : <Search className="size-5 shrink-0 text-brand-600" aria-hidden />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('discover.search.label')}
            className="h-10 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted/70"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-autocomplete="list"
            aria-activedescendant={flat.length ? `search-opt-${active}` : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            maxLength={200}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-navy-900"
              aria-label={t('search.clearRecent')}
            >
              <X className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={closeSearch}
            className="shrink-0 rounded-md border border-line px-2 py-1 text-xs font-semibold text-muted hover:bg-surface hover:text-navy-900"
          >
            <span className="sm:hidden">{t('search.close')}</span>
            <span className="hidden sm:inline">Esc</span>
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} id="search-results" role="listbox" aria-label={t('discover.search.label')} data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:max-h-[460px]">
          <p className="sr-only" aria-live="polite">
            {enabled && data?.q === debounced ? t('discover.search.resultsFor', { query: debounced, count: data.total }) : ''}
          </p>

          {waiting && (
            <p className="flex items-center gap-2 px-3 py-3 text-xs text-muted">
              <Spinner className="size-3.5 border-[1.5px]" />
              {t('discover.search.searching')}
            </p>
          )}

          {isError && enabled && !hits.length && <p className="px-4 py-8 text-center text-sm text-muted">{t('discover.search.offline')}</p>}

          {noResults ? (
            <div className="px-4 py-10 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface text-muted">
                <Search className="size-6" aria-hidden />
              </span>
              <p className="mt-4 font-semibold break-words text-navy-900">{t('discover.search.noResults', { query: debounced })}</p>
              <p className="mt-1 text-sm text-muted">{t('discover.search.noResultsHint')}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {terms.slice(0, 5).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuery(q)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-navy-900 hover:border-brand-400 hover:bg-brand-50"
                  >
                    <Sparkles className="size-3.5 text-brand-600" aria-hidden />
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            sections.map((sec) => (
              <Fragment key={sec.key}>
                {sec.heading && (
                  <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
                    <p className="text-[11px] font-bold tracking-[0.14em] text-muted uppercase">{sec.heading}</p>
                    {sec.clear && (
                      <button
                        type="button"
                        onClick={() => {
                          setRecent([]);
                          writeRecent([]);
                          inputRef.current?.focus();
                        }}
                        className="text-[11px] font-semibold text-brand-600 hover:underline"
                      >
                        {t('search.clearRecent')}
                      </button>
                    )}
                  </div>
                )}
                {sec.items.map((item) => {
                  idx += 1;
                  const i = idx;
                  const isActive = i === active;
                  const key = item.kind === 'hit' ? item.hit.id : item.kind === 'all' ? 'all' : `${item.kind}-${item.query}`;
                  const Icon = item.kind === 'hit' ? TYPE_ICON[item.hit.type] : item.kind === 'recent' ? History : item.kind === 'term' ? Sparkles : ArrowRight;
                  return (
                    <button
                      key={key}
                      id={`search-opt-${i}`}
                      data-idx={i}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      tabIndex={-1}
                      onMouseMove={() => active !== i && setActive(i)}
                      onClick={() => choose(item)}
                      className={clsx(
                        'flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                        isActive ? 'bg-brand-50' : 'hover:bg-surface',
                        item.kind === 'all' && 'mt-1 border-t border-line',
                      )}
                    >
                      <span
                        className={clsx(
                          'grid size-9 shrink-0 place-items-center rounded-lg transition-colors',
                          item.kind === 'hit' && isActive ? 'bg-brand-600 text-white' : item.kind === 'hit' ? 'bg-surface text-navy-900' : 'bg-surface text-muted',
                        )}
                        aria-hidden
                      >
                        <Icon className="size-4" />
                      </span>
                      {item.kind === 'hit' ? (
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-semibold text-navy-900">
                              <Marked text={item.hit.title} ranges={item.hit.titleHighlights} />
                            </span>
                            {item.hit.meta && <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">{item.hit.meta}</span>}
                          </span>
                          {item.hit.snippet && (
                            <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted">
                              <Marked text={item.hit.snippet} ranges={item.hit.highlights} />
                            </span>
                          )}
                        </span>
                      ) : item.kind === 'all' ? (
                        <span className="min-w-0 flex-1 text-sm font-semibold text-brand-700">
                          {t('discover.search.seeAll')} <span className="text-muted tabular-nums">({data?.total ?? hits.length})</span>
                        </span>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-navy-900">{item.query}</span>
                      )}
                      <CornerDownLeft className={clsx('size-4 shrink-0 text-brand-600 transition-opacity', isActive ? 'opacity-100' : 'opacity-0')} aria-hidden />
                    </button>
                  );
                })}
              </Fragment>
            ))
          )}
        </div>

        {/* Footer hints (desktop) */}
        <div className="hidden items-center gap-4 border-t border-line bg-surface px-4 py-2.5 text-[11px] text-muted sm:flex">
          <span className="inline-flex items-center gap-1.5">
            <kbd className="grid size-5 place-items-center rounded border border-line bg-white">
              <ArrowUp className="size-3" />
            </kbd>
            <kbd className="grid size-5 place-items-center rounded border border-line bg-white">
              <ArrowDown className="size-3" />
            </kbd>
            {t('search.hints.navigate')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <kbd className="grid size-5 place-items-center rounded border border-line bg-white">
              <CornerDownLeft className="size-3" />
            </kbd>
            {t('search.hints.select')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <kbd className="rounded border border-line bg-white px-1 font-sans leading-5">Esc</kbd>
            {t('search.hints.close')}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PaletteDialog;
