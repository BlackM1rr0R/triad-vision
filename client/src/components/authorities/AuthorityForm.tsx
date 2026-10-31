import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { registerCopy } from '@/i18n';
import { pagesAuthorities } from '@/i18n/pagesAuthorities';
import { AUTHORITY_TYPES, type Authority, type AuthorityContact, type AuthorityType, type ChecklistItem } from './api';

registerCopy(pagesAuthorities);

export interface AuthorityDraft {
  type: AuthorityType;
  name: string;
  city: string;
  country: string;
  address: string;
  website: string;
  email: string;
  phone: string;
  openingHours: string;
  requirements: string;
  checklist: ChecklistItem[];
  notes: string;
  waitingDaysManual: string;
  aliases: string;
  active: boolean;
  contacts: { name: string; role: string; phone: string; email: string; note: string }[];
}

export const emptyAuthorityDraft = (type: AuthorityType = 'EMBASSY'): AuthorityDraft => ({
  type,
  name: '',
  city: '',
  country: type === 'EMBASSY' ? '' : 'Deutschland',
  address: '',
  website: '',
  email: '',
  phone: '',
  openingHours: '',
  requirements: '',
  checklist: [],
  notes: '',
  waitingDaysManual: '',
  aliases: '',
  active: true,
  contacts: [],
});

const s = (v: string | null | undefined) => v ?? '';

export const draftOf = (a: Authority): AuthorityDraft => ({
  type: a.type,
  name: a.name,
  city: s(a.city),
  country: s(a.country),
  address: s(a.address),
  website: s(a.website),
  email: s(a.email),
  phone: s(a.phone),
  openingHours: s(a.openingHours),
  requirements: s(a.requirements),
  checklist: a.checklist.map((c) => ({ ...c })),
  notes: s(a.notes),
  waitingDaysManual: a.waitingDaysManual === null ? '' : String(a.waitingDaysManual),
  aliases: s(a.aliases),
  active: a.active,
  contacts: a.contacts.map((c: AuthorityContact) => ({ name: c.name, role: s(c.role), phone: s(c.phone), email: s(c.email), note: s(c.note) })),
});

const orNull = (v: string) => (v.trim() ? v.trim() : null);

/** Request body of POST / PUT /api/admin/authorities. */
export const bodyOf = (d: AuthorityDraft) => ({
  type: d.type,
  name: d.name.trim(),
  city: orNull(d.city),
  country: orNull(d.country),
  address: orNull(d.address),
  website: orNull(d.website),
  email: orNull(d.email),
  phone: orNull(d.phone),
  openingHours: orNull(d.openingHours),
  requirements: orNull(d.requirements),
  checklist: d.checklist.filter((c) => c.label.trim()).map((c) => ({ label: c.label.trim(), required: c.required })),
  notes: orNull(d.notes),
  waitingDaysManual: d.waitingDaysManual.trim() === '' ? null : Math.max(0, Math.round(Number(d.waitingDaysManual) || 0)),
  aliases: orNull(d.aliases),
  active: d.active,
  contacts: d.contacts
    .filter((c) => c.name.trim())
    .map((c) => ({ name: c.name.trim(), role: orNull(c.role), phone: orNull(c.phone), email: orNull(c.email), note: orNull(c.note) })),
});

