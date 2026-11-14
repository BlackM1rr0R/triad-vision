import { useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useClientOnly } from '@/lib/ssr';
import { useOverlay } from '@/components/ui/overlay';
import { registerCopy } from '@/i18n';
import { pagesStaffMobile } from '@/i18n/pagesStaffMobile';

registerCopy(pagesStaffMobile);

/**
 * Phone bottom sheet (reply, status change, document preview): slides up from the bottom edge, scrim behind,
 * the shared overlay behaviour (Escape, focus trap / return, scroll lock — components/ui/overlay). `full` takes the
 * whole screen (document preview). The footer sits above the home indicator (safe-area inset).
 */
export const BottomSheet = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  full,
  busy,
  zIndex = 75,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  full?: boolean;
  busy?: boolean;
  zIndex?: number;
}) => {
  const { t } = useTranslation();
  const client = useClientOnly();
  const reduce = useReducedMotion();
  const close = () => {
    if (!busy) onClose();
  };
  const panelRef = useOverlay<HTMLDivElement>(open, close);
  const titleId = useId();
  if (!client) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0" style={{ zIndex }}>
          <motion.div className="absolute inset-0 bg-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} aria-hidden />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-busy={busy || undefined}
            tabIndex={-1}
            className={clsx(
              'absolute inset-x-0 bottom-0 flex flex-col bg-raised text-ink shadow-[var(--tv-shadow-overlay)] outline-none',
              full ? 'top-0 pt-[env(safe-area-inset-top)]' : 'max-h-[88dvh] rounded-t-2xl border-t border-line',
            )}
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            {!full && <span className="mx-auto mt-2 block h-1 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden />}
            <div className="flex shrink-0 items-start gap-2 border-b border-line py-2 pr-2 pl-4">
              <div className="min-w-0 flex-1 py-2">
                <h2 id={titleId} className="truncate text-base font-semibold text-ink">
                  {title}
                </h2>
                {subtitle && <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="grid size-11 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-sunken hover:text-ink disabled:opacity-50"
                aria-label={t('smob.sheet.close')}
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
            {footer && <div className="flex shrink-0 gap-2 border-t border-line bg-sunken/60 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
