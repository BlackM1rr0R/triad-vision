import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FileSpreadsheet, FileText, Save, Wand2 } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { EzbWizard, wizardHasErrors, type WizardField, type WizardMeta } from './EzbWizard';
import { toastFormError } from './api';

interface StaffWizardData extends WizardMeta {
  caseNumber: string;
  hasEmployer: boolean;
  templateInstalled: boolean;
  editable: boolean;
  fields: WizardField[];
}

/**
 * Staff version of the employer declaration wizard on the case (server lib/officialForms/staffWizard.ts):
 * staff enter the employer's answers (e.g. on the phone), save a draft or generate the official PDF; without
 * the installed official PDF only the data sheet is available.
 */
export const StaffEzbWizard = ({ caseId, open, onClose }: { caseId: string; open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'ezb-wizard', caseId],
    queryFn: async () => (await api.get<StaffWizardData>(`/admin/cases/${caseId}/ezb-wizard`)).data,
    enabled: open,
  });
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  const data = q.data;
  const v = values ?? Object.fromEntries((data?.fields ?? []).map((f) => [f.key, f.value]));

  const onError = (err: unknown) => {
    const code = errorCode(err);
    if (code === 'REQUIRED_MISSING' || code === 'INVALID_VALUES') setInvalid(((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? '').split(',').filter(Boolean));
    toastFormError(err);
  };
  const save = useMutation({
    mutationFn: async (generate: boolean) => (await api.put<{ generated: unknown }>(`/admin/cases/${caseId}/ezb-wizard`, { values: v, generate })).data,
    onSuccess: (d) => {
      toast.success(d.generated ? t('ezbWizard.staff.generated') : t('ezbWizard.staff.saved'));
      void qc.invalidateQueries({ queryKey: ['admin', 'ezb-wizard', caseId] });
      void qc.invalidateQueries({ queryKey: ['case-official-forms', caseId] });
      void qc.invalidateQueries({ queryKey: ['official-forms', 'case', caseId] });
      if (d.generated) onClose();
    },
    onError,
  });
  const sheet = useMutation({
    mutationFn: async () => (await api.post<Blob>(`/admin/cases/${caseId}/ezb-wizard/datasheet`, { values: v }, { responseType: 'blob' })).data,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ezb-datenblatt-${data?.caseNumber ?? ''}.pdf`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    },
    onError: toastFormError,
  });

  const readOnly = !!data && !data.editable;
  return (
    <Modal open={open} onClose={onClose} title={t('ezbWizard.staff.title')} icon={<Wand2 className="size-5" aria-hidden />} size="xl" mobile="full" align="top" busy={save.isPending}>
      {!data ? (
        <div className="grid place-items-center py-10 text-link">
          <Spinner />
        </div>
      ) : (
        <EzbWizard
          fields={data.fields}
          meta={data}
          values={v}
          readOnly={readOnly}
          onChange={(k, val) => {
            setValues({ ...v, [k]: val });
            if (invalid.includes(k)) setInvalid(invalid.filter((x) => x !== k));
          }}
          serverInvalid={invalid}
          kldbUrl="/admin/official-forms/kldb"
          header={
            <>
              {!data.templateInstalled && <p className="rounded-xl bg-warning-bg px-3 py-2 text-sm text-warning-fg">{t('ezbWizard.staff.notInstalled')}</p>}
              {readOnly && <p className="rounded-xl bg-sunken px-3 py-2 text-sm text-muted">{t('ezbWizard.staff.readOnly')}</p>}
            </>
          }
          reviewActions={
            <>
              <button type="button" className="btn-secondary" onClick={() => sheet.mutate()} disabled={sheet.isPending} title={t('ezbWizard.datasheetHint')}>
                {sheet.isPending ? <Spinner className="size-4" /> : <FileSpreadsheet className="size-4" aria-hidden />}
                {t('ezbWizard.datasheet')}
              </button>
              {data.templateInstalled && !readOnly && (
                <>
                  <button type="button" className="btn-secondary" onClick={() => save.mutate(false)} disabled={save.isPending}>
                    <Save className="size-4" aria-hidden />
                    {t('ezbWizard.staff.save')}
                  </button>
                  <button type="button" className="btn-primary" onClick={() => save.mutate(true)} disabled={save.isPending || wizardHasErrors(data.fields, v)}>
                    {save.isPending ? <Spinner className="size-4" /> : <FileText className="size-4" aria-hidden />}
                    {t('ezbWizard.staff.generate')}
                  </button>
                </>
              )}
            </>
          }
        />
      )}
    </Modal>
  );
};

export default StaffEzbWizard;
