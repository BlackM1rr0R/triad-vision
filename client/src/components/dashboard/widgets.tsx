import { lazy, Suspense, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Activity, ArrowRight, BadgeCheck, CalendarClock, Clock, FileCheck2, FolderOpen, Hourglass, Inbox, Lock, MapPin, MessageSquareWarning, PieChart, Scale, Sparkles, Timer, UserCheck, UserPlus } from 'lucide-react';
import { STATUS_TONES, toneSolids } from '@/components/ui/status';
import { Counter } from '@/components/motion';
import { FINAL, STAFF_ACTION, STATUS_BAR_TONE } from '@/lib/caseStatus';
import { hasMinRole, type CaseStatus, type Role } from '@/lib/types';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { ALL_STATUSES, INQUIRY_STATUSES, eventLabel, fmtDateTime, fmtDays, fmtRelative, fullName, inquiryStatusLabel, statusLabel, type InquiryStatus } from '@/components/admin/labels';
import type { DashboardResponse } from '@/components/admin/types';
import { EmptyState, KpiCell, KpiStrip, Panel, SegmentBar } from '@/components/admin/ui';
import { BarList } from '@/components/admin/charts';
import { DonutChart } from '@/components/admin/chartKit';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { isVisible, moduleOn, navItemById, type ModuleFlags, type ModuleKey } from '@/components/command/navRegistry';
import type { WidgetMeta, WidgetSize } from './layout';

// Lazy widgets (own chunks), same as before the dashboard became customisable.
const MyTasksWidget = lazy(() => import('@/components/tasks/MyTasksWidget').then((m) => ({ default: m.MyTasksWidget })));
const InboxTodayWidget = lazy(() => import('@/components/aiMail/InboxTodayWidget'));
const RiskyCasesWidget = lazy(() => import('@/components/aiStaff/RiskyCasesWidget').then((m) => ({ default: m.RiskyCasesWidget })));
const TodayCard = lazy(() => import('@/components/today/TodayCard'));
const SecurityAlertsWidget = lazy(() => import('@/components/aiMgmt/SecurityAlertsWidget').then((m) => ({ default: m.SecurityAlertsWidget })));
const AssignmentLoadCard = lazy(() => import('@/components/automation/LoadCard'));

const INQUIRY_TONE: Record<InquiryStatus, string> = toneSolids(STATUS_TONES.inquiry);

export interface WidgetContext {
  data: DashboardResponse;
  role: Role | null | undefined;
}

export interface WidgetDef extends WidgetMeta {
  /** i18n key of the name in the layout editor / picker. */
  titleKey: string;
  icon: LucideIcon;
  /** Lowest role that sees it (default STAFF). */
  minRole?: Role;
  /** Optional module (System → Modules) the widget belongs to. */
  module?: ModuleKey;
  /** Hidden together with this page when the user cannot open it (navRegistry id). */
  navId?: string;
  render: (ctx: WidgetContext, size: WidgetSize) => ReactNode;
}

/** Same footprint as TodayCard while its chunk loads (no layout shift). */
const TodayCardFallback = ({ rows }: { rows: number }) => (
  <div className="min-w-0 rounded-xl border border-line bg-card" aria-hidden>
    <div className="h-[45px] border-b border-line" />
    <div className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-[52px] items-center px-4 sm:px-5">
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  </div>
);

const caseCount = (data: DashboardResponse, s: CaseStatus) => data.counts[s] ?? 0;

const KpisMain = ({ data }: { data: DashboardResponse }) => {
  const { t } = useTranslation();
  const total = ALL_STATUSES.reduce((a, s) => a + caseCount(data, s), 0);
  const openStatuses = ALL_STATUSES.filter((s) => !FINAL.includes(s));
  const active = openStatuses.reduce((a, s) => a + caseCount(data, s), 0);
  const awaitingStaff = STAFF_ACTION.reduce((a, s) => a + caseCount(data, s), 0);
  return (
    <KpiStrip>
      <KpiCell label={t('admin.dashboard.activeCases')} value={<Counter to={active} />} icon={FolderOpen} to="/admin/cases" hint={t('admin.dashboard.total', { count: total })}>
        <SegmentBar parts={openStatuses.map((s) => ({ key: s, value: caseCount(data, s), className: STATUS_BAR_TONE[s], title: `${statusLabel(s)}: ${caseCount(data, s)}` }))} />
      </KpiCell>
      <KpiCell label={t('admin.dashboard.awaiting')} value={<Counter to={awaitingStaff} />} icon={Clock} tone={awaitingStaff > 0 ? 'warning' : undefined} hint={t('admin.dashboard.awaitingHint')} />
      <KpiCell label={t('admin.dashboard.newInquiries')} value={<Counter to={data.newInquiries} />} icon={Inbox} to="/admin/inquiries" />
      <KpiCell label={t('admin.dashboard.newClients30')} value={<Counter to={data.newClients30d} />} icon={UserPlus} to="/admin/users?role=CLIENT" />
    </KpiStrip>
  );
};

