import { useEffect, useRef } from 'react';
import i18n from '@/i18n';
import { confirmDialog } from '@/components/ui/ConfirmHost';

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
    let bypass = false;
    const click = (e: MouseEvent) => {
      if (bypass || !state.current.dirty || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      // Hold the navigation, ask, then replay the click (the router's <Link> handler navigates as usual).
      e.preventDefault();
      e.stopPropagation();
      void confirmDialog({ title: i18n.t('ui.confirmDlg.unsavedTitle'), message: state.current.message, confirmLabel: i18n.t('ui.confirmDlg.leave') }).then((ok) => {
        if (!ok) return;
        if (!a.isConnected) {
          window.location.assign(url.href);
          return;
        }
        bypass = true;
        try {
          a.click();
        } finally {
          bypass = false;
        }
      });
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', click, true);
    };
  }, []);
}
