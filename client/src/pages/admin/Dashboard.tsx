import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Activity, ArrowRight, BadgeCheck, Clock, FolderOpen, Inbox, Lock, UserPlus } from 'lucide-react';
import { Counter } from '@/components/motion';
import { api } from '@/lib/api';
import { FINAL, STAFF_ACTION } from '@/lib/caseStatus';
import type { CaseStatus } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { ALL_STATUSES, STATUS_LABEL, eventLabel, fmtRelative, fullName } from '@/components/admin/labels';
import type { DashboardResponse } from '@/components/admin/types';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';

const BAR_TONE: Record<CaseStatus, string> = {
  DOCUMENTS_PENDING: 'bg-amber-400',
  DOCUMENTS_REVIEW: 'bg-brand-500',
  CONTRACT_SENT: 'bg-amber-400',
  CONTRACT_SIGNED: 'bg-brand-500',
  EMBASSY_DOCUMENTS: 'bg-amber-400',
  EMBASSY_REVIEW: 'bg-brand-500',
  APPOINTMENT_SCHEDULED: 'bg-violet-500',
  DECISION_PENDING: 'bg-sky-500',
  APPROVED: 'bg-emerald-500',
  REJECTED: 'bg-red-500',
  CANCELLED: 'bg-slate-400',
};

const Kpi = ({
  label,
  value,
  icon: IconCmp,
  tone,
  to,
  hint,
}: {
  label: string;
  value: number;
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
          <Counter to={value} />
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
  const greeting = hour < 12 ? 'Sabahınız xeyir' : hour < 18 ? 'Günortanız xeyir' : 'Axşamınız xeyir';

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHead
        title={`${greeting}, ${user?.firstName ?? ''}`}
        subtitle="Müraciətlərin ümumi vəziyyəti və sizin diqqətinizi tələb edən işlər."
        actions={
          <Link to="/admin/cases" className="btn-primary btn-sm">
            Bütün müraciətlər <ArrowRight className="size-3.5" />
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi label="Aktiv müraciətlər" value={active} icon={FolderOpen} tone="bg-brand-100 text-brand-700" to="/admin/cases" hint={`Cəmi ${total}`} />
        <Kpi label="Hərəkətinizi gözləyir" value={awaitingStaff} icon={Clock} tone="bg-amber-100 text-amber-700" hint="Yoxlama, təsdiq və qərar" />
        <Kpi label="Yeni sorğular" value={data.newInquiries} icon={Inbox} tone="bg-violet-100 text-violet-700" to="/admin/inquiries" />
        <Kpi label="Yeni müştərilər (30 gün)" value={data.newClients30d} icon={UserPlus} tone="bg-emerald-100 text-emerald-700" to="/admin/users?role=CLIENT" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel title="Statuslar üzrə bölgü" icon={BadgeCheck} actions={<span className="text-xs text-muted tabular-nums">{total} müraciət</span>}>
          <ul className="space-y-2.5">
            {ALL_STATUSES.map((s) => {
              const n = count(s);
              return (
                <li key={s}>
                  <Link
                    to={`/admin/cases?status=${s}`}
                    className="group grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2rem] items-center gap-3 rounded-md py-0.5 text-sm sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_3rem]"
                  >
                    <span className="truncate text-xs text-ink/80 group-hover:text-navy-900 sm:text-sm">{STATUS_LABEL[s]}</span>
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
          title="Sizin hərəkətinizi gözləyən müraciətlər"
          icon={Clock}
          bodyClassName="p-0"
          actions={<span className="badge bg-amber-100 text-amber-800 tabular-nums">{data.waiting.length}</span>}
        >
          {data.waiting.length === 0 ? (
            <EmptyState icon={BadgeCheck} title="Hər şey qaydasındadır">
              Hazırda yoxlama gözləyən müraciət yoxdur.
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

      <Panel title="Son fəaliyyət" icon={Activity} bodyClassName="p-0">
        {data.recentEvents.length === 0 ? (
          <EmptyState icon={Activity} title="Hələ fəaliyyət yoxdur" />
        ) : (
          <ol className="divide-y divide-line">
            {data.recentEvents.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-5 py-3 sm:px-6">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="font-semibold text-navy-900">{eventLabel(e.type)}</span>
                    {e.toStatus && e.type !== 'CASE_CREATED' && <span className="text-muted"> → {STATUS_LABEL[e.toStatus]}</span>}
                    {!e.visibleToClient && (
                      <span className="badge ml-2 bg-slate-100 align-middle whitespace-nowrap text-slate-600">
                        <Lock className="size-3" aria-hidden /> Daxili
                      </span>
                    )}
                  </p>
                  {e.note && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{e.note}</p>}
                  <p className="mt-1 text-[11px] text-muted">
                    <Link to={`/admin/cases/${e.case.id}`} className="font-mono font-semibold text-brand-600 hover:underline">
                      {e.case.number}
                    </Link>
                    {' · '}
                    {e.actor ? fullName(e.actor) : 'Sistem'}
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
