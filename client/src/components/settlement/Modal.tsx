import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';

/** Dialog shell of the settlement page: Esc / backdrop close, scrolls inside, bottom sheet on phones. */
export const Modal = ({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-navy-950/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={clsx('flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-card text-ink shadow-2xl sm:rounded-2xl', wide ? 'sm:max-w-4xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="font-display text-base font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface hover:text-ink" aria-label="×">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};
