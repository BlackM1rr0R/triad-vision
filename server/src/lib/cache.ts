/**
 * Tiny in-process cache for public CMS reads. Content changes rarely and every admin
 * write clears it, so a short TTL only bounds staleness if the DB is edited directly.
 */
const store = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
const TTL_MS = 5 * 60 * 1000;

export const cached = async <T>(key: string, load: () => Promise<T>): Promise<T> => {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  // Collapse concurrent misses into one DB round-trip.
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = load()
    .then((value) => {
      store.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
};

export const clearCache = () => {
  store.clear();
};
