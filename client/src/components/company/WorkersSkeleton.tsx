import { useTranslation } from 'react-i18next';
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton';

/** Employer workers panel while it loads: six KPI tiles, the section card, filter chips and a table, at the loaded sizes. */
export const WorkersSkeleton = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6" role="status" aria-label={t('ui.loading')}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)] sm:p-5">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-8 w-12" />
            </div>
            <Skeleton className="size-10 shrink-0" rounded="xl" />
          </div>
        ))}
      </div>
      <section className="card min-w-0 p-5 sm:p-6" aria-hidden>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-3 mb-5 h-4 w-2/3" />
        <div className="mb-3 flex gap-1.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-24" rounded="full" />
          ))}
        </div>
        <div className="mb-5 flex gap-2">
          <Skeleton className="h-11 w-full sm:max-w-xs" rounded="xl" />
          <Skeleton className="h-11 w-28" rounded="xl" />
        </div>
        <div className="overflow-hidden rounded-2xl border border-line">
          <table className="w-full">
            <tbody className="divide-y divide-line">
              <SkeletonRows rows={5} cols={5} />
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
