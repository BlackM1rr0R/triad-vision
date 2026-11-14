import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Notification } from '@/lib/types';
import { OVERVIEW_KEY } from '@/components/portal/useOverview';
import { useApiError } from '@/components/portal/useApiError';

/**
 * Notification center data (server routes/notifications.ts): the paged feed, the per-category summary and the
 * read / unread actions. Everything lives under the ['notifications'] query prefix — the SSE 'notification'
 * event (lib/realtime useRealtimeNotifications) invalidates that prefix, so the bell, the page and the portal's
 * own lists refresh together. Mark read / unread is optimistic over every cached list and rolled back on error.
 */

export const NOTIF_CATEGORIES = ['case', 'document', 'message', 'task', 'finance', 'system'] as const;
export type NotifCategory = (typeof NOTIF_CATEGORIES)[number];

export interface FeedItem extends Notification {
  category: NotifCategory;
}
export interface FeedPage {
  items: FeedItem[];
  unread: number;
  nextCursor: string | null;
}
export interface NotifSummary {
  unread: number;
  total: number;
  categories: { key: NotifCategory; total: number; unread: number }[];
}
export interface FeedFilter {
  category: NotifCategory | null;
  unreadOnly: boolean;
}

export const PAGE_SIZE = 20;
export const SUMMARY_KEY = ['notifications', 'summary'] as const;
export const feedKey = (f: FeedFilter) => ['notifications', 'feed', f.category ?? 'all', f.unreadOnly ? 'unread' : 'any'] as const;

export const useNotificationFeed = (f: FeedFilter, enabled = true) =>
  useInfiniteQuery({
    queryKey: feedKey(f),
    queryFn: async ({ pageParam }) =>
      (
        await api.get<FeedPage>('/notifications', {
          params: { limit: PAGE_SIZE, cursor: pageParam || undefined, category: f.category ?? undefined, unread: f.unreadOnly ? '1' : undefined },
        })
      ).data,
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: 60_000,
    enabled,
  });

export const useNotificationSummary = (enabled = true) =>
  useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: async () => (await api.get<NotifSummary>('/notifications/summary')).data,
    refetchInterval: 60_000,
    enabled,
  });

// ─── Optimistic cache patches ────────────────────────────────────────────

type ListShape = { items: Notification[]; unread: number };
type Cached = InfiniteData<FeedPage> | ListShape | NotifSummary | undefined;

const isFeed = (v: unknown): v is InfiniteData<FeedPage> => !!v && typeof v === 'object' && 'pages' in v;
const isSummary = (v: unknown): v is NotifSummary => !!v && typeof v === 'object' && 'categories' in v;
const isList = (v: unknown): v is ListShape => !!v && typeof v === 'object' && 'items' in v && 'unread' in v;

export type ReadChange =
  /** Every unread notification (optionally of one category) becomes read. */
  | { kind: 'readAll'; category?: NotifCategory | null }
  | { kind: 'read'; ids: string[] }
  | { kind: 'unread'; ids: string[] };

/** Unread rows touched by an id change, found in whatever is cached (id → category, null when unknown). */
const touched = (qc: QueryClient, ids: string[], wantUnread: boolean) => {
  const found = new Map<string, NotifCategory | null>();
  const set = new Set(ids);
  const visit = (n: Notification & { category?: NotifCategory }) => {
    if (set.has(n.id) && !n.readAt === wantUnread && !found.has(n.id)) found.set(n.id, n.category ?? null);
  };
  for (const [, data] of qc.getQueriesData<Cached>({ queryKey: ['notifications'] })) {
    if (isFeed(data)) data.pages.forEach((p) => p.items.forEach(visit));
    else if (isList(data)) data.items.forEach(visit);
  }
  return found;
};

