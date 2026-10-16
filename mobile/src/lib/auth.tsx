import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, setUnauthorizedHandler, tokenStore } from './api';
import { isUnauthorized } from './errors';
import { clearDocumentCache } from './native';
import { clearLastPushResponse, registerForPush, unregisterPush, type PushState } from './push';
import { queryClient } from './queryClient';
import { currentLanguage, restoreLanguage, setAppLanguage } from '@/i18n';
import { registerLegalCopy } from '@/i18n/legal';
import { isStaffRole, type AuthFailure, type Locale, type SessionInfo, type User } from '@/types';

const USER_KEY = 'tv_user';

registerLegalCopy();

/** Login answer for accounts with two-factor authentication: no session yet, only a 10-minute challenge. */
type TwoFactorChallengeResponse = { twoFactorRequired: true; challenge: string } & Partial<TwoFactorInfo>;

/** How the pending login can be finished (from POST /auth/login). */
export interface TwoFactorInfo {
  /** 'totp' = authenticator app; 'email' = a code was emailed. */
  method: 'totp' | 'email';
  /** Other ways ('email' = "send a code to my email instead", 'recovery' = recovery code). */
  alternatives: ('email' | 'recovery')[];
  /** Masked address the code goes to (a***@gmail.com). */
  email?: string;
  /** Email method: false when the send throttle kept the server from mailing a fresh code. */
  emailSent?: boolean;
  /** Seconds until another code may be requested. */
  retryAfter?: number | null;
}
const isChallenge = (d: unknown): d is TwoFactorChallengeResponse =>
  !!d && typeof d === 'object' && (d as { twoFactorRequired?: unknown }).twoFactorRequired === true && typeof (d as { challenge?: unknown }).challenge === 'string';

/** Second login factor: the 6-digit app code, a one-time recovery code or the code sent by email. */
export type TwoFactorInput = { code: string } | { recoveryCode: string } | { emailCode: string };

type Status = 'loading' | 'guest' | 'authed';

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  /** With country code; required for candidates (the API normalises spaces / dashes). */
  phone: string;
  /** YYYY-MM-DD, as in the passport. */
  birthDate: string;
  /** Foreign passport number (letters and digits, upper case). */
  passportNumber: string;
  password: string;
  /** Agent referral code (sign-up link ?ref=CODE); unknown or paused codes are ignored by the API. */
  ref?: string;
  /** The form was filled from a passport photo (logged as a PASSPORT_OCR consent). */
  passportScanned?: boolean;
}

export interface MePatch {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  locale?: Locale;
  currentPassword?: string;
  newPassword?: string;
  /** Phone-channel preferences (profile screen switches). */
  whatsappOptIn?: boolean;
  smsNotifications?: boolean;
}

/** Why the last session ended on the server side; shown once to the user, then cleared. */
export type SessionEndReason = AuthFailure;

