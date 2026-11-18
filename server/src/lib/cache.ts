/**
 * Tiny in-process cache for public CMS reads. Content changes rarely and every admin
 * write clears it, so a short TTL only bounds staleness if the DB is edited directly.
 */
const store = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
const TTL_MS = 5 * 60 * 1000;
/**
 * Upper bound on stored keys (per-path SEO bodies are keyed by URL): beyond it expired entries go first, then the
 * oldest ones. A dropped entry is simply loaded again on its next read, so this only bounds memory.
 */
export const CACHE_MAX_ENTRIES = 2000;

const remember = (key: string, value: unknown) => {
  store.delete(key); // re-inserted at the end: Map order = age
  store.set(key, { at: Date.now(), value });
  if (store.size <= CACHE_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, e] of store) if (now - e.at >= TTL_MS) store.delete(k);
  for (const k of store.keys()) {
    if (store.size <= CACHE_MAX_ENTRIES) break;
    store.delete(k);
  }
};

export const cached = async <T>(key: string, load: () => Promise<T>): Promise<T> => {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  // Collapse concurrent misses into one DB round-trip.
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = load()
    .then((value) => {
      remember(key, value);
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
};

export const clearCache = () => {
  store.clear();
};

/** Number of stored keys (tests). */
export const cacheSize = () => store.size;
