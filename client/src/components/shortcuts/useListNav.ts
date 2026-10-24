import { useCallback, useEffect, type RefObject } from 'react';
import { useShortcuts, type ShortcutDef } from './registry';

/**
 * Keyboard list navigation for admin list pages: J / K move the selection, Enter opens it, E starts the inline
 * edit of the selected row, "/" focuses the page search, Esc clears the selection. Rows mark themselves with
 * `data-row-id`, so the selected one is scrolled into view (nearest) without stealing focus.
 */
export const useListNav = ({
  ids,
  selected,
  onSelect,
  onOpen,
  onEdit,
  onEscape,
  searchRef,
  titleKey,
  extra = [],
  enabled = true,
}: {
  ids: string[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onOpen?: (id: string) => void;
  onEdit?: (id: string) => void;
  /** Esc with nothing to close: default clears the selection. */
  onEscape?: () => void;
  searchRef?: RefObject<HTMLInputElement | null>;
  titleKey: string;
  /** More page shortcuts listed in the same cheat-sheet group (e.g. "S" split view). */
  extra?: ShortcutDef[];
  enabled?: boolean;
}) => {
  const move = useCallback(
    (delta: number) => {
      if (!ids.length) return;
      const i = selected ? ids.indexOf(selected) : -1;
      const next = i < 0 ? (delta > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, i + delta));
      onSelect(ids[next]);
    },
    [ids, selected, onSelect],
  );

  useEffect(() => {
    if (!selected) return;
    const el = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(selected)}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  const defs: ShortcutDef[] = [
    { id: 'next', keys: ['j'], labelKey: 'ux.shortcuts.keys.next', handler: () => move(1) },
    { id: 'prev', keys: ['k'], labelKey: 'ux.shortcuts.keys.prev', handler: () => move(-1) },
  ];
  if (onOpen) defs.push({ id: 'open', keys: ['Enter'], labelKey: 'ux.shortcuts.keys.open', handler: () => selected && onOpen(selected) });
  if (onEdit) defs.push({ id: 'edit', keys: ['e'], labelKey: 'ux.shortcuts.keys.edit', handler: () => selected && onEdit(selected) });
  if (searchRef)
    defs.push({
      id: 'search',
      keys: ['/'],
      labelKey: 'ux.shortcuts.keys.search',
      overInteractive: true,
      handler: () => {
        searchRef.current?.focus();
        searchRef.current?.select();
      },
    });
  defs.push({ id: 'close', keys: ['Escape'], labelKey: 'ux.shortcuts.keys.close', handler: () => (onEscape ? onEscape() : onSelect(null)) });

  useShortcuts([...defs, ...extra], { enabled, titleKey });
};
