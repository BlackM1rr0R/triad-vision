import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Briefcase, Building2, Contact as ContactIcon, Download, Globe, Lock, Mail, MapPin, MessageSquare, Pencil, Phone, Tag, Trash2, UserCheck, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ContactInput } from './api';
import { useContact, useWorkspaceInvalidate } from './api';
import { ContactFields, inputFrom } from './ContactForm';
import { Avatar, Chip, IconButton, Skeleton, errorText, fmtDay, fmtDateTime, fullName } from './ui';
import { downloadVCard } from './vcard';

const Row = ({ icon: Icon, label, children }: { icon: typeof Mail; label: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-3 py-2">
    <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
    <div className="min-w-0 flex-1">
      <p className="text-[0.68rem] font-semibold tracking-wide text-muted uppercase">{label}</p>
      <div className="text-sm text-ink break-words">{children}</div>
    </div>
  </div>
);

/** Right-hand detail drawer with inline editing, activity and quick actions. */
export const ContactDrawer = ({ id, onClose, onDeleted }: { id: string | null; onClose: () => void; onDeleted?: () => void }) => {
  const { t } = useTranslation();
  const inv = useWorkspaceInvalidate();
  const q = useContact(id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ContactInput | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEditing(false);
    setDraft(null);
  }, [id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && id && !busy) (editing ? setEditing(false) : onClose());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [id, editing, busy, onClose]);

  const c = q.data?.contact;
  const startEdit = () => {
    if (!c) return;
    setDraft(inputFrom(c));
    setEditing(true);
  };
  const save = async () => {
    if (!c || !draft || !draft.firstName.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/contacts/${c.id}`, draft);
      toast.success(t('ws.contacts.saved'));
      inv.contacts();
      setEditing(false);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    // TODO(ui): ConfirmDialog
    if (!c || !window.confirm(t('ws.common.confirmDelete'))) return;
    setBusy(true);
    try {
      await api.delete(`/contacts/${c.id}`);
      toast.success(t('ws.contacts.deleted'));
      inv.contacts();
      onDeleted?.();
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const touch = async () => {
    if (!c) return;
    try {
      await api.patch(`/contacts/${c.id}/touch`);
      inv.contacts();
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  const isStaffUser = q.data?.user && ['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(q.data.user.role);

  return (
    <AnimatePresence>
      {id && (
        <motion.aside
          key={id}
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-y-0 right-0 z-30 flex w-full max-w-xl flex-col border-l border-line bg-card shadow-[var(--tv-shadow-raised)]"
          aria-label={c ? fullName(c) : t('ws.contacts.title')}
        >
          <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              {c ? <Avatar id={c.id} person={c} size="lg" /> : <Skeleton className="size-12 rounded-full" />}
              <div className="min-w-0">
                <h2 className="truncate font-display text-base font-bold text-ink">{c ? fullName(c) : t('ws.common.loading')}</h2>
                {c && (
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    {c.position && <span>{c.position}</span>}
                    {c.position && c.company && <span>·</span>}
                    {c.company && <span>{c.company}</span>}
                    {!c.shared && (
                      <Chip tone="muted" className="text-[0.65rem]">
                        <Lock className="size-3" /> {t('ws.contacts.drawer.privateHint')}
                      </Chip>
                    )}
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {c?.canEdit && !editing && <IconButton icon={Pencil} label={t('ws.common.edit')} onClick={startEdit} />}
              {c?.canDelete && !editing && <IconButton icon={Trash2} label={t('ws.common.delete')} onClick={() => void remove()} danger />}
              <IconButton icon={X} label={t('ws.common.close')} onClick={onClose} />
            </div>
          </header>

          {c && !editing && (
            <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
              {c.email && (
                <Link to={`/workspace/mail?compose=${encodeURIComponent(c.email)}`} onClick={() => void touch()} className="btn-primary btn-sm h-8 px-3">
                  <Mail className="size-4" /> {t('ws.contacts.actions.sendEmail')}
                </Link>
              )}
              {isStaffUser && q.data?.user && (
                <Link to={`/workspace/chat?dm=${q.data.user.id}`} className="btn-secondary btn-sm h-8 border border-line px-3">
                  <MessageSquare className="size-4" /> {t('ws.contacts.actions.startChat')}
                </Link>
              )}
              {c.phone && (
                <a href={`tel:${c.phone.replace(/\s+/g, '')}`} className="btn-secondary btn-sm h-8 border border-line px-3">
                  <Phone className="size-4" /> {t('ws.contacts.actions.call')}
                </a>
              )}
              <button type="button" onClick={() => downloadVCard(c)} className="btn-secondary btn-sm h-8 border border-line px-3">
                <Download className="size-4" /> {t('ws.contacts.actions.vcard')}
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {q.isLoading || !c ? (
              <div className="space-y-3">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-24" />
              </div>
            ) : editing && draft ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
                className="space-y-4"
              >
                <ContactFields value={draft} onChange={setDraft} autoFocus canToggleShared={c.canDelete} />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditing(false)} className="btn-secondary btn-sm" disabled={busy}>
                    {t('ws.common.cancel')}
                  </button>
                  <button type="submit" className="btn-primary btn-sm" disabled={busy || !draft.firstName.trim()}>
                    {t('ws.common.save')}
                  </button>
                </div>
              </form>
            ) : (
              <div className="divide-y divide-line">
                {(c.email || c.emails.length > 0) && (
                  <Row icon={Mail} label={t('ws.contacts.fields.email')}>
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="text-link hover:underline">
                        {c.email}
                      </a>
                    )}
                    {c.emails.map((e) => (
                      <a key={e} href={`mailto:${e}`} className="block text-muted hover:underline">
                        {e}
                      </a>
                    ))}
                  </Row>
                )}
                {c.phone && (
                  <Row icon={Phone} label={t('ws.contacts.fields.phone')}>
                    {c.phone}
                  </Row>
                )}
                {(c.company || q.data?.companyRef) && (
                  <Row icon={Building2} label={t('ws.contacts.fields.company')}>
                    {c.company}
                    {q.data?.companyRef && (
                      <Link to={`/admin/companies/${q.data.companyRef.id}`} className="ml-2 text-xs font-semibold text-link hover:underline">
                        {t('ws.common.openIn')}
                      </Link>
                    )}
                  </Row>
                )}
                {c.position && (
                  <Row icon={Briefcase} label={t('ws.contacts.fields.position')}>
                    {c.position}
                  </Row>
                )}
                {c.address && (
                  <Row icon={MapPin} label={t('ws.contacts.fields.address')}>
                    {c.address}
                  </Row>
                )}
                {c.tags.length > 0 && (
                  <Row icon={Tag} label={t('ws.contacts.fields.tags')}>
                    <span className="flex flex-wrap gap-1">
                      {c.tags.map((tag) => (
                        <Chip key={tag}>{tag}</Chip>
                      ))}
                    </span>
                  </Row>
                )}
                {c.notes && (
                  <Row icon={ContactIcon} label={t('ws.contacts.fields.notes')}>
                    <p className="whitespace-pre-wrap">{c.notes}</p>
                  </Row>
                )}
                <Row icon={Globe} label={t('ws.contacts.fields.source')}>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Chip tone="muted">{t(`ws.contacts.source.${c.source}`)}</Chip>
                    <span>
                      {t('ws.contacts.fields.created')}: {fmtDay(c.createdAt)}
                    </span>
                    <span>
                      · {t('ws.contacts.fields.lastContact')}: {c.lastContactAt ? fmtDateTime(c.lastContactAt) : t('ws.common.none')}
                    </span>
                    <button type="button" onClick={() => void touch()} className="font-semibold text-link hover:underline">
                      {t('ws.contacts.actions.touch')}
                    </button>
                  </span>
                </Row>

                <div className="py-3">
                  <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{t('ws.contacts.drawer.activity')}</h3>
                  {q.data?.user ? (
                    <div className="space-y-2">
                      <p className="flex items-center gap-2 text-sm text-ink">
                        <UserCheck className="size-4 text-success-fg" aria-hidden />
                        {t('ws.contacts.drawer.linkedUser')}: <span className="font-semibold">{fullName(q.data.user)}</span>
                        <Chip tone="muted" className="text-[0.65rem]">
                          {q.data.user.role}
                        </Chip>
                      </p>
                      {q.data.cases.length > 0 && (
                        <ul className="divide-y divide-line rounded-lg border border-line">
                          {q.data.cases.map((k) => (
                            <li key={k.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                              <span className="code-id text-xs font-medium text-muted">{k.number}</span>
                              <span className="min-w-0 flex-1 truncate text-ink">{k.profession}</span>
                              <Chip tone="muted" className="text-[0.65rem]">
                                {k.status}
                              </Chip>
                              <Link to={`/admin/cases/${k.id}`} className="text-xs font-semibold text-link hover:underline">
                                {t('ws.contacts.drawer.openCase')}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <p className={clsx('text-sm text-muted')}>{t('ws.contacts.drawer.noActivity')}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
