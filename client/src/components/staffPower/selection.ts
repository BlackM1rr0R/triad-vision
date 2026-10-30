import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RowSelectionProps } from './tableSettings';
import { rangeBetween } from './pure';

export { rangeBetween };

/**
 * Multi-select of list rows: checkbox per row, Shift+click selects the range from the last clicked row, a
 * header checkbox for the page and "all matching the filters" (sent to the server as the filter, capped there).
 * The selection clears when `resetKey` changes (other filters / page).
 */
export const useRowSelection = (pageIds: string[], resetKey: string) => {
  const [picked, setPicked] = useState<string[]>([]);
  const [allMatching, setAllMatching] = useState(false);
  const last = useRef<string | null>(null);

  useEffect(() => {
    setPicked([]);
    setAllMatching(false);
    last.current = null;
  }, [resetKey]);

  const set = useMemo(() => new Set(picked), [picked]);
  const allRef = useRef(allMatching);
  allRef.current = allMatching;
  const toggle = useCallback(
    (id: string, on: boolean, shift: boolean) => {
      const wasAll = allRef.current;
      setAllMatching(false);
      setPicked((prev) => {
        const range = shift && last.current ? rangeBetween(pageIds, last.current, id) : [];
        const ids = range.length ? range : [id];
        // Leaving "all matching" keeps the visible page selected, minus what was just unticked.
        const next = new Set(wasAll ? pageIds : prev);
        for (const x of ids) {
          if (on) next.add(x);
          else next.delete(x);
        }
        return [...next];
      });
      last.current = id;
    },
    [pageIds],
  );
  const togglePage = useCallback(
    (on: boolean) => {
      setAllMatching(false);
      setPicked((prev) => (on ? [...new Set([...prev, ...pageIds])] : prev.filter((x) => !pageIds.includes(x))));
    },
    [pageIds],
  );
  const clear = useCallback(() => {
    setPicked([]);
    setAllMatching(false);
    last.current = null;
  }, []);

  const allOnPage = pageIds.length > 0 && pageIds.every((x) => set.has(x));
  const someOnPage = pageIds.some((x) => set.has(x));
  const props: RowSelectionProps = { isSelected: (id) => allMatching || set.has(id), toggle, allOnPage: allOnPage || (allMatching && pageIds.length > 0), someOnPage, togglePage };
  return { picked, setPicked, allMatching, setAllMatching, clear, count: picked.length, props, allOnPage };
};

export type RowSelection = ReturnType<typeof useRowSelection>;
