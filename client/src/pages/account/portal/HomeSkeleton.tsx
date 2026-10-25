import { useTranslation } from 'react-i18next';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';

/**
 * Portal home while the overview loads: the same blocks as the loaded page (next-step card, progress,
 * journey, small cards) at the same sizes, so nothing jumps when the content arrives.
 */
export function AccountHomeSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6 lg:space-y-8" role="status" aria-label={t('ui.loading')}>
      {/* Next-step card */}
      <div className="relative overflow-hidden rounded-3xl border border-line bg-highlight-bg p-6 sm:p-9" aria-hidden>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <Skeleton className="size-14 shrink-0" rounded="xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-12 w-full shrink-0 sm:w-44" rounded="xl" />
        </div>
      </div>

      {/* Progress */}
      <div className="card card-body" aria-hidden>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-4 w-12" />
        </div>
        <div className="mt-4 grid grid-cols-6 gap-1.5 sm:gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i}>
              <Skeleton className="h-1.5" rounded="full" />
              <Skeleton className="mt-2 hidden h-3 w-3/4 md:block" />
            </div>
          ))}
        </div>
      </div>

      {/* Journey */}
      <div className="card card-body" aria-hidden>
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-2 h-3 w-48" />
        <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:items-center">
          <Skeleton className="hidden aspect-[16/9] w-full md:block" rounded="xl" />
          <div className="space-y-4">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-8 shrink-0" rounded="full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Small cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3" aria-hidden>
        {[0, 1].map((i) => (
          <div key={i} className="card card-body">
            <Skeleton className="h-4 w-32" />
            <SkeletonText lines={3} className="mt-4" />
          </div>
        ))}
      </div>
    </div>
  );
}
