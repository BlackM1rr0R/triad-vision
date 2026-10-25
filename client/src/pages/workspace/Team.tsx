import { lazy, Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Tabs } from '@/components/ui/Tabs';
import { ArrowRightLeft, CalendarRange, ClipboardCheck, Gauge, GraduationCap, Palmtree, Search, Users } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesWorkspace } from '@/i18n/pagesWorkspace';
import { pagesTeam } from '@/i18n/pagesTeam';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { useRealtime } from '@/lib/realtime';
import { type LeaveRequest, useLeave, useLeaveBalance, usePresence, useWorkspaceInvalidate } from '@/components/workspace/api';
import { PersonCard, StatusEditor } from '@/components/workspace/People';
import { BalanceStrip, LeaveDialog, LeaveMonthStrip, LeaveRow, NewLeaveButton } from '@/components/workspace/Leave';
import { Card, Chip, Empty, Skeleton, fullName } from '@/components/workspace/ui';
// Own assignment profile for automatic case assignment (own chunk).
const MyAssignmentCard = lazy(() => import('@/components/automation/MyAssignmentCard'));
// Team calendar, handover notes, training and the own KPI card (components/team, own chunks).
const ShiftCalendar = lazy(() => import('@/components/team/ShiftCalendar').then((m) => ({ default: m.ShiftCalendar })));
const HandoverPanel = lazy(() => import('@/components/team/Handover').then((m) => ({ default: m.HandoverPanel })));
const Learn = lazy(() => import('@/components/team/training/Learn').then((m) => ({ default: m.Learn })));
const MyKpi = lazy(() => import('@/components/team/MyKpi'));

registerCopy(pagesWorkspace);
registerCopy(pagesTeam);

const TABS = ['people', 'leave', 'shifts', 'handover', 'learn', 'kpi'] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON = { people: Users, leave: Palmtree, shifts: CalendarRange, handover: ArrowRightLeft, learn: GraduationCap, kpi: Gauge };

