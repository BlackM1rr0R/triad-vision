import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Notification } from '@/lib/types';
import { optimistic } from '@/lib/optimistic';
import type { AccountOverview } from './accountTypes';
import { OVERVIEW_KEY } from './useOverview';
import { useApiError } from './useApiError';

export interface NotificationsResponse {
  items: Notification[];
  unread: number;
}

/** The signed-in user's notifications (query key ['notifications']), refreshed every minute. */
export const useNotifications = (enabled = true) =>
  useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get<NotificationsResponse>('/notifications')).data,
    refetchInterval: 60_000,
    enabled,
  });

/** Marks the given notifications (or all, without ids) read in a list + unread counter. */
const markIn = <T extends { items: Notification[]; unread: number }>(prev: T | undefined, ids?: string[]): T | undefined => {
  if (!prev) return prev;
  const now = new Date().toISOString();
  let changed = 0;
  const items = prev.items.map((i) => {
    if (i.readAt || (ids && !ids.includes(i.id))) return i;
    changed += 1;
    return { ...i, readAt: now };
  });
  // the list may hold only the latest items: "all" clears the counter, single ids lower it by the ones seen
  return { ...prev, items, unread: ids ? Math.max(0, prev.unread - (changed || ids.length)) : 0 };
};

/**
 * POST /notifications/read, optimistic: the dot, the bold title and every unread badge (notifications list
 * and the portal overview) update at once; a failure restores them and shows the error.
 */
export const useMarkNotificationsRead = () => {
  const qc = useQueryClient();
  const onError = useApiError();
  return useMutation({
    mutationFn: (ids?: string[]) => api.post('/notifications/read', ids ? { ids } : {}),
    ...optimistic<NotificationsResponse, string[] | undefined>(qc, {
      key: ['notifications'],
      update: (prev, ids) => markIn(prev, ids),
      patches: [
        {
          key: OVERVIEW_KEY,
          update: (prev: AccountOverview, ids: string[] | undefined) =>
            prev?.notifications ? { ...prev, notifications: markIn(prev.notifications, ids) } : prev,
        },
      ],
      onError: (err) => onError(err),
    }),
  });
};
