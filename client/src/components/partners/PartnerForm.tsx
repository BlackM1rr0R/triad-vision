import { useEffect, useId, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import clsx from 'clsx';
import { Building2, FileSignature, Lock, Phone, Plus, Settings2, SlidersHorizontal, Trash2, UserRound, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import i18n, { registerCopy } from '@/i18n';
import { pagesPartnerProfile } from '@/i18n/pagesPartnerProfile';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { Modal } from '@/components/admin/Modal';
import { Switch } from '@/components/admin/ui';
import { Spinner } from '@/components/ui/Spinner';
import { isMaskedValue, SensitiveValue } from '@/components/privacyTools/SensitiveValue';
import { fromCents, toCents } from './Commissions';
import { PARTNER_LANGS, PARTNERS_KEY, partnerError, usePartnerFields, type Partner, type PartnerFieldDef, type PartnerLang, type PartnerType } from './api';
import { PartnerFieldsManager } from './PartnerFieldsManager';

registerCopy(pagesPartnerProfile);

/**
 * The one referral partner form — used by /admin/partners and the drive "Partner" section. Grouped
 * sections (basic, contact, company & bank, contract, custom fields); bank data is read-only and masked
 * for staff (the server enforces it too). Custom fields: the admin-defined ones (PartnerFieldDef, same
 * for every partner) and the partner's own "+ add field" label / value pairs.
 */

interface ExtraRow {
  key: number;
  label: string;
  value: string;
}

interface FormState {
  name: string;
  partnerType: PartnerType;
  companyName: string;
  contactPerson: string;
  active: boolean;
  tags: string[];
  preferredLanguage: PartnerLang | '';
  note: string;
  phone: string;
  phone2: string;
  whatsapp: string;
  email: string;
  website: string;
  address: string;
  city: string;
  country: string;
  taxId: string;
  bankName: string;
  bankAccountHolder: string;
  iban: string;
  bic: string;
  contractStart: string;
  contractEnd: string;
  commission: string;
  currency: string;
  customData: Record<string, string | boolean>;
  extraFields: ExtraRow[];
}

let rowKey = 0;

const formOf = (p: Partner | null): FormState => ({
  name: p?.name ?? '',
  partnerType: p?.partnerType ?? 'INDIVIDUAL',
  companyName: p?.companyName ?? '',
  contactPerson: p?.contactPerson ?? '',
  active: p?.active ?? true,
  tags: p?.tags ?? [],
  preferredLanguage: p?.preferredLanguage ?? '',
  note: p?.note ?? '',
  phone: p?.phone ?? '',
  phone2: p?.phone2 ?? '',
  whatsapp: p?.whatsapp ?? '',
  email: p?.email ?? '',
  website: p?.website ?? '',
  address: p?.address ?? '',
  city: p?.city ?? '',
  country: p?.country ?? '',
  taxId: p?.taxId ?? '',
  bankName: p?.bankName ?? '',
  bankAccountHolder: p?.bankAccountHolder ?? '',
  iban: p?.iban ?? '',
  bic: p?.bic ?? '',
  contractStart: p?.contractStart ?? '',
  contractEnd: p?.contractEnd ?? '',
  commission: fromCents(p?.commissionCents),
  currency: p?.currency ?? 'EUR',
  customData: Object.fromEntries(Object.entries(p?.customData ?? {}).map(([k, v]) => [k, typeof v === 'boolean' ? v : String(v)])),
  extraFields: (p?.extraFields ?? []).map((f) => ({ key: ++rowKey, ...f })),
});

/** The request body: blanks clear a field (the server turns '' into null); bank data only when editable. */
const bodyOf = (f: FormState, defs: PartnerFieldDef[], bankEditable: boolean) => ({
  name: f.name.trim(),
  partnerType: f.partnerType,
  companyName: f.companyName,
  contactPerson: f.contactPerson,
  active: f.active,
  tags: f.tags,
  preferredLanguage: f.preferredLanguage,
  note: f.note,
  phone: f.phone,
  phone2: f.phone2,
  whatsapp: f.whatsapp,
  email: f.email.trim(),
  website: f.website,
  address: f.address,
  city: f.city,
  country: f.country,
  taxId: f.taxId,
  ...(bankEditable ? { bankName: f.bankName, bankAccountHolder: f.bankAccountHolder, iban: f.iban, bic: f.bic } : {}),
  contractStart: f.contractStart,
  contractEnd: f.contractEnd,
  commissionCents: toCents(f.commission),
  currency: f.currency.trim().toUpperCase() || 'EUR',
  customData: Object.fromEntries(defs.map((d) => [d.id, d.type === 'CHECKBOX' ? f.customData[d.id] === true : typeof f.customData[d.id] === 'string' ? f.customData[d.id] : ''])),
  extraFields: f.extraFields.filter((r) => r.label.trim() && r.value.trim()).map((r) => ({ label: r.label.trim(), value: r.value.trim() })),
});

/** Translated toast for a failed save (validation issues name the field). */
const saveError = (err: unknown) => {
  const code = errorCode(err);
  const data = err instanceof AxiosError ? (err.response?.data as { message?: string; issues?: { message?: string }[] } | undefined) : undefined;
  if (code === 'VALIDATION') {
    const msg = data?.issues?.find((i) => i.message && i18n.exists(`partnerForm.errors.${i.message}`))?.message;
    if (msg) return void toast.error(i18n.t(`partnerForm.errors.${msg}`));
  }
  if (code === 'INVALID_CUSTOM_FIELD') return void toast.error(i18n.t('partnerForm.errors.INVALID_CUSTOM_FIELD', { label: data?.message ?? '' }));
  if (code && i18n.exists(`partnerForm.errors.${code}`)) return void toast.error(i18n.t(`partnerForm.errors.${code}`));
  partnerError(err);
};

// ─── Small building blocks ─────────────────────────────────────────────

const Field = ({ label, children, className, hint }: { label: string; children: (id: string) => ReactNode; className?: string; hint?: ReactNode }) => {
  const id = useId();
  return (
    <div className={clsx('min-w-0', className)}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children(id)}
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
};

const Section = ({ id, icon: Icon, title, children, aside }: { id: string; icon: typeof Phone; title: string; children: ReactNode; aside?: ReactNode }) => (
  <fieldset id={id} className="scroll-mt-16 rounded-xl border border-line p-4">
    <legend className="flex items-center gap-1.5 px-1.5 text-sm font-semibold text-ink">
      <Icon className="size-4 text-link" aria-hidden /> {title}
    </legend>
    {aside}
    <div className="grid gap-4 sm:grid-cols-2">{children}</div>
  </fieldset>
);

const TagInput = ({ id, tags, onChange }: { id: string; tags: string[]; onChange: (tags: string[]) => void }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const next = [...tags];
    for (const p of parts) if (!next.some((x) => x.toLowerCase() === p.toLowerCase()) && next.length < 20) next.push(p.slice(0, 40));
    onChange(next);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && draft.trim()) {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1));
  };
  return (
    <div className="input flex min-h-10 flex-wrap items-center gap-1.5 !py-1.5">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-sunken px-2 py-0.5 text-xs font-medium text-ink">
          {tag}
          <button type="button" className="rounded text-muted hover:text-danger-fg" aria-label={t('partnerForm.f.removeTag', { tag })} onClick={() => onChange(tags.filter((x) => x !== tag))}>
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        id={id}
        className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none"
        value={draft}
        maxLength={40}
        placeholder={tags.length ? '' : t('partnerForm.f.tagsPh')}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => draft.trim() && add(draft)}
      />
    </div>
  );
};

