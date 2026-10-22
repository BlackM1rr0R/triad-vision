import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { api } from '@/lib/api';

/** Shapes of GET /api/admin/my-work (server/src/lib/myWork.ts). */

export type WorkKind =
  | 'doc_review'
  | 'case_waiting'
  | 'case_stuck'
  | 'appointment'
  | 'sign_mine'
  | 'sign_waiting'
  | 'task'
  | 'mail_triage'
  | 'mail_unread'
  | 'inquiry'
  | 'booking'
  | 'application'
  | 'employer_decision'
  | 'candidate_request'
  | 'expiring'
  | 'security_alert'
  | 'privacy';
export type WorkCategory = 'documents' | 'tasks' | 'mail' | 'signatures' | 'bookings' | 'leads' | 'other';
export type WorkPriority = 'URGENT' | 'HIGH' | 'NORMAL';
export type WorkBucket = 'overdue' | 'today' | 'week' | 'later';
export type WorkScope = 'mine' | 'all';

export interface WorkAction {
  key: string;
  label: string;
  type: 'api' | 'reject' | 'link' | 'url';
  method?: 'POST' | 'PATCH';
  endpoint?: string;
  body?: Record<string, unknown>;
  href?: string;
  confirm?: boolean;
  primary?: boolean;
  notBefore?: string;
  params?: Record<string, string>;
}

export interface WorkItem {
  id: string;
  kind: WorkKind;
  category: WorkCategory;
  title: string;
  subtitle: string | null;
  note?: { key: string; params?: Record<string, string | number> };
  priority: WorkPriority;
  dueAt: string | null;
  since: string;
  ageHours: number;
  overdue: boolean;
  bucket: WorkBucket;
  link: string;
  refs: Record<string, string | null>;
  assignee: { id: string; name: string } | null;
  actions: WorkAction[];
}

export interface WorkResponse {
  scope: WorkScope;
  generatedAt: string;
  items: WorkItem[];
  counts: { total: number; urgent: number; overdue: number; byKind: Partial<Record<WorkKind, number>>; byCategory: Record<WorkCategory, number> };
  more: { kind: WorkKind; count: number; link: string }[];
}

export const myWorkKey = (scope: WorkScope) => ['my-work', scope] as const;

const fetchWork = async (scope: WorkScope, fresh = false) =>
  (await api.get<WorkResponse>('/admin/my-work', { params: { scope, tz: new Date().getTimezoneOffset(), ...(fresh ? { fresh: 1 } : {}) } })).data;

/** The queue (shared by the page, the nav badge and the compact cards); refreshed every 60 s. */
export const useMyWork = (scope: WorkScope = 'mine', enabled = true) =>
  useQuery({
    queryKey: myWorkKey(scope),
    queryFn: () => fetchWork(scope),
    refetchInterval: 60_000,
    staleTime: 20_000,
    enabled,
  });

/** Reloads bypassing the server's 30 s cache (after an action). */
export const useRefreshMyWork = () => {
  const qc = useQueryClient();
  return useCallback(
    async (scope: WorkScope) => {
      const data = await fetchWork(scope, true);
      qc.setQueryData(myWorkKey(scope), data);
      // The other scope (and the nav badge) is refetched on its next use.
      void qc.invalidateQueries({ queryKey: ['my-work'], refetchType: 'none' });
      return data;
    },
    [qc],
  );
};

/** Calls an action's existing endpoint. */
export const runAction = async (a: WorkAction, extraBody?: Record<string, unknown>) => {
  if (!a.endpoint || !a.method) return;
  const body = { ...(a.body ?? {}), ...(extraBody ?? {}) };
  if (a.method === 'PATCH') await api.patch(a.endpoint, body);
  else await api.post(a.endpoint, body);
};

/** "3 h", "2 d" … */
export const fmtSpan = (t: TFunction, ms: number) => {
  const min = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  if (min < 60) return t('today.dur.m', { count: min });
  const h = Math.round(min / 60);
  if (h < 48) return t('today.dur.h', { count: h });
  return t('today.dur.d', { count: Math.round(h / 24) });
};

/** The age / deadline chip of a row. */
export const dueText = (t: TFunction, item: WorkItem, now = Date.now()) => {
  if (item.dueAt) {
    const diff = Date.parse(item.dueAt) - now;
    return { text: diff < 0 ? t('today.due.overdue', { time: fmtSpan(t, diff) }) : t('today.due.left', { time: fmtSpan(t, diff) }), late: diff < 0 };
  }
  return { text: t('today.due.waiting', { time: fmtSpan(t, item.ageHours * 3_600_000) }), late: false };
};

export const noteText = (t: TFunction, item: WorkItem) => (item.note ? t(`today.note.${item.note.key}`, { ...(item.note.params ?? {}), defaultValue: '' }) : '');
