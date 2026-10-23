import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowUp, CornerDownLeft, History, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { useSiteContent } from '@/lib/content';
import { useL10n } from '@/lib/l10n';
import type { L10n, L10nList } from '@/lib/types';
import { isSubsequence, matchRanges, normalize, snippet, tokenize } from './searchUtils';

// ─── Tiny open/close store (module-level, no extra deps) ────────────────────

let isOpen = false;
const listeners = new Set<() => void>();
const setOpenState = (v: boolean) => {
  if (isOpen === v) return;
  isOpen = v;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const openSearch = () => setOpenState(true);
export const closeSearch = () => setOpenState(false);
export const toggleSearch = () => setOpenState(!isOpen);

/** Reactive access to the search palette's open state. */
export const useSearchPalette = () => {
  const open = useSyncExternalStore(subscribe, () => isOpen, () => false);
  return { open, openSearch, closeSearch, toggleSearch };
};

// ─── Index ──────────────────────────────────────────────────────────────

type Group = 'pages' | 'visas' | 'services' | 'faq' | 'news';
const GROUPS: Group[] = ['pages', 'visas', 'services', 'faq', 'news'];
const GROUP_LIMIT: Record<Group, number> = { pages: 5, visas: 5, services: 4, faq: 5, news: 4 };
const GROUP_BOOST: Record<Group, number> = { pages: 3, visas: 4, services: 2, faq: 1, news: 0 };
const GROUP_ICON: Record<Group, string> = { pages: 'FileText', visas: 'Stamp', services: 'BriefcaseBusiness', faq: 'CircleHelp', news: 'Newspaper' };

interface Entry {
  id: string;
  group: Group;
  title: string;
  body: string;
  to: string;
  icon: string;
  meta?: string;
  nTitle: string;
  nBody: string;
}

type Item =
  | { kind: 'entry'; entry: Entry; tokens: string[] }
  | { kind: 'recent'; query: string };

const STATIC_PAGES: { key: string; path: string; icon: string; label?: string }[] = [
  { key: 'home', path: '/', icon: 'House' },
  { key: 'eligibility', path: '/eligibility', icon: 'Sparkles', label: 'quiz.navLabel' },
  { key: 'visas', path: '/visas', icon: 'Stamp' },
  { key: 'services', path: '/services', icon: 'BriefcaseBusiness' },
  { key: 'about', path: '/about', icon: 'Building2' },
  { key: 'partners', path: '/partners', icon: 'Handshake' },
  { key: 'stories', path: '/stories', icon: 'Star' },
  { key: 'ausbildung', path: '/ausbildung', icon: 'GraduationCap' },
  { key: 'faq', path: '/faq', icon: 'CircleHelp' },
  { key: 'news', path: '/news', icon: 'Newspaper' },
  { key: 'contact', path: '/contact', icon: 'Phone' },
  { key: 'cooperation', path: '/cooperation', icon: 'Building' },
  { key: 'login', path: '/login', icon: 'LogIn' },
  { key: 'register', path: '/register', icon: 'UserPlus', label: 'nav.apply' },
];

interface PublicService {
  slug: string;
  title: L10n | string;
  summary?: L10n | string | null;
  icon?: string | null;
}

const fetchServices = async (): Promise<PublicService[]> => {
  try {
    const { data } = await api.get<unknown>('/public/services');
    const list = Array.isArray(data)
      ? data
      : data && typeof data === 'object'
        ? ((data as { items?: unknown; services?: unknown }).items ?? (data as { services?: unknown }).services)
        : null;
    return Array.isArray(list) ? (list as PublicService[]).filter((s) => s && typeof s.slug === 'string') : [];
  } catch {
    return []; // endpoint missing (404) or offline — services are simply not searchable
  }
};

// ─── Recent searches ────────────────────────────────────────────────────

const RECENT_KEY = 'tv_search_recent';
const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
};
const writeRecent = (list: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
};

// ─── Highlight ──────────────────────────────────────────────────────────

