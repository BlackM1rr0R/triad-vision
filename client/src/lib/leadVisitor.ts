import { hasAnalyticsConsent, onConsentChange } from './consent';

/**
 * First-party lead visitor (lead scoring). Only after the visitor accepted analytics cookies
 * (`hasAnalyticsConsent()`, lib/consent.ts) a random id is kept in localStorage `tv.lead`; page views and
 * key events (quiz, calculators, booking, events, landing pages, WhatsApp) are then sent as small
 * counters to /api/track/lead, and forms send the id along so the lead gets the history. Without consent
 * nothing is stored and nothing is sent: the site stays cookie-less (TrackBeacon's anonymous counter).
 * Withdrawing consent deletes the id and the stored campaign.
 */

const ID_KEY = 'tv.lead';
const UTM_KEY = 'tv.lead.utm';
const SESSION_KEY = 'tv.lead.s';

export type LeadEvent = 'page_view' | 'quiz_done' | 'cost_calc' | 'start_calc' | 'booking_open' | 'booking_done' | 'event_register' | 'landing_view' | 'whatsapp_click';

export interface Utm {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

const storage = (s: 'local' | 'session') => {
  try {
    return s === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};
const get = (s: 'local' | 'session', k: string) => {
  try {
    return storage(s)?.getItem(k) ?? null;
  } catch {
    return null;
  }
};
const set = (s: 'local' | 'session', k: string, v: string) => {
  try {
    storage(s)?.setItem(k, v);
  } catch {
    // storage blocked: tracking is best effort
  }
};
const del = (s: 'local' | 'session', k: string) => {
  try {
    storage(s)?.removeItem(k);
  } catch {
    // ignore
  }
};

/** utm_* parameters of a query string (trimmed, max 100 chars each); null when there are none. */
export const utmFrom = (search: string): Utm | null => {
  try {
    const p = new URLSearchParams(search);
    const out: Utm = {};
    for (const k of ['source', 'medium', 'campaign', 'term', 'content'] as const) {
      const v = p.get(`utm_${k}`)?.trim().slice(0, 100);
      if (v) out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
};

/** Campaign of the page the visitor arrived on (kept in memory only — sent with a form of this visit). */
let arrivalUtm: Utm | null = typeof window !== 'undefined' ? utmFrom(window.location.search) : null;

/** The visitor id, created on first use — only with analytics consent, else null. */
export const leadVisitorId = (): string | null => {
  if (!hasAnalyticsConsent()) return null;
  let id = get('local', ID_KEY);
  if (!id || !/^[A-Za-z0-9_-]{16,40}$/.test(id)) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    id = `l_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
    set('local', ID_KEY, id);
  }
  return id;
};

/** First campaign the visitor came with (stored only with consent), else the current visit's. */
const campaign = (): Utm | null => {
  if (hasAnalyticsConsent()) {
    const raw = get('local', UTM_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as Utm;
      } catch {
        del('local', UTM_KEY);
      }
    }
    if (arrivalUtm) set('local', UTM_KEY, JSON.stringify(arrivalUtm));
  }
  return arrivalUtm;
};

/** Fields every public lead form sends: { visitorId?, utm? } (both optional, never personal data). */
export const leadContext = (): { visitorId?: string; utm?: Utm } => {
  const visitorId = leadVisitorId();
  const utm = campaign();
  return { ...(visitorId ? { visitorId } : {}), ...(utm ? { utm } : {}) };
};

const referrerHost = () => {
  try {
    if (!document.referrer) return '';
    const host = new URL(document.referrer).hostname;
    return host && host !== window.location.hostname ? host.slice(0, 200) : '';
  } catch {
    return '';
  }
};

const LOCALES = ['az', 'de', 'en', 'ru', 'tr', 'uk'];

/** Sends one event (no-op without consent, for bots of course too — the server ignores them). */
export const trackLead = (e: LeadEvent, extra: { path?: string; fit?: 'high' | 'medium' | 'low' } = {}) => {
  const v = leadVisitorId();
  if (!v) return;
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === '1' || nav.globalPrivacyControl === true) return;
    const first = !get('session', SESSION_KEY);
    if (first) set('session', SESSION_KEY, '1');
    const lang = (document.documentElement.lang || '').slice(0, 2);
    const utm = first ? campaign() : null;
    const body = JSON.stringify({
      v,
      e,
      ...(extra.path ? { p: extra.path.split(/[?#]/)[0].slice(0, 300) } : {}),
      ...(extra.fit ? { fit: extra.fit } : {}),
      ...(first ? { visit: true, src: referrerHost() } : {}),
      ...(utm ? { utm } : {}),
      ...(LOCALES.includes(lang) ? { l: lang } : {}),
    });
    const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
    if (typeof nav.sendBeacon === 'function') nav.sendBeacon('/api/track/lead', blob);
  } catch {
    // analytics are best effort
  }
};

/** Withdrawn consent removes everything this module stored. */
export const forgetLeadVisitor = () => {
  del('local', ID_KEY);
  del('local', UTM_KEY);
  del('session', SESSION_KEY);
};

let wired = false;
/** Wires consent changes once (called by TrackBeacon): revoke → forget; grant → `onGrant`. */
export const watchLeadConsent = (onGrant: () => void) => {
  if (wired) return () => undefined;
  wired = true;
  const off = onConsentChange((c) => {
    if (c?.analytics) onGrant();
    else forgetLeadVisitor();
  });
  return () => {
    wired = false;
    off();
  };
};

/** Remembers the campaign of an in-app navigation to a URL with utm parameters (memory only). */
export const noteArrival = (search: string) => {
  const utm = utmFrom(search);
  if (utm) arrivalUtm = utm;
};
