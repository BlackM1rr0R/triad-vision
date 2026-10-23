import { api } from './api';

/**
 * Installable site (PWA): service worker registration and update flow, the install prompt and Web Push.
 * The worker itself is public/sw.js (caching strategy documented there). Only registered in production
 * builds — the Vite dev server keeps working without it.
 */

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((fn) => fn());
export const subscribePwa = (fn: Listener) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const state: { registration: ServiceWorkerRegistration | null; waiting: ServiceWorker | null; installEvent: BeforeInstallPromptEvent | null } = {
  registration: null,
  waiting: null,
  installEvent: null,
};
export const pwaState = () => state;

export const swSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
export const isIos = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

let reloading = false;

const track = (reg: ServiceWorkerRegistration) => {
  state.registration = reg;
  const setWaiting = (w: ServiceWorker | null) => {
    // Only an update counts: on the very first install there is no controller yet.
    if (w && navigator.serviceWorker.controller) {
      state.waiting = w;
      emit();
    }
  };
  setWaiting(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const next = reg.installing;
    next?.addEventListener('statechange', () => {
      if (next.state === 'installed') setWaiting(next);
    });
  });
};

/** Registers /sw.js once (production only) and wires the update + install events. */
export const initPwa = () => {
  if (typeof window === 'undefined') return;
  // The browser may fire this before React mounts; keep it for the install banner.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installEvent = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    state.installEvent = null;
    emit();
  });
  if (!import.meta.env.PROD || !swSupported()) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !state.waiting) return;
    reloading = true;
    window.location.reload();
  });
  // Notification clicks in tabs the worker does not control yet.
  navigator.serviceWorker.addEventListener('message', (e) => {
    const data = e.data as { type?: string; url?: string } | null;
    if (data?.type === 'NAVIGATE' && data.url && new URL(data.url).origin === window.location.origin) window.location.assign(data.url);
  });
  const register = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        track(reg);
        // Look for a new deployment every 30 minutes and whenever the tab comes back.
        window.setInterval(() => void reg.update().catch(() => undefined), 30 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
        });
      })
      .catch((err) => console.warn('[pwa] service worker registration failed', err));
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
};

/** "Reload" in the update toast: the waiting worker takes over, controllerchange reloads the page. */
export const applyUpdate = () => {
  if (state.waiting) state.waiting.postMessage({ type: 'SKIP_WAITING' });
  else window.location.reload();
};

/** Android / desktop Chrome install dialog. */
export const promptInstall = async () => {
  const e = state.installEvent;
  if (!e) return 'unavailable' as const;
  await e.prompt();
  const { outcome } = await e.userChoice;
  state.installEvent = null;
  emit();
  return outcome;
};

// ─── Web Push ───────────────────────────────────────────────────────────

export const pushSupported = () =>
  swSupported() && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window && import.meta.env.PROD;

const keyBytes = (b64url: string) => {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

let publicKeyPromise: Promise<string | null> | null = null;
export const pushPublicKey = () =>
  (publicKeyPromise ??= api
    .get<{ publicKey: string | null }>('/site/push/key')
    .then((r) => r.data.publicKey)
    .catch(() => {
      publicKeyPromise = null;
      return null;
    }));

const readyRegistration = async () => {
  if (!swSupported()) return null;
  return state.registration ?? (await navigator.serviceWorker.getRegistration('/')) ?? null;
};

/** Current browser subscription (null when none / unsupported). */
export const currentPushSubscription = async () => {
  if (!pushSupported()) return null;
  const reg = await readyRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
};

/** Asks for permission (must run from a click), subscribes and registers the browser for the logged-in user. */
export const enablePush = async (): Promise<'enabled' | 'denied' | 'unavailable'> => {
  if (!pushSupported()) return 'unavailable';
  const key = await pushPublicKey();
  if (!key) return 'unavailable';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  await api.post('/site/push/subscriptions', sub.toJSON());
  return 'enabled';
};

/** Re-sends an existing subscription after login (it may have belonged to the previous user of this browser). */
export const syncPush = async () => {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const sub = await currentPushSubscription();
  if (sub) await api.post('/site/push/subscriptions', sub.toJSON()).catch(() => undefined);
};

/** On logout: this browser stops receiving the user's notifications (the subscription stays for the next login). */
export const forgetPush = async () => {
  try {
    const sub = await currentPushSubscription();
    if (sub) await api.delete('/site/push/subscriptions', { data: { endpoint: sub.endpoint } });
  } catch {
    /* logging out must not fail on this */
  }
};

export const disablePush = async () => {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await api.delete('/site/push/subscriptions', { data: { endpoint: sub.endpoint } }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
};
