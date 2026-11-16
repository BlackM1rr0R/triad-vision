import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, CheckCircle2, ChevronRight, Eye, FilePlus2, FileSignature, FileSpreadsheet, FileText, PenLine } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesOfficialForms } from '@/i18n/pagesOfficialForms';
import { TONE_CLASS } from '@/components/ui/status';
import { Spinner } from '@/components/ui/Spinner';
import { Documents, Success } from '@/components/illustrations';
import { Empty, Loading, Section } from './shared';
import { openPdfBlob, toastFormError } from '@/components/officialForms/api';
import { EzbWizard, wizardHasErrors, type WizardField, type WizardMeta } from '@/components/officialForms/EzbWizard';

registerCopy(pagesOfficialForms);

interface SignatureState {
  signerId: string | null;
  signerStatus: string | null;
  requestStatus: string | null;
}
interface FormListItem {
  id: string;
  status: 'SENT_TO_EMPLOYER' | 'SIGNED' | 'SUBMITTED';
  title: string;
  worker: string;
  profession: string;
  caseNumber: string;
  updatedAt: string;
  signature: SignatureState | null;
}
interface Startable {
  caseId: string;
  caseNumber: string;
  worker: string;
  profession: string;
}
interface FormDetail extends WizardMeta {
  id: string;
  status: FormListItem['status'];
  title: string;
  version: string;
  caseNumber: string;
  worker: { name: string; birthDate: string; nationality: string; profession: string };
  fields: WizardField[];
  editable: boolean;
  submittedAt: string | null;
  signature: SignatureState | null;
}

const STATUS_TONE = { SENT_TO_EMPLOYER: 'warning', SIGNED: 'success', SUBMITTED: 'accent' } as const;

/** Employer portal: official forms to complete and sign (/company/forms, /company/forms/:id). */
export const CompanyForms = () => {
  const { id } = useParams();
  return id ? <FormEditor id={id} /> : <FormList />;
};

