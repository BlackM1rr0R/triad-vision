import { EventEmitter } from 'node:events';

/**
 * In-process realtime bus. Any module can `publish` an event to users; the SSE endpoint in
 * routes/messaging.ts (implemented by the messaging module) forwards them to connected browsers.
 * One API instance only; a Redis pub/sub bridge can be added behind the same interface later.
 */
export interface RealtimeEvent {
  type: string; // e.g. 'message.new', 'message.read', 'typing', 'notification', 'case.updated'
  payload: Record<string, unknown>;
  at: string;
}

const bus = new EventEmitter();
bus.setMaxListeners(0);

const channel = (userId: string) => `user:${userId}`;

export const publish = (userIds: string | string[], type: string, payload: Record<string, unknown> = {}) => {
  const ev: RealtimeEvent = { type, payload, at: new Date().toISOString() };
  for (const id of Array.isArray(userIds) ? userIds : [userIds]) bus.emit(channel(id), ev);
};

/** Subscribes to a user's events; returns the unsubscribe function. */
export const subscribe = (userId: string, handler: (ev: RealtimeEvent) => void) => {
  bus.on(channel(userId), handler);
  return () => bus.off(channel(userId), handler);
};

export const subscriberCount = (userId: string) => bus.listenerCount(channel(userId));