const Highlight = ({ text, tokens }: { text: string; tokens: string[] }) => {
  const ranges = matchRanges(text, tokens);
  if (!ranges.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let pos = 0;
  ranges.forEach(([s, e], i) => {
    if (s > pos) out.push(text.slice(pos, s));
    out.push(
      <mark key={i} className="rounded-sm bg-brand-100 px-0.5 text-brand-700">
        {text.slice(s, e)}
      </mark>,
    );
    pos = e;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return <>{out}</>;
};

const isTypingTarget = (el: EventTarget | null) => {
  const n = el as HTMLElement | null;
  return !!n && (n.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(n.tagName));
};

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

// ─── Button ─────────────────────────────────────────────────────────────

/** Header search button. `light` = white icon for dark/transparent backgrounds, otherwise navy. */
export const SearchButton = ({ light = false, className }: { light?: boolean; className?: string }) => {
  const { t } = useTranslation();
  const hint = isMac() ? '⌘ K' : t('search.shortcutHint');
  return (
    <button
      type="button"
      onClick={openSearch}
      aria-label={t('search.button')}
      title={`${t('search.button')} (${hint})`}
      className={clsx(
        'inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded-full transition-colors duration-300 lg:px-3',
        light ? 'text-white hover:bg-white/10' : 'text-navy-900 hover:bg-brand-50',
        className,
      )}
    >
      <Search className="size-5" />
      <kbd
        className={clsx(
          'hidden rounded-md border px-1.5 py-0.5 font-sans text-[11px] leading-none font-semibold whitespace-nowrap lg:inline-block',
          light ? 'border-white/25 text-white/75' : 'border-line text-muted',
        )}
      >
        {hint}
      </kbd>
    </button>
  );
};

// ─── Palette ────────────────────────────────────────────────────────────

/** Site-wide command palette. Mount once (e.g. in the site layout); open with Ctrl/Cmd+K, "/", or `openSearch()`. */
export const SearchPalette = () => {
  const { open } = useSearchPalette();

  // Global shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleSearch();
      } else if (e.key === '/' && !isOpen && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(<AnimatePresence>{open && <PaletteDialog key="search-palette" />}</AnimatePresence>, document.body);
};

const PaletteDialog = () => {
  const { t } = useTranslation();
  const { tr, trList, locale } = useL10n();
  const navigate = useNavigate();
  const { data, isLoading } = useSiteContent();
  const services = useQuery({ queryKey: ['public-services'], queryFn: fetchServices, staleTime: 10 * 60 * 1000, retry: false });

  const [query, setQuery] = useState('');
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

  // Build the index (re-built when language or content changes).
  const index = useMemo<Entry[]>(() => {
    const entries: Omit<Entry, 'nTitle' | 'nBody'>[] = [];
    for (const p of STATIC_PAGES) {
      entries.push({
        id: `page-${p.key}`,
        group: 'pages',
        title: t(p.label ?? `nav.${p.key}`),
        body: t(`search.pages.${p.key}`),
        to: p.path,
        icon: p.icon,
      });
    }
    for (const v of data?.visaCategories ?? []) {
      entries.push({
        id: `visa-${v.slug}`,
        group: 'visas',
        title: tr(v.title),
        body: [tr(v.summary), ...trList(v.items as L10nList)].join(' · '),
        to: `/visas/${v.slug}`,
        icon: v.icon || GROUP_ICON.visas,
        meta: v.visaLabel,
      });
    }
    for (const s of services.data ?? []) {
      const title = typeof s.title === 'string' ? s.title : tr(s.title);
      if (!title) continue;
      const summary = s.summary ? (typeof s.summary === 'string' ? s.summary : tr(s.summary)) : '';
      entries.push({ id: `svc-${s.slug}`, group: 'services', title, body: summary, to: `/services/${s.slug}`, icon: s.icon || GROUP_ICON.services });
    }
    for (const f of data?.faqs ?? []) {
      entries.push({ id: `faq-${f.id}`, group: 'faq', title: tr(f.question), body: tr(f.answer), to: '/faq', icon: GROUP_ICON.faq });
    }
    for (const p of data?.posts ?? []) {
      entries.push({ id: `news-${p.slug}`, group: 'news', title: tr(p.title), body: tr(p.excerpt), to: `/news/${p.slug}`, icon: GROUP_ICON.news });
    }
    return entries.map((e) => ({ ...e, nTitle: normalize(e.title), nBody: normalize(e.body) }));
  }, [data, services.data, locale, t]); // tr/trList are derived from locale

  const tokens = useMemo(() => tokenize(query), [query]);

  const grouped = useMemo(() => {
    const result: Record<Group, Entry[]> = { pages: [], visas: [], services: [], faq: [], news: [] };
    if (!tokens.length) return result;
    const full = tokens.join(' ');
    const scored: { e: Entry; s: number }[] = [];
    for (const e of index) {
      let s = 0;
      let ok = true;
      for (const tok of tokens) {
        const ti = e.nTitle.indexOf(tok);
        if (ti === 0) s += 30;
        else if (ti > 0) s += e.nTitle[ti - 1] === ' ' ? 20 : 12;
        else if (e.nBody.includes(tok)) s += 5;
        else if (tok.length >= 3 && isSubsequence(tok, e.nTitle)) s += 2;
        else {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (e.nTitle.startsWith(full)) s += 40;
      else if (e.nTitle.includes(full)) s += 15;
      scored.push({ e, s: s + GROUP_BOOST[e.group] });
    }
    scored.sort((a, b) => b.s - a.s);
    for (const { e } of scored) if (result[e.group].length < GROUP_LIMIT[e.group]) result[e.group].push(e);
    return result;
  }, [index, tokens]);

  const suggestions = useMemo(() => {
    const ids = ['page-eligibility', 'page-visas', ...(data?.visaCategories ?? []).slice(0, 3).map((v) => `visa-${v.slug}`), 'page-contact'];
    return ids.map((id) => index.find((e) => e.id === id)).filter((e): e is Entry => !!e);
  }, [index, data]);

  // Flat, keyboard-navigable list in the same order it is rendered.
  const sections = useMemo(() => {
    if (!tokens.length) {
      const s: { heading: string; icon?: ReactNode; items: Item[]; clear?: boolean }[] = [];
      if (recent.length) s.push({ heading: t('search.recent'), items: recent.map((q) => ({ kind: 'recent', query: q })), clear: true });
      s.push({ heading: t('search.suggestions'), items: suggestions.map((entry) => ({ kind: 'entry', entry, tokens: [] })) });
      return s;
    }
    return GROUPS.filter((g) => grouped[g].length).map((g) => ({
      heading: t(`search.groups.${g}`),
      items: grouped[g].map((entry): Item => ({ kind: 'entry', entry, tokens })),
      clear: false,
    }));
  }, [tokens, grouped, recent, suggestions, t]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const remember = (q: string) => {
    const v = q.trim();
    if (!v) return;
    const next = [v, ...recent.filter((r) => normalize(r) !== normalize(v))].slice(0, 6);
    setRecent(next);
    writeRecent(next);
  };

  const choose = (item: Item | undefined) => {
    if (!item) return;
    if (item.kind === 'recent') {
      setQuery(item.query);
      inputRef.current?.focus();
      return;
    }
    remember(query);
    closeSearch();
    navigate(item.entry.to);
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

  const loadingContent = isLoading || services.isLoading;
  const noResults = tokens.length > 0 && flat.length === 0;
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
          <Search className="size-5 shrink-0 text-brand-600" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            className="h-10 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted/70"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={flat.length ? `search-opt-${active}` : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
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
        <div ref={listRef} id="search-results" role="listbox" data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:max-h-[460px]">
          {loadingContent && !index.some((e) => e.group !== 'pages') && (
            <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted">
              <Spinner className="size-3.5 border-[1.5px]" />
              {t('search.loading')}
            </p>
          )}

          {noResults ? (
            <div className="px-4 py-10 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface text-muted">
                <Search className="size-6" />
              </span>
              <p className="mt-4 font-semibold break-words text-navy-900">{t('search.noResults', { query: query.trim() })}</p>
              <p className="mt-1 text-sm text-muted">{t('search.noResultsHint')}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => choose({ kind: 'entry', entry: s, tokens: [] })}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-navy-900 hover:border-brand-400 hover:bg-brand-50"
                  >
                    <Icon name={s.icon} className="size-3.5 text-brand-600" />
                    {s.title}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            sections.map((sec) => (
              <Fragment key={sec.heading}>
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
                {sec.items.map((item) => {
                  idx += 1;
                  const i = idx;
                  const isActive = i === active;
                  return (
                    <button
                      key={item.kind === 'recent' ? `r-${item.query}` : item.entry.id}
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
                      )}
                    >
                      {item.kind === 'recent' ? (
                        <>
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-muted">
                            <History className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-navy-900">{item.query}</span>
                        </>
                      ) : (
                        <>
                          <span
                            className={clsx(
                              'grid size-9 shrink-0 place-items-center rounded-lg transition-colors',
                              isActive ? 'bg-brand-600 text-white' : 'bg-surface text-navy-900',
                            )}
                          >
                            <Icon name={item.entry.icon} className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-sm font-semibold text-navy-900">
                                <Highlight text={item.entry.title} tokens={item.tokens} />
                              </span>
                              {item.entry.meta && (
                                <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">{item.entry.meta}</span>
                              )}
                            </span>
                            {item.entry.body && (
                              <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted">
                                <Highlight text={snippet(item.entry.body, item.tokens)} tokens={item.tokens} />
                              </span>
                            )}
                          </span>
                        </>
                      )}
                      <CornerDownLeft className={clsx('size-4 shrink-0 text-brand-600 transition-opacity', isActive ? 'opacity-100' : 'opacity-0')} />
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
