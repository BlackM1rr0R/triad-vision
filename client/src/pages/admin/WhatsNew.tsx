import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight, CheckCheck, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesStaffOnboarding } from '@/i18n/pagesStaffOnboarding';
import { pagesStaffPower } from '@/i18n/pagesStaffPower';
import { ErrorBlock, ListSkeleton, PageHead, Panel } from '@/components/admin/ui';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { fmtDate, toastError } from '@/components/admin/labels';
import { whatsNewFeedKey, whatsNewManageKey, type ManagedEntry, type Text4, type WhatsNewFeedV2 } from '@/components/staffOnboarding/api';
import { useWhatsNewText } from '@/components/staffOnboarding/WhatsNewLoginModal';

registerCopy(pagesStaffOnboarding);
registerCopy(pagesStaffPower);

const LANGS = ['az', 'ru', 'en', 'de'] as const;
const ROLES = ['STAFF', 'ADMIN', 'SUPER_ADMIN'] as const;

interface Draft {
  id: string | null;
  date: string;
  title: Required<Text4>;
  body: Required<Text4>;
  roles: string[];
  link: string;
}
const emptyText = (): Required<Text4> => ({ az: '', ru: '', en: '', de: '' });
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Admin → Yeniliklər (/admin/whats-new, STAFF+): every release note for the viewer's role with the unseen ones
 * marked, "mark all as read"; ADMIN+ also manage the list: hide code entries, add / edit / delete their own
 * (server lib/whatsNew).
 */
