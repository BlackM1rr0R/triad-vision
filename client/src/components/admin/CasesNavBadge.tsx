import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesCaseNext } from '@/i18n/pagesCaseNext';

registerCopy(pagesCaseNext);

/**
 * Count on the "Müraciətlər" nav item: open cases of the viewer's case scope that wait for staff action (the client
 * signed, documents to review — server lib/staffAttention). Refreshed by the realtime case notifications
 * (['admin-cases'] prefix) and every minute.
 */
export const CasesNavBadge = ({ collapsed }: { collapsed: boolean }) => {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['admin-cases', 'attention-count'],
    queryFn: async () => (await api.get<{ count: number }>('/admin/cases/attention-count')).data.count,
    staleTime: 20_000,
    refetchInterval: 60_000,
    retry: false,
  });
  if (!data) return null;
  const label = t('caseNext.attention.navBadge', { count: data });
  return (
    <span
      title={label}
      aria-label={label}
      className={clsx(
        'grid min-w-5 place-items-center rounded-full bg-danger px-1.5 code-id text-[11px] leading-[18px] font-medium text-white tabular-nums',
        collapsed ? 'absolute top-0.5 right-0.5 min-w-4 text-[10px] leading-4' : 'ml-auto',
      )}
    >
      {data > 99 ? '99+' : data}
    </span>
  );
};
