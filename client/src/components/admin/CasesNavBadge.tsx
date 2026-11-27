import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesCaseNext } from '@/i18n/pagesCaseNext';

registerCopy(pagesCaseNext);

/**
 * Count on the "Müraciətlər" nav item: open cases of the viewer's case scope that wait for staff action (client signed,
 * documents to review) plus new cases not yet seen (server lib/staffAttention + staffSeen; the cases list posts /seen). Refreshed by the realtime case notifications
 * (['admin-cases'] prefix) and every minute.
 */
const NavCount = ({ count, label, collapsed }: { count: number | undefined; label: (n: number) => string; collapsed: boolean }) => {
  if (!count) return null;
  const text = label(count);
  return (
    <span
      title={text}
      aria-label={text}
      className={clsx(
        'grid min-w-5 place-items-center rounded-full bg-danger px-1.5 code-id text-[11px] leading-[18px] font-medium text-white tabular-nums',
        collapsed ? 'absolute top-0.5 right-0.5 min-w-4 text-[10px] leading-4' : 'ml-auto',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
};

export const CasesNavBadge = ({ collapsed }: { collapsed: boolean }) => {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['admin-cases', 'attention-count'],
    queryFn: async () => (await api.get<{ count: number }>('/admin/cases/attention-count')).data.count,
    staleTime: 20_000,
    refetchInterval: 60_000,
    retry: false,
  });
  return <NavCount count={data} collapsed={collapsed} label={(count) => t('caseNext.attention.navBadge', { count })} />;
};

/** Count on the "İstifadəçilər" nav item: clients registered since this staff member last opened the users page. */
export const UsersNavBadge = ({ collapsed }: { collapsed: boolean }) => {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['admin-users-nav', 'new-count'],
    queryFn: async () => (await api.get<{ count: number }>('/admin/users/new-count')).data.count,
    staleTime: 20_000,
    refetchInterval: 60_000,
    retry: false,
  });
  return <NavCount count={data} collapsed={collapsed} label={(count) => t('caseNext.attention.usersNavBadge', { count })} />;
};

/** Opening the page marks the "new" entries as seen (explicit POST, per staff member) and clears the sidebar badge. */
export const useMarkSeen = (kind: 'users' | 'cases') => {
  const qc = useQueryClient();
  useEffect(() => {
    api
      .post(`/admin/${kind}/seen`)
      .then(() => qc.invalidateQueries({ queryKey: kind === 'users' ? ['admin-users-nav'] : ['admin-cases', 'attention-count'] }))
      .catch(() => undefined);
  }, [kind, qc]);
};