export default function AdminWhatsNew() {
  const { t } = useTranslation();
  usePageTitle(t('sob.whatsNew.title'));
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const qc = useQueryClient();
  const text = useWhatsNewText();
  const [filter, setFilter] = useState<'all' | 'unseen'>('all');
  const feed = useQuery({ queryKey: whatsNewFeedKey, queryFn: async () => (await api.get<WhatsNewFeedV2>('/admin/whats-new')).data });
  const seenAll = useMutation({
    mutationFn: async () => (await api.post<WhatsNewFeedV2>('/admin/whats-new/seen', { all: true })).data,
    onSuccess: (f) => qc.setQueryData(whatsNewFeedKey, f),
    onError: (e) => toastError(e, t('sob.error')),
  });
  const seenOne = useMutation({
    mutationFn: async (id: string) => (await api.post<WhatsNewFeedV2>('/admin/whats-new/seen', { ids: [id] })).data,
    onSuccess: (f) => qc.setQueryData(whatsNewFeedKey, f),
  });

  if (feed.isLoading) return <ListSkeleton rows={6} cols={2} />;
  if (feed.error || !feed.data) return <ErrorBlock error={feed.error} onRetry={() => feed.refetch()} />;
  const items = feed.data.items.filter((i) => !!text(i).title && (filter === 'all' || !i.seen));

  return (
    <div className="space-y-6">
      <PageHead
        title={t('sob.whatsNew.title')}
        subtitle={t('sob.whatsNew.subtitle')}
        actions={
          feed.data.unseen > 0 ? (
            <button type="button" className="btn-secondary btn-sm" onClick={() => seenAll.mutate()} disabled={seenAll.isPending}>
              <CheckCheck className="size-3.5" aria-hidden /> {t('sob.whatsNew.markAllRead')}
            </button>
          ) : undefined
        }
      />

      <div role="group" aria-label={t('sob.whatsNew.title')} className="inline-flex rounded-lg border border-line bg-card p-0.5">
        {(['all', 'unseen'] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={clsx('min-h-9 rounded-md px-3 text-sm font-medium transition', filter === f ? 'bg-primary text-primary-contrast' : 'text-muted hover:text-ink')}
          >
            {f === 'all' ? t('sob.whatsNew.filterAll') : `${t('sob.whatsNew.filterUnseen')} (${feed.data!.unseen})`}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-line bg-card px-4 py-10 text-center text-sm text-muted">{filter === 'unseen' ? t('sob.whatsNew.allRead') : t('sob.whatsNew.empty')}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((n) => {
            const { title, body } = text(n);
            return (
              <li key={n.id} className={clsx('flex flex-col rounded-xl border bg-card p-4', n.seen ? 'border-line' : 'border-primary/40')}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-semibold text-ink">{title}</h2>
                  {!n.seen && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-contrast">{t('sob.whatsNew.fresh')}</span>}
                </div>
                <p className="mt-1.5 flex-1 text-sm whitespace-pre-line text-muted">{body}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="num text-xs text-muted">{fmtDate(n.date)}</span>
                  <div className="flex items-center gap-2">
                    {!n.seen && (
                      <button type="button" className="text-xs font-medium text-muted hover:text-ink" onClick={() => seenOne.mutate(n.id)}>
                        {t('sob.whatsNew.gotIt')}
                      </button>
                    )}
                    {n.link && (
                      <Link to={n.link} onClick={() => !n.seen && seenOne.mutate(n.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline">
                        {t('sob.whatsNew.open')} <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isAdmin && <ManageEntries />}
    </div>
  );
}

/** ADMIN+: hide / show code entries, add / edit / delete own entries. */
const ManageEntries = () => {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const text = useWhatsNewText();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<ManagedEntry | null>(null);
  const list = useQuery({ queryKey: whatsNewManageKey, queryFn: async () => (await api.get<{ entries: ManagedEntry[] }>('/admin/whats-new/manage')).data });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: whatsNewManageKey });
    void qc.invalidateQueries({ queryKey: whatsNewFeedKey });
  };
  const hide = useMutation({
    mutationFn: async (p: { id: string; hidden: boolean }) => api.post(`/admin/whats-new/entries/${encodeURIComponent(p.id)}/hidden`, { hidden: p.hidden }),
    onSuccess: refresh,
    onError: (e) => toastError(e, t('sob.error')),
  });
  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = { date: d.date, title: d.title, body: d.body, roles: d.roles, link: d.link.trim() || null };
      return d.id ? api.patch(`/admin/whats-new/entries/${d.id}`, body) : api.post('/admin/whats-new/entries', body);
    },
    onSuccess: () => {
      toast.success(t('sob.whatsNew.manage.saved'));
      setDraft(null);
      refresh();
    },
    onError: (e) => toastError(e, t('sob.error')),
  });
  const del = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/whats-new/entries/${id}`),
    onSuccess: () => {
      toast.success(t('sob.whatsNew.manage.deleted'));
      setDeleting(null);
      refresh();
    },
    onError: (e) => toastError(e, t('sob.error')),
  });

  const edit = (e: ManagedEntry) =>
    setDraft({
      id: e.id,
      date: e.date,
      title: { ...emptyText(), ...(e.title ?? {}) },
      body: { ...emptyText(), ...(e.body ?? {}) },
      roles: e.roles,
      link: e.link ?? '',
    });

  return (
    <Panel
      title={t('sob.whatsNew.manage.title')}
      actions={
        <button type="button" className="btn-primary btn-sm" onClick={() => setDraft({ id: null, date: today(), title: emptyText(), body: emptyText(), roles: ['STAFF', 'ADMIN', 'SUPER_ADMIN'], link: '' })}>
          <Plus className="size-3.5" aria-hidden /> {t('sob.whatsNew.manage.add')}
        </button>
      }
    >
      <p className="mb-3 text-sm text-muted">{t('sob.whatsNew.manage.hint')}</p>
      {list.isLoading ? (
        <ListSkeleton rows={4} cols={3} />
      ) : list.error ? (
        <ErrorBlock error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <ul className="divide-y divide-line">
          {(list.data?.entries ?? []).map((e) => (
            <li key={e.id} className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5', e.hidden && 'opacity-60')}>
              <span className="num w-24 shrink-0 text-xs text-muted">{fmtDate(e.date)}</span>
              <span className="min-w-0 flex-1 text-sm text-ink">{text({ ...e, seen: true }).title || e.id}</span>
              <span className="rounded bg-sunken px-1.5 py-0.5 text-[11px] text-muted">{t(`sob.whatsNew.manage.source.${e.source}`)}</span>
              <span className="text-[11px] text-muted">{e.roles.map((r) => t(`sob.whatsNew.roles.${r}`)).join(', ')}</span>
              {e.hidden && <span className="text-[11px] font-semibold text-warning-fg">{t('sob.whatsNew.manage.hidden')}</span>}
              <div className="flex gap-1">
                {e.source === 'custom' ? (
                  <>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => edit(e)} aria-label={t('sob.whatsNew.manage.edit')} title={t('sob.whatsNew.manage.edit')}>
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                    <button type="button" className="btn-ghost btn-sm text-danger-fg" onClick={() => setDeleting(e)} aria-label={t('sob.whatsNew.manage.delete')} title={t('sob.whatsNew.manage.delete')}>
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => hide.mutate({ id: e.id, hidden: !e.hidden })}
                    disabled={hide.isPending}
                    aria-label={e.hidden ? t('sob.whatsNew.manage.show') : t('sob.whatsNew.manage.hide')}
                    title={e.hidden ? t('sob.whatsNew.manage.show') : t('sob.whatsNew.manage.hide')}
                  >
                    {e.hidden ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? t('sob.whatsNew.manage.edit') : t('sob.whatsNew.manage.add')}
        size="lg"
        as="form"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (draft) save.mutate(draft);
        }}
        busy={save.isPending}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setDraft(null)}>
              {t('sob.whatsNew.manage.cancel')}
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={save.isPending || !draft?.title.az.trim() || !draft?.body.az.trim() || !draft?.roles.length}>
              {t('sob.whatsNew.manage.save')}
            </button>
          </div>
        }
      >
        {draft && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-ink">{t('sob.whatsNew.manage.date')}</span>
                <input className="input w-full" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-ink">{t('sob.whatsNew.manage.link')}</span>
                <input className="input w-full" value={draft.link} placeholder="/admin/..." pattern="/admin.*" onChange={(e) => setDraft({ ...draft, link: e.target.value })} />
              </label>
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-ink">{t('sob.whatsNew.manage.roles')}</legend>
              <div className="flex flex-wrap gap-3">
                {ROLES.map((r) => (
                  <label key={r} className="inline-flex min-h-9 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.roles.includes(r)}
                      onChange={(e) => setDraft({ ...draft, roles: e.target.checked ? [...draft.roles, r] : draft.roles.filter((x) => x !== r) })}
                    />
                    {t(`sob.whatsNew.roles.${r}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            {LANGS.map((l) => (
              <div key={l} className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-ink">{t('sob.whatsNew.manage.titleField', { lang: l.toUpperCase() })}</span>
                  <input
                    className="input w-full"
                    lang={l}
                    maxLength={120}
                    required={l === 'az'}
                    value={draft.title[l]}
                    onChange={(e) => setDraft({ ...draft, title: { ...draft.title, [l]: e.target.value } })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-ink">{t('sob.whatsNew.manage.bodyField', { lang: l.toUpperCase() })}</span>
                  <textarea
                    className="input min-h-20 w-full"
                    lang={l}
                    maxLength={600}
                    required={l === 'az'}
                    value={draft.body[l]}
                    onChange={(e) => setDraft({ ...draft, body: { ...draft.body, [l]: e.target.value } })}
                  />
                </label>
              </div>
            ))}
            <p className="text-xs text-muted" lang={i18n.language}>
              {t('sob.whatsNew.manage.hint')}
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        title={t('sob.whatsNew.manage.confirmDelete')}
        confirmLabel={t('sob.whatsNew.manage.delete')}
        tone="danger"
        loading={del.isPending}
      />
    </Panel>
  );
};
