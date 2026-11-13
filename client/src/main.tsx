import './lib/azIntlInstall'; // first: Azerbaijani dates in browsers without "az" ICU data (Chrome)
import { createRoot, hydrateRoot } from 'react-dom/client';
import { hydrate } from '@tanstack/react-query';
// Fonts are bundled and served from our own domain (no requests to Google — DSGVO).
import '@fontsource-variable/onest'; // the one UI family (az/tr/de/ru/uk + € ₼ ₺, tabular figures)
import i18n, { i18nReady, preloadAllLanguages } from './i18n';
import './index.css';
import { initSiteTheme } from './lib/theme';
import { initBrand } from './lib/brand';
import { createQueryClient, Root } from './Root';
import { reloadOnce } from './components/ui/RouteErrorBoundary';
import { installDiagnostics } from './lib/diagnostics';
import { initPwa } from './lib/pwa';
import { afterLoad } from './lib/idle';
import { captureRefFromUrl } from './lib/referralCookie';
import { initAnalytics } from './lib/analytics';
import { readSsrPayload, setHydrating } from './lib/ssr';
import { preloadRoutes } from './lib/lazyRoute';
import { splitLocalePath } from './lib/siteLocale';

// Site theme (SUPER_ADMIN theme builder): cached CSS variables now, fresh ones after the first paint; table density.
initSiteTheme();
// White-label brand (name, logo, icons) from the HTML shell's <meta name="tv-brand">, or the API when idle.
initBrand();
// "Problem bildir" diagnostics (console errors ring buffer, last API error) and the service worker (PWA).
installDiagnostics();
initPwa();
// ?ref=CODE (agent or client referral) → first-party cookie for 60 days.
captureRefFromUrl();

// After a deployment the old page may try to load chunks that no longer exist; a reload fixes it.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  if (reloadOnce()) window.location.reload();
});

const queryClient = createQueryClient();

// GA4 (only when configured and the visitor consented to analytics cookies).
initAnalytics();

// Public pages come with server-rendered markup (src/lib/ssr.ts, Caddy include from the SSR service): React
// hydrates it, so the page is on screen before this bundle even ran. It is only used when it was rendered for
// this very URL and language (the stored language may have moved "/" to "/de" before this point); otherwise
// — and for the crawler-only HTML of the fallback — the app renders from scratch and replaces it.
const ssr = readSsrPayload();
const container = document.getElementById('root')!;

// Non-Azerbaijani copy is in its own chunks: render once the starting language is available (instant for
// az; de/en/ru/tr/uk chunks are preloaded by the HTML shell).
// Server-rendered: also the page chunks the markup was rendered with, so hydration never meets a pending page.
void Promise.all([i18nReady(), ssr ? preloadRoutes(ssr.routes ?? []) : undefined]).finally(() => {
  const { lang } = splitLocalePath(window.location.pathname);
  // index.html hid the server markup if the stored language was about to move the page (/ → /de); moved by now.
  document.documentElement.classList.remove('tv-relocate');
  const usable = ssr !== null && ssr.path === window.location.pathname && ssr.lang === (lang ?? 'az') && (i18n.resolvedLanguage ?? i18n.language) === ssr.lang;
  if (usable) {
    hydrate(queryClient, ssr.queries);
    setHydrating(true);
    hydrateRoot(container, <Root queryClient={queryClient} />, {
      // A mismatch is not fatal: React renders that part again on the client. Logged for "Problem bildir".
      onRecoverableError: (error) => console.warn('[ssr] hydration', error),
    });
    // The page's own boundary ends it once hydrated (SiteLayout → HydrationDone); this is only the safety net.
    window.setTimeout(() => setHydrating(false), 10_000);
  } else {
    createRoot(container).render(<Root queryClient={queryClient} />);
  }
  // The other languages' copy (for getFixedT in another language), once the page has loaded and settled.
  afterLoad(preloadAllLanguages, 5000);
});
