import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { GERMAN_STATUS_KEY } from '@/components/journey/api';
import type { GermanExamDate, GermanOverview } from './types';

/**
 * One client for both sides: the candidate's own data (/german/me) or a candidate seen by staff
 * (/admin/german/users/:id). Every write returns the fresh overview, which replaces the cache.
 */
export const germanBase = (userId?: string) => (userId ? `/admin/german/users/${userId}` : '/german/me');
export const germanKey = (userId?: string) => ['german-progress', userId ?? 'me'] as const;
export const EXAM_DATES_KEY = ['german-exam-dates'] as const;

export const useGermanOverview = (userId?: string, enabled = true) =>
  useQuery({
    queryKey: germanKey(userId),
    queryFn: async () => (await api.get<GermanOverview>(germanBase(userId))).data,
    enabled,
    staleTime: 15_000,
  });

export const useGermanWrite = (userId?: string) => {
  const qc = useQueryClient();
  return async (method: 'post' | 'put' | 'patch' | 'delete', path: string, body?: unknown) => {
    const url = `${germanBase(userId)}${path}`;
    const res = method === 'delete' ? await api.delete<GermanOverview>(url) : await api[method]<GermanOverview>(url, body);
    qc.setQueryData(germanKey(userId), res.data);
    void qc.invalidateQueries({ queryKey: GERMAN_STATUS_KEY });
    return res.data;
  };
};

export const useAdminExamDates = (scope: 'upcoming' | 'all') =>
  useQuery({
    queryKey: [...EXAM_DATES_KEY, scope],
    queryFn: async () => (await api.get<{ items: GermanExamDate[] }>('/admin/german/exam-dates', { params: { scope } })).data.items,
  });
