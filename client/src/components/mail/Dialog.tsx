import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Theme-token modal for the workspace (light + dark): escape closes, focus moves inside. */
export const Dialog = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) => {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', onKey, true);
    const timer = window.setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]):not([type=checkbox]), textarea, select');
      (el ?? panelRef.current)?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      window.clearTimeout(timer);
      prev?.focus?.();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
          <motion.div className="absolute inset-0 bg-navy-950/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={clsx(
              'relative flex max-h-full w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-card text-ink shadow-2xl outline-none sm:rounded-2xl',
              size === 'sm' && 'sm:max-w-md',
              size === 'md' && 'sm:max-w-lg',
              size === 'lg' && 'sm:max-w-2xl',
              size === 'xl' && 'sm:max-w-4xl',
            )}
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line py-3 pr-3 pl-5">
              <div className="min-w-0 py-1">
                <h2 id={titleId} className="text-base font-bold text-ink">
                  {title}
                </h2>
                {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
              </div>
              <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" aria-label={t('mail.actions.close')}>
                <X className="size-4" />
              </button>
            </div>
            {children && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>}
            {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line bg-surface/60 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export const Confirm = ({ open, onClose, onConfirm, title, message, confirmLabel, loading, danger = true }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message?: ReactNode; confirmLabel?: string; loading?: boolean; danger?: boolean }) => {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={() => !loading && onClose()}
      size="sm"
      title={title}
      footer={
        <>
          <button type="button" className="btn-sm rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink hover:bg-surface" onClick={onClose} disabled={loading}>
            {t('mail.actions.cancel')}
          </button>
          <button type="button" className={clsx(danger ? 'btn-danger' : 'btn-primary', 'btn-sm')} onClick={onConfirm} disabled={loading} data-autofocus>
            {confirmLabel ?? t('mail.actions.delete')}
          </button>
        </>
      }
    >
      {message && <p className="text-sm text-muted">{message}</p>}
    </Dialog>
  );
};
