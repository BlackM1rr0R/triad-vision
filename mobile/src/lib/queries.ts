import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from './api';
import { errorCode, errorKeys } from './errors';
import { qk } from './queryClient';
import type {
  AdminCaseList,
  AppNotification,
  CaseDetail,
  CaseStatus,
  CaseSummary,
  DashboardData,
  SiteContent,
} from '@/types';

/** Translates any error into a user-facing sentence in the current language. */
export const useErrorMessage = () => {
  const { t, i18n } = useTranslation();
  return useCallback(
    (err: unknown) => {
      const code = errorCode(err);
      const key = errorKeys(code).find((k) => i18n.exists(k));
      return t(key ?? 'm.errors.UNKNOWN');
    },
    [t, i18n],
  );
};

export const useContent = () =>
  useQuery({
    queryKey: qk.content,
    queryFn: async () => (await api.get<SiteContent>('/public/content')).data,
    staleTime: 5 * 60_000,
  });

export const useMyCases = (enabled = true) =>
  useQuery({
    queryKey: qk.myCases,
    queryFn: async () => (await api.get<{ cases: CaseSummary[] }>('/cases')).data.cases,
    enabled,
  });

export const useCase = (id: string | undefined) =>
  useQuery({
    queryKey: qk.case(id ?? ''),
    queryFn: async () => (await api.get<{ case: CaseDetail }>(`/cases/${id}`)).data.case,
    enabled: !!id,
  });

export const useNotifications = (enabled = true) =>
  useQuery({
    queryKey: qk.notifications,
    queryFn: async () => (await api.get<{ items: AppNotification[]; unread: number }>('/notifications')).data,
    enabled,
    refetchInterval: 60_000,
  });

export const useDashboard = () =>
  useQuery({
    queryKey: qk.dashboard,
    queryFn: async () => (await api.get<DashboardData>('/admin/dashboard')).data,
  });

export const useAdminCases = (filter: { status: CaseStatus | null; search: string; mine: boolean }) =>
  useInfiniteQuery({
    queryKey: qk.adminCases(filter.status, filter.search, filter.mine),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<AdminCaseList>('/admin/cases', {
          params: {
            page: pageParam,
            status: filter.status ?? undefined,
            search: filter.search || undefined,
            mine: filter.mine ? 'true' : undefined,
          },
        })
      ).data,
    getNextPageParam: (last, pages) => (pages.length * last.pageSize < last.total ? pages.length + 1 : undefined),
    placeholderData: keepPreviousData,
  });

export const useAdminCase = (id: string | undefined) =>
  useQuery({
    queryKey: qk.adminCase(id ?? ''),
    queryFn: async () => (await api.get<{ case: CaseDetail }>(`/admin/cases/${id}`)).data.case,
    enabled: !!id,
  });
