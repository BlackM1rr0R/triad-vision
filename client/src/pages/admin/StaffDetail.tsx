import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  Clock,
  FileCheck2,
  FolderOpen,
  History,
  Mail,
  MonitorSmartphone,
  Phone,
  ScrollText,
  Share2,
  Smartphone,
  Monitor,
  Trash2,
} from 'lucide-react';
import { api, formatBytes } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DeleteUserDialog } from '@/components/admin/DeleteUserDialog';
import { StatusBadge, ToneBadge } from '@/components/admin/StatusBadge';
import {
  DOC_ACCESS_TONE,
  ROLE_TONE,
  auditActionLabel,
  dayIso,
  docAccessLabel,
  eventLabel,
  fmtDate,
  fmtDateTime,
  fmtDayShort,
  fmtMinutes,
  fmtRelative,
  fullName,
  roleLabel,
  sessionClientLabel,
  shortUserAgent,
  statusLabel,
} from '@/components/admin/labels';
import type { StaffAssignedCase, StaffDetailResponse } from '@/components/admin/types';
import { DefRow, EmptyState, ErrorBlock, LoadingBlock, OnlineDot, Panel, StatTile } from '@/components/admin/ui';
import { ACCENT, BarChart, BarList, SERIES_COLORS } from '@/components/admin/charts';

/** Compact, human-readable rendering of an audit details JSON. */
const detailsText = (d: Record<string, unknown> | null) =>
  d
    ? Object.entries(d)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
        .join(' · ')
    : '';

const CaseRows = ({ cases, empty }: { cases: StaffAssignedCase[]; empty: string }) =>
  cases.length === 0 ? (
    <p className="px-5 py-4 text-sm text-muted sm:px-6">{empty}</p>
  ) : (
    <ul className="divide-y divide-line">
      {cases.map((c) => (
        <li key={c.id}>
          <Link to={`/admin/cases/${c.id}`} className="flex items-center gap-3 px-5 py-2.5 transition hover:bg-surface sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-navy-900">
                <span className="shrink-0 font-mono text-xs text-muted">{c.number}</span>
                <span className="truncate">{fullName(c.client)}</span>
              </p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {c.profession} · {fmtRelative(c.updatedAt)}
              </p>
            </div>
            <StatusBadge status={c.status} />
          </Link>
        </li>
      ))}
    </ul>
  );

