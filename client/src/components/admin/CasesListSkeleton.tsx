import { useTranslation } from 'react-i18next';
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton';

/**
 * Loading state of the admin cases list with the loaded list's footprint: the wide table from xl up
 * (11 columns, row height of a two-line cell) and the card grid below xl.
 */
export const CasesListSkeleton = ({ rows = 8 }: { rows?: number }) => {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('admin.common.loading')}>
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-card xl:block" aria-hidden>
        <table className="w-full min-w-[1320px] text-left text-sm">
          <thead className="border-b border-line bg-surface/70">
            <tr>
              <th className="w-8 py-2.5 pl-4">
                <Skeleton className="size-4" rounded="md" />
              </th>
              {Array.from({ length: 10 }, (_, i) => (
                <th key={i} className="px-4 py-2.5">
                  <Skeleton className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line [&_td]:h-[68px]">
            <SkeletonRows rows={rows} cols={11} />
          </tbody>
        </table>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:hidden" aria-hidden>
        {Array.from({ length: Math.min(rows, 6) }, (_, i) => (
          <li key={i} className="rounded-xl border border-line bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-6 w-20" rounded="full" />
            </div>
            <Skeleton className="mt-3 h-5 w-1/3" />
          </li>
        ))}
      </ul>
    </div>
  );
};
