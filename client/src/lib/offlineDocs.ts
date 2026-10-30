import { useSyncExternalStore } from 'react';
import { fileUrl } from './api';

/**
 * Offline documents (PWA, opt-in per document): the client's own uploads and an appointment card kept in Cache
 * Storage so they open at the embassy without internet. Privacy rules:
 *   - opt-in only ("Oflayn saxla" per document / "Termin məlumatı"), on this device only, never sent anywhere;
 *   - one scoped cache (OFFLINE_CACHE) tied to the user id in its index; cleared on logout (lib/auth), when another
 *     user logs in, and per item 30 days after it was saved (here on every portal start and in the service worker,
 *     which refuses to serve an expired item);
 *   - size caps: MAX_FILE_BYTES per file, MAX_TOTAL_BYTES in all.
 * Layout of the cache: `/__offline/index.json` (OfflineIndex) and `/__offline/doc/<documentId>` (the file). The
 * service worker (public/sw.js) serves both under those URLs, and /offline-docs.html (public/offline-docs.js) lists
 * them when the portal cannot load. Not encrypted at rest: Cache Storage is per-origin and per browser profile.
 */

export const OFFLINE_CACHE = 'tv-offline-v1';
export const INDEX_URL = '/__offline/index.json';
export const docUrl = (id: string) => `/__offline/doc/${id}`;
export const OFFLINE_PAGE = '/offline-docs.html';
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 80 * 1024 * 1024;
export const KEEP_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export interface OfflineDoc {
  id: string;
  caseId: string;
  caseNumber: string | null;
  name: string;
  title: string | null;
  mimeType: string;
  size: number;
  savedAt: string;
}

export interface OfflineCase {
  id: string;
  number: string;
  who: string | null; // family member's name (null: the main applicant)
  appointment: { at: string; place: string | null } | null;
  cards: { kind: string; at: string; days: number; place: string | null; detail: string | null; text: string }[];
}

export interface OfflineIndex {
  v: 1;
  userId: string;
  holder: string;
  lang: string;
  /** Copy for the static offline page, in the user's language at save time. */
  labels: Record<string, string>;
  docs: OfflineDoc[];
  appointment: { savedAt: string; cases: OfflineCase[] } | null;
}

export const offlineSupported = () => typeof window !== 'undefined' && 'caches' in window && window.isSecureContext !== false;

// ─── Store (React) ───────────────────────────────────────────────────

let snapshot: OfflineIndex | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** The current index (null: nothing kept offline); re-renders on every change. */
export const useOfflineIndex = () =>
  useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => null,
  );

const open = () => caches.open(OFFLINE_CACHE);

export const readIndex = async (): Promise<OfflineIndex | null> => {
  if (!offlineSupported()) return null;
  try {
    const res = await (await open()).match(INDEX_URL);
    const idx = res ? ((await res.json()) as OfflineIndex) : null;
    return idx && idx.v === 1 ? idx : null;
  } catch {
    return null;
  }
};

const writeIndex = async (idx: OfflineIndex | null) => {
  const cache = await open();
  if (!idx || (!idx.docs.length && !idx.appointment)) {
    await caches.delete(OFFLINE_CACHE);
    snapshot = null;
  } else {
    await cache.put(INDEX_URL, new Response(JSON.stringify(idx), { headers: { 'content-type': 'application/json' } }));
    snapshot = idx;
  }
  emit();
};

export const expired = (savedAt: string, now = Date.now()) => now - new Date(savedAt).getTime() > KEEP_DAYS * DAY;

/** Portal start: load the index, drop expired items and everything of another user. */
export const initOffline = async (userId: string | null) => {
  if (!offlineSupported()) return;
  const idx = await readIndex();
  if (!idx) {
    snapshot = null;
    emit();
    return;
  }
  if (!userId || idx.userId !== userId) {
    await clearOffline();
    return;
  }
  const cache = await open();
  const keep = idx.docs.filter((d) => !expired(d.savedAt));
  await Promise.all(idx.docs.filter((d) => !keep.includes(d)).map((d) => cache.delete(docUrl(d.id))));
  await writeIndex({ ...idx, docs: keep, appointment: idx.appointment && !expired(idx.appointment.savedAt) ? idx.appointment : null });
};

