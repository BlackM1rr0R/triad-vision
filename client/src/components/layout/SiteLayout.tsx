import { Suspense, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { Header } from './Header';
import { Footer } from './Footer';
import { Preloader, ScrollProgress, SmoothScroll, scrollToTop } from './Effects';
import { useSiteContent } from '@/lib/content';
import { SearchPalette } from '../search/SearchPalette';
import { CookieNotice } from './CookieNotice';

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="size-7" fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.4.8 3.2.6a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.2-.2-.5-.3Z" />
  </svg>
);

const FloatingActions = () => {
  const { data } = useSiteContent();
  const [showTop, setShowTop] = useState(false);
  // framer-motion reads scroll once per frame in its read phase; a raw scroll listener reading
  // window.scrollY forced a synchronous layout on every scroll event.
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (y) => setShowTop(y > 800));
  const wa = data?.settings.contact?.whatsapp.replace(/\D/g, '');

  return (
    <div className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      <AnimatePresence>
        {showTop && (
          <motion.button
            type="button"
            aria-label="Top"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            onClick={() => scrollToTop()}
            className="grid size-11 place-items-center rounded-full border border-line bg-white text-navy-900 shadow-lg hover:bg-brand-50"
          >
            <ArrowUp className="size-5" />
          </motion.button>
        )}
      </AnimatePresence>
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
          className="relative grid size-14 place-items-center rounded-full bg-[#25d366] text-white shadow-xl shadow-[#25d366]/40"
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-[#25d366] opacity-30" />
          <WhatsAppIcon />
        </motion.a>
      )}
    </div>
  );
};

export const SiteLayout = () => {
  const { pathname } = useLocation();
  return (
    <>
      <Preloader />
      <SmoothScroll />
      <ScrollProgress />
      <Header />
      <AnimatePresence mode="wait">
        <motion.main
          className="min-h-[100svh]"
          key={pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
        >
          {/* Suspense lives inside the layout so header/footer stay put while a page chunk loads. */}
          <Suspense fallback={<div className="min-h-[100svh]" />}>
            <Outlet />
          </Suspense>
        </motion.main>
      </AnimatePresence>
      <Footer />
      <FloatingActions />
      <SearchPalette />
      <CookieNotice />
    </>
  );
};
