import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { m } from 'framer-motion';
import { AlertTriangle, Briefcase, CalendarRange, Clock3, Columns3, KanbanSquare, List, MailCheck, PlaneLanding, Search, Users, Workflow } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesEmployerPipeline } from '@/i18n/pagesEmployerPipeline';
import { pagesDashboards } from '@/i18n/pagesDashboards';
import { pagesEmployerWorkers } from '@/i18n/pagesEmployerWorkers';
import { useRealtime, useRealtimeStatus } from '@/lib/realtime';
import { fmtDate } from '@/components/admin/labels';
import { Switch } from '@/components/admin/ui';
import { toastJobsError } from '@/components/jobs/labels';
import { ErrorState } from '@/components/ui/ErrorState';
import { Tabs } from '@/components/ui/Tabs';
import { Table, type Column } from '@/components/ui/Table';
import { TONE_CLASS } from '@/components/ui/status';
import { Employer, SearchEmpty } from '@/components/illustrations';
import { Empty, Kpi, Section } from '@/components/company/shared';
import { WorkerDrawer } from '@/components/company/WorkerDrawer';
import { WorkersSkeleton } from '@/components/company/WorkersSkeleton';
import { monthLabel } from '@/components/company/CompanyReports';
import { PIPELINE_STAGES, type Blocker, type PipelineCard, type PipelineResponse, type PipelineStage } from './types';

registerCopy(pagesEmployerPipeline);
registerCopy(pagesEmployerWorkers);
registerCopy(pagesDashboards);

type View = 'board' | 'positions' | 'list' | 'timeline';
const VIEWS: View[] = ['board', 'positions', 'list', 'timeline'];

const STAGE_DOT: Record<PipelineStage, string> = {
  CONTRACT: 'bg-sky-500',
  RECOGNITION: 'bg-violet-500',
  EMBASSY: 'bg-amber-500',
  DECISION: 'bg-orange-500',
  FLIGHT: 'bg-indigo-500',
  ARRIVED: 'bg-teal-500',
  FIRST_DAY: 'bg-emerald-600',
};

const usePipelineText = () => {
  const { t } = useTranslation();
  const blocker = (b: Blocker) =>
    b.code === 'ACCELERATED_STEP' && b.params?.step
      ? t(`employerPipeline.accelerated.${b.params.step}`, { defaultValue: t('employerPipeline.blocker.ACCELERATED_STEP') })
      : t(`employerPipeline.blocker.${b.code}`, { open: b.params?.open ?? 0, total: b.params?.total ?? 0 });
  return { t, blocker };
};

/** Date with its source ("estimated", "travel plan" …). */
const DateWithSource = ({ value }: { value: PipelineCard['expectedArrival'] }) => {
  const { t } = useTranslation();
  if (!value) return <span className="text-muted">—</span>;
  const est = value.source === 'ESTIMATE';
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span className={clsx('tabular-nums', est ? 'text-muted' : 'font-medium text-ink')}>
        {est && '≈ '}
        {fmtDate(value.at)}
      </span>
      <span className={clsx('text-[11px]', est ? 'text-muted italic' : 'text-muted')}>{t(`employerPipeline.source.${value.source}`)}</span>
    </span>
  );
};

const BlockerList = ({ card, compact }: { card: PipelineCard; compact?: boolean }) => {
  const { t, blocker } = usePipelineText();
  if (!card.blockers.length) return compact ? null : <span className="text-xs text-muted">{t('employerPipeline.noBlockers')}</span>;
  return (
    <ul className="space-y-1">
      {card.blockers.map((b, i) => (
        <li key={`${b.code}-${i}`} className="flex items-start gap-1.5 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning-fg" aria-hidden />
          {b.link ? (
            <Link to={b.link} className="font-semibold text-link hover:underline" onClick={(e) => e.stopPropagation()}>
              {blocker(b)}
            </Link>
          ) : (
            <span className="font-semibold text-warning-fg">{blocker(b)}</span>
          )}
        </li>
      ))}
    </ul>
  );
};