/** Team directory (presence, statuses) and leave requests, with an approvals queue for admins. */
export default function WorkspaceTeam() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const inv = useWorkspaceInvalidate();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  usePageTitle(t('ws.team.title'));
  const tab: Tab = (TABS as readonly string[]).includes(sp.get('tab') ?? '') ? (sp.get('tab') as Tab) : 'people';
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; editing: LeaveRequest | null }>({ open: false, editing: null });

  const presence = usePresence();
  useRealtime('presence.updated', () => inv.presence());
  const now = useMemo(() => Date.now(), [presence.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine = useLeave(user ? { userId: user.id } : {}, tab === 'leave');
  const pending = useLeave({ status: 'PENDING' }, tab === 'leave' && isAdmin);
  const balance = useLeaveBalance();

  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = presence.data?.people ?? [];
    const filtered = q ? all.filter((p) => fullName(p).toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || (p.statusText ?? '').toLowerCase().includes(q)) : all;
    return [...filtered].sort((a, b) => Number(b.online) - Number(a.online) || fullName(a).localeCompare(fullName(b)));
  }, [presence.data, search]);
  const me = presence.data?.people.find((p) => p.id === user?.id);
  const onlineCount = presence.data?.people.filter((p) => p.online).length ?? 0;
  const queue = (pending.data ?? []).filter((l) => l.userId !== user?.id);

  const setTab = (next: Tab) =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (next === 'people') n.delete('tab');
        else n.set('tab', next);
        return n;
      },
      { replace: true },
    );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-line bg-card px-4 pt-4 pb-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden size-10 place-items-center rounded-xl bg-primary text-primary-contrast shadow-[var(--tv-shadow-card)] sm:grid">
              <Users className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 type-page-title">
                {t('ws.team.title')}
                {presence.data && <span className="rounded-full bg-sunken px-2 py-0.5 font-sans text-xs font-semibold text-muted tabular-nums ring-1 ring-line">{t('ws.team.onlineCount', { count: onlineCount })}</span>}
              </h1>
              <p className="hidden truncate text-xs text-muted sm:block">{t('ws.team.subtitle')}</p>
            </div>
          </div>
          <Tabs
            variant="pills"
            label={t('ws.team.tabs.people')}
            items={TABS.map((k) => ({
              key: k,
              icon: TAB_ICON[k],
              label: (
                <>
                  {k === 'people' || k === 'leave' ? t(`ws.team.tabs.${k}`) : t(`team.wsTabs.${k}`)}
                  {k === 'leave' && isAdmin && queue.length > 0 && <Chip tone="warn">{queue.length}</Chip>}
                </>
              ),
            }))}
            value={tab}
            onChange={setTab}
          />
          {tab === 'people' ? (
            <label className="relative ml-auto w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('ws.team.search')} aria-label={t('ws.team.search')} className="input h-9 pl-9" />
            </label>
          ) : tab === 'leave' ? (
            <NewLeaveButton className="ml-auto h-9" onClick={() => setDialog({ open: true, editing: null })} />
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-sunken">
        <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 lg:px-6">
          {tab === 'shifts' || tab === 'handover' || tab === 'learn' || tab === 'kpi' ? (
            <Suspense fallback={<Skeleton className="h-64" />}>
              {tab === 'shifts' && <ShiftCalendar />}
              {tab === 'handover' && <HandoverPanel />}
              {tab === 'learn' && <Learn />}
              {tab === 'kpi' && <MyKpi />}
            </Suspense>
          ) : tab === 'people' ? (
            <>
              <StatusEditor me={me} />
              {presence.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
              ) : !people.length ? (
                <Empty icon={Users}>{t('ws.team.empty')}</Empty>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {people.map((p) => (
                    <PersonCard key={p.id} p={p} now={now} me={p.id === user?.id} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="grid gap-5 xl:grid-cols-3">
              <div className="space-y-5 xl:col-span-2">
                {isAdmin && (
                  <Card
                    icon={ClipboardCheck}
                    title={
                      <>
                        {t('ws.leave.approvals')}
                        {queue.length > 0 && <Chip tone="warn">{queue.length}</Chip>}
                      </>
                    }
                    bodyClassName="px-4 py-1 sm:px-5"
                  >
                    {pending.isLoading ? (
                      <Skeleton className="my-3 h-16" />
                    ) : !queue.length ? (
                      <Empty icon={ClipboardCheck} className="py-5">
                        {t('ws.leave.approvalsEmpty')}
                      </Empty>
                    ) : (
                      <ul className="divide-y divide-line">
                        {queue.map((l) => (
                          <LeaveRow key={l.id} l={l} mine={false} admin />
                        ))}
                      </ul>
                    )}
                  </Card>
                )}
                <Card icon={Palmtree} title={t('ws.leave.mine')} actions={<NewLeaveButton onClick={() => setDialog({ open: true, editing: null })} />} bodyClassName="px-4 py-1 sm:px-5">
                  {mine.isLoading ? (
                    <Skeleton className="my-3 h-16" />
                  ) : !mine.data?.length ? (
                    <Empty icon={Palmtree} className="py-5">
                      {t('ws.leave.empty')}
                    </Empty>
                  ) : (
                    <ul className="divide-y divide-line">
                      {mine.data.map((l) => (
                        <LeaveRow key={l.id} l={l} mine admin={isAdmin} onEdit={(x) => setDialog({ open: true, editing: x })} />
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
              <div className="space-y-5">
                <Card title={t('ws.leave.title')}>
                  <BalanceStrip balance={balance.data} />
                </Card>
                <Suspense fallback={null}>
                  <MyAssignmentCard />
                </Suspense>
              </div>
              <div className="xl:col-span-3">
                <LeaveMonthStrip />
              </div>
            </div>
          )}
        </div>
      </div>
      <LeaveDialog open={dialog.open} editing={dialog.editing} onClose={() => setDialog((d) => ({ ...d, open: false }))} />
    </div>
  );
}