const applyChange = (qc: QueryClient, change: ReadChange) => {
  const now = new Date().toISOString();
  const ids = change.kind === 'readAll' ? null : new Set(change.ids);
  const cat = change.kind === 'readAll' ? (change.category ?? null) : null;
  const hits = ids ? touched(qc, [...ids], change.kind === 'read') : new Map<string, NotifCategory | null>();
  const delta = change.kind === 'unread' ? hits.size : -hits.size;

  const patchItem = <T extends Notification & { category?: NotifCategory }>(n: T): T => {
    if (change.kind === 'unread') return ids!.has(n.id) && n.readAt ? { ...n, readAt: null } : n;
    if (n.readAt) return n;
    if (ids) return ids.has(n.id) ? { ...n, readAt: now } : n;
    return !cat || n.category === cat ? { ...n, readAt: now } : n;
  };
  // Unread total after the change; "all of a category" uses the summary's count of that category when cached.
  const summary = qc.getQueryData<NotifSummary>(SUMMARY_KEY);
  const catUnread = cat ? (summary?.categories.find((c) => c.key === cat)?.unread ?? 0) : 0;
  const nextUnread = (prev: number) => Math.max(0, change.kind === 'readAll' ? (cat ? prev - catUnread : 0) : prev + delta);

  qc.setQueriesData<Cached>({ queryKey: ['notifications'] }, (old) => {
    if (isFeed(old)) return { ...old, pages: old.pages.map((p) => ({ ...p, unread: nextUnread(p.unread), items: p.items.map(patchItem) })) };
    if (isSummary(old)) {
      const perCat = new Map<NotifCategory, number>();
      for (const c of hits.values()) if (c) perCat.set(c, (perCat.get(c) ?? 0) + 1);
      const categories = old.categories.map((c) => {
        if (change.kind === 'readAll') return !cat || c.key === cat ? { ...c, unread: 0 } : c;
        const n = perCat.get(c.key) ?? 0;
        return { ...c, unread: Math.max(0, c.unread + (change.kind === 'unread' ? n : -n)) };
      });
      return { ...old, unread: nextUnread(old.unread), categories };
    }
    if (isList(old)) return { ...old, unread: nextUnread(old.unread), items: old.items.map(patchItem) };
    return old;
  });
  // The portal overview keeps its own notifications block (badges on the client home).
  qc.setQueryData<{ notifications?: ListShape } | undefined>(OVERVIEW_KEY, (old) =>
    old?.notifications ? { ...old, notifications: { ...old.notifications, unread: nextUnread(old.notifications.unread), items: old.notifications.items.map(patchItem) } } : old,
  );
};

/** Read / unread actions shared by the bell and the page. */
export const useNotificationActions = () => {
  const qc = useQueryClient();
  const onError = useApiError();
  return useMutation({
    mutationFn: async (change: ReadChange) => {
      if (change.kind === 'unread') return api.post('/notifications/unread', { ids: change.ids });
      if (change.kind === 'read') return api.post('/notifications/read', { ids: change.ids });
      return api.post('/notifications/read', change.category ? { category: change.category } : {});
    },
    onMutate: async (change) => {
      await qc.cancelQueries({ queryKey: ['notifications'] });
      const snapshot: [QueryKey, unknown][] = [...qc.getQueriesData({ queryKey: ['notifications'] }), [OVERVIEW_KEY, qc.getQueryData(OVERVIEW_KEY)]];
      applyChange(qc, change);
      return { snapshot };
    },
    onError: (err, _change, ctx) => {
      for (const [key, data] of ctx?.snapshot ?? []) qc.setQueryData(key, data);
      onError(err);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    },
  });
};

// ─── Day groups ──────────────────────────────────────────────────────────

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Items (newest first) in local calendar days: 'today' / 'yesterday' / the day's ISO key for older ones. */
export const groupByDay = <T extends { createdAt: string }>(items: T[], now = new Date()) => {
  const today = dayKey(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterday = dayKey(y);
  const groups: { key: string; when: 'today' | 'yesterday' | 'date'; date: Date; items: T[] }[] = [];
  for (const n of items) {
    const d = new Date(n.createdAt);
    const key = dayKey(d);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, when: key === today ? 'today' : key === yesterday ? 'yesterday' : 'date', date: d, items: [] };
      groups.push(g);
    }
    g.items.push(n);
  }
  return groups;
};
