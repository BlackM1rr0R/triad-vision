import { createElement, Fragment, type ReactNode } from 'react';
import { BookOpen, Briefcase, BriefcaseBusiness, Calculator, CalendarDays, CircleHelp, FileText, Newspaper, Stamp, type LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Client side of the site search (GET /api/search): types, the request, the anonymous "settled query" log,
 * highlighting of the server's match ranges and the visitor's recent searches (localStorage only).
 */

export type SearchType = 'tool' | 'guide' | 'visa' | 'job' | 'service' | 'faq' | 'news' | 'event' | 'page';

/** Order of the result groups (dialog and /search). */
export const SEARCH_TYPES: SearchType[] = ['tool', 'guide', 'visa', 'job', 'service', 'faq', 'news', 'event', 'page'];

export const TYPE_ICON: Record<SearchType, LucideIcon> = {
  tool: Calculator,
  guide: BookOpen,
  visa: Stamp,
  job: Briefcase,
  service: BriefcaseBusiness,
  faq: CircleHelp,
  news: Newspaper,
  event: CalendarDays,
  page: FileText,
};

export interface SearchHit {
  id: string;
  type: SearchType;
  title: string;
  /** Full site path with the language prefix (/de/guides/…). */
  url: string;
  meta?: string;
  snippet: string;
  titleHighlights: [number, number][];
  highlights: [number, number][];
  score: number;
}

export interface SearchResponse {
  q: string;
  lng: string;
  total: number;
  items: SearchHit[];
}

export const MIN_QUERY = 2;

export const fetchSearch = async (q: string, lng: string, opts: { limit?: number; signal?: AbortSignal } = {}) =>
  (await api.get<SearchResponse>('/search', { params: { q, lng, limit: opts.limit ?? 30 }, signal: opts.signal })).data;

const logged = new Set<string>();

/** Counts a settled query once per page view (anonymous daily statistics; failures are ignored). */
export const logSearch = (q: string, lng: string) => {
  const key = `${lng}:${q.trim().toLowerCase()}`;
  if (q.trim().length < MIN_QUERY || logged.has(key)) return;
  logged.add(key);
  void api.post('/search/log', { q: q.trim(), lng }).catch(() => logged.delete(key));
};

/** Text with the server's match ranges wrapped in <mark>. */
export const Marked = ({ text, ranges, className = 'rounded-sm bg-brand-100 px-0.5 text-brand-800' }: { text: string; ranges: [number, number][]; className?: string }): ReactNode => {
  if (!ranges.length) return text;
  const out: ReactNode[] = [];
  let pos = 0;
  ranges.forEach(([s, e], i) => {
    if (s < pos || e > text.length) return;
    if (s > pos) out.push(text.slice(pos, s));
    out.push(createElement('mark', { key: i, className }, text.slice(s, e)));
    pos = e;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return createElement(Fragment, null, ...out);
};

// ─── Recent searches (this browser only) ────────────────────────────────

const RECENT_KEY = 'tv_search_recent';

export const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
};

export const writeRecent = (list: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
  } catch {
    /* storage blocked: recent searches are a convenience only */
  }
};

export const rememberSearch = (q: string) => {
  const v = q.trim();
  if (v.length < MIN_QUERY) return readRecent();
  const next = [v, ...readRecent().filter((r) => r.toLowerCase() !== v.toLowerCase())].slice(0, 6);
  writeRecent(next);
  return next;
};

/** Hits grouped by type in display order, at most `perGroup` each. */
export const groupHits = (items: SearchHit[], perGroup = Infinity) =>
  SEARCH_TYPES.map((type) => ({ type, items: items.filter((h) => h.type === type).slice(0, perGroup) })).filter((g) => g.items.length);
