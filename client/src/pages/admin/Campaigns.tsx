import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, Download, Filter, Megaphone, Pause, Pencil, Play, Plus, Save, Trash2, Undo2, Users, XCircle } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesCampaigns } from '@/i18n/pagesCampaigns';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, StatTile } from '@/components/admin/ui';
import { fmtDateTime } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import { CampaignWizard } from '@/components/campaigns/CampaignWizard';
import { SegmentBuilder, SegmentPreviewPanel, useSegmentPreview } from '@/components/campaigns/SegmentBuilder';
import {
  campaignError,
  CHANNELS,
  RECIPIENT_TONE,
  STATUS_TONE,
  useCampaign,
  useCampaigns,
  useSegments,
  type Definition,
  type Recipient,
  type RecipientStatus,
  type Stats,
} from '@/components/campaigns/api';

registerCopy(pagesCampaigns);

/** Inline yes/no confirmation (no modal overlay). */
const ConfirmButton = ({ label, confirm, onConfirm, icon, danger, busy }: { label: string; confirm: string; onConfirm: () => void; icon: ReactNode; danger?: boolean; busy?: boolean }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className={clsx('btn-sm border', danger ? 'border-red-200 bg-card text-red-700 hover:bg-red-50' : 'btn-white border-line')} disabled={busy} onClick={() => setOpen(true)}>
        {icon} {label}
      </button>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800" role="alert">
      {confirm}
      <button type="button" className="btn-danger btn-sm" onClick={() => { setOpen(false); onConfirm(); }}>
        {label}
      </button>
      <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
        {t('admin.common.cancel')}
      </button>
    </span>
  );
};

const StatusPill = ({ status }: { status: keyof typeof STATUS_TONE }) => {
  const { t } = useTranslation();
  return <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap', STATUS_TONE[status])}>{t(`campaigns.status.${status}`)}</span>;
};

const pct = (n: number, of: number) => (of > 0 ? ` · ${Math.round((n / of) * 100)}%` : '');

// ─── List ───────────────────────────────────────────────────────────────

