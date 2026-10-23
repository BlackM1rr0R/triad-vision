import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, Bug, ExternalLink, Image as ImageIcon, ListTodo, MessageSquareReply, Search, Settings2, StickyNote } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesSite } from '@/i18n/pagesSite';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { Chip, DefRow, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';

registerCopy(pagesSite);

const STATUSES = ['NEW', 'IN_PROGRESS', 'DONE', 'WONT_FIX'] as const;
type Status = (typeof STATUSES)[number];

const TONE: Record<Status, string> = {
  NEW: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-brand-100 text-brand-700',
  DONE: 'bg-emerald-100 text-emerald-800',
  WONT_FIX: 'bg-slate-200 text-slate-700',
};

interface ListItem {
  id: string;
  status: Status;
  message: string;
  pageUrl: string;
  createdAt: string;
  reporter: { id: string; name: string; role: string | null } | null;
  contactEmail: string | null;
  hasImage: boolean;
  replies: number;
}
interface Reply {
  at: string;
  byName: string;
  message: string;
  channel: 'IN_APP' | 'EMAIL';
}
interface Detail {
  id: string;
  status: Status;
  message: string;
  pageUrl: string;
  appVersion: string | null;
  userAgent: string | null;
  platform: string | null;
  screen: string | null;
  language: string | null;
  consoleErrors: string[];
  lastApiError: Record<string, unknown> | null;
  reporter: { id: string; name: string; role: string | null; email: string | null } | null;
  contactEmail: string | null;
  hasImage: boolean;
  task: { id: string; key: string; status: string } | null;
  replies: Reply[];
  internalNote: string | null;
  createdAt: string;
}

const when = (iso: string, lng: string) => new Date(iso).toLocaleString(lng, { dateStyle: 'medium', timeStyle: 'short' });

const StatusPill = ({ s }: { s: Status }) => {
  const { t } = useTranslation();
  return <span className={clsx('badge whitespace-nowrap', TONE[s])}>{t(`site.admin.status.${s}`)}</span>;
};

const SettingsPanel = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['problems', 'settings'],
    queryFn: async () => (await api.get<{ settings: { assigneeId: string | null }; candidates: { id: string; name: string; role: string }[] }>('/site/admin/problems/settings')).data,
  });
  const save = useMutation({
    mutationFn: async (assigneeId: string | null) => (await api.put('/site/admin/problems/settings', { assigneeId })).data,
    onSuccess: () => {
      toast.success(t('site.admin.saved'));
      void qc.invalidateQueries({ queryKey: ['problems', 'settings'] });
    },
    onError: () => toast.error(t('site.admin.error')),
  });
  if (!q.data) return null;
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <Settings2 className="size-4 text-muted" aria-hidden />
      <span className="font-semibold text-ink/80">{t('site.admin.settings')}</span>
      <select className="input w-auto min-w-48 py-2" value={q.data.settings.assigneeId ?? ''} onChange={(e) => save.mutate(e.target.value || null)} disabled={save.isPending}>
        <option value="">{t('site.admin.assigneeNone')}</option>
        {q.data.candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {c.role}
          </option>
        ))}
      </select>
    </label>
  );
};

