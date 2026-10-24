/**
 * Cookie consent (TDDDG § 25 / DSGVO Art. 6 (1) a, Art. 7). The visitor's choice lives in localStorage
 * `tv.consent` as { analytics, marketing, v } — `v` is the cookie policy version it was given for (the
 * published COOKIES legal document, '1' before one exists). Necessary storage (session, language,
 * this choice) needs no consent.
 *
 * Every change dispatches the window event `tv:consent` (detail = the new state) and is logged on the
 * server (POST /api/legal/cookie-consent) as proof. Scripts that need consent (analytics, ads) must
 * check `hasAnalyticsConsent()` / `hasMarketingConsent()` and subscribe with `onConsentChange()`:
 *
 *   if (hasAnalyticsConsent()) loadGa4();
 *   onConsentChange((c) => c?.analytics && loadGa4());
 *
 * No imports on purpose: any chunk (SEO, growth tracking) can use this file without pulling UI code.
 */

export const CONSENT_KEY = 'tv.consent';
export const CONSENT_EVENT = 'tv:consent';
/** Asks the cookie banner to open its settings view (footer link "Cookie settings"). */
export const CONSENT_OPEN_EVENT = 'tv:consent-open';
const VISITOR_KEY = 'tv.visitor';

export interface ConsentState {
  analytics: boolean;
  marketing: boolean;
  /** Cookie policy version the choice was made for. */
  v: string;
  /** When the choice was made (ISO). */
  at?: string;
}

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked (private mode, policies): behave as "no choice yet"
  }
};

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore: the choice then lasts for this page view only
  }
};

let memory: ConsentState | null = null;

/** The stored choice, or null when the visitor has not decided yet. */
export const getConsent = (): ConsentState | null => {
  const raw = read(CONSENT_KEY);
  if (!raw) return memory;
  try {
    const v = JSON.parse(raw) as Partial<ConsentState>;
    if (typeof v.analytics !== 'boolean' || typeof v.marketing !== 'boolean') return memory;
    return { analytics: v.analytics, marketing: v.marketing, v: typeof v.v === 'string' ? v.v : '1', at: typeof v.at === 'string' ? v.at : undefined };
  } catch {
    return memory;
  }
};

export const hasAnalyticsConsent = () => getConsent()?.analytics === true;
export const hasMarketingConsent = () => getConsent()?.marketing === true;

/** Random id for the anonymous consent log, created only when a visitor without an account decides. */
const visitorId = () => {
  let id = read(VISITOR_KEY);
  if (!id || !/^[A-Za-z0-9_-]{8,40}$/.test(id)) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    id = `v_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
    write(VISITOR_KEY, id);
  }
  return id;
};

export interface SetConsentOptions {
  /** Cookie policy version shown (default: the stored one, else '1'). */
  v?: string;
  /** Banner (first choice) or the settings dialog. */
  source?: 'COOKIE_BANNER' | 'COOKIE_SETTINGS';
  /** Signed in: the server logs the account, no visitor id is created. */
  loggedIn?: boolean;
}

/** Saves the choice, notifies listeners and logs it on the server (fire and forget). */
export const setConsent = (choice: { analytics: boolean; marketing: boolean }, opts: SetConsentOptions = {}): ConsentState => {
  const state: ConsentState = { analytics: !!choice.analytics, marketing: !!choice.marketing, v: opts.v ?? getConsent()?.v ?? '1', at: new Date().toISOString() };
  memory = state;
  write(CONSENT_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent<ConsentState>(CONSENT_EVENT, { detail: state }));
  const body = { analytics: state.analytics, marketing: state.marketing, source: opts.source ?? 'COOKIE_BANNER', ...(opts.loggedIn ? {} : { visitorId: visitorId() }) };
  void fetch('/api/legal/cookie-consent', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
  return state;
};

/** Re-opens the banner in its settings view. */
export const openConsentSettings = () => {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
};

/** Subscribes to consent changes (also from other tabs). Returns the unsubscribe function. */
export const onConsentChange = (fn: (state: ConsentState | null) => void) => {
  const local = (e: Event) => fn((e as CustomEvent<ConsentState>).detail ?? getConsent());
  const other = (e: StorageEvent) => {
    if (e.key === CONSENT_KEY) fn(getConsent());
  };
  window.addEventListener(CONSENT_EVENT, local);
  window.addEventListener('storage', other);
  return () => {
    window.removeEventListener(CONSENT_EVENT, local);
    window.removeEventListener('storage', other);
  };
};
