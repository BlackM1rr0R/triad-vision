/**
 * Pure helpers of the staff power features (no imports: the server unit tests load this file directly,
 * tests/unit/staffPowerPure.test.ts).
 */

// ─── Selection ──────────────────────────────────────────────────────────

/** Ids between `from` and `to` (inclusive) in list order; empty when either is not on the page. */
export const rangeBetween = (ids: string[], from: string, to: string) => {
  const a = ids.indexOf(from);
  const b = ids.indexOf(to);
  if (a < 0 || b < 0) return [];
  return ids.slice(Math.min(a, b), Math.max(a, b) + 1);
};

// ─── Table settings ─────────────────────────────────────────────────────

/** Column order: saved order (known ids) with new columns inserted after their closest preceding default neighbour. */
export const orderColumns = (defs: { id: string }[], order: string[] | undefined) => {
  if (!order?.length) return defs.map((d) => d.id);
  const known = new Set(defs.map((d) => d.id));
  const out = [...new Set(order.filter((id) => known.has(id)))];
  defs.forEach((d, i) => {
    if (out.includes(d.id)) return;
    const prev = defs.slice(0, i).reverse().find((p) => out.includes(p.id));
    out.splice(prev ? out.indexOf(prev.id) + 1 : 0, 0, d.id);
  });
  return out;
};

/** Moves `id` to `toIndex` (clamped) in a list of ids. */
export const moveId = (list: string[], id: string, toIndex: number) => {
  const rest = list.filter((x) => x !== id);
  rest.splice(Math.max(0, Math.min(rest.length, toIndex)), 0, id);
  return rest;
};

// ─── Saved views ────────────────────────────────────────────────────────

const TRANSIENT = new Set(['page', 'selected', 'open', 'id', 'sv']);

/** The URL params a saved view keeps (filters / sort), without pagination or the open row. */
export const viewParams = (entries: Iterable<[string, string]>) => {
  const out: Record<string, string> = {};
  for (const [k, v] of entries) if (!TRANSIENT.has(k) && v) out[k] = v;
  return out;
};

export const sameParams = (a: Record<string, string>, b: Record<string, string>) => {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
};

// ─── Review queue ───────────────────────────────────────────────────────

export type Decision = 'ACCEPTED' | 'REJECTED';
export interface QueueState {
  /** Queue order from the server (oldest upload first). */
  order: string[];
  /** Decisions taken in this session (optimistic: the request may still be inside its undo window). */
  decided: Record<string, Decision>;
  skipped: string[];
  current: string | null;
}

export const initialQueue = (ids: string[]): QueueState => ({ order: ids, decided: {}, skipped: [], current: ids[0] ?? null });

/** Documents still waiting in this session (skipped ones stay in the queue). */
export const remaining = (s: QueueState) => s.order.filter((id) => !s.decided[id]);

/** New server order (refetch): keeps local decisions and the current document when it is still there. */
export const syncQueue = (s: QueueState, ids: string[]): QueueState => {
  const known = new Set(ids);
  const order = [...ids, ...s.order.filter((id) => !known.has(id) && s.decided[id])];
  const left = order.filter((id) => !s.decided[id]);
  const current = s.current && left.includes(s.current) ? s.current : left[0] ?? null;
  return { ...s, order, current };
};

/** J / K: next / previous waiting document (stops at the ends). */
export const step = (s: QueueState, delta: 1 | -1): QueueState => {
  const left = remaining(s);
  if (!left.length) return { ...s, current: null };
  const i = s.current ? left.indexOf(s.current) : -1;
  const next = i < 0 ? 0 : Math.min(left.length - 1, Math.max(0, i + delta));
  return { ...s, current: left[next] };
};

/** The document shown after `id` leaves the queue: the next one, or the previous when it was the last. */
const after = (left: string[], id: string) => {
  const i = left.indexOf(id);
  const rest = left.filter((x) => x !== id);
  if (!rest.length) return null;
  return rest[Math.min(i < 0 ? 0 : i, rest.length - 1)];
};

export const decide = (s: QueueState, id: string, d: Decision): QueueState => ({
  ...s,
  decided: { ...s.decided, [id]: d },
  current: s.current === id ? after(remaining(s), id) : s.current,
});

/** S: leave it for later — counted once, the cursor moves on (wraps to the first waiting document at the end). */
export const skip = (s: QueueState, id: string): QueueState => {
  const left = remaining(s);
  const i = left.indexOf(id);
  const next = left.length > 1 ? left[(i + 1) % left.length] : id;
  return { ...s, skipped: s.skipped.includes(id) ? s.skipped : [...s.skipped, id], current: next };
};

/** Z: the decision is taken back; the document is shown again. */
export const undoDecision = (s: QueueState, id: string): QueueState => {
  const { [id]: _drop, ...decided } = s.decided;
  return { ...s, decided, current: id };
};

export const sessionCounts = (s: QueueState) => {
  const values = Object.values(s.decided);
  return { accepted: values.filter((d) => d === 'ACCEPTED').length, rejected: values.filter((d) => d === 'REJECTED').length, skipped: s.skipped.filter((id) => !s.decided[id]).length };
};
