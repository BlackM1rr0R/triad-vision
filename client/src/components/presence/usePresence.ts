import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRealtime } from '@/lib/realtime';

/**
 * Live presence on a staff record (server: routes/admin/presence.ts, lib/presence/viewers.ts).
 * `usePresence(kind, id)` joins while mounted, beats every 15 s while the tab is visible, leaves on unmount /
 * page hide, and follows `viewers.updated` realtime events. Open edit forms announce themselves with
 * `useEditSignal(kind, id, section, open)`, so the others see "is editing" and a soft overwrite warning.
 */

export type PresenceKind = 'case' | 'inquiry';

export interface Viewer {
  userId: string;
  firstName: string;
  lastName: string;
  editing: string | null;
  since: string;
  lastSeen: string;
}

const BEAT_MS = 15_000;

// ─── Editing signal (which form sections are open on this tab) ─────────

const editing = new Map<string, string[]>();
const editListeners = new Set<() => void>();
const keyOf = (kind: PresenceKind, id: string) => `${kind}:${id}`;

const setEditing = (key: string, section: string, on: boolean) => {
  const cur = editing.get(key) ?? [];
  const next = on ? (cur.includes(section) ? cur : [...cur, section]) : cur.filter((s) => s !== section);
  if (next.length) editing.set(key, next);
  else editing.delete(key);
  editListeners.forEach((l) => l());
};

const subscribeEditing = (cb: () => void) => {
  editListeners.add(cb);
  return () => {
    editListeners.delete(cb);
  };
};

/** Marks a form section of a record as being edited on this tab while `active`. */
export const useEditSignal = (kind: PresenceKind, id: string | null | undefined, section: string, active: boolean) => {
  useEffect(() => {
    if (!id || !active) return;
    const key = keyOf(kind, id);
    setEditing(key, section, true);
    return () => setEditing(key, section, false);
  }, [kind, id, section, active]);
};

const useMyEditing = (kind: PresenceKind, id: string | null | undefined) =>
  useSyncExternalStore(
    subscribeEditing,
    () => (id ? (editing.get(keyOf(kind, id))?.[0] ?? null) : null),
    () => null,
  );

// ─── Presence ──────────────────────────────────────────────────────────

const leaveUrl = (kind: PresenceKind, id: string) => `/api/admin/presence/${kind}/${encodeURIComponent(id)}`;

// Several components may watch the same record (split panel → full case page): leave only when the last one
// unmounts, a moment later, so a navigation between them never drops the viewer (no leave / join race).
const mounted = new Map<string, number>();
const pendingLeave = new Map<string, number>();
const LEAVE_DELAY_MS = 1500;

const retain = (key: string) => {
  mounted.set(key, (mounted.get(key) ?? 0) + 1);
  const p = pendingLeave.get(key);
  if (p) {
    window.clearTimeout(p);
    pendingLeave.delete(key);
  }
};
const release = (key: string, kind: PresenceKind, id: string) => {
  const n = (mounted.get(key) ?? 1) - 1;
  if (n > 0) return void mounted.set(key, n);
  mounted.delete(key);
  pendingLeave.set(
    key,
    window.setTimeout(() => {
      pendingLeave.delete(key);
      if (!mounted.has(key)) void api.delete(`/admin/presence/${kind}/${encodeURIComponent(id)}`).catch(() => undefined);
    }, LEAVE_DELAY_MS),
  );
};

export const usePresence = (kind: PresenceKind, id: string | null | undefined, opts: { enabled?: boolean } = {}) => {
  const { user } = useAuth();
  const enabled = (opts.enabled ?? true) && !!id && !!user;
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const myEditing = useMyEditing(kind, id);
  const editingRef = useRef(myEditing);
  editingRef.current = myEditing;
  const stopped = useRef(false);

  const beat = useCallback(async () => {
    if (!id || stopped.current || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
    try {
      const r = await api.post<{ viewers: Viewer[] }>(`/admin/presence/${kind}/${encodeURIComponent(id)}`, { editing: editingRef.current });
      setViewers(r.data.viewers);
    } catch (err) {
      // Unknown record or no access: stop beating for this mount.
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 404 || status === 403) stopped.current = true;
    }
  }, [kind, id]);

  useEffect(() => {
    if (!enabled || !id) return;
    stopped.current = false;
    setViewers([]);
    const key = keyOf(kind, id);
    retain(key);
    void beat();
    const timer = window.setInterval(() => void beat(), BEAT_MS);
    const onVisible = () => document.visibilityState === 'visible' && void beat();
    const onHide = () => {
      try {
        void fetch(leaveUrl(kind, id), { method: 'DELETE', credentials: 'include', keepalive: true });
      } catch {
        /* best effort: the server drops us after the TTL anyway */
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onHide);
      release(key, kind, id);
    };
  }, [enabled, kind, id, beat]);

  // Editing on / off goes out at once (not with the next beat); the mount beat above covers the initial state.
  const lastEditing = useRef(myEditing);
  useEffect(() => {
    if (lastEditing.current === myEditing) return;
    lastEditing.current = myEditing;
    if (enabled) void beat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myEditing]);

  useRealtime('viewers.updated', (p) => {
    if (!enabled || p.kind !== kind || p.id !== id || !Array.isArray(p.viewers)) return;
    setViewers(p.viewers as Viewer[]);
  });

  const others = viewers.filter((v) => v.userId !== user?.id);
  return { viewers, others, editors: others.filter((v) => v.editing) };
};
