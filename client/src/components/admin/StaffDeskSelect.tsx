import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { toastError } from '@/components/admin/labels';
import { DESKS, type Desk } from '@/components/command/navRegistry';

type DeskRow = { id: string; desk: Desk | null; defaultDesk: Desk };

/** All staff with their sidebar desk (GET /admin/nav/desks, ADMIN+). One query shared by every row of the page. */
export const useStaffDesks = (enabled: boolean) =>
  useQuery({
    queryKey: ['admin-nav-desks'],
    queryFn: async () => (await api.get<{ items: DeskRow[] }>('/admin/nav/desks')).data.items,
    enabled,
    staleTime: 60_000,
  });

/**
 * Desk of one staff member (the first block of their sidebar). "" = the role default (desk: null on the server).
 * Changing it: PUT /admin/nav/desks/:userId. Only for ADMIN+ viewers and staff accounts.
 */
export function StaffDeskSelect({ userId, name, className }: { userId: string; name: string; className?: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const desks = useStaffDesks(true);
  const row = desks.data?.find((d) => d.id === userId);
  const save = useMutation({
    mutationFn: async (desk: Desk | null) => (await api.put<{ desk: Desk | null; defaultDesk: Desk }>(`/admin/nav/desks/${userId}`, { desk })).data,
    onSuccess: (r) => {
      qc.setQueryData<DeskRow[]>(['admin-nav-desks'], (prev) => prev?.map((d) => (d.id === userId ? { ...d, desk: r.desk } : d)));
      void qc.invalidateQueries({ queryKey: ['admin-nav'] }); // own desk changed → sidebar refreshes
      toast.success(t('anav.deskSaved', { name, desk: t(`anav.desks.${r.desk ?? r.defaultDesk}`) }));
    },
    onError: (err) => toastError(err),
  });
  if (!row) return null; // inactive / not staff / still loading
  return (
    <label className={className}>
      <span className="sr-only">{t('anav.deskAria', { name })}</span>
      <select
        className="input h-8 min-w-32 py-0 text-xs"
        title={t('anav.deskHint')}
        value={row.desk ?? ''}
        disabled={save.isPending}
        onChange={(e) => save.mutate(e.target.value ? (e.target.value as Desk) : null)}
      >
        <option value="">{t('anav.deskDefault', { desk: t(`anav.desks.${row.defaultDesk}`) })}</option>
        {DESKS.map((d) => (
          <option key={d} value={d}>
            {t('anav.deskLabel')}: {t(`anav.desks.${d}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
