import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Central registry of admin keyboard shortcuts. The layer (ShortcutLayer, mounted once by AdminLayout) owns the
 * keydown listener; pages register their own shortcuts with `useShortcuts` while they are mounted. The cheat
 * sheet (`?`) lists everything registered right now, so it always matches the page you are on.
 *
 * Keys are single keys as `KeyboardEvent.key` reports them ("j", "Enter", "Escape", "/", "?") or a two-key
 * sequence (["g", "c"]). Ctrl / Cmd / Alt combinations are never handled here (Ctrl+K palette, browser keys).
 */

export interface ShortcutDef {
  /** Unique within its registration. */
  id: string;
  keys: string[];
  /** i18n key of the description shown in the cheat sheet. */
  labelKey: string;
  /** Omitted = listed in the cheat sheet only (the page handles the key itself). */
  handler?: (e: KeyboardEvent) => void;
  /** Also fires when focus is on a button / link (default: only Escape and letters do). */
  overInteractive?: boolean;
}

export interface ShortcutGroup {
  token: symbol;
  scope: 'global' | 'page';
  /** i18n key of the group heading (page groups). */
  titleKey?: string;
  defs: ShortcutDef[];
}

let groups: ShortcutGroup[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const registerShortcuts = (group: ShortcutGroup) => {
  groups = [...groups, group];
  emit();
  return () => {
    groups = groups.filter((g) => g.token !== group.token);
    emit();
  };
};

/** Newest registration first: a page can shadow a global key. */
export const activeGroups = () => groups;

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** Live list of the registered groups (cheat sheet). */
export const useShortcutGroups = () => useSyncExternalStore(subscribe, activeGroups, activeGroups);

/**
 * Registers page shortcuts while mounted (and `enabled`). Handlers may change every render; the latest one runs.
 * The registration itself only changes when the set of ids / keys changes.
 */
export const useShortcuts = (defs: ShortcutDef[], opts: { enabled?: boolean; titleKey?: string; scope?: 'global' | 'page' } = {}) => {
  const { enabled = true, titleKey, scope = 'page' } = opts;
  const latest = useRef(defs);
  latest.current = defs;
  const signature = defs.map((d) => `${d.id}:${d.keys.join('+')}:${d.handler ? 1 : 0}:${d.labelKey}`).join('|');
  useEffect(() => {
    if (!enabled) return;
    const token = Symbol('shortcuts');
    const wrapped: ShortcutDef[] = latest.current.map((d) => ({
      ...d,
      handler: d.handler ? (e: KeyboardEvent) => latest.current.find((x) => x.id === d.id)?.handler?.(e) : undefined,
    }));
    return registerShortcuts({ token, scope, titleKey, defs: wrapped });
  }, [enabled, signature, titleKey, scope]);
};

/** Display form of one key ("Enter" → "↵" stays readable in every language). */
export const keyLabel = (k: string) => (k === 'Escape' ? 'Esc' : k === 'Enter' ? 'Enter' : k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k);
