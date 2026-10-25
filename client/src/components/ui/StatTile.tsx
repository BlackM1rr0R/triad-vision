import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { AnimatedNumber } from './AnimatedNumber';
import { Skeleton } from './Skeleton';
import { TONE_CLASS, TONE_TEXT, type Tone } from './status';

export type StatDelta = {
  /** Shown as given ("+12 %", "−3"). */
  label: ReactNode;
  direction: 'up' | 'down' | 'flat';
  /** Whether this direction is good news (colours it success / danger); omit for neutral. */
  good?: boolean;
};

export type StatTileProps = {
  label: ReactNode;
  /** Numbers animate (once, respecting reduced motion) and use tabular figures. */
  value: number | string;
  /** Formats a numeric value (currency, percent…); the animation counts with it. */
  format?: (n: number) => string;
  hint?: ReactNode;
  delta?: StatDelta;
  icon?: LucideIcon;
  /** Colours the value for a reading that needs attention (status only). */
  tone?: Extract<Tone, 'warning' | 'danger' | 'success'>;
  /** Makes the whole tile a link. */
  to?: string;
  loading?: boolean;
  /** Extra content under the value (sparkline, progress bar). */
  children?: ReactNode;
  className?: string;
};

/**
 * KPI tile: label, big tabular number, optional delta / hint / icon.
 *
 *   <StatTile label="Open cases" value={128} delta={{ label: '+6 this week', direction: 'up', good: true }} icon={FolderOpen} />
 *   <StatTile label="Overdue" value={4} tone="danger" to="/admin/invoices?status=OVERDUE" />
 */
export const StatTile = ({ label, value, format, hint, delta, icon: Icon, tone, to, loading, children, className }: StatTileProps) => {
  const DeltaIcon = delta?.direction === 'up' ? ArrowUpRight : delta?.direction === 'down' ? ArrowDownRight : Minus;
  const deltaTone = delta?.good === undefined ? 'text-muted' : delta.good ? TONE_TEXT.success : TONE_TEXT.danger;
  const body = (
    <div
      className={clsx(
        'flex h-full items-start justify-between gap-3 rounded-xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)]',
        to && 'card-interactive',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-snug font-medium text-muted">{label}</p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-20" />
        ) : (
          <p className={clsx('num mt-1.5 text-2xl leading-tight font-semibold tracking-[-0.02em]', tone ? TONE_TEXT[tone] : 'text-ink')}>
            {typeof value === 'number' ? <AnimatedNumber value={value} format={format} /> : value}
          </p>
        )}
        {(delta || hint) && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-snug">
            {delta && (
              <span className={clsx('inline-flex items-center gap-0.5 font-medium', deltaTone)}>
                <DeltaIcon className="size-3.5" aria-hidden />
                {delta.label}
              </span>
            )}
            {hint && <span className="text-muted">{hint}</span>}
          </p>
        )}
        {children && <div className="mt-3">{children}</div>}
      </div>
      {Icon && (
        <span className={clsx('grid size-9 shrink-0 place-items-center rounded-lg', tone ? TONE_CLASS[tone] : 'bg-sunken text-muted')}>
          <Icon className="size-[18px]" aria-hidden />
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
