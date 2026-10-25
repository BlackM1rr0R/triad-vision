import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

export type CardProps = {
  /** Header title (renders the header row together with `actions`). */
  title?: ReactNode;
  /** Small text under the title. */
  subtitle?: ReactNode;
  icon?: LucideIcon;
  /** Right side of the header. */
  actions?: ReactNode;
  children: ReactNode;
  /** Footer row (muted background). */
  footer?: ReactNode;
  /**
   * "panel" (default): app panel, hairline border + the surface's quiet card shadow;
   * "flat": border only (nested panels, tinted sections); "raised": the soft-shadow .card look (public / portal).
   */
  variant?: 'panel' | 'flat' | 'raised';
  /** Hover feedback (border + shadow) for cards that are links / buttons as a whole. */
  interactive?: boolean;
  /** Body padding: default "md" (p-4 sm:p-5); "none" for tables / lists that run edge to edge. */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Heading level of the title (default h2). */
  as?: 'h2' | 'h3';
  className?: string;
  bodyClassName?: string;
  /** Replaces the header's default padding classes. */
  headerClassName?: string;
  id?: string;
};

const PAD = { none: '', sm: 'p-3 sm:p-4', md: 'p-4 sm:p-5', lg: 'p-5 sm:p-6' } as const;

/**
 * Bordered surface with an optional header (title + actions) and footer.
 *
 *   <Card title="Documents" icon={FileText} actions={<Button size="sm">Upload</Button>} padding="none">
 *     <Table … />
 *   </Card>
 */
export const Card = ({ title, subtitle, icon: Icon, actions, children, footer, variant = 'panel', interactive = false, padding = 'md', as: H = 'h2', className, bodyClassName, headerClassName, id }: CardProps) => (
  <section
    id={id}
    className={clsx(
      'min-w-0',
      variant === 'raised' ? 'card' : ['rounded-xl border border-line bg-card', variant === 'panel' && 'shadow-[var(--tv-shadow-card)]'],
      interactive && 'card-interactive',
      className,
    )}
  >
    {(title || actions) && <CardHeader title={title} subtitle={subtitle} icon={Icon} actions={actions} as={H} className={headerClassName} />}
    <div className={clsx(PAD[padding], bodyClassName)}>{children}</div>
    {footer && <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-[inherit] border-t border-line bg-sunken/60 px-4 py-3 sm:px-5">{footer}</div>}
  </section>
);

/** Header row of a Card (also usable on its own above a custom body). */
export const CardHeader = ({
  title,
  subtitle,
  icon: Icon,
  actions,
  as: H = 'h2',
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  as?: 'h2' | 'h3';
  /** Replaces the default padding (px-4 py-3 sm:px-5). */
  className?: string;
}) => (
  <header className={clsx('flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line', className ?? 'px-4 py-3 sm:px-5')}>
    {title && (
      <div className="min-w-0">
        <H className="type-card-title flex min-w-0 items-center gap-2">
          {Icon && <Icon className="size-4 shrink-0 text-muted" aria-hidden />}
          {title}
        </H>
        {subtitle && <p className="type-caption mt-0.5">{subtitle}</p>}
      </div>
    )}
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
);
