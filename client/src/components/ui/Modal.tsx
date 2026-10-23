import { useId, type FormEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOverlay } from './overlay';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const SIZE: Record<ModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  '2xl': 'sm:max-w-6xl',
};

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** Dialog title; labels the dialog (aria-labelledby). */
  title: ReactNode;
  description?: ReactNode;
  /** Small uppercase line above the title. */
  eyebrow?: ReactNode;
  /** Element rendered left of the title (an icon tile). */
  icon?: ReactNode;
  /** Extra controls in the header, left of the close button. */
  headerActions?: ReactNode;
  children?: ReactNode;
  /** Footer row (buttons are right-aligned on desktop). */
  footer?: ReactNode;
  size?: ModalSize;
  /**
   * Phones: "sheet" (default) slides up from the bottom and grows with its content up to the full
   * height; "full" always fills the screen (long forms, editors).
   */
  mobile?: 'sheet' | 'full';
  /** Desktop vertical position: centred (default) or near the top (for content that grows). */
  align?: 'center' | 'top';
  /** While true, Escape / backdrop / close button do nothing (a request is running). */
  busy?: boolean;
  /** Backdrop click closes (default true). */
  closeOnBackdrop?: boolean;
  /** Hide the × button (the footer must then offer a way out). */
  hideClose?: boolean;
  /** "alertdialog" for confirmations. */
  role?: 'dialog' | 'alertdialog';
  /** Render the panel as a <form>; footer submit buttons then submit it. */
  as?: 'div' | 'form';
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  /** Element that gets focus on open (default: [data-autofocus], else the first field, else the panel). */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Stacking order of the overlay (default 80; drawers use 70). */
  zIndex?: number;
  /** Extra classes on the panel / body. */
  className?: string;
  /** Extra body classes (layout, spacing between children). Don't put padding here: use `padded={false}`. */
  bodyClassName?: string;
  /** Default body padding (default true); false for edge-to-edge lists / tables. */
  padded?: boolean;
  /** Accessible label of the close button (default: ui.close). */
  closeLabel?: string;
};

/**
 * Accessible modal dialog: portal, focus trap, Escape (top-most only), focus return, scroll lock
 * without layout shift, plain dimmed backdrop (no blur), bottom sheet / full screen on phones.
 *
 *   <Modal open={open} onClose={close} title="Edit" footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button>Save</Button></>}>
 *     …
 *   </Modal>
 */
export const Modal = ({
  open,
  onClose,
  title,
  description,
  eyebrow,
  icon,
  headerActions,
  children,
  footer,
  size = 'md',
  mobile = 'sheet',
  align = 'center',
  busy = false,
  closeOnBackdrop = true,
  hideClose = false,
  role = 'dialog',
  as = 'div',
  onSubmit,
  initialFocus,
  zIndex = 80,
  className,
  bodyClassName,
  padded = true,
  closeLabel,
}: ModalProps) => {
  const { t } = useTranslation();
  const requestClose = () => {
    if (!busy) onClose();
  };
  const panelRef = useOverlay<HTMLElement>(open, requestClose, { initialFocus });
  const titleId = useId();
  const descId = useId();
  const Panel = as === 'form' ? motion.form : motion.div;
  const full = mobile === 'full';

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className={clsx(
            'fixed inset-0 flex justify-center',
            full ? 'items-stretch sm:p-4' : 'items-end pt-4 sm:p-4',
            align === 'top' ? 'sm:items-start sm:pt-[8vh]' : 'sm:items-center',
          )}
          style={{ zIndex }}
        >
          <motion.div
            className="absolute inset-0 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={closeOnBackdrop ? requestClose : undefined}
            aria-hidden
          />
          <Panel
            ref={panelRef as never}
            role={role}
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            aria-busy={busy || undefined}
            tabIndex={-1}
            onSubmit={onSubmit as never}
            className={clsx(
              'relative flex max-h-full w-full flex-col overflow-hidden bg-card text-ink shadow-2xl outline-none sm:rounded-2xl sm:border sm:border-line',
              full ? 'h-full sm:h-auto' : 'rounded-t-2xl border-t border-line',
              SIZE[size],
              className,
            )}
            initial={{ opacity: 0, y: 24, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.985 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex shrink-0 items-start gap-3 border-b border-line py-3 pr-3 pl-5 sm:pr-4 sm:pl-6">
              {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
              <div className="min-w-0 flex-1 py-1.5">
                {eyebrow && <p className="mb-0.5 text-[11px] font-bold tracking-widest text-brand-600 uppercase">{eyebrow}</p>}
                <h2 id={titleId} className="text-base leading-snug font-bold break-words text-ink">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="mt-1 text-sm text-muted">
                    {description}
                  </p>
                )}
              </div>
              {headerActions && <div className="flex shrink-0 items-center gap-1 py-0.5">{headerActions}</div>}
              {!hideClose && (
                <button
                  type="button"
                  onClick={requestClose}
                  disabled={busy}
                  className="grid size-10 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-ink disabled:opacity-50"
                  aria-label={closeLabel ?? t('ui.close')}
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
            {children != null && children !== false && (
              <div className={clsx('min-h-0 flex-1 overflow-y-auto overscroll-contain', padded && ['px-5 py-5 sm:px-6', !footer && 'pb-[max(1.25rem,env(safe-area-inset-bottom))]'], bodyClassName)}>
                {children}
              </div>
            )}
            {footer && (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-surface/60 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
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
