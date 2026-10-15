import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

export interface MenuItem {
  kind?: 'item';
  id: string;
  label: ReactNode;
  icon?: LucideIcon;
  /** Secondary line under the label (path, owner…). */
  hint?: ReactNode;
  /** Rendered at the right end (badge, shortcut). */
  trailing?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** Tooltip; also used to explain why an item is disabled. */
  title?: string;
  active?: boolean;
  onSelect: () => void;
}

export type MenuEntry = MenuItem | { kind: 'separator'; id: string } | { kind: 'heading'; id: string; label: ReactNode };

export interface MenuPosition {
  x: number;
  y: number;
}

const MARGIN = 8;

/**
 * Floating menu anchored at a viewport point (right-click, "⋯" button, picker). Keyboard: arrows move
 * between enabled items, Home/End jump, Enter/Space activate, Escape/Tab close. Clicking outside closes.
 */
export const ContextMenu = ({
  open,
  at,
  items,
  onClose,
  label,
  className,
}: {
  open: boolean;
  at: MenuPosition | null;
  items: MenuEntry[];
  onClose: () => void;
  /** Accessible name of the menu. */
  label: string;
  className?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPosition | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Keep the panel inside the viewport (flip up / left when there is no room).
  useLayoutEffect(() => {
    if (!open || !at) {
      setPos(null);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = at.x;
    let y = at.y;
    if (x + width + MARGIN > vw) x = Math.max(MARGIN, vw - width - MARGIN);
    if (y + height + MARGIN > vh) y = Math.max(MARGIN, Math.min(at.y - height, vh - height - MARGIN));
    setPos({ x, y });
  }, [open, at, items.length]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    const close = () => closeRef.current();
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    document.addEventListener('scroll', close, true);
    const t = window.setTimeout(() => ref.current?.querySelector<HTMLElement>('[role=menuitem]:not([disabled])')?.focus(), 20);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      document.removeEventListener('scroll', close, true);
      window.clearTimeout(t);
    };
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not([disabled])') ?? []);
    if (buttons.length === 0) return;
    const i = buttons.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      buttons[(n + buttons.length) % buttons.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(buttons.length - 1);
    else if (e.key === 'Tab') {
      e.preventDefault();
      onClose();
    }
  };

  if (!open || !at) return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className={clsx(
        'fixed z-[90] min-w-[210px] max-w-[min(20rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl border border-line bg-card py-1 shadow-[0_12px_40px_-12px_rgba(11,31,68,0.35)] outline-none',
        pos ? 'opacity-100' : 'opacity-0',
        className,
      )}
      style={{ left: pos?.x ?? at.x, top: pos?.y ?? at.y }}
    >
      {items.map((it) => {
        if (it.kind === 'separator') return <div key={it.id} role="separator" className="my-1 border-t border-line" />;
        if (it.kind === 'heading')
          return (
            <p key={it.id} className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-wide text-muted uppercase">
              {it.label}
            </p>
          );
        const Icon = it.icon;
        return (
          <button
            key={it.id}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            title={it.title}
            aria-current={it.active || undefined}
            onClick={() => {
              if (it.disabled) return;
              onClose();
              it.onSelect();
            }}
            className={clsx(
              'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm outline-none transition',
              it.danger ? 'text-danger hover:bg-red-50 focus-visible:bg-red-50' : 'text-ink hover:bg-surface focus-visible:bg-surface',
              it.active && 'bg-brand-50',
              it.disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent',
            )}
          >
            {Icon && <Icon className={clsx('size-4 shrink-0', it.danger ? 'text-danger' : 'text-muted')} aria-hidden />}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{it.label}</span>
              {it.hint && <span className="block truncate text-[11px] font-normal text-muted">{it.hint}</span>}
            </span>
            {it.trailing && <span className="shrink-0">{it.trailing}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
};
