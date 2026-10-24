import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowLeft, CheckCircle2, ChevronRight, Eye, FileSignature, FileText, PenLine } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesOfficialForms } from '@/i18n/pagesOfficialForms';
import { TONE_CLASS } from '@/components/ui/status';
import { Spinner } from '@/components/ui/Spinner';
import { Empty, Loading, Section } from './shared';
import { openPdfBlob, toastFormError, type L10n } from '@/components/officialForms/api';

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
interface EmployerField {
  key: string;
  group: string;
  kind: 'text' | 'date' | 'code' | 'money' | 'number';
  codes: string[] | null;
  label: L10n;
  value: string;
  required: boolean;
}
interface FormDetail {
  id: string;
  status: FormListItem['status'];
  title: string;
  version: string;
  caseNumber: string;
  worker: { name: string; birthDate: string; nationality: string; profession: string };
  fields: EmployerField[];
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
  const { data, isLoading } = useQuery({ queryKey: ['company-forms'], queryFn: async () => (await api.get<{ items: FormListItem[]; open: number }>('/company/forms')).data });
  if (isLoading) return <Loading />;
  return (
    <Section title={t('officialForms.company.title')} icon={FileSignature}>
      <p className="-mt-3 mb-4 text-sm text-muted">{t('officialForms.company.subtitle')}</p>
      {!data?.items.length ? (
        <Empty icon={FileText} title={t('officialForms.company.empty')} />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {data.items.map((f) => (
            <li key={f.id}>
              <Link to={`/company/forms/${f.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface">
                <FileText className="size-5 shrink-0 text-brand-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-navy-900">{f.title}</p>
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
  );
};

const SECTION_OF: Record<string, 'company' | 'job' | 'pay' | 'conditions'> = {
  company: 'company',
  contract: 'job',
  employment: 'conditions',
};
const PAY_KEYS = new Set(['contract.grossMonthly', 'contract.weeklyHours', 'contract.vacationDays', 'contract.probationMonths']);
const sectionOf = (f: EmployerField) => (PAY_KEYS.has(f.key) ? 'pay' : f.key === 'employment.jobDescription' || f.key === 'employment.workplaceMode' || f.key === 'employment.workplaceAddress' ? 'job' : (SECTION_OF[f.group] ?? 'conditions'));

const FormEditor = ({ id }: { id: string }) => {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const missing = data.fields.filter((f) => f.required && !(v[f.key] ?? '').trim()).map((f) => f.key);
    setInvalid(missing);
    if (!missing.length) submit.mutate();
  };
  const set = (k: string, val: string) => {
    setValues({ ...v, [k]: val });
    if (invalid.includes(k)) setInvalid(invalid.filter((x) => x !== k));
  };
  const sections = (['company', 'job', 'pay', 'conditions'] as const).map((s) => ({ s, fields: data.fields.filter((f) => sectionOf(f) === s) }));
  const sig = data.signature;
  const canSign = sig?.signerId && sig.requestStatus === 'SENT' && (sig.signerStatus === 'PENDING' || sig.signerStatus === 'VIEWED');

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
        <dl className="grid gap-3 rounded-xl bg-surface p-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">{t('officialForms.company.worker')}</dt>
            <dd className="font-semibold text-navy-900">{data.worker.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('officialForms.company.born')}</dt>
            <dd className="text-navy-900">{data.worker.birthDate ? date(data.worker.birthDate) : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('officialForms.company.nationality')}</dt>
            <dd className="text-navy-900">{data.worker.nationality || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('officialForms.company.profession')}</dt>
            <dd className="text-navy-900">{data.worker.profession || '—'}</dd>
          </div>
        </dl>
        {data.status === 'SIGNED' || data.status === 'SUBMITTED' ? (
          <p className={clsx('mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm', TONE_CLASS.success)}>
            <CheckCircle2 className="size-4" aria-hidden />
            {t('officialForms.company.signedNote')}
          </p>
        ) : (
          canSign && (
            <div className={clsx('mt-4 flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-sm', TONE_CLASS.info)}>
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
        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          {sections
            .filter((x) => x.fields.length)
            .map(({ s, fields }) => (
              <Section key={s} title={t(`officialForms.company.sections.${s}`)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {fields.map((f) => (
                    <EmployerInput key={f.key} field={f} value={v[f.key] ?? ''} invalid={invalid.includes(f.key)} label={tr(f.label)} onChange={(val) => set(f.key, val)} />
                  ))}
                </div>
              </Section>
            ))}
          <Section>
            <p className="mb-4 text-sm text-muted">{t('officialForms.company.submitHint')}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => preview.mutate()} disabled={preview.isPending}>
                {preview.isPending ? <Spinner className="size-4" /> : <Eye className="size-4" aria-hidden />}
                {t('officialForms.company.preview')}
              </button>
              <button type="submit" className="btn-primary" disabled={submit.isPending}>
                {submit.isPending ? <Spinner className="size-4" /> : <PenLine className="size-4" aria-hidden />}
                {t('officialForms.company.submit')}
              </button>
            </div>
          </Section>
        </form>
      )}
    </div>
  );
};

const EmployerInput = ({ field, value, invalid, label, onChange }: { field: EmployerField; value: string; invalid: boolean; label: string; onChange: (v: string) => void }) => {
  const { t } = useTranslation();
  const id = `cf-${field.key.replace(/\./g, '-')}`;
  const wide = field.key === 'employment.jobDescription' || field.key === 'employment.workplaceAddress' || field.key === 'company.name';
  const cls = clsx('input', invalid && 'border-danger ring-1 ring-danger');
  return (
    <div className={clsx(wide && 'sm:col-span-2')}>
      <label className="label" htmlFor={id}>
        {label}
        {field.required && <span className="ml-1 text-xs font-normal text-muted">({t('officialForms.company.required')})</span>}
      </label>
      {field.kind === 'code' && field.codes ? (
        <select id={id} className={cls} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} required={field.required}>
          <option value="">{t('officialForms.company.choose')}</option>
          {field.codes.map((c) => (
            <option key={c} value={c}>
              {c === 'yes' ? t('officialForms.company.yes') : c === 'no' ? t('officialForms.company.no') : t(`officialForms.company.codes.${c}`, { defaultValue: c })}
            </option>
          ))}
        </select>
      ) : field.key === 'employment.jobDescription' ? (
        <textarea id={id} rows={3} maxLength={1000} className={cls} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} />
      ) : (
        <input
          id={id}
          className={cls}
          type={field.kind === 'date' ? 'date' : field.kind === 'money' || field.kind === 'number' ? 'number' : field.key === 'company.email' ? 'email' : 'text'}
          inputMode={field.kind === 'money' || field.kind === 'number' ? 'decimal' : undefined}
          step={field.kind === 'money' ? '0.01' : field.kind === 'number' ? '0.5' : undefined}
          min={field.kind === 'money' || field.kind === 'number' ? 0 : undefined}
          maxLength={300}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
          required={field.required}
        />
      )}
    </div>
  );
};

export default CompanyForms;
