import { lazy, Suspense, useState } from 'react';
import { TrackBeacon } from '../analytics/TrackBeacon';
import { SeoManager } from '@/lib/usePageTitle';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { Header, LIGHT_TOP } from './Header';
import { RouteErrorBoundary } from '../ui/RouteErrorBoundary';
import { Spinner } from '../ui/Spinner';
import { Footer } from './Footer';
import { Preloader, ScrollProgress, SmoothScroll, scrollToTop } from './Effects';
import { useSiteContent } from '@/lib/content';
import { SearchPalette } from '../search/SearchPalette';
import { CookieConsent } from '../legal/CookieConsent'; // real consent banner (lib/consent.ts)
import { AccessibilityWidget } from '../a11y/AccessibilityWidget';
import { useSurface } from '@/lib/theme'; // warm public surface + serif display headings (index.css)
import { HelpFab } from './HelpFab'; // phones: one "Kömək" button instead of the floating stack

// Public AI advisor: its own chunk, loaded only on the public pages (not in the portals).
const AdvisorBubble = lazy(() => import('../publicAi/AdvisorBubble'));
const PORTAL_PATHS = ['/account', '/company', '/partner', '/agent'];
const NO_ADVISOR = ['/account', '/agent', '/partner', '/company', '/admin', '/workspace', '/sign', '/share', '/survey'];

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="size-7" fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.4.8 3.2.6a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.2-.2-.5-.3Z" />
  </svg>
);

const FloatingActions = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const advisor = !NO_ADVISOR.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const { data } = useSiteContent();
  const [showTop, setShowTop] = useState(false);
  // framer-motion reads scroll once per frame in its read phase; a raw scroll listener reading
  // window.scrollY forced a synchronous layout on every scroll event.
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (y) => setShowTop(y > 800));
  const wa = data?.settings.contact?.whatsapp.replace(/\D/g, '');

  return (
    <div className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6" data-bnav-lift>
      <AnimatePresence>
        {showTop && (
          <motion.button
            type="button"
            aria-label={t('a11y.toTop')}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            onClick={() => scrollToTop()}
            className="grid size-11 place-items-center rounded-full border border-line bg-card text-ink shadow-lg hover:bg-sunken max-sm:hidden"
          >
            <ArrowUp className="size-5" />
          </motion.button>
        )}
      </AnimatePresence>
      {/* Accessibility panel button sits above WhatsApp; the panel itself is fixed above the whole stack.
          Phones: these buttons hide and the help button below lists them (HelpFab, lib/helpMenu.ts). */}
      <AccessibilityWidget buttonClass="max-sm:hidden" panelClass={advisor ? 'sm:bottom-[14.5rem] sm:max-h-[calc(100dvh-15.5rem)]' : 'sm:bottom-[10rem] sm:max-h-[calc(100dvh-11rem)]'} />
      {advisor && (
        <Suspense fallback={null}>
          <AdvisorBubble launcherClass="max-sm:hidden" />
        </Suspense>
      )}
      {wa && (
        <motion.a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noreferrer"
          aria-label="WhatsApp"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 2.2, type: 'spring' }}
          whileHover={{ scale: 1.1 }}
          className="relative grid size-14 place-items-center rounded-full bg-[#25d366] text-white shadow-[var(--tv-shadow-raised)] max-sm:hidden"
        >
                    <WhatsAppIcon />
        </motion.a>
      )}
      <HelpFab />
    </div>
  );
};

/**
 * Shown while a page chunk downloads. Dark on routes with a dark hero so the floating white header
 * stays readable (a plain white fallback made the header text vanish and looked like a broken page).
 */
const RouteFallback = ({ pathname }: { pathname: string }) => {
  const light = LIGHT_TOP.some((p) => pathname.startsWith(p));
  return (
    <div className={light ? 'grid min-h-[100svh] place-items-center bg-canvas text-primary' : 'grid min-h-[100svh] place-items-center bg-canvas text-muted'} role="status" aria-live="polite">
      <Spinner className="size-9 border-[3px]" />
    </div>
  );
};

export const SiteLayout = () => {
  const { pathname } = useLocation();
  // Portals (client / employer / partner / agent) use the warm portal surface (Inter headings, denser data);
  // everything else is the public surface with serif display headings (index.css).
  useSurface(PORTAL_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ? 'portal' : 'public');
  const { t } = useTranslation();
  return (
    <>
      <a href="#main" className="skip-link">
        {t('a11y.skip')}
      </a>
      <Preloader />
      <SmoothScroll />
      <ScrollProgress />
      <Header />
      {/*
        Page change: the new page mounts at once and fades in with a CSS animation (compositor only).
        No exit animation / "wait" mode: holding the old page and then mounting the heavy new one in a
        single frame is what made navigation stutter.
      */}
      <main id="main" tabIndex={-1} className="page-in min-h-[100svh] outline-none" key={pathname}>
        {/* Suspense lives inside the layout so header/footer stay put while a page chunk loads. */}
        <RouteErrorBoundary>
          <Suspense fallback={<RouteFallback pathname={pathname} />}>
            <Outlet />
          </Suspense>
        </RouteErrorBoundary>
      </main>
      <Footer />
      <FloatingActions />
      <SearchPalette />
      <TrackBeacon />
      <SeoManager />
      <CookieConsent />
    </>
  );
};
