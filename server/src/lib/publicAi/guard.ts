/**
 * Strict in-memory limits of the public advisor (per IP and per visitor session). The anonymous budget is
 * tiny, so these are deliberately tight; the global daily dollar cap (settings.publicDailyUsd) sits on top.
 * Counters live in this process only — the API runs as a single instance.
 */

export const IP_PER_HOUR = 15;
export const IP_PER_DAY = 40;
export const SESSION_TURNS = 12;
export const QUIZ_EXPLAIN_PER_HOUR = 6;
export const LEADS_PER_HOUR = 5;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const hits = new Map<string, number[]>();
const sessions = new Map<string, { turns: number; at: number }>();

const prune = (list: number[], now: number, window: number) => {
  while (list.length && list[0] <= now - window) list.shift();
};

/**
 * Counts one hit for `key` unless a window is full: returns the name of the exhausted window
 * ('hour' | 'day') without counting, or null after counting.
 */
export const takeHit = (key: string, limits: { hour?: number; day?: number }, now = Date.now()): 'hour' | 'day' | null => {
  const list = hits.get(key) ?? [];
  prune(list, now, DAY);
  const lastHour = list.filter((t) => t > now - HOUR).length;
  if (limits.hour !== undefined && lastHour >= limits.hour) return 'hour';
  if (limits.day !== undefined && list.length >= limits.day) return 'day';
  list.push(now);
  hits.set(key, list);
  if (hits.size > 20_000) {
    for (const [k, v] of hits) {
      prune(v, now, DAY);
      if (!v.length) hits.delete(k);
    }
  }
  return null;
};

/** Turns used so far by a visitor session. */
export const sessionTurns = (id: string) => sessions.get(id)?.turns ?? 0;

export const takeSessionTurn = (id: string, now = Date.now()) => {
  const s = sessions.get(id);
  const turns = (s && now - s.at < DAY ? s.turns : 0) + 1;
  sessions.set(id, { turns, at: s && now - s.at < DAY ? s.at : now });
  if (sessions.size > 20_000) {
    for (const [k, v] of sessions) if (now - v.at >= DAY) sessions.delete(k);
  }
  return turns;
};

/** Clears every counter (tests). */
export const resetPublicAiGuards = () => {
  hits.clear();
  sessions.clear();
};
