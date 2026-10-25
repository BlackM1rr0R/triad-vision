import './lib/azIntlInstall'; // first: Azerbaijani dates in browsers without "az" ICU data (Chrome)
import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'sonner';
// Fonts are bundled and served from our own domain (no requests to Google — DSGVO).
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces'; // public-site display headings (az/de/en/tr; ru/uk use Inter)
import '@fontsource-variable/jetbrains-mono'; // codes / case numbers (downloaded only when used)
import { i18nReady } from './i18n';
import './index.css';
import { initSiteTheme } from './lib/theme';
import App from './App';
import { AuthProvider } from './lib/auth';
import { reloadOnce } from './components/ui/RouteErrorBoundary';
import { usePrefs, useResolvedTheme } from './lib/prefs';
import { installDiagnostics } from './lib/diagnostics';
import { initPwa } from './lib/pwa';
import { whenIdle } from './lib/idle';
import { captureRefFromUrl } from './lib/referralCookie';
import { LocaleRouter } from './lib/localeRouter';
import { initAnalytics } from './lib/analytics';

// Site theme (SUPER_ADMIN theme builder): cached CSS variables now, fresh ones after the first paint; table density.
initSiteTheme();
// "Problem bildir" diagnostics (console errors ring buffer, last API error) and the service worker (PWA).
installDiagnostics();
initPwa();
// ?ref=CODE (agent or client referral) → first-party cookie for 60 days.
captureRefFromUrl();

// Update toast, install banner, push prompt and the "Problem bildir" button: own chunk, loaded when idle.
const SiteExtras = lazy(() => import('./components/site/SiteExtras'));
const LateExtras = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => whenIdle(() => setReady(true), 2000), []);
  return ready ? (
    <Suspense fallback={null}>
      <SiteExtras />
    </Suspense>
  ) : null;
};

// After a deployment the old page may try to load chunks that no longer exist; a reload fixes it.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  if (reloadOnce()) window.location.reload();
});

const queryClient = new QueryClient({
  // staleTime: data fetched in the last 20 s is reused when another widget or page mounts the same query
  // (dashboards mount several widgets sharing queries; back/forward navigation re-mounts whole pages).
  // Mutations still refresh at once through invalidateQueries; queries that need it set their own value.
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 20_000 } },
});

/** Motion and toast settings follow the accessibility preferences (src/lib/prefs.ts). */
const Shell = () => {
  const { noMotion, visualAlerts } = usePrefs();
  const theme = useResolvedTheme();
  return (
    <>
      {/* Users who disabled animations in their OS get opacity-only motion: less work, no jank.
          "Stop animations" in the accessibility widget forces the same for everyone. */}
      <MotionConfig reducedMotion={noMotion ? 'always' : 'user'}>
        <App />
      </MotionConfig>
      {/* gap / visibleToasts: a burst of toasts stacks compactly instead of filling the corner (polish in index.css). */}
      <Toaster position="top-right" richColors closeButton theme={theme} duration={visualAlerts ? 10000 : 4000} gap={10} visibleToasts={4} />
      <LateExtras />
    </>
  );
};

// GA4 (only when configured and the visitor consented to analytics cookies).
initAnalytics();

// Turkish / Ukrainian copy is its own chunk: render once the starting language is available (instant for
// az/de/en/ru). The crawler-only HTML inside #root (Caddy include, /__seo/body) is replaced by this render.
void i18nReady().finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <LocaleRouter>
          <AuthProvider>
            <Shell />
          </AuthProvider>
        </LocaleRouter>
      </QueryClientProvider>
    </StrictMode>,
  ),
);
