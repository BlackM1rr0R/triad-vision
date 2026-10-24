import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/Skeleton';

/** Placeholder of a case tab (or one heavy panel) while its chunk / data loads. */
export const PanelSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <div className="rounded-xl border border-line bg-card" aria-hidden>
    <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
      <Skeleton className="size-4" rounded="md" />
      <Skeleton className="h-3.5 w-40" />
    </div>
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  </div>
);

export const TabSkeleton = ({ panels = 3 }: { panels?: number }) => {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('caseLayout.loadingTab')} className="stack-page grid">
      {Array.from({ length: panels }, (_, i) => (
        <PanelSkeleton key={i} rows={i === 0 ? 4 : 2} />
      ))}
    </div>
  );
};

/** Body of a case panel while its data loads (rows at list-row height); `padded` for panels with bodyClassName="p-0". */
export const PanelBodySkeleton = ({ rows = 3, padded = false }: { rows?: number; padded?: boolean }) => {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('ui.loading')} className={padded ? 'space-y-3 p-5' : 'space-y-3'}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
};
