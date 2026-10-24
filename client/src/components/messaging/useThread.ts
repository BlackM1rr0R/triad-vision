import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CaseMessage } from '@/lib/types';
import { useRealtime, useRealtimeStatus } from '@/lib/realtime';

/** Case message as the messaging API returns it (CaseMessage + channel + read receipt). */
export interface ThreadMessage extends CaseMessage {
  channel?: 'app' | 'whatsapp' | 'sms' | string;
  readAt?: string | null;
  /** Messaging plus: detected language (automatic translation) and voice message (audio + transcript). */
  lang?: 'az' | 'de' | 'en' | 'ru' | null;
  voice?: import('@/components/messagingPlus/useTranslations').VoiceInfo | null;
  /** Client-side only: optimistic message waiting for the server (`failed` when the POST failed). */
  pending?: boolean;
  failed?: boolean;
}

export const threadKey = (caseId: string) => ['case-messages', caseId] as const;

/** Realtime payloads (see server/src/lib/messaging/caseMessages.ts). */
interface NewMessagePayload {
  caseId?: string;
  message?: ThreadMessage;
}
interface ReadPayload {
  caseId?: string;
  messageIds?: string[];
  readAt?: string;
}
interface TypingPayload {
  caseId?: string;
  userId?: string;
  name?: string;
}

const TYPING_SHOW_MS = 4000;
const TYPING_SEND_EVERY_MS = 2500;
const POLL_CONNECTED_MS = 60_000;
const POLL_FALLBACK_MS = 20_000;

