import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';

/** Small accessible modal asking the user to confirm an action. */
export const ConfirmDialog = ({
  open,
  title,
  children,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, busy, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-navy-950/50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !busy && onClose()}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="card max-h-full w-full max-w-md overflow-y-auto overscroll-contain p-5 sm:p-6"
            initial={{ y: 24, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 16, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-4">
              <span
                className={clsx(
                  'grid size-11 shrink-0 place-items-center rounded-full',
                  danger ? 'bg-red-100 text-danger' : 'bg-brand-100 text-brand-600',
                )}
              >
                <AlertTriangle className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 id={titleId} className="text-lg font-bold break-words text-navy-900">
                  {title}
                </h2>
                {children && <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>}
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn min-h-11 border border-line text-navy-900 hover:bg-surface" onClick={onClose} disabled={busy}>
                {t('common.cancel')}
              </button>
              <button
                ref={confirmRef}
                type="button"
                className={clsx('min-h-11', danger ? 'btn-danger' : 'btn-primary')}
                onClick={onConfirm}
                disabled={busy}
              >
                {busy && <Spinner className="size-4" />}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmDialog;
