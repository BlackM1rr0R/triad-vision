import { AxiosError } from 'axios';
import { api } from './api';

/**
 * Tiny diagnostics for "Problem bildir": the last 20 client-side errors (console.error, uncaught errors,
 * unhandled promise rejections) in a ring buffer and the last failed API call. Imported once, early, by
 * main.tsx; nothing leaves the browser unless the user sends a problem report.
 */

const MAX = 20;
const errors: string[] = [];

export interface ApiErrorInfo {
  method?: string;
  url?: string;
  status?: number | null;
  code?: string;
  requestId?: string;
  at: string;
}
let lastApiError: ApiErrorInfo | null = null;

const short = (v: unknown): string => {
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? `\n${v.stack.split('\n').slice(1, 4).join('\n')}` : ''}`;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

// Values that look like secrets or e-mail addresses are blanked before they are kept.
const scrub = (s: string) =>
  s
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
    .replace(/(token|password|secret|authorization)=?["':\s]*[^\s"',}]+/gi, '$1=<hidden>');

const push = (entry: string) => {
  errors.push(`${new Date().toISOString().slice(11, 19)} ${scrub(entry).slice(0, 500)}`);
  if (errors.length > MAX) errors.splice(0, errors.length - MAX);
};

let installed = false;
export const installDiagnostics = () => {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      push(args.map(short).join(' '));
    } catch {
      /* never break logging */
    }
    original(...args);
  };
  window.addEventListener('error', (e) => push(`Uncaught ${e.error ? short(e.error) : e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => push(`Unhandled rejection: ${short(e.reason)}`));
  api.interceptors.response.use(undefined, (err: unknown) => {
    if (err instanceof AxiosError && err.code !== 'ERR_CANCELED' && err.code !== 'ERR_IMPERSONATION_READ_ONLY') {
      const data = err.response?.data as { error?: string; requestId?: string } | undefined;
      lastApiError = {
        method: err.config?.method?.toUpperCase(),
        url: (err.config?.url ?? '').split('?')[0].slice(0, 200),
        status: err.response?.status ?? null,
        code: (data?.error ?? err.code ?? '').slice(0, 80),
        requestId: data?.requestId ?? (err.response?.headers?.['x-request-id'] as string | undefined),
        at: new Date().toISOString(),
      };
    }
    return Promise.reject(err);
  });
};

/** Build id: the hash in the entry chunk's file name (/assets/index-XXXX.js); "dev" on the Vite dev server. */
export const appVersion = () => {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.src ?? '';
  const m = /\/assets\/([^/]+)\.js/.exec(src);
  return m ? m[1].slice(0, 40) : 'dev';
};

const platform = () => {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'other';
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches ? ' · app' : '';
  return `${os}${standalone}`;
};

export const collectDiagnostics = () => ({
  pageUrl: window.location.href.slice(0, 500),
  appVersion: appVersion(),
  userAgent: navigator.userAgent.slice(0, 400),
  platform: platform(),
  screen: `${window.screen.width}x${window.screen.height}@${Math.round((window.devicePixelRatio || 1) * 10) / 10} · ${window.innerWidth}x${window.innerHeight}`,
  language: document.documentElement.lang.slice(0, 10),
  consoleErrors: [...errors],
  lastApiError,
});
