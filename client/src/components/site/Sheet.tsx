import { useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useOverlay } from '@/components/admin/Modal';

/** Small dialog for the site features (bottom sheet on phones, centred card from sm up). No backdrop blur. */
export const Sheet = ({
  open,
  onClose,
  title,
  closeLabel,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
}) => {
  const panelRef = useOverlay(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-navy-950/55" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-card text-ink shadow-2xl outline-none sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line py-2.5 pr-2.5 pl-5">
          <h2 id={titleId} className="text-base font-bold text-navy-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="grid size-10 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-navy-900"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
