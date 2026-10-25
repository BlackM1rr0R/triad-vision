import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/Spinner';
import { Card } from '@/components/ui/Card';
import { EmptyState as UiEmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Switch as UiSwitch } from '@/components/ui/Switch';
import { StatTile as UiStatTile } from '@/components/ui/StatTile';
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
    headerClassName="px-4 py-3 sm:px-5"
    padding="none"
    bodyClassName={clsx('p-4 sm:p-5', bodyClassName)}
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
    <div className={clsx('grid min-h-[30vh] place-items-center text-muted', className)} role="status" aria-label={t('admin.common.loading')}>
      <Spinner className="size-8 border-[3px]" />
    </div>
  );
};

export const ErrorBlock = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-danger-border bg-danger-bg/60 px-4 py-10 text-center" role="alert">
      <AlertCircle className="size-6 text-danger-fg" aria-hidden />
      <p className="text-sm font-medium text-danger-fg">{errorMessage(error, t('admin.common.loadFailed'))}</p>
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
      // Direction A filter chip: hairline, 28 px, the active one is a solid key (sunken fill, strong border, ink text)
      'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs whitespace-nowrap transition-colors sm:min-h-7 sm:px-2.5',
      active
        ? 'border-line-strong bg-sunken font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]'
        : 'border-line bg-card font-medium text-muted hover:border-line-strong hover:text-ink',
    )}
  >
    {children}
    {count !== undefined && (
      <span className={clsx('code-id text-[11px] font-medium tabular-nums', active ? 'text-ink' : 'text-muted')}>{count}</span>
    )}
  </button>
);

/** Accessible on/off switch (the design-system Switch). */
export const Switch = ({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) => (
  <UiSwitch checked={checked} onChange={onChange} label={label} disabled={disabled} />
);

/** Stat tile (the design-system StatTile with the legacy admin tone names). */
export const StatTile = ({
  label,
  value,
  hint,
  to,
  tone,
  icon,
  className,
}: {
  label: string;
  value: number | string;
  hint?: ReactNode;
  to?: string;
  tone?: 'warn' | 'danger' | 'good';
  icon?: LucideIcon;
  className?: string;
}) => (
  <UiStatTile
    label={label}
    value={value}
    hint={hint}
    to={to}
    icon={icon}
    tone={tone === 'danger' ? 'danger' : tone === 'warn' ? 'warning' : tone === 'good' ? 'success' : undefined}
    className={className}
  />
);

/** Green dot when online; otherwise the last-seen time. */
export const OnlineDot = ({ online, lastSeenAt, className }: { online: boolean; lastSeenAt: string | null; className?: string }) => {
  const { t } = useTranslation();
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap', online ? 'text-success-fg' : 'text-muted', className)}>
      <span className={clsx('size-2 shrink-0 rounded-full', online ? 'bg-success' : 'bg-line-strong')} aria-hidden />
      {online ? t('admin.common.online') : lastSeenAt ? fmtRelative(lastSeenAt) : t('admin.common.neverLoggedIn')}
    </span>
  );
};

/** Small "label: value" definition row used in detail cards. */
export const DefRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
    <dt className="shrink-0 text-xs text-muted">{label}</dt>
    <dd className="min-w-0 text-right font-medium text-ink tabular-nums">{children}</dd>
  </div>
);

// ─── Bento KPI strip (Direction A) ──────────────────────────────────────

/**
 * One hairline-bordered strip of KPI cells separated by 1 px rules (the cells wrap; the rules follow).
 *
 *   <KpiStrip><KpiCell label="Open" value={42} to="/admin/cases" /> …</KpiStrip>
 */
export const KpiStrip = ({ children, className, cols = 4 }: { children: ReactNode; className?: string; cols?: 2 | 3 | 4 | 5 | 6 }) => (
  <div className={clsx('@container overflow-hidden rounded-xl border border-line bg-card shadow-[var(--tv-shadow-card)]', className)}>
    {/* each cell draws its own right / bottom rule; the -1px margins push the outer ones under the border */}
    <div
      className={clsx(
        '-mr-px -mb-px grid grid-cols-1 @xs:grid-cols-2',
        { 2: '', 3: '@3xl:grid-cols-3', 4: '@3xl:grid-cols-4', 5: '@3xl:grid-cols-5', 6: '@3xl:grid-cols-3 @5xl:grid-cols-6' }[cols],
      )}
    >
      {children}
    </div>
  </div>
);

export type KpiTone = 'danger' | 'warning' | 'success';
const KPI_TONE: Record<KpiTone, string> = { danger: 'text-danger-fg', warning: 'text-warning-fg', success: 'text-success-fg' };

/** A cell of KpiStrip: label (+ small icon), big tabular value, hint or extra content (bar, sparkline). */
export const KpiCell = ({
  label,
  value,
  icon: Icon,
  hint,
  tone,
  to,
  aside,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: LucideIcon;
  hint?: ReactNode;
  /** Colours the value only when the reading needs attention. */
  tone?: KpiTone;
  to?: string;
  /** Right side of the label row (delta, badge). */
  aside?: ReactNode;
  children?: ReactNode;
}) => {
  const body = (
    <>
      <p className="flex items-start justify-between gap-2 text-xs leading-snug text-muted">
        <span className="flex min-w-0 items-start gap-1.5">
          {Icon && <Icon className="mt-px size-3.5 shrink-0" aria-hidden />}
          <span className="line-clamp-2">{label}</span>
        </span>
        {aside}
      </p>
      <p className={clsx('num mt-1 text-2xl leading-tight font-semibold tracking-[-0.03em]', tone ? KPI_TONE[tone] : 'text-ink')}>{value}</p>
      {hint && <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted">{hint}</p>}
      {children && <div className="mt-2.5">{children}</div>}
    </>
  );
  const cls = 'block min-w-0 px-4 py-3.5 shadow-[inset_-1px_0_0_var(--color-line),inset_0_-1px_0_var(--color-line)]';
  return to ? (
    <Link to={to} className={clsx(cls, 'transition-colors hover:bg-sunken/60 focus-visible:-outline-offset-2')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
};

/** Thin segmented bar (share of parts), e.g. cases per status under a KPI. Colours: status solids / chart tokens. */
export const SegmentBar = ({ parts, label }: { parts: { key: string; value: number; className: string; title?: string }[]; label?: string }) => {
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className="flex h-1.5 gap-px overflow-hidden rounded-full bg-sunken" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {total > 0 &&
        parts
          .filter((p) => p.value > 0)
          .map((p) => <span key={p.key} title={p.title} className={clsx('h-full', p.className)} style={{ width: `${(p.value / total) * 100}%` }} />)}
    </div>
  );
};
