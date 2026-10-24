import { useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { DESKS, PINS_MAX, STAFF_NAV, activeNavItem, defaultDeskFor, isDesk, moduleOn, type Desk, type ModuleFlags, type ModuleKey } from './navRegistry';
import { isStringArray, navPinsKey, navStateKey, readJson, writeJson } from './storage';

/**
 * Admin navigation preferences of the signed-in staff member: desk, favourites (pins), recently opened
 * pages and the module toggles. Source of truth is the server (GET/PUT /api/admin/me/nav); the last answer
 * is kept in localStorage so the sidebar renders instantly on the next load. Shared by the sidebar (desktop
 * rail + mobile drawer), the hub tabs and the Ctrl+K palette through one react-query cache entry.
 */

export interface RecentVisit {
  id: string;
  at: string;
}

export interface NavState {
  desk: Desk;
  defaultDesk: Desk;
  pins: string[];
  recent: RecentVisit[];
  modules: ModuleFlags;
}

const isNavState = (v: unknown): v is NavState =>
  !!v &&
  typeof v === 'object' &&
  isDesk((v as NavState).desk) &&
  isStringArray((v as NavState).pins) &&
  Array.isArray((v as NavState).recent) &&
  !!(v as NavState).modules &&
  typeof (v as NavState).modules === 'object';

export const navQueryKey = (userId: string | undefined) => ['admin-nav', userId ?? 'anon'] as const;

export const useStaffNav = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  const role = user?.role;
  const staff = hasMinRole(role, 'STAFF');
  const key = navQueryKey(userId);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const data = (await api.get<NavState>('/admin/me/nav')).data;
      writeJson(navStateKey(userId), data);
      return data;
    },
    enabled: staff && !!userId,
    // Cached copy first (stale at once, so the server answer follows right away).
    initialData: () => readJson<NavState | undefined>(navStateKey(userId), undefined, isNavState),
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const data = query.data;

  // Favourites from before the server kept them (localStorage only) move to the server once.
  useEffect(() => {
    if (!query.isFetched || !data || data.pins.length || !userId) return;
    const legacy = readJson<string[]>(navPinsKey(userId), [], isStringArray);
    if (!legacy.length) return;
    writeJson(navPinsKey(userId), []);
    void api.put<NavState>('/admin/me/nav', { pins: legacy.slice(0, PINS_MAX) }).then((r) => {
      qc.setQueryData(key, r.data);
      writeJson(navStateKey(userId), r.data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isFetched, userId]);

  const patch = useCallback(
    (fn: (s: NavState) => NavState) => {
      const prev = qc.getQueryData<NavState>(key);
      const base: NavState = prev ?? { desk: defaultDeskFor(role), defaultDesk: defaultDeskFor(role), pins: [], recent: [], modules: {} };
      const next = fn(base);
      qc.setQueryData(key, next);
      writeJson(navStateKey(userId), next);
      return next;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, userId, role],
  );

  const save = useMutation({
    mutationFn: async (body: { desk?: Desk | null; pins?: string[] }) => (await api.put<NavState>('/admin/me/nav', body)).data,
    onSuccess: (server) => {
      qc.setQueryData(key, server);
      writeJson(navStateKey(userId), server);
    },
    onError: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const desk: Desk = data?.desk ?? defaultDeskFor(role);
  const pins = useMemo(() => data?.pins ?? readJson<string[]>(navPinsKey(userId), [], isStringArray), [data?.pins, userId]);
  const recent = data?.recent ?? [];
  const modules = data?.modules;

  const setDesk = useCallback(
    (next: Desk | null) => {
      patch((s) => ({ ...s, desk: next ?? s.defaultDesk }));
      save.mutate({ desk: next });
    },
    [patch, save],
  );

  const togglePin = useCallback(
    (id: string) => {
      const s = patch((cur) => {
        const has = cur.pins.includes(id);
        // Newest favourite wins: the oldest one drops off past PINS_MAX.
        const pinsNext = has ? cur.pins.filter((p) => p !== id) : [...cur.pins, id].slice(-PINS_MAX);
        return { ...cur, pins: pinsNext };
      });
      save.mutate({ pins: s.pins });
    },
    [patch, save],
  );

  /** One page view: the server counts it (usage statistics) and moves the page to the top of "recent". */
  const recordVisit = useCallback(
    (navId: string) => {
      patch((s) => ({ ...s, recent: [{ id: navId, at: new Date().toISOString() }, ...s.recent.filter((r) => r.id !== navId)].slice(0, 10) }));
      void api
        .post<{ recent: RecentVisit[] }>('/admin/me/nav/visit', { navId })
        .then((r) => patch((s) => ({ ...s, recent: r.data.recent })))
        .catch(() => undefined);
    },
    [patch],
  );

  const isModuleOn = useCallback((k: ModuleKey | undefined) => moduleOn(modules, k), [modules]);

  return {
    desk,
    defaultDesk: data?.defaultDesk ?? defaultDeskFor(role),
    desks: DESKS,
    pins,
    recent,
    modules,
    /** False until the first answer (server or cache): module screens wait for it. */
    loaded: !!data,
    setDesk,
    togglePin,
    recordVisit,
    isModuleOn,
  };
};

/** Replace the module flags in the cache after System → Modules saved them. */
export const useSetModulesCache = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useCallback(
    (modules: ModuleFlags) => {
      const key = navQueryKey(user?.id);
      const prev = qc.getQueryData<NavState>(key);
      if (!prev) return void qc.invalidateQueries({ queryKey: key });
      const next = { ...prev, modules };
      qc.setQueryData(key, next);
      writeJson(navStateKey(user?.id), next);
    },
    [qc, user?.id],
  );
};

/**
 * One usage record per page view (System → Usage) after a short stay, keyed by the registry entry of the
 * page; also feeds "Recently opened". Mounted by the admin and workspace layouts.
 */
export const usePageVisits = (pathname: string) => {
  const { recordVisit } = useStaffNav();
  useEffect(() => {
    const item = activeNavItem(pathname, STAFF_NAV);
    if (!item) return;
    const h = window.setTimeout(() => recordVisit(item.id), 1200);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
};
