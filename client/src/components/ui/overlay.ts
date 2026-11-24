import { useEffect, useRef, type RefObject } from 'react';
import { setSmoothScrollPaused } from '@/lib/smoothScroll';

/**
 * Shared behaviour of every overlay (Modal, Drawer, ConfirmDialog, Menu):
 * - a layer stack, so Escape closes only the top-most overlay;
 * - focus moves inside on open, Tab / Shift+Tab are trapped (modal layers), focus returns on close;
 * - body scroll lock that compensates the scrollbar width (no layout shift) and pauses Lenis.
 */

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), iframe, audio[controls], video[controls], [contenteditable]:not([contenteditable=false]), [tabindex]:not([tabindex="-1"])';

export const focusableIn = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('inert') && el.getClientRects().length > 0);

// ─── Layer stack ────────────────────────────────────────────────────────

type Layer = { id: number; onEscape: () => void; panel?: () => HTMLElement | null; trap?: () => boolean };
const layers: Layer[] = [];
let nextId = 1;

const trapTab = (e: KeyboardEvent, panel: HTMLElement) => {
  const items = focusableIn(panel);
  if (items.length === 0) {
    e.preventDefault();
    panel.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey && (active === first || !panel.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
    e.preventDefault();
    first.focus();
  }
};

const onDocKeyDown = (e: KeyboardEvent) => {
  const top = layers[layers.length - 1];
  if (!top) return;
  if (e.key === 'Tab') {
    const panel = top.panel?.();
    if (panel && top.trap?.()) trapTab(e, panel);
    return;
  }
  if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return;
  e.preventDefault();
  e.stopPropagation();
  top.onEscape();
};

const pushLayer = (layer: Omit<Layer, 'id'>) => {
  const entry: Layer = { id: nextId++, ...layer };
  if (layers.length === 0) document.addEventListener('keydown', onDocKeyDown);
  layers.push(entry);
  return () => {
    const i = layers.indexOf(entry);
    if (i >= 0) layers.splice(i, 1);
    if (layers.length === 0) document.removeEventListener('keydown', onDocKeyDown);
  };
};

/** True while any overlay is open (e.g. for global keyboard shortcuts that should pause). */
export const hasOpenOverlay = () => layers.length > 0;

// ─── Scroll lock ────────────────────────────────────────────────────────

let lockCount = 0;
let saved: { overflow: string; paddingRight: string; x: number; y: number } | null = null;

/**
 * Locks the page scroll under a modal / drawer. The lock goes on <html>, not on <body>: with the body's
 * `overflow-x: clip` (index.css) Chrome reset the page to the top the moment `body { overflow: hidden }` was set,
 * so every drawer opened on a scrolled page jumped it to the top (found by the browser tests). The position is
 * also put back explicitly after locking and unlocking, whatever the browser does.
 */
export const lockScroll = () => {
  if (lockCount++ === 0) {
    const root = document.documentElement;
    const body = document.body;
    const scrollbar = window.innerWidth - root.clientWidth;
    saved = { overflow: root.style.overflow, paddingRight: body.style.paddingRight, x: window.scrollX, y: window.scrollY };
    if (scrollbar > 0) {
      const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + scrollbar}px`;
    }
    root.style.overflow = 'hidden';
    if (window.scrollY !== saved.y || window.scrollX !== saved.x) window.scrollTo(saved.x, saved.y);
    setSmoothScrollPaused(true);
  }
  return () => {
    if (--lockCount === 0 && saved) {
      const { x, y } = saved;
      document.documentElement.style.overflow = saved.overflow;
      document.body.style.paddingRight = saved.paddingRight;
      saved = null;
      if (window.scrollY !== y || window.scrollX !== x) window.scrollTo(x, y);
      setSmoothScrollPaused(false);
    }
  };
};

// ─── Hook ───────────────────────────────────────────────────────────────

export type OverlayOptions = {
  /** Escape closes (default true). */
  closeOnEscape?: boolean;
  /** Lock page scroll (default true). */
  lockScroll?: boolean;
  /** Trap Tab inside the panel (default true). */
  trapFocus?: boolean;
  /** Element to focus first; default: `[data-autofocus]`, else the first field, else the panel. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Return focus to the element focused before opening (default true). */
  restoreFocus?: boolean;
};

/**
 * Wire an overlay panel: returns the ref to put on the panel element (it should have tabIndex={-1}).
 * `onClose` may change every render; the latest one is used.
 */
export const useOverlay = <T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void, opts: OverlayOptions = {}) => {
  const panelRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!open) return;
    const o = optsRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const popLayer = pushLayer({
      onEscape: () => {
        if (optsRef.current.closeOnEscape !== false) closeRef.current();
      },
      panel: () => panelRef.current,
      trap: () => optsRef.current.trapFocus !== false,
    });
    const unlock = o.lockScroll === false ? undefined : lockScroll();

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const el =
        optsRef.current.initialFocus?.current ??
        panel.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([disabled]), textarea:not([disabled]), select:not([disabled])');
      (el ?? panel).focus({ preventScroll: true });
    }, 30);

    return () => {
      window.clearTimeout(focusTimer);
      popLayer();
      unlock?.();
      if (optsRef.current.restoreFocus !== false && previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return panelRef;
};

/** Escape-stack membership only (no focus trap / scroll lock): for menus and popovers. */
export const useEscapeLayer = (active: boolean, onEscape: () => void) => {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!active) return;
    return pushLayer({ onEscape: () => ref.current() });
  }, [active]);
};
