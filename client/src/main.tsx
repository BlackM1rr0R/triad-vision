import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'sonner';
// Fonts are bundled and served from our own domain (no requests to Google — DSGVO).
import '@fontsource-variable/inter';
import '@fontsource-variable/montserrat';
import './i18n';
import './index.css';
import App from './App';
import { AuthProvider } from './lib/auth';
import { reloadOnce } from './components/ui/RouteErrorBoundary';
import { usePrefs, useResolvedTheme } from './lib/prefs';
import { installDiagnostics } from './lib/diagnostics';
import { initPwa } from './lib/pwa';
import { whenIdle } from './lib/idle';
import { captureRefFromUrl } from './lib/referralCookie';

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
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
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
      <Toaster position="top-right" richColors closeButton theme={theme} duration={visualAlerts ? 10000 : 4000} />
      <LateExtras />
    </>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
