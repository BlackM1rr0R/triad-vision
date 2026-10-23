import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Small dialog for the calls / callback UI: bottom sheet on phones, centred card above; no backdrop blur. */
export const Modal = ({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) => {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-navy-950/60" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-card text-ink shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink">
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body,
  );
};
