import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/Spinner';
import { Card } from '@/components/ui/Card';
import { EmptyState as UiEmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { TONE_CLASS, TONE_TEXT } from '@/components/ui/status';
import { errorMessage, fmtRelative } from './labels';

/** Bordered admin panel with optional header row (the design-system Card with admin spacing). */
export const Panel = ({
  title,
  icon,
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
  <Card
    id={id}
    title={title}
    icon={icon}
    actions={actions}
    className={className}
    headerClassName="px-5 py-3.5 sm:px-6"
    padding="none"
    bodyClassName={clsx('p-5 sm:p-6', bodyClassName)}
  >
    {children}
  </Card>
);

/** Legacy admin signature (icon required, text as children) of the design-system EmptyState. */
export const EmptyState = ({ icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) => (
  <UiEmptyState icon={icon} title={title}>
    {children}
  </UiEmptyState>
);

export const LoadingBlock = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  return (
    <div className={clsx('grid min-h-[30vh] place-items-center text-brand-600', className)} role="status" aria-label={t('admin.common.loading')}>
      <Spinner className="size-8 border-[3px]" />
    </div>
  );
};

export const ErrorBlock = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-10 text-center" role="alert">
      <AlertCircle className="size-6 text-danger" aria-hidden />
      <p className="text-sm font-medium text-red-800">{errorMessage(error, t('admin.common.loadFailed'))}</p>
      {onRetry && (
        <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" /> {t('admin.common.retry')}
        </button>
      )}
    </div>
  );
};

export const PageHead = ({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) => (
  <PageHeader title={title} subtitle={subtitle} actions={actions} />
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

/** Stat tile: label, headline value, optional hint line. `tone` colours the value for a warning / critical reading. */
export const StatTile = ({
  label,
  value,
  hint,
  to,
  tone,
  icon: IconCmp,
  className,
}: {
  label: string;
  value: number | string;
  hint?: ReactNode;
  to?: string;
  tone?: 'warn' | 'danger' | 'good';
  icon?: LucideIcon;
  className?: string;
}) => {
  const body = (
    <div
      className={clsx(
        'flex h-full items-start justify-between gap-3 rounded-xl border border-line bg-white p-4 transition',
        to && 'hover:border-brand-400/60 hover:shadow-[0_8px_24px_-14px_rgba(11,31,68,0.35)]',
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-xs leading-snug font-medium text-muted">{label}</p>
        <p
          className={clsx(
            'mt-1.5 font-display text-2xl font-bold sm:text-[1.75rem]',
            tone === 'danger' ? TONE_TEXT.danger : tone === 'warn' ? TONE_TEXT.warning : tone === 'good' ? TONE_TEXT.success : 'text-navy-900',
          )}
        >
          {value}
        </p>
        {hint && <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p>}
      </div>
      {IconCmp && (
        <span
          className={clsx(
            'grid size-9 shrink-0 place-items-center rounded-lg',
            TONE_CLASS[tone === 'danger' ? 'danger' : tone === 'warn' ? 'warning' : tone === 'good' ? 'success' : 'brand'],
          )}
        >
          <IconCmp className="size-[18px]" aria-hidden />
        </span>
      )}
    </div>
  );
  return to ? (
    <Link to={to} className="block h-full rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
};

/** Green dot when online; otherwise the last-seen time. */
export const OnlineDot = ({ online, lastSeenAt, className }: { online: boolean; lastSeenAt: string | null; className?: string }) => {
  const { t } = useTranslation();
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap', online ? 'text-emerald-700' : 'text-muted', className)}>
      <span className={clsx('size-2 shrink-0 rounded-full', online ? 'bg-emerald-500' : 'bg-slate-300')} aria-hidden />
      {online ? t('admin.common.online') : lastSeenAt ? fmtRelative(lastSeenAt) : t('admin.common.neverLoggedIn')}
    </span>
  );
};

/** Small "label: value" definition row used in detail cards. */
export const DefRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
    <dt className="shrink-0 text-xs text-muted">{label}</dt>
    <dd className="min-w-0 text-right font-medium text-navy-900 tabular-nums">{children}</dd>
  </div>
);
