import { publish } from '../messaging/realtime.js';

/**
 * Live "who is looking at this record" presence for staff pages (case page, inquiry detail).
 *
 * In memory, one API instance only (no Redis needed): every open page sends a heartbeat every ~15 s; a viewer
 * whose last heartbeat is older than PRESENCE_TTL_MS is dropped. Each change (join, leave, editing on/off,
 * timeout) is pushed as the realtime event `viewers.updated` { kind, id, viewers } to everyone still viewing
 * the record and to the one who left, so the avatars update without polling.
 */

export const PRESENCE_KINDS = ['case', 'inquiry'] as const;
export type PresenceKind = (typeof PRESENCE_KINDS)[number];

/** A viewer is gone after this long without a heartbeat (client beats every 15 s). */
export const PRESENCE_TTL_MS = 45_000;
/** At most this many records per user at once (several tabs); the oldest is dropped. */
const MAX_RECORDS_PER_USER = 10;

export interface Viewer {
  userId: string;
  firstName: string;
  lastName: string;
  /** Form section the viewer is editing right now (e.g. "details"), or null when only viewing. */
  editing: string | null;
  since: string;
  lastSeen: string;
}

interface Entry {
  userId: string;
  firstName: string;
  lastName: string;
  editing: string | null;
  since: number;
  lastSeen: number;
}

const rooms = new Map<string, Map<string, Entry>>();
const roomKey = (kind: PresenceKind, id: string) => `${kind}:${id}`;
const parseKey = (key: string) => {
  const i = key.indexOf(':');
  return { kind: key.slice(0, i) as PresenceKind, id: key.slice(i + 1) };
};

const toViewer = (e: Entry): Viewer => ({
  userId: e.userId,
  firstName: e.firstName,
  lastName: e.lastName,
  editing: e.editing,
  since: new Date(e.since).toISOString(),
  lastSeen: new Date(e.lastSeen).toISOString(),
});

const viewersOf = (room: Map<string, Entry> | undefined): Viewer[] =>
  room ? [...room.values()].sort((a, b) => a.since - b.since || a.userId.localeCompare(b.userId)).map(toViewer) : [];

const announce = (key: string, extra: string[] = []) => {
  const { kind, id } = parseKey(key);
  const room = rooms.get(key);
  const viewers = viewersOf(room);
  const to = new Set([...(room?.keys() ?? []), ...extra]);
  if (to.size) publish([...to], 'viewers.updated', { kind, id, viewers });
};

/** Drops expired viewers of one room; true when something changed. */
const pruneRoom = (key: string, now: number, removed: string[] = []) => {
  const room = rooms.get(key);
  if (!room) return false;
  let changed = false;
  for (const [uid, e] of room) {
    if (now - e.lastSeen > PRESENCE_TTL_MS) {
      room.delete(uid);
      removed.push(uid);
      changed = true;
    }
  }
  if (room.size === 0) rooms.delete(key);
  return changed;
};

const roomsOfUser = (userId: string) => [...rooms.entries()].filter(([, r]) => r.has(userId));

/**
 * Join or refresh (heartbeat). `editing` = section being edited, or null. Returns the viewers after the change;
 * announces only when the set of viewers or someone's editing state changed.
 */
export const heartbeat = (
  kind: PresenceKind,
  id: string,
  user: { id: string; firstName: string; lastName: string },
  editing: string | null = null,
  now = Date.now(),
): Viewer[] => {
  const key = roomKey(kind, id);
  const removed: string[] = [];
  let changed = pruneRoom(key, now, removed);
  let room = rooms.get(key);
  if (!room) {
    room = new Map();
    rooms.set(key, room);
  }
  const prev = room.get(user.id);
  if (!prev) {
    // Several tabs / records per user are fine, but keep it bounded.
    const mine = roomsOfUser(user.id).sort(([, a], [, b]) => a.get(user.id)!.lastSeen - b.get(user.id)!.lastSeen);
    while (mine.length >= MAX_RECORDS_PER_USER) {
      const old = parseKey(mine.shift()![0]);
      leave(old.kind, old.id, user.id, now);
    }
    room.set(user.id, { userId: user.id, firstName: user.firstName, lastName: user.lastName, editing, since: now, lastSeen: now });
    changed = true;
  } else {
    if (prev.editing !== editing) changed = true;
    prev.editing = editing;
    prev.lastSeen = now;
    prev.firstName = user.firstName;
    prev.lastName = user.lastName;
  }
  if (changed) announce(key, removed);
  return viewersOf(room);
};

/** Leave one record (page closed / navigated away). Returns the remaining viewers. */
export const leave = (kind: PresenceKind, id: string, userId: string, now = Date.now()): Viewer[] => {
  const key = roomKey(kind, id);
  const removed: string[] = [];
  let changed = pruneRoom(key, now, removed);
  const room = rooms.get(key);
  if (room?.delete(userId)) {
    changed = true;
    removed.push(userId);
    if (room.size === 0) rooms.delete(key);
  }
  if (changed) announce(key, removed);
  return viewersOf(rooms.get(key));
};

/** Current viewers of a record (expired ones are dropped and announced). */
export const viewers = (kind: PresenceKind, id: string, now = Date.now()): Viewer[] => {
  const key = roomKey(kind, id);
  const removed: string[] = [];
  if (pruneRoom(key, now, removed)) announce(key, removed);
  return viewersOf(rooms.get(key));
};

/** Drops every expired viewer (timer below); returns how many were removed. */
export const sweep = (now = Date.now()) => {
  let n = 0;
  for (const key of [...rooms.keys()]) {
    const removed: string[] = [];
    if (pruneRoom(key, now, removed)) {
      n += removed.length;
      announce(key, removed);
    }
  }
  return n;
};

/** Test helper: forget everything. */
export const resetPresence = () => rooms.clear();

let timer: NodeJS.Timeout | null = null;
/** Starts the background sweep once (idempotent; unref'd so it never keeps the process alive). */
export const startPresenceSweep = (everyMs = 15_000) => {
  if (timer) return;
  timer = setInterval(() => sweep(), everyMs);
  timer.unref?.();
};
