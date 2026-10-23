import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Contact, ContactInput } from './api';
import { useWorkspaceInvalidate } from './api';
import { Field, Modal, Toggle, errorText } from './ui';

const splitList = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

export const emptyInput = (): ContactInput => ({ firstName: '', lastName: null, email: null, emails: [], phone: null, company: null, position: null, address: null, notes: null, tags: [], shared: true });
export const inputFrom = (c: Contact): ContactInput => ({ firstName: c.firstName, lastName: c.lastName, email: c.email, emails: c.emails, phone: c.phone, company: c.company, position: c.position, address: c.address, notes: c.notes, tags: c.tags, shared: c.shared });

/** Field set shared by the "new contact" dialog and the drawer's edit mode. */
export const ContactFields = ({ value, onChange, autoFocus = false, canToggleShared = true }: { value: ContactInput; onChange: (v: ContactInput) => void; autoFocus?: boolean; canToggleShared?: boolean }) => {
  const { t } = useTranslation();
  const [emails, setEmails] = useState(value.emails.join(', '));
  const [tags, setTags] = useState(value.tags.join(', '));
  useEffect(() => setEmails(value.emails.join(', ')), [value.emails]);
  useEffect(() => setTags(value.tags.join(', ')), [value.tags]);
  const text = (k: keyof ContactInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [k]: e.target.value || null });
  return (
    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
      <Field label={t('ws.contacts.fields.firstName')}>
        <input autoFocus={autoFocus} value={value.firstName} onChange={(e) => onChange({ ...value, firstName: e.target.value })} maxLength={80} className="input" required />
      </Field>
      <Field label={t('ws.contacts.fields.lastName')}>
        <input value={value.lastName ?? ''} onChange={text('lastName')} maxLength={80} className="input" />
      </Field>
      <Field label={t('ws.contacts.fields.email')}>
        <input type="email" value={value.email ?? ''} onChange={text('email')} maxLength={190} className="input" />
      </Field>
      <Field label={t('ws.contacts.fields.phone')}>
        <input type="tel" value={value.phone ?? ''} onChange={text('phone')} maxLength={40} className="input" />
      </Field>
      <Field label={t('ws.contacts.fields.emails')} hint={t('ws.contacts.ph.emails')}>
        <input value={emails} onChange={(e) => setEmails(e.target.value)} onBlur={() => onChange({ ...value, emails: splitList(emails) })} className="input" />
      </Field>
      <Field label={t('ws.contacts.fields.tags')} hint={t('ws.contacts.ph.tags')}>
        <input value={tags} onChange={(e) => setTags(e.target.value)} onBlur={() => onChange({ ...value, tags: splitList(tags) })} className="input" />
      </Field>
      <Field label={t('ws.contacts.fields.company')}>
        <input value={value.company ?? ''} onChange={text('company')} maxLength={120} className="input" />
      </Field>
      <Field label={t('ws.contacts.fields.position')}>
        <input value={value.position ?? ''} onChange={text('position')} maxLength={120} className="input" />
      </Field>
      <Field label={t('ws.contacts.fields.address')} className="sm:col-span-2">
        <input value={value.address ?? ''} onChange={text('address')} maxLength={255} className="input" />
      </Field>
      <Field label={t('ws.contacts.fields.notes')} className="sm:col-span-2">
        <textarea value={value.notes ?? ''} onChange={text('notes')} rows={3} maxLength={5000} placeholder={t('ws.contacts.ph.notes')} className="input resize-y" />
      </Field>
      {canToggleShared && (
        <div className="sm:col-span-2">
          <Toggle checked={value.shared} onChange={(shared) => onChange({ ...value, shared })} label={t('ws.contacts.fields.shared')} />
        </div>
      )}
    </div>
  );
};

export const NewContactDialog = ({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (c: Contact) => void }) => {
  const { t } = useTranslation();
  const inv = useWorkspaceInvalidate();
  const [value, setValue] = useState<ContactInput>(emptyInput);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setValue(emptyInput());
      setBusy(false);
    }
  }, [open]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.firstName.trim() || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ contact: Contact }>('/contacts', value);
      toast.success(t('ws.contacts.created'));
      inv.contacts();
      onCreated?.(data.contact);
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('ws.contacts.new')}
      as="form"
      onSubmit={submit}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary btn-sm" disabled={busy}>
            {t('ws.common.cancel')}
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={busy || !value.firstName.trim()}>
            {t('ws.common.save')}
          </button>
        </>
      }
    >
      <ContactFields value={value} onChange={setValue} autoFocus />
    </Modal>
  );
};
