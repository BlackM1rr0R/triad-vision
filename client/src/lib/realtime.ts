import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';

/**
 * Realtime stream (Server-Sent Events from GET /api/messaging/events). One shared EventSource per
 * tab: components subscribe to event types through `useRealtime`, the manager reconnects with
 * backoff, pauses after the tab has been hidden for a while and follows login / logout.
 *
 * Event types sent by the API: see EVENT_TYPES (case messaging, mail, chat, calendar, presence).
 */

export type RealtimePayload = Record<string, unknown>;
type Handler = (payload: RealtimePayload) => void;
export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'paused';

const EVENT_TYPES = [
  'message.new',
  'message.read',
  'typing',
  'notification',
  'case.updated',
  // team workspace
  'mail.new',
  'mail.updated',
  'chat.message',
  'chat.reaction',
  'chat.read',
  'chat.typing',
  'chat.channel',
  'calendar.updated',
  'presence.updated',
  'announcement.new',
  'poll.updated',
  'leave.updated',
  'translation',
  'arrival',
] as const;
export type RealtimeEventType = (typeof EVENT_TYPES)[number];

/** Hidden tabs keep the stream open this long before it is paused (reopened when visible again). */
const HIDDEN_PAUSE_MS = 5 * 60 * 1000;
const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 30_000;

class RealtimeManager {
  private source: EventSource | null = null;
  private listeners = new Map<string, Set<Handler>>();
  private statusListeners = new Set<() => void>();
  private userId: string | null = null;
  private backoff = BACKOFF_MIN_MS;
  private reconnectTimer = 0;
  private hiddenTimer = 0;
  private lastEventId = '';
  status: RealtimeStatus = 'idle';

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => this.onVisibility());
      window.addEventListener('online', () => this.userId && this.connect());
    }
  }

  /** Called with the signed-in user's id (or null after logout). */
  setUser(userId: string | null) {
    if (userId === this.userId) return;
    this.userId = userId;
    this.backoff = BACKOFF_MIN_MS;
    this.disconnect();
    if (userId) this.connect();
    else this.setStatus('idle');
  }

  on(type: string, handler: Handler) {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
    };
  }

  subscribeStatus(cb: () => void) {
    this.statusListeners.add(cb);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  private setStatus(s: RealtimeStatus) {
    if (this.status === s) return;
    this.status = s;
    this.statusListeners.forEach((cb) => cb());
  }

  private connect() {
    if (!this.userId || typeof EventSource === 'undefined') return;
    if (this.source) return;
    window.clearTimeout(this.reconnectTimer);
    this.setStatus('connecting');
    const url = `/api/messaging/events${this.lastEventId ? `?lastEventId=${encodeURIComponent(this.lastEventId)}` : ''}`;
    const es = new EventSource(url, { withCredentials: true });
    this.source = es;
    es.onopen = () => {
      this.backoff = BACKOFF_MIN_MS;
      this.setStatus('open');
    };
    es.onerror = () => {
      // EventSource would retry on its own, but not after a 401/5xx: manage reconnects ourselves.
      this.closeSource();
      if (!this.userId) return;
      this.setStatus('connecting');
      this.reconnectTimer = window.setTimeout(() => {
        this.source = null;
        this.connect();
      }, this.backoff + Math.random() * 500);
      this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS);
    };
    for (const type of EVENT_TYPES) {
      es.addEventListener(type, (e) => {
        const me = e as MessageEvent<string>;
        if (me.lastEventId) this.lastEventId = me.lastEventId;
        let payload: RealtimePayload = {};
        try {
          payload = JSON.parse(me.data) as RealtimePayload;
        } catch {
          return;
        }
        this.listeners.get(type)?.forEach((h) => {
          try {
            h(payload);
          } catch (err) {
            console.error('[realtime] handler failed', err);
          }
        });
      });
    }
  }

  private closeSource() {
    if (this.source) {
      this.source.onopen = null;
      this.source.onerror = null;
      this.source.close();
    }
    this.source = null;
  }

  private disconnect() {
    window.clearTimeout(this.reconnectTimer);
    this.closeSource();
  }

  private onVisibility() {
    if (document.visibilityState === 'hidden') {
      window.clearTimeout(this.hiddenTimer);
      this.hiddenTimer = window.setTimeout(() => {
        this.disconnect();
        this.setStatus('paused');
      }, HIDDEN_PAUSE_MS);
      return;
    }
    window.clearTimeout(this.hiddenTimer);
    if (this.userId && !this.source) {
      this.backoff = BACKOFF_MIN_MS;
      this.connect();
    }
  }
}

export const realtime = new RealtimeManager();

/** Keeps the stream bound to the current session; mounted implicitly by every `useRealtime` caller. */
const useRealtimeSession = () => {
  const { user } = useAuth();
  const id = user?.id ?? null;
  useEffect(() => {
    realtime.setUser(id);
  }, [id]);
};

/**
 * Subscribes to one event type while the component is mounted. The handler can change on every
 * render (latest one is used) without resubscribing.
 */
export const useRealtime = (type: RealtimeEventType, handler: Handler) => {
  useRealtimeSession();
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => realtime.on(type, (payload) => latest.current(payload)), [type]);
};

/** 'open' while the stream is connected: pollers can slow down. */
export const useRealtimeStatus = (): RealtimeStatus => useSyncExternalStore((cb) => realtime.subscribeStatus(cb), () => realtime.status, () => 'idle' as const);

/**
 * Refreshes the notification lists (portal ['notifications'] and admin ['admin-notifications']) the
 * moment a notification is pushed, so the bell updates without waiting for the next poll.
 */
export const useRealtimeNotifications = () => {
  const qc = useQueryClient();
  useRealtime('notification', () => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    void qc.invalidateQueries({ queryKey: ['admin-notifications'] });
  });
};

/** Renders nothing; mount it anywhere inside the auth provider to keep the bell in sync. */
export const RealtimeBridge = () => {
  useRealtimeNotifications();
  return null;
};
