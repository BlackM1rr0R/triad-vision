import { hasAnalyticsConsent, onConsentChange } from './consent';
import { isPrivatePath, splitLocalePath } from './siteLocale';

/*
 * Google Analytics 4 — optional and consent-gated.
 *
 * Nothing is requested from Google unless (1) a measurement id is configured on the server (env GA4_ID or the
 * Setting `analytics` → { ga4Id }) and (2) the visitor accepted analytics cookies in the consent banner
 * (lib/consent.ts). The id is fetched from /api/seo/config only after consent. Page views of client-side
 * navigation are sent by GA4's enhanced measurement (history changes). IP anonymisation and no ad signals.
 * The CSP in deploy/Caddyfile allows www.googletagmanager.com and the google-analytics endpoints.
 */

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

let started = false;

/**
 * Pages whose URL carries a secret: portals and token links (/kandidat/<token>, /sign/…, /reset-password?token=…,
 * /packages/order/<token>, /events/<slug>?r=<registrant token>). GA4 sends the full page URL to Google, so it is
 * never started on them (people reach these pages from e-mail links, i.e. with a fresh page load).
 */
const TOKEN_PATH = /^\/packages\/order\//;
const TOKEN_QUERY = /[?&](token|r|t|code|key)=/i;
export const urlCarriesSecret = (pathname: string, search: string) => {
  const { rest } = splitLocalePath(pathname);
  return isPrivatePath(rest) || TOKEN_PATH.test(rest) || TOKEN_QUERY.test(search);
};

const load = async () => {
  if (started || !hasAnalyticsConsent() || urlCarriesSecret(location.pathname, location.search)) return;
  started = true;
  try {
    const res = await fetch('/api/seo/config', { credentials: 'omit' });
    const cfg = res.ok ? ((await res.json()) as { ga4Id?: string | null }) : null;
    const id = cfg?.ga4Id;
    if (!id || !/^G-[A-Z0-9]{4,15}$/.test(id)) return;
    window.dataLayer = window.dataLayer ?? [];
    // gtag must push the `arguments` object itself (that is what gtag.js expects).
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', id, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.append(s);
  } catch {
    started = false; // offline: try again on the next consent event
  }
};

/** Called once from main.tsx: loads GA4 now or as soon as analytics consent is given. */
export const initAnalytics = () => {
  if (typeof window === 'undefined') return;
  void load();
  onConsentChange((c) => {
    if (c?.analytics) void load();
    // Consent withdrawn: stop sending (gtag.js stays loaded until the next page load).
    else if (started && window.gtag) window.gtag('consent', 'update', { analytics_storage: 'denied' });
  });
};
