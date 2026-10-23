import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Tabs } from '@/components/ui/Tabs';
import { Check, Eye, Megaphone, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Markdown } from '@/components/ops/Markdown';
import type { Announcement } from './api';
import { useWorkspaceInvalidate } from './api';
import { Card, Chip, Empty, Field, IconButton, Modal, Skeleton, Toggle, errorText, fmtDay, fullName } from './ui';

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Create / edit dialog with a Markdown preview tab. */
export const AnnouncementDialog = ({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Announcement | null }) => {
  const { t } = useTranslation();
  const inv = useWorkspaceInvalidate();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? '');
    setBody(editing?.body ?? '');
    setPinned(editing?.pinned ?? false);
    setExpiresAt(toLocalInput(editing?.expiresAt ?? null));
    setTab('write');
    setBusy(false);
  }, [open, editing]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    try {
      const payload = { title: title.trim(), body, pinned, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null };
      if (editing) await api.patch(`/workspace/announcements/${editing.id}`, payload);
      else await api.post('/workspace/announcements', payload);
      toast.success(editing ? t('ws.common.saved') : t('ws.ann.published'));
      inv.announcements();
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
      title={editing ? t('ws.ann.edit') : t('ws.ann.new')}
      as="form"
      onSubmit={submit}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary btn-sm" disabled={busy}>
            {t('ws.common.cancel')}
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={busy || !title.trim() || !body.trim()}>
            {editing ? t('ws.common.save') : t('ws.ann.publish')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('ws.ann.fields.title')}>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={t('ws.ann.ph.title')} className="input" required />
        </Field>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label mb-0">{t('ws.ann.fields.body')}</span>
            <Tabs
              variant="pills"
              label={t('ws.ann.fields.body')}
              items={(['write', 'preview'] as const).map((k) => ({ key: k, label: k === 'write' ? t('ws.ann.write') : t('ws.ann.preview') }))}
              value={tab}
              onChange={setTab}
            />
          </div>
          {tab === 'write' ? (
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={20000} placeholder={t('ws.ann.ph.body')} className="input resize-y font-mono text-[0.8rem] leading-relaxed" required />
          ) : (
            <div className="min-h-40 rounded-lg border border-line bg-surface px-4 py-3 text-sm">{body.trim() ? <Markdown source={body} /> : <p className="text-muted">{t('ws.ann.previewEmpty')}</p>}</div>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('ws.ann.fields.expiresAt')} hint={t('ws.common.optional')}>
            <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="input" />
          </Field>
          <div className="flex items-end pb-2.5">
            <Toggle checked={pinned} onChange={setPinned} label={t('ws.ann.fields.pinned')} />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export const AnnouncementItem = ({ a, highlight, onEdit }: { a: Announcement; highlight?: boolean; onEdit?: (a: Announcement) => void }) => {
  const { t } = useTranslation();
  const inv = useWorkspaceInvalidate();
  const [busy, setBusy] = useState(false);
  const markRead = async () => {
    setBusy(true);
    try {
      await api.post(`/workspace/announcements/${a.id}/read`);
      inv.announcements();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    // TODO(ui): ConfirmDialog
    if (!window.confirm(t('ws.common.confirmDelete'))) return;
    try {
      await api.delete(`/workspace/announcements/${a.id}`);
      toast.success(t('ws.ann.deleted'));
      inv.announcements();
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  return (
    <article id={`announcement-${a.id}`} className={clsx('rounded-xl border px-4 py-3 transition', a.read ? 'border-line bg-card' : 'border-brand-200 bg-brand-50/60', highlight && 'ring-2 ring-brand-500/40')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {a.pinned && (
              <Chip tone="brand">
                <Pin className="size-3" /> {t('ws.ann.pinned')}
              </Chip>
            )}
            {a.expired && <Chip tone="muted">{t('ws.ann.expired')}</Chip>}
            {!a.read && <span className="size-2 rounded-full bg-brand-600" aria-hidden />}
            <h3 className="min-w-0 truncate text-sm font-bold text-ink">{a.title}</h3>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {t('ws.ann.by', { name: fullName(a.author), date: fmtDay(a.publishedAt) })}
            {a.expiresAt && !a.expired && <> · {t('ws.ann.expires', { date: fmtDay(a.expiresAt) })}</>}
            {a.readCount !== undefined && (
              <>
                {' '}
                · <Eye className="inline size-3 align-[-2px]" aria-hidden /> {t('ws.ann.readBy', { count: a.readCount })}
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {!a.read && (
            <button type="button" onClick={() => void markRead()} disabled={busy} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-700 hover:bg-brand-100">
              <Check className="size-3.5" /> {t('ws.ann.markRead')}
            </button>
          )}
          {a.canEdit && onEdit && <IconButton icon={Pencil} label={t('ws.common.edit')} onClick={() => onEdit(a)} />}
          {a.canEdit && <IconButton icon={Trash2} label={t('ws.common.delete')} onClick={() => void remove()} danger />}
        </div>
      </div>
      <div className="mt-2 text-sm text-ink/90 [&_p]:mb-2 [&_p:last-child]:mb-0">
        <Markdown source={a.body} />
      </div>
    </article>
  );
};

export const AnnouncementsCard = ({ items, loading, unread, isAdmin, highlightId }: { items: Announcement[] | undefined; loading: boolean; unread: number; isAdmin: boolean; highlightId?: string | null }) => {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<{ open: boolean; editing: Announcement | null }>({ open: false, editing: null });
  useEffect(() => {
    if (highlightId) document.getElementById(`announcement-${highlightId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlightId, items]);
  return (
    <Card
      icon={Megaphone}
      title={
        <>
          {t('ws.ann.title')}
          {unread > 0 && <Chip tone="brand">{t('ws.ann.unread', { count: unread })}</Chip>}
        </>
      }
      actions={
        isAdmin && (
          <button type="button" onClick={() => setDialog({ open: true, editing: null })} className="btn-primary btn-sm h-8 px-3">
            <Plus className="size-4" /> {t('ws.ann.new')}
          </button>
        )
      }
      bodyClassName="space-y-3"
    >
      {loading ? (
        <>
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </>
      ) : !items?.length ? (
        <Empty icon={Megaphone}>{t('ws.ann.empty')}</Empty>
      ) : (
        items.map((a) => <AnnouncementItem key={a.id} a={a} highlight={a.id === highlightId} onEdit={(x) => setDialog({ open: true, editing: x })} />)
      )}
      <AnnouncementDialog open={dialog.open} editing={dialog.editing} onClose={() => setDialog((d) => ({ ...d, open: false }))} />
    </Card>
  );
};
