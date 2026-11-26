import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { FINAL } from '@/lib/caseStatus';
import type { CaseStatus } from '@/lib/types';
import { useCaseAction } from './shared';

/** A case may be cancelled until it reaches a final status (same rule as the action panel / quick drawer). */
export const canCancelCase = (status: CaseStatus) => !FINAL.includes(status);

/**
 * "Müraciəti ləğv et": reason (shown to the client) + the same endpoint as the action panel
 * (POST /admin/cases/:id/actions { action: 'CANCEL', reason }). Used by the full case page (header menu) and the client
 * profile (Müştəri 360°).
 */
export const CancelCaseDialog = ({ caseId, open, onClose, onDone }: { caseId: string; open: boolean; onClose: () => void; onDone?: () => void }) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const mutation = useCaseAction(caseId);
  useEffect(() => {
    if (!open) setReason('');
  }, [open]);
  const a = (key: string) => t(`admin.case.action.${key}`);
  const busy = mutation.isPending;
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={a('cancelTitle')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            {t('admin.common.close')}
          </button>
          <button
            type="button"
            className="btn-danger btn-sm"
            disabled={reason.trim().length < 3 || busy}
            onClick={() =>
              mutation.mutate(
                { action: 'CANCEL', reason: reason.trim() },
                {
                  onSuccess: () => {
                    onClose();
                    onDone?.();
                  },
                },
              )
            }
          >
            {busy ? <Spinner className="size-3.5" /> : <Ban className="size-3.5" aria-hidden />} {a('cancelBtn')}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink/80">{a('cancelMsg')}</p>
      <label htmlFor="cancel-case-reason" className="label text-danger-fg">
        {a('cancelReasonLabel')}
      </label>
      <textarea id="cancel-case-reason" className="input" rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
};

export default CancelCaseDialog;
