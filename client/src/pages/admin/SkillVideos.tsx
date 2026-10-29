import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Film } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { Pagination } from '@/components/ui/Pagination';
import { type SkillVideoStatus, type StaffSkillVideo } from '@/components/skillVideos/api';
import { STAFF_KEY, StaffSkillVideoCard } from '@/components/skillVideos/StaffSkillVideos';

const FILTERS = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const;
type Filter = (typeof FILTERS)[number];

interface QueueResponse {
  items: StaffSkillVideo[];
  total: number;
  page: number;
  pageSize: number;
  counts: Partial<Record<SkillVideoStatus, number>>;
}

/** /admin/skill-videos — review queue of the candidates' skill videos (oldest pending first). */
export default function AdminSkillVideos() {
  const { t } = useTranslation();
  usePageTitle(t('skillVideos.staff.pageTitle'));
  const [params, setParams] = useSearchParams();
  const status = (FILTERS as readonly string[]).includes(params.get('status') ?? '') ? (params.get('status') as Filter) : 'PENDING';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...STAFF_KEY, 'queue', status, page],
    queryFn: async () => (await api.get<QueueResponse>('/admin/skill-videos', { params: { status, page } })).data,
    placeholderData: keepPreviousData,
  });
  const set = (next: Record<string, string>) => setParams({ ...Object.fromEntries(params), ...next }, { replace: true });
  const all = Object.values(data?.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div className="stack-page">
      <PageHead title={t('skillVideos.staff.pageTitle')} subtitle={t('skillVideos.staff.pageSubtitle')} />
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Chip key={f} active={status === f} onClick={() => set({ status: f, page: '1' })} count={f === 'ALL' ? all : (data?.counts[f] ?? 0)}>
            {f === 'ALL' ? t('skillVideos.staff.filterAll') : t(`skillVideos.status.${f}`)}
          </Chip>
        ))}
      </div>
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : !data?.items.length ? (
        <EmptyState icon={Film} title={t('skillVideos.staff.queueEmpty')} />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((v) => (
              <StaffSkillVideoCard key={v.id} v={v} showCandidate />
            ))}
          </ul>
          {data.total > data.pageSize && <Pagination page={page} pages={Math.ceil(data.total / data.pageSize)} pageSize={data.pageSize} total={data.total} onChange={(p) => set({ page: String(p) })} />}
        </>
      )}
    </div>
  );
}
