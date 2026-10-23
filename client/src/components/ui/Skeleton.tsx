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
