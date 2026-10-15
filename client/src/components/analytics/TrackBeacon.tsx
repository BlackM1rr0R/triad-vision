import { useEffect } from 'react';

const FLAG = 'tv_visit_sent';

/** utm_source from the URL, else the external referrer's host; "" for direct / internal traffic. */
export const visitSource = (search: string, referrer: string, ownHost: string) => {
  const clean = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/^www\./, '')
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 60);
  try {
    const utm = new URLSearchParams(search).get('utm_source');
    if (utm) return clean(utm);
  } catch {
    /* ignore */
  }
  if (!referrer) return '';
  try {
    const host = new URL(referrer).hostname;
    return host && host !== ownHost ? clean(host) : '';
  } catch {
    return '';
  }
};

/**
 * Cookie-less funnel beacon: one "visit" per browser session (sessionStorage flag), carrying only
 * the traffic source. Nothing is sent when the browser asks not to be tracked.
 */
export const TrackBeacon = () => {
  useEffect(() => {
    try {
      const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
      if (nav.doNotTrack === '1' || nav.globalPrivacyControl === true) return;
      if (sessionStorage.getItem(FLAG)) return;
      sessionStorage.setItem(FLAG, '1');
      const source = visitSource(window.location.search, document.referrer, window.location.hostname);
      const body = JSON.stringify({ metric: 'visit', source });
      if (typeof nav.sendBeacon === 'function') {
        nav.sendBeacon('/api/track', new Blob([body], { type: 'text/plain;charset=UTF-8' }));
      }
    } catch {
      // Storage blocked (private mode, sandbox) or beacon refused: analytics are best effort.
    }
  }, []);
  return null;
};
