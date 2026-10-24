import type { CSSProperties } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

/**
 * Loading placeholders. The pulse uses opacity only (cheap); reduced-motion users get a static block.
 *
 *   <Skeleton className="h-4 w-40" />
 *   <SkeletonText lines={3} />
 *   <SkeletonRows rows={5} cols={4} />   // inside a <tbody>
 */
export const Skeleton = ({ className, rounded = 'lg', style }: { className?: string; rounded?: 'md' | 'lg' | 'xl' | 'full'; style?: CSSProperties }) => (
  <span
    className={clsx('block animate-pulse bg-neutral-bg', { md: 'rounded-md', lg: 'rounded-lg', xl: 'rounded-xl', full: 'rounded-full' }[rounded], className ?? 'h-4 w-full')}
    style={style}
    aria-hidden
  />
);

/** Paragraph-like lines; the last one is shorter. */
export const SkeletonText = ({ lines = 3, className }: { lines?: number; className?: string }) => (
  <div className={clsx('space-y-2', className)} aria-hidden>
    {Array.from({ length: lines }, (_, i) => (
      <Skeleton key={i} className={clsx('h-3.5', i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full')} />
    ))}
  </div>
);

/** A block (card / media) placeholder with an accessible "loading" status. */
export const SkeletonBlock = ({ className, label }: { className?: string; label?: string }) => {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={label ?? t('ui.loading')} className={clsx('animate-pulse rounded-xl bg-neutral-bg', className ?? 'h-32 w-full')} />
  );
};

/** Card-list placeholder: `count` stacked rows with an avatar circle and two lines. */
export const SkeletonList = ({ count = 4, className }: { count?: number; className?: string }) => {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('ui.loading')} className={clsx('space-y-3', className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton rounded="full" className="size-9 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
};

/** Table body placeholder rows (render inside <tbody>). */
export const SkeletonRows = ({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) => (
  <>
    {Array.from({ length: rows }, (_, r) => (
      <tr key={r} aria-hidden>
        {Array.from({ length: cols }, (_, c) => (
          <td key={c} className="px-4 py-3">
            <Skeleton className={clsx('h-3.5', c === 0 ? 'w-3/4' : 'w-1/2')} />
          </td>
        ))}
      </tr>
    ))}
  </>
);

/** Round avatar / icon placeholder. */
export const SkeletonAvatar = ({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) => (
  <Skeleton rounded="full" className={clsx('shrink-0', { sm: 'size-7', md: 'size-9', lg: 'size-12' }[size], className)} />
);

/**
 * Card placeholder shaped like the real card (optional media on top, title, text lines, footer), so
 * swapping it for the loaded card does not shift the layout. Announced once as "loading".
 */
export const SkeletonCard = ({
  media = false,
  mediaClassName = 'aspect-[16/10]',
  lines = 2,
  footer = false,
  className,
  label,
}: {
  media?: boolean;
  mediaClassName?: string;
  lines?: number;
  footer?: boolean;
  className?: string;
  label?: string;
}) => {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={label ?? t('ui.loading')} className={className}>
      <SkeletonCardBody media={media} mediaClassName={mediaClassName} lines={lines} footer={footer} />
    </div>
  );
};

/**
 * A responsive grid of SkeletonCards (lists of visas, services, guides, jobs…). `className` replaces the
 * default gap / column classes, so pass the same grid classes as the real list.
 */
export const SkeletonGrid = ({ count = 6, className, ...card }: { count?: number; className?: string } & Omit<Parameters<typeof SkeletonCard>[0], 'className' | 'label'>) => {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('ui.loading')} className={clsx('grid', className ?? 'gap-5 sm:grid-cols-2 lg:grid-cols-3')}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden>
          <SkeletonCardBody {...card} />
        </div>
      ))}
    </div>
  );
};

/** SkeletonCard without its own status role (used inside grids that announce once). */
const SkeletonCardBody = ({ media = false, mediaClassName = 'aspect-[16/10]', lines = 2, footer = false }: Omit<Parameters<typeof SkeletonCard>[0], 'className' | 'label'>) => (
  <div className="h-full overflow-hidden rounded-xl border border-line bg-card">
    {media && <Skeleton rounded="md" className={clsx('w-full rounded-none', mediaClassName)} />}
    <div className="space-y-3 p-4 sm:p-5">
      <Skeleton className="h-4 w-3/5" />
      <SkeletonText lines={lines} />
      {footer && (
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-3 w-1/4" />
          <Skeleton className="h-8 w-24" />
        </div>
      )}
    </div>
  </div>
);

/** KPI / stat tile placeholder (label, big number, hint). */
export const SkeletonStat = ({ className }: { className?: string }) => (
  <div className={clsx('rounded-xl border border-line bg-card p-4', className)} aria-hidden>
    <Skeleton className="h-3 w-1/2" />
    <Skeleton className="mt-3 h-7 w-1/3" />
    <Skeleton className="mt-2 h-3 w-2/3" />
  </div>
);

/** Row of stat tiles announced once as "loading". `className` replaces the default gap / column classes. */
export const SkeletonStats = ({ count = 4, className }: { count?: number; className?: string }) => {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('ui.loading')} className={clsx('grid', className ?? 'grid-cols-2 gap-3 lg:grid-cols-4')}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonStat key={i} />
      ))}
    </div>
  );
};

/**
 * A whole table placeholder (header + rows) for places that render nothing until data arrives.
 * Inside an existing <tbody> use <SkeletonRows> instead.
 */
export const SkeletonTable = ({ rows = 6, cols = 4, className }: { rows?: number; cols?: number; className?: string }) => {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('ui.loading')} className={clsx('overflow-hidden rounded-xl border border-line bg-card', className)}>
      <table className="w-full" aria-hidden>
        <thead className="bg-surface">
          <tr>
            {Array.from({ length: cols }, (_, c) => (
              <th key={c} className="px-4 py-3 text-left">
                <Skeleton className="h-3 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          <SkeletonRows rows={rows} cols={cols} />
        </tbody>
      </table>
    </div>
  );
};

/** Detail-page hero placeholder (eyebrow, title, two lines of lead text). */
export const SkeletonHero = ({ className, dark = false }: { className?: string; dark?: boolean }) => (
  <div className={clsx('space-y-4', className)} aria-hidden>
    <Skeleton className={clsx('h-3 w-28', dark && 'bg-white/10')} />
    <Skeleton className={clsx('h-9 w-3/4 sm:h-11', dark && 'bg-white/10')} />
    <Skeleton className={clsx('h-4 w-2/3', dark && 'bg-white/10')} />
    <Skeleton className={clsx('h-4 w-1/2', dark && 'bg-white/10')} />
  </div>
);