const KpisMore = ({ data }: { data: DashboardResponse }) => {
  const { t } = useTranslation();
  return (
    <KpiStrip>
      <KpiCell label={t('admin.dashboard.myOpen')} value={<Counter to={data.myOpenCases} />} icon={UserCheck} to="/admin/cases?mine=1" />
      <KpiCell
        label={t('admin.dashboard.unanswered')}
        value={<Counter to={data.unansweredClientMessages} />}
        icon={MessageSquareWarning}
        tone={data.unansweredClientMessages > 0 ? 'danger' : undefined}
        to="/admin/cases"
        hint={t('admin.dashboard.unansweredHint')}
      />
      <KpiCell label={t('admin.dashboard.docsPending')} value={<Counter to={data.docsPending} />} icon={FileCheck2} tone={data.docsPending > 0 ? 'warning' : undefined} to="/admin/cases?status=DOCUMENTS_REVIEW" />
      <KpiCell label={t('admin.dashboard.overdue')} value={<Counter to={data.waitingOverdue3d} />} icon={Hourglass} tone={data.waitingOverdue3d > 0 ? 'danger' : undefined} to="/admin/cases?overdue=1" hint={t('admin.dashboard.overdueHint')} />
      <KpiCell label={t('admin.dashboard.new7d')} value={<Counter to={data.casesNew7d} />} icon={Sparkles} to="/admin/cases" />
      <KpiCell
        label={t('admin.dashboard.decided30')}
        value={`${data.decided30d.APPROVED ?? 0} / ${data.decided30d.REJECTED ?? 0}`}
        icon={Scale}
        hint={t('admin.dashboard.decidedHint')}
        to="/admin/cases?status=APPROVED"
      />
      <KpiCell label={t('admin.dashboard.avgDecision')} value={fmtDays(data.avgDaysToDecision)} icon={Timer} hint={t('admin.dashboard.avgDecisionHint')} />
      <KpiCell label={t('admin.dashboard.upcoming')} value={<Counter to={data.appointments.length} />} icon={CalendarClock} hint={t('admin.dashboard.next14')} to="/admin/cases?status=APPOINTMENT_SCHEDULED" />
    </KpiStrip>
  );
};

