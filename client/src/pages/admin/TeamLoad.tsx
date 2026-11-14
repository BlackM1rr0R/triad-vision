import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlarmClock, CalendarDays, FolderKanban, Gauge, ListTodo, MessageSquareWarning, Palmtree, UserX, Users } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesStaffDesk } from '@/i18n/pagesStaffDesk';
import { useAuth } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { Chip, EmptyState, ErrorBlock, KpiCell, KpiStrip, ListSkeleton, PageHead } from '@/components/admin/ui';
import { fmtDate, fullName, roleLabel } from '@/components/admin/labels';
import { Avatar } from '@/components/ui/Avatar';
import { useWorkload, type CapacityLevel, type WorkloadRow } from '@/components/staffDesk/api';

registerCopy(pagesStaffDesk);

const LEVEL: Record<CapacityLevel, { bar: string; text: string }> = {
  low: { bar: 'bg-success', text: 'text-success-fg' },
  ok: { bar: 'bg-primary', text: 'text-link' },
  high: { bar: 'bg-warning', text: 'text-warning-fg' },
  over: { bar: 'bg-danger', text: 'text-danger-fg' },
};
type Sort = 'capacity' | 'overdue' | 'unanswered' | 'name';
const ROLES: (Role | '')[] = ['', 'STAFF', 'ADMIN', 'SUPER_ADMIN'];

/**
 * Admin → Komanda → Yüklənmə: per staff member open cases, overdue items, open tasks, unanswered client messages,
 * this week's appointments and a capacity bar (open cases against the personal maximum). ADMIN+ see the team,
 * STAFF their own card (the KPI rule). Each number opens the matching list.
 */
