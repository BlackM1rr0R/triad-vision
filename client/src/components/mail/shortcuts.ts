import { useEffect, useRef } from 'react';

export type ShortcutKey = 'j' | 'k' | 'e' | '#' | 'r' | 'a' | 'f' | 's' | 'u' | 'c' | '/' | 'Escape';

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable || !!el.closest('[contenteditable="true"]');
};

/**
 * Gmail-style single-key shortcuts for the mail page. Ignored while typing, while a dialog or the
 * compose window is open (except Escape, which they handle themselves) and with modifier keys.
 */
export const useMailShortcuts = (handlers: Partial<Record<ShortcutKey, () => void>>, enabled = true) => {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const key = (e.key === 'Escape' ? 'Escape' : e.key) as ShortcutKey;
      const h = latest.current[key];
      if (!h) return;
      e.preventDefault();
      h();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled]);
};

export const SHORTCUT_LIST: { keys: string; label: ShortcutKey | 'ctrlEnter' | 'hash' | 'slash' | 'esc' }[] = [
  { keys: 'j', label: 'j' },
  { keys: 'k', label: 'k' },
  { keys: 'e', label: 'e' },
  { keys: '#', label: 'hash' },
  { keys: 'r', label: 'r' },
  { keys: 'a', label: 'a' },
  { keys: 'f', label: 'f' },
  { keys: 's', label: 's' },
  { keys: 'u', label: 'u' },
  { keys: 'c', label: 'c' },
  { keys: '/', label: 'slash' },
  { keys: 'Esc', label: 'esc' },
  { keys: 'Ctrl+Enter', label: 'ctrlEnter' },
];
