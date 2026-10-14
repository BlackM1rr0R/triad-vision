import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { LOCALES, type Locale } from '@/i18n';
import { Flag } from '../ui/Flag';

const NAMES: Record<Locale, string> = { az: 'Azərbaycan', de: 'Deutsch', en: 'English', ru: 'Русский' };

/**
 * variant "pill": bordered button for the main header bar.
 * variant "bar": borderless, small text for the thin top bar.
 */
export const LanguageSwitcher = ({ light = false, variant = 'pill' }: { light?: boolean; variant?: 'pill' | 'bar' }) => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = ((i18n.resolvedLanguage ?? 'az').slice(0, 2) as Locale) || 'az';

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);

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
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 z-[60] mt-2 w-48 origin-top-right overflow-hidden rounded-xl border border-line bg-white p-1 shadow-2xl"
          >
            {LOCALES.map((l) => (
              <li key={l}>
                <button
                  type="button"
                  role="option"
                  aria-selected={l === current}
                  onClick={() => {
                    void i18n.changeLanguage(l);
                    setOpen(false);
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
      </AnimatePresence>
    </div>
  );
};