/** Input of one admin-defined field. */
const CustomInput = ({ def, value, onChange }: { def: PartnerFieldDef; value: string | boolean | undefined; onChange: (v: string | boolean) => void }) => {
  const { t } = useTranslation();
  if (def.type === 'CHECKBOX')
    return (
      <div className="flex min-h-10 items-center gap-3">
        <Switch checked={value === true} onChange={onChange} label={def.label} />
        <span className="text-sm text-ink">{def.label}</span>
      </div>
    );
  const s = typeof value === 'string' ? value : '';
  return (
    <Field label={def.label} className={def.type === 'LONG_TEXT' ? 'sm:col-span-2' : undefined}>
      {(id) =>
        def.type === 'LONG_TEXT' ? (
          <textarea id={id} className="input min-h-20" maxLength={5000} value={s} onChange={(e) => onChange(e.target.value)} />
        ) : def.type === 'SELECT' ? (
          <select id={id} className="input" value={s} onChange={(e) => onChange(e.target.value)}>
            <option value="">{t('partnerForm.custom.choose')}</option>
            {/* A stored value that is no longer an option stays visible until it is changed. */}
            {s && !def.options.includes(s) && <option value={s}>{s}</option>}
            {def.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            className={clsx('input', def.type === 'NUMBER' && 'tabular-nums')}
            type={def.type === 'DATE' ? 'date' : 'text'}
            inputMode={def.type === 'NUMBER' ? 'decimal' : undefined}
            maxLength={def.type === 'TEXT' ? 500 : undefined}
            value={s}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
    </Field>
  );
};

// ─── The dialog ────────────────────────────────────────────────────────

const SECTIONS = [
  ['basic', UserRound],
  ['contact', Phone],
  ['company', Building2],
  ['contract', FileSignature],
  ['custom', SlidersHorizontal],
] as const;

/**
 * Create or edit a referral partner. `onSaved` gets the server's answer (the new partner's folder id on
 * create; the partner's drive folder is created / renamed by the server).
 */
export const PartnerFormDialog = ({
  open,
  partner,
  onClose,
  onSaved,
}: {
  open: boolean;
  partner: Partner | null;
  onClose: () => void;
  onSaved?: (r: { partner: Partner; folderId: string | null }) => void;
}) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const defs = usePartnerFields(open);
  const [f, setF] = useState<FormState>(() => formOf(partner));
  const [managing, setManaging] = useState(false);
  const uid = useId();
  useEffect(() => {
    if (open) setF(formOf(partner));
  }, [open, partner]);
  const bankEditable = isAdmin && !partner?.bankLocked;
  const fields = useMemo(() => defs.data ?? [], [defs.data]);

  const commissionInvalid = f.commission.trim() !== '' && toCents(f.commission) === null;
  const datesInvalid = !!f.contractStart && !!f.contractEnd && f.contractEnd < f.contractStart;
  const extraInvalid = f.extraFields.some((r) => !r.label.trim() && r.value.trim());
  const invalid = !f.name.trim() || commissionInvalid || datesInvalid || extraInvalid;

  const save = useMutation({
    mutationFn: async () => {
      const body = bodyOf(f, fields, bankEditable);
      if (partner) return { folderId: null, ...(await api.patch<{ partner: Partner }>(`/admin/partners/${partner.id}`, body)).data };
      return (await api.post<{ partner: Partner; folderId: string | null }>('/admin/partners', body)).data;
    },
    onSuccess: async (r) => {
      toast.success(t(partner ? 'partnerForm.saved' : 'partnerForm.created'));
      await qc.invalidateQueries({ queryKey: PARTNERS_KEY });
      onSaved?.({ partner: r.partner, folderId: r.folderId ?? null });
      onClose();
    },
    onError: saveError,
  });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const text = (k: keyof FormState, label: string, opts: { type?: string; max?: number; className?: string; inputClass?: string; placeholder?: string; autoComplete?: string; required?: boolean } = {}) => (
    <Field label={label} className={opts.className}>
      {(id) => (
        <input
          id={id}
          className={clsx('input', opts.inputClass)}
          type={opts.type ?? 'text'}
          maxLength={opts.max}
          required={opts.required}
          placeholder={opts.placeholder}
          autoComplete={opts.autoComplete ?? 'off'}
          value={f[k] as string}
          onChange={(e) => set(k, e.target.value as never)}
          data-autofocus={k === 'name' || undefined}
        />
      )}
    </Field>
  );
  const bankInput = (k: 'bankName' | 'bankAccountHolder' | 'iban' | 'bic', label: string, max: number, mono = false) => (
    <Field label={label}>
      {(id) => (
        <>
          <input
            id={id}
            className={clsx('input', mono && 'font-mono uppercase', !bankEditable && 'cursor-not-allowed opacity-70')}
            maxLength={max}
            autoComplete="off"
            readOnly={!bankEditable}
            aria-readonly={!bankEditable || undefined}
            value={f[k]}
            onChange={(e) => set(k, e.target.value)}
          />
          {/* Admins whose role masks IBANs reveal them with a reason (audited). */}
          {bankEditable && partner && (k === 'iban' || k === 'bic') && isMaskedValue(partner[k]) && (
            <SensitiveValue value={partner[k]} entity="partner" id={partner.id} field={k} className="mt-1 text-xs" />
          )}
        </>
      )}
    </Field>
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!invalid && !save.isPending) save.mutate();
  };
  const jump = (key: string) => document.getElementById(`${uid}-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        busy={save.isPending}
        size="xl"
        mobile="full"
        align="top"
        as="form"
        onSubmit={submit}
        title={partner ? t('partnerForm.editTitle') : t('partnerForm.addTitle')}
        description={partner?.name}
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={save.isPending}>
              {t('partnerForm.cancel')}
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={invalid || save.isPending}>
              {save.isPending && <Spinner className="size-3.5" />} {t('partnerForm.save')}
            </button>
          </>
        }
      >
        <nav aria-label={t('partnerForm.sectionNav')} className="sticky -top-5 z-10 -mx-1 mb-3 flex gap-1.5 overflow-x-auto bg-card px-1 py-2">
          {SECTIONS.map(([key, Icon]) => (
            <button key={key} type="button" className="btn-secondary btn-sm shrink-0 !rounded-full" onClick={() => jump(key)}>
              <Icon className="size-3.5" aria-hidden /> {t(`partnerForm.sections.${key}`)}
            </button>
          ))}
        </nav>
        <div className="space-y-5">
          <Section id={`${uid}-basic`} icon={UserRound} title={t('partnerForm.sections.basic')}>
            {text('name', t('partnerForm.f.name'), { max: 120, required: true, className: 'sm:col-span-2' })}
            <div role="radiogroup" aria-label={t('partnerForm.f.partnerType')} className="sm:col-span-2">
              <span className="label">{t('partnerForm.f.partnerType')}</span>
              <div className="flex flex-wrap gap-2">
                {(['INDIVIDUAL', 'COMPANY'] as const).map((v) => (
                  <label key={v} className={clsx('inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm', f.partnerType === v ? 'border-link bg-primary/[0.06] font-semibold text-ink' : 'border-line text-muted')}>
                    <input type="radio" className="size-4 accent-brand-600" name={`${uid}-type`} checked={f.partnerType === v} onChange={() => set('partnerType', v)} />
                    {v === 'COMPANY' ? <Building2 className="size-4" aria-hidden /> : <UserRound className="size-4" aria-hidden />} {t(`partnerForm.f.types.${v}`)}
                  </label>
                ))}
              </div>
            </div>
            {f.partnerType === 'COMPANY' && text('companyName', t('partnerForm.f.companyName'), { max: 160 })}
            {text('contactPerson', t('partnerForm.f.contactPerson'), { max: 120 })}
            <Field label={t('partnerForm.f.language')}>
              {(id) => (
                <select id={id} className="input" value={f.preferredLanguage} onChange={(e) => set('preferredLanguage', e.target.value as PartnerLang | '')}>
                  <option value="">{t('partnerForm.none')}</option>
                  {PARTNER_LANGS.map((l) => (
                    <option key={l} value={l}>
                      {t(`partnerForm.f.languages.${l}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('partnerForm.f.tags')} hint={t('partnerForm.f.tagsHint')} className="sm:col-span-2">
              {(id) => <TagInput id={id} tags={f.tags} onChange={(v) => set('tags', v)} />}
            </Field>
            <Field label={t('partnerForm.f.note')} className="sm:col-span-2">
              {(id) => <textarea id={id} className="input min-h-20" maxLength={5000} placeholder={t('partnerForm.f.notePh')} value={f.note} onChange={(e) => set('note', e.target.value)} />}
            </Field>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch checked={f.active} onChange={(v) => set('active', v)} label={t('partnerForm.f.active')} />
              <span className="text-sm text-ink">{t('partnerForm.f.active')}</span>
            </div>
          </Section>

          <Section id={`${uid}-contact`} icon={Phone} title={t('partnerForm.sections.contact')}>
            {text('phone', t('partnerForm.f.phone'), { type: 'tel', max: 40, autoComplete: 'tel' })}
            {text('phone2', t('partnerForm.f.phone2'), { type: 'tel', max: 40 })}
            {text('whatsapp', t('partnerForm.f.whatsapp'), { type: 'tel', max: 40 })}
            {text('email', t('partnerForm.f.email'), { type: 'email', max: 191, autoComplete: 'email' })}
            {text('website', t('partnerForm.f.website'), { max: 255, placeholder: t('partnerForm.f.websitePh'), className: 'sm:col-span-2' })}
            {text('address', t('partnerForm.f.address'), { max: 255, className: 'sm:col-span-2' })}
            {text('city', t('partnerForm.f.city'), { max: 120 })}
            {text('country', t('partnerForm.f.country'), { max: 80 })}
          </Section>

          <Section
            id={`${uid}-company`}
            icon={Building2}
            title={t('partnerForm.sections.company')}
            aside={
              !bankEditable && (
                <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-sunken px-3 py-2 text-xs text-muted">
                  <Lock className="size-3.5 shrink-0" aria-hidden /> {t('partnerForm.bankLocked')}
                </p>
              )
            }
          >
            <Field label={t('partnerForm.f.taxId')}>
              {(id) => (
                <>
                  <input id={id} className="input font-mono" maxLength={40} autoComplete="off" value={f.taxId} onChange={(e) => set('taxId', e.target.value)} />
                  {partner && isMaskedValue(partner.taxId) && <SensitiveValue value={partner.taxId} entity="partner" id={partner.id} field="taxId" className="mt-1 text-xs" />}
                </>
              )}
            </Field>
            {bankInput('bankName', t('partnerForm.f.bankName'), 120)}
            {bankInput('bankAccountHolder', t('partnerForm.f.bankAccountHolder'), 120)}
            {bankInput('iban', t('partnerForm.f.iban'), 42, true)}
            {bankInput('bic', t('partnerForm.f.bic'), 11, true)}
          </Section>

          <Section id={`${uid}-contract`} icon={FileSignature} title={t('partnerForm.sections.contract')}>
            {text('contractStart', t('partnerForm.f.contractStart'), { type: 'date' })}
            <Field label={t('partnerForm.f.contractEnd')} hint={datesInvalid && <span className="text-danger-fg">{t('partnerForm.errors.CONTRACT_DATES_INVALID')}</span>}>
              {(id) => <input id={id} className="input" type="date" min={f.contractStart || undefined} value={f.contractEnd} onChange={(e) => set('contractEnd', e.target.value)} aria-invalid={datesInvalid || undefined} />}
            </Field>
            <Field label={t('partnerForm.f.commission')} hint={commissionInvalid ? <span className="text-danger-fg">{t('partnerForm.errors.invalidCommission')}</span> : t('partnerForm.f.commissionHint')}>
              {(id) => <input id={id} className="input tabular-nums" inputMode="decimal" placeholder="150.00" value={f.commission} onChange={(e) => set('commission', e.target.value)} aria-invalid={commissionInvalid || undefined} />}
            </Field>
            {text('currency', t('partnerForm.f.currency'), { max: 3, inputClass: 'uppercase' })}
          </Section>

          <Section
            id={`${uid}-custom`}
            icon={SlidersHorizontal}
            title={t('partnerForm.sections.custom')}
            aside={
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-muted">{t('partnerForm.custom.defined')}</p>
                {isAdmin && (
                  <button type="button" className="btn-secondary btn-sm ml-auto" onClick={() => setManaging(true)}>
                    <Settings2 className="size-3.5" aria-hidden /> {t('partnerForm.custom.manage')}
                  </button>
                )}
              </div>
            }
          >
            {defs.isLoading ? (
              <Spinner className="size-4" />
            ) : fields.length === 0 ? (
              <p className="text-sm text-muted sm:col-span-2">{t('partnerForm.custom.noFields')}</p>
            ) : (
              fields.map((d) => <CustomInput key={d.id} def={d} value={f.customData[d.id]} onChange={(v) => set('customData', { ...f.customData, [d.id]: v })} />)
            )}
            <div className="border-t border-line pt-4 sm:col-span-2">
              <p className="text-xs font-semibold text-muted">{t('partnerForm.custom.extraTitle')}</p>
              <p className="mb-2 text-xs text-muted">{t('partnerForm.custom.extraHint')}</p>
              <ul className="space-y-2">
                {f.extraFields.map((r, i) => (
                  <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]">
                    <input
                      className="input"
                      maxLength={80}
                      placeholder={t('partnerForm.custom.extraLabel')}
                      aria-label={t('partnerForm.custom.extraLabel')}
                      aria-invalid={(!r.label.trim() && !!r.value.trim()) || undefined}
                      value={r.label}
                      onChange={(e) => set('extraFields', f.extraFields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    />
                    <input
                      className="input col-span-1 row-start-2 sm:row-start-auto"
                      maxLength={2000}
                      placeholder={t('partnerForm.custom.extraValue')}
                      aria-label={r.label.trim() || t('partnerForm.custom.extraValue')}
                      value={r.value}
                      onChange={(e) => set('extraFields', f.extraFields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                    />
                    <button type="button" className="btn-secondary btn-sm self-center text-danger-fg" aria-label={t('partnerForm.custom.remove')} title={t('partnerForm.custom.remove')} onClick={() => set('extraFields', f.extraFields.filter((_, j) => j !== i))}>
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn-secondary btn-sm mt-2"
                disabled={f.extraFields.length >= 30}
                onClick={() => set('extraFields', [...f.extraFields, { key: ++rowKey, label: '', value: '' }])}
              >
                <Plus className="size-3.5" aria-hidden /> {t('partnerForm.custom.addField')}
              </button>
            </div>
          </Section>
        </div>
      </Modal>
      {isAdmin && <PartnerFieldsManager open={managing} onClose={() => setManaging(false)} />}
    </>
  );
};
