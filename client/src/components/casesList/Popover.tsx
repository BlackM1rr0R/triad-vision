import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import { useEscapeLayer } from '@/components/ui/overlay';

/** Filter-bar button: hairline, 36 px, a strong border + sunken fill while it carries a value. */
export const filterButtonClass = (active: boolean) =>
  clsx(
    'inline-flex min-h-10 w-full shrink-0 items-center justify-between gap-2 rounded-lg border px-3 text-sm whitespace-nowrap transition sm:min-h-9 sm:w-auto sm:justify-center',
    active ? 'border-line-strong bg-sunken font-semibold text-ink' : 'border-line bg-card font-medium text-ink/80 hover:border-line-strong',
  );

/** Native select of the filter bar (same height as the buttons; strong border while it carries a value). */
export const filterSelectClass = (active: boolean) =>
  clsx('input min-h-10 w-full py-1.5 pr-8 text-sm sm:min-h-9', active && 'border-line-strong bg-sunken font-semibold text-ink');

/**
 * Filter popover: a dialog panel under its button (right- or left-aligned) from sm up, a bottom sheet on phones.
 * Esc / outside click close it; focus moves into it on open and back to the button on close.
 */
export const FilterPopover = ({
  label,
  icon,
  active,
  badge,
  align = 'start',
  title,
  children,
  footer,
  className,
  widthClassName = 'sm:w-[22rem]',
  tour,
}: {
  label: ReactNode;
  icon?: ReactNode;
  active: boolean;
  badge?: number;
  align?: 'start' | 'end';
  title: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  footer?: (close: () => void) => ReactNode;
  className?: string;
  widthClassName?: string;
  /** data-tour anchor of the guided tours (components/staffPower/tours.ts). */
  tour?: string;
}) => {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  useEscapeLayer(open, close);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    const first = panel.current?.querySelector<HTMLElement>('select, input, button, [tabindex]:not([tabindex="-1"])');
    first?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={box} className={clsx('relative', className)} data-tour={tour}>
      <button ref={button} type="button" aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? id : undefined} onClick={() => setOpen((v) => !v)} className={filterButtonClass(active)}>
        <span className="inline-flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate">{label}</span>
          {!!badge && <span className="code-id rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-link tabular-nums">{badge}</span>}
        </span>
        <ChevronDown className={clsx('size-3.5 shrink-0 opacity-60 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label={title}
          className={clsx(
            'fixed inset-x-3 bottom-3 z-50 max-h-[80dvh] overflow-y-auto rounded-xl border border-line bg-raised shadow-[var(--tv-shadow-overlay)]',
            'sm:absolute sm:inset-x-auto sm:bottom-auto sm:mt-1.5 sm:max-h-[70vh]',
            align === 'end' ? 'sm:right-0' : 'sm:left-0',
            widthClassName,
          )}
        >
          <p className="type-overline border-b border-line px-4 pt-3 pb-2">{title}</p>
          <div className="space-y-3 p-4">{typeof children === 'function' ? children(close) : children}</div>
          {footer && <div className="flex items-center justify-between gap-2 border-t border-line bg-sunken/60 px-4 py-2.5">{footer(close)}</div>}
        </div>
      )}
    </div>
  );
};

/** Label + control row inside a popover. */
export const PopField = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block text-xs">
    <span className="mb-1 block font-semibold text-muted">{label}</span>
    {children}
  </label>
);

/** Checkbox row inside a popover. */
export const PopCheck = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-1 text-sm text-ink hover:bg-sunken">
    <input type="checkbox" className="size-4 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);
