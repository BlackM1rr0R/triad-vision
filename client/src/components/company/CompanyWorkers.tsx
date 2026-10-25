import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, CalendarClock, Download, FileSpreadsheet, Handshake, Hourglass, PlaneLanding, Search, ShieldAlert, Users, Wrench } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesRequests } from '@/i18n/pagesRequests';
import { pagesEmployerWorkers } from '@/i18n/pagesEmployerWorkers';
import { useL10n } from '@/lib/l10n';
import { Table, type Column } from '@/components/ui/Table';
import { TONE_CLASS } from '@/components/ui/status';
import { buttonClass } from '@/components/ui/Button';
import { Employer, SearchEmpty } from '@/components/illustrations';
import { Empty, Kpi, Section } from './shared';
import { WorkerDrawer } from './WorkerDrawer';
import { WorkersSkeleton } from './WorkersSkeleton';
import { CompanyReports } from './CompanyReports';
import { CheckInCell, DateCell, RISK_TONE, useMilestoneText } from './workerCells';
import { PHASES, plannedArrival, type Phase, type WorkerRow, type WorkersResponse } from './workerTypes';

registerCopy(pagesRequests);
registerCopy(pagesEmployerWorkers);

type SortKey = 'phase' | 'name' | 'arrival' | 'title' | 'probation' | 'risk';
const SORTS: SortKey[] = ['phase', 'name', 'arrival', 'title', 'probation', 'risk'];

const PHASE_ICON: Record<Phase, typeof Hourglass> = { IN_PROCESS: Hourglass, TRAVELLING: PlaneLanding, WORKING: Wrench, LEFT: Users, CLOSED: Users };

