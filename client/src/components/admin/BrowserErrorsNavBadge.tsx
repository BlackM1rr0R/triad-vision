import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesBrowserErrors } from '@/i18n/pagesBrowserErrors';

registerCopy(pagesBrowserErrors);

/** New (unresolved) browser error groups of the last 24 hours on the "Brauzer xətaları" nav item (ADMIN+ only item). */
export const BrowserErrorsNavBadge = ({ collapsed }: { collapsed: boolean }) => {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['browser-errors', 'summary'],
    queryFn: async () => (await api.get<{ newLast24h: number }>('/admin/browser-errors/summary')).data.newLast24h,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  if (!data) return null;
  const label = t('browserErrors.navBadge', { count: data });
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
