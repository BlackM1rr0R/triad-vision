/**
 * Cross-tab idle tracking for the web idle logout (lib/auth.tsx). Every tab of the same login shares one
 * "last activity" time in localStorage (the `storage` event tells the other tabs), so a tab in the background
 * never logs the user out while they work in another tab: the logout happens only once ALL tabs were idle.
 * The value is scoped to the user id, so a different login in the same browser never keeps an old one alive.
 */

export const IDLE_ACTIVITY_KEY = 'tv_last_activity';
/** Activity is written to the shared store at most this often (each write wakes every other tab). */
export const SHARED_WRITE_THROTTLE_MS = 5000;

/** Stored form: "<userId>:<epoch ms>". */
export const encodeActivity = (userId: string, at: number) => `${userId}:${Math.round(at)}`;

/** The shared time of this user, or null (other user, missing or malformed). */
export const decodeActivity = (raw: string | null | undefined, userId: string): number | null => {
  if (!raw) return null;
  const i = raw.lastIndexOf(':');
  if (i <= 0 || raw.slice(0, i) !== userId) return null;
  const at = Number(raw.slice(i + 1));
  return Number.isFinite(at) && at > 0 ? at : null;
};

/** The latest activity of all tabs: this tab's own time or the shared one, whichever is newer (never in the future). */
export const latestActivity = (own: number, shared: number | null, now = Date.now()) => Math.min(Math.max(own, shared ?? 0), now);

export const readSharedActivity = (userId: string): number | null => {
  try {
    return decodeActivity(localStorage.getItem(IDLE_ACTIVITY_KEY), userId);
  } catch {
    return null; // storage blocked: each tab counts on its own
  }
};

export const writeSharedActivity = (userId: string, at: number) => {
  try {
    localStorage.setItem(IDLE_ACTIVITY_KEY, encodeActivity(userId, at));
  } catch {
    // storage blocked / full: nothing to share
  }
};

export const clearSharedActivity = () => {
  try {
    localStorage.removeItem(IDLE_ACTIVITY_KEY);
  } catch {
    // ignore
  }
};
