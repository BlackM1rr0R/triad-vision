/**
 * Pure state machine for the biometric lock (Face ID / fingerprint). The provider in biometric.tsx
 * feeds it app lifecycle events; this module decides when the lock screen must be shown.
 *
 * Rules:
 *  - When the feature is off nothing is ever locked.
 *  - A cold start with the feature on starts locked.
 *  - Going to the background and coming back after more than LOCK_AFTER_MS locks the app; shorter
 *    trips (a phone call, a notification shade, the system picker) do not.
 *  - Turning the feature on never locks immediately (the user is clearly present); turning it off unlocks.
 */
export const LOCK_AFTER_MS = 2 * 60 * 1000;

export interface GateState {
  enabled: boolean;
  locked: boolean;
  /** Timestamp of the moment the app left the foreground; null while in the foreground. */
  backgroundedAt: number | null;
}

export type GateEvent =
  | { type: 'boot'; enabled: boolean }
  | { type: 'enable' }
  | { type: 'disable' }
  | { type: 'background'; at: number }
  | { type: 'foreground'; at: number }
  | { type: 'unlock' }
  | { type: 'lock' };

export const initialGate: GateState = { enabled: false, locked: false, backgroundedAt: null };

/** True when a return from the background should lock the app. */
export const shouldLockOnForeground = (backgroundedAt: number | null, now: number, lockAfterMs = LOCK_AFTER_MS) =>
  backgroundedAt !== null && now - backgroundedAt > lockAfterMs;

export const reduceGate = (state: GateState, event: GateEvent, lockAfterMs = LOCK_AFTER_MS): GateState => {
  switch (event.type) {
    case 'boot':
      return { enabled: event.enabled, locked: event.enabled, backgroundedAt: null };
    case 'enable':
      return { ...state, enabled: true, locked: false };
    case 'disable':
      return { ...state, enabled: false, locked: false };
    case 'background':
      // The first background moment counts; "inactive" → "background" transitions must not reset it.
      return state.backgroundedAt === null ? { ...state, backgroundedAt: event.at } : state;
    case 'foreground': {
      if (!state.enabled) return state.backgroundedAt === null ? state : { ...state, backgroundedAt: null };
      const locked = state.locked || shouldLockOnForeground(state.backgroundedAt, event.at, lockAfterMs);
      return { ...state, locked, backgroundedAt: null };
    }
    case 'unlock':
      return state.locked ? { ...state, locked: false } : state;
    case 'lock':
      return state.enabled && !state.locked ? { ...state, locked: true } : state;
    default:
      return state;
  }
};

/** Maps the AppState string to a gate event (null for transitions we do not care about). */
export const gateEventForAppState = (status: string, at: number): GateEvent | null => {
  if (status === 'active') return { type: 'foreground', at };
  if (status === 'background' || status === 'inactive') return { type: 'background', at };
  return null;
};
