// Open/close state of the search palette, shared by the button, the shortcuts and the (lazy) dialog.

import { useSyncExternalStore } from 'react';

let isOpen = false;
const listeners = new Set<() => void>();
const setOpenState = (v: boolean) => {
  if (isOpen === v) return;
  isOpen = v;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const openSearch = () => setOpenState(true);
export const closeSearch = () => setOpenState(false);
export const toggleSearch = () => setOpenState(!isOpen);

/** Current state, for event handlers outside React. */
export const isSearchOpen = () => isOpen;

/** Reactive access to the search palette's open state. */
export const useSearchPalette = () => {
  const open = useSyncExternalStore(subscribe, () => isOpen, () => false);
  return { open, openSearch, closeSearch, toggleSearch };
};
