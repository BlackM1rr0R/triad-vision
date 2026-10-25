import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FileCheck2,
  FolderOpen,
  Gauge,
  Mail,
  RefreshCw,
  ScrollText,
  Search,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { api, formatBytes } from '@/lib/api';
import type { Role } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { ToneBadge } from '@/components/admin/StatusBadge';
import { ROLE_TONE, dayIso, fmtDate, fmtDateTime, fmtDayShort, fmtDays, fmtMinutes, fullName, roleLabel } from '@/components/admin/labels';
import type { ActivityResponse, OversightStaffRow, OversightSummary } from '@/components/admin/types';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, OnlineDot, PageHead, Panel, StatTile } from '@/components/admin/ui';
import { ACCENT, BarChart, CRITICAL, LineChart, SERIES_COLORS, type Series } from '@/components/admin/charts';

const RANGES = [7, 14, 30, 90] as const;

const SERIES_KEYS = ['logins', 'caseEvents', 'messages', 'documents', 'inquiries', 'newClients', 'newCases', 'workspaceUploads'] as const;
const DEFAULT_HIDDEN = ['inquiries', 'newClients', 'workspaceUploads'];

const dayTitle = (d: string) => fmtDate(dayIso(d));
const dayShort = (d: string) => fmtDayShort(dayIso(d));

// ─── Activity section ──────────────────────────────────────────────────