const DaysBadge = ({ card }: { card: PipelineCard }) => {
  const { t } = useTranslation();
  return (
    <span
      className={clsx('badge tabular-nums', card.slow ? TONE_CLASS.warning : TONE_CLASS.neutral)}
      title={card.typicalDays ? `${t('employerPipeline.daysInStage', { count: card.daysInStage })} · ${t('employerPipeline.typical', { days: card.typicalDays })}` : undefined}
    >
      <Clock3 className="size-3" aria-hidden /> {t('employerPipeline.days', { count: card.daysInStage })}
    </span>
  );
};

const BoardCard = ({ card, onOpen }: { card: PipelineCard; onOpen: (id: string) => void }) => {
  const { t } = useTranslation();
  return (
    <li>
      <article className={clsx('rounded-xl border bg-card p-3 shadow-[var(--tv-shadow-card)] transition-colors', card.blockers.length ? 'border-warning-border' : 'border-line')}>
        <button type="button" onClick={() => onOpen(card.id)} className="block w-full text-left">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate font-semibold text-ink">{card.name}</span>
              <span className="block truncate text-xs text-muted">{card.position}</span>
            </span>
            <DaysBadge card={card} />
          </span>
          <span className="mt-2 block text-xs">
            <span className="text-muted">{t('employerPipeline.arrival')}: </span>
            <DateWithSource value={card.expectedArrival} />
          </span>
          {(card.stage === 'FLIGHT' || card.stage === 'ARRIVED') && card.firstWorkDay && (
            <span className="mt-0.5 block text-xs">
              <span className="text-muted">{t('employerPipeline.firstDay')}: </span>
              <DateWithSource value={card.firstWorkDay} />
            </span>
          )}
        </button>
        {card.blockers.length > 0 && (
          <div className="mt-2 border-t border-line pt-2">
            <BlockerList card={card} compact />
          </div>
        )}
      </article>
    </li>
  );
};

