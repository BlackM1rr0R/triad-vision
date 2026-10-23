import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy } from '@/i18n';
import { pagesFamilyLanguage } from '@/i18n/pagesFamilyLanguage';
import { FAMILY_RELATIONS, type MemberForm } from './types';

registerCopy(pagesFamilyLanguage);

/**
 * Form for a family member's details (portal add / edit, admin add / edit). Passport fields arrive masked
 * for staff ("•••• 5678"); sending them back unchanged keeps the stored value (the server ignores masked input).
 */
export const MemberFormFields = ({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
  relationLocked = false,
  idPrefix,
}: {
  initial: MemberForm;
  onSubmit: (f: MemberForm) => Promise<unknown>;
  onCancel: () => void;
  submitLabel: string;
  relationLocked?: boolean;
  idPrefix: string;
}) => {
  const { t } = useTranslation();
  const [f, setF] = useState<MemberForm>(initial);
  const [busy, setBusy] = useState(false);
  const set =
    <K extends keyof MemberForm>(k: K) =>
    (e: { target: { value: string } }) =>
      setF((s) => ({ ...s, [k]: e.target.value as MemberForm[K] }));
  const id = (k: string) => `${idPrefix}-${k}`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(f);
    } finally {
      setBusy(false);
    }
  };

  const field = (k: keyof MemberForm, label: string, type: 'text' | 'date' | 'email' = 'text', extra: { maxLength?: number; required?: boolean; placeholder?: string; autoComplete?: string } = {}) => (
    <div className="min-w-0">
      <label htmlFor={id(k)} className="label">
        {label}
      </label>
      <input id={id(k)} type={type} className="input" value={f[k] as string} onChange={set(k)} {...extra} />
    </div>
  );

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-xs font-bold tracking-wide text-muted uppercase sm:col-span-2">{t('familyMembers.details')}</legend>
        <div className="min-w-0">
          <label htmlFor={id('relation')} className="label">
            {t('familyMembers.fields.relation')}
          </label>
          <select id={id('relation')} className="input" value={f.relation} onChange={set('relation')} disabled={relationLocked}>
            {FAMILY_RELATIONS.map((r) => (
              <option key={r} value={r}>
                {t(`familyMembers.relation.${r}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={id('joinsWhen')} className="label">
            {t('familyMembers.fields.joinsWhen')}
          </label>
          <select id={id('joinsWhen')} className="input" value={f.joinsWhen} onChange={set('joinsWhen')}>
            {(['WITH_MAIN', 'LATER'] as const).map((j) => (
              <option key={j} value={j}>
                {t(`familyMembers.joins.${j}`)}
              </option>
            ))}
          </select>
        </div>
        {field('firstName', t('familyMembers.fields.firstName'), 'text', { maxLength: 80, required: true, placeholder: t('familyMembers.fields.namesHint'), autoComplete: 'off' })}
        {field('lastName', t('familyMembers.fields.lastName'), 'text', { maxLength: 80, required: true, placeholder: t('familyMembers.fields.namesHint'), autoComplete: 'off' })}
        {field('birthDate', t('familyMembers.fields.birthDate'), 'date')}
        {field('birthPlace', t('familyMembers.fields.birthPlace'), 'text', { maxLength: 120 })}
        <div className="min-w-0">
          <label htmlFor={id('sex')} className="label">
            {t('familyMembers.fields.sex')}
          </label>
          <select id={id('sex')} className="input" value={f.sex} onChange={set('sex')}>
            <option value="">—</option>
            {(['F', 'M', 'X'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`familyMembers.sex.${s}`)}
              </option>
            ))}
          </select>
        </div>
        {field('nationality', t('familyMembers.fields.nationality'), 'text', { maxLength: 60 })}
        {field('email', t('familyMembers.fields.email'), 'email', { maxLength: 190 })}
        {f.joinsWhen === 'LATER' && field('plannedEntryAt', t('familyMembers.fields.plannedEntryAt'), 'date')}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-xs font-bold tracking-wide text-muted uppercase sm:col-span-3">{t('familyMembers.passport')}</legend>
        {field('passportNumber', t('familyMembers.fields.passportNumber'), 'text', { maxLength: 40, autoComplete: 'off' })}
        {field('passportIssuedAt', t('familyMembers.fields.passportIssuedAt'), 'date')}
        {field('passportExpiresAt', t('familyMembers.fields.passportExpiresAt'), 'date')}
      </fieldset>

      {f.relation === 'spouse' && (
        <div className="rounded-xl border border-line bg-surface p-3.5">
          <label className="flex items-start gap-2.5 text-sm font-medium text-navy-900">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={f.germanExempt} onChange={(e) => setF((s) => ({ ...s, germanExempt: e.target.checked }))} />
            <span>
              {t('familyMembers.fields.germanExempt')}
              <span className="mt-0.5 block text-xs font-normal text-muted">{t('familyMembers.fields.germanExemptHint')}</span>
            </span>
          </label>
          {f.germanExempt && (
            <div className="mt-3">
              <label htmlFor={id('germanExemptNote')} className="label">
                {t('familyMembers.fields.germanExemptNote')}
              </label>
              <input id={id('germanExemptNote')} className="input" value={f.germanExemptNote} onChange={set('germanExemptNote')} maxLength={300} />
            </div>
          )}
        </div>
      )}

      <div>
        <label htmlFor={id('notes')} className="label">
          {t('familyMembers.fields.notes')}
        </label>
        <textarea id={id('notes')} className="input min-h-20" value={f.notes} onChange={set('notes')} maxLength={4000} />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-white btn-sm border border-line" onClick={onCancel}>
          {t('familyMembers.cancel')}
        </button>
        <button type="submit" className="btn-primary btn-sm" disabled={busy || !f.firstName.trim() || !f.lastName.trim()}>
          {busy && <Spinner className="size-3.5" />} {submitLabel}
        </button>
      </div>
    </form>
  );
};
