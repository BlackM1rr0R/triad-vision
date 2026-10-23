import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { toastError } from '@/components/admin/labels';
import { confirmKey, fetchConfirmation, type ConfirmationView } from './api';

/**
 * Embassy package drawer: warning (not a hard block) when the client has not confirmed the embassy data, or
 * it changed since. "Build" stays disabled until staff tick "build anyway" — reported via onBlockedChange.
 */
export default function PackageConfirmWarning({ caseId, onBlockedChange }: { caseId: string; onBlockedChange: (blocked: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: confirmKey(caseId), queryFn: () => fetchConfirmation(caseId), staleTime: 0 });
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const state = data?.state.state;
  const warn = !!state && state !== 'CONFIRMED';
  useEffect(() => onBlockedChange(warn && !ack), [warn, ack, onBlockedChange]);
  if (!warn) return null;
  const ask = async () => {
    setBusy(true);
    try {
      qc.setQueryData(confirmKey(caseId), (await api.post<ConfirmationView>(`/admin/cases/${caseId}/data-confirmation`, {})).data);
      toast.success(t('clientData.admin.confirm.asked'));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200" role="alert">
      <p className="flex items-start gap-2 font-semibold">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('clientData.pkg.title')}
      </p>
      <p>{t(`clientData.pkg.${state}`)}</p>
      <div className="flex flex-wrap items-center gap-3">
        {state !== 'PENDING' && state !== 'REVIEW' && (
          <button type="button" className="btn-white btn-sm border border-line" disabled={busy} onClick={() => void ask()}>
            {busy ? <Spinner className="size-3.5" /> : <Send className="size-3.5" aria-hidden />} {t('clientData.pkg.ask')}
          </button>
        )}
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" className="size-4" checked={ack} onChange={(e) => setAck(e.target.checked)} /> {t('clientData.pkg.ack')}
        </label>
      </div>
    </div>
  );
}
