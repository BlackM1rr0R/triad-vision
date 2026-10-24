import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, LayoutGrid } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { DashboardResponse } from '@/components/admin/types';
import { ErrorBlock, PageHead } from '@/components/admin/ui';
import { Skeleton } from '@/components/ui/Skeleton';
import { useStaffNav } from '@/components/command/navPrefs'; // module toggles hide widgets of switched-off modules
import { registerCopy } from '@/i18n';
import { pagesAdminUx } from '@/i18n/pagesAdminUx';
import { availableWidgets } from '@/components/dashboard/widgets'; // widget registry (ids, sizes, role / module rules)
import { useDashboardLayout } from '@/components/dashboard/layout'; // personal order / sizes / hidden (server + localStorage)
import { DashboardGrid } from '@/components/dashboard/DashboardGrid';

registerCopy(pagesAdminUx);

/** Same footprint as TodayCard while its chunk loads, so the KPI grid below does not jump (CLS). */
const TodayCardFallback = ({ rows }: { rows: number }) => (
  <div className="min-w-0 rounded-2xl border border-line bg-card" aria-hidden>
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

/** Whole-page placeholder with the dashboard's real grid (head, today card, two KPI rows, two panels). */
const DashboardSkeleton = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6 lg:space-y-8" role="status" aria-label={t('admin.common.loading')}>
      <div className="flex flex-wrap items-end justify-between gap-3" aria-hidden>
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>
      <TodayCardFallback rows={4} />
      {[0, 1].map((row) => (
        <div key={row} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex h-full items-start justify-between gap-3 rounded-xl border border-line bg-card p-4 sm:p-5">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-8 w-16" />
              </div>
              <Skeleton className="size-9 shrink-0" />
            </div>
          ))}
        </div>
      ))}
      <div className="grid grid-cols-1 gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]" aria-hidden>
        {[0, 1].map((i) => (
          <div key={i} className="space-y-3 rounded-xl border border-line bg-card p-4 sm:p-5">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 6 }, (_, r) => (
              <Skeleton key={r} className="h-4 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { modules } = useStaffNav();
  const [editing, setEditing] = useState(false);
  const defs = useMemo(() => availableWidgets(user?.role, modules), [user?.role, modules]);
  const layout = useDashboardLayout(defs);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => (await api.get<DashboardResponse>('/admin/dashboard')).data,
    refetchInterval: 120_000,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('admin.dashboard.morning') : hour < 18 ? t('admin.dashboard.afternoon') : t('admin.dashboard.evening');

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHead
        title={`${greeting}, ${user?.firstName ?? ''}`}
        subtitle={t('admin.dashboard.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={editing ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
              {editing ? <Check className="size-3.5" aria-hidden /> : <LayoutGrid className="size-3.5" aria-hidden />}
              {editing ? t('ux.dashboard.done') : t('ux.dashboard.edit')}
            </button>
            {!editing && (
              <>
                <Link to="/admin/today" className="btn-ghost btn-sm">
                  {t('admin.nav.today')} <ArrowRight className="size-3.5" />
                </Link>
                <Link to="/admin/cases" className="btn-primary btn-sm">
                  {t('admin.dashboard.allCases')} <ArrowRight className="size-3.5" />
                </Link>
              </>
            )}
          </div>
        }
      />

      <DashboardGrid
        items={layout.items}
        defs={defs}
        ctx={{ data, role: user?.role }}
        editing={editing}
        onChange={layout.save}
        onReset={layout.reset}
        isCustom={layout.isCustom}
      />
    </div>
  );
}
