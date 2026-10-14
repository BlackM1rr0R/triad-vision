import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { LOCALES, switchLanguage, type Locale } from '@/i18n';
import { Flag } from '../ui/Flag';

const NAMES: Record<Locale, string> = { az: 'Azərbaycan', de: 'Deutsch', en: 'English', ru: 'Русский' };

/**
 * variant "pill": bordered button for the main header bar.
 * variant "bar": borderless, small text for the thin top bar.
 *
 * The list is rendered through a portal with fixed positioning: the top bar collapses with an
 * overflow-hidden height animation, which used to clip the dropdown so it never appeared.
 */
export const LanguageSwitcher = ({ light = false, variant = 'pill' }: { light?: boolean; variant?: 'pill' | 'bar' }) => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const current = ((i18n.resolvedLanguage ?? 'az').slice(0, 2) as Locale) || 'az';

  // Place the list under the button (viewport coordinates, because it lives in a portal).
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'flex items-center gap-1.5 text-xs font-bold whitespace-nowrap transition',
          variant === 'pill' && 'h-10 rounded-lg border px-2 min-[400px]:px-2.5',
          variant === 'pill' && (light ? 'border-white/25 text-white hover:bg-white/10' : 'border-line text-navy-900 hover:border-brand-400'),
          variant === 'bar' && 'h-8 rounded px-1.5 text-white/80 hover:text-white',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={NAMES[current]}
      >
        <Flag code={current} className="w-5" />
        <span className={variant === 'pill' ? 'hidden min-[400px]:inline' : undefined}>{current.toUpperCase()}</span>
        <ChevronDown className={clsx('size-3.5 opacity-70 transition-transform', open && 'rotate-180')} />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.ul
              ref={listRef}
              role="listbox"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.16 }}
              style={{ top: pos.top, right: pos.right }}
              className="fixed z-[120] w-48 origin-top-right overflow-hidden rounded-xl border border-line bg-white p-1 shadow-2xl"
            >
              {LOCALES.map((l) => (
                <li key={l}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={l === current}
                    onClick={() => {
                      setOpen(false);
                      switchLanguage(l);
                    }}
                    className={clsx(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition',
                      l === current ? 'bg-brand-50 font-semibold text-brand-700' : 'text-navy-900 hover:bg-surface',
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
