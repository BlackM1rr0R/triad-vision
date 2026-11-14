import clsx from 'clsx';

/**
 * Round success tick: the circle pops, then the mark draws itself (CSS in index.css "Micro-animations of the
 * app"; static for reduced motion / "Stop animations"). Used by Button `success` and the success toasts.
 */
export const SuccessCheck = ({ className, label }: { className?: string; label?: string }) => (
  <svg viewBox="0 0 24 24" className={clsx('shrink-0', className ?? 'size-4')} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <circle className="tv-check-circle" cx="12" cy="12" r="11" fill="currentColor" opacity="0.16" />
    <path className="tv-check-mark" d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
