import { AppState, Platform, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { isUnauthorized } from './errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 30 * 60_000,
      retry: (count, err) => !isUnauthorized(err) && count < 2,
    },
    mutations: { retry: false },
  },
});

// Refetch when the app comes back to the foreground…
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
    if (Platform.OS !== 'web') handleFocus(s === 'active');
  });
  return () => sub.remove();
});

// …and pause/resume queries with the network.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false);
  }),
);

export const qk = {
  me: ['me'] as const,
  content: ['content'] as const,
  myCases: ['cases'] as const,
  case: (id: string) => ['cases', id] as const,
  notifications: ['notifications'] as const,
  dashboard: ['admin', 'dashboard'] as const,
  adminCases: (status: string | null, search: string, mine: boolean) => ['admin', 'cases', { status, search, mine }] as const,
  adminCase: (id: string) => ['admin', 'case', id] as const,
  staff: ['admin', 'staff'] as const,
};