const mergeById = (base: ThreadMessage[], incoming: ThreadMessage[]) => {
  const byId = new Map(base.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, { ...byId.get(m.id), ...m });
  return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

/**
 * One case conversation: messages (server list + realtime + optimistic sends), typing indicator,
 * read receipts and mark-as-read when the thread is visible.
 *
 *  - `base` is the REST prefix: '/cases' (portal) or '/admin/cases' (staff).
 *  - `initial` seeds the list from the already loaded case detail.
 *  - `meId` tells which messages are "mine" (for ticks) and which typing events to ignore.
 *  - `onNewMessage` lets the caller invalidate its own case query.
 */
export const useThread = (opts: { caseId: string; base: '/cases' | '/admin/cases'; initial: ThreadMessage[]; meId: string; onNewMessage?: () => void }) => {
  const { caseId, base, initial, meId } = opts;
  const qc = useQueryClient();
  const status = useRealtimeStatus();
  const connected = status === 'open';
  const key = threadKey(caseId);

  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<{ messages: ThreadMessage[] }>(`${base}/${caseId}/messages`)).data.messages,
    // The stream delivers changes instantly; polling stays as a safety net and slows down while connected.
    refetchInterval: connected ? POLL_CONNECTED_MS : POLL_FALLBACK_MS,
    refetchOnWindowFocus: true,
    staleTime: 5000,
  });

  // Optimistic messages live outside the query cache so a refetch never wipes them.
  const [pending, setPending] = useState<ThreadMessage[]>([]);
  const messages = useMemo(() => mergeById(mergeById(initial, data ?? []), pending), [initial, data, pending]);

  const onNewRef = useRef(opts.onNewMessage);
  onNewRef.current = opts.onNewMessage;

  const upsert = useCallback(
    (m: ThreadMessage) => qc.setQueryData<ThreadMessage[]>(key, (old) => mergeById(old ?? [], [m])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, caseId],
  );

  // ─── Typing indicator ───────────────────────────────────────────────
  const [typingName, setTypingName] = useState<string | null>(null);
  const typingTimer = useRef(0);
  useRealtime('typing', (p: TypingPayload) => {
    if (p.caseId !== caseId || p.userId === meId) return;
    setTypingName(p.name || '…');
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => setTypingName(null), TYPING_SHOW_MS);
  });
  useEffect(() => () => window.clearTimeout(typingTimer.current), []);

  const lastTypingSent = useRef(0);
  /** Call on every keystroke; sends at most one typing event per 2.5 s. */
  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < TYPING_SEND_EVERY_MS) return;
    lastTypingSent.current = now;
    void api.post(`${base}/${caseId}/typing`).catch(() => undefined);
  }, [base, caseId]);

  // ─── Read receipts ──────────────────────────────────────────────────
  const unreadFromOthers = useMemo(() => messages.some((m) => !m.pending && m.author?.id !== meId && !m.readAt), [messages, meId]);
  const visibleRef = useRef(false);
  const markTimer = useRef(0);
  const marking = useRef(false);

  const markRead = useCallback(async () => {
    if (marking.current) return;
    marking.current = true;
    try {
      const res = await api.post<{ messageIds: string[]; readAt: string | null }>(`${base}/${caseId}/messages/read`);
      const ids = new Set(res.data.messageIds);
      if (ids.size) {
        const at = res.data.readAt ?? new Date().toISOString();
        qc.setQueryData<ThreadMessage[]>(key, (old) => (old ?? []).map((m) => (ids.has(m.id) ? { ...m, readAt: at } : m)));
      }
    } catch {
      // read receipts are best effort
    } finally {
      marking.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, caseId, qc]);

  const scheduleMarkRead = useCallback(() => {
    if (!visibleRef.current || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    window.clearTimeout(markTimer.current);
    markTimer.current = window.setTimeout(() => void markRead(), 400);
  }, [markRead]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  /** Attach to the scrolling message list: unread messages are marked read once it is on screen and the window is focused. */
  const listRef = useCallback(
    (el: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!el) {
        visibleRef.current = false;
        return;
      }
      if (typeof IntersectionObserver === 'undefined') {
        visibleRef.current = true;
        scheduleMarkRead();
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          visibleRef.current = entries.some((e) => e.isIntersecting);
          if (visibleRef.current) scheduleMarkRead();
        },
        { threshold: 0.25 },
      );
      io.observe(el);
      observerRef.current = io;
    },
    [scheduleMarkRead],
  );
  useEffect(() => {
    if (unreadFromOthers) scheduleMarkRead();
  }, [unreadFromOthers, scheduleMarkRead]);

  useEffect(() => {
    const onFocus = () => unreadFromOthers && scheduleMarkRead();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.clearTimeout(markTimer.current);
      observerRef.current?.disconnect();
    };
  }, [unreadFromOthers, scheduleMarkRead]);

  // ─── Realtime message events ────────────────────────────────────────
  useRealtime('message.new', (p: NewMessagePayload) => {
    if (p.caseId !== caseId || !p.message) return;
    upsert(p.message);
    onNewRef.current?.();
    if (p.message.author?.id !== meId) scheduleMarkRead();
  });

  // Messaging plus: a voice message got its transcript.
  useRealtime('message.updated', (p: NewMessagePayload) => {
    if (p.caseId !== caseId || !p.message) return;
    upsert(p.message);
  });

  useRealtime('message.read', (p: ReadPayload) => {
    if (p.caseId !== caseId || !p.messageIds?.length) return;
    const ids = new Set(p.messageIds);
    const at = p.readAt ?? new Date().toISOString();
    qc.setQueryData<ThreadMessage[]>(key, (old) => (old ?? []).map((m) => (ids.has(m.id) ? { ...m, readAt: at } : m)));
  });

  // ─── Sending (optimistic) ───────────────────────────────────────────
  const send = useCallback(
    async (body: string, author: ThreadMessage['author']) => {
      const text = body.trim();
      if (!text) return false;
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: ThreadMessage = { id: tempId, body: text, createdAt: new Date().toISOString(), author, channel: 'app', readAt: null, pending: true };
      setPending((p) => [...p, optimistic]);
      try {
        const res = await api.post<{ message: ThreadMessage }>(`${base}/${caseId}/messages`, { body: text });
        upsert(res.data.message);
        setPending((p) => p.filter((m) => m.id !== tempId));
        return true;
      } catch (err) {
        setPending((p) => p.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
        throw err;
      }
    },
    [base, caseId, upsert],
  );

  const dismissFailed = useCallback((id: string) => setPending((p) => p.filter((m) => m.id !== id)), []);

  /** Sends a failed optimistic message again (it goes back to "pending" in place, at the end of the thread). */
  const retry = useCallback(
    (id: string) => {
      const failed = pending.find((m) => m.id === id && m.failed);
      if (!failed) return Promise.resolve(false);
      setPending((p) => p.filter((m) => m.id !== id));
      return send(failed.body ?? '', failed.author);
    },
    [pending, send],
  );

  return { messages, typingName, notifyTyping, listRef, send, retry, dismissFailed, connected, status, upsert };
};
