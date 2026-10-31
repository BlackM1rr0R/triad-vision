import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Mail, Pencil, Phone, Plus, Star, Trash2, UsersRound } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPartnerRecords } from '@/i18n/pagesPartnerRecords';
import { Button, IconButton, Modal, Spinner, confirmDialog } from '@/components/ui';
import { Panel } from '@/components/admin/ui';
import { contactsApi, useContacts, useRecordsMutation, type ContactInput, type PartnerContact, type PartnerOwner } from './api';

registerCopy(pagesPartnerRecords);

/**
 * Contact persons of an employer / referral partner (generic `owner`): cards with the primary contact starred
 * first; add / edit in a dialog, "make primary" (only one per owner — the server clears the others), delete.
 */
export interface ContactsPanelProps {
  owner: PartnerOwner;
  className?: string;
  title?: string;
}

const emptyForm = (c?: PartnerContact | null) => ({
  firstName: c?.firstName ?? '',
  lastName: c?.lastName ?? '',
  position: c?.position ?? '',
  email: c?.email ?? '',
  phone: c?.phone ?? '',
  notes: c?.notes ?? '',
  isPrimary: c?.isPrimary ?? false,
});

export function ContactsPanel({ owner, className, title }: ContactsPanelProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useContacts(owner);
  const [editing, setEditing] = useState<PartnerContact | 'new' | null>(null);
  const primary = useRecordsMutation(owner, (id: string) => contactsApi.update(id, { isPrimary: true }), { success: t('partnerRecords.common.saved') });
  const remove = useRecordsMutation(owner, (id: string) => contactsApi.remove(id), { success: t('partnerRecords.common.deleted') });

  return (
    <Panel
      title={title ?? t('partnerRecords.contacts.title')}
      icon={UsersRound}
      className={className}
      actions={
        <Button size="sm" icon={Plus} onClick={() => setEditing('new')}>
          {t('partnerRecords.contacts.add')}
        </Button>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner className="size-5 text-link" />
        </div>
      ) : !data?.length ? (
        <p className="py-4 text-center text-sm text-muted">{t('partnerRecords.contacts.empty')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => (
            <li key={c.id} className={clsx('flex flex-col rounded-lg border p-3', c.isPrimary ? 'border-highlight/60 bg-highlight-bg/30' : 'border-line bg-card')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold text-ink">
                    {c.isPrimary && <Star className="size-4 shrink-0 fill-highlight text-highlight" aria-label={t('partnerRecords.contacts.primary')} />}
                    <span className="truncate">{c.name}</span>
                  </p>
                  {c.position && <p className="truncate text-xs text-muted">{c.position}</p>}
                </div>
                <span className="flex shrink-0 gap-0.5">
                  <IconButton icon={Pencil} size="sm" label={t('partnerRecords.common.edit')} onClick={() => setEditing(c)} />
                  <IconButton
                    icon={Trash2}
                    size="sm"
                    label={t('partnerRecords.common.delete')}
                    onClick={async () => {
                      if (await confirmDialog({ title: t('partnerRecords.contacts.deleteTitle'), message: t('partnerRecords.contacts.deleteText', { name: c.name }) })) remove.mutate(c.id);
                    }}
                  />
                </span>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 break-all text-link hover:underline">
                    <Mail className="size-3.5 shrink-0" aria-hidden /> {c.email}
                  </a>
                )}
                {c.phone && (
                  <a href={`tel:${c.phone.replace(/\s+/g, '')}`} className="flex items-center gap-1.5 text-link hover:underline">
                    <Phone className="size-3.5 shrink-0" aria-hidden /> {c.phone}
                  </a>
                )}
                {c.notes && <p className="line-clamp-3 whitespace-pre-wrap text-muted">{c.notes}</p>}
              </div>
              {!c.isPrimary && (
                <button type="button" className="mt-auto inline-flex items-center gap-1 self-start pt-2 text-xs font-medium text-muted hover:text-link" disabled={primary.isPending} onClick={() => primary.mutate(c.id)}>
                  <Star className="size-3.5" aria-hidden /> {t('partnerRecords.contacts.makePrimary')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ContactDialog owner={owner} contact={editing} onClose={() => setEditing(null)} />
    </Panel>
  );
}

const ContactDialog = ({ owner, contact, onClose }: { owner: PartnerOwner; contact: PartnerContact | 'new' | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const existing = contact && contact !== 'new' ? contact : null;
  const [f, setF] = useState(emptyForm(existing));
  useEffect(() => {
    if (contact) setF(emptyForm(existing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact]);
  const save = useRecordsMutation(
    owner,
    () => {
      const body: ContactInput = {
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim() || null,
        position: f.position.trim() || null,
        email: f.email.trim().toLowerCase() || null,
        phone: f.phone.trim() || null,
        notes: f.notes.trim() || null,
        isPrimary: f.isPrimary,
      };
      return existing ? contactsApi.update(existing.id, body) : contactsApi.create(owner, body);
    },
    { success: existing ? t('partnerRecords.common.saved') : t('partnerRecords.contacts.created'), onSuccess: onClose },
  );
  const L = (k: string) => t(`partnerRecords.fields.${k}`);
  const input = (k: 'firstName' | 'lastName' | 'position' | 'email' | 'phone', opts: { type?: string; max: number; required?: boolean }) => (
    <div>
      <label className="label" htmlFor={`pcn-${k}`}>
        {L(k)}
      </label>
      <input id={`pcn-${k}`} className="input" type={opts.type ?? 'text'} required={opts.required} maxLength={opts.max} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );
  return (
    <Modal
      open={!!contact}
      onClose={onClose}
      title={existing ? t('partnerRecords.contacts.editTitle') : t('partnerRecords.contacts.newTitle')}
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
      busy={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('partnerRecords.common.cancel')}
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!f.firstName.trim()}>
            {t('partnerRecords.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {input('firstName', { max: 80, required: true })}
        {input('lastName', { max: 80 })}
        {input('position', { max: 120 })}
        {input('phone', { type: 'tel', max: 40 })}
        <div className="sm:col-span-2">{input('email', { type: 'email', max: 190 })}</div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="pcn-notes">
            {L('notes')}
          </label>
          <textarea id="pcn-notes" className="input min-h-16" maxLength={5000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={f.isPrimary} onChange={(e) => setF({ ...f, isPrimary: e.target.checked })} />
          <Star className="size-4 text-highlight" aria-hidden /> {L('isPrimary')}
        </label>
      </div>
    </Modal>
  );
};

export default ContactsPanel;
