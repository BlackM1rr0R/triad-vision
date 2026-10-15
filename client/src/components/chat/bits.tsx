import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Popover } from '@/components/tasks/bits';
import type { Person } from './types';
import { EMOJIS, avatarTone, fullName, initials } from './utils';

export const Avatar = ({ person, size = 'md', className }: { person: Person | null | undefined; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) => (
  <span
    title={fullName(person)}
    className={clsx(
      'inline-grid shrink-0 place-items-center rounded-full font-bold select-none',
      person ? avatarTone(person.id) : 'bg-slate-200 text-slate-600',
      { xs: 'size-5 text-[0.55rem]', sm: 'size-6 text-[0.6rem]', md: 'size-8 text-[0.7rem]', lg: 'size-9 text-xs' }[size],
      className,
    )}
  >
    {initials(person)}
  </span>
);

/** 24 common emojis in a popover anchored to the trigger (the popover's parent). */
export const EmojiPicker = ({ open, onClose, onPick, align = 'left' }: { open: boolean; onClose: () => void; onPick: (emoji: string) => void; align?: 'left' | 'right' }) => (
  <Popover open={open} onClose={onClose} align={align} className="w-64">
    <div className="grid grid-cols-8 gap-0.5">
      {EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => {
            onPick(e);
            onClose();
          }}
          className="grid size-7 place-items-center rounded-md text-lg leading-none hover:bg-surface"
          aria-label={e}
        >
          {e}
        </button>
      ))}
    </div>
  </Popover>
);

/** Centered modal (full screen on phones). Closes on backdrop click and Escape. */
export const Modal = ({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) => {
  const { t } = useTranslation();
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-stretch justify-center sm:items-start sm:p-6 sm:pt-[8vh]">
          <motion.div className="absolute inset-0 bg-navy-950/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={clsx('relative flex max-h-full w-full flex-col overflow-hidden bg-card shadow-2xl sm:max-h-[84vh] sm:rounded-2xl sm:border sm:border-line', { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' }[size])}
          >
            <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <h2 id={titleId} className="font-display text-base font-bold text-ink">
                {title}
              </h2>
              <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" aria-label={t('chat.actions.close')}>
                <X className="size-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
            {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <label className="block">
    <span className="label">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
  </label>
);
