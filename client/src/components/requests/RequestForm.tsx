import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { GERMAN_LEVELS } from '@/components/jobs/types';
import { useJobLabels } from '@/components/jobs/labels';
import type { RequestFormValues } from './types';

const Field = ({ label, htmlFor, children, className }: { label: string; htmlFor: string; children: ReactNode; className?: string }) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-ink">
      {label}
    </label>
    {children}
  </div>
);

/** Employer request form (German-first labels via the current language). */
export const RequestForm = ({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: RequestFormValues;
  submitLabel: string;
  pending: boolean;
  onSubmit: (v: RequestFormValues) => void;
  onCancel: () => void;
}) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const L = useJobLabels();
  const [f, setF] = useState<RequestFormValues>(initial);
  const set = <K extends keyof RequestFormValues>(k: K, v: string) => setF((s) => ({ ...s, [k]: v }));
  const options = useQuery({
    queryKey: ['company-request-options'],
    queryFn: async () => (await api.get<{ visaCategories: { id: string; title: L10n; visaLabel: string }[] }>('/company/requests/options')).data,
    staleTime: 10 * 60_000,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(f);
  };
  const salaryInvalid = f.salaryMin !== '' && f.salaryMax !== '' && Number(f.salaryMin) > Number(f.salaryMax);

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label={t('requests.fields.title')} htmlFor="rq-title" className="sm:col-span-2">
        <input id="rq-title" className="input" required minLength={2} maxLength={200} placeholder={t('requests.fields.titlePh')} value={f.title} onChange={(e) => set('title', e.target.value)} />
      </Field>
      <Field label={t('requests.fields.profession')} htmlFor="rq-profession">
        <input id="rq-profession" className="input" required minLength={2} maxLength={120} placeholder={t('requests.fields.professionPh')} value={f.profession} onChange={(e) => set('profession', e.target.value)} />
      </Field>
      <Field label={t('requests.fields.quantity')} htmlFor="rq-quantity">
        <input id="rq-quantity" className="input" type="number" required min={1} max={200} value={f.quantity} onChange={(e) => set('quantity', e.target.value)} />
      </Field>
      <Field label={t('requests.fields.visaCategory')} htmlFor="rq-visa">
        <select id="rq-visa" className="input" value={f.visaCategoryId} onChange={(e) => set('visaCategoryId', e.target.value)}>
          <option value="">{t('requests.fields.anyVisa')}</option>
          {options.data?.visaCategories.map((v) => (
            <option key={v.id} value={v.id}>
              {v.visaLabel} · {tr(v.title)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('requests.fields.germanLevel')} htmlFor="rq-german">
        <select id="rq-german" className="input" value={f.germanLevel} onChange={(e) => set('germanLevel', e.target.value)}>
          <option value="">—</option>
          {GERMAN_LEVELS.map((l) => (
            <option key={l} value={l}>
              {L.german(l)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('requests.fields.drivingLicence')} htmlFor="rq-licence">
        <input id="rq-licence" className="input" maxLength={40} placeholder={t('requests.fields.drivingLicencePh')} value={f.drivingLicence} onChange={(e) => set('drivingLicence', e.target.value)} />
      </Field>
      <Field label={t('requests.fields.minExperience')} htmlFor="rq-exp">
        <input id="rq-exp" className="input" type="number" min={0} max={40} value={f.minExperience} onChange={(e) => set('minExperience', e.target.value)} />
      </Field>
      <Field label={t('requests.fields.city')} htmlFor="rq-city">
        <input id="rq-city" className="input" maxLength={80} value={f.city} onChange={(e) => set('city', e.target.value)} />
      </Field>
      <Field label={t('requests.fields.startDate')} htmlFor="rq-start">
        <input id="rq-start" className="input" type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} />
      </Field>
      <Field label={t('requests.fields.salaryMin')} htmlFor="rq-smin">
        <input id="rq-smin" className="input" type="number" min={0} max={100000} step={50} value={f.salaryMin} onChange={(e) => set('salaryMin', e.target.value)} />
      </Field>
      <Field label={t('requests.fields.salaryMax')} htmlFor="rq-smax">
        <input
          id="rq-smax"
          className="input"
          type="number"
          min={0}
          max={100000}
          step={50}
          value={f.salaryMax}
          aria-invalid={salaryInvalid || undefined}
          onChange={(e) => set('salaryMax', e.target.value)}
        />
      </Field>
      <Field label={t('requests.fields.notes')} htmlFor="rq-notes" className="sm:col-span-2">
        <textarea id="rq-notes" className="input min-h-24" maxLength={5000} placeholder={t('requests.fields.notesPh')} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>
          {t('requests.company.keep')}
        </button>
        <button type="submit" className="btn-primary btn-sm" disabled={pending || salaryInvalid}>
          {pending && <Spinner className="size-4" />} {submitLabel}
        </button>
      </div>
    </form>
  );
};