const CampaignList = () => {
  const { t } = useTranslation();
  usePageTitle(t('campaigns.title'));
  const q = useCampaigns();
  return (
    <div className="mx-auto max-w-7xl">
      <PageHead
        title={t('campaigns.title')}
        subtitle={t('campaigns.subtitle')}
        actions={
          <>
            <Link to="/admin/campaigns/segments" className="btn-secondary btn-sm">
              <Filter className="size-3.5" aria-hidden /> {t('campaigns.segmentsLink')}
            </Link>
            <Link to="/admin/campaigns/new" className="btn-primary btn-sm">
              <Plus className="size-3.5" aria-hidden /> {t('campaigns.new')}
            </Link>
          </>
        }
      />
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error ? (
        <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data?.length ? (
        <Panel>
          <EmptyState icon={Megaphone} title={t('campaigns.empty')}>
            {t('campaigns.emptyText')}
          </EmptyState>
        </Panel>
      ) : (
        <Panel bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t('campaigns.cols.name')}</th>
                  <th className="px-2 py-2.5 font-medium">{t('campaigns.cols.status')}</th>
                  <th className="px-2 py-2.5 font-medium">{t('campaigns.cols.channels')}</th>
                  {(['sent', 'delivered', 'opened', 'clicked', 'failed', 'unsubscribed'] as const).map((k) => (
                    <th key={k} className="px-2 py-2.5 text-right font-medium">
                      {t(`campaigns.cols.${k}`)}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 font-medium">{t('campaigns.cols.when')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.data.map((c) => (
                  <tr key={c.id} className="hover:bg-surface/60">
                    <td className="px-4 py-3">
                      <Link to={`/admin/campaigns/${c.id}`} className="font-semibold text-navy-900 hover:text-brand-700 hover:underline">
                        {c.name}
                      </Link>
                      <span className="block text-[11px] text-muted">
                        {t(`campaigns.kind.${c.kind}`)} · {c.segment?.name ?? '—'}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <StatusPill status={c.status} />
                    </td>
                    <td className="px-2 py-3 text-xs">{c.channels.map((ch) => t(`campaigns.channel.${ch}`)).join(', ')}</td>
                    <td className="px-2 py-3 text-right tabular-nums">{c.stats.sent}</td>
                    <td className="px-2 py-3 text-right tabular-nums">{c.stats.delivered}</td>
                    <td className="px-2 py-3 text-right tabular-nums" title={t('campaigns.approxOpens')}>
                      {c.stats.opened + c.stats.inAppRead}
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums">{c.stats.clicked}</td>
                    <td className={clsx('px-2 py-3 text-right tabular-nums', c.stats.failed + c.stats.bounced > 0 && 'font-semibold text-danger')}>{c.stats.failed + c.stats.bounced}</td>
                    <td className="px-2 py-3 text-right tabular-nums">{c.stats.unsubscribed}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">{fmtDateTime(c.completedAt ?? c.startedAt ?? c.scheduledAt ?? c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-2 text-[11px] text-muted">{t('campaigns.approxOpens')}</p>
        </Panel>
      )}
    </div>
  );
};

// ─── Detail ─────────────────────────────────────────────────────────────

const StatsGrid = ({ s }: { s: Stats }) => {
  const { t } = useTranslation();
  const d = (k: string) => t(`campaigns.detail.${k}`);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatTile label={d('total')} value={s.total} hint={`${d('queued')}: ${s.queued} · ${d('skipped')}: ${s.skipped}`} />
      <StatTile label={d('sent')} value={s.sent} hint={`${d('delivered')}: ${s.delivered}`} tone="good" />
      <StatTile label={d('opened')} value={s.opened} hint={`${pct(s.opened, s.byChannel.EMAIL?.SENT ?? 0).slice(3)} · ${d('inAppRead')}: ${s.inAppRead}`} />
      <StatTile label={d('clicked')} value={s.clicked} hint={pct(s.clicked, s.sent).slice(3)} />
      <StatTile label={d('failed')} value={s.failed + s.bounced} hint={`${d('bounced')}: ${s.bounced}`} tone={s.failed + s.bounced ? 'danger' : undefined} />
      <StatTile label={d('unsubscribed')} value={s.unsubscribed} tone={s.unsubscribed ? 'warn' : undefined} />
    </div>
  );
};

const STATUSES: RecipientStatus[] = ['QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED', 'BOUNCED'];

const RecipientTable = ({ campaignId, live }: { campaignId: string; live: boolean }) => {
  const { t } = useTranslation();
  const d = (k: string, o?: Record<string, unknown>) => t(`campaigns.detail.${k}`, o);
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const h = window.setTimeout(() => setQ(search.trim()), 350);
    return () => window.clearTimeout(h);
  }, [search]);
  useEffect(() => setPage(1), [status, channel, q]);
  const pageSize = 50;
  const data = useQuery({
    queryKey: ['campaign-recipients', campaignId, status, channel, q, page],
    queryFn: async () =>
      (await api.get<{ total: number; items: Recipient[] }>(`/admin/campaigns/${campaignId}/recipients`, { params: { status: status || undefined, channel: channel || undefined, q: q || undefined, page, pageSize } })).data,
    refetchInterval: live ? 10_000 : false,
  });
  const pages = Math.max(1, Math.ceil((data.data?.total ?? 0) / pageSize));
  return (
    <Panel
      title={`${d('recipients')}${data.data ? ` (${data.data.total})` : ''}`}
      icon={Users}
      bodyClassName="p-0"
      actions={
        <a href={`/api/admin/campaigns/${campaignId}/recipients.csv`} className="btn-secondary btn-sm" download>
          <Download className="size-3.5" aria-hidden /> {t('campaigns.actions.exportCsv')}
        </a>
      }
    >
      <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
        <select className="input w-auto py-2" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={d('allStatuses')}>
          <option value="">{d('allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {d(`recipientStatus.${s}`)}
            </option>
          ))}
        </select>
        <select className="input w-auto py-2" value={channel} onChange={(e) => setChannel(e.target.value)} aria-label={d('allChannels')}>
          <option value="">{d('allChannels')}</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {t(`campaigns.channel.${c}`)}
            </option>
          ))}
        </select>
        <input className="input min-w-0 flex-1 py-2 sm:max-w-xs" type="search" placeholder={d('search')} aria-label={d('search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {data.isLoading ? (
        <LoadingBlock className="min-h-40" />
      ) : !data.data?.items.length ? (
        <p className="px-4 py-8 text-center text-sm text-muted">{d('noRecipients')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{d('cols.person')}</th>
                <th className="px-2 py-2 font-medium">{d('cols.channel')}</th>
                <th className="px-2 py-2 font-medium">{d('cols.lang')}</th>
                <th className="px-2 py-2 font-medium">{d('cols.status')}</th>
                <th className="px-2 py-2 font-medium">{d('cols.sent')}</th>
                <th className="px-2 py-2 font-medium">{d('cols.opened')}</th>
                <th className="px-2 py-2 font-medium">{d('cols.clicked')}</th>
                <th className="px-4 py-2 font-medium">{d('cols.note')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.data.items.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-navy-900">
                      {r.user.firstName} {r.user.lastName}
                    </span>
                    <span className="block max-w-[16rem] truncate text-[11px] text-muted" title={r.address ?? r.user.email}>
                      {r.address ?? r.user.email}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-xs">{t(`campaigns.channel.${r.channel}`)}</td>
                  <td className="px-2 py-2.5 text-xs uppercase">{r.locale}</td>
                  <td className="px-2 py-2.5">
                    <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold', RECIPIENT_TONE[r.status])}>{d(`recipientStatus.${r.status}`)}</span>
                  </td>
                  <td className="px-2 py-2.5 text-xs whitespace-nowrap text-muted">{r.sentAt ? fmtDateTime(r.sentAt) : '—'}</td>
                  <td className="px-2 py-2.5 text-xs whitespace-nowrap text-muted">{r.openedAt ? fmtDateTime(r.openedAt) : r.readAt ? `${d('read')} ${fmtDateTime(r.readAt)}` : '—'}</td>
                  <td className="px-2 py-2.5 text-xs tabular-nums">{r.clicks || '—'}</td>
                  <td className="max-w-[18rem] px-4 py-2.5 text-xs text-muted">
                    {r.skipReason ? d(`skip.${r.skipReason}`) : r.error ? <span className="line-clamp-2 text-red-700" title={r.error}>{r.error}</span> : null}
                    {r.unsubscribedAt && <span className="block text-amber-700">{d('unsubscribedAt')} {fmtDateTime(r.unsubscribedAt)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2 text-xs">
          <button type="button" className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ‹
          </button>
          <span>{d('page', { page, pages })}</span>
          <button type="button" className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            ›
          </button>
        </div>
      )}
    </Panel>
  );
};

const CampaignDetail = () => {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useCampaign(id);
  usePageTitle(q.data?.name ?? t('campaigns.title'));
  const [busy, setBusy] = useState(false);
  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const c = q.data;
  const act = async (path: string, done?: () => void) => {
    setBusy(true);
    try {
      if (path === 'delete') await api.delete(`/admin/campaigns/${c.id}`);
      else await api.post(`/admin/campaigns/${c.id}/${path}`, {});
      toast.success(t('campaigns.done'));
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
      void qc.invalidateQueries({ queryKey: ['campaign', c.id] });
      void qc.invalidateQueries({ queryKey: ['campaign-recipients', c.id] });
      done?.();
    } catch (err) {
      campaignError(err);
    } finally {
      setBusy(false);
    }
  };
  const d = (k: string, o?: Record<string, unknown>) => t(`campaigns.detail.${k}`, o);
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Link to="/admin/campaigns" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> {d('back')}
      </Link>
      <PageHead
        title={c.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={c.status} />
            <span>{t(`campaigns.kind.${c.kind}`)}</span>
            <span>· {c.channels.map((ch) => t(`campaigns.channel.${ch}`)).join(', ')}</span>
            <span>· {c.segment?.name ?? '—'}</span>
          </span>
        }
        actions={
          <>
            {(c.status === 'DRAFT' || c.status === 'SCHEDULED') && (
              <Link to={`/admin/campaigns/${c.id}/edit`} className="btn-secondary btn-sm">
                <Pencil className="size-3.5" aria-hidden /> {t('campaigns.actions.edit')}
              </Link>
            )}
            {c.status === 'SCHEDULED' && (
              <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => void act('unschedule')}>
                <Undo2 className="size-3.5" aria-hidden /> {t('campaigns.actions.unschedule')}
              </button>
            )}
            {(c.status === 'SENDING' || c.status === 'SCHEDULED') && (
              <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => void act('pause')}>
                <Pause className="size-3.5" aria-hidden /> {t('campaigns.actions.pause')}
              </button>
            )}
            {c.status === 'PAUSED' && (
              <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void act('resume')}>
                <Play className="size-3.5" aria-hidden /> {t('campaigns.actions.resume')}
              </button>
            )}
            {['SCHEDULED', 'SENDING', 'PAUSED'].includes(c.status) && (
              <ConfirmButton danger busy={busy} label={t('campaigns.actions.cancel')} confirm={t('campaigns.confirmCancel')} icon={<XCircle className="size-3.5" aria-hidden />} onConfirm={() => void act('cancel')} />
            )}
            {c.status === 'DRAFT' && (
              <ConfirmButton danger busy={busy} label={t('campaigns.actions.delete')} confirm={t('campaigns.confirmDelete')} icon={<Trash2 className="size-3.5" aria-hidden />} onConfirm={() => void act('delete', () => navigate('/admin/campaigns'))} />
            )}
            {busy && <Spinner className="size-4" />}
          </>
        }
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {c.scheduledAt && <span>{d('scheduledFor', { date: fmtDateTime(c.scheduledAt) })}</span>}
        {c.startedAt && <span>{d('startedAt', { date: fmtDateTime(c.startedAt) })}</span>}
        {c.completedAt && <span>{d('completedAt', { date: fmtDateTime(c.completedAt) })}</span>}
        <span>{d('throttle', { email: c.emailsPerMinute, sms: c.smsPerMinute })}</span>
        {c.quietHours && c.channels.includes('SMS') && <span>{d('quietOn')}</span>}
      </div>
      <StatsGrid s={c.stats} />
      <p className="text-[11px] text-muted">{t('campaigns.approxOpens')}</p>
      <RecipientTable campaignId={c.id} live={c.status === 'SENDING'} />
    </div>
  );
};