/** Create / edit dialog of an authority (ADMIN+): base data, requirements + checklist, waiting time, contact persons. */
export function AuthorityFormModal({
  open,
  initial,
  editing,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: AuthorityDraft;
  editing: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (d: AuthorityDraft) => void;
}) {
  const { t } = useTranslation();
  const [d, setDraft] = useState<AuthorityDraft>(initial);
  const set = (patch: Partial<AuthorityDraft>) => setDraft((x) => ({ ...x, ...patch }));
  const setItem = (i: number, patch: Partial<ChecklistItem>) => set({ checklist: d.checklist.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setContact = (i: number, patch: Partial<AuthorityDraft['contacts'][number]>) => set({ contacts: d.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(d);
  };
  const field = (key: 'name' | 'city' | 'country' | 'website' | 'email' | 'phone', opts: { type?: string; required?: boolean; max: number; className?: string }) => (
    <label className={opts.className ?? 'block'}>
      <span className="label">{t(`authorities.f.${key}`)}</span>
      <input
        className="input"
        type={opts.type ?? 'text'}
        required={opts.required}
        minLength={opts.required ? 2 : undefined}
        maxLength={opts.max}
        value={d[key]}
        onChange={(e) => set({ [key]: e.target.value } as Partial<AuthorityDraft>)}
      />
    </label>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('authorities.edit') : t('authorities.add')}
      size="xl"
      as="form"
      onSubmit={submit}
      busy={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">{t('authorities.f.type')}</span>
            <select className="input" value={d.type} onChange={(e) => set({ type: e.target.value as AuthorityType })}>
              {AUTHORITY_TYPES.map((k) => (
                <option key={k} value={k}>
                  {t(`authorities.types.${k}`)}
                </option>
              ))}
            </select>
          </label>
          {field('name', { required: true, max: 200 })}
          {field('city', { max: 120 })}
          {field('country', { max: 80 })}
          <label className="block sm:col-span-2">
            <span className="label">{t('authorities.f.address')}</span>
            <textarea className="input min-h-16" maxLength={2000} value={d.address} onChange={(e) => set({ address: e.target.value })} />
          </label>
          {field('website', { type: 'url', max: 300 })}
          {field('email', { type: 'email', max: 190 })}
          {field('phone', { type: 'tel', max: 60 })}
          <label className="block">
            <span className="label">{t('authorities.f.waitingDaysManual')}</span>
            <input className="input" type="number" min={0} max={3650} inputMode="numeric" value={d.waitingDaysManual} onChange={(e) => set({ waitingDaysManual: e.target.value })} />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">{t('authorities.f.openingHours')}</span>
            <textarea className="input min-h-16" maxLength={2000} value={d.openingHours} onChange={(e) => set({ openingHours: e.target.value })} />
          </label>
        </div>

        <label className="block">
          <span className="label">{t('authorities.f.requirements')}</span>
          <textarea className="input min-h-28" maxLength={20000} value={d.requirements} onChange={(e) => set({ requirements: e.target.value })} aria-describedby="authority-req-hint" />
          <span id="authority-req-hint" className="mt-1 block text-xs text-muted">
            {t('authorities.f.requirementsHint')}
          </span>
        </label>

        <fieldset className="space-y-2">
          <legend className="label">{t('authorities.f.checklist')}</legend>
          {d.checklist.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="input flex-1"
                aria-label={`${t('authorities.f.checklistLabel')} ${i + 1}`}
                maxLength={200}
                value={c.label}
                onChange={(e) => setItem(i, { label: e.target.value })}
              />
              <label className="inline-flex shrink-0 items-center gap-1.5 text-xs text-ink">
                <input type="checkbox" checked={c.required} onChange={(e) => setItem(i, { required: e.target.checked })} />
                {t('authorities.f.required')}
              </label>
              <IconButton icon={Trash2} size="sm" variant="danger" label={`${t('authorities.f.remove')}: ${c.label || i + 1}`} onClick={() => set({ checklist: d.checklist.filter((_, j) => j !== i) })} />
            </div>
          ))}
          {d.checklist.length < 60 && (
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => set({ checklist: [...d.checklist, { label: '', required: true }] })}>
              {t('authorities.f.checklistAdd')}
            </Button>
          )}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="label">{t('authorities.f.contacts')}</legend>
          <p className="text-xs text-muted">{t('authorities.f.contactsHint')}</p>
          {d.contacts.map((c, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <input className="input" required maxLength={160} placeholder={t('authorities.f.contactName')} aria-label={t('authorities.f.contactName')} value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} />
              <input className="input" maxLength={120} placeholder={t('authorities.f.contactRole')} aria-label={t('authorities.f.contactRole')} value={c.role} onChange={(e) => setContact(i, { role: e.target.value })} />
              <input className="input" type="tel" maxLength={60} placeholder={t('authorities.f.contactPhone')} aria-label={t('authorities.f.contactPhone')} value={c.phone} onChange={(e) => setContact(i, { phone: e.target.value })} />
              <input className="input" type="email" maxLength={190} placeholder={t('authorities.f.contactEmail')} aria-label={t('authorities.f.contactEmail')} value={c.email} onChange={(e) => setContact(i, { email: e.target.value })} />
              <IconButton icon={Trash2} size="sm" variant="danger" label={`${t('authorities.f.remove')}: ${c.name || i + 1}`} onClick={() => set({ contacts: d.contacts.filter((_, j) => j !== i) })} />
              <input className="input sm:col-span-5" maxLength={500} placeholder={t('authorities.f.contactNote')} aria-label={t('authorities.f.contactNote')} value={c.note} onChange={(e) => setContact(i, { note: e.target.value })} />
            </div>
          ))}
          {d.contacts.length < 30 && (
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => set({ contacts: [...d.contacts, { name: '', role: '', phone: '', email: '', note: '' }] })}>
              {t('authorities.f.contactAdd')}
            </Button>
          )}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">{t('authorities.f.notes')}</span>
            <textarea className="input min-h-20" maxLength={20000} value={d.notes} onChange={(e) => set({ notes: e.target.value })} aria-describedby="authority-notes-hint" />
            <span id="authority-notes-hint" className="mt-1 block text-xs text-muted">
              {t('authorities.f.notesHint')}
            </span>
          </label>
          <label className="block">
            <span className="label">{t('authorities.f.aliases')}</span>
            <textarea className="input min-h-20" maxLength={2000} value={d.aliases} onChange={(e) => set({ aliases: e.target.value })} aria-describedby="authority-aliases-hint" />
            <span id="authority-aliases-hint" className="mt-1 block text-xs text-muted">
              {t('authorities.f.aliasesHint')}
            </span>
          </label>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={d.active} onChange={(e) => set({ active: e.target.checked })} />
          {t('authorities.f.active')}
        </label>
      </div>
    </Modal>
  );
}
