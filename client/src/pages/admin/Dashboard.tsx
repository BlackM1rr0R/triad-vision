import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Activity, ArrowRight, BadgeCheck, CalendarClock, Clock, FileCheck2, FolderOpen, Hourglass, Inbox, Lock, MapPin, MessageSquareWarning, Scale, Sparkles, Timer, UserCheck, UserPlus } from 'lucide-react';
import { Counter } from '@/components/motion';
import { api } from '@/lib/api';
import { FINAL, STAFF_ACTION, STATUS_BAR_TONE } from '@/lib/caseStatus';
import type { CaseStatus } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { ALL_STATUSES, INQUIRY_STATUSES, eventLabel, fmtDateTime, fmtDays, fmtRelative, fullName, inquiryStatusLabel, statusLabel, type InquiryStatus } from '@/components/admin/labels';
import type { DashboardResponse } from '@/components/admin/types';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { BarList } from '@/components/admin/charts';

const INQUIRY_TONE: Record<InquiryStatus, string> = { NEW: 'bg-brand-500', IN_PROGRESS: 'bg-amber-400', DONE: 'bg-emerald-500', ARCHIVED: 'bg-slate-400' };

const BAR_TONE = STATUS_BAR_TONE;

const Kpi = ({
  label,
  value,
  icon: IconCmp,
  tone,
  to,
  hint,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone: string;
  to?: string;
  hint?: string;
}) => {
  const body = (
    <div className="flex h-full items-start justify-between gap-3 rounded-xl border border-line bg-white p-4 transition sm:p-5 hover:border-brand-400/60 hover:shadow-[0_8px_24px_-14px_rgba(11,31,68,0.35)]">
      <div className="min-w-0">
        <p className="text-xs leading-snug font-medium text-muted">{label}</p>
        <p className="mt-1.5 font-display text-2xl font-bold text-navy-900 tabular-nums sm:text-3xl">
          {typeof value === 'number' ? <Counter to={value} /> : value}
        </p>
        {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
      </div>
      <span className={clsx('grid size-9 shrink-0 place-items-center rounded-lg', tone)}>
        <IconCmp className="size-[18px]" aria-hidden />
      </span>
    </div>
  );
  return to ? (
    <Link to={to} className="block h-full rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
};

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => (await api.get<DashboardResponse>('/admin/dashboard')).data,
    refetchInterval: 120_000,
  });

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;

  const count = (s: CaseStatus) => data.counts[s] ?? 0;
  const total = ALL_STATUSES.reduce((a, s) => a + count(s), 0);
  const active = ALL_STATUSES.filter((s) => !FINAL.includes(s)).reduce((a, s) => a + count(s), 0);
  const awaitingStaff = STAFF_ACTION.reduce((a, s) => a + count(s), 0);
  const max = Math.max(1, ...ALL_STATUSES.map(count));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('admin.dashboard.morning') : hour < 18 ? t('admin.dashboard.afternoon') : t('admin.dashboard.evening');

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHead
        title={`${greeting}, ${user?.firstName ?? ''}`}
        subtitle={t('admin.dashboard.subtitle')}
        actions={
          <Link to="/admin/cases" className="btn-primary btn-sm">
            {t('admin.dashboard.allCases')} <ArrowRight className="size-3.5" />
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi label={t('admin.dashboard.activeCases')} value={active} icon={FolderOpen} tone="bg-brand-100 text-brand-700" to="/admin/cases" hint={t('admin.dashboard.total', { count: total })} />
        <Kpi label={t('admin.dashboard.awaiting')} value={awaitingStaff} icon={Clock} tone="bg-amber-100 text-amber-700" hint={t('admin.dashboard.awaitingHint')} />
        <Kpi label={t('admin.dashboard.newInquiries')} value={data.newInquiries} icon={Inbox} tone="bg-violet-100 text-violet-700" to="/admin/inquiries" />
        <Kpi label={t('admin.dashboard.newClients30')} value={data.newClients30d} icon={UserPlus} tone="bg-emerald-100 text-emerald-700" to="/admin/users?role=CLIENT" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi label={t('admin.dashboard.myOpen')} value={data.myOpenCases} icon={UserCheck} tone="bg-brand-100 text-brand-700" to="/admin/cases?mine=1" />
        <Kpi
          label={t('admin.dashboard.unanswered')}
          value={data.unansweredClientMessages}
          icon={MessageSquareWarning}
          tone={data.unansweredClientMessages > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}
          to="/admin/cases"
          hint={t('admin.dashboard.unansweredHint')}
        />
        <Kpi label={t('admin.dashboard.docsPending')} value={data.docsPending} icon={FileCheck2} tone={data.docsPending > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'} to="/admin/cases?status=DOCUMENTS_REVIEW" />
        <Kpi label={t('admin.dashboard.overdue')} value={data.waitingOverdue3d} icon={Hourglass} tone={data.waitingOverdue3d > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'} to="/admin/cases?overdue=1" hint={t('admin.dashboard.overdueHint')} />
        <Kpi label={t('admin.dashboard.new7d')} value={data.casesNew7d} icon={Sparkles} tone="bg-violet-100 text-violet-700" to="/admin/cases" />
        <Kpi
          label={t('admin.dashboard.decided30')}
          value={`${data.decided30d.APPROVED ?? 0} / ${data.decided30d.REJECTED ?? 0}`}
          icon={Scale}
          tone="bg-emerald-100 text-emerald-700"
          hint={t('admin.dashboard.decidedHint')}
          to="/admin/cases?status=APPROVED"
        />
        <Kpi label={t('admin.dashboard.avgDecision')} value={fmtDays(data.avgDaysToDecision)} icon={Timer} tone="bg-sky-100 text-sky-700" hint={t('admin.dashboard.avgDecisionHint')} />
        <Kpi label={t('admin.dashboard.upcoming')} value={data.appointments.length} icon={CalendarClock} tone="bg-violet-100 text-violet-700" hint={t('admin.dashboard.next14')} to="/admin/cases?status=APPOINTMENT_SCHEDULED" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel title={t('admin.dashboard.byStatus')} icon={BadgeCheck} actions={<span className="text-xs text-muted tabular-nums">{t('admin.dashboard.casesCount', { count: total })}</span>}>
          <ul className="space-y-2.5">
            {ALL_STATUSES.map((s) => {
              const n = count(s);
              return (
                <li key={s}>
                  <Link
                    to={`/admin/cases?status=${s}`}
                    className="group grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2rem] items-center gap-3 rounded-md py-0.5 text-sm sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_3rem]"
                  >
                    <span className="truncate text-xs text-ink/80 group-hover:text-navy-900 sm:text-sm">{statusLabel(s)}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-surface" aria-hidden>
                      <span
                        className={clsx('block h-full rounded-full transition-[width] duration-700 ease-out', BAR_TONE[s])}
                        style={{ width: `${n === 0 ? 0 : Math.max(3, (n / max) * 100)}%` }}
                      />
                    </span>
                    <span className="text-right font-semibold text-navy-900 tabular-nums">{n}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel
          title={t('admin.dashboard.waitingTitle')}
          icon={Clock}
          bodyClassName="p-0"
          actions={<span className="badge bg-amber-100 text-amber-800 tabular-nums">{data.waiting.length}</span>}
        >
          {data.waiting.length === 0 ? (
            <EmptyState icon={BadgeCheck} title={t('admin.dashboard.allGood')}>
              {t('admin.dashboard.noWaiting')}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {data.waiting.map((c) => (
                <li key={c.id}>
                  <Link to={`/admin/cases/${c.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface sm:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-navy-900">
                        <span className="shrink-0 font-mono text-xs text-muted">{c.number}</span>
                        <span className="truncate">{fullName(c.client)}</span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {c.profession} · {fmtRelative(c.updatedAt)}
                      </p>
                    </div>
                    <StatusBadge status={c.status} className="hidden sm:inline-flex" />
                    <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel title={t('admin.dashboard.upcoming')} icon={CalendarClock} bodyClassName="p-0" actions={<span className="text-xs text-muted">{t('admin.dashboard.next14')}</span>}>
          {data.appointments.length === 0 ? (
            <EmptyState icon={CalendarClock} title={t('admin.dashboard.noUpcoming')}>
              {t('admin.dashboard.noUpcomingText')}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {data.appointments.map((a) => (
                <li key={a.id}>
                  <Link to={`/admin/cases/${a.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface sm:px-6">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700">
                      <CalendarClock className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-navy-900">
                        <span className="shrink-0 font-mono text-xs text-muted">{a.number}</span>
                        <span className="truncate">{fullName(a.client)}</span>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                        <span className="font-medium text-ink/80">{fmtDateTime(a.appointmentAt)}</span>
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

        <Panel title={t('admin.dashboard.inquiriesByStatus')} icon={Inbox} actions={<Link to="/admin/inquiries" className="text-xs font-semibold text-brand-600 hover:underline">{t('admin.dashboard.goInquiries')}</Link>}>
          <BarList
            rows={INQUIRY_STATUSES.map((s) => ({
              key: s,
              label: <Link to={`/admin/inquiries?status=${s}`} className="hover:text-navy-900">{inquiryStatusLabel(s)}</Link>,
              value: data.inquiriesByStatus[s] ?? 0,
              tone: INQUIRY_TONE[s],
            }))}
          />
        </Panel>
      </div>

      <Panel title={t('admin.dashboard.recent')} icon={Activity} bodyClassName="p-0">
        {data.recentEvents.length === 0 ? (
          <EmptyState icon={Activity} title={t('admin.dashboard.noActivity')} />
        ) : (
          <ol className="divide-y divide-line">
            {data.recentEvents.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-5 py-3 sm:px-6">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="font-semibold text-navy-900">{eventLabel(e.type)}</span>
                    {e.toStatus && e.type !== 'CASE_CREATED' && <span className="text-muted"> → {statusLabel(e.toStatus)}</span>}
                    {!e.visibleToClient && (
                      <span className="badge ml-2 bg-slate-100 align-middle whitespace-nowrap text-slate-600">
                        <Lock className="size-3" aria-hidden /> {t('admin.common.internal')}
                      </span>
                    )}
                  </p>
                  {e.note && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{e.note}</p>}
                  <p className="mt-1 text-[11px] text-muted">
                    <Link to={`/admin/cases/${e.case.id}`} className="font-mono font-semibold text-brand-600 hover:underline">
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
    </div>
  );
}
