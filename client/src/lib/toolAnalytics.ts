import { useEffect, useRef } from 'react';
import { hasAnalyticsConsent, onConsentChange } from './consent';

/**
 * First-party tool analytics (admin /admin/tool-analytics, server routes/tools.ts POST /api/tools/track).
 *
 * - Counters only: "tool X was viewed / used today" — no id, no cookie, nothing about the visitor is stored. Like
 *   the cookie-less visit counter (TrackBeacon) this needs no consent; Do-Not-Track / GPC browsers send nothing.
 * - Attribution (which tool brought a registration / an inquiry) needs to remember the visitor's FIRST tool in
 *   this browser: that is only done after the cookie banner allowed analytics (`hasAnalyticsConsent()`), in
 *   localStorage `tv.tool.first`, and is deleted when consent is withdrawn. Without consent registrations and
 *   inquiries are simply not attributed.
 *
 * Usage in a tool page:
 *   useToolView('salary-calculator');           // once per page view
 *   trackToolUse('salary-calculator');           // first interaction / finished quiz (once per page view)
 *   trackToolConversion('register');             // after a successful sign-up / contact form (any page)
 */

export type ToolBeaconEvent = 'view' | 'use' | 'register' | 'inquiry' | 'embed_view';

const FIRST_KEY = 'tv.tool.first';
const SENT_KEY = 'tv.tool.sent';
/** First-touch attribution window. */
const FIRST_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const isBrowser = () => typeof window !== 'undefined' && typeof navigator !== 'undefined';

const dnt = () => {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
};

/** "/de/salary-calculator?x=1" → "salary-calculator"; "/work-scenes/truck-cab" → "work-scenes/truck-cab". */
export const toolSlugFromPath = (path: string) =>
  path
    .split(/[?#]/)[0]
    .replace(/^\/(de|en|ru|tr|uk)(?=\/|$)/, '')
    .replace(/^\/+|\/+$/g, '');

export const sendToolBeacon = (slug: string, e: ToolBeaconEvent) => {
  if (!isBrowser() || !slug) return;
  try {
    if (dnt()) return;
    const body = JSON.stringify({ t: slug.slice(0, 60), e });
    const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/tools/track', blob)) return;
    void fetch('/api/tools/track', { method: 'POST', body, headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, keepalive: true }).catch(() => undefined);
  } catch {
    // analytics are best effort
  }
};

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // storage blocked
    }
  },
  del: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  },
};

/** The visitor's first tool (only stored with analytics consent), or null. */
export const firstTool = (now = Date.now()): string | null => {
  if (!isBrowser() || !hasAnalyticsConsent()) return null;
  const raw = store.get(FIRST_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { t?: unknown; at?: unknown };
    if (typeof v.t !== 'string' || typeof v.at !== 'number' || now - v.at > FIRST_TTL_MS) {
      store.del(FIRST_KEY);
      return null;
    }
    return v.t;
  } catch {
    store.del(FIRST_KEY);
    return null;
  }
};

const rememberFirst = (slug: string) => {
  if (!hasAnalyticsConsent() || firstTool()) return;
  store.set(FIRST_KEY, JSON.stringify({ t: slug, at: Date.now() }));
};

let consentWatch = false;
const watchConsent = () => {
  if (consentWatch || !isBrowser()) return;
  consentWatch = true;
  onConsentChange((c) => {
    if (!c?.analytics) {
      store.del(FIRST_KEY);
      store.del(SENT_KEY);
    }
  });
};

/** Counts a page view of the tool once per mount (and remembers it as the first tool, with consent). */
export const useToolView = (slug: string, event: 'view' | 'embed_view' = 'view') => {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!slug || sent.current === slug) return;
    sent.current = slug;
    usedThisView.delete(slug);
    sendToolBeacon(slug, event);
    if (event === 'view') rememberFirst(slug);
    watchConsent();
  }, [slug, event]);
};

const usedThisView = new Set<string>();

/** The visitor interacted with the tool (calculated, finished a quiz…): counted once per page view. */
export const trackToolUse = (slug: string) => {
  if (!slug || usedThisView.has(slug)) return;
  usedThisView.add(slug);
  sendToolBeacon(slug, 'use');
};

/**
 * A registration / inquiry happened: attributed to the visitor's first tool (consent only), at most once per kind
 * and browser, so a second contact form does not count twice.
 */
export const trackToolConversion = (kind: 'register' | 'inquiry') => {
  const slug = firstTool();
  if (!slug) return;
  const raw = store.get(SENT_KEY) ?? '';
  const done = new Set(raw.split(',').filter(Boolean));
  if (done.has(kind)) return;
  done.add(kind);
  store.set(SENT_KEY, [...done].join(','));
  sendToolBeacon(slug, kind);
};