export default function StaffDetail() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-oversight-staff', id],
    queryFn: async () => (await api.get<StaffDetailResponse>(`/admin/oversight/staff/${id}`)).data,
    enabled: !!id,
    refetchInterval: 60_000,
  });
  const [allEvents, setAllEvents] = useState(false);
  const [allAudit, setAllAudit] = useState(false);
  const [caseTab, setCaseTab] = useState<'open' | 'closed'>('open');
  const [deleting, setDeleting] = useState(false);
  const { user: me } = useAuth();
  const navigate = useNavigate();

  // UTC hour histogram → the viewer's local hours, so "14:00" means 14:00 on this screen.
  const hours = useMemo(() => {
    if (!data) return [];
    const offset = Math.round(-new Date().getTimezoneOffset() / 60);
    const nowHour = new Date().getHours();
    const out: { label: string; title: string; value: number; emphasis?: boolean }[] = [];
    for (let h = 0; h < 24; h++) {
      const utc = (((h - offset) % 24) + 24) % 24;
      out.push({ label: String(h).padStart(2, '0'), title: `${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59`, value: data.hourHistogram[utc] ?? 0, emphasis: h === nowHour });
    }
    return out;
  }, [data]);

  const daily = useMemo(
    () => (data?.dailyActive ?? []).map((d) => ({ label: fmtDayShort(dayIso(d.day)), title: fmtDate(dayIso(d.day)), value: d.minutes })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, t],
  );

  const eventTypeRows = useMemo(
    () =>
      Object.entries(data?.eventTypes30d ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([type, n]) => ({ key: type, label: eventLabel(type), value: n, tone: 'bg-brand-500' })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, t],
  );

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;

  const { user, totals, sessions, workspace } = data;
  const events = allEvents ? data.events : data.events.slice(0, 15);
  const audit = allAudit ? data.audit : data.audit.slice(0, 10);
  const accepted = data.documentsReviewed.DOCUMENT_ACCEPTED ?? 0;
  const rejected = data.documentsReviewed.DOCUMENT_REJECTED ?? 0;
  const liveSessions = sessions.filter((s) => s.live).length;

  return (
    <div className="space-y-6">
      <Link to="/admin/oversight" className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-navy-900">
        <ArrowLeft className="size-3.5" /> {t('admin.staff.back')}
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-line bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-navy-900 text-sm font-bold text-white" aria-hidden>
              {`${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold text-navy-900">
                {fullName(user)}
                <ToneBadge tone={ROLE_TONE[user.role]}>{roleLabel(user.role)}</ToneBadge>
                {!user.isActive && <ToneBadge tone="bg-slate-200 text-slate-600">{t('admin.common.inactiveCap')}</ToneBadge>}
              </h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={`mailto:${user.email}`} className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-ink/80 transition hover:border-brand-400 hover:text-brand-700">
                  <Mail className="size-3.5 shrink-0" /> <span className="truncate">{user.email}</span>
                </a>
                {user.phone && (
                  <a href={`tel:${user.phone}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-ink/80 transition hover:border-brand-400 hover:text-brand-700">
                    <Phone className="size-3.5" /> {user.phone}
                  </a>
                )}
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <OnlineDot online={data.online} lastSeenAt={data.lastSeenAt} />
                <span>{t('admin.staff.registered', { date: fmtDate(user.createdAt) })}</span>
                <span>{t('admin.staff.language', { value: user.locale.toUpperCase() })}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/admin/cases?search=${encodeURIComponent(user.email)}`} className="btn-white btn-sm border border-line">
              <Briefcase className="size-3.5" /> {t('admin.staff.cases')}
            </Link>
            {workspace && (
              <Link to={`/workspace/drive/f/${workspace.folderId}`} className="btn-white btn-sm border border-line">
                <FolderOpen className="size-3.5" /> {t('admin.staff.workspace')}
              </Link>
            )}
            {/* Only the super admin deletes accounts; never their own or another super admin's. */}
            {me?.role === 'SUPER_ADMIN' && user.id !== me.id && user.role !== 'SUPER_ADMIN' && (
              <button type="button" className="btn-white btn-sm border border-line text-danger hover:border-red-300 hover:bg-red-50" onClick={() => setDeleting(true)}>
                <Trash2 className="size-3.5" /> {t('admin.users.deleteBtn')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Totals (all-time) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <StatTile label={t('admin.staff.activeTime30')} value={fmtMinutes(data.activeMinutes30d)} icon={Clock} />
        <StatTile label={t('admin.staff.assignedCases')} value={totals.assignedCases} hint={t('admin.staff.openClosedHint', { open: data.assignedCases.open.length, closed: data.assignedCases.closed.length })} />
        <StatTile label={t('admin.staff.caseEvents')} value={totals.events} hint={t('admin.staff.allTime')} />
        <StatTile label={t('admin.staff.messages')} value={totals.messages} hint={t('admin.staff.allTime')} />
        <StatTile label={t('admin.staff.docsReviewed')} value={accepted + rejected} hint={t('admin.staff.acceptedRejected', { accepted, rejected })} />
        <StatTile label={t('admin.staff.workspaceFile')} value={totals.docFiles} hint={t('admin.staff.caseDocs', { count: totals.documents })} />
        <StatTile label={t('admin.staff.sessions')} value={totals.sessions} hint={t('admin.staff.sessionsHint', { live: liveSessions, audit: totals.auditLogs })} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t('admin.staff.dailyActive')} icon={CalendarDays}>
          <BarChart bars={daily} color={ACCENT} format={fmtMinutes} axisFormat={(v) => fmtMinutes(v)} ariaLabel={t('admin.staff.dailyAria', { name: fullName(user) })} tableLabel={t('admin.staff.activeTime')} />
        </Panel>
        <Panel title={t('admin.staff.byHour')} icon={Clock} actions={<span className="text-[11px] text-muted">{t('admin.staff.byHourHint')}</span>}>
          <BarChart bars={hours} color={SERIES_COLORS[1]} xEvery={3} ariaLabel={t('admin.staff.byHourAria', { name: fullName(user) })} tableLabel={t('admin.staff.action')} />
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          {/* Sessions */}
          <Panel
            title={t('admin.staff.sessionsTitle')}
            icon={MonitorSmartphone}
            bodyClassName="p-0"
            actions={<span className="text-xs text-muted tabular-nums">{t('admin.staff.sessionsMeta', { count: sessions.length, live: liveSessions })}</span>}
          >
            {sessions.length === 0 ? (
              <EmptyState icon={MonitorSmartphone} title={t('admin.staff.noSessions')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="border-b border-line bg-surface/70 text-[10px] font-semibold tracking-wide whitespace-nowrap text-muted uppercase">
                    <tr>
                      <th className="px-4 py-2">{t('admin.staff.th.device')}</th>
                      <th className="px-3 py-2">{t('admin.staff.th.ip')}</th>
                      <th className="px-3 py-2">{t('admin.staff.th.started')}</th>
                      <th className="px-3 py-2">{t('admin.staff.th.lastSeen')}</th>
                      <th className="px-3 py-2 text-right">{t('admin.staff.th.active')}</th>
                      <th className="px-3 py-2 text-right">{t('admin.staff.th.state')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {sessions.map((s) => (
                      <tr key={s.id} className={clsx(!s.live && 'text-ink/60')}>
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            {s.client === 'mobile' ? <Smartphone className="size-3.5 text-muted" aria-hidden /> : <Monitor className="size-3.5 text-muted" aria-hidden />}
                            <span className="font-medium text-navy-900">{sessionClientLabel(s.client)}</span>
                            <span className="text-muted" title={s.userAgent ?? undefined}>
                              {shortUserAgent(s.userAgent)}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{s.ip ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap" title={fmtDateTime(s.createdAt)}>
                          {fmtRelative(s.createdAt)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap" title={fmtDateTime(s.lastSeenAt)}>
                          {fmtRelative(s.lastSeenAt)}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{fmtMinutes(s.activeMinutes)}</td>
                        <td className="px-3 py-2 text-right">
                          {s.live ? (
                            <ToneBadge tone="bg-emerald-100 text-emerald-800" className="text-[10px]">{t('admin.staff.live')}</ToneBadge>
                          ) : s.revokedAt ? (
                            <ToneBadge tone="bg-red-100 text-red-700" className="text-[10px]">{t('admin.staff.revoked')}</ToneBadge>
                          ) : (
                            <ToneBadge tone="bg-slate-100 text-slate-600" className="text-[10px]">{t('admin.staff.expired')}</ToneBadge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* Case actions timeline */}
          <Panel title={t('admin.staff.caseActions')} icon={History} actions={<span className="text-[11px] text-muted tabular-nums">{t('admin.staff.lastN', { count: data.events.length })}</span>}>
            {data.events.length === 0 ? (
              <EmptyState icon={History} title={t('admin.staff.noActions')} />
            ) : (
              <>
                <ol className="relative space-y-4 before:absolute before:top-1 before:bottom-1 before:left-[5px] before:w-px before:bg-line">
                  {events.map((e) => (
                    <li key={e.id} className="relative pl-6">
                      <span className={clsx('absolute top-1.5 left-0 size-[11px] rounded-full border-2 border-white', e.type === 'INTERNAL_NOTE' ? 'bg-amber-400' : e.toStatus ? 'bg-brand-600' : 'bg-slate-300')} aria-hidden />
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className="font-semibold text-navy-900">{eventLabel(e.type)}</span>
                        <Link to={`/admin/cases/${e.case.id}`} className="font-mono text-xs font-semibold text-brand-600 hover:underline">
                          {e.case.number}
                        </Link>
                        <span className="text-xs text-muted">{fullName(e.case.client)}</span>
                      </p>
                      {e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus && (
                        <p className="mt-0.5 text-xs text-muted">
                          {statusLabel(e.fromStatus)} → <span className="font-medium text-ink/80">{statusLabel(e.toStatus)}</span>
                        </p>
                      )}
                      {e.note && <p className="mt-1 line-clamp-3 text-xs break-words whitespace-pre-wrap text-ink/80">{e.note}</p>}
                      <p className="mt-1 text-[11px] text-muted">{fmtDateTime(e.createdAt)}</p>
                    </li>
                  ))}
                </ol>
                {data.events.length > 15 && (
                  <button type="button" className="mt-3 inline-flex min-h-10 items-center text-xs font-semibold text-brand-600 hover:underline" onClick={() => setAllEvents((v) => !v)}>
                    {allEvents ? t('admin.common.showLess') : t('admin.common.showAll', { count: data.events.length })}
                  </button>
                )}
              </>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          {/* Event type breakdown (30d) */}
          <Panel title={t('admin.staff.eventTypes')} icon={FileCheck2}>
            {eventTypeRows.length === 0 ? <p className="text-sm text-muted">{t('admin.staff.noActions30')}</p> : <BarList rows={eventTypeRows} />}
          </Panel>

          {/* Assigned cases */}
          <Panel
            title={t('admin.staff.assignedTitle')}
            icon={Briefcase}
            bodyClassName="p-0"
            actions={
              <div className="flex gap-1" role="tablist" aria-label={t('admin.staff.caseListAria')}>
                {(['open', 'closed'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={caseTab === tab}
                    onClick={() => setCaseTab(tab)}
                    className={clsx('min-h-8 rounded-md px-2.5 text-xs font-semibold transition', caseTab === tab ? 'bg-navy-900 text-white' : 'text-muted hover:bg-surface hover:text-navy-900')}
                  >
                    {tab === 'open' ? t('admin.staff.openTab', { count: data.assignedCases.open.length }) : t('admin.staff.closedTab', { count: data.assignedCases.closed.length })}
                  </button>
                ))}
              </div>
            }
          >
            <CaseRows cases={data.assignedCases[caseTab]} empty={caseTab === 'open' ? t('admin.staff.noOpen') : t('admin.staff.noClosed')} />
          </Panel>

          {/* Workspace */}
          <Panel
            title={t('admin.staff.workspace')}
            icon={FolderOpen}
            actions={workspace && <Link to={`/workspace/drive/f/${workspace.folderId}`} className="text-xs font-semibold text-brand-600 hover:underline">{t('admin.staff.goDocs')}</Link>}
          >
            {!workspace ? (
              <p className="text-sm text-muted">{t('admin.staff.noWorkspace')}</p>
            ) : (
              <div className="space-y-4">
                <dl className="divide-y divide-line">
                  <DefRow label={t('admin.staff.folder')}>{workspace.slug}</DefRow>
                  <DefRow label={t('admin.staff.file')}>{workspace.files}</DefRow>
                  <DefRow label={t('admin.staff.size')}>{formatBytes(workspace.bytes)}</DefRow>
                  <DefRow label={t('admin.staff.lastUpload')}>{workspace.lastUploadAt ? fmtRelative(workspace.lastUploadAt) : '—'}</DefRow>
                </dl>
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-navy-900">
                    <Share2 className="size-3.5 text-muted" aria-hidden /> {t('admin.staff.sharedWith')}
                  </p>
                  {workspace.sharedWith.length === 0 ? (
                    <p className="text-xs text-muted">{t('admin.staff.notShared')}</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {workspace.sharedWith.map((g) => (
                        <li key={g.user.id} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs">
                          <span className="text-navy-900">{fullName(g.user)}</span>
                          <ToneBadge tone={DOC_ACCESS_TONE[g.access]} className="text-[10px]">
                            {docAccessLabel(g.access)}
                          </ToneBadge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-navy-900">
                    <FolderOpen className="size-3.5 text-muted" aria-hidden /> {t('admin.staff.otherAccess')}
                  </p>
                  {workspace.accessTo.length === 0 ? (
                    <p className="text-xs text-muted">{t('admin.staff.noOtherAccess')}</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {workspace.accessTo.map((g) => (
                        <li key={g.folder.id}>
                          <Link to={`/workspace/drive/f/${g.folder.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs transition hover:border-brand-400">
                            <span className="text-navy-900">{fullName(g.folder.owner)}</span>
                            <ToneBadge tone={DOC_ACCESS_TONE[g.access]} className="text-[10px]">
                              {docAccessLabel(g.access)}
                            </ToneBadge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </Panel>

          {/* Audit */}
          <Panel title={t('admin.staff.auditTitle')} icon={ScrollText} actions={<Link to="/admin/docs/audit" className="text-xs font-semibold text-brand-600 hover:underline">{t('admin.layout.audit')}</Link>}>
            {data.audit.length === 0 ? (
              <p className="text-sm text-muted">{t('admin.staff.noAudit')}</p>
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {audit.map((a) => (
                    <li key={a.id} className="py-2 text-xs">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-semibold text-navy-900">{auditActionLabel(a.action)}</span>
                        {a.target && <span className="font-mono text-muted">{a.target}</span>}
                      </p>
                      {a.details && <p className="mt-0.5 line-clamp-2 break-all text-muted">{detailsText(a.details)}</p>}
                      <p className="mt-0.5 text-[11px] text-muted">
                        {fmtDateTime(a.createdAt)}
                        {a.ip && ` · ${a.ip}`}
                      </p>
                    </li>
                  ))}
                </ul>
                {data.audit.length > 10 && (
                  <button type="button" className="mt-2 inline-flex min-h-10 items-center text-xs font-semibold text-brand-600 hover:underline" onClick={() => setAllAudit((v) => !v)}>
                    {allAudit ? t('admin.common.showLess') : t('admin.common.showAll', { count: data.audit.length })}
                  </button>
                )}
              </>
            )}
          </Panel>
        </div>
      </div>
      <DeleteUserDialog user={deleting ? user : null} onClose={() => setDeleting(false)} onDeleted={() => navigate('/admin/users', { replace: true })} />
    </div>
  );
}
