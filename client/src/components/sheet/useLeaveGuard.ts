import { useEffect, useRef } from 'react';

/**
 * Warns before unsaved work is lost: closing / reloading the tab (beforeunload) and following an
 * in-app link (the app uses <BrowserRouter>, which has no navigation blocker).
 */
export function useLeaveGuard(dirty: boolean, message: string) {
  const state = useRef({ dirty, message });
  state.current = { dirty, message };

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!state.current.dirty) return;
      e.preventDefault();
      e.returnValue = state.current.message;
    };
    const click = (e: MouseEvent) => {
      if (!state.current.dirty || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!window.confirm(state.current.message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', click, true);
    };
  }, []);
}
