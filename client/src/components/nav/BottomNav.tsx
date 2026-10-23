import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPortalUx } from '@/i18n/pagesPortalUx';
import './BottomNav.css';

registerCopy(pagesPortalUx);

export interface BottomNavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Link target; without it the item is a button (onClick). */
  to?: string;
  onClick?: () => void;
  active?: boolean;
  /** Counter badge (unread, open). */
  badge?: number;
  /** data-tour target for the guided tour (default: bnav-<key>). */
  tour?: string;
  /** Button that opens a menu / drawer. */
  expanded?: boolean;
}

const isTextField = (el: Element | null) =>
  !!el &&
  (el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color'].includes(el.type)) ||
    (el instanceof HTMLElement && el.isContentEditable) ||
    el instanceof HTMLSelectElement);

/** On-screen keyboard open: the visual viewport is much shorter than the layout viewport while a field has focus. */
export const useSoftKeyboardOpen = () => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    const check = () => {
      const focused = isTextField(document.activeElement);
      // × scale: pinch-zoom shrinks vv.height too, the keyboard does not change the scale.
      const shrunk = vv ? window.innerHeight - vv.height * vv.scale > 150 : false;
      // Without visualViewport (old browsers) a focused text field on a touch device is the best guess.
      setOpen(focused && (vv ? shrunk : matchMedia('(pointer: coarse)').matches));
    };
    const later = () => window.setTimeout(check, 250);
    vv?.addEventListener('resize', check);
    document.addEventListener('focusin', later);
    document.addEventListener('focusout', later);
    return () => {
      vv?.removeEventListener('resize', check);
      document.removeEventListener('focusin', later);
      document.removeEventListener('focusout', later);
    };
  }, []);
  return open;
};

/** A modal / drawer / full-screen menu is open: they all lock the body scroll (overflow: hidden). */
export const useBodyScrollLocked = () => {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const read = () => setLocked(document.body.style.overflow === 'hidden');
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.body, { attributes: true, attributeFilter: ['style'] });
    return () => mo.disconnect();
  }, []);
  return locked;
};

/**
 * Phone navigation bar (< 768 px): 4–5 icons with labels, active state, badges, safe-area padding.
 * `fixed` (default) pins it to the viewport and pads the page (html.has-bottom-nav); `fixed={false}` renders
 * it in the flow, for full-height app shells (workspace) that already end at the bottom of the screen.
 * Hidden while the on-screen keyboard is open and while a dialog locks the page.
 */
export function BottomNav({ items, fixed = true, className, hidden: forceHidden = false }: { items: BottomNavItem[]; fixed?: boolean; className?: string; hidden?: boolean }) {
  const { t } = useTranslation();
  const keyboard = useSoftKeyboardOpen();
  const locked = useBodyScrollLocked();
  const hidden = forceHidden || keyboard || (fixed && locked);

  useEffect(() => {
    if (!fixed) return;
    const html = document.documentElement;
    html.classList.add('has-bottom-nav');
    return () => html.classList.remove('has-bottom-nav', 'bnav-hidden');
  }, [fixed]);
  useEffect(() => {
    if (fixed) document.documentElement.classList.toggle('bnav-hidden', hidden);
  }, [fixed, hidden]);

  if (hidden && !fixed) return null;

  const bar = (
    <nav
      aria-label={t('pux.nav.label')}
      className={clsx(
        'z-40 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] text-ink shadow-[0_-8px_24px_-18px_rgba(5,15,36,0.35)] md:hidden',
        fixed && ['fixed inset-x-0 bottom-0 transition-transform duration-200 motion-reduce:transition-none', hidden && 'pointer-events-none translate-y-full'],
        className,
      )}
      aria-hidden={hidden || undefined}
      data-bottom-nav
    >
      <ul className="mx-auto grid h-16 max-w-lg" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((it) => {
          const Icon = it.icon;
          const badge = it.badge && it.badge > 0 ? it.badge : 0;
          const inner = (
            <>
              <span className="relative">
                <Icon className={clsx('size-[1.35rem]', it.active ? 'text-brand-600' : 'text-muted')} strokeWidth={it.active ? 2.4 : 2} aria-hidden />
                {badge > 0 && (
                  <span className="absolute -top-1.5 left-3 grid h-[1.1rem] min-w-[1.1rem] place-items-center rounded-full bg-danger px-1 text-[10px] leading-none font-bold text-white ring-2 ring-card" aria-hidden>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span className={clsx('max-w-full truncate text-[11px] leading-tight', it.active ? 'font-bold text-ink' : 'font-medium text-muted')}>{it.label}</span>
              {badge > 0 && <span className="sr-only">, {t('pux.nav.badge', { count: badge })}</span>}
              {it.active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-brand-600" aria-hidden />}
            </>
          );
          const cls = 'relative flex h-full w-full flex-col items-center justify-center gap-1 px-1 outline-none focus-visible:bg-surface active:bg-surface';
          return (
            <li key={it.key} className="min-w-0">
              {it.to ? (
                <Link to={it.to} className={cls} aria-current={it.active ? 'page' : undefined} data-tour={it.tour ?? `bnav-${it.key}`} tabIndex={hidden ? -1 : undefined}>
                  {inner}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={it.onClick}
                  className={cls}
                  aria-expanded={it.expanded}
                  data-tour={it.tour ?? `bnav-${it.key}`}
                  tabIndex={hidden ? -1 : undefined}
                >
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
  // Fixed: portal to <body>, so the bar is above the footer even when the page sits in an animated
  // (stacking-context) wrapper such as the layout's .page-in.
  return fixed ? createPortal(bar, document.body) : bar;
}
