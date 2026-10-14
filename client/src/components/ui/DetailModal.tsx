import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Accessible dialog used for "click to open details" cards on the public site.
 * Bottom sheet on phones, centered card on larger screens. Closes on Esc and backdrop click.
 */
export const DetailModal = ({
  open,
  onClose,
  title,
  eyebrow,
  icon,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="relative flex max-h-[88svh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl"
          >
            <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-line sm:hidden" />
            <div className="flex items-start gap-4 border-b border-line p-5 sm:p-6">
              {icon && <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">{icon}</span>}
              <div className="min-w-0 flex-1">
                {eyebrow && <p className="text-xs font-bold tracking-widest text-brand-600 uppercase">{eyebrow}</p>}
                <h3 className="mt-1 font-display text-xl leading-snug font-extrabold text-navy-900">{title}</h3>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-navy-900 transition hover:bg-brand-50">
                <X className="size-5" />
              </button>
            </div>
            <div className="overflow-y-auto overscroll-contain p-5 leading-relaxed text-muted sm:p-6">{children}</div>
            {footer && <div className="flex flex-col gap-2 border-t border-line p-4 sm:flex-row sm:justify-end sm:p-5">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
