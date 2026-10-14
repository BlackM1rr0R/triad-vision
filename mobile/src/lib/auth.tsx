import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, setUnauthorizedHandler, tokenStore } from './api';
import { isUnauthorized } from './errors';
import { registerForPush, unregisterPush, type PushState } from './push';
import { queryClient } from './queryClient';
import { currentLanguage, restoreLanguage, setAppLanguage } from '@/i18n';
import type { Locale, User } from '@/types';

const USER_KEY = 'tv_user';

type Status = 'loading' | 'guest' | 'authed';

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
}

export interface MePatch {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  locale?: Locale;
  currentPassword?: string;
  newPassword?: string;
}

interface AuthContextValue {
  status: Status;
  user: User | null;
  isStaff: boolean;
  pushState: PushState | null;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
  updateMe: (patch: MePatch) => Promise<User>;
  refreshPush: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const saveUser = (u: User | null) =>
  (u ? SecureStore.setItemAsync(USER_KEY, JSON.stringify(u)) : SecureStore.deleteItemAsync(USER_KEY)).catch(() => undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [pushState, setPushState] = useState<PushState | null>(null);

  const applyUser = useCallback(async (u: User) => {
    setUser(u);
    void saveUser(u);
    // The server locale drives emails and pushes, so the app follows it.
    if (u.locale && u.locale !== currentLanguage()) await setAppLanguage(u.locale);
  }, []);

  const clearSession = useCallback(async () => {
    await tokenStore.clear();
    void saveUser(null);
    queryClient.clear();
    setUser(null);
    setPushState(null);
    setStatus('guest');
  }, []);

  // Boot: restore language + session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await restoreLanguage();
      const token = await tokenStore.load();
      if (!token) {
        if (!cancelled) setStatus('guest');
        return;
      }
      try {
        const { data } = await api.get<{ user: User | null }>('/auth/me');
        if (cancelled) return;
        if (data.user) {
          await applyUser(data.user);
          setStatus('authed');
        } else {
          await clearSession();
        }
      } catch (err) {
        if (cancelled) return;
        if (isUnauthorized(err)) {
          await clearSession();
          return;
        }
        // Offline start: trust the cached user; requests will retry when the network is back.
        const cached = await SecureStore.getItemAsync(USER_KEY).catch(() => null);
        if (cached) {
          setUser(JSON.parse(cached) as User);
          setStatus('authed');
        } else {
          await clearSession();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyUser, clearSession]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void clearSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  // Register this phone for push whenever someone is logged in.
  const userId = user?.id;
  useEffect(() => {
    if (status !== 'authed' || !userId) return;
    let cancelled = false;
    void registerForPush().then((s) => !cancelled && setPushState(s));
    return () => {
      cancelled = true;
    };
  }, [status, userId]);

  const startSession = useCallback(
    async (token: string, u: User) => {
      queryClient.clear();
      await tokenStore.save(token);
      await applyUser(u);
      setStatus('authed');
      return u;
    },
    [applyUser],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<{ user: User; token: string }>('/auth/login', { email: email.trim(), password });
      return startSession(data.token, data.user);
    },
    [startSession],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const { data } = await api.post<{ user: User; token: string }>('/auth/register', {
        ...input,
        email: input.email.trim(),
        phone: input.phone?.trim() || undefined,
        locale: currentLanguage(),
      });
      return startSession(data.token, data.user);
    },
    [startSession],
  );

  const logout = useCallback(async () => {
    await unregisterPush();
    await api.post('/auth/logout').catch(() => undefined);
    await clearSession();
  }, [clearSession]);

  const updateMe = useCallback(
    async (patch: MePatch) => {
      const { data } = await api.patch<{ user: User }>('/auth/me', patch);
      await applyUser(data.user);
      return data.user;
    },
    [applyUser],
  );

  const refreshPush = useCallback(async () => {
    setPushState(await registerForPush());
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isStaff: user?.role === 'STAFF' || user?.role === 'ADMIN',
      pushState,
      login,
      register,
      logout,
      updateMe,
      refreshPush,
    }),
    [status, user, pushState, login, register, logout, updateMe, refreshPush],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
