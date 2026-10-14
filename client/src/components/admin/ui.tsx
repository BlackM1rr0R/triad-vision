import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { errorMessage } from './labels';

/** Bordered admin panel with optional header row. */
export const Panel = ({
  title,
  icon: IconCmp,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) => (
  <section id={id} className={clsx('min-w-0 rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(11,31,68,0.04)]', className)}>
    {(title || actions) && (
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-5 py-3.5 sm:px-6">
        {title && (
          <h2 className="flex min-w-0 items-center gap-2 font-sans text-sm font-semibold text-navy-900">
            {IconCmp && <IconCmp className="size-4 shrink-0 text-brand-600" aria-hidden />}
            {title}
          </h2>
        )}
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
    )}
    <div className={clsx('p-5 sm:p-6', bodyClassName)}>{children}</div>
  </section>
);

export const EmptyState = ({ icon: IconCmp, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
    <div className="mb-3 grid size-11 place-items-center rounded-full bg-surface text-muted">
      <IconCmp className="size-5" aria-hidden />
    </div>
    <p className="text-sm font-semibold text-navy-900">{title}</p>
    {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
  </div>
);

export const LoadingBlock = ({ className }: { className?: string }) => (
  <div className={clsx('grid min-h-[30vh] place-items-center text-brand-600', className)} role="status" aria-label="Yüklənir">
    <Spinner className="size-8 border-[3px]" />
  </div>
);

export const ErrorBlock = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-10 text-center" role="alert">
    <AlertCircle className="size-6 text-danger" aria-hidden />
    <p className="text-sm font-medium text-red-800">{errorMessage(error, 'Məlumatları yükləmək mümkün olmadı.')}</p>
    {onRetry && (
      <button type="button" className="btn-white btn-sm border border-line" onClick={onRetry}>
        <RefreshCw className="size-3.5" /> Yenidən cəhd et
      </button>
    )}
  </div>
);

export const PageHead = ({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
    <div className="min-w-0">
      <h1 className="text-xl font-bold text-navy-900 sm:text-2xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

/** Pill toggle (filter chips). */
export const Chip = ({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={clsx(
      'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition sm:min-h-8 sm:px-3',
      active ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-ink/75 hover:border-brand-400 hover:text-navy-900',
    )}
  >
    {children}
    {count !== undefined && (
      <span className={clsx('rounded-full px-1.5 text-[10px] tabular-nums', active ? 'bg-white/20' : 'bg-surface text-muted')}>{count}</span>
    )}
  </button>
);

/** Accessible on/off switch. */
export const Switch = ({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={clsx(
      // The ::after expands the hit area to ~40px without changing the visual size.
      "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[''] disabled:cursor-not-allowed disabled:opacity-50",
      checked ? 'bg-success' : 'bg-slate-300',
    )}
  >
    <span className={clsx('inline-block size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
  </button>
);
