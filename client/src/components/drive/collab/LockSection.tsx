import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Lock, LockOpen } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { driveCollabCopy } from '@/i18n/pagesDriveCollab';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/components/admin/labels';
import { toastDriveError } from '../api';
import type { DriveItem } from '../types';
import { collabKeys, fetchLock } from './api';
import { timeOf } from './activityText';

registerCopy(driveCollabCopy);

/** Who is editing a file right now (details panel), with "Kilidi götür" for super admins. */
export const LockSection = ({ item, isSuper }: { item: DriveItem; isSuper: boolean }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: collabKeys.lock(item.id), queryFn: () => fetchLock(item.id), enabled: item.kind === 'FILE' && !item.deletedAt, refetchInterval: 60_000 });
  const force = useMutation({
    mutationFn: () => api.delete(`/drive/collab/lock/${encodeURIComponent(item.id)}`, { params: { force: 1 } }),
    onSuccess: () => {
      toast.success(t('driveCollab.lock.taken'));
      void qc.invalidateQueries({ queryKey: collabKeys.lock(item.id) });
      void qc.invalidateQueries({ queryKey: ['drive', 'children'] });
    },
    onError: toastDriveError,
  });
  const lock = q.data;
  if (!lock || lock.stale) return null;
  return (
    <div className="flex items-start gap-2.5 border-b border-line bg-amber-50 px-4 py-2.5 text-xs dark:bg-amber-500/10">
      <Lock className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-amber-900 dark:text-amber-200">{lock.mine ? t('driveCollab.lock.mine') : t('driveCollab.lock.editing', { name: lock.lockedBy.name })}</p>
        <p className="text-amber-800/80 dark:text-amber-200/70" title={fmtDateTime(lock.lockedAt)}>
          {t('driveCollab.lock.since', { time: timeOf(lock.lockedAt) })}
        </p>
      </div>
      {isSuper && !lock.mine && (
        <button type="button" onClick={() => force.mutate()} disabled={force.isPending} className="btn-white btn-sm shrink-0 border border-amber-300">
          <LockOpen className="size-3.5" /> {t('driveCollab.lock.takeOver')}
        </button>
      )}
    </div>
  );
};