const ByStatus = ({ data }: { data: DashboardResponse }) => {
  const { t } = useTranslation();
  const total = ALL_STATUSES.reduce((a, s) => a + caseCount(data, s), 0);
  const max = Math.max(1, ...ALL_STATUSES.map((s) => caseCount(data, s)));
  return (
    <Panel className="h-full" title={t('admin.dashboard.byStatus')} icon={BadgeCheck} actions={<span className="text-xs text-muted tabular-nums">{t('admin.dashboard.casesCount', { count: total })}</span>}>
      <ul className="space-y-2.5">
        {ALL_STATUSES.map((s) => {
          const n = caseCount(data, s);
          return (
            <li key={s}>
              <Link to={`/admin/cases?status=${s}`} className="group grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2rem] items-center gap-3 rounded-md py-0.5 text-sm @lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_3rem]">
                <span className="truncate text-xs text-muted group-hover:text-ink @lg:text-[13px]">{statusLabel(s)}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
                  <span className={clsx('block h-full rounded-full transition-[width] duration-700 ease-out', STATUS_BAR_TONE[s])} style={{ width: `${n === 0 ? 0 : Math.max(3, (n / max) * 100)}%` }} />
                </span>
                <span className="num text-right text-[13px] font-medium text-ink">{n}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};

const Waiting = ({ data }: { data: DashboardResponse }) => {
  const { t } = useTranslation();
  return (
    <Panel className="h-full" title={t('admin.dashboard.waitingTitle')} icon={Clock} bodyClassName="p-0" actions={<Badge tone="warning" pill>{data.waiting.length}</Badge>}>
      {data.waiting.length === 0 ? (
        <EmptyState icon={BadgeCheck} title={t('admin.dashboard.allGood')}>
          {t('admin.dashboard.noWaiting')}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {data.waiting.map((c) => (
            <li key={c.id}>
              <Link to={`/admin/cases/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-sunken/60 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
                    <span className="code-id shrink-0 text-xs text-muted">{c.number}</span>
                    <span className="truncate">{fullName(c.client)}</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {c.profession} · {fmtRelative(c.updatedAt)}
                  </p>
                </div>
                <StatusBadge status={c.status} className="hidden @md:inline-flex" />
                <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};

const Appointments = ({ data }: { data: DashboardResponse }) => {
  const { t } = useTranslation();
  return (
    <Panel className="h-full" title={t('admin.dashboard.upcoming')} icon={CalendarClock} bodyClassName="p-0" actions={<span className="text-xs text-muted">{t('admin.dashboard.next14')}</span>}>
      {data.appointments.length === 0 ? (
        <EmptyState icon={CalendarClock} title={t('admin.dashboard.noUpcoming')}>
          {t('admin.dashboard.noUpcomingText')}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {data.appointments.map((a) => (
            <li key={a.id}>
              <Link to={`/admin/cases/${a.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-sunken/60 sm:px-5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sunken text-muted">
                  <CalendarClock className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
                    <span className="code-id shrink-0 text-xs text-muted">{a.number}</span>
                    <span className="truncate">{fullName(a.client)}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                    <span className="num font-medium text-ink">{fmtDateTime(a.appointmentAt)}</span>
                    {a.appointmentPlace && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="size-3 shrink-0" aria-hidden />
                        <span className="truncate">{a.appointmentPlace}</span>
                      </span>
                    )}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};

const InquiriesBars = ({ data }: { data: DashboardResponse }) => {
  const { t } = useTranslation();
  return (
    <Panel
      className="h-full"
      title={t('admin.dashboard.inquiriesByStatus')}
      icon={Inbox}
      actions={
        <Link to="/admin/inquiries" className="text-xs font-semibold text-link hover:underline">
          {t('admin.dashboard.goInquiries')}
        </Link>
      }
    >
      <BarList
        rows={INQUIRY_STATUSES.map((s) => ({
          key: s,
          label: (
            <Link to={`/admin/inquiries?status=${s}`} className="hover:text-ink">
              {inquiryStatusLabel(s)}
            </Link>
          ),
          value: data.inquiriesByStatus[s] ?? 0,
          tone: INQUIRY_TONE[s],
        }))}
      />
    </Panel>
  );
};

const InquiriesDonut = ({ data }: { data: DashboardResponse }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Panel className="h-full" title={t('ux.dashboard.widgets.inquiriesDonut')} icon={PieChart}>
      <DonutChart
        ariaLabel={t('admin.dashboard.inquiriesByStatus')}
        size={160}
        slices={INQUIRY_STATUSES.map((s) => ({ key: s, label: inquiryStatusLabel(s), value: data.inquiriesByStatus[s] ?? 0, onSelect: () => navigate(`/admin/inquiries?status=${s}`) }))}
      />
    </Panel>
  );
};

const Recent = ({ data }: { data: DashboardResponse }) => {
  const { t } = useTranslation();
  return (
    <Panel className="h-full" title={t('admin.dashboard.recent')} icon={Activity} bodyClassName="p-0">
      {data.recentEvents.length === 0 ? (
        <EmptyState icon={Activity} title={t('admin.dashboard.noActivity')} />
      ) : (
        <ol className="divide-y divide-line">
          {data.recentEvents.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  <span className="font-semibold text-ink">{eventLabel(e.type)}</span>
                  {e.toStatus && e.type !== 'CASE_CREATED' && <span className="text-muted"> → {statusLabel(e.toStatus)}</span>}
                  {!e.visibleToClient && (
                    <span className="badge ml-2 bg-neutral-bg align-middle whitespace-nowrap text-neutral-fg">
                      <Lock className="size-3" aria-hidden /> {t('admin.common.internal')}
                    </span>
                  )}
                </p>
                {e.note && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{e.note}</p>}
                <p className="mt-1 text-[11px] text-muted">
                  <Link to={`/admin/cases/${e.case.id}`} className="code-id font-medium text-link hover:underline">
                    {e.case.number}
                  </Link>
                  {' · '}
                  {e.actor ? fullName(e.actor) : t('admin.common.system')}
                  {' · '}
                  {fmtRelative(e.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
};

const lazyBox = (node: ReactNode, fallback: ReactNode = null) => <Suspense fallback={fallback}>{node}</Suspense>;

/** Every dashboard widget, in the default order. Ids are stored in StaffPreferences.dashboardLayout: never rename. */
export const WIDGETS: WidgetDef[] = [
  { id: 'today', titleKey: 'ux.dashboard.widgets.today', icon: Clock, defaultSize: 'L', render: () => lazyBox(<TodayCard limit={4} />, <TodayCardFallback rows={4} />) },
  { id: 'kpis', titleKey: 'ux.dashboard.widgets.kpis', icon: FolderOpen, defaultSize: 'L', render: ({ data }) => <KpisMain data={data} /> },
  { id: 'kpisMore', titleKey: 'ux.dashboard.widgets.kpisMore', icon: Sparkles, defaultSize: 'L', render: ({ data }) => <KpisMore data={data} /> },
  { id: 'security', titleKey: 'ux.dashboard.widgets.security', icon: Lock, defaultSize: 'L', minRole: 'SUPER_ADMIN', render: () => lazyBox(<SecurityAlertsWidget />) },
  { id: 'inbox', titleKey: 'ux.dashboard.widgets.inbox', icon: Inbox, defaultSize: 'L', module: 'aiAssistant', render: () => lazyBox(<InboxTodayWidget />) },
  { id: 'tasks', titleKey: 'ux.dashboard.widgets.tasks', icon: BadgeCheck, defaultSize: 'L', render: () => lazyBox(<MyTasksWidget />) },
  {
    id: 'risky',
    titleKey: 'ux.dashboard.widgets.risky',
    icon: MessageSquareWarning,
    defaultSize: 'L',
    module: 'aiAssistant',
    render: ({ role }) => lazyBox(<RiskyCasesWidget showBriefing={hasMinRole(role, 'ADMIN')} />),
  },
  { id: 'load', titleKey: 'ux.dashboard.widgets.load', icon: UserCheck, defaultSize: 'L', minRole: 'ADMIN', render: () => lazyBox(<AssignmentLoadCard compact />) },
  { id: 'byStatus', titleKey: 'ux.dashboard.widgets.byStatus', icon: BadgeCheck, defaultSize: 'M', render: ({ data }) => <ByStatus data={data} /> },
  { id: 'waiting', titleKey: 'ux.dashboard.widgets.waiting', icon: Clock, defaultSize: 'M', render: ({ data }) => <Waiting data={data} /> },
  { id: 'appointments', titleKey: 'ux.dashboard.widgets.appointments', icon: CalendarClock, defaultSize: 'M', render: ({ data }) => <Appointments data={data} /> },
  { id: 'inquiries', titleKey: 'ux.dashboard.widgets.inquiries', icon: Inbox, defaultSize: 'M', navId: 'inquiries', render: ({ data }) => <InquiriesBars data={data} /> },
  { id: 'recent', titleKey: 'ux.dashboard.widgets.recent', icon: Activity, defaultSize: 'L', render: ({ data }) => <Recent data={data} /> },
  { id: 'inquiriesDonut', titleKey: 'ux.dashboard.widgets.inquiriesDonut', icon: PieChart, defaultSize: 'S', defaultHidden: true, navId: 'inquiries', render: ({ data }) => <InquiriesDonut data={data} /> },
];

/** Widgets this user may see (role, module toggles, page access). */
export const availableWidgets = (role: Role | null | undefined, modules: ModuleFlags | undefined) =>
  WIDGETS.filter((w) => {
    if (!hasMinRole(role, w.minRole ?? 'STAFF') || !moduleOn(modules, w.module)) return false;
    const nav = w.navId ? navItemById(w.navId) : undefined;
    return !nav || isVisible(nav, role, modules);
  });
