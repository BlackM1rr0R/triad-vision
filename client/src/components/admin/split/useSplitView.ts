import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

/**
 * Split view of an admin list page: the on / off choice is remembered per user and page (localStorage), the
 * selected row lives in the URL (?selected=<id>, shareable, survives reload). Split only applies from `lg`
 * (1024 px); below that the page shows its normal list.
 */

const WIDE = '(min-width: 1024px)';
const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
export const useWideScreen = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);

const read = (key: string) => {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

export const useSplitView = (page: string) => {
  const { user } = useAuth();
  const key = `tv-admin-split:${page}:${user?.id ?? 'anon'}`;
  const [on, setOn] = useState(() => read(key));
  useEffect(() => setOn(read(key)), [key]);
  const wide = useWideScreen();
  const [params, setParams] = useSearchParams();
  const selected = params.get('selected');

  const toggle = useCallback(() => {
    setOn((v) => {
      try {
        localStorage.setItem(key, v ? '0' : '1');
      } catch {
        /* storage unavailable: in-memory only */
      }
      return !v;
    });
  }, [key]);

  const select = useCallback(
    (id: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('selected', id);
          else next.delete('selected');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  return { enabled: on, active: on && wide, wide, toggle, selected, select };
};
