import type Lenis from 'lenis';

/**
 * Inertial ("smooth") wheel scrolling, shared by the layout and anything that needs to scroll
 * programmatically. Native scrolling is kept where it is better: touch devices, users who asked
 * the OS for reduced motion, and anything that scrolls inside the page (modals, rails).
 *
 * Cost: one window.scrollTo per animation frame while the inertia runs. That is only affordable
 * because the main thread is otherwise idle (no WebGL, no per-frame React work).
 */
let lenis: Lenis | null = null;
/** Bumped by every start/stop, so a Lenis that finishes downloading after a stop is never created. */
let generation = 0;
/** An overlay asked for a pause (it may do so before Lenis has finished loading). */
let paused = false;

const wanted = () =>
  typeof window !== 'undefined' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
  // "Stop animations" in the accessibility widget (class set by lib/prefs.ts)
  !document.documentElement.classList.contains('a11y-nomotion') &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export const startSmoothScroll = () => {
  if (lenis || !wanted()) return;
  // Lenis is its own chunk, fetched only for desktop pointers (touch devices never download it).
  const gen = ++generation;
  void import('lenis').then(({ default: LenisCtor }) => {
    if (gen !== generation || lenis) return;
    create(LenisCtor);
  });
};

const create = (LenisCtor: typeof Lenis) => {
  lenis = new LenisCtor({
    lerp: 0.11,
    wheelMultiplier: 1,
    smoothWheel: true,
    syncTouch: false,
    autoRaf: true,
    anchors: true,
    // Scrollable panels (modals, mobile rails, admin tables) keep native wheel behaviour.
    prevent: (node) => node.closest('[data-lenis-prevent], [role="dialog"], .overflow-y-auto, .overflow-auto') !== null,
  });
  if (paused) lenis.stop();
};

export const stopSmoothScroll = () => {
  generation++;
  lenis?.destroy();
  lenis = null;
};

/** Scrolls to a position or element; falls back to the native call when Lenis is not running. */
export const smoothScrollTo = (target: number | HTMLElement | string, opts: { immediate?: boolean; offset?: number } = {}) => {
  if (lenis) {
    lenis.scrollTo(target, { immediate: opts.immediate, offset: opts.offset ?? 0, duration: 1.1 });
    return;
  }
  const top = typeof target === 'number' ? target : typeof target === 'string' ? (document.querySelector(target)?.getBoundingClientRect().top ?? 0) + window.scrollY : target.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: top + (opts.offset ?? 0), behavior: opts.immediate ? 'instant' : 'smooth' });
};

/** Pause while an overlay locks the page (body overflow hidden), resume afterwards. */
export const setSmoothScrollPaused = (pause: boolean) => {
  paused = pause;
  if (!lenis) return;
  if (pause) lenis.stop();
  else lenis.start();
};
