import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useLocation } from 'react-router-dom';
import { LOCALES, SITE_LOCALES, switchLanguage, type SiteLocale } from '@/i18n';
import { isPrivatePath, SITE_LANGUAGE_NAMES as NAMES } from '@/lib/siteLocale';
import { Flag } from '../ui/Flag';

const LIST_W = 192; // w-48
const GAP = 8;
/** Height of the list before it is measured: one 44px row per language plus padding. */
const LIST_H_GUESS = SITE_LOCALES.length * 44 + 10;

interface ListPos {
  left: number;
  top?: number;
  bottom?: number;
  up: boolean;
}

/**
 * Where the list goes (viewport coordinates): below the button, or above it when there is not enough room
 * below (the switcher at the bottom of the workspace sidebar); right-aligned with the button, or left-aligned
 * when that would leave the screen (the narrow collapsed sidebar); always kept inside the viewport.
 */
const placeList = (r: DOMRect, listH: number): ListPos => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const below = vh - r.bottom - GAP;
  const above = r.top - GAP;
  const up = below < listH + GAP && above > below;
  let left = r.right - LIST_W;
  if (left < GAP) left = r.left;
  left = Math.min(Math.max(GAP, left), Math.max(GAP, vw - LIST_W - GAP));
  if (up) return { left, bottom: Math.max(GAP, vh - r.top + GAP), up };
  return { left, top: Math.max(GAP, Math.min(r.bottom + GAP, vh - listH - GAP)), up };
};

const samePos = (a: ListPos, b: ListPos) => a.up === b.up && a.left === b.left && a.top === b.top && a.bottom === b.bottom;

/**
 * variant "pill": bordered button for the header bars and the sidebars.
 * variant "bar": borderless, small text for the thin top bar.
 *
 * The list is rendered through a portal with fixed positioning (the top bar collapses with an overflow-hidden
 * height animation, which used to clip the dropdown). It opens upward when there is no room below (the switcher
 * at the bottom of the workspace sidebar used to open off-screen), stays inside the viewport, closes on an
 * outside click, Escape, Tab, scroll or resize, and works with the keyboard (arrow keys, Home / End, Enter).
 */
export const LanguageSwitcher = ({ light = false, variant = 'pill', compact = false }: { light?: boolean; variant?: 'pill' | 'bar'; /** Flag only (the collapsed sidebar). */ compact?: boolean }) => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<ListPos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const current = ((i18n.resolvedLanguage ?? 'az').slice(0, 2) as SiteLocale) || 'az';
  // Turkish and Ukrainian exist for the public site; the portals offer the four content languages.
  const pathname = useLocation().pathname;
  const choices: readonly SiteLocale[] = isPrivatePath(pathname) && current !== 'tr' && current !== 'uk' ? LOCALES : SITE_LOCALES;

  // Place the list next to the button; once it is rendered, again with its real height.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setPos(null);
      return;
    }
    setPos(placeList(buttonRef.current.getBoundingClientRect(), LIST_H_GUESS));
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !pos || !listRef.current || !buttonRef.current) return;
    const h = listRef.current.offsetHeight;
    if (!h) return;
    const next = placeList(buttonRef.current.getBoundingClientRect(), h);
    if (!samePos(next, pos)) setPos(next);
  }, [open, pos]);

  // Keyboard: the current language gets the focus when the list opens.
  const placed = !!pos;
  useEffect(() => {
    if (!open || !placed) return;
    const id = window.requestAnimationFrame(() => {
      const sel = listRef.current?.querySelector<HTMLButtonElement>('button[aria-selected="true"]');
      (sel ?? listRef.current?.querySelector<HTMLButtonElement>('button[role="option"]'))?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, placed]);

  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onMove = (e: Event) => {
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    // Capture: a scrolling sidebar or panel moves the button away from the list, too.
    window.addEventListener('scroll', onMove, { passive: true, capture: true });
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', onMove, { capture: true });
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  const onListKey = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    const btns = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? [])];
    const i = btns.findIndex((b) => b === document.activeElement);
    const go = (n: number) => {
      e.preventDefault();
      btns[(n + btns.length) % btns.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(btns.length - 1);
    else if (e.key === 'Tab') close();
  };

  const onButtonKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKey}
        className={clsx(
          'flex items-center gap-1.5 text-xs font-bold whitespace-nowrap transition',
          variant === 'pill' && (compact ? 'h-11 min-w-11 justify-center rounded-lg border px-1.5 sm:h-10 sm:min-w-10' : 'h-11 min-w-11 justify-center rounded-lg border px-2 min-[400px]:px-2.5 sm:h-10'),
          variant === 'pill' && (light ? 'border-white/25 text-white hover:bg-white/10' : 'border-line text-ink hover:border-primary'),
          variant === 'bar' && 'h-8 rounded px-1.5 text-white/80 hover:text-white',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={NAMES[current]}
      >
        <Flag code={current} className="w-5" />
        {!compact && <span className={variant === 'pill' ? 'hidden min-[400px]:inline' : undefined}>{current.toUpperCase()}</span>}
        <ChevronDown className={clsx('size-3.5 opacity-70 transition-transform', open && 'rotate-180', compact ? 'hidden' : variant === 'pill' && 'hidden min-[400px]:block')} />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.ul
              ref={listRef}
              role="listbox"
              aria-label={NAMES[current]}
              onKeyDown={onListKey}
              initial={{ opacity: 0, y: pos.up ? 6 : -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: pos.up ? 6 : -6, scale: 0.97 }}
              transition={{ duration: 0.16 }}
              style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: LIST_W, maxHeight: 'calc(100dvh - 16px)' }}
              className={clsx('fixed z-[200] overflow-y-auto rounded-xl border border-line bg-card p-1 shadow-2xl', pos.up ? 'origin-bottom' : 'origin-top')}
            >
              {choices.map((l) => (
                <li key={l}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={l === current}
                    onClick={() => {
                      close(true);
                      switchLanguage(l);
                    }}
                    className={clsx(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition outline-none focus-visible:ring-2 focus-visible:ring-focus/40',
                      l === current ? 'bg-sunken font-semibold text-link' : 'text-ink hover:bg-sunken focus-visible:bg-sunken',
                    )}
                  >
                    <Flag code={l} className="w-6" />
                    <span className="flex-1">{NAMES[l]}</span>
                    {l === current && <Check className="size-4" />}
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
};