const ActivitySection = () => {
  const { t } = useTranslation();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set(DEFAULT_HIDDEN));
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin-oversight-activity', days],
    queryFn: async () => (await api.get<ActivityResponse>('/admin/oversight/activity', { params: { days } })).data,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const series = useMemo<Series[]>(() => SERIES_KEYS.map((key, i) => ({ key, label: t(`admin.oversight.series.${key}`), color: SERIES_COLORS[i] })), [t]);

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const points = useMemo(() => (data?.series ?? []).map((p) => ({ x: p.day, values: p as unknown as Record<string, number> })), [data]);
  const staffHours = useMemo(
    () => (data?.series ?? []).map((p) => ({ label: dayShort(p.day), title: dayTitle(p.day), value: Math.round((p.staffActiveMinutes / 60) * 10) / 10 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, t],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const failed = useMemo(() => (data?.series ?? []).map((p) => ({ label: dayShort(p.day), title: dayTitle(p.day), value: p.failedLogins })), [data, t]);
  const totals = useMemo(() => {
    const s = data?.series ?? [];
    return {
      hours: Math.round(s.reduce((a, p) => a + p.staffActiveMinutes, 0) / 60),
      failed: s.reduce((a, p) => a + p.failedLogins, 0),
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <Panel
        title={t('admin.oversight.dailyActivity')}
        icon={Activity}
        actions={
          <div className="flex items-center gap-1.5">
            {isFetching && !isLoading && <Spinner className="size-3.5 text-link" />}
            {RANGES.map((r) => (
              <Chip key={r} active={days === r} onClick={() => setDays(r)}>
                {t('admin.common.days', { count: r })}
              </Chip>
            ))}
          </div>
        }
      >
        {isLoading ? (
          <LoadingBlock className="min-h-[240px]" />
        ) : error ? (
          <ErrorBlock error={error} onRetry={() => refetch()} />
        ) : (
          <div className={clsx('transition-opacity', isFetching && 'opacity-60')}>
            <LineChart points={points} series={series} hidden={hidden} onToggle={toggle} xLabel={dayShort} xTitle={dayTitle} ariaLabel={t('admin.oversight.activityAria', { count: days })} />
          </div>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t('admin.oversight.staffHours')} icon={Users} actions={<span className="text-xs text-muted tabular-nums">{t('admin.oversight.totalHours', { count: totals.hours })}</span>}>
          {data && (
            <div className={clsx('transition-opacity', isFetching && 'opacity-60')}>
              <BarChart
                bars={staffHours}
                color={ACCENT}
                format={(v) => t('admin.oversight.hoursValue', { value: v })}
                ariaLabel={t('admin.oversight.staffHoursAria', { count: days })}
                tableLabel={t('admin.oversight.hour')}
              />
            </div>
          )}
        </Panel>
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <ShieldAlert className="size-3.5 text-danger-fg" aria-hidden /> {t('admin.oversight.failedLogins')}
            </span>
          }
          actions={<span className="text-xs text-muted tabular-nums">{t('admin.oversight.total', { count: totals.failed })}</span>}
        >
          {data && (
            <div className={clsx('transition-opacity', isFetching && 'opacity-60')}>
              <BarChart bars={failed} color={CRITICAL} ariaLabel={t('admin.oversight.failedAria', { count: days })} tableLabel={t('admin.oversight.attempt')} />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
};

// ─── Staff table ───────────────────────────────────────────────────────

type SortKey =
  | 'name'
  | 'activeMinutes7d'
  | 'activeMinutes30d'
  | 'activeDays30d'
  | 'logins30d'
  | 'caseActions30d'
  | 'documentsReviewed30d'
  | 'messages30d'
  | 'workspaceUploads30d'
  | 'adminActions30d'
  | 'assignedOpen'
  | 'workspaceFiles';

/** Sortable columns with the key of their label under admin.oversight.col. */
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'activeMinutes7d', label: 'active7' },
  { key: 'activeMinutes30d', label: 'active30' },
  { key: 'activeDays30d', label: 'activeDays' },
  { key: 'logins30d', label: 'logins' },
  { key: 'caseActions30d', label: 'caseActions' },
  { key: 'documentsReviewed30d', label: 'docsReviewed' },
  { key: 'messages30d', label: 'messages' },
  { key: 'workspaceUploads30d', label: 'uploads' },
  { key: 'adminActions30d', label: 'adminActions' },
  { key: 'assignedOpen', label: 'assigned' },
  { key: 'workspaceFiles', label: 'workspace' },
];

const sortValue = (r: OversightStaffRow, k: SortKey): number | string =>
  k === 'name' ? fullName(r).toLowerCase() : k === 'workspaceFiles' ? (r.workspace?.files ?? -1) : r[k];

type Sort = { key: SortKey; dir: 'asc' | 'desc' };

const SortHead = ({ k, sort, onSort, align = 'right', children }: { k: SortKey; sort: Sort; onSort: (k: SortKey) => void; align?: 'left' | 'right'; children: string }) => {
  const active = sort.key === k;
  return (
    <th className={clsx('px-3 py-2.5', align === 'right' && 'text-right')} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className={clsx('inline-flex min-h-8 items-center gap-1 rounded px-1 whitespace-nowrap hover:text-ink', active && 'text-ink')}>
        {children}
        {active ? sort.dir === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden /> : <ArrowUpDown className="size-3 opacity-50" aria-hidden />}
      </button>
    </th>
  );
};

const Num = ({ v, strong }: { v: number; strong?: boolean }) => (
  <td className={clsx('px-3 py-3 text-right tabular-nums', v === 0 ? 'text-muted' : strong ? 'font-semibold text-ink' : 'text-ink')}>{v}</td>
);

const StaffTable = ({ staff }: { staff: OversightStaffRow[] }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>({ key: 'activeMinutes30d', dir: 'desc' });

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = staff.filter((r) => !s || fullName(r).toLowerCase().includes(s) || r.email.toLowerCase().includes(s) || roleLabel(r.role).toLowerCase().includes(s));
    return [...list].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? c : -c;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, q, sort, t]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));

  return (
    <Panel
      title={t('admin.oversight.staffTitle')}
      icon={Users}
      bodyClassName="p-0"
      actions={
        <label className="relative">
          <span className="sr-only">{t('admin.oversight.searchStaff')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" className="input min-h-8 w-48 py-1 pl-8 text-xs sm:w-56" placeholder={t('admin.oversight.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={Users} title={t('admin.oversight.noStaff')} />
      ) : (
        <>
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="border-b border-line bg-surface/70 text-xs font-medium whitespace-nowrap text-muted">
                <tr>
                  <SortHead k="name" sort={sort} onSort={toggleSort} align="left">
                    {t('admin.oversight.staffCol')}
                  </SortHead>
                  {COLUMNS.map((c) => (
                    <SortHead key={c.key} k={c.key} sort={sort} onSort={toggleSort}>
                      {t(`admin.oversight.col.${c.label}`)}
                    </SortHead>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className={clsx('cursor-pointer transition hover:bg-primary/[0.04]', !r.isActive && 'bg-sunken text-muted')} onClick={() => navigate(`/admin/oversight/staff/${r.id}`)}>
                    <td className="px-3 py-3">
                      <Link to={`/admin/oversight/staff/${r.id}`} className="font-semibold whitespace-nowrap text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                        {fullName(r)}
                      </Link>
                      <p className="mt-0.5 flex items-center gap-2">
                        <ToneBadge tone={ROLE_TONE[r.role]} className="text-[10px]">
                          {roleLabel(r.role)}
                        </ToneBadge>
                        {!r.isActive && <ToneBadge tone="bg-line text-muted" className="text-[10px]">{t('admin.common.inactive')}</ToneBadge>}
                        <OnlineDot online={r.online} lastSeenAt={r.lastSeenAt} />
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap text-ink tabular-nums">{fmtMinutes(r.activeMinutes7d)}</td>
                    <td className="px-3 py-3 text-right font-semibold whitespace-nowrap text-ink tabular-nums">{fmtMinutes(r.activeMinutes30d)}</td>
                    <Num v={r.activeDays30d} />
                    <Num v={r.logins30d} />
                    <Num v={r.caseActions30d} strong />
                    <Num v={r.documentsReviewed30d} />
                    <Num v={r.messages30d} />
                    <Num v={r.workspaceUploads30d} />
                    <Num v={r.adminActions30d} />
                    <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                      <span className="font-semibold text-ink">{r.assignedOpen}</span>
                      <span className="text-muted"> / {r.assignedClosed}</span>
                    </td>
                    <td className="px-3 py-3 text-right text-xs whitespace-nowrap">
                      {r.workspace ? (
                        <Link to={`/workspace/drive/f/${r.workspace.folderId}`} className="inline-flex items-center gap-1 text-link hover:underline" onClick={(e) => e.stopPropagation()}>
                          <FolderOpen className="size-3.5" aria-hidden />
                          <span className="tabular-nums">
                            {t('admin.common.files', { count: r.workspace.files })} · {formatBytes(r.workspace.bytes)}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-line xl:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link to={`/admin/oversight/staff/${r.id}`} className={clsx('block px-4 py-3.5 transition hover:bg-sunken', !r.isActive && 'opacity-70')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{fullName(r)}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2">
                        <ToneBadge tone={ROLE_TONE[r.role]} className="text-[10px]">
                          {roleLabel(r.role)}
                        </ToneBadge>
                        <OnlineDot online={r.online} lastSeenAt={r.lastSeenAt} />
                      </p>
                    </div>
                    <span className="shrink-0 text-right text-xs">
                      <span className="block font-semibold text-ink tabular-nums">{fmtMinutes(r.activeMinutes30d)}</span>
                      <span className="text-[10px] text-muted">{t('admin.oversight.active30short')}</span>
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-[11px] sm:grid-cols-5">
                    {[
                      [t('admin.oversight.short.active7'), fmtMinutes(r.activeMinutes7d)],
                      [t('admin.oversight.short.activeDays'), r.activeDays30d],
                      [t('admin.oversight.short.logins'), r.logins30d],
                      [t('admin.oversight.short.actions'), r.caseActions30d],
                      [t('admin.oversight.short.docs'), r.documentsReviewed30d],
                      [t('admin.oversight.short.messages'), r.messages30d],
                      [t('admin.oversight.short.uploads'), r.workspaceUploads30d],
                      [t('admin.oversight.short.admin'), r.adminActions30d],
                      [t('admin.oversight.short.openClosed'), `${r.assignedOpen} / ${r.assignedClosed}`],
                      [t('admin.oversight.short.workspace'), r.workspace ? `${r.workspace.files} · ${formatBytes(r.workspace.bytes)}` : '—'],
                    ].map(([k, v]) => (
                      <div key={String(k)} className="min-w-0">
                        <dt className="truncate text-muted">{k}</dt>
                        <dd className="font-semibold text-ink tabular-nums">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────

const ROLES: Role[] = ['CLIENT', 'STAFF', 'ADMIN', 'SUPER_ADMIN'];

export default function Oversight() {
  const { t } = useTranslation();
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin-oversight-summary'],
    queryFn: async () => (await api.get<OversightSummary>('/admin/oversight/summary')).data,
    refetchInterval: 60_000,
  });

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;

  const { users, cases, documents, workspaces, emails30d, security } = data;
  const approved = cases.decided30d.APPROVED ?? 0;
  const rejected = cases.decided30d.REJECTED ?? 0;

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHead
        title={t('admin.nav.oversight')}
        subtitle={t('admin.oversight.subtitle', { date: fmtDateTime(data.generatedAt) })}
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />} {t('admin.common.refresh')}
            </button>
            <Link to="/admin/docs/audit" className="btn-secondary btn-sm">
              <ScrollText className="size-3.5" /> {t('admin.layout.audit')}
            </Link>
          </>
        }
      />

      <section aria-label={t('admin.oversight.usersSection')} className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-muted uppercase">
          <Users className="size-3.5" aria-hidden /> {t('admin.oversight.usersSection')}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile label={t('admin.oversight.totalUsers')} value={users.total} to="/admin/users" hint={ROLES.map((r) => `${roleLabel(r)}: ${users.byRole[r] ?? 0}`).join(' · ')} />
          <StatTile
            label={t('admin.oversight.onlineNow')}
            value={users.clientsOnline + users.staffOnline}
            hint={t('admin.oversight.onlineHint', { clients: users.clientsOnline, staff: users.staffOnline, sessions: users.sessionsLive })}
            to="/admin/users?online=1"
          />
          <StatTile label={t('admin.oversight.newClients')} value={users.clientsNew30d} hint={t('admin.oversight.last7and30', { d7: users.clientsNew7d, d30: users.clientsNew30d })} to="/admin/users?role=CLIENT" />
          <StatTile label={t('admin.oversight.activeClients')} value={users.clientsActive30d} hint={t('admin.oversight.last7and30', { d7: users.clientsActive7d, d30: users.clientsActive30d })} />
        </div>
      </section>

      <section aria-label={t('admin.oversight.casesSection')} className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-muted uppercase">
          <Gauge className="size-3.5" aria-hidden /> {t('admin.oversight.casesSection')}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile label={t('admin.oversight.totalCases')} value={cases.total} hint={t('admin.oversight.newCasesHint', { d7: cases.new7d, d30: cases.new30d })} to="/admin/cases" />
          <StatTile label={t('admin.oversight.approvalRate')} value={cases.approvalRate === null ? '—' : `${cases.approvalRate}%`} hint={t('admin.oversight.approvalHint', { approved, rejected })} />
          <StatTile label={t('admin.dashboard.avgDecision')} value={fmtDays(cases.avgDaysToDecision)} hint={t('admin.dashboard.avgDecisionHint')} />
          <StatTile
            label={t('admin.dashboard.overdue')}
            value={cases.waitingOverdue3d}
            tone={cases.waitingOverdue3d > 0 ? 'warn' : undefined}
            hint={t('admin.oversight.appointmentsHint', { count: cases.appointmentsNext7d })}
            to="/admin/cases?overdue=1"
          />
        </div>
      </section>

      <section aria-label={t('admin.oversight.docsSection')} className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-muted uppercase">
          <FileCheck2 className="size-3.5" aria-hidden /> {t('admin.oversight.docsSection')}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile
            label={t('admin.oversight.clientDocs')}
            value={documents.total}
            hint={t('admin.oversight.clientDocsHint', { pending: documents.byStatus.PENDING ?? 0, accepted: documents.byStatus.ACCEPTED ?? 0, rejected: documents.byStatus.REJECTED ?? 0 })}
            tone={(documents.byStatus.PENDING ?? 0) > 0 ? 'warn' : undefined}
          />
          <StatTile label={t('admin.oversight.workspaces')} value={workspaces.files} hint={t('admin.oversight.workspacesHint', { folders: workspaces.folders, size: formatBytes(workspaces.bytes) })} to="/admin/docs" />
          <StatTile
            label={t('admin.oversight.emails')}
            value={emails30d.SENT ?? 0}
            hint={`${t('admin.oversight.emailsHint', { sent: emails30d.SENT ?? 0, failed: emails30d.FAILED ?? 0 })}${emails30d.CONSOLE ? t('admin.oversight.emailsConsole', { count: emails30d.CONSOLE }) : ''}`}
            tone={(emails30d.FAILED ?? 0) > 0 ? 'danger' : undefined}
            icon={Mail}
          />
          <StatTile
            label={t('admin.oversight.failedLogin24')}
            value={security.loginFailed24h}
            hint={t('admin.oversight.auditHint', { count: security.auditEntries30d })}
            tone={security.loginFailed24h > 0 ? 'danger' : undefined}
            to="/admin/docs/audit?action=LOGIN_FAILED"
            icon={ShieldAlert}
          />
        </div>
      </section>

      <ActivitySection />

      <StaffTable staff={data.staff} />
    </div>
  );
}
