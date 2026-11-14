import { useSyncExternalStore } from 'react';

/** Phone layout of the staff area: below `md` (768 px), the breakpoint of the bottom tab bars (components/nav/BottomNav). */
export const PHONE_QUERY = '(max-width: 767.98px)';

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

/** True on phone-width viewports (false on the server render and on tablets / desktops). */
export const useIsPhone = () => useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false);
