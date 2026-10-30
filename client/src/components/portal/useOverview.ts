import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useChosenCase } from '@/lib/caseContext';
import type { AccountOverview } from './accountTypes';

export const OVERVIEW_KEY = ['account-overview'] as const;

/**
 * Dashboard data (GET /api/account/overview). Shared by the account layout and the dashboard. With the family
 * switcher's case chosen (lib/caseContext) the active case and last message are that case's (?case=).
 */
export const useOverview = (enabled = true) => {
  const { user } = useAuth();
  const chosen = useChosenCase(user?.id);
  return useQuery({
    queryKey: chosen ? [...OVERVIEW_KEY, 'case', chosen] : OVERVIEW_KEY,
    queryFn: async () => (await api.get<AccountOverview>('/account/overview', { params: chosen ? { case: chosen } : undefined })).data,
    staleTime: 20_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev, // a switch keeps the previous screen until the new case is in
    enabled,
  });
};

/** Scrolls to `location.hash` once the page content is rendered (React Router does not do it). */
export const useHashScroll = (ready: boolean) => {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    const id = decodeURIComponent(hash.slice(1));
    // Wait a frame so the route transition has mounted the target.
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [ready, hash, pathname]);
};
