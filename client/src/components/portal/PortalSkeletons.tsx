import { useTranslation } from 'react-i18next';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';

/**
 * Loading placeholders of the client portal pages. Each one has the footprint of the loaded page (same
 * heading block, grid and card sizes), so content replaces it without the layout jumping.
 */

/** Portal page heading (h2 + subtitle line), as rendered by Vault / Payments / Letters. */
const HeadingSkeleton = ({ action = false }: { action?: boolean }) => (
  <div className="flex flex-wrap items-end justify-between gap-3" aria-hidden>
    <div className="min-w-0">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />
    </div>
    {action && <Skeleton className="h-9 w-28" />}
  </div>
);

/** Document vault: heading + one group of document cards. */
export const VaultSkeleton = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6" role="status" aria-label={t('ui.loading')}>
      <HeadingSkeleton action />
      <section aria-hidden>
        <div className="mb-3 flex items-center gap-2">
          <Skeleton className="size-8" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="card space-y-3 p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 shrink-0" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

/** Portal case view: back link, case title row, meta line, tab bar and the first document panel. */
export const CaseViewSkeleton = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-5 lg:space-y-6" role="status" aria-label={t('ui.loading')}>
      <div aria-hidden>
        <Skeleton className="h-4 w-28" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-6 w-24" rounded="full" />
        </div>
        <div className="mt-3 flex flex-wrap gap-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="flex gap-2 border-b border-line pb-2" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>
      <div className="card space-y-4 p-5 sm:p-6" aria-hidden>
        <Skeleton className="h-5 w-48" />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-t border-line pt-4">
            <Skeleton className="size-9 shrink-0" />
            <div className="min-w-0 flex-1">
              <SkeletonText lines={2} />
            </div>
            <Skeleton className="h-8 w-24 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
};
