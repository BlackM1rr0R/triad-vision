import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { fetch } from 'expo/fetch';
import { onlineManager } from '@tanstack/react-query';
import { authHeaders } from './api';
import { API_URL } from './config';
import { SseParser, sseJson } from './sse';

/**
 * Realtime stream: Server-Sent Events from GET /api/messaging/events, read through expo/fetch
 * (React Native has no EventSource; expo/fetch streams `response.body`). One connection per app:
 * open while someone is logged in and the app is in the foreground, closed in the background,
 * reconnected with exponential backoff. Components subscribe through `useRealtime`; the query cache
 * is kept fresh by RealtimeBridge (lib/realtimeBridge.tsx).
 *
 * Event types sent by the API: message.new, message.read, typing, notification, case.updated.
 */
export type RealtimePayload = Record<string, unknown>;
type Handler = (payload: RealtimePayload) => void;
/** idle: nobody logged in / stream unsupported · connecting: (re)connecting · open: live · paused: app in background */
export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'paused';
export type RealtimeEventType = 'message.new' | 'message.read' | 'message.updated' | 'party.updated' | 'typing' | 'notification' | 'case.updated';

const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
/** The server pings every 25 s; silence for longer means the socket died without telling us. */
const STALL_MS = 70_000;

class RealtimeManager {
  private userId: string | null = null;
  private foreground = AppState.currentState !== 'background';
  private controller: AbortController | null = null;
  private listeners = new Map<string, Set<Handler>>();
  private statusListeners = new Set<() => void>();
  private backoff = BACKOFF_MIN_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEventId = '';
  /** Set after a 401/403/404: the stream is not usable for this session; pollers take over. */
  private unsupported = false;
  status: RealtimeStatus = 'idle';

  constructor() {
    AppState.addEventListener('change', (s: AppStateStatus) => this.setForeground(s === 'active'));
    onlineManager.subscribe((online) => {
      if (online && this.userId && this.foreground && !this.controller) {
        this.backoff = BACKOFF_MIN_MS;
        this.connect();
      }
    });
  }

  /** Called with the signed-in user's id (or null after logout). */
  setUser(userId: string | null) {
    if (userId === this.userId) return;
    this.userId = userId;
    this.unsupported = false;
    this.backoff = BACKOFF_MIN_MS;
    this.lastEventId = '';
    this.disconnect();
    if (userId && this.foreground) this.connect();
    else this.setStatus(userId ? 'paused' : 'idle');
  }

  on(type: RealtimeEventType, handler: Handler) {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  subscribeStatus(cb: () => void) {
    this.statusListeners.add(cb);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  private setForeground(active: boolean) {
    if (active === this.foreground) return;
    this.foreground = active;
    if (!this.userId) return;
    if (active) {
      this.backoff = BACKOFF_MIN_MS;
      this.connect();
    } else {
      this.disconnect();
      this.setStatus('paused');
    }
  }

  private setStatus(s: RealtimeStatus) {
    if (this.status === s) return;
    this.status = s;
    this.statusListeners.forEach((cb) => cb());
  }

  private connect() {
    if (!this.userId || !this.foreground || this.unsupported || this.controller) return;
    this.clearTimers();
    const controller = new AbortController();
    this.controller = controller;
    this.setStatus('connecting');
    void this.run(controller);
  }

  private async run(controller: AbortController) {
    let failed = true;
    try {
      const url = `${API_URL}/messaging/events${this.lastEventId ? `?lastEventId=${encodeURIComponent(this.lastEventId)}` : ''}`;
      const res = await fetch(url, {
        headers: {
          ...authHeaders(),
          'x-client': 'mobile',
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...(this.lastEventId ? { 'Last-Event-ID': this.lastEventId } : {}),
        },
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        // Session ended (the API interceptor handles the logout) or the API has no stream: stop trying.
        this.unsupported = true;
        failed = false;
      } else if (res.ok && res.body) {
        this.backoff = BACKOFF_MIN_MS;
        this.setStatus('open');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = new SseParser();
        this.armStall(controller);
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          this.armStall(controller);
          for (const ev of parser.feed(decoder.decode(value, { stream: true }))) {
            if (ev.lastEventId) this.lastEventId = ev.lastEventId;
            const payload = sseJson(ev);
            if (payload) this.dispatch(ev.type, payload);
          }
        }
      }
    } catch {
      // network error, abort or a stalled socket: handled below
    }
    if (this.controller !== controller) return; // superseded by disconnect()/setUser()
    this.controller = null;
    this.clearTimers();
    if (!this.userId || !this.foreground || this.unsupported) {
      this.setStatus(this.userId ? (this.foreground ? 'idle' : 'paused') : 'idle');
      return;
    }
    this.setStatus('connecting');
    const delay = failed ? this.backoff + Math.random() * 500 : BACKOFF_MIN_MS;
    this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private armStall(controller: AbortController) {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = setTimeout(() => controller.abort(), STALL_MS);
  }

  private clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.reconnectTimer = null;
    this.stallTimer = null;
  }

  private disconnect() {
    this.clearTimers();
    const c = this.controller;
    this.controller = null;
    c?.abort();
  }

  private dispatch(type: string, payload: RealtimePayload) {
    this.listeners.get(type)?.forEach((h) => {
      try {
        h(payload);
      } catch (err) {
        if (__DEV__) console.warn('[realtime] handler failed', err);
      }
    });
  }
}

export const realtime = new RealtimeManager();

/**
 * Subscribes to one event type while the component is mounted. The handler may change on every
 * render (the latest one is used) without resubscribing.
 */
export const useRealtime = (type: RealtimeEventType, handler: Handler) => {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => realtime.on(type, (payload) => latest.current(payload)), [type]);
};

/** 'open' while the stream is live — pollers can stand down. */
export const useRealtimeStatus = (): RealtimeStatus =>
  useSyncExternalStore(
    (cb) => realtime.subscribeStatus(cb),
    () => realtime.status,
    () => 'idle' as const,
  );

export const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
