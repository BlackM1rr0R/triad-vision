import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { toastError } from '@/components/admin/labels';
import { ContractView } from './ContractView';
import { overviewKey, reasonText, runContract, type ContractResult, type ContractSource, type Run } from './api';

/**
 * Small "Check contract with AI" button (case contract box, e-signature drawer): runs the contract check on
 * the given PDF and shows the traffic-light card in a dialog. `onSendAnyway` continues the sending flow.
 */
export const ContractCheckButton = ({ caseId, source, onSendAnyway, className }: { caseId: string; source: ContractSource | null; onSendAnyway?: () => void; className?: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run<ContractResult> | null>(null);

  const check = async () => {
    if (!source) return;
    setBusy(true);
    try {
      const res = await runContract(caseId, source);
      if (!res.run) toast.error(t('aiCase.panel.unavailable', { reason: reasonText(t, res.reason) }));
      else {
        setRun(res.run);
        void qc.invalidateQueries({ queryKey: overviewKey(caseId) });
      }
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className ?? 'btn-white btn-sm border border-line'} onClick={() => void check()} disabled={busy || !source} aria-busy={busy}>
        {busy ? <Spinner className="size-3.5" /> : <Sparkles className="size-3.5 text-brand-600" aria-hidden />}
        {busy ? t('aiCase.panel.working') : t('aiCase.contract.button')}
      </button>
      <Modal open={!!run} onClose={() => setRun(null)} size="lg" title={t('aiCase.kinds.CONTRACT.title')}>
        {run && (
          <ContractView
            caseId={caseId}
            run={run}
            compact
            onSendAnyway={
              onSendAnyway
                ? () => {
                    setRun(null);
                    onSendAnyway();
                  }
                : undefined
            }
          />
        )}
      </Modal>
    </>
  );
};