const ts = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : Infinity);
const RISK_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export const CompanyWorkers = () => {
  const { t } = useTranslation();
  const { locale } = useL10n();
  const [params, setParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase | ''>('');
  const [q, setQ] = useState('');
  const [attention, setAttention] = useState(false);
  const [sort, setSort] = useState<SortKey>('phase');
  const reportsRef = useRef<HTMLDivElement>(null);
  const openId = params.get('worker');
  const milestone = useMilestoneText();

  const { data, isLoading } = useQuery({
    queryKey: ['company-workers'],
    queryFn: async () => (await api.get<WorkersResponse>('/company/workers')).data,
  });

  // ?view=reports (link in the monthly e-mail) scrolls to the reports list.
  useEffect(() => {
    if (data && params.get('view') === 'reports') reportsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [data, params]);

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('worker', id);
    else next.delete('worker');
    setParams(next, { replace: true });
  };

  const groups = useMemo(() => {
    let list = data?.items ?? [];
    if (phase) list = list.filter((w) => w.phase === phase);
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((w) => `${w.name} ${w.position} ${w.profession}`.toLowerCase().includes(needle));
    if (attention) list = list.filter((w) => w.nextAction !== 'NONE' || w.openItems.length > 0 || (w.risk && w.risk.level !== 'LOW'));
    const by: Record<SortKey, (a: WorkerRow, b: WorkerRow) => number> = {
      phase: (a, b) => b.openItems.length - a.openItems.length || (RISK_ORDER[a.risk?.level ?? ''] ?? 3) - (RISK_ORDER[b.risk?.level ?? ''] ?? 3) || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      arrival: (a, b) => ts(a.arrivedAt ?? plannedArrival(a)) - ts(b.arrivedAt ?? plannedArrival(b)),
      title: (a, b) => ts(a.title?.validUntil) - ts(b.title?.validUntil),
      probation: (a, b) => ts(a.probation?.endsAt) - ts(b.probation?.endsAt),
      risk: (a, b) => (RISK_ORDER[a.risk?.level ?? ''] ?? 3) - (RISK_ORDER[b.risk?.level ?? ''] ?? 3),
    };
    const sorted = [...list].sort(by[sort]);
    return PHASES.map((p) => ({ phase: p, rows: sorted.filter((w) => w.phase === p) })).filter((g) => g.rows.length);
  }, [data, phase, q, attention, sort]);

  const columns: Column<WorkerRow>[] = [
    {
      key: 'name',
      header: t('employerWorkers.cols.name'),
      primary: true,
      cell: (w) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold text-ink">{w.name}</span>
          <span className="truncate text-xs text-muted">{w.position}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: t('employerWorkers.cols.status'),
      cell: (w) => (
        <span className="flex flex-col gap-0.5">
          <span className="text-sm text-ink">{w.phase === 'IN_PROCESS' ? t(`requests.workers.stage.${w.stage}`) : t(`employerWorkers.phase.${w.phase}`)}</span>
          {milestone(w) && <span className="text-[11px] text-muted">{milestone(w)}</span>}
        </span>
      ),
    },
    { key: 'arrival', header: t('employerWorkers.cols.arrival'), hideBelow: 'md', cell: (w) => <DateCell iso={w.arrivedAt ?? plannedArrival(w)} /> },
    { key: 'title', header: t('employerWorkers.cols.title'), cell: (w) => <DateCell iso={w.title?.validUntil} warn={w.title?.warn} daysLeft={w.title?.daysLeft} /> },
    { key: 'probation', header: t('employerWorkers.cols.probation'), hideBelow: 'lg', cell: (w) => <DateCell iso={w.probation?.endsAt} warn={w.probation?.warn} daysLeft={w.probation?.daysLeft} /> },
    { key: 'checkIn', header: t('employerWorkers.cols.checkIn'), hideBelow: 'lg', cell: (w) => <CheckInCell w={w} /> },
    {
      key: 'risk',
      header: t('employerWorkers.cols.risk'),
      cell: (w) => (w.risk ? <span className={clsx('badge', TONE_CLASS[RISK_TONE[w.risk.level]])}>{t(`employerWorkers.risk.${w.risk.level}`)}</span> : <span className="text-muted">—</span>),
    },
    {
      key: 'open',
      header: t('employerWorkers.cols.open'),
      align: 'center',
      cell: (w) => (w.openItems.length ? <span className={clsx('badge tabular-nums', TONE_CLASS.warning)}>{w.openItems.length}</span> : <span className="text-muted">0</span>),
    },
    {
      key: 'nextAction',
      header: t('employerWorkers.cols.nextAction'),
      cell: (w) => <span className={clsx('text-xs', w.nextAction === 'NONE' ? 'text-muted' : 'font-semibold text-link')}>{t(`employerWorkers.action.${w.nextAction}`)}</span>,
    },
  ];

  if (isLoading || !data) return <WorkersSkeleton />;
  const s = data.summary;
  const counts = Object.fromEntries(PHASES.map((p) => [p, data.items.filter((w) => w.phase === p).length])) as Record<Phase, number>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label={t('employerWorkers.tiles.inProcess')} value={s.inProcess} icon={Hourglass} />
        <Kpi label={t('employerWorkers.tiles.arrivingThisMonth')} value={s.arrivingThisMonth} icon={PlaneLanding} tone="violet" />
        <Kpi label={t('employerWorkers.tiles.working')} value={s.working} icon={Handshake} tone="good" />
        <Kpi label={t('employerWorkers.tiles.probationSoon')} value={s.probationSoon} hint={t('employerWorkers.tileHints.probationSoon')} icon={CalendarClock} tone={s.probationSoon ? 'warn' : undefined} />
        <Kpi label={t('employerWorkers.tiles.titlesExpiring')} value={s.titlesExpiring} hint={t('employerWorkers.tileHints.titlesExpiring')} icon={ShieldAlert} tone={s.titlesExpiring ? 'warn' : undefined} />
        <Kpi label={t('employerWorkers.tiles.atRisk')} value={s.atRisk} hint={t('employerWorkers.tileHints.atRisk')} icon={AlertTriangle} tone={s.atRisk ? 'warn' : undefined} />
      </div>

      <Section
        title={t('employerWorkers.title')}
        icon={Handshake}
        actions={
          data.items.length > 0 && (
            <>
              <a href={`/api/company/workers/export.csv?lang=${locale}`} className={buttonClass({ variant: 'outline', size: 'sm' })} download>
                <Download className="size-4" aria-hidden /> {t('employerWorkers.exportCsv')}
              </a>
              <a href={`/api/company/workers/export.xlsx?lang=${locale}`} className={buttonClass({ variant: 'outline', size: 'sm' })} download>
                <FileSpreadsheet className="size-4" aria-hidden /> {t('employerWorkers.exportXlsx')}
              </a>
            </>
          )
        }
      >
        <p className="-mt-2 mb-5 text-sm text-muted">{t('employerWorkers.subtitle')}</p>
        {data.items.length === 0 ? (
          <Empty icon={Handshake} illustration={<Employer className="w-36" />} title={t('employerWorkers.empty')} text={t('employerWorkers.emptyText')} />
        ) : (
          <>
            <div className="mb-3 flex snap-x gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label={t('employerWorkers.sort.phase')}>
              {(['', ...PHASES] as (Phase | '')[]).map((p) =>
                p && !counts[p] ? null : (
                  <button
                    key={p || 'all'}
                    type="button"
                    aria-pressed={phase === p}
                    onClick={() => setPhase(p)}
                    className={clsx(
                      'inline-flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition-colors sm:min-h-10',
                      phase === p ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-muted hover:border-line-strong hover:text-ink',
                    )}
                  >
                    {p ? t(`employerWorkers.phase.${p}`) : t('employerWorkers.phaseAll')}
                    <span className={clsx('rounded-full px-1.5 text-[10px] tabular-nums', phase === p ? 'bg-primary-contrast/20' : 'bg-sunken text-muted')}>{p ? counts[p] : data.items.length}</span>
                  </button>
                ),
              )}
            </div>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <label className="relative min-w-0 flex-1 sm:max-w-xs">
                <span className="sr-only">{t('employerWorkers.search')}</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <input type="search" className="input pl-9 text-sm" placeholder={t('employerWorkers.search')} value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
              <button
                type="button"
                aria-pressed={attention}
                onClick={() => setAttention((v) => !v)}
                className={clsx('inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-semibold transition-colors', attention ? 'border-primary bg-primary text-primary-contrast' : 'border-line-strong bg-card text-ink hover:bg-sunken')}
              >
                <AlertTriangle className="size-4" aria-hidden /> {t('employerWorkers.attention')}
              </button>
              <div className="ml-auto flex items-center gap-2">
                <label htmlFor="ew-sort" className="text-xs font-semibold text-muted">
                  {t('employerWorkers.sortBy')}
                </label>
                <select id="ew-sort" className="input w-auto text-sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  {SORTS.map((k) => (
                    <option key={k} value={k}>
                      {t(`employerWorkers.sort.${k}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {groups.length === 0 ? (
              <Empty icon={Users} illustration={<SearchEmpty className="w-32" />} title={t('employerWorkers.noMatch')} />
            ) : (
              <div className="space-y-6">
                {groups.map((g) => {
                  const Icon = PHASE_ICON[g.phase];
                  return (
                    <div key={g.phase}>
                      <h3 className="type-card-title mb-2 flex items-center gap-2 text-ink">
                        <Icon className="size-4 text-primary" aria-hidden /> {t(`employerWorkers.phase.${g.phase}`)}
                        <span className="num rounded-full bg-sunken px-2 text-xs font-medium text-muted">{g.rows.length}</span>
                      </h3>
                      <div className="sm:overflow-hidden sm:rounded-2xl sm:border sm:border-line sm:bg-card">
                        <Table
                          columns={columns}
                          rows={g.rows}
                          rowKey={(w) => w.id}
                          stackOnMobile
                          dense
                          stickyHeader={false}
                          onRowClick={(w) => setOpen(w.id)}
                          rowClassName={() => 'cursor-pointer'}
                          caption={t(`employerWorkers.phase.${g.phase}`)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-5 text-[11px] text-muted">{t('employerWorkers.privacyNote')}</p>
          </>
        )}
      </Section>

      <div ref={reportsRef} className="scroll-mt-28">
        <CompanyReports />
      </div>

      <WorkerDrawer id={openId} onClose={() => setOpen(null)} />
    </div>
  );
};
