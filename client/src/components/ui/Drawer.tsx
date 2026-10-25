import { useId, type FormEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOverlay } from './overlay';

export type DrawerWidth = 'sm' | 'md' | 'lg' | 'xl';

const WIDTH: Record<DrawerWidth, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Controls in the header, left of the close button. */
  headerActions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Which edge it slides from (default right). */
  side?: 'left' | 'right';
  /** Max width from sm up; phones are always full screen (default "lg" = 42rem). */
  width?: DrawerWidth;
  busy?: boolean;
  closeOnBackdrop?: boolean;
  as?: 'div' | 'form';
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  initialFocus?: RefObject<HTMLElement | null>;
  /** Default 70 (below modals, so a modal opened from a drawer sits on top). */
  zIndex?: number;
  className?: string;
  /** Extra body classes (layout, spacing between children). Don't put padding here: use `padded={false}`. */
  bodyClassName?: string;
  /** Default body padding (default true); false for edge-to-edge lists / tables. */
  padded?: boolean;
  closeLabel?: string;
};

/** Slide-over side panel (record editing, details). Same keyboard / focus / scroll behaviour as Modal. */
export const Drawer = ({
  open,
  onClose,
  title,
  description,
  headerActions,
  children,
  footer,
  side = 'right',
  width = 'lg',
  busy = false,
  closeOnBackdrop = true,
  as = 'div',
  onSubmit,
  initialFocus,
  zIndex = 70,
  className,
  bodyClassName,
  padded = true,
  closeLabel,
}: DrawerProps) => {
  const { t } = useTranslation();
  const requestClose = () => {
    if (!busy) onClose();
  };
  const panelRef = useOverlay<HTMLElement>(open, requestClose, { initialFocus });
  const titleId = useId();
  const descId = useId();
  const Panel = as === 'form' ? motion.form : motion.div;
  const from = side === 'right' ? '100%' : '-100%';

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0" style={{ zIndex }}>
          <motion.div
            className="absolute inset-0 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeOnBackdrop ? requestClose : undefined}
            aria-hidden
          />
          <Panel
            ref={panelRef as never}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            aria-busy={busy || undefined}
            tabIndex={-1}
            onSubmit={onSubmit as never}
            className={clsx(
              'absolute inset-y-0 flex h-full w-full flex-col bg-raised text-ink shadow-[var(--tv-shadow-overlay)] outline-none',
              side === 'right' ? 'right-0 sm:border-l' : 'left-0 sm:border-r',
              'sm:border-line',
              WIDTH[width],
              className,
            )}
            initial={{ x: from }}
            animate={{ x: 0 }}
            exit={{ x: from }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line py-3 pr-3 pl-5 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pr-4 sm:pl-6">
              <div className="min-w-0 flex-1 py-1.5">
                <h2 id={titleId} className="truncate text-base font-semibold text-ink">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="mt-1 text-sm text-muted">
                    {description}
                  </p>
                )}
              </div>
              {headerActions && <div className="flex shrink-0 items-center gap-1 py-0.5">{headerActions}</div>}
              <button
                type="button"
                onClick={requestClose}
                disabled={busy}
                className="grid size-10 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-sunken hover:text-ink disabled:opacity-50"
                aria-label={closeLabel ?? t('ui.close')}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className={clsx('min-h-0 flex-1 overflow-y-auto overscroll-contain', padded && 'px-5 py-5 sm:px-6', bodyClassName)}>{children}</div>
            {footer && (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-sunken/60 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
                {footer}
              </div>
            )}
          </Panel>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
