import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckCircle2, PenLine, Undo2 } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesCaseContracts } from '@/i18n/pagesCaseContracts';
import { useCaseRefresh } from '@/components/admin/case/shared';
import { ccError, staffKey, type StaffDoc, type StaffOverview, type StaffStep, type Step } from './api';
import { ApproveDialog, DocRow, ReturnDialog, SignDialog, canReturnDoc } from './AdminCaseContracts';
import { UploadDialog } from './UploadDialog'; // already in this chunk (AdminCaseContracts imports it)

registerCopy(pagesCaseContracts);

/** V2 İş müqaviləsi documents with something to do: send back (open / signed, not approved) or replace / drop (returned). */
const actionableDocs = (s: StaffStep) => s.documents.filter((d) => canReturnDoc(d) || !!d.returnedAt);

/**
 * Quick drawer of the cases list: Triad Vision signature, return with a reason and approve of the contract steps, and
 * per İş müqaviləsi document "Geri qaytar" / "Yenisini yüklə" / "Siyahıdan çıxar". Same dialogs, endpoints and
 * show-conditions (`canTriadSign`, `canReturn`, `canApprove` from the server, canReturnDoc per document) as the case page.
 */
export const QuickContractActions = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const refreshCase = useCaseRefresh(caseId);
  const q = useQuery({ queryKey: staffKey(caseId), queryFn: async () => (await api.get<StaffOverview>(`/admin/case-contracts/cases/${caseId}`)).data });
  const [signing, setSigning] = useState<Step | null>(null);
  const [approving, setApproving] = useState<Step | null>(null);
  const [returning, setReturning] = useState<{ step: Step; doc: StaffDoc | null } | null>(null);
  const [replacing, setReplacing] = useState<{ step: Step; replacesId: string } | null>(null);
  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: staffKey(caseId) }), qc.invalidateQueries({ queryKey: ['esign'] }), refreshCase()]);
  };
  const drop = useMutation({
    mutationFn: async (requestId: string) => (await api.post<StaffOverview>(`/admin/case-contracts/cases/${caseId}/drop`, { requestId })).data,
    onSuccess: refresh,
    onError: (err) => toast.error(ccError(t, err)),
  });

  const steps = q.data?.steps ?? [];
  const stepOf = (k: Step | null) => (k ? steps.find((x) => x.step === k) : undefined);
  const hasButtons = (s: StaffStep) => s.canTriadSign || s.canApprove || (s.canReturn && s.step === 'LABOUR');
  const rows = steps.filter((s) => hasButtons(s) || actionableDocs(s).length > 0);
  if (rows.length === 0 && !signing && !approving && !returning && !replacing) return null;
  const signStep = stepOf(signing);

  return (
    <div className="space-y-3 border-t border-line pt-4">
      {rows.map((s) => {
        const docs = actionableDocs(s);
        return (
          <div key={s.step} className="space-y-2">
            <p className="text-xs font-semibold text-muted">{t(`caseContracts.steps.${s.step}.name`)}</p>
            {hasButtons(s) && (
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
            )}
            {docs.length > 0 && (
              <ul className="divide-y divide-line" aria-label={t('caseContracts.v2.documents', { count: docs.length })}>
                {docs.map((d) => (
                  <DocRow
                    key={d.id}
                    d={d}
                    busy={drop.isPending}
                    onReturn={() => setReturning({ step: s.step, doc: d })}
                    onReplace={() => setReplacing({ step: s.step, replacesId: d.id })}
                    onDrop={() => drop.mutate(d.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
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
      {replacing && (
        <UploadDialog
          caseId={caseId}
          step={replacing.step}
          replacesId={replacing.replacesId}
          onClose={() => setReplacing(null)}
          onDone={async () => {
            setReplacing(null);
            await refresh();
          }}
        />
      )}
      <ApproveDialog caseId={caseId} s={stepOf(approving)} onClose={() => setApproving(null)} onDone={refresh} />
    </div>
  );
};

export default QuickContractActions;