interface AuthContextValue {
  status: Status;
  user: User | null;
  session: SessionInfo | null;
  isStaff: boolean;
  pushState: PushState | null;
  /** Set when the server ended the session (expired / revoked / invalid); consumed by SessionNotice. */
  sessionEndReason: SessionEndReason | null;
  clearSessionEndReason: () => void;
  /**
   * Resolves with the user, or with null when the account uses two-factor authentication: then
   * `twoFactorPending` is set and the caller continues with verifyTwoFactor (screen /two-factor).
   */
  login: (email: string, password: string) => Promise<User | null>;
  /** True between a password login that needs 2FA and its completion/cancellation. */
  twoFactorPending: boolean;
  /** Method and alternatives of the pending 2FA login (null when none is pending). */
  twoFactor: TwoFactorInfo | null;
  verifyTwoFactor: (input: TwoFactorInput) => Promise<User>;
  /** Mails a (new) login code for the pending challenge: the email method or the fallback from TOTP. */
  sendTwoFactorEmail: () => Promise<{ email: string; retryAfter: number }>;
  cancelTwoFactor: () => void;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
  updateMe: (patch: MePatch) => Promise<User>;
  /** Registers this phone for push, asking for permission if needed (profile screen switch). */
  refreshPush: () => Promise<PushState>;
  /** Stops push on this phone (profile screen switch off). */
  disablePush: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthResponse = { user: User; token: string; session?: SessionInfo };
type MeResponse = { user: User | null; session?: SessionInfo; reason?: AuthFailure };

/**
 * What we keep in SecureStore for offline starts. iOS SecureStore warns above 2 KB, so only the
 * identity fields are cached — never the full profile.
 */
type CachedUser = Pick<User, 'id' | 'email' | 'role' | 'firstName' | 'lastName' | 'locale'>;

const toCached = (u: User): CachedUser => ({ id: u.id, email: u.email, role: u.role, firstName: u.firstName, lastName: u.lastName, locale: u.locale });

const saveUser = (u: User | null) =>
  (u ? SecureStore.setItemAsync(USER_KEY, JSON.stringify(toCached(u))) : SecureStore.deleteItemAsync(USER_KEY)).catch(() => undefined);

/** Parses the cached user; a corrupt or foreign value counts as "no cache". */
const parseCachedUser = (raw: string | null): User | null => {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<CachedUser> | null;
    if (!v || typeof v !== 'object' || typeof v.id !== 'string' || typeof v.email !== 'string' || typeof v.role !== 'string') return null;
    return {
      id: v.id,
      email: v.email,
      role: v.role,
      firstName: typeof v.firstName === 'string' ? v.firstName : '',
      lastName: typeof v.lastName === 'string' ? v.lastName : '',
      locale: v.locale ?? 'az',
      phone: null,
    };
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [pushState, setPushState] = useState<PushState | null>(null);
  const [sessionEndReason, setSessionEndReason] = useState<SessionEndReason | null>(null);
  // Kept in memory only (never persisted): the challenge is useless after 10 minutes anyway.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [twoFactor, setTwoFactor] = useState<TwoFactorInfo | null>(null);
  // A 401 can arrive from several in-flight requests at once (and from our own best-effort
  // DELETE /devices during the clear): only the first one clears the session.
  const clearing = useRef(false);

  const applyUser = useCallback(async (u: User, s?: SessionInfo | null) => {
    setUser(u);
    if (s !== undefined) setSession(s);
    void saveUser(u);
    // The server locale drives emails and pushes, so the app follows it.
    if (u.locale && u.locale !== currentLanguage()) await setAppLanguage(u.locale);
  }, []);

  /**
   * Forgets everything about the current user on this phone. `reason` is set when the server ended
   * the session (401 / GET /auth/me without user) and is surfaced once to the user.
   */
  const clearSession = useCallback(async (reason?: AuthFailure) => {
    if (clearing.current) return;
    clearing.current = true;
    try {
      // Best effort: with a dead token the DELETE fails, but the local push token is forgotten either way.
      await unregisterPush();
      await tokenStore.clear();
      void saveUser(null);
      void clearLastPushResponse();
      void clearDocumentCache();
      queryClient.clear();
      setUser(null);
      setSession(null);
      setPushState(null);
      if (reason) setSessionEndReason(reason);
      setStatus('guest');
    } finally {
      clearing.current = false;
    }
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
        const { data } = await api.get<MeResponse>('/auth/me');
        if (cancelled) return;
        if (data.user) {
          await applyUser(data.user, data.session ?? null);
          setStatus('authed');
        } else {
          await clearSession(data.reason ?? 'UNAUTHENTICATED');
        }
      } catch (err) {
        if (cancelled) return;
        if (isUnauthorized(err)) {
          // The axios interceptor already started clearSession with the server's reason; this is a no-op then.
          await clearSession();
          return;
        }
        // Offline start: trust the cached user; requests will retry when the network is back.
        const cached = parseCachedUser(await SecureStore.getItemAsync(USER_KEY).catch(() => null));
        if (cached) {
          setUser(cached);
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
    setUnauthorizedHandler((reason) => {
      void clearSession(reason);
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  // Register this phone for push whenever someone is logged in — silently, i.e. only when the user
  // already allowed notifications. The profile screen asks for permission explicitly.
  const userId = user?.id;
  useEffect(() => {
    if (status !== 'authed' || !userId) return;
    let cancelled = false;
    void registerForPush({ requestPermission: false }).then((s) => !cancelled && setPushState(s));
    return () => {
      cancelled = true;
    };
  }, [status, userId]);

  const startSession = useCallback(
    async (data: AuthResponse) => {
      queryClient.clear();
      setSessionEndReason(null);
      await tokenStore.save(data.token);
      await applyUser(data.user, data.session ?? null);
      setStatus('authed');
      return data.user;
    },
    [applyUser],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<AuthResponse | TwoFactorChallengeResponse>('/auth/login', { email: email.trim(), password });
      if (isChallenge(data)) {
        setChallenge(data.challenge);
        setTwoFactor({
          method: data.method === 'email' ? 'email' : 'totp',
          alternatives: Array.isArray(data.alternatives) ? data.alternatives : ['recovery'],
          email: data.email,
          emailSent: data.emailSent,
          retryAfter: data.retryAfter,
        });
        return null;
      }
      setChallenge(null);
      return startSession(data);
    },
    [startSession],
  );

  const verifyTwoFactor = useCallback(
    async (input: TwoFactorInput) => {
      if (!challenge) throw Object.assign(new Error('TWO_FACTOR_CHALLENGE_INVALID'), { response: { status: 401, data: { error: 'TWO_FACTOR_CHALLENGE_INVALID' } } });
      try {
        const { data } = await api.post<AuthResponse>('/auth/2fa/verify', { challenge, ...input });
        setChallenge(null);
        return await startSession(data);
      } catch (err) {
        const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        if (code === 'TWO_FACTOR_CHALLENGE_INVALID' || code === 'ACCOUNT_LOCKED') setChallenge(null);
        throw err;
      }
    },
    [challenge, startSession],
  );

  const sendTwoFactorEmail = useCallback(async () => {
    if (!challenge) throw Object.assign(new Error('TWO_FACTOR_CHALLENGE_INVALID'), { response: { status: 401, data: { error: 'TWO_FACTOR_CHALLENGE_INVALID' } } });
    try {
      const { data } = await api.post<{ ok: true; email: string; retryAfter: number }>('/auth/2fa/email/send', { challenge });
      return { email: data.email, retryAfter: data.retryAfter };
    } catch (err) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (code === 'TWO_FACTOR_CHALLENGE_INVALID' || code === 'ACCOUNT_LOCKED') setChallenge(null);
      throw err;
    }
  }, [challenge]);

  const cancelTwoFactor = useCallback(() => setChallenge(null), []);

  const register = useCallback(
    async (input: RegisterInput) => {
      const { data } = await api.post<AuthResponse>('/auth/register', {
        ...input,
        email: input.email.trim(),
        phone: input.phone.trim(),
        locale: currentLanguage(),
      });
      return startSession(data);
    },
    [startSession],
  );

  const logout = useCallback(async () => {
    await unregisterPush();
    // Revokes the server session (cookie + bearer) before the token is forgotten locally.
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
    const next = await registerForPush({ requestPermission: true });
    setPushState(next);
    return next;
  }, []);

  const disablePush = useCallback(async () => {
    await unregisterPush();
    setPushState('not-asked');
  }, []);

  const clearSessionEndReason = useCallback(() => setSessionEndReason(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      session,
      isStaff: isStaffRole(user?.role),
      pushState,
      sessionEndReason,
      clearSessionEndReason,
      login,
      twoFactorPending: !!challenge,
      twoFactor: challenge ? twoFactor : null,
      verifyTwoFactor,
      sendTwoFactorEmail,
      cancelTwoFactor,
      register,
      logout,
      updateMe,
      refreshPush,
      disablePush,
    }),
    [
      status,
      user,
      session,
      pushState,
      sessionEndReason,
      clearSessionEndReason,
      login,
      challenge,
      twoFactor,
      verifyTwoFactor,
      sendTwoFactorEmail,
      cancelTwoFactor,
      register,
      logout,
      updateMe,
      refreshPush,
      disablePush,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
