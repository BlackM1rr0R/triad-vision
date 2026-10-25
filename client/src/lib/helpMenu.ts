import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

/*
 * Phones get ONE floating "Kömək" button (components/layout/HelpFab.tsx) instead of the stack of floating
 * buttons (accessibility, AI advisor / client AI, WhatsApp, back to top, "Problem bildir"). This tiny bus
 * connects them without moving their state:
 *
 *  - a feature that can be opened from the help menu registers itself while it is available
 *    (useHelpAction('advisor', enabled, () => setOpen(true))) — the menu lists only what is registered;
 *  - the menu opens it with openHelpAction('advisor') (a window CustomEvent, so lazily loaded chunks work);
 *  - while the help button is mounted (useHelpFab), the features hide their own floating button on phones
 *    (useHelpFabPresent() → 'max-sm:hidden'); desktop keeps the usual layout.
 */

export type HelpAction = 'advisor' | 'ai' | 'a11y' | 'problem';
const HELP_EVENT = 'tv:help-open';

const available = new Map<HelpAction, number>();
let fabCount = 0;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Opens a registered feature (no-op when nothing listens). */
export const openHelpAction = (action: HelpAction) => window.dispatchEvent(new CustomEvent<HelpAction>(HELP_EVENT, { detail: action }));

/** Registers a feature for the help menu while `active`, and runs `onOpen` when the menu asks for it. */
export const useHelpAction = (action: HelpAction, active: boolean, onOpen: () => void) => {
  const ref = useRef(onOpen);
  ref.current = onOpen;
  useEffect(() => {
    if (!active) return;
    available.set(action, (available.get(action) ?? 0) + 1);
    emit();
    const onEvent = (e: Event) => {
      if ((e as CustomEvent<HelpAction>).detail === action) ref.current();
    };
    window.addEventListener(HELP_EVENT, onEvent);
    return () => {
      window.removeEventListener(HELP_EVENT, onEvent);
      const n = (available.get(action) ?? 1) - 1;
      if (n > 0) available.set(action, n);
      else available.delete(action);
      emit();
    };
  }, [action, active]);
};

/** The features currently available from the help menu. */
export const useHelpActions = (): ReadonlySet<HelpAction> => {
  const v = useSyncExternalStore(subscribe, () => version);
  // `version` changes on every registration; the set itself is a snapshot of the registry.
  return useMemo(() => new Set(available.keys()), [v]);
};

/** Marks the help button as mounted (the other floating buttons then hide on phones). */
export const useHelpFab = () => {
  useEffect(() => {
    fabCount++;
    emit();
    return () => {
      fabCount--;
      emit();
    };
  }, []);
};

export const useHelpFabPresent = () => useSyncExternalStore(subscribe, () => fabCount > 0);

/**
 * Focus after closing a panel: its own launcher when visible, else the help button (on phones the
 * launcher is hidden and the panel was opened from the help menu).
 */
export const focusBack = (launcher: HTMLElement | null | undefined) => {
  if (launcher && launcher.getClientRects().length > 0) {
    launcher.focus({ preventScroll: true });
    return;
  }
  const fab = document.querySelector<HTMLElement>('[data-help-fab]');
  if (fab && fab.getClientRects().length > 0) fab.focus({ preventScroll: true });
};
