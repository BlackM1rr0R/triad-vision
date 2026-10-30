import { useSyncExternalStore } from 'react';

/**
 * The client portal's "current case" (family switcher): which of the client's own cases — main application or a
 * family member's (Case.parentCaseId) — the sections are about. Remembered per user in localStorage, so it survives
 * reloads and new tabs; `?case=<id>` deep links and opening a case page set it (components/portal/FamilySwitcher).
 * The server only ever honours own case ids (GET /api/account/next-step?case=, /overview?case=), so a stale or
 * foreign id simply falls back to the default case.
 */

const KEY = 'tv_portal_case';
const ID = /^[A-Za-z0-9_-]{1,40}$/;

interface Stored {
  userId: string;
  caseId: string;
}

const read = (): Stored | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null;
    return raw && typeof raw.userId === 'string' && typeof raw.caseId === 'string' && ID.test(raw.caseId) ? raw : null;
  } catch {
    return null;
  }
};

let current: Stored | null = typeof window === 'undefined' ? null : read();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      current = read();
      fn();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
};

/** The chosen case id of this user (null: none chosen → the server's default case). */
export const chosenCaseOf = (userId: string | null | undefined) => (userId && current?.userId === userId ? current.caseId : null);

export const setChosenCase = (userId: string, caseId: string | null) => {
  if (caseId && !ID.test(caseId)) return;
  if ((current?.userId === userId ? current.caseId : null) === caseId) return;
  current = caseId ? { userId, caseId } : null;
  try {
    if (current) localStorage.setItem(KEY, JSON.stringify(current));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: kept in memory for this tab */
  }
  emit();
};

/** Logout: forget the choice (the next user of the browser starts on their own default). */
export const clearChosenCase = () => {
  current = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
};

/** React hook: the chosen case id of the logged-in user, re-rendering on every switch (also from other tabs). */
export const useChosenCase = (userId: string | null | undefined) =>
  useSyncExternalStore(
    subscribe,
    () => chosenCaseOf(userId),
    () => null,
  );

/** `path` with `?case=<id>` set (or removed for null), keeping the other query parameters and the hash. */
export const withCaseParam = (path: string, caseId: string | null) => {
  const [beforeHash, hash = ''] = path.split('#');
  const [p, q = ''] = beforeHash.split('?');
  const params = new URLSearchParams(q);
  if (caseId) params.set('case', caseId);
  else params.delete('case');
  const qs = params.toString();
  return `${p}${qs ? `?${qs}` : ''}${hash ? `#${hash}` : ''}`;
};
