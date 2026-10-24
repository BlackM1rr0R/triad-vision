import axios, { AxiosError } from 'axios';

export const api = axios.create({ baseURL: '/api', withCredentials: true });

// The interface language (set on <html lang> by i18n), so texts the API builds itself (calendar items,
// generated labels) follow the language the user is looking at, not only their profile setting.
api.interceptors.request.use((cfg) => {
  const ui = typeof document !== 'undefined' ? document.documentElement.lang.slice(0, 2) : '';
  // Turkish / Ukrainian exist on the public site only; the API works in the four content languages (→ English).
  const lang = ui === 'tr' || ui === 'uk' ? 'en' : ui;
  if (lang) cfg.headers.set('X-Locale', lang);
  return cfg;
});

/** Machine-readable error code returned by the server ({ error: 'CODE' }), or 'NETWORK'. */
export const errorCode = (err: unknown): string => {
  if (err instanceof AxiosError) {
    const code = (err.response?.data as { error?: string } | undefined)?.error;
    if (code) return code;
    if (err.response?.status === 413) return 'FILE_TOO_LARGE';
    if (err.response?.status === 429) return 'TOO_MANY_REQUESTS';
    if (err.response?.status === 401) return 'UNAUTHENTICATED';
    return 'NETWORK';
  }
  return 'UNKNOWN';
};

// ─── "View as client" (read-only impersonation) ───────────────────────

/** Set from GET /auth/me while an admin views a client's portal (see components/privacyTools). */
export interface ImpersonationState {
  id: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
  returnTo: string | null;
  admin: { id: string; firstName: string; lastName: string; role: string };
}

let impersonationState: ImpersonationState | null = null;
const impersonationListeners = new Set<() => void>();
export const getImpersonation = () => impersonationState;
export const setImpersonation = (s: ImpersonationState | null) => {
  if (JSON.stringify(s) === JSON.stringify(impersonationState)) return;
  impersonationState = s;
  impersonationListeners.forEach((fn) => fn());
};
export const subscribeImpersonation = (fn: () => void) => {
  impersonationListeners.add(fn);
  return () => {
    impersonationListeners.delete(fn);
  };
};

/** Requests that stay possible while viewing read-only: leaving the view and logging out. */
const IMPERSONATION_ALLOWED = ['/admin/impersonate/stop', '/auth/logout'];
let readOnlyHandler: (() => void) | null = null;
/** Registers the toast shown when a write is attempted while viewing (ImpersonationBanner). */
export const onReadOnlyBlocked = (fn: (() => void) | null) => {
  readOnlyHandler = fn;
};
let endedHandler: (() => void) | null = null;
/** Called when the server says the view ended (expired / stopped elsewhere). */
export const onImpersonationEnded = (fn: (() => void) | null) => {
  endedHandler = fn;
};

// While viewing: mutating calls never leave the browser (the server would refuse them anyway), and every
// call tells the server which portal page is on screen (kept in the view's audit trail).
api.interceptors.request.use((cfg) => {
  if (!impersonationState) return cfg;
  const method = (cfg.method ?? 'get').toUpperCase();
  const url = (cfg.url ?? '').replace(/^\/api/, '').split('?')[0];
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !IMPERSONATION_ALLOWED.includes(url)) {
    readOnlyHandler?.();
    const err = new AxiosError('IMPERSONATION_READ_ONLY', 'ERR_IMPERSONATION_READ_ONLY', cfg, null, {
      status: 403,
      statusText: 'Forbidden',
      data: { error: 'IMPERSONATION_READ_ONLY' },
      headers: {},
      config: cfg,
    });
    return Promise.reject(err);
  }
  if (typeof window !== 'undefined') cfg.headers.set('X-Page-Path', window.location.pathname.slice(0, 200));
  return cfg;
});

export const fileUrl = (docId: string, download = false) => `/api/files/${docId}${download ? '?download=1' : ''}`;

/** Staff workspace file: inline preview (only for `previewable` files) or attachment download. */
export const docFileUrl = (fileId: string, download = false) => `/api/docs/files/${fileId}${download ? '?download=1' : ''}`;
export const docExportUrl = (folderId: string, path = '') =>
  `/api/docs/folders/${folderId}/export${path ? `?path=${encodeURIComponent(path)}` : ''}`;

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

// ─── Session loss ───────────────────────────────────────────────────────

/** Auth endpoints answer 401 as part of their normal contract (wrong password etc.), never as "session lost". */
const AUTH_URLS = ['/auth/login', '/auth/register', '/auth/me', '/auth/logout', '/auth/forgot-password', '/auth/reset-password'];

export type SessionLostReason = 'UNAUTHENTICATED' | 'SESSION_EXPIRED' | 'SESSION_REVOKED' | 'INVALID_TOKEN';
type SessionLostHandler = (reason: SessionLostReason) => void;

let sessionLostHandler: SessionLostHandler | null = null;

/** Registers the single app-level handler run when a protected request answers 401 (see AuthProvider). */
export const onSessionLost = (handler: SessionLostHandler | null) => {
  sessionLostHandler = handler;
};

api.interceptors.response.use(
  (res) => {
    if (impersonationState && res.headers?.['x-impersonation-ended']) endedHandler?.();
    return res;
  },
  (err: unknown) => {
    if (err instanceof AxiosError && err.response?.status === 401) {
      const url = (err.config?.url ?? '').replace(/^\/api/, '');
      if (!AUTH_URLS.some((u) => url === u || url.startsWith(`${u}?`))) {
        const code = (err.response.data as { error?: string } | undefined)?.error;
        const reason: SessionLostReason =
          code === 'SESSION_EXPIRED' || code === 'SESSION_REVOKED' || code === 'INVALID_TOKEN' ? code : 'UNAUTHENTICATED';
        sessionLostHandler?.(reason);
      }
    }
    return Promise.reject(err);
  },
);