const CampaignEdit = () => {
  const { id } = useParams();
  const q = useCampaign(id);
  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  return <CampaignWizard key={q.data.id} campaign={q.data} />;
};

const CampaignNew = () => {
  const { t } = useTranslation();
  usePageTitle(t('campaigns.wizard.titleNew'));
  return <CampaignWizard />;
};

// ─── Segments ───────────────────────────────────────────────────────────

const SegmentList = () => {
  const { t } = useTranslation();
  usePageTitle(t('campaigns.segments.title'));
  const q = useSegments();
  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/admin/campaigns" className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> {t('campaigns.title')}
      </Link>
      <PageHead
        title={t('campaigns.segments.title')}
        subtitle={t('campaigns.segments.subtitle')}
        actions={
          <Link to="/admin/campaigns/segments/new" className="btn-primary btn-sm">
            <Plus className="size-3.5" aria-hidden /> {t('campaigns.segments.new')}
          </Link>
        }
      />
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error ? (
        <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data?.length ? (
        <Panel>
          <EmptyState icon={Filter} title={t('campaigns.segments.empty')} />
        </Panel>
      ) : (
        <Panel bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {q.data.map((s) => (
              <li key={s.id}>
                <Link to={`/admin/campaigns/segments/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 hover:bg-surface/60">
                  <span className="min-w-0">
                    <span className="block font-semibold text-navy-900">{s.name}</span>
                    {s.description && <span className="block truncate text-xs text-muted">{s.description}</span>}
                  </span>
                  <span className="text-xs text-muted">
                    {t('campaigns.segments.usedBy', { count: s._count?.campaigns ?? 0 })} · {fmtDateTime(s.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
};

const SegmentEditor = () => {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const { t } = useTranslation();
  const s = (k: string, o?: Record<string, unknown>) => t(`campaigns.segments.${k}`, o);
  usePageTitle(isNew ? s('new') : s('edit'));
  const uid = useId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const existing = useQuery({
    queryKey: ['campaign-segment', id],
    enabled: !isNew,
    queryFn: async () => (await api.get<{ item: { id: string; name: string; description: string | null; definition: Definition } }>(`/admin/campaigns/segments/${id}`)).data.item,
  });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [def, setDef] = useState<Definition>({ op: 'AND', groups: [{ op: 'AND', conditions: [{ field: 'role', values: ['CLIENT'] }] }] });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (existing.data) {
      setName(existing.data.name);
      setDescription(existing.data.description ?? '');
      setDef({ op: existing.data.definition?.op ?? 'AND', groups: existing.data.definition?.groups ?? [] });
    }
  }, [existing.data]);
  const preview = useSegmentPreview(def);

  const save = async () => {
    if (!name.trim()) return toast.error(t('campaigns.wizard.errors.nameRequired'));
    setBusy(true);
    try {
      const body = { name: name.trim(), description: description.trim() || null, definition: def };
      const res = isNew ? await api.post<{ item: { id: string } }>('/admin/campaigns/segments', body) : await api.patch<{ item: { id: string } }>(`/admin/campaigns/segments/${id}`, body);
      toast.success(s('saved'));
      void qc.invalidateQueries({ queryKey: ['campaign-segments'] });
      void qc.invalidateQueries({ queryKey: ['campaign-segment', res.data.item.id] });
      if (isNew) navigate(`/admin/campaigns/segments/${res.data.item.id}`, { replace: true });
    } catch (err) {
      campaignError(err);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/admin/campaigns/segments/${id}`);
      void qc.invalidateQueries({ queryKey: ['campaign-segments'] });
      navigate('/admin/campaigns/segments');
    } catch (err) {
      campaignError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!isNew && existing.isLoading) return <LoadingBlock />;
  if (!isNew && existing.error) return <ErrorBlock error={existing.error} onRetry={() => void existing.refetch()} />;
  return (
    <div className="mx-auto max-w-7xl">
      <Link to="/admin/campaigns/segments" className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> {s('title')}
      </Link>
      <PageHead
        title={isNew ? s('new') : s('edit')}
        actions={
          <>
            {!isNew && <ConfirmButton danger busy={busy} label={t('campaigns.actions.delete')} confirm={s('deleteConfirm')} icon={<Trash2 className="size-3.5" aria-hidden />} onConfirm={() => void remove()} />}
            <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void save()}>
              {busy ? <Spinner className="size-3.5" /> : <Save className="size-3.5" aria-hidden />} {s('save')}
            </button>
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
        <Panel>
          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`${uid}-name`}>
                {s('name')}
              </label>
              <input id={`${uid}-name`} className="input" maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor={`${uid}-desc`}>
                {s('description')}
              </label>
              <input id={`${uid}-desc`} className="input" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <SegmentBuilder value={def} onChange={setDef} />
        </Panel>
        <div className="lg:sticky lg:top-20 lg:self-start">
          <SegmentPreviewPanel preview={preview.data} loading={preview.loading} />
        </div>
      </div>
    </div>
  );
};

/** Admin → Kampaniyalar (ADMIN+): /admin/campaigns, /new, /:id, /:id/edit, /segments, /segments/:id. */
export default function AdminCampaigns() {
  return (
    <Routes>
      <Route index element={<CampaignList />} />
      <Route path="new" element={<CampaignNew />} />
      <Route path="segments" element={<SegmentList />} />
      <Route path="segments/:id" element={<SegmentEditor />} />
      <Route path=":id" element={<CampaignDetail />} />
      <Route path=":id/edit" element={<CampaignEdit />} />
    </Routes>
  );
}
