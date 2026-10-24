import { useRef, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { getPrefs } from './prefs';

/*
 * View Transitions (https://developer.chrome.com/docs/web-platform/view-transitions) for route changes.
 *
 * lib/localeRouter.tsx calls navigateWithTransition() for every change of pathname: the browser snapshots the
 * old page, React renders the new one synchronously (flushSync) and the browser cross-fades between the two
 * (~200 ms, index.css "View transitions"). Elements that carry the same view-transition-name on both pages
 * morph into each other: a visa card's image and title grow into the detail page's hero.
 *
 * Off (plain instant navigation, same as before) when:
 *   - the browser has no document.startViewTransition (Firefox < 144, older Safari),
 *   - the OS asks for reduced motion, or "Stop animations" is on in the accessibility widget.
 *
 * Shared elements ("morphs"):
 *   source (a card):  const m = useMorphSource('visa', visa.slug);
 *                     <Link ref={m.ref} onClick={m.onClick}> <img {...m.part('media')} /> <h3 {...m.part('title')} /> </Link>
 *   target (hero):    const t = useMorphTarget('visa', slug);  <img {...t.part('media')} /> <h1 {...t.part('title')} />
 * A source is only named when it was just clicked (or is the item the user came back from), so the same item
 * appearing twice on a page never produces duplicate names (which would cancel the transition).
 */

type ViewTransition = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void>; skipTransition: () => void };
type VTDocument = Document & { startViewTransition?: (update: () => void | Promise<void>) => ViewTransition };

export type MorphPart = 'media' | 'title' | 'card';

const noop = () => undefined;

/** The browser can run view transitions. */
export const viewTransitionsSupported = (): boolean => typeof document !== 'undefined' && typeof (document as VTDocument).startViewTransition === 'function';

/** Motion is welcome: no OS "reduce motion", no "Stop animations" in the accessibility widget. */
export const motionAllowed = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (getPrefs().noMotion || document.documentElement.classList.contains('a11y-nomotion')) return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
};

/** View transitions are used for navigations right now. */
export const transitionsEnabled = (): boolean => viewTransitionsSupported() && motionAllowed();

/** CSS-safe view-transition-name for an item (kind + id + part). */
export const vtName = (kind: string, id: string | number, part: MorphPart = 'card'): string =>
  `vt-${kind}-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}-${part}`;

// Last item opened per kind ('visa' → slug). Lets the list card morph back when the user returns.
const lastOpened = new Map<string, string>();
// Name of the shared element the next navigation should wait for (target not rendered yet).
let pendingMorph: { name: string; at: number } | null = null;

const MORPH_ATTR = 'data-vt';

/** Waits (≤ 250 ms) until the page that is being rendered contains the shared element the user clicked. */
const waitForMorphTarget = async () => {
  const pending = pendingMorph;
  pendingMorph = null;
  if (!pending || performance.now() - pending.at > 1500) return;
  const deadline = performance.now() + 250;
  while (performance.now() < deadline) {
    if (document.querySelector(`[${MORPH_ATTR}="${pending.name}"]`)) return;
    // setTimeout, not requestAnimationFrame: rendering is paused while the update callback runs.
    await new Promise((r) => setTimeout(r, 16));
  }
};

let running: ViewTransition | null = null;

/**
 * Applies a navigation (a React state update) inside a view transition when possible, otherwise as a
 * normal non-blocking React transition (`fallback`).
 */
export const navigateWithTransition = (update: () => void, fallback: (update: () => void) => void) => {
  if (!transitionsEnabled()) {
    pendingMorph = null;
    fallback(update);
    return;
  }
  // A second navigation while one is animating (double click, redirect): finish the first at once.
  running?.skipTransition();
  const doc = document as VTDocument;
  try {
    const vt = doc.startViewTransition!(async () => {
      flushSync(update);
      await waitForMorphTarget();
    });
    running = vt;
    vt.ready.catch(noop);
    vt.updateCallbackDone.catch(noop);
    vt.finished.catch(noop).finally(() => {
      if (running === vt) running = null;
    });
  } catch {
    fallback(update);
  }
};

const classOf = (p: MorphPart) => (p === 'title' ? 'vt-text' : 'vt-media');
const styleFor = (name: string | undefined, p: MorphPart): CSSProperties | undefined =>
  name ? ({ viewTransitionName: name, viewTransitionClass: classOf(p) } as CSSProperties) : undefined;

/**
 * Shared-element source (a card linking to a detail page). Spread `part()` on the elements that should
 * morph, put `ref` and `onClick` on the link.
 */
export function useMorphSource<E extends HTMLElement = HTMLAnchorElement>(kind: string, id: string | number | undefined | null) {
  const ref = useRef<E>(null);
  const key = id == null ? '' : String(id);
  const active = key !== '' && lastOpened.get(kind) === key && transitionsEnabled();
  const part = (p: MorphPart) => {
    const name = key ? vtName(kind, key, p) : undefined;
    return { 'data-vt-part': p, ...(active && name ? { [MORPH_ATTR]: name } : {}), style: active ? styleFor(name, p) : undefined };
  };
  const onClick = () => {
    if (!key || !transitionsEnabled()) return;
    lastOpened.set(kind, key);
    pendingMorph = { name: vtName(kind, key, 'title'), at: performance.now() };
    // Name the clicked card's parts right now: the old snapshot is taken during this click.
    ref.current?.querySelectorAll<HTMLElement>('[data-vt-part]').forEach((el) => {
      const name = vtName(kind, key, el.dataset.vtPart as MorphPart);
      el.style.setProperty('view-transition-name', name);
      el.style.setProperty('view-transition-class', classOf(el.dataset.vtPart as MorphPart));
      el.setAttribute(MORPH_ATTR, name);
    });
    if (ref.current?.dataset.vtPart) {
      const p = ref.current.dataset.vtPart as MorphPart;
      const name = vtName(kind, key, p);
      ref.current.style.setProperty('view-transition-name', name);
      ref.current.style.setProperty('view-transition-class', classOf(p));
      ref.current.setAttribute(MORPH_ATTR, name);
    }
  };
  return { ref, onClick, part, active };
}

/**
 * Shared-element target (the hero of a detail page). Always named while transitions are on: only one
 * item of a kind is ever "the" detail page.
 */
export function useMorphTarget(kind: string, id: string | number | undefined | null) {
  const key = id == null ? '' : String(id);
  const on = key !== '' && transitionsEnabled();
  /** The user arrived through a morph from a card (skip the hero's own entrance animation). */
  const arrived = on && lastOpened.get(kind) === key;
  const part = (p: MorphPart) => {
    const name = on ? vtName(kind, key, p) : undefined;
    return name ? { [MORPH_ATTR]: name, style: styleFor(name, p) } : {};
  };
  return { part, arrived };
}

/** Remembers an item as opened without a card click (e.g. a programmatic navigate from a table row). */
export const markMorph = (kind: string, id: string | number) => {
  if (!transitionsEnabled()) return;
  lastOpened.set(kind, String(id));
  pendingMorph = { name: vtName(kind, id, 'title'), at: performance.now() };
};
