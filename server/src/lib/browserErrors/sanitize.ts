import crypto from 'node:crypto';

/**
 * Browser error reports (client errors sent to /api/site/client-errors): everything that arrives is untrusted and
 * may carry personal data (e-mail addresses, tokens in URLs, ids). Only the pieces below are ever stored.
 */

export const ERROR_KINDS = ['error', 'rejection', 'react', 'chunk', 'api5xx'] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];

/** Query parameters that are safe (no identifiers, no tokens) and useful to find the page again. */
export const SAFE_QUERY_KEYS = ['tab', 'lang', 'page', 'step', 'status', 'view', 'sort'] as const;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]*)?/g;
const SECRET_PAIR_RE = /\b(token|access_token|refresh_token|password|passwd|secret|authorization|api[_-]?key|apikey)\s*[=:]\s*["']?[^\s"',}&]+/gi;
const BEARER_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const LONG_TOKEN_RE = /\b(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{32,}\b/g;
const URL_QUERY_RE = /([?#])[^\s"')<>]*/g;

const ID_SEGMENT_RE = /^(?:c[a-z0-9]{20,30}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|[A-Za-z0-9_-]{22,}|\d{3,})$/;

/** Removes e-mail addresses, tokens and other secret-looking values from a free text. */
export const scrubText = (s: string): string =>
  s
    .replace(EMAIL_RE, '<email>')
    .replace(JWT_RE, '<token>')
    .replace(BEARER_RE, '$1 <token>')
    .replace(SECRET_PAIR_RE, '$1=<hidden>')
    .replace(LONG_TOKEN_RE, '<token>');

/**
 * Page route without personal data: only the path (ids replaced by ":id"), the hash is dropped and only the
 * allowlisted query parameters stay. Accepts a full URL or a path.
 */
export const sanitizeRoute = (raw: string): string => {
  let pathname = '';
  let search = '';
  try {
    const u = new URL(raw, 'https://x.invalid');
    pathname = u.pathname;
    search = u.search;
  } catch {
    pathname = raw.split(/[?#]/)[0];
  }
  const path = pathname
    .split('/')
    .map((p) => {
      let seg = p;
      try {
        seg = decodeURIComponent(p);
      } catch {
        /* keep the raw segment */
      }
      if (seg.includes('@')) return ':email';
      return ID_SEGMENT_RE.test(seg) ? ':id' : p;
    })
    .join('/')
    .slice(0, 250);
  const params = new URLSearchParams(search);
  const kept = SAFE_QUERY_KEYS.flatMap((k) => {
    const v = params.get(k);
    return v && /^[A-Za-z0-9_.-]{1,30}$/.test(v) ? [`${k}=${v}`] : [];
  });
  return `${path || '/'}${kept.length ? `?${kept.join('&')}` : ''}`.slice(0, 300);
};

/** Message for storage and grouping: secrets removed, URL queries cut, whitespace collapsed. */
export const sanitizeMessage = (raw: string): string =>
  scrubText(raw.replace(URL_QUERY_RE, '$1…'))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);

/** A stack frame without build hashes ("index-AbC12xYz.js" becomes "index-*.js"), origin, query and line/column. */
const normaliseFrame = (line: string): string =>
  line
    .replace(URL_QUERY_RE, '')
    .replace(/https?:\/\/[^/\s)]+/g, '')
    .replace(/([A-Za-z0-9_.-]+?)-[A-Za-z0-9_-]{6,12}\.(js|mjs|css)/g, '$1-*.$2')
    .replace(/:\d+:\d+\)?$/, '')
    .replace(/\s+/g, ' ')
    .trim();

const isFrame = (l: string) => /^\s*at\s/.test(l) || /@.*:\d+/.test(l);

/** First 8 frames, secrets scrubbed, URL queries removed; at most 1500 characters. */
export const trimStack = (raw: string | undefined | null): string => {
  if (!raw) return '';
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const frames = lines.filter(isFrame);
  const head = lines.filter((l) => !isFrame(l)).slice(0, 1);
  return scrubText([...head, ...frames.slice(0, 8)].map((l) => l.replace(URL_QUERY_RE, '')).join('\n')).slice(0, 1500);
};

/** The first frame of a stack, normalised so that the same error in two builds gives the same value. */
export const topFrame = (stack: string): string => {
  const frame = stack.split('\n').find(isFrame);
  return frame ? normaliseFrame(frame).slice(0, 300) : '';
};

/** Message with the parts that vary per occurrence (numbers, ids) replaced. */
const normaliseMessage = (message: string): string =>
  message
    .replace(/<token>|<email>/g, '#')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '#')
    .replace(/\bc[a-z0-9]{20,30}\b/g, '#')
    .replace(/\d+/g, '#')
    .toLowerCase();

/** Same kind + same message shape + same top frame = same error. */
export const fingerprint = (kind: string, message: string, stack: string): string =>
  crypto.createHash('sha1').update(`${kind}\n${normaliseMessage(message)}\n${topFrame(stack)}`).digest('hex');

/**
 * Noise that carries no information: browser quirks, cancelled requests, browser extensions, cross-origin
 * "Script error.", plain connectivity failures. Dropped before anything is stored.
 */
export const isNoise = (message: string, stack: string): boolean =>
  /ResizeObserver loop|^Script error\.?$|AbortError|The operation was aborted|Non-Error promise rejection|Java object is gone|^Load failed$|NetworkError when attempting|^Failed to fetch$/i.test(message) ||
  /(?:chrome|moz|safari)-extension:\/\//i.test(stack);
