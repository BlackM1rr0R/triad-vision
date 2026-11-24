/**
 * Browser error log (server: lib/browserErrors, admin page "Brauzer xətaları"). Reports uncaught errors, unhandled
 * rejections, React render errors, failed chunk loads and API 5xx to /api/site/client-errors with fetch
 * (not the axios client, so a failing report can never report itself). The server stores the role / user id from the
 * session, trims the stack, strips secrets and URL queries; the client only limits volume:
 * each distinct error is sent once per page load, at most MAX_PER_PAGE per page load.
 */

export type ClientErrorKind = 'error' | 'rejection' | 'react' | 'chunk' | 'api5xx';

const MAX_PER_PAGE = 15;
const sent = new Set<string>();

const CHUNK_RE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk|Loading CSS chunk|Unable to preload CSS/i;
export const isChunkErrorMessage = (message: string) => CHUNK_RE.test(message);

const NOISE_RE = /ResizeObserver loop|^Script error\.?$|AbortError|The operation was aborted|Non-Error promise rejection|Java object is gone|^Load failed$|^Failed to fetch$|NetworkError when attempting/i;

/** Build id: the hash in the entry chunk's file name (/assets/index-XXXX.js); "dev" on the Vite dev server. */
const release = () => {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.src ?? '';
  const m = /\/assets\/([^/]+)\.js/.exec(src);
  return m ? m[1].slice(0, 40) : 'dev';
};

export const reportClientError = (kind: ClientErrorKind, error: unknown, extra: { stack?: string; message?: string } = {}) => {
  try {
    if (typeof window === 'undefined' || window.location.hostname === 'localhost') return;
    const err = error instanceof Error ? error : null;
    const message = (extra.message ?? err?.message ?? (typeof error === 'string' ? error : '')).trim();
    if (!message || NOISE_RE.test(message)) return;
    const stack = extra.stack ?? err?.stack ?? '';
    if (/(?:chrome|moz|safari)-extension:\/\//i.test(stack)) return;
    const effectiveKind: ClientErrorKind = kind !== 'api5xx' && isChunkErrorMessage(message) ? 'chunk' : kind;
    const key = `${effectiveKind}|${message.slice(0, 200)}|${stack.split('\n')[1] ?? ''}`;
    if (sent.has(key) || sent.size >= MAX_PER_PAGE) return;
    sent.add(key);
    // Only the path travels (no query, no hash): the server drops the rest anyway.
    const route = `${window.location.pathname}`;
    void fetch('/api/site/client-errors', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: effectiveKind, message: message.slice(0, 1000), stack: stack.slice(0, 4000), route, release: release(), userAgent: navigator.userAgent.slice(0, 300) }),
    }).catch(() => undefined);
  } catch {
    /* reporting must never break the page */
  }
};

let installed = false;
/** Global handlers (uncaught errors, unhandled rejections, failed preloads). Called from installDiagnostics. */
export const installErrorReporter = () => {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => {
    // Resource load errors (img / script) arrive here without an Error; only script errors with a message matter.
    if (e.target && e.target !== window) return;
    reportClientError('error', e.error ?? e.message, { message: e.error?.message ?? e.message });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    if (r instanceof Error && r.name === 'AxiosError') return; // API failures: 5xx are reported by the interceptor, the rest is normal
    reportClientError('rejection', r, { message: r instanceof Error ? r.message : typeof r === 'string' ? r : undefined });
  });
  window.addEventListener('vite:preloadError', (e) => {
    const payload = (e as Event & { payload?: unknown }).payload;
    reportClientError('chunk', payload instanceof Error ? payload : new Error('Failed to fetch dynamically imported module'));
  });
};
