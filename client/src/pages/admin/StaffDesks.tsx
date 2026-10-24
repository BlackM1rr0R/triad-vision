import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { UserCog } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { adminNavCopy } from '@/i18n/adminNav';
import { ErrorBlock, PageHead, Panel } from '@/components/admin/ui';
import { roleLabel, toastError } from '@/components/admin/labels';
import { Table } from '@/components/ui/Table';
import { DESKS, isDesk, type Desk } from '@/components/command/navRegistry';
import { navQueryKey } from '@/components/command/navPrefs';

registerCopy(adminNavCopy);

interface StaffDesk {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  desk: Desk | null;
  defaultDesk: Desk;
}

const KEY = ['admin-nav-desks'] as const;

/** Team → Desks (ADMIN+): which sidebar desk each staff member starts with (they can still switch their own). */
export default function StaffDesks() {
  const { t } = useTranslation();
  usePageTitle(t('anav.desksPage.title'));
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<{ items: StaffDesk[] }>('/admin/nav/desks')).data.items });

  const save = useMutation({
    mutationFn: async ({ userId, desk }: { userId: string; desk: Desk | null }) => (await api.put(`/admin/nav/desks/${userId}`, { desk })).data,
    onSuccess: (_d, v) => {
      qc.setQueryData<StaffDesk[]>(KEY, (old) => old?.map((s) => (s.id === v.userId ? { ...s, desk: v.desk } : s)));
      // Own desk changed here: the sidebar follows.
      if (v.userId === user?.id) void qc.invalidateQueries({ queryKey: navQueryKey(user?.id) });
      toast.success(t('anav.desksPage.saved'));
    },
    onError: (err) => toastError(err),
  });

  return (
    <div className="stack-page">
      <PageHead title={t('anav.desksPage.title')} subtitle={t('anav.desksPage.intro')} />
      {list.error ? (
        <ErrorBlock error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <Panel title={t('anav.desksPage.title')} icon={UserCog} bodyClassName="p-0 sm:p-0">
          <Table<StaffDesk>
            caption={t('anav.desksPage.title')}
            rows={list.data}
            loading={list.isLoading}
            rowKey={(r) => r.id}
            stackOnMobile
            dense
            columns={[
              {
                key: 'name',
                header: t('anav.desksPage.cols.name'),
                primary: true,
                cell: (r) => (
                  <span className="block min-w-0">
                    <span className="block font-medium text-ink">
                      {r.firstName} {r.lastName}
                    </span>
                    <span className="block truncate text-xs text-muted">{r.email}</span>
                  </span>
                ),
              },
              { key: 'role', header: t('anav.desksPage.cols.role'), cell: (r) => roleLabel(r.role) },
              {
                key: 'desk',
                header: t('anav.desksPage.cols.desk'),
                cell: (r) => {
                  const name = `${r.firstName} ${r.lastName}`;
                  return (
                    <select
                      aria-label={t('anav.desksPage.deskFor', { name })}
                      className="input h-9 py-1 text-sm sm:w-56"
                      value={r.desk ?? ''}
                      disabled={save.isPending}
                      onChange={(e) => save.mutate({ userId: r.id, desk: isDesk(e.target.value) ? e.target.value : null })}
                    >
                      <option value="">{t('anav.desksPage.default', { desk: t(`anav.desks.${r.defaultDesk}`) })}</option>
                      {DESKS.map((d) => (
                        <option key={d} value={d}>
                          {t(`anav.desks.${d}`)}
                        </option>
                      ))}
                    </select>
                  );
                },
              },
            ]}
          />
        </Panel>
      )}
    </div>
  );
}
