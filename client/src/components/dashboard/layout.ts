import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { readJson, writeJson } from '@/components/command/storage';

/**
 * Personal dashboard layout: widget order, size (S / M / L) and hidden widgets. Source of truth is the server
 * (GET / PUT /api/admin/me/dashboard → StaffPreferences.dashboardLayout); the last answer is cached in
 * localStorage so the dashboard renders in the user's order at once on the next load.
 */

export type WidgetSize = 'S' | 'M' | 'L';
export const WIDGET_SIZES: WidgetSize[] = ['S', 'M', 'L'];

export interface LayoutItem {
  id: string;
  size: WidgetSize;
  hidden?: boolean;
}

export interface DashboardLayout {
  v: 1;
  items: LayoutItem[];
}

/** What normalisation needs to know about a widget (registry entry). */
export interface WidgetMeta {
  id: string;
  defaultSize: WidgetSize;
  defaultHidden?: boolean;
}

const isSize = (v: unknown): v is WidgetSize => v === 'S' || v === 'M' || v === 'L';
const isItem = (v: unknown): v is LayoutItem => !!v && typeof v === 'object' && typeof (v as LayoutItem).id === 'string' && isSize((v as LayoutItem).size);
const isLayout = (v: unknown): v is DashboardLayout | null =>
  v === null || (!!v && typeof v === 'object' && (v as DashboardLayout).v === 1 && Array.isArray((v as DashboardLayout).items) && (v as DashboardLayout).items.every(isItem));

const cacheKey = (userId: string | undefined) => `tv-admin-dashboard:${userId ?? 'anon'}`;

/**
 * Saved layout + the widgets this user may see → the list to render: saved order first (unknown / not
 * permitted ids skipped), then widgets added since, at their default size.
 */
export const normalizeLayout = (saved: DashboardLayout | null | undefined, widgets: WidgetMeta[]): LayoutItem[] => {
  const byId = new Map(widgets.map((w) => [w.id, w]));
  const out: LayoutItem[] = [];
  const seen = new Set<string>();
  for (const i of saved?.items ?? []) {
    if (!byId.has(i.id) || seen.has(i.id)) continue;
    seen.add(i.id);
    out.push({ id: i.id, size: i.size, ...(i.hidden ? { hidden: true } : {}) });
  }
  for (const w of widgets) {
    if (seen.has(w.id)) continue;
    out.push({ id: w.id, size: w.defaultSize, ...(w.defaultHidden ? { hidden: true } : {}) });
  }
  return out;
};

export const defaultLayout = (widgets: WidgetMeta[]) => normalizeLayout(null, widgets);

export const useDashboardLayout = (widgets: WidgetMeta[]) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  const key = useMemo(() => ['admin-dashboard-layout', userId ?? 'anon'] as const, [userId]);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const layout = (await api.get<{ layout: DashboardLayout | null }>('/admin/me/dashboard')).data.layout;
      writeJson(cacheKey(userId), layout);
      return layout;
    },
    enabled: !!userId,
    initialData: () => readJson<DashboardLayout | null | undefined>(cacheKey(userId), undefined, isLayout as (v: unknown) => v is DashboardLayout | null | undefined),
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const saved = query.data ?? null;
  const items = useMemo(() => normalizeLayout(saved, widgets), [saved, widgets]);

  const put = useMutation({
    mutationFn: async (layout: DashboardLayout | null) => (await api.put<{ layout: DashboardLayout | null }>('/admin/me/dashboard', { layout })).data.layout,
    onError: () => toast.error(t('ux.dashboard.saveFailed')),
  });

  /** Saves the visible list; entries of widgets this user cannot see right now are kept at the end. */
  const save = useCallback(
    (next: LayoutItem[]) => {
      const prev = qc.getQueryData<DashboardLayout | null>(key) ?? null;
      const keep = (prev?.items ?? []).filter((i) => !next.some((n) => n.id === i.id));
      const layout: DashboardLayout = { v: 1, items: [...next, ...keep].slice(0, 40) };
      qc.setQueryData(key, layout);
      writeJson(cacheKey(userId), layout);
      put.mutate(layout);
    },
    [qc, key, userId, put],
  );

  const reset = useCallback(() => {
    qc.setQueryData(key, null);
    writeJson(cacheKey(userId), null);
    put.mutate(null, { onSuccess: () => toast.success(t('ux.dashboard.resetDone')) });
  }, [qc, key, userId, put, t]);

  return { items, save, reset, isCustom: !!saved, saving: put.isPending };
};
