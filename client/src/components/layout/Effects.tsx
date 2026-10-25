import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { AnimatePresence, motion, useScroll, useSpring } from 'framer-motion';
import { LogoMark } from '../ui/Logo';
import { smoothScrollTo, startSmoothScroll, stopSmoothScroll } from '@/lib/smoothScroll';
import { usePrefs } from '@/lib/prefs';
import { getBrand } from '@/lib/brand';

export const scrollToTop = (immediate = false) => {
  smoothScrollTo(0, { immediate });
};

const POS_KEY = 'tv_scroll';
const readPositions = (): Record<string, number> => {
  try {
    return JSON.parse(sessionStorage.getItem(POS_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
};
const savePosition = (key: string) => {
  try {
    const all = readPositions();
    all[key] = window.scrollY;
    // keep the store small
    const keys = Object.keys(all);
    if (keys.length > 60) delete all[keys[0]];
    sessionStorage.setItem(POS_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: restoration just won't happen
  }
};

/** Scrolls to `y` once the page has grown tall enough (content loads asynchronously), giving up after 2 s. */
const restoreTo = (y: number) => {
  const started = performance.now();
  const attempt = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max >= y - 4 || performance.now() - started > 2000) {
      smoothScrollTo(y, { immediate: true });
      return;
    }
    requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
};

/** Scrolls to the element of a URL hash once it exists (below the fixed header), giving up after 3 s. */
const scrollToHash = (hash: string) => {
  let id = hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    /* malformed escape: use it as it is */
  }
  const started = performance.now();
  const attempt = () => {
    const el = document.getElementById(id);
    if (el) {
      smoothScrollTo(el, { offset: -88 });
      return;
    }
    if (performance.now() - started < 3000) requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
};

/**
 * Scroll behaviour like a classic website:
 * - clicking a link (PUSH/REPLACE) opens the new page at the top, or at the section named by its #hash;
 * - reload and back/forward (POP) return to where the user was on that page;
 * - inertial wheel scrolling (Lenis) on desktop pointers, native everywhere else.
 */
export const SmoothScroll = () => {
  const location = useLocation();
  const navType = useNavigationType();
  const { noMotion } = usePrefs();
  const lastPath = useRef<string | null>(null);

  // Inertial scrolling is itself motion: off while "stop animations" is on in the accessibility widget.
  useEffect(() => {
    if (noMotion) {
      stopSmoothScroll();
      return;
    }
    startSmoothScroll();
    return () => stopSmoothScroll();
  }, [noMotion]);

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    const onUnload = () => savePosition(`${window.history.state?.key ?? 'default'}:${window.location.pathname}`);
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, []);

  useLayoutEffect(() => {
    if (navType === 'POP') {
      const y = readPositions()[`${location.key}:${location.pathname}`];
      if (y) restoreTo(y);
      else scrollToTop(true);
    } else if (location.hash.length > 1) {
      // Link to a section (/for-workers#process, /cooperation#form): the page opens at the top, then glides
      // to the section once it has rendered (page chunks and content load asynchronously).
      if (lastPath.current !== location.pathname) scrollToTop(true);
      scrollToHash(location.hash);
    } else {
      scrollToTop(true);
    }
    lastPath.current = location.pathname;
    // Remember where we were on this entry when leaving it.
    // Entries opened by typing a URL all share the key "default", so the path is part of the key.
    const key = `${location.key}:${location.pathname}`;
    return () => savePosition(key);
  }, [location.key, location.pathname, location.hash, navType]);

  return null;
};

export const ScrollProgress = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 25 });
  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[70] h-[3px] origin-left bg-highlight"
      style={{ scaleX }}
    />
  );
};

/**
 * Intro animation shown once per browser session. Skipped for visitors who asked for less motion (OS
 * setting or "stop animations" in the accessibility panel): it is pure motion and only delays the page.
 */
export const Preloader = () => {
  const [show, setShow] = useState(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('a11y-nomotion')) return false;
    try {
      return !sessionStorage.getItem('tv_intro');
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!show) return;
    const id = window.setTimeout(() => {
      setShow(false);
      try {
        sessionStorage.setItem('tv_intro', '1');
      } catch {
        // storage unavailable: intro simply shows again next time
      }
    }, 1300);
    return () => window.clearTimeout(id);
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          aria-hidden
          className="fixed inset-0 z-[200] grid place-items-center bg-canvas"
          exit={{ clipPath: 'inset(0 0 100% 0)' }}
          transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
        >
          <div className="flex flex-col items-center gap-6">
            <motion.div initial={{ scale: 0.4, rotate: -30, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}>
              <LogoMark className="h-20 w-24 text-ink" />
            </motion.div>
            <div className="overflow-hidden">
              <motion.div
                className="font-display text-2xl font-semibold tracking-[0.3em] text-ink"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                transition={{ delay: 0.35, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                {getBrand().name.toLocaleUpperCase('en')}
              </motion.div>
            </div>
            <div className="h-[3px] w-48 overflow-hidden rounded bg-line">
              <motion.div
                className="h-full bg-highlight"
                initial={{ x: '-100%' }}
                animate={{ x: '0%' }}
                transition={{ duration: 1.1, ease: 'easeInOut' }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
