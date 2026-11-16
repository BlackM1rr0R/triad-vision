/**
 * Per-key rate limiting of the public vacancy API (/api/public/v1). Pure fixed-window counter (unit-tested):
 * every key gets `limit` requests per window (one minute by default, the key's `rateLimitPerMinute`). In-process
 * memory only — the API runs as one instance; a restart simply starts a fresh window.
 */

export const WINDOW_MS = 60 * 1000;
/** Keys accepted: "tvp_" + 43 url-safe characters (32 random bytes, base64url). */
export const PUBLIC_KEY_PREFIX = 'tvp_';
export const PUBLIC_KEY_RE = /^tvp_[A-Za-z0-9_-]{20,100}$/;
/** The 12-character prefix stored and shown ("tvp_" + 8) — also the `src` of the apply links. */
export const KEY_PREFIX_RE = /^tvp_[A-Za-z0-9_-]{8}$/;

export interface HitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Milliseconds until the current window ends. */
  resetMs: number;
}

export class FixedWindowLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(private windowMs = WINDOW_MS, private maxEntries = 10_000) {}

  hit(key: string, limit: number, now = Date.now()): HitResult {
    const lim = Math.max(1, Math.floor(limit));
    let w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      if (!w && this.windows.size >= this.maxEntries) this.sweep(now);
      w = { start: now, count: 0 };
      this.windows.set(key, w);
    }
    w.count += 1;
    const resetMs = Math.max(0, w.start + this.windowMs - now);
    return { allowed: w.count <= lim, limit: lim, remaining: Math.max(0, lim - w.count), resetMs };
  }

  reset(key?: string) {
    if (key) this.windows.delete(key);
    else this.windows.clear();
  }

  /** Drops finished windows (bounded memory). */
  private sweep(now: number) {
    for (const [k, w] of this.windows) if (now - w.start >= this.windowMs) this.windows.delete(k);
  }
}

/** Response headers of a hit (IETF RateLimit header fields draft, + Retry-After on 429). */
export const rateLimitHeaders = (r: HitResult): Record<string, string> => {
  const reset = Math.max(1, Math.ceil(r.resetMs / 1000));
  return {
    'RateLimit-Limit': String(r.limit),
    'RateLimit-Remaining': String(r.remaining),
    'RateLimit-Reset': String(reset),
    ...(r.allowed ? {} : { 'Retry-After': String(reset) }),
  };
};

/** The API key of a request: `Authorization: Bearer tvp_…` or `X-API-Key: tvp_…`; anything else → undefined. */
export const parsePublicApiKey = (authorization: string | undefined, xApiKey: string | undefined): string | undefined => {
  const fromAuth = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : undefined;
  const token = fromAuth || xApiKey?.trim();
  return token && PUBLIC_KEY_RE.test(token) ? token : undefined;
};
