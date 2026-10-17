import axios, { AxiosError } from 'axios';

export const api = axios.create({ baseURL: '/api', withCredentials: true });

// The interface language (set on <html lang> by i18n), so texts the API builds itself (calendar items,
// generated labels) follow the language the user is looking at, not only their profile setting.
api.interceptors.request.use((cfg) => {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang.slice(0, 2) : '';
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
  (res) => res,
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
