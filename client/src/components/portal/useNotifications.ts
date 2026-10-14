import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Notification } from '@/lib/types';

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
