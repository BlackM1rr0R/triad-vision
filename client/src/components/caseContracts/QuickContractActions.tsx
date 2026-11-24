import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, PenLine, Undo2 } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesCaseContracts } from '@/i18n/pagesCaseContracts';
import { useCaseRefresh } from '@/components/admin/case/shared';
import { staffKey, type StaffDoc, type StaffOverview, type Step } from './api';
import { ApproveDialog, ReturnDialog, SignDialog } from './AdminCaseContracts';

registerCopy(pagesCaseContracts);

/**
 * Quick drawer of the cases list: Triad Vision signature, return with a reason and approve of the contract steps.
 * Same dialogs, endpoints and show-conditions (`canTriadSign`, `canReturn`, `canApprove` from the server) as the case page.
 */
export const QuickContractActions = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const refreshCase = useCaseRefresh(caseId);
  const q = useQuery({ queryKey: staffKey(caseId), queryFn: async () => (await api.get<StaffOverview>(`/admin/case-contracts/cases/${caseId}`)).data });
  const [signing, setSigning] = useState<Step | null>(null);
  const [approving, setApproving] = useState<Step | null>(null);
  const [returning, setReturning] = useState<{ step: Step; doc: StaffDoc | null } | null>(null);
  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: staffKey(caseId) }), qc.invalidateQueries({ queryKey: ['esign'] }), refreshCase()]);
  };

  const steps = q.data?.steps ?? [];
  const stepOf = (k: Step | null) => (k ? steps.find((x) => x.step === k) : undefined);
  const rows = steps.filter((s) => s.canTriadSign || s.canApprove || (s.canReturn && s.step === 'LABOUR'));
  if (rows.length === 0 && !signing && !approving && !returning) return null;
  const signStep = stepOf(signing);

  return (
    <div className="space-y-3 border-t border-line pt-4">
      {rows.map((s) => (
        <div key={s.step} className="space-y-2">
          <p className="text-xs font-semibold text-muted">{t(`caseContracts.steps.${s.step}.name`)}</p>
          <div className="flex flex-wrap gap-2">
            {s.canTriadSign && (
              <button type="button" className="btn-primary btn-sm" onClick={() => setSigning(s.step)}>
                <PenLine className="size-3.5" aria-hidden /> {s.flow === 'V2' ? t('caseContracts.v2.agreeSign') : t('caseContracts.triadSign')}
              </button>
            )}
            {s.canReturn && s.step === 'LABOUR' && (
              <button type="button" className="btn-ghost btn-sm text-danger-fg" onClick={() => setReturning({ step: s.step, doc: null })}>
                <Undo2 className="size-3.5" aria-hidden /> {t('caseContracts.v2.return')}
              </button>
            )}
            {s.canApprove && (
              <button type="button" className="btn-primary btn-sm" onClick={() => setApproving(s.step)}>
                <CheckCircle2 className="size-3.5" aria-hidden /> {t('caseContracts.approve')}
              </button>
            )}
          </div>
        </div>
      ))}
      {signStep && (
        <SignDialog
          caseId={caseId}
          s={signStep}
          onClose={() => setSigning(null)}
          onDone={async () => {
            setSigning(null);
            await refresh();
          }}
        />
      )}
      {returning && (
        <ReturnDialog
          caseId={caseId}
          step={returning.step}
          doc={returning.doc}
          onClose={() => setReturning(null)}
          onDone={async () => {
            setReturning(null);
            await refresh();
          }}
        />
      )}
      <ApproveDialog caseId={caseId} s={stepOf(approving)} onClose={() => setApproving(null)} onDone={refresh} />
    </div>
  );
};

export default QuickContractActions;
