import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, onSessionLost, type SessionLostReason } from './api';
import { isStaffRole, type Role, type SessionInfo, type User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Query keys holding public CMS data that is safe to keep after logout. */
const PUBLIC_QUERY_KEYS = new Set(['content', 'posts', 'post', 'visa', 'service']);

/** Web sessions expire after this much inactivity (mirrors the server's idle timeout). */
const IDLE_LIMIT_MS = 30 * 60 * 1000;
/** A warning toast is shown this long before the idle logout. */
const IDLE_WARN_MS = 2 * 60 * 1000;
/** Activity events are sampled at most once per this interval. */
const ACTIVITY_THROTTLE_MS = 1000;
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;

const SESSION_TOAST_ID = 'session-lost';
const IDLE_TOAST_ID = 'idle-warning';

/** Where to send the user back after logging in again: path + query + hash of the current page. */
export const currentHref = (loc: { pathname: string; search: string; hash: string }) => `${loc.pathname}${loc.search}${loc.hash}`;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get<{ user: User | null; session?: SessionInfo }>('/auth/me')).data.user,
    staleTime: 5 * 60 * 1000,
  });

  const setUser = (u: User | null) => qc.setQueryData(['me'], u);
  const dropPrivateQueries = () =>
    qc.removeQueries({ predicate: (q) => !PUBLIC_QUERY_KEYS.has(String(q.queryKey[0])) && q.queryKey[0] !== 'me' });

  /**
   * Logs out instantly: the UI switches to "logged out" before the server round-trip, and only
   * private data is dropped (public site content stays cached, so the next page renders at once).
   */
  const logout = async () => {
    qc.setQueryData(['me'], null);
    dropPrivateQueries();
    try {
      await api.post('/auth/logout');
    } catch {
      // cookie is short-lived anyway; the UI is already logged out
    }
  };

  const user = data ?? null;

  // Latest values for the long-lived listeners below (they are registered once per login).
  const latest = useRef({ location, t, i18n, user });
  latest.current = { location, t, i18n, user };

  /** Translated "session ended" text; the admin panel is Azerbaijani-only regardless of the site language. */
  const sessionMessage = (key: 'sessionExpired' | 'sessionRevoked' | 'sessionInvalid' | 'idleWarning' | 'idleLoggedOut') => {
    const { location: loc, t: tr, i18n: i } = latest.current;
    return loc.pathname.startsWith('/admin') ? i.getFixedT('az')(`auth.${key}`) : tr(`auth.${key}`);
  };

  /** Drops the session on the client, tells the user once, and sends them to the login page. */
  const sessionLost = (reason: SessionLostReason | 'IDLE') => {
    const { location: loc } = latest.current;
    const wasLoggedIn = !!qc.getQueryData(['me']);
    qc.setQueryData(['me'], null);
    dropPrivateQueries();
    if (!wasLoggedIn) return;
    const key = reason === 'IDLE' ? 'idleLoggedOut' : reason === 'SESSION_REVOKED' ? 'sessionRevoked' : reason === 'INVALID_TOKEN' ? 'sessionInvalid' : 'sessionExpired';
    toast.dismiss(IDLE_TOAST_ID);
    toast.error(sessionMessage(key), { id: SESSION_TOAST_ID });
    if (loc.pathname !== '/login') navigate('/login', { replace: true, state: { from: currentHref(loc) } });
  };
  const sessionLostRef = useRef(sessionLost);
  sessionLostRef.current = sessionLost;

  // 401 on any protected request → the session is gone server-side.
  useEffect(() => {
    onSessionLost((reason) => sessionLostRef.current(reason));
    return () => onSessionLost(null);
  }, []);

  // Client-side idle logout: one timer, activity only updates a timestamp (no re-render per event).
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let lastActivity = Date.now();
    let lastSample = 0;
    let warned = false;
    let timer = 0;

    const schedule = () => {
      window.clearTimeout(timer);
      const elapsed = Date.now() - lastActivity;
      const next = (warned ? IDLE_LIMIT_MS : IDLE_LIMIT_MS - IDLE_WARN_MS) - elapsed;
      timer = window.setTimeout(tick, Math.max(next, 1000));
    };
    const tick = () => {
      const elapsed = Date.now() - lastActivity;
      if (elapsed >= IDLE_LIMIT_MS) {
        window.clearTimeout(timer);
        void api.post('/auth/logout').catch(() => undefined);
        sessionLostRef.current('IDLE');
        return;
      }
      if (elapsed >= IDLE_LIMIT_MS - IDLE_WARN_MS && !warned) {
        warned = true;
        toast.warning(sessionMessage('idleWarning'), { id: IDLE_TOAST_ID, duration: IDLE_WARN_MS });
      }
      schedule();
    };
    const onActivity = () => {
      const now = Date.now();
      if (now - lastSample < ACTIVITY_THROTTLE_MS) return;
      lastSample = now;
      lastActivity = now;
      if (warned) {
        warned = false;
        toast.dismiss(IDLE_TOAST_ID);
        schedule();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      // Timers are throttled in background tabs: re-check the clock first, then count the return as activity.
      if (Date.now() - lastActivity >= IDLE_LIMIT_MS) tick();
      else onActivity();
    };

    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    schedule();
    return () => {
      window.clearTimeout(timer);
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
      toast.dismiss(IDLE_TOAST_ID);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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
  if (!user) return <Navigate to="/login" replace state={{ from: currentHref(location) }} />;
  // Staff who land on a client-only page (or vice versa) go to their own area instead of a dead end.
  if (roles && !roles.includes(user.role)) return <Navigate to={isStaffRole(user.role) ? '/admin' : '/'} replace />;
  return <>{children}</>;
};

/** Where a freshly logged-in user goes: back to the page they were bounced from, if it belongs to their area. */
export const landingAfterLogin = (role: Role, from?: unknown) => {
  const staff = isStaffRole(role);
  const home = staff ? '/admin' : '/account';
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return home;
  const adminTarget = from === '/admin' || from.startsWith('/admin/') || from.startsWith('/admin?');
  if (staff) return adminTarget ? from : home;
  return adminTarget ? home : from;
};
