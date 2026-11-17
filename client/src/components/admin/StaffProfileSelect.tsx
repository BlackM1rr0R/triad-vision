import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { toastError } from '@/components/admin/labels';
import { useStaffDesks } from '@/components/admin/StaffDeskSelect';
import { WORK_PROFILES, isWorkProfile, type WorkProfile } from '@/components/command/workProfiles';
import { registerCopy } from '@/i18n';
import { adminSimpleCopy } from '@/i18n/adminSimple';

registerCopy(adminSimpleCopy);

type ProfileRow = { id: string; workProfile?: WorkProfile | null; defaultWorkProfile?: WorkProfile };

/**
 * Work profile of one staff member (which pages their simple sidebar lists; components/command/workProfiles.ts).
 * "" = the default from role / desk. Rows come from GET /admin/nav/desks (shared with StaffDeskSelect);
 * changing it: PUT /admin/nav/profiles/:userId (ADMIN+). Assigning one turns on their simple view.
 */
export function StaffProfileSelect({ userId, name, className }: { userId: string; name: string; className?: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const rows = useStaffDesks(true);
  const row = (rows.data as ProfileRow[] | undefined)?.find((d) => d.id === userId);
  const save = useMutation({
    mutationFn: async (workProfile: WorkProfile | null) =>
      (await api.put<{ workProfile: WorkProfile | null; defaultWorkProfile: WorkProfile }>(`/admin/nav/profiles/${userId}`, { workProfile })).data,
    onSuccess: (r) => {
      qc.setQueryData<ProfileRow[]>(['admin-nav-desks'], (prev) => prev?.map((d) => (d.id === userId ? { ...d, workProfile: r.workProfile } : d)));
      void qc.invalidateQueries({ queryKey: ['admin-nav'] }); // own profile changed → sidebar refreshes
      toast.success(`${t('wprof.saved')}: ${name} · ${t(`wprof.names.${r.workProfile ?? r.defaultWorkProfile}`)}`);
    },
    onError: (err) => toastError(err),
  });
  if (!row) return null; // inactive / not staff / still loading
  const fallback = row.defaultWorkProfile ?? 'CASES';
  return (
    <label className={className}>
      <span className="sr-only">
        {t('wprof.profile')}: {name}
      </span>
      <select
        className="input h-8 min-w-32 py-0 text-xs"
        title={t('wprof.profileHint')}
        value={row.workProfile ?? ''}
        disabled={save.isPending}
        onChange={(e) => save.mutate(isWorkProfile(e.target.value) ? e.target.value : null)}
      >
        <option value="">
          {t('wprof.profile')}: {t('wprof.auto', { name: t(`wprof.names.${fallback}`) })}
        </option>
        {WORK_PROFILES.map((p) => (
          <option key={p} value={p}>
            {t('wprof.profile')}: {t(`wprof.names.${p}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
