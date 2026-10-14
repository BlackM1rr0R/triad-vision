import { config } from '../config.js';

/**
 * Per-account brute-force protection (in addition to the per-IP rate limit): after
 * `maxFailures` wrong passwords the account is locked for `lockMinutes`. Kept in memory, which
 * is enough for a single API instance; a shared store would be needed for several instances.
 */
interface Entry {
  failures: number;
  firstAt: number;
  lockedUntil: number;
}

const entries = new Map<string, Entry>();
const WINDOW_MS = 15 * 60 * 1000;

const key = (email: string) => email.trim().toLowerCase();

export const loginLockedFor = (email: string): number => {
  const e = entries.get(key(email));
  if (!e) return 0;
  const now = Date.now();
  if (e.lockedUntil > now) return Math.ceil((e.lockedUntil - now) / 1000);
  if (now - e.firstAt > WINDOW_MS) entries.delete(key(email));
  return 0;
};

export const recordLoginFailure = (email: string) => {
  const k = key(email);
  const now = Date.now();
  const e = entries.get(k);
  if (!e || now - e.firstAt > WINDOW_MS) {
    entries.set(k, { failures: 1, firstAt: now, lockedUntil: 0 });
    return;
  }
  e.failures += 1;
  if (e.failures >= config.login.maxFailures) e.lockedUntil = now + config.login.lockMinutes * 60 * 1000;
};

export const recordLoginSuccess = (email: string) => {
  entries.delete(key(email));
};

/** Test hook. */
export const resetLoginGuard = () => entries.clear();

// Drop stale entries so the map cannot grow without bound.
const sweep = () => {
  const now = Date.now();
  for (const [k, e] of entries) if (e.lockedUntil < now && now - e.firstAt > WINDOW_MS) entries.delete(k);
};
if (!config.isTest) setInterval(sweep, 5 * 60 * 1000).unref();
