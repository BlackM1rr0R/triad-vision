import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, Archive, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { Role } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from './Modal';
import { fullName, toastError } from './labels';

export interface DeletableUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}

interface Preview {
  counts: {
    cases: number;
    documents: number;
    caseMessages: number;
    applications: number;
    notifications: number;
    interviews: number;
    reviews: number;
    assignedCases: number;
    personalFiles: number;
    bookedSlots: number;
  };
}

/**
 * Super admin only: permanent deletion of an account (DELETE /api/admin/users/:id). Lists what goes
 * and what stays (counts from /deletion-preview) and requires the user's email typed as confirmation.
 */
export const DeleteUserDialog = ({ user, onClose, onDeleted }: { user: DeletableUser | null; onClose: () => void; onDeleted?: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const inputId = useId();
  const [typed, setTyped] = useState('');
  useEffect(() => setTyped(''), [user?.id]);

  const preview = useQuery({
    queryKey: ['admin-user-deletion-preview', user?.id],
    queryFn: async () => (await api.get<Preview>(`/admin/users/${user!.id}/deletion-preview`)).data,
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
  });

  const m = useMutation({
    mutationFn: async (u: DeletableUser) => (await api.delete(`/admin/users/${u.id}`, { data: { confirmEmail: typed.trim() } })).data,
    onSuccess: (_r, u) => {
      toast.success(t('admin.users.deleted', { name: fullName(u) }));
      for (const key of ['admin-users', 'admin-staff', 'staff-list', 'admin-cases', 'admin-candidates', 'admin-oversight-summary', 'admin-oversight-activity']) void qc.invalidateQueries({ queryKey: [key] });
      onDeleted?.();
      onClose();
    },
    onError: (err) => toastError(err),
  });

  const matches = !!user && typed.trim().toLowerCase() === user.email.toLowerCase();
  const staff = user ? user.role !== 'CLIENT' && user.role !== 'COMPANY' : false;
  const c = preview.data?.counts;

  const removed: { key: string; count?: number }[] = [
    { key: 'account' },
    ...(c
      ? [
          { key: 'cases', count: c.cases },
          { key: 'documents', count: c.documents },
          { key: 'caseMessages', count: c.caseMessages },
          { key: 'applications', count: c.applications },
          { key: 'interviews', count: c.interviews },
          { key: 'reviews', count: c.reviews },
          { key: 'notifications', count: c.notifications },
        ].filter((r) => r.count > 0 || r.key === 'cases')
      : []),
    ...(staff ? [{ key: 'staffPrivate' }] : []),
  ];
  const kept: { key: string; count?: number }[] = [
    ...(staff && c ? [{ key: 'assigned', count: c.assignedCases }, { key: 'files', count: c.personalFiles }, { key: 'uploads' }, { key: 'slots', count: c.bookedSlots }] : []),
    { key: 'audit' },
  ];

  const close = () => !m.isPending && onClose();

  return (
    <Modal
      open={!!user}
      onClose={close}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-danger" aria-hidden /> {t('admin.users.deleteTitle')}
        </span>
      }
      footer={
        <>
          <button type="button" className="btn-white btn-sm border border-line" onClick={close} disabled={m.isPending}>
            {t('admin.common.cancel')}
          </button>
          <button type="submit" form={`${inputId}-form`} className="btn-danger btn-sm" disabled={!matches || m.isPending}>
            {m.isPending ? <Spinner className="size-3.5" /> : <Trash2 className="size-3.5" aria-hidden />} {t('admin.users.deleteConfirm')}
          </button>
        </>
      }
    >
      {user && (
        <form
          id={`${inputId}-form`}
          className="space-y-4 text-sm text-ink/80"
          onSubmit={(e) => {
            e.preventDefault();
            if (matches && !m.isPending) m.mutate(user);
          }}
        >
          <p>{t('admin.users.deleteIntro', { name: fullName(user), email: user.email })}</p>

          <div className="rounded-lg border border-red-200 bg-red-50/60 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-danger uppercase">
              <Trash2 className="size-3.5" aria-hidden /> {t('admin.users.deleteRemoved')}
            </p>
            {preview.isLoading ? (
              <Spinner className="mt-2 size-4 text-danger" />
            ) : (
              <ul className="mt-2 space-y-1">
                {removed.map((r) => (
                  <li key={r.key} className="flex items-start justify-between gap-3">
                    <span>{t(`admin.users.del.${r.key}`)}</span>
                    {r.count !== undefined && <span className="shrink-0 font-semibold text-ink tabular-nums">{r.count}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-line bg-surface/60 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted uppercase">
              <Archive className="size-3.5" aria-hidden /> {t('admin.users.deleteKept')}
            </p>
            <ul className="mt-2 space-y-1">
              {kept.map((r) => (
                <li key={r.key} className="flex items-start justify-between gap-3">
                  <span>{t(`admin.users.keep.${r.key}`, { name: fullName(user) })}</span>
                  {r.count !== undefined && <span className="shrink-0 font-semibold text-ink tabular-nums">{r.count}</span>}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <label className="label" htmlFor={inputId}>
              {t('admin.users.deleteConfirmLabel')} <span className="font-mono font-bold break-all text-ink">{user.email}</span>
            </label>
            <input
              id={inputId}
              type="email"
              className="input"
              autoComplete="off"
              spellCheck={false}
              placeholder={user.email}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              data-autofocus
            />
          </div>
        </form>
      )}
    </Modal>
  );
};