const Board = ({ cards, onOpen }: { cards: PipelineCard[]; onOpen: (id: string) => void }) => {
  const { t } = useTranslation();
  return (
    <div className="-mx-5 overflow-x-auto px-5 pb-2 sm:-mx-6 sm:px-6" role="region" aria-label={t('employerPipeline.views.board')} tabIndex={0}>
      <div className="flex min-w-max gap-3">
        {PIPELINE_STAGES.map((stage) => {
          const list = cards.filter((c) => c.stage === stage);
          return (
            <section key={stage} className="flex w-64 shrink-0 flex-col rounded-2xl bg-sunken p-2.5" aria-label={t(`employerPipeline.stage.${stage}`)}>
              <header className="mb-2 px-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className={clsx('size-2.5 rounded-full', STAGE_DOT[stage])} aria-hidden />
                  {t(`employerPipeline.stage.${stage}`)}
                  <span className="num ml-auto rounded-full bg-card px-2 text-xs font-medium text-muted">{list.length}</span>
                </h3>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">{t(`employerPipeline.stageHint.${stage}`)}</p>
              </header>
              {list.length ? (
                <ul className="space-y-2">
                  {list.map((c) => (
                    <BoardCard key={c.id} card={c} onOpen={onOpen} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-line-strong px-3 py-6 text-center text-xs text-muted">{t('employerPipeline.emptyColumn')}</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Candidates per vacancy: a row per position, a column per pipeline stage, the candidates' names in the cells. Read-only
 * (a name opens the same worker card as the board). Only what the board shows already: name, position, stage.
 */
const PositionBoard = ({ cards, onOpen }: { cards: PipelineCard[]; onOpen: (id: string) => void }) => {
  const { t } = useTranslation();
  const rows = useMemo(() => {
    const by = new Map<string, PipelineCard[]>();
    for (const c of cards) by.set(c.position, [...(by.get(c.position) ?? []), c]);
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [cards]);
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">{t('dash.board.empty')}</p>;
  return (
    <div className="-mx-5 overflow-x-auto px-5 pb-2 sm:-mx-6 sm:px-6" role="region" aria-label={t('dash.board.title')} tabIndex={0}>
      <p className="mb-3 text-xs text-muted">{t('dash.board.note')}</p>
      <table className="w-full min-w-[860px] border-separate border-spacing-1.5 text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th scope="col" className="w-44 px-2 py-1 text-left font-medium">
              {t('dash.board.position')}
            </th>
            {PIPELINE_STAGES.map((stage) => (
              <th key={stage} scope="col" className="px-2 py-1 text-left font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <span className={clsx('size-2.5 rounded-full', STAGE_DOT[stage])} aria-hidden />
                  {t(`employerPipeline.stage.${stage}`)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([position, list], ri) => (
            <m.tr key={position} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: ri * 0.05 }}>
              <th scope="row" className="rounded-xl bg-sunken px-3 py-2 text-left align-top">
                <span className="block font-semibold text-ink">{position}</span>
                <span className="text-xs font-normal text-muted">
                  {t('dash.board.total')}: <b className="text-ink tabular-nums">{list.length}</b>
                </span>
              </th>
              {PIPELINE_STAGES.map((stage) => {
                const here = list.filter((c) => c.stage === stage);
                return (
                  <td key={stage} className={clsx('rounded-xl p-1.5 align-top', here.length ? 'bg-sunken' : 'bg-sunken/40')} aria-label={t('dash.board.cell', { position, stage: t(`employerPipeline.stage.${stage}`), count: here.length })}>
                    <ul className="space-y-1">
                      {here.map((c) => (
                        <li key={c.id}>
                          <button type="button" onClick={() => onOpen(c.id)} className={clsx('w-full truncate rounded-lg border bg-card px-2 py-1 text-left text-xs font-medium text-ink hover:border-line-strong', c.blockers.length ? 'border-warning-border' : 'border-line')}>
                            {c.name}
                            {c.slow && <Clock3 className="ml-1 inline size-3 text-warning-fg" aria-hidden />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </td>
                );
              })}
            </m.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ListView = ({ cards, onOpen }: { cards: PipelineCard[]; onOpen: (id: string) => void }) => {
  const { t } = useTranslation();
  const columns: Column<PipelineCard>[] = [
    {
      key: 'name',
      header: t('employerPipeline.cols.name'),
      primary: true,
      cell: (c) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold text-ink">{c.name}</span>
          <span className="truncate text-xs text-muted">{c.position}</span>
        </span>
      ),
    },
    {
      key: 'stage',
      header: t('employerPipeline.cols.stage'),
      cell: (c) => (
        <span className="inline-flex items-center gap-2 text-sm text-ink">
          <span className={clsx('size-2 rounded-full', STAGE_DOT[c.stage])} aria-hidden />
          {t(`employerPipeline.stage.${c.stage}`)}
        </span>
      ),
    },
    { key: 'days', header: t('employerPipeline.cols.days'), cell: (c) => <DaysBadge card={c} /> },
    { key: 'arrival', header: t('employerPipeline.cols.arrival'), cell: (c) => <DateWithSource value={c.expectedArrival} /> },
    { key: 'firstDay', header: t('employerPipeline.cols.firstDay'), hideBelow: 'lg', cell: (c) => <DateWithSource value={c.firstWorkDay} /> },
    { key: 'blockers', header: t('employerPipeline.cols.blockers'), cell: (c) => <BlockerList card={c} /> },
  ];
  return (
    <div className="sm:overflow-hidden sm:rounded-2xl sm:border sm:border-line sm:bg-card">
      <Table columns={columns} rows={cards} rowKey={(c) => c.id} stackOnMobile dense stickyHeader={false} onRowClick={(c) => onOpen(c.id)} rowClassName={() => 'cursor-pointer'} caption={t('employerPipeline.title')} />
    </div>
  );
};

/** Gantt-like strip: one column per month, bar = confirmed + estimated arrivals, names below. */
const Timeline = ({ data, cards, onOpen }: { data: PipelineResponse; cards: PipelineCard[]; onOpen: (id: string) => void }) => {
  const { t, i18n } = useTranslation();
  const visible = new Set(cards.map((c) => c.id));
  const months = data.strip.map((m) => ({ ...m, ids: m.ids.filter((id) => visible.has(id)) }));
  const byId = new Map(cards.map((c) => [c.id, c]));
  const max = Math.max(1, ...months.map((m) => m.ids.length));
  const total = months.reduce((a, m) => a + m.ids.length, 0);
  return (
    <div>
      <p className="mb-4 text-sm text-muted">{t('employerPipeline.timeline.hint')}</p>
      {total === 0 ? (
        <p className="rounded-xl bg-sunken p-4 text-sm text-muted">{t('employerPipeline.timeline.none')}</p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 pb-2 sm:-mx-6 sm:px-6" role="region" aria-label={t('employerPipeline.timeline.title')} tabIndex={0}>
          <ol className="grid min-w-[56rem] grid-cols-12 gap-2">
            {months.map((m) => {
              const list = m.ids.map((id) => byId.get(id)!).filter(Boolean);
              const confirmed = list.filter((c) => c.expectedArrival?.source !== 'ESTIMATE').length;
              const estimated = list.length - confirmed;
              return (
                <li key={m.month} className="flex min-w-0 flex-col rounded-xl border border-line bg-card p-2">
                  <span className="text-[11px] font-semibold text-ink capitalize">{monthLabel(m.month, i18n.language)}</span>
                  <span className="mt-1 text-[11px] text-muted">{list.length ? t('employerPipeline.timeline.count', { count: list.length }) : '—'}</span>
                  <div className="mt-2 flex h-24 flex-col justify-end gap-0.5" aria-hidden>
                    {estimated > 0 && <div className="rounded-sm border border-dashed border-primary/60 bg-primary/15" style={{ height: `${(estimated / max) * 100}%` }} />}
                    {confirmed > 0 && <div className="rounded-sm bg-primary" style={{ height: `${(confirmed / max) * 100}%` }} />}
                  </div>
                  <ul className="mt-2 space-y-1">
                    {list.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => onOpen(c.id)}
                          className={clsx('w-full truncate rounded-md px-1.5 py-1 text-left text-[11px]', c.expectedArrival?.source === 'ESTIMATE' ? 'bg-sunken text-muted italic' : 'bg-primary/10 font-semibold text-ink')}
                          title={`${c.name} · ${fmtDate(c.expectedArrival?.at)} · ${t(`employerPipeline.source.${c.expectedArrival?.source ?? 'ESTIMATE'}`)}`}
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-primary" aria-hidden /> {t('employerPipeline.timeline.confirmed')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-dashed border-primary/60 bg-primary/15" aria-hidden /> {t('employerPipeline.timeline.estimated')}
        </span>
      </p>
    </div>
  );
};

/** Weekly e-mail digest switch of the signed-in portal user. */
const DigestPrefs = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['company-pipeline-prefs'],
    queryFn: async () => (await api.get<{ weeklyDigest: boolean }>('/company/pipeline/preferences')).data,
  });
  const save = useMutation({
    mutationFn: async (weeklyDigest: boolean) => (await api.put<{ weeklyDigest: boolean }>('/company/pipeline/preferences', { weeklyDigest })).data,
    onSuccess: (d) => {
      qc.setQueryData(['company-pipeline-prefs'], d);
      toast.success(t('employerPipeline.digest.saved'));
    },
    onError: toastJobsError,
  });
  return (
    <Section title={t('employerPipeline.digest.title')} icon={MailCheck}>
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted">{t('employerPipeline.digest.text')}</p>
        <Switch checked={data?.weeklyDigest ?? false} disabled={!data || save.isPending} onChange={(v) => save.mutate(v)} label={t('employerPipeline.digest.label')} />
      </div>
    </Section>
  );
};

/** /company/pipeline: every candidate of the company as a card moving through the stages (live via SSE). */
export const CompanyPipeline = () => {
  const { t } = usePipelineText();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const view: View = VIEWS.includes(params.get('view') as View) ? (params.get('view') as View) : 'board';
  const openId = params.get('worker');
  const [q, setQ] = useState('');
  const [onlyBlockers, setOnlyBlockers] = useState(false);
  const live = useRealtimeStatus() === 'open';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['company-pipeline'],
    queryFn: async () => (await api.get<PipelineResponse>('/company/pipeline')).data,
    // The SSE stream pushes changes; the slow poll only covers a closed stream.
    refetchInterval: live ? false : 120_000,
  });

  // A burst of stage changes (e.g. a bulk update) refetches once.
  const timer = useRef(0);
  useRealtime('pipeline.updated', () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void qc.invalidateQueries({ queryKey: ['company-pipeline'] });
      void qc.invalidateQueries({ queryKey: ['company-workers'] });
    }, 600);
  });

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const cards = useMemo(() => {
    let list = data?.cards ?? [];
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((c) => `${c.name} ${c.position} ${c.profession}`.toLowerCase().includes(needle));
    if (onlyBlockers) list = list.filter((c) => c.blockers.length > 0);
    return list;
  }, [data, q, onlyBlockers]);

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isLoading || !data) return <WorkersSkeleton />;
  const s = data.summary;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label={t('employerPipeline.tiles.total')} value={s.total} icon={Users} />
        <Kpi label={t('employerPipeline.tiles.withBlockers')} value={s.withBlockers} icon={AlertTriangle} tone={s.withBlockers ? 'warn' : undefined} />
        <Kpi label={t('employerPipeline.tiles.arrivingNext30')} value={s.arrivingNext30} icon={PlaneLanding} tone="violet" />
        <Kpi label={t('employerPipeline.tiles.slow')} value={s.slow} icon={Clock3} tone={s.slow ? 'warn' : undefined} />
      </div>

      <Section
        title={t('employerPipeline.title')}
        icon={Workflow}
        actions={
          <span className={clsx('badge', live ? TONE_CLASS.success : TONE_CLASS.neutral)} aria-live="polite">
            <span className={clsx('size-1.5 rounded-full', live ? 'animate-pulse bg-success' : 'bg-muted')} aria-hidden /> {t('employerPipeline.live')}
          </span>
        }
      >
        <p className="-mt-2 mb-5 text-sm text-muted">{t('employerPipeline.subtitle')}</p>
        {data.cards.length === 0 ? (
          <Empty icon={Workflow} illustration={<Employer className="w-36" />} title={t('employerPipeline.empty')} text={t('employerPipeline.emptyText')} />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Tabs
                label={t('employerPipeline.title')}
                variant="pills"
                value={view}
                onChange={(v) => setParam('view', v === 'board' ? null : v)}
                items={[
                  { key: 'board', label: t('employerPipeline.views.board'), icon: KanbanSquare },
                  { key: 'positions', label: t('dash.board.byPosition'), icon: Briefcase },
                  { key: 'list', label: t('employerPipeline.views.list'), icon: List },
                  { key: 'timeline', label: t('employerPipeline.views.timeline'), icon: CalendarRange },
                ]}
              />
              <label className="relative ml-auto min-w-0 flex-1 sm:max-w-xs">
                <span className="sr-only">{t('employerPipeline.search')}</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <input type="search" className="input pl-9 text-sm" placeholder={t('employerPipeline.search')} value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
              <button
                type="button"
                aria-pressed={onlyBlockers}
                onClick={() => setOnlyBlockers((v) => !v)}
                className={clsx(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-semibold transition-colors',
                  onlyBlockers ? 'border-primary bg-primary text-primary-contrast' : 'border-line-strong bg-card text-ink hover:bg-sunken',
                )}
              >
                <AlertTriangle className="size-4" aria-hidden /> {t('employerPipeline.onlyBlockers')}
              </button>
            </div>

            {cards.length === 0 ? (
              <Empty icon={Columns3} illustration={<SearchEmpty className="w-32" />} title={t('employerPipeline.noMatch')} />
            ) : view === 'positions' ? (
              <PositionBoard cards={cards} onOpen={(id) => setParam('worker', id)} />
            ) : view === 'list' ? (
              <ListView cards={cards} onOpen={(id) => setParam('worker', id)} />
            ) : view === 'timeline' ? (
              <Timeline data={data} cards={cards} onOpen={(id) => setParam('worker', id)} />
            ) : (
              <Board cards={cards} onOpen={(id) => setParam('worker', id)} />
            )}
            <p className="mt-5 text-[11px] text-muted">{t('employerPipeline.estimateNote')}</p>
            <p className="mt-1 text-[11px] text-muted">{t('employerPipeline.privacyNote')}</p>
          </>
        )}
      </Section>

      <DigestPrefs />

      <WorkerDrawer id={openId} onClose={() => setParam('worker', null)} />
    </div>
  );
};
