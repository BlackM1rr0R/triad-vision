/**
 * Sync of learning-game results to the server for signed-in clients ("Germany Ready", /account/germany-ready).
 *
 * Games call `useReadyReport()` and report a finished round; visitors who are not signed in as a client (and staff
 * viewing the portal as a client) send nothing. Results are queued, sent in small batches (POST
 * /api/account/ready/results) and never block or throw: the games keep working offline / logged out with their
 * localStorage progress. The server checks every activity id against its registry copy and clamps the scores;
 * the results are self-reported practice, not exam results.
 */
import { useCallback } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, getImpersonation } from '@/lib/api';
import { loadProgress, saveProgress } from '@/lib/games/common';
import { readyActivity, type ReadyActivityId } from './activities';

export interface ReadyReport {
  activityId: ReadyActivityId;
  /** Scene / module / sentence id for item-based activities. */
  item?: string;
  score: number;
  max: number;
  /** ISO time of the completion (defaults to now). The same completion sent twice is stored once. */
  completedAt?: string;
  /** Optional client-side de-duplication key (e.g. "interview:EMBASSY:12"): reported once per browser. */
  dedupeKey?: string;
}

export const READY_QUERY_KEY = 'germany-ready';
const ITEM_RE = /^[A-Za-z0-9-]{1,40}$/;
const SENT_KEY = 'ready.sent';
const SENT_MAX = 400;
const BATCH = 50;

let queue: Omit<ReadyReport, 'dedupeKey'>[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let client: QueryClient | null = null;

const flush = async () => {
  timer = null;
  const batch = queue.slice(0, BATCH);
  queue = queue.slice(BATCH);
  if (!batch.length) return;
  try {
    await api.post('/account/ready/results', { results: batch });
    void client?.invalidateQueries({ queryKey: [READY_QUERY_KEY] });
  } catch {
    /* offline / rate-limited / logged out meanwhile: the local progress stays, nothing else to do */
  }
  if (queue.length) timer = setTimeout(() => void flush(), 1500);
};

/** A report in the shape the server accepts, or null (unknown activity / item, nonsense numbers). */
export const toPayload = (r: ReadyReport, now = new Date()): Omit<ReadyReport, 'dedupeKey'> | null => {
  const a = readyActivity(r.activityId);
  if (!a || a.source !== 'client') return null;
  if (!Number.isFinite(r.score) || !Number.isFinite(r.max) || r.max <= 0) return null;
  const item = r.item?.slice(0, 40);
  if (a.items && (!item || !ITEM_RE.test(item) || (a.items !== 'any' && !a.items.includes(item)))) return null;
  if (!a.items && item) return null;
  return { activityId: r.activityId, ...(item ? { item } : {}), score: Math.round(r.score), max: Math.round(r.max), completedAt: r.completedAt ?? now.toISOString() };
};

const alreadySent = (key: string) => loadProgress<string[]>(SENT_KEY, []).includes(key);
const markSent = (key: string) => saveProgress(SENT_KEY, [...loadProgress<string[]>(SENT_KEY, []).filter((k) => k !== key), key].slice(-SENT_MAX));

/** Queues one result (signed-in clients only). Safe to call from anywhere; never throws. */
export const reportReady = (qc: QueryClient, r: ReadyReport) => {
  try {
    const me = qc.getQueryData<{ role?: string } | null>(['me']);
    if (!me || me.role !== 'CLIENT' || getImpersonation()) return;
    if (r.dedupeKey && alreadySent(r.dedupeKey)) return;
    const p = toPayload(r);
    if (!p) return;
    if (r.dedupeKey) markSent(r.dedupeKey);
    client = qc;
    queue.push(p);
    if (!timer) timer = setTimeout(() => void flush(), 800);
  } catch {
    /* never break a game */
  }
};

/** `report({ activityId, item?, score, max })` for game components. */
export const useReadyReport = () => {
  const qc = useQueryClient();
  return useCallback((r: ReadyReport) => reportReady(qc, r), [qc]);
};

// ─── One-off import of the best results kept in this browser ─────────────

const IMPORT_AT_KEY = 'ready.importAt';

/**
 * Best results the games saved in localStorage before the client signed in → reports. A fixed "import time" is kept
 * per browser, so importing twice stores nothing new (the server de-duplicates by completion time).
 */
export const localBests = (): ReadyReport[] => {
  let at = loadProgress<string | null>(IMPORT_AT_KEY, null);
  if (!at || Number.isNaN(Date.parse(at))) {
    at = new Date().toISOString();
    saveProgress(IMPORT_AT_KEY, at);
  }
  const out: ReadyReport[] = [];
  const pctMap = (key: string, activityId: ReadyActivityId) => {
    const m = loadProgress<Record<string, number>>(key, {});
    if (m && typeof m === 'object') for (const [item, pct] of Object.entries(m)) if (typeof pct === 'number') out.push({ activityId, item, score: pct, max: 100, completedAt: at! });
  };
  pctMap('simulator.best', 'german-simulator');
  pctMap('pron.best', 'pronunciation');
  const price = loadProgress<number>('price.best', 0);
  if (typeof price === 'number' && price > 0) out.push({ activityId: 'price-game', score: price, max: 1000, completedAt: at });
  const signs = loadProgress<number | null>('signs.best', null);
  if (typeof signs === 'number') out.push({ activityId: 'traffic-signs', score: signs, max: 100, completedAt: at });
  return out.map((r) => toPayload(r)).filter((r): r is NonNullable<typeof r> => !!r) as ReadyReport[];
};

/** Sends the browser's stored bests at once (button on /account/germany-ready); returns how many were new. */
export const importLocalBests = async () => {
  const all = localBests();
  let stored = 0;
  for (let i = 0; i < all.length; i += BATCH) {
    const r = await api.post<{ stored: number }>('/account/ready/results', { results: all.slice(i, i + BATCH) });
    stored += r.data.stored;
  }
  return { found: all.length, stored };
};
