import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Deep link into a page's create flow: `?new=1` (e.g. from a Ctrl+K palette action) calls `onNew` once
 * and removes the parameter, so Back / reload do not open the dialog again.
 */
export const useNewParam = (onNew: () => void, param = 'new') => {
  const [params, setParams] = useSearchParams();
  const fire = useRef(onNew);
  fire.current = onNew;
  const wanted = params.get(param) === '1';
  useEffect(() => {
    if (!wanted) return;
    fire.current();
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(param);
        return next;
      },
      { replace: true },
    );
  }, [wanted, param, setParams]);
};
