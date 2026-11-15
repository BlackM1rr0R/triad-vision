import { useEffect, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { SavedGermanyJob } from '@/lib/germanyJobs';

/**
 * Saved ("heart") listings of the German job search.
 *
 *  - Visitors (and staff browsing the site): kept in this browser only (localStorage, every access in try/catch —
 *    blocked storage just means the list lasts for this page view). A tool the visitor operates themselves; nothing
 *    leaves the browser.
 *  - Signed-in clients: kept in the account (GET/POST/DELETE /api/germany-jobs/saved). A list saved in the browser
 *    before signing in is merged into the account once (POST /saved/sync) and then removed from the browser.
 *
 * The server snapshot is always empty, so server-rendered pages hydrate without a mismatch.
 */

const KEY = 'tv.gj.saved';
export const LOCAL_MAX = 50;
export const SAVED_QUERY_KEY = ['germany-jobs-saved'] as const;

let items: SavedGermanyJob[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const EMPTY: SavedGermanyJob[] = [];

const valid = (x: unknown): x is SavedGermanyJob =>
  !!x && typeof (x as SavedGermanyJob).id === 'string' && typeof (x as SavedGermanyJob).title === 'string' && typeof (x as SavedGermanyJob).url === 'string';

const load = () => {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    items = Array.isArray(v) ? v.filter(valid).slice(0, LOCAL_MAX) : [];
  } catch {
    items = [];
  }
};

const save = (next: SavedGermanyJob[]) => {
  items = next;
  try {
    if (next.length) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked: the list lasts for this page view
  }
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    loaded = false;
    load();
    l();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
};

const snapshot = () => {
  load();
  return items;
};

export const useLocalSavedJobs = () => useSyncExternalStore(subscribe, snapshot, () => EMPTY);

export const localSaved = {
  list: snapshot,
  /** Adds or removes; false when the list is full (nothing added). */
  toggle: (job: SavedGermanyJob): boolean => {
    const list = snapshot();
    if (list.some((x) => x.id === job.id)) {
      save(list.filter((x) => x.id !== job.id));
      return true;
    }
    if (list.length >= LOCAL_MAX) return false;
    save([job, ...list]);
    return true;
  },
  remove: (id: string) => save(snapshot().filter((x) => x.id !== id)),
  clear: () => save([]),
};

let syncing: Promise<void> | null = null;

/**
 * The visitor's or client's saved listings, with toggle / remove. Returns `account: true` for signed-in clients
 * (server list). `toggle` resolves to false when the list is full.
 */
export const useSavedJobs = () => {
  const { user } = useAuth();
  const account = user?.role === 'CLIENT';
  const local = useLocalSavedJobs();
  const qc = useQueryClient();
  const server = useQuery({
    queryKey: SAVED_QUERY_KEY,
    queryFn: async () => (await api.get<{ items: SavedGermanyJob[]; max: number }>('/germany-jobs/saved')).data,
    enabled: account,
    staleTime: 60_000,
  });

  // After sign-in: the browser's list moves into the account (once; several mounted hooks share one request).
  useEffect(() => {
    if (!account || !local.length || syncing) return;
    syncing = api
      .post<{ items: SavedGermanyJob[] }>('/germany-jobs/saved/sync', { items: local })
      .then((r) => {
        localSaved.clear();
        qc.setQueryData(SAVED_QUERY_KEY, (old: { max: number } | undefined) => ({ max: old?.max ?? 100, items: r.data.items }));
      })
      .catch(() => undefined)
      .finally(() => {
        syncing = null;
      });
  }, [account, local, qc]);

  const list = account ? (server.data?.items ?? EMPTY) : local;
  const isSaved = (id: string) => list.some((x) => x.id === id);

  const setServer = (fn: (items: SavedGermanyJob[]) => SavedGermanyJob[]) =>
    qc.setQueryData(SAVED_QUERY_KEY, (old: { items: SavedGermanyJob[]; max: number } | undefined) => ({ max: old?.max ?? 100, items: fn(old?.items ?? []) }));

  const remove = async (id: string) => {
    if (!account) return localSaved.remove(id);
    const before = server.data;
    setServer((xs) => xs.filter((x) => x.id !== id));
    try {
      await api.delete(`/germany-jobs/saved/${encodeURIComponent(id)}`);
    } catch (err) {
      qc.setQueryData(SAVED_QUERY_KEY, before);
      throw err;
    }
  };

  const toggle = async (job: SavedGermanyJob): Promise<boolean> => {
    if (!account) return localSaved.toggle(job);
    if (isSaved(job.id)) {
      await remove(job.id);
      return true;
    }
    if (server.data && server.data.items.length >= server.data.max) return false;
    const before = server.data;
    setServer((xs) => [job, ...xs]);
    try {
      await api.post('/germany-jobs/saved', { ...job, savedAt: undefined, status: undefined });
    } catch (err) {
      qc.setQueryData(SAVED_QUERY_KEY, before);
      throw err;
    }
    return true;
  };

  return { items: list, account, loading: account && server.isLoading, isSaved, toggle, remove };
};
