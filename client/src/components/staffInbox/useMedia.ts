import { useSyncExternalStore } from 'react';

/** True while the media query matches (false on the server render). */
export const useMedia = (query: string) =>
  useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );

/** Split view of the staff inbox (list + thread + profile): from `lg` (1024 px); the profile sits beside the thread from `xl`. */
export const SPLIT_QUERY = '(min-width: 1024px)';
export const WIDE_QUERY = '(min-width: 1280px)';