const FormList = () => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['company-forms'],
    queryFn: async () => (await api.get<{ items: FormListItem[]; open: number; startable: Startable[] }>('/company/forms')).data,
  });
  const start = useMutation({
    mutationFn: async (caseId: string) => (await api.post<{ fill: { id: string } }>('/company/forms/start', { caseId })).data.fill,
    onSuccess: (fill) => {
      toast.success(t('ezbWizard.company.started'));
      void qc.invalidateQueries({ queryKey: ['company-forms'] });
      navigate(`/company/forms/${fill.id}`);
    },
    onError: toastFormError,
  });
  if (isLoading) return <Loading />;
  return (
    <div className="space-y-6">
      <Section title={t('officialForms.company.title')} icon={FileSignature}>
        <p className="-mt-3 mb-4 text-sm text-muted">{t('officialForms.company.subtitle')}</p>
        {!data?.items.length ? (
          <Empty icon={FileText} illustration={<Documents className="w-32" />} title={t('officialForms.company.empty')} />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {data.items.map((f) => (
              <li key={f.id}>
                <Link to={`/company/forms/${f.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-sunken">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-sky">
                    <FileText className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{f.title}</p>
                    <p className="truncate text-xs text-muted">
                      {f.worker} · {f.profession} · {date(f.updatedAt)}
                    </p>
                  </div>
                  <span className={clsx('badge shrink-0', TONE_CLASS[STATUS_TONE[f.status]])}>{t(`officialForms.company.status.${f.status}`)}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {!!data?.startable?.length && (
        <Section title={t('ezbWizard.company.startTitle')} icon={FilePlus2}>
          <p className="-mt-3 mb-4 text-sm text-muted">{t('ezbWizard.company.startHint')}</p>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {data.startable.map((s) => (
              <li key={s.caseId} className="flex min-h-14 flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{s.worker}</p>
                  <p className="truncate text-xs text-muted">
                    {s.profession} · {s.caseNumber}
                  </p>
                </div>
                <button type="button" className="btn-secondary btn-sm" disabled={start.isPending} onClick={() => start.mutate(s.caseId)}>
                  {start.isPending && start.variables === s.caseId ? <Spinner className="size-4" /> : <FilePlus2 className="size-4" aria-hidden />}
                  {t('ezbWizard.company.start')}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
};

const downloadBlob = (data: Blob, name: string) => {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

const FormEditor = ({ id }: { id: string }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['company-forms', id], queryFn: async () => (await api.get<{ form: FormDetail }>(`/company/forms/${id}`)).data.form });
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  const v = values ?? Object.fromEntries((data?.fields ?? []).map((f) => [f.key, f.value]));

  const preview = useMutation({
    mutationFn: async () => (await api.post<Blob>(`/company/forms/${id}/preview`, { values: v }, { responseType: 'blob' })).data,
    onSuccess: openPdfBlob,
    onError: toastFormError,
  });
  const datasheet = useMutation({
    mutationFn: async () => (await api.post<Blob>(`/company/forms/${id}/datasheet`, { values: v }, { responseType: 'blob' })).data,
    onSuccess: (blob) => downloadBlob(blob, `ezb-datenblatt-${data?.caseNumber ?? ''}.pdf`),
    onError: toastFormError,
  });
  const submit = useMutation({
    mutationFn: async () => (await api.post<{ signerId: string | null }>(`/company/forms/${id}/submit`, { values: v })).data,
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['company-forms'] });
      if (d.signerId) navigate(`/company/contracts/${d.signerId}`);
    },
    onError: (err) => {
      const code = errorCode(err);
      if (code === 'REQUIRED_MISSING' || code === 'INVALID_VALUES') {
        const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? '';
        setInvalid(msg.split(',').filter(Boolean));
      }
      toastFormError(err);
    },
  });

  if (isLoading) return <Loading />;
  if (error || !data)
    return (
      <Section>
        <p className="text-sm text-muted">{t('officialForms.errors.default')}</p>
      </Section>
    );

  const set = (k: string, val: string) => {
    setValues({ ...v, [k]: val });
    if (invalid.includes(k)) setInvalid(invalid.filter((x) => x !== k));
  };
  const sig = data.signature;
  const canSign = sig?.signerId && sig.requestStatus === 'SENT' && (sig.signerStatus === 'PENDING' || sig.signerStatus === 'VIEWED');
  const hasErrors = wizardHasErrors(data.fields, v);

  return (
    <div className="space-y-6">
      <Link to="/company/forms" className="btn-ghost btn-sm w-fit">
        <ArrowLeft className="size-4" aria-hidden />
        {t('officialForms.company.back')}
      </Link>
      <Section
        title={data.title}
        icon={FileSignature}
        actions={<span className={clsx('badge', TONE_CLASS[STATUS_TONE[data.status]])}>{t(`officialForms.company.status.${data.status}`)}</span>}
      >
        <dl className="grid gap-3 rounded-2xl bg-sunken p-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">{t('officialForms.company.worker')}</dt>
            <dd className="font-semibold text-ink">{data.worker.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('officialForms.company.born')}</dt>
            <dd className="text-ink">{data.worker.birthDate ? date(data.worker.birthDate) : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('officialForms.company.nationality')}</dt>
            <dd className="text-ink">{data.worker.nationality || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('officialForms.company.profession')}</dt>
            <dd className="text-ink">{data.worker.profession || '—'}</dd>
          </div>
        </dl>
        {data.status === 'SIGNED' || data.status === 'SUBMITTED' ? (
          <div className={clsx('mt-4 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm', TONE_CLASS.success)}>
            <Success className="w-14 shrink-0" />
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              {t('officialForms.company.signedNote')}
            </p>
          </div>
        ) : (
          canSign && (
            <div className={clsx('mt-4 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm', TONE_CLASS.info)}>
              <span>{t('officialForms.company.waitingNote')}</span>
              <Link to={`/company/contracts/${sig!.signerId}`} className="btn-primary btn-sm ml-auto">
                <PenLine className="size-4" aria-hidden />
                {t('officialForms.company.sign')}
              </Link>
            </div>
          )
        )}
      </Section>
      {data.editable && (
        <EzbWizard
          fields={data.fields}
          meta={data}
          values={v}
          onChange={set}
          serverInvalid={invalid}
          kldbUrl="/company/forms/kldb"
          reviewActions={
            <>
              <button type="button" className="btn-secondary" onClick={() => datasheet.mutate()} disabled={datasheet.isPending} title={t('ezbWizard.datasheetHint')}>
                {datasheet.isPending ? <Spinner className="size-4" /> : <FileSpreadsheet className="size-4" aria-hidden />}
                {t('ezbWizard.datasheet')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => preview.mutate()} disabled={preview.isPending}>
                {preview.isPending ? <Spinner className="size-4" /> : <Eye className="size-4" aria-hidden />}
                {t('officialForms.company.preview')}
              </button>
              <button type="button" className="btn-primary" onClick={() => submit.mutate()} disabled={submit.isPending || hasErrors}>
                {submit.isPending ? <Spinner className="size-4" /> : <PenLine className="size-4" aria-hidden />}
                {t('ezbWizard.company.submit')}
              </button>
            </>
          }
        />
      )}
      {data.editable && <p className="text-xs text-muted">{t('officialForms.company.submitHint')}</p>}
    </div>
  );
};

export default CompanyForms;
