/** Per-user preferences of the staff navigation (localStorage; private windows / blocked storage fall back to memory). */

export const readJson = <T>(key: string, fallback: T, valid: (v: unknown) => v is T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v: unknown = JSON.parse(raw);
    return valid(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

export const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep the in-memory state only */
  }
};

export const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Keys are per user: two staff members sharing a browser keep their own menu. */
export const navGroupsKey = (userId: string | undefined) => `tv-admin-nav-groups:${userId ?? 'anon'}`;
export const navPinsKey = (userId: string | undefined) => `tv-admin-nav-pins:${userId ?? 'anon'}`;
export const recentKey = (userId: string | undefined) => `tv-cmdk-recent:${userId ?? 'anon'}`;

// ─── Recent palette entries ─────────────────────────────────────────────

export type RecentKind = 'nav' | 'action' | 'case' | 'user' | 'company' | 'vacancy' | 'file' | 'task';

export interface RecentEntry {
  /** Unique per target: `${kind}:${id}`. */
  key: string;
  kind: RecentKind;
  /** Nav / action id (labels are re-translated) or the record id. */
  id: string;
  label: string;
  sub?: string;
  href: string;
  /** File entries: folder or file icon. */
  folder?: boolean;
}

export const RECENT_MAX = 8;

const isRecent = (v: unknown): v is RecentEntry[] =>
  Array.isArray(v) &&
  v.every((x) => x && typeof x === 'object' && typeof (x as RecentEntry).key === 'string' && typeof (x as RecentEntry).href === 'string' && typeof (x as RecentEntry).label === 'string');

export const readRecent = (userId: string | undefined) => readJson<RecentEntry[]>(recentKey(userId), [], isRecent).slice(0, RECENT_MAX);

export const pushRecent = (userId: string | undefined, entry: RecentEntry) => {
  const next = [entry, ...readRecent(userId).filter((e) => e.key !== entry.key)].slice(0, RECENT_MAX);
  writeJson(recentKey(userId), next);
  return next;
};

export const clearRecent = (userId: string | undefined) => writeJson(recentKey(userId), []);
