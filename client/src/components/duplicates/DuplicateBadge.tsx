import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Copy } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesDuplicates } from '@/i18n/pagesDuplicates';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';

registerCopy(pagesDuplicates);

export const duplicatesKey = ['admin-duplicates'] as const;

interface UserDuplicates {
  id: string;
  resolvedId: string;
  merged: boolean;
  openPairs: { id: string; score: number }[];
}

/** One account's duplicate state (ADMIN+ only; staff never ask). */
export const useUserDuplicates = (userId: string | null | undefined) => {
  const { user } = useAuth();
  const enabled = !!userId && hasMinRole(user?.role, 'ADMIN');
  return useQuery({
    queryKey: [...duplicatesKey, 'user', userId],
    queryFn: async () => (await api.get<UserDuplicates>(`/admin/duplicates/user/${userId}`)).data,
    enabled,
    staleTime: 60_000,
    retry: false,
  });
};

/** Which of these users have an open duplicate pair (badges in lists). */
export const useOpenDuplicateIds = (ids: string[]) => {
  const { user } = useAuth();
  const enabled = ids.length > 0 && hasMinRole(user?.role, 'ADMIN');
  const key = [...ids].sort().join(',');
  const q = useQuery({
    queryKey: [...duplicatesKey, 'open-users', key],
    queryFn: async () => new Set((await api.post<{ ids: string[] }>('/admin/duplicates/open-users', { ids: ids.slice(0, 500) })).data.ids),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
  return q.data ?? new Set<string>();
};

/** Small "possible duplicate" chip linking to Admin → Duplicates filtered on this client. */
/** `merged`: the account was merged into another one (the link resolves to the primary). */
export const DuplicateChip = ({ userId, className, merged }: { userId: string; className?: string; merged?: boolean }) => {
  const { t } = useTranslation();
  return (
    <Link
      to={`/admin/duplicates?user=${encodeURIComponent(userId)}`}
      title={merged ? t('duplicates.mergedInto') : t('duplicates.badgeTitle')}
      className={clsx(
        'inline-flex min-h-6 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-amber-800 transition hover:border-amber-400 hover:bg-amber-100',
        className,
      )}
    >
      <Copy className="size-3" aria-hidden /> {merged ? t('duplicates.status.MERGED') : t('duplicates.badge')}
    </Link>
  );
};

/** Badge for a page header (case page, user page): shown only when the client has an open pair. */
export const DuplicateBadge = ({ userId, className }: { userId: string | null | undefined; className?: string }) => {
  const { data } = useUserDuplicates(userId);
  if (!userId || !data?.openPairs.length) return null;
  return <DuplicateChip userId={data.resolvedId} className={className} />;
};

export default DuplicateBadge;
