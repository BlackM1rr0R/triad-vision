import { lazy, StrictMode, Suspense, useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig, PresenceContext } from 'framer-motion';
import { Toaster } from 'sonner';
import { SuccessCheck } from './components/ui/SuccessCheck';
import App from './App';
import { AuthProvider } from './lib/auth';
import { usePrefs, useResolvedTheme } from './lib/prefs';
import { afterLoad } from './lib/idle';
import { LocaleRouter } from './lib/localeRouter';
import { TooltipHost } from './components/ui/TooltipHost';
import { ConfirmHost } from './components/ui/ConfirmHost';
import { useHydrating } from './lib/ssr';

// Update toast, install banner, push prompt and the "Problem bildir" button: own chunk, loaded once the page
// has loaded and the browser is idle.
const SiteExtras = lazy(() => import('./components/site/SiteExtras'));
const LateExtras = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => afterLoad(() => setReady(true), 2000), []);
  return ready ? (
    <Suspense fallback={null}>
      <SiteExtras />
    </Suspense>
  ) : null;
};

export const createQueryClient = () =>
  new QueryClient({
    // staleTime: data fetched in the last 20 s is reused when another widget or page mounts the same query
    // (dashboards mount several widgets sharing queries; back/forward navigation re-mounts whole pages).
    // Mutations still refresh at once through invalidateQueries; queries that need it set their own value.
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 20_000 } },
  });

/*
 * Server-rendered markup is already on screen when it is hydrated: framer-motion entrance animations
 * (`initial={{ opacity: 0 }}`, Reveal, Stagger…) must not hide it again, and the hydrating render must produce
 * the same inline styles as the server. framer-motion starts every motion element in its final state when the
 * surrounding PresenceContext says `initial: false` (what <AnimatePresence initial={false}> does). The context is
 * provided for the whole lifetime of the app — framer-motion's usePresence() relies on it never switching
 * between null and a value — and only `initial` changes once the hydration is over, so content mounted later
 * (other pages, client-only sections) animates as before. In a client-only render it is `undefined` from the start.
 */
// Success toasts ("Yadda saxlanıldı"…) draw their tick once (components/ui/SuccessCheck.tsx; static for reduced motion).
const TOAST_ICONS = { success: <SuccessCheck className="size-[18px]" /> };

const noRegister = () => () => undefined;
const PRESENCE_STATIC = { id: 'tv-ssr', initial: false as const, isPresent: true, register: noRegister };
const PRESENCE_LIVE = { id: 'tv-ssr', initial: undefined, isPresent: true, register: noRegister };
const MotionHydrationGate = ({ children }: { children: ReactNode }) => (
  <PresenceContext.Provider value={useHydrating() ? PRESENCE_STATIC : PRESENCE_LIVE}>{children}</PresenceContext.Provider>
);

/** Motion and toast settings follow the accessibility preferences (src/lib/prefs.ts). */
const Shell = () => {
  const { noMotion, visualAlerts } = usePrefs();
  const theme = useResolvedTheme();
  return (
    <>
      {/* Users who disabled animations in their OS get opacity-only motion: less work, no jank.
          "Stop animations" in the accessibility widget forces the same for everyone. */}
      <MotionConfig reducedMotion={noMotion ? 'always' : 'user'}>
        <MotionHydrationGate>
          <App />
        </MotionHydrationGate>
      </MotionConfig>
      {/* gap / visibleToasts: a burst of toasts stacks compactly instead of filling the corner (polish in index.css). */}
      <Toaster position="top-right" richColors closeButton theme={theme} duration={visualAlerts ? 10000 : 4000} gap={10} visibleToasts={4} icons={TOAST_ICONS} />
      {/* Quick tooltips for every titled button / link (the native title waits ~1 s). */}
      <TooltipHost />
      {/* Promise-based confirmations (confirmDialog / useConfirm): replaces window.confirm everywhere. */}
      <ConfirmHost />
      <LateExtras />
    </>
  );
};

/**
 * The whole app. Rendered by main.tsx in the browser and by entry-server.tsx on the SSR service (with the
 * request's URL as `location`), so server markup and the client's first render are the same tree.
 */
export const Root = ({ queryClient, location }: { queryClient: QueryClient; location?: string }) => (
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LocaleRouter location={location}>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </LocaleRouter>
    </QueryClientProvider>
  </StrictMode>
);
