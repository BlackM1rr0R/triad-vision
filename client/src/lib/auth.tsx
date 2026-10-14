import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from './api';
import type { Role, User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Query keys holding public CMS data that is safe to keep after logout. */
const PUBLIC_QUERY_KEYS = new Set(['content', 'posts', 'post', 'visa', 'service']);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { i18n } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get<{ user: User | null }>('/auth/me')).data.user,
    staleTime: 5 * 60 * 1000,
  });

  const setUser = (u: User | null) => qc.setQueryData(['me'], u);
  /**
   * Logs out instantly: the UI switches to "logged out" before the server round-trip, and only
   * private data is dropped (public site content stays cached, so the next page renders at once).
   */
  const logout = async () => {
    qc.setQueryData(['me'], null);
    qc.removeQueries({ predicate: (q) => !PUBLIC_QUERY_KEYS.has(String(q.queryKey[0])) && q.queryKey[0] !== 'me' });
    try {
      await api.post('/auth/logout');
    } catch {
      // cookie is short-lived anyway; the UI is already logged out
    }
  };

  // Keep the server-side notification language in sync with the language the client uses on the site.
  const user = data ?? null;
  useEffect(() => {
    if (!user || user.role !== 'CLIENT') return;
    const lng = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
    if (lng !== user.locale && ['az', 'de', 'en', 'ru'].includes(lng)) {
      api.patch<{ user: User }>('/auth/me', { locale: lng }).then((r) => setUser(r.data.user)).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, i18n.resolvedLanguage]);

  return (
    <AuthContext.Provider value={{ user, loading: isLoading, setUser, logout }}>{children}</AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
};

export const RequireAuth = ({ roles, children }: { roles?: Role[]; children: ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="size-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
};
