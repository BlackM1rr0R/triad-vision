import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

export type EmptyStateProps = {
  icon?: LucideIcon;
  /** Illustration slot (an <img> / inline SVG) shown instead of the icon circle; keep it small and decorative. */
  illustration?: ReactNode;
  title?: ReactNode;
  /** Explanation under the title. Legacy callers pass it as children. */
  text?: ReactNode;
  children?: ReactNode;
  /** Call to action (a Button / Link). */
  action?: ReactNode;
  /** "brand" tints the icon circle (portal / company); default is neutral. */
  tone?: 'neutral' | 'brand';
  /** "md" (default): lists, panels. "lg": a page's main empty state (bigger icon, display-font title). */
  size?: 'md' | 'lg';
  /** Vertical padding; default "md" (py-10, lg size: py-14). `compact` = "sm". */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Shorthand for padding="sm" (inside cards / table bodies). */
  compact?: boolean;
  className?: string;
};

const PAD = { none: '', sm: 'py-6', md: 'py-10', lg: 'py-14' } as const;

/**
 * "Nothing here yet" block.
 *
 *   <EmptyState icon={Inbox} title="No messages" text="New messages appear here." action={<Button size="sm">Compose</Button>} />
 *   <EmptyState size="lg" tone="brand" icon={Briefcase} title="No applications yet" text="…" action={<Link className={buttonClass()} to="/jobs">Browse jobs</Link>} />
 */
export const EmptyState = ({ icon: Icon, illustration, title, text, children, action, tone = 'neutral', size = 'md', padding, compact = false, className }: EmptyStateProps) => {
  const lg = size === 'lg';
  const pad = padding ?? (compact ? 'sm' : lg ? 'lg' : 'md');
  return (
    <div className={clsx('flex flex-col items-center justify-center px-4 text-center', PAD[pad], className)}>
      {illustration && (
        <div className={clsx('text-muted [&_img]:mx-auto [&_svg]:mx-auto', lg ? 'mb-5 max-w-[12rem]' : 'mb-4 max-w-[9rem]')} aria-hidden>
          {illustration}
        </div>
      )}
      {Icon && !illustration && (
        <span
          className={clsx(
            'grid place-items-center rounded-full',
            lg ? 'mb-4 size-14' : 'mb-3 size-11',
            tone === 'brand' ? 'bg-highlight-bg text-highlight-fg' : 'bg-sunken text-muted',
          )}
        >
          <Icon className={lg ? 'size-6' : 'size-5'} aria-hidden />
        </span>
      )}
      {title && <p className={clsx('text-ink', lg ? 'font-display text-lg font-semibold tracking-[-0.01em]' : 'text-sm font-semibold')}>{title}</p>}
      {text && <div className={clsx('text-sm text-muted', lg ? 'max-w-md' : 'max-w-sm', title && 'mt-1')}>{text}</div>}
      {children && <div className={clsx('text-sm text-muted', lg ? 'max-w-md' : 'max-w-sm', (title || text) && 'mt-1')}>{children}</div>}
      {action && <div className={clsx('flex flex-wrap justify-center gap-2', lg ? 'mt-5' : 'mt-4')}>{action}</div>}
    </div>
  );
};
