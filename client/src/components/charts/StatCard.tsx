import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

/**
 * KPI card: label (sentence case) · value (semibold, proportional figures) · optional delta pill and hint ·
 * optional visual on the right (a Sparkline or a RingGauge). The whole card links when `to` is set.
 */
export const StatCard = ({
  label,
  value,
  delta,
  hint,
  visual,
  icon: Icon,
  to,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  hint?: ReactNode;
  visual?: ReactNode;
  icon?: LucideIcon;
  to?: string;
  className?: string;
}) => {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
          {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
          <span className="truncate">{label}</span>
        </p>
        <p className="mt-1.5 truncate text-2xl leading-tight font-semibold tracking-tight text-ink">{value}</p>
        {(delta || hint) && (
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
            {delta}
            {hint && <span className="min-w-0 truncate">{hint}</span>}
          </div>
        )}
      </div>
      {visual && <div className="flex shrink-0 items-end self-stretch">{visual}</div>}
    </>
  );
  const cls = clsx('flex min-w-0 gap-3 rounded-xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)]', className);
  return to ? (
    <Link to={to} className={clsx(cls, 'transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-focus/40 focus-visible:outline-none')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
};