export default function AdminTeamLoad() {
  const { t } = useTranslation();
  usePageTitle(t('sd.load.title'));
  const { user } = useAuth();
  const admin = hasMinRole(user?.role, 'ADMIN');
  const [role, setRole] = useState<Role | ''>('');
  const [sort, setSort] = useState<Sort>('capacity');
  const { data, isLoading, error, refetch } = useWorkload(admin ? role : '');

  const rows = useMemo(() => {
    const list = [...(data?.rows ?? [])];
    const by: Record<Sort, (a: WorkloadRow, b: WorkloadRow) => number> = {
      capacity: (a, b) => b.capacityPct - a.capacityPct || b.weighted - a.weighted,
      overdue: (a, b) => b.overdue - a.overdue,
      unanswered: (a, b) => b.unanswered - a.unanswered,
      name: (a, b) => fullName(a).localeCompare(fullName(b)),
    };
    return list.sort(by[sort]);
  }, [data, sort]);

  const week = data ? `${fmtDate(data.week.from)} – ${fmtDate(new Date(new Date(data.week.to).getTime() - 1).toISOString())}` : '';

  return (
    <div className="space-y-5">
      <PageHead title={t('sd.load.title')} subtitle={data ? t('sd.load.subtitle', { week }) : t('sd.load.subtitleShort')} />

      {admin && data?.totals && (
        <KpiStrip cols={6}>
          <KpiCell label={t('sd.load.kpi.staff')} value={data.totals.staff} icon={Users} />
          <KpiCell label={t('sd.load.kpi.active')} value={data.totals.activeCases} icon={FolderKanban} to="/admin/cases?scope=open" />
          <KpiCell label={t('sd.load.kpi.unassigned')} value={data.unassigned ?? 0} icon={UserX} tone={data.unassigned ? 'warning' : undefined} to="/admin/cases?assignee=none&scope=open" />
          <KpiCell label={t('sd.load.kpi.overdue')} value={data.totals.overdue} icon={AlarmClock} tone={data.totals.overdue ? 'danger' : undefined} />
          <KpiCell label={t('sd.load.kpi.unanswered')} value={data.totals.unanswered} icon={MessageSquareWarning} tone={data.totals.unanswered ? 'warning' : undefined} />
          <KpiCell label={t('sd.load.kpi.over')} value={data.totals.overCapacity} icon={Gauge} tone={data.totals.overCapacity ? 'danger' : undefined} hint={t('sd.load.kpi.overHint')} />
        </KpiStrip>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {admin &&
          ROLES.map((r) => (
            <Chip key={r || 'all'} active={role === r} onClick={() => setRole(r)}>
              {r ? roleLabel(r) : t('sd.load.allRoles')}
            </Chip>
          ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted">
          {t('sd.load.sort')}
          <select className="input min-h-9 w-auto py-1 text-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {(['capacity', 'overdue', 'unanswered', 'name'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`sd.load.sorts.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!admin && <p className="rounded-lg border border-line bg-surface/60 px-3 py-2 text-xs text-muted">{t('sd.load.selfOnly')}</p>}

      {isLoading ? (
        <ListSkeleton rows={4} cols={4} />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : !rows.length ? (
        <EmptyState icon={Users} title={t('sd.load.empty')} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((r) => (
            <StaffCard key={r.id} r={r} meId={user?.id ?? ''} />
          ))}
        </ul>
      )}
    </div>
  );
}

const Metric = ({ label, value, to, tone, icon: Icon }: { label: string; value: number; to: string; tone?: 'danger' | 'warning'; icon: typeof Users }) => (
  <Link to={to} className="group flex min-w-0 flex-col rounded-lg border border-line px-2.5 py-2 transition-colors hover:border-line-strong hover:bg-sunken/50">
    <span className="flex items-center gap-1 text-[11px] text-muted">
      <Icon className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{label}</span>
    </span>
    <span className={clsx('num text-lg font-semibold tabular-nums', value > 0 && tone === 'danger' ? 'text-danger-fg' : value > 0 && tone === 'warning' ? 'text-warning-fg' : 'text-ink')}>{value}</span>
  </Link>
);

const StaffCard = ({ r, meId }: { r: WorkloadRow; meId: string }) => {
  const { t } = useTranslation();
  const name = fullName(r);
  const lv = LEVEL[r.level];
  const enc = encodeURIComponent(r.id);
  const a = r.appointmentsByType;
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)]">
      <div className="flex items-center gap-3">
        <Avatar name={name} size="md" />
        <div className="min-w-0 flex-1">
          <Link to={`/admin/cases?assignee=${enc}&scope=open`} className="block truncate font-semibold text-ink hover:text-link">
            {name} {r.id === meId && <span className="text-xs font-normal text-muted">({t('sd.load.you')})</span>}
          </Link>
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            {roleLabel(r.role)}
            {r.absentUntil && (
              <span className="inline-flex items-center gap-1 rounded bg-warning-bg px-1.5 font-semibold text-warning-fg">
                <Palmtree className="size-3" aria-hidden /> {t('sd.load.absent', { date: fmtDate(r.absentUntil) })}
              </span>
            )}
          </p>
        </div>
        <span className={clsx('num shrink-0 text-right text-sm font-semibold tabular-nums', lv.text)} title={t(`sd.load.levels.${r.level}`)}>
          {r.capacityPct}%
          <span className="block text-[10px] font-normal text-muted">{t(`sd.load.levels.${r.level}`)}</span>
        </span>
      </div>

      <div>
        <div className="h-2 overflow-hidden rounded-full bg-sunken" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, r.capacityPct)} aria-label={t('sd.load.capacityAria', { name, pct: r.capacityPct })}>
          <span className={clsx('block h-full rounded-full transition-[width]', lv.bar)} style={{ width: `${Math.min(100, r.capacityPct)}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-muted tabular-nums">
          {t('sd.load.capacity', { open: r.activeCases, max: r.capacity })}
          {!r.capacityCustom && ` · ${t('sd.load.defaultCapacity')}`} · {t('sd.load.weighted', { value: r.weighted })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metric label={t('sd.load.m.active')} value={r.activeCases} icon={FolderKanban} to={`/admin/cases?assignee=${enc}&scope=open`} />
        <Metric label={t('sd.load.m.overdue')} value={r.overdue} icon={AlarmClock} tone="danger" to={`/admin/tasks?scope=all&assignee=${enc}`} />
        <Metric label={t('sd.load.m.tasks')} value={r.openTasks} icon={ListTodo} to={`/admin/tasks?scope=all&assignee=${enc}`} />
        <Metric label={t('sd.load.m.unanswered')} value={r.unanswered} icon={MessageSquareWarning} tone="warning" to={`/admin/cases?assignee=${enc}&scope=open`} />
        <Metric label={t('sd.load.m.week')} value={r.appointments} icon={CalendarDays} to={`/workspace/calendar?mode=ops&staff=${enc}&view=week`} />
      </div>
      {r.appointments > 0 && (
        <p className="-mt-1 text-[11px] text-muted">
          {[a.embassy && t('sd.load.appt.embassy', { count: a.embassy }), a.interview && t('sd.load.appt.interview', { count: a.interview }), a.consultation && t('sd.load.appt.consultation', { count: a.consultation }), a.arrival && t('sd.load.appt.arrival', { count: a.arrival })]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {r.overdue > 0 && (
        <p className="-mt-1 text-[11px] text-muted">
          {t('sd.load.overdueSplit', { tasks: r.overdueTasks, client: r.overdueClientTasks })}
        </p>
      )}
    </li>
  );
};