const DetailView = ({ id, onBack }: { id: string; onBack: () => void }) => {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['problems', 'detail', id], queryFn: async () => (await api.get<{ report: Detail }>(`/site/admin/problems/${id}`)).data.report });
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');
  useEffect(() => setNote(q.data?.internalNote ?? ''), [q.data?.internalNote]);

  const onSaved = (r: Detail) => {
    qc.setQueryData(['problems', 'detail', id], r);
    void qc.invalidateQueries({ queryKey: ['problems', 'list'] });
  };
  const patch = useMutation({
    mutationFn: async (body: { status?: Status; internalNote?: string | null }) => (await api.patch<{ report: Detail }>(`/site/admin/problems/${id}`, body)).data.report,
    onSuccess: (r) => {
      onSaved(r);
      toast.success(t('site.admin.saved'));
    },
    onError: () => toast.error(t('site.admin.error')),
  });
  const send = useMutation({
    mutationFn: async () => (await api.post<{ report: Detail }>(`/site/admin/problems/${id}/reply`, { message: reply.trim() })).data.report,
    onSuccess: (r) => {
      onSaved(r);
      setReply('');
      toast.success(t('site.admin.replied'));
    },
    onError: (err) => toast.error(errorCode(err) === 'NO_CONTACT' ? t('site.admin.noContact') : t('site.admin.error')),
  });

  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const r = q.data;
  const canReply = !!r.reporter || !!r.contactEmail;

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        {t('site.admin.back')}
      </button>
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="min-w-0 space-y-5">
          <Panel
            title={<StatusPill s={r.status} />}
            icon={Bug}
            actions={
              <select className="input w-auto py-1.5 text-xs" value={r.status} onChange={(e) => patch.mutate({ status: e.target.value as Status })} aria-label={t('site.admin.title')}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`site.admin.status.${s}`)}
                  </option>
                ))}
              </select>
            }
          >
            <p className="text-sm whitespace-pre-wrap text-ink">{r.message}</p>
            <p className="mt-3 text-xs text-muted">{when(r.createdAt, i18n.language)}</p>
            {r.hasImage && (
              <a href={`/api/site/admin/problems/${r.id}/image`} target="_blank" rel="noreferrer" className="mt-4 block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <ImageIcon className="size-3.5" aria-hidden />
                  {t('site.admin.image')}
                </span>
                <img src={`/api/site/admin/problems/${r.id}/image`} alt="" className="max-h-80 w-auto max-w-full rounded-lg border border-line" />
              </a>
            )}
          </Panel>
          <Panel title={t('site.admin.consoleErrors')}>
            {r.consoleErrors.length ? (
              <pre className="max-h-72 overflow-auto rounded-lg bg-surface p-3 text-[11px] leading-snug break-all whitespace-pre-wrap text-ink">{r.consoleErrors.join('\n\n')}</pre>
            ) : (
              <p className="text-sm text-muted">{t('site.admin.noErrors')}</p>
            )}
            {r.lastApiError && (
              <>
                <p className="mt-4 mb-1.5 text-xs font-semibold text-muted">{t('site.admin.lastApiError')}</p>
                <pre className="overflow-auto rounded-lg bg-surface p-3 text-[11px] break-all whitespace-pre-wrap text-ink">{JSON.stringify(r.lastApiError, null, 2)}</pre>
              </>
            )}
          </Panel>
          <Panel title={t('site.admin.reply')} icon={MessageSquareReply}>
            {r.replies.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-xs font-semibold text-muted">{t('site.admin.history')}</p>
                {r.replies.map((x, i) => (
                  <div key={i} className="rounded-lg bg-surface p-3 text-sm">
                    <p className="whitespace-pre-wrap">{x.message}</p>
                    <p className="mt-1 text-xs text-muted">
                      {x.byName} · {when(x.at, i18n.language)} · {x.channel === 'EMAIL' ? 'e-mail' : 'in-app + e-mail'}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {canReply ? (
              <>
                <textarea className="input" rows={3} maxLength={4000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t('site.admin.replyPlaceholder')} aria-label={t('site.admin.reply')} />
                <button type="button" className="btn-primary btn-sm mt-2 min-h-10 disabled:opacity-60" disabled={reply.trim().length < 2 || send.isPending} onClick={() => send.mutate()}>
                  {t('site.admin.sendReply')}
                </button>
              </>
            ) : (
              <p className="text-sm text-muted">{t('site.admin.noContact')}</p>
            )}
          </Panel>
        </div>
        <div className="min-w-0 space-y-5">
          <Panel>
            <dl className="divide-y divide-line">
              <DefRow label={t('site.admin.reporter')}>
                {r.reporter ? `${r.reporter.name || r.reporter.id} · ${r.reporter.role ?? ''}` : r.contactEmail ? `${t('site.admin.anonymous')} · ${r.contactEmail}` : t('site.admin.anonymous')}
              </DefRow>
              {r.reporter?.email && <DefRow label="E-mail">{r.reporter.email}</DefRow>}
              <DefRow label={t('site.admin.page')}>
                <a href={r.pageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-brand-700 hover:underline">
                  {r.pageUrl.replace(/^https?:\/\/[^/]+/, '') || '/'}
                  <ExternalLink className="size-3 shrink-0" aria-hidden />
                </a>
              </DefRow>
              <DefRow label={t('site.admin.version')}>{r.appVersion ?? '—'}</DefRow>
              <DefRow label={t('site.admin.platform')}>{r.platform ?? '—'}</DefRow>
              <DefRow label={t('site.admin.screen')}>{r.screen ?? '—'}</DefRow>
              <DefRow label={t('site.admin.language')}>{r.language ?? '—'}</DefRow>
              <DefRow label={t('site.admin.browser')}>
                <span className="text-xs font-normal break-all">{r.userAgent ?? '—'}</span>
              </DefRow>
              {r.task && (
                <DefRow label={t('site.admin.task')}>
                  <Link to={`/workspace/tasks/${r.task.key}`} className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                    <ListTodo className="size-3.5" aria-hidden />
                    {r.task.key}
                  </Link>
                </DefRow>
              )}
            </dl>
          </Panel>
          <Panel title={t('site.admin.note')} icon={StickyNote}>
            <textarea className="input" rows={4} maxLength={5000} value={note} onChange={(e) => setNote(e.target.value)} aria-label={t('site.admin.note')} />
            <button
              type="button"
              className="btn-ghost btn-sm mt-2 min-h-10"
              disabled={patch.isPending || note === (r.internalNote ?? '')}
              onClick={() => patch.mutate({ internalNote: note.trim() || null })}
            >
              {t('site.admin.saveNote')}
            </button>
          </Panel>
        </div>
      </div>
    </div>
  );
};

export default function AdminProblemReports() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('site.admin.title'));
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const [params, setParams] = useSearchParams();
  const openId = params.get('id');
  const [status, setStatus] = useState<Status | ''>('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const list = useQuery({
    queryKey: ['problems', 'list', status, q],
    queryFn: async () =>
      (
        await api.get<{ items: ListItem[]; total: number; counts: Record<Status, number> }>('/site/admin/problems', {
          params: { ...(status ? { status } : {}), ...(q ? { q } : {}) },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const open = (id: string | null) => setParams(id ? { id } : {}, { replace: false });

  if (list.error && errorCode(list.error) === 'FORBIDDEN') {
    return <EmptyState icon={Bug} title={t('site.admin.noAccess')} />;
  }

  return (
    <div>
      <PageHead title={t('site.admin.title')} subtitle={t('site.admin.subtitle')} actions={isAdmin ? <SettingsPanel /> : undefined} />
      {openId ? (
        <DetailView id={openId} onBack={() => open(null)} />
      ) : (
        <Panel bodyClassName="p-0">
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
              <Chip active={status === ''} onClick={() => setStatus('')} count={list.data ? Object.values(list.data.counts).reduce((a, b) => a + b, 0) : undefined}>
                {t('site.admin.all')}
              </Chip>
              {STATUSES.map((s) => (
                <Chip key={s} active={status === s} onClick={() => setStatus(s)} count={list.data?.counts[s]}>
                  {t(`site.admin.status.${s}`)}
                </Chip>
              ))}
            </div>
            <label className="relative block sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input className="input pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('site.admin.search')} aria-label={t('site.admin.search')} />
            </label>
          </div>
          {list.isLoading ? (
            <LoadingBlock />
          ) : list.error ? (
            <div className="p-4">
              <ErrorBlock error={list.error} onRetry={() => void list.refetch()} />
            </div>
          ) : !list.data?.items.length ? (
            <EmptyState icon={Bug} title={t('site.admin.empty')} />
          ) : (
            <ul className="divide-y divide-line">
              {list.data.items.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => open(r.id)} className="flex w-full flex-col gap-1.5 px-4 py-3 text-left transition hover:bg-surface sm:flex-row sm:items-center sm:gap-4">
                    <StatusPill s={r.status} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-medium text-navy-900">{r.message}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {r.pageUrl.replace(/^https?:\/\/[^/]+/, '') || '/'} · {r.reporter ? `${r.reporter.name} (${r.reporter.role ?? ''})` : (r.contactEmail ?? t('site.admin.anonymous'))}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3 text-xs text-muted">
                      {r.hasImage && <ImageIcon className="size-3.5" aria-label={t('site.admin.image')} />}
                      {r.replies > 0 && <span>{t('site.admin.replies', { count: r.replies })}</span>}
                      <span>{when(r.createdAt, i18n.language)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
