import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type Crumb = { label: ReactNode; to?: string };

export type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Buttons on the right (wrap under the title on phones). */
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Element left of the title (avatar, icon tile). */
  leading?: ReactNode;
  /** Badges after the title. */
  meta?: ReactNode;
  className?: string;
};

/**
 * Page title row: breadcrumbs, h1, subtitle, actions. Bottom margin = the page section gap (mb-6).
 *
 *   <PageHeader title="Invoices" subtitle="42 open" breadcrumbs={[{ label: 'Finance', to: '/admin/finance' }, { label: 'Invoices' }]}
 *     actions={<Button icon={Plus}>New invoice</Button>} />
 */
export const PageHeader = ({ title, subtitle, actions, breadcrumbs, leading, meta, className }: PageHeaderProps) => (
  <div className={clsx('mb-6', className)}>
    {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} className="mb-2" />}
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="type-page-title min-w-0 break-words">{title}</h1>
            {meta}
          </div>
          {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  </div>
);

export const Breadcrumbs = ({ items, className }: { items: Crumb[]; className?: string }) => {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('ui.breadcrumb')} className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={i}>
              <li className="min-w-0">
                {c.to && !last ? (
                  <Link to={c.to} className="rounded hover:text-ink hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={last ? 'page' : undefined} className={clsx(last && 'font-medium text-ink/80')}>
                    {c.label}
                  </span>
                )}
              </li>
              {!last && (
                <li aria-hidden className="text-muted/60">
                  <ChevronRight className="size-3" />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
};

/**
 * A titled block inside a page; consecutive Sections are spaced by the parent's `stack-page` (gap-6).
 *
 *   <Section title="Recent activity" actions={<Button variant="link">All</Button>}>…</Section>
 */
export const Section = ({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) => (
  <section id={id} className={clsx('stack-section min-w-0', className)}>
    {(title || actions) && (
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {title && <h2 className="type-section-title">{title}</h2>}
          {description && <p className="type-small mt-0.5">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    )}
    {children}
  </section>
);

/**
 * Horizontal row of controls (search, filters, view switches) that wraps on narrow screens.
 * `end` content is pushed to the right.
 */
export const Toolbar = ({ children, end, className, label }: { children?: ReactNode; end?: ReactNode; className?: string; label?: string }) => (
  <div role={label ? 'toolbar' : undefined} aria-label={label} className={clsx('flex flex-wrap items-center gap-2', className)}>
    {children}
    {end && <div className="ml-auto flex flex-wrap items-center gap-2">{end}</div>}
  </div>
);

/**
 * Filter bar above a list: a search slot that grows, then filter controls; chips scroll sideways on phones.
 *
 *   <FilterBar search={<Input type="search" …/>} filters={<><Chip …/><Chip …/></>} end={<Button size="sm">Export</Button>} />
 */
export const FilterBar = ({ search, filters, end, className }: { search?: ReactNode; filters?: ReactNode; end?: ReactNode; className?: string }) => (
  <div className={clsx('mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center', className)}>
    {search && <div className="min-w-0 sm:max-w-sm sm:flex-1">{search}</div>}
    {filters && (
      <div className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
        {filters}
      </div>
    )}
    {end && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{end}</div>}
  </div>
);
