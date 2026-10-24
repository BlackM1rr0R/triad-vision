import { useSyncExternalStore } from 'react';

/**
 * Who is visiting the public site: a worker / candidate or an employer.
 *
 * Chosen on the home page ("Who are you?" or the audience cards further down) and remembered in
 * this browser (localStorage 'tv.audience'), so a returning visitor sees their own content first. Nothing is
 * sent to the server; without storage (private mode, crawlers) the site simply shows both audiences.
 */
export type Audience = 'worker' | 'employer';

export const AUDIENCE_KEY = 'tv.audience';

/** Landing page of each audience. */
export const AUDIENCE_PATH: Record<Audience, string> = { worker: '/for-workers', employer: '/for-employers' };

/** Matching value of the CMS `audience` field (Service, Faq) and Testimonial.kind. */
export const CONTENT_AUDIENCE: Record<Audience, 'candidate' | 'company'> = { worker: 'candidate', employer: 'company' };

const isAudience = (v: unknown): v is Audience => v === 'worker' || v === 'employer';

const read = (): Audience | null => {
  try {
    const v = localStorage.getItem(AUDIENCE_KEY);
    return isAudience(v) ? v : null;
  } catch {
    return null;
  }
};

let current: Audience | null = typeof window === 'undefined' ? null : read();
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  // Another tab changed it.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== AUDIENCE_KEY) return;
    current = read();
    fn();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
};

export const getAudience = () => current;

export const setAudience = (a: Audience | null) => {
  if (a === current) return;
  current = a;
  try {
    if (a) localStorage.setItem(AUDIENCE_KEY, a);
    else localStorage.removeItem(AUDIENCE_KEY);
  } catch {
    /* storage unavailable: the choice lasts for this page view only */
  }
  listeners.forEach((fn) => fn());
};

/** The remembered audience (null = not chosen yet) and its setter. */
export const useAudience = () => {
  const audience = useSyncExternalStore(subscribe, getAudience, () => null);
  return [audience, setAudience] as const;
};
