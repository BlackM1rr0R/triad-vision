import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { useEscapeLayer } from './overlay';

export type MenuItem =
  | {
      key?: string;
      label: ReactNode;
      icon?: LucideIcon;
      onSelect?: () => void;
      /** Navigate instead of calling onSelect. */
      to?: string;
      danger?: boolean;
      disabled?: boolean;
      /** Right-aligned hint (shortcut, count). */
      hint?: ReactNode;
    }
  | 'separator'
  | { heading: ReactNode };

export type MenuProps = {
  /** The trigger element (Button / IconButton / any element that forwards ref and onClick). */
  trigger: ReactElement<Record<string, unknown>>;
  items: MenuItem[];
  /** Horizontal alignment to the trigger (default "end" = right edges line up). */
  align?: 'start' | 'end';
  /** Accessible name of the menu (default: the trigger's label). */
  label?: string;
  className?: string;
  /** Min width of the popup (Tailwind class, default "min-w-48"). */
  widthClassName?: string;
};

type Pos = { top: number; left: number; maxHeight: number; up: boolean };

/**
 * Dropdown action menu (role="menu"): Enter / Space / ArrowDown open it on the first item, arrows / Home /
 * End move, Escape closes and returns focus, typing jumps to the first item that starts with the letter.
 * Rendered in a portal with fixed positioning, so table / card overflow never clips it.
 *
 *   <Menu trigger={<IconButton icon={MoreHorizontal} label={t('ui.moreActions')} />}
 *     items={[{ label: 'Edit', icon: Pencil, onSelect: edit }, 'separator', { label: 'Delete', icon: Trash2, danger: true, onSelect: remove }]} />
 */
export const Menu = ({ trigger, items, align = 'end', label, className, widthClassName = 'min-w-48' }: MenuProps) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusFirst = useRef<'first' | 'last' | null>(null);
  const menuId = useId();
  const navigate = useNavigate();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setPos(null);
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEscapeLayer(open, () => close(true));

  const place = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const vh = window.innerHeight;
    const below = vh - r.bottom - 8;
    const above = r.top - 8;
    const up = below < 220 && above > below;
    const menuW = menuRef.current?.offsetWidth ?? 192;
    const left = align === 'end' ? Math.max(8, r.right - menuW) : Math.min(r.left, window.innerWidth - menuW - 8);
    setPos({ top: up ? r.top - 4 : r.bottom + 4, left, maxHeight: Math.max(160, (up ? above : below) - 4), up });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      close(false);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, close, place]);

  const itemEls = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);

  useEffect(() => {
    if (!open || !pos) return;
    const els = itemEls();
    if (focusFirst.current === 'last') els[els.length - 1]?.focus();
    else els[0]?.focus();
    focusFirst.current = null;
    // runs once per opening: when the first position has been measured
  }, [open, pos === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const els = itemEls();
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      els[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      els[els.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      close(false);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      const ch = e.key.toLowerCase();
      const start = i + 1;
      const order = [...els.slice(start), ...els.slice(0, start)];
      order.find((el) => el.textContent?.trim().toLowerCase().startsWith(ch))?.focus();
    }
  };

  const triggerProps = trigger.props as { onClick?: (e: unknown) => void; onKeyDown?: (e: KeyboardEvent) => void; label?: string; 'aria-label'?: string; ref?: Ref<HTMLElement> };
  const clonedTrigger = cloneElement(trigger, {
    ref: (el: HTMLElement | null) => {
      triggerRef.current = el;
      const r = triggerProps.ref;
      if (typeof r === 'function') r(el);
      else if (r && typeof r === 'object') (r as { current: HTMLElement | null }).current = el;
    },
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: (e: unknown) => {
      triggerProps.onClick?.(e);
      if (open) close(false);
      else setOpen(true);
    },
    onKeyDown: (e: KeyboardEvent) => {
      triggerProps.onKeyDown?.(e);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        focusFirst.current = e.key === 'ArrowUp' ? 'last' : 'first';
        setOpen(true);
      }
    },
  });

  return (
    <>
      {clonedTrigger}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label ?? triggerProps.label ?? triggerProps['aria-label']}
            onKeyDown={onMenuKey}
            className={clsx(
              'fixed z-[120] overflow-y-auto overscroll-contain rounded-xl border border-line bg-raised p-1 text-sm text-ink shadow-[var(--tv-shadow-raised)]',
              widthClassName,
              !pos && 'invisible',
              className,
            )}
            style={pos ? { top: pos.up ? undefined : pos.top, bottom: pos.up ? window.innerHeight - pos.top : undefined, left: pos.left, maxHeight: pos.maxHeight } : { top: 0, left: 0 }}
          >
            {items.map((it, idx) => {
              if (it === 'separator') return <div key={`sep-${idx}`} role="separator" className="my-1 h-px bg-line" />;
              if ('heading' in it)
                return (
                  <div key={`h-${idx}`} className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase" role="presentation">
                    {it.heading}
                  </div>
                );
              const Icon = it.icon;
              return (
                <button
                  key={it.key ?? idx}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={it.disabled || undefined}
                  onClick={() => {
                    if (it.disabled) return;
                    close(true);
                    if (it.to) navigate(it.to);
                    else it.onSelect?.();
                  }}
                  className={clsx(
                    'flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none sm:min-h-9',
                    it.disabled ? 'cursor-not-allowed opacity-50' : it.danger ? 'text-danger-fg hover:bg-danger-bg focus:bg-danger-bg' : 'hover:bg-sunken focus:bg-sunken',
                  )}
                >
                  {Icon && <Icon className="size-4 shrink-0 opacity-80" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="shrink-0 text-xs text-muted">{it.hint}</span>}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
};
