import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { PARTNERS_KEY, partnerError } from './api';

export interface DeletablePartner {
  id: string;
  name: string;
  active?: boolean;
  counts?: { clients: number } | null;
}

/** Everything that shows partners or client folders: refetched after a partner is deleted or changed. */
export const invalidatePartnerViews = (qc: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: PARTNERS_KEY }),
    qc.invalidateQueries({ queryKey: ['drive'] }),
    qc.invalidateQueries({ queryKey: ['admin-cases'] }),
    qc.invalidateQueries({ queryKey: ['admin-case'] }),
  ]);

/**
 * Deletes a referral partner (admins). Says how many clients are assigned and what happens to them; a partner
 * with clients is deleted with `?force=1` (cases unassigned, folders back to "Anträge", commissions cancelled).
 * "Deactivate" stays available for partners that should only be hidden.
 */
export const DeletePartnerDialog = ({
  partner,
  onClose,
  onDeleted,
}: {
  partner: DeletablePartner | null;
  onClose: () => void;
  onDeleted?: () => void;
}) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const clients = partner?.counts?.clients ?? 0;
  const remove = useMutation({
    mutationFn: async (p: DeletablePartner) => (await api.delete(`/admin/partners/${encodeURIComponent(p.id)}`, { params: { force: 1 } })).data,
    onSuccess: async (_d, p) => {
      toast.success(t('refPartners.deleteDialog.done', { name: p.name }));
      onClose();
      onDeleted?.();
      await invalidatePartnerViews(qc);
      // Client folders move on the server right away; refresh once more for anything that followed.
      window.setTimeout(() => void qc.invalidateQueries({ queryKey: ['drive'] }), 1200);
    },
    onError: partnerError,
  });
  const deactivate = useMutation({
    mutationFn: async (p: DeletablePartner) => api.patch(`/admin/partners/${encodeURIComponent(p.id)}`, { active: false }),
    onSuccess: async () => {
      toast.success(t('refPartners.saved'));
      onClose();
      await invalidatePartnerViews(qc);
    },
    onError: partnerError,
  });
  const busy = remove.isPending || deactivate.isPending;
  return (
    <Modal
      open={!!partner}
      onClose={() => !busy && onClose()}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-danger" aria-hidden />
          {t('refPartners.deleteDialog.title', { name: partner?.name ?? '' })}
        </span>
      }
      footer={
        <>
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose} disabled={busy}>
            {t('admin.common.cancel')}
          </button>
          {partner && partner.active !== false && clients > 0 && (
            <button type="button" className="btn-white btn-sm border border-line" onClick={() => deactivate.mutate(partner)} disabled={busy}>
              {deactivate.isPending && <Spinner className="size-3.5" />} {t('refPartners.deactivate')}
            </button>
          )}
          <button type="button" data-autofocus className="btn-danger btn-sm" onClick={() => partner && remove.mutate(partner)} disabled={busy || !partner}>
            {remove.isPending ? <Spinner className="size-3.5" /> : <Trash2 className="size-3.5" />} {t('refPartners.deleteDialog.confirm')}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-ink/80">
        <p className="font-semibold text-ink">
          {clients > 0 ? t('refPartners.deleteDialog.clients', { count: clients }) : t('refPartners.deleteDialog.noClients')}
        </p>
        <p>{t('refPartners.deleteDialog.effects')}</p>
        {clients > 0 && partner?.active !== false && <p className="text-xs text-muted">{t('refPartners.deleteDialog.deactivateHint')}</p>}
      </div>
    </Modal>
  );
};
