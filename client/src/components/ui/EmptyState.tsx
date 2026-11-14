import type { ReactNode } from 'react';
import clsx from 'clsx';
import { SearchX, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  /** Draws the card frame (border, card background) around the block: lists that render nothing else. */
  framed?: boolean;
  /**
   * "Nothing matches the filters" variant: default icon, title and hint, plus a "Clear filters" button when
   * `onClearFilters` is given. Use it when the list is empty only because of a search / filter.
   */
  filtered?: boolean;
  onClearFilters?: () => void;
  className?: string;
};

const PAD = { none: '', sm: 'py-6', md: 'py-10', lg: 'py-14' } as const;

/**
 * "Nothing here yet" block: the one empty state of every surface (lists, panels, pages).
 * Import: `import { EmptyState } from '@/components/ui/EmptyState'` (or `@/components/ui`).
 *
 *   <EmptyState icon={Inbox} title="No messages" text="New messages appear here." action={<Button size="sm">Compose</Button>} />
 *   <EmptyState size="lg" tone="brand" icon={Briefcase} title="No applications yet" text="…" action={<Link className={buttonClass()} to="/jobs">Browse jobs</Link>} />
 *   <EmptyState framed icon={Receipt} title="No invoices yet" text="…" action={<Button size="sm" onClick={create}>New invoice</Button>} />
 *   <EmptyState framed filtered onClearFilters={reset} />   // the list is empty only because of the filters
 */
export const EmptyState = ({
  icon,
  illustration,
  title,
  text,
  children,
  action,
  tone = 'neutral',
  size = 'md',
  padding,
  compact = false,
  framed = false,
  filtered = false,
  onClearFilters,
  className,
}: EmptyStateProps) => {
  const { t } = useTranslation();
  const lg = size === 'lg';
  const pad = padding ?? (compact ? 'sm' : lg ? 'lg' : 'md');
  const Icon = icon ?? (filtered ? SearchX : undefined);
  if (filtered) {
    title ??= t('ui.empty.filteredTitle');
    if (text === undefined && children === undefined) text = t('ui.empty.filteredText');
    if (action === undefined && onClearFilters)
      action = (
        <button type="button" className="btn-secondary btn-sm" onClick={onClearFilters}>
          {t('ui.empty.clearFilters')}
        </button>
      );
  }
  return (
    <div
      className={clsx('flex flex-col items-center justify-center px-4 text-center', PAD[pad], framed && 'rounded-xl border border-line bg-card', className)}
      role={filtered ? 'status' : undefined}
    >
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