/** Logout / user change: everything offline goes. */
export const clearOffline = async () => {
  if (!offlineSupported()) return;
  await caches.delete(OFFLINE_CACHE).catch(() => false);
  snapshot = null;
  emit();
};

const baseIndex = (prev: OfflineIndex | null, who: { userId: string; holder: string; lang: string; labels: Record<string, string> }): OfflineIndex => ({
  v: 1,
  userId: who.userId,
  holder: who.holder,
  lang: who.lang,
  labels: who.labels,
  docs: prev?.userId === who.userId ? prev.docs : [],
  appointment: prev?.userId === who.userId ? prev.appointment : null,
});

export type SaveError = 'UNSUPPORTED' | 'TOO_BIG' | 'FULL' | 'FAILED';

/** Downloads one own document (cookies) into the offline cache. */
export const saveDocOffline = async (
  doc: { id: string; caseId: string; originalName: string; mimeType: string; size: number },
  meta: { caseNumber: string | null; title: string | null },
  who: { userId: string; holder: string; lang: string; labels: Record<string, string> },
): Promise<SaveError | null> => {
  if (!offlineSupported()) return 'UNSUPPORTED';
  if (doc.size > MAX_FILE_BYTES) return 'TOO_BIG';
  const prev = await readIndex();
  const idx = baseIndex(prev, who);
  const used = idx.docs.filter((d) => d.id !== doc.id).reduce((a, d) => a + d.size, 0);
  if (used + doc.size > MAX_TOTAL_BYTES) return 'FULL';
  try {
    const res = await fetch(fileUrl(doc.id), { credentials: 'include' });
    if (!res.ok) return 'FAILED';
    const blob = await res.blob();
    if (blob.size > MAX_FILE_BYTES) return 'TOO_BIG';
    const cache = await open();
    await cache.put(
      docUrl(doc.id),
      new Response(blob, {
        headers: {
          'content-type': doc.mimeType || blob.type || 'application/octet-stream',
          'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`,
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; img-src 'self' blob: data:; style-src 'unsafe-inline'; sandbox",
        },
      }),
    );
    const entry: OfflineDoc = { id: doc.id, caseId: doc.caseId, caseNumber: meta.caseNumber, name: doc.originalName, title: meta.title, mimeType: doc.mimeType, size: blob.size, savedAt: new Date().toISOString() };
    await writeIndex({ ...idx, docs: [...idx.docs.filter((d) => d.id !== doc.id), entry] });
    return null;
  } catch {
    return 'FAILED';
  }
};

export const removeDocOffline = async (id: string) => {
  const idx = await readIndex();
  if (!idx) return;
  await (await open()).delete(docUrl(id));
  await writeIndex({ ...idx, docs: idx.docs.filter((d) => d.id !== id) });
};

/** "Termin məlumatı": the appointment card(s) and countdowns for the offline page. */
export const saveAppointmentOffline = async (cases: OfflineCase[], who: { userId: string; holder: string; lang: string; labels: Record<string, string> }) => {
  if (!offlineSupported()) return 'UNSUPPORTED' as const;
  const idx = baseIndex(await readIndex(), who);
  await writeIndex({ ...idx, appointment: { savedAt: new Date().toISOString(), cases } });
  return null;
};

export const removeAppointmentOffline = async () => {
  const idx = await readIndex();
  if (idx) await writeIndex({ ...idx, appointment: null });
};

/** Opens a kept file even when the service worker does not control the tab (blob URL from the cache). */
export const openOfflineDoc = async (id: string) => {
  const res = await (await open()).match(docUrl(id));
  if (!res) return false;
  const url = URL.createObjectURL(await res.blob());
  window.open(url, '_blank', 'noopener');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
};
