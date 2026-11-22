import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { AnimatePresence, m as motion, useScroll, useSpring } from 'framer-motion';
import { LogoMark } from '../ui/Logo';
import { smoothScrollTo, startSmoothScroll, stopSmoothScroll } from '@/lib/smoothScroll';
import { usePrefs } from '@/lib/prefs';
import { getBrand } from '@/lib/brand';
import { isHydrating } from '@/lib/ssr';

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

/**
 * Scrolls to `y` once the page has grown tall enough (content loads asynchronously). When it never gets tall enough
 * (2 s), nothing is scrolled: clamping to `y` would throw the reader to the very bottom (the footer) of a page that
 * is shorter now than when the position was saved (a form that starts at its first step again, collapsed lists).
 * Also stops when the reader scrolls on their own meanwhile.
 */
const restoreTo = (y: number) => {
  const started = performance.now();
  const startedAt = window.scrollY;
  const attempt = () => {
    if (Math.abs(window.scrollY - startedAt) > 40) return; // the reader moved on: never fight them
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max >= y - 4) {
      smoothScrollTo(y, { immediate: true });
      return;
    }
    if (performance.now() - started > 2000) return;
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
 * - clicking a link to another page (PUSH/REPLACE with a new path) opens it at the top, or at the section named by its #hash;
 * - in-page actions that only rewrite the query string of the same page (REPLACE: tabs, filters, steps) never move the page;
 * - reload and back/forward (POP) return to where the user was on that page;
 * - inertial wheel scrolling (Lenis) on desktop pointers, native everywhere else.
 */
export const SmoothScroll = () => {
  const location = useLocation();
  const navType = useNavigationType();
  const { noMotion } = usePrefs();
  const lastPath = useRef<string | null>(null);
  const lastHash = useRef('');

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
      else if (location.hash.length > 1) scrollToHash(location.hash); // a URL opened with a #section
      else scrollToTop(true);
    } else if (location.hash.length > 1 && (lastPath.current !== location.pathname || lastHash.current !== location.hash || navType === 'PUSH')) {
      // (An in-page REPLACE that keeps the same #hash — a tab or filter changing the query — must not glide back to it.)
      // Link to a section (/for-workers#process, /cooperation#form): the page opens at the top, then glides
      // to the section once it has rendered (page chunks and content load asynchronously).
      if (lastPath.current !== location.pathname) scrollToTop(true);
      scrollToHash(location.hash);
    } else if (lastPath.current !== location.pathname || navType === 'PUSH') {
      scrollToTop(true); // a new page (or a clicked link): from the top
    }
    // else: the same page with another query string (REPLACE): an in-page action, the position stays
    lastPath.current = location.pathname;
    lastHash.current = location.hash;
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
 * Also skipped when the page arrived server-rendered (src/lib/ssr.ts).
 */
export const Preloader = () => {
  const [show, setShow] = useState(() => {
    // A server-rendered page is already on screen: covering it with the intro would only hide it again.
    if (isHydrating()) return false;
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
