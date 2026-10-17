import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CalendarClock, CheckCircle2, Download, Gavel, Handshake, Hourglass, Landmark, PlaneLanding, ShieldCheck, Users, Video } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesRequests } from '@/i18n/pagesRequests';
import { useL10n } from '@/lib/l10n';
import type { CaseStatus, L10n } from '@/lib/types';
import { fmtDate, fmtDateTime } from '@/components/admin/labels';
import { Empty, Kpi, Loading, Section } from './shared';

registerCopy(pagesRequests);

type Stage = 'DOCUMENTS' | 'CONTRACT' | 'EMBASSY' | 'APPOINTMENT' | 'DECISION' | 'APPROVED' | 'ARRIVED' | 'REJECTED' | 'CANCELLED';
const STAGE_ORDER: Stage[] = ['DOCUMENTS', 'CONTRACT', 'EMBASSY', 'APPOINTMENT', 'DECISION', 'APPROVED', 'ARRIVED', 'REJECTED', 'CANCELLED'];

const STAGE_TONE: Record<Stage, { bar: string; pill: string }> = {
  DOCUMENTS: { bar: 'bg-slate-400', pill: 'bg-slate-100 text-slate-700' },
  CONTRACT: { bar: 'bg-sky-500', pill: 'bg-sky-100 text-sky-800' },
  EMBASSY: { bar: 'bg-indigo-500', pill: 'bg-indigo-100 text-indigo-800' },
  APPOINTMENT: { bar: 'bg-violet-500', pill: 'bg-violet-100 text-violet-800' },
  DECISION: { bar: 'bg-amber-500', pill: 'bg-amber-100 text-amber-800' },
  APPROVED: { bar: 'bg-emerald-500', pill: 'bg-emerald-100 text-emerald-800' },
  ARRIVED: { bar: 'bg-emerald-700', pill: 'bg-emerald-600 text-white' },
  REJECTED: { bar: 'bg-red-500', pill: 'bg-red-100 text-red-700' },
  CANCELLED: { bar: 'bg-slate-300', pill: 'bg-slate-200 text-slate-600' },
};

interface Worker {
  id: string;
  name: string;
  profession: string;
  visaType: string;
  status: CaseStatus;
  step: number;
  stage: Stage;
  stageSince: string;
  daysInStage: number;
  startedAt: string;
  appointmentAt: string | null;
  decisionAt: string | null;
  visaValidFrom: string | null;
  expectedDecision: { from: string; to: string } | null;
  arrival: { status: string; flightDate: string | null; arrivalTime: string | null } | null;
  nextInterview: { startsAt: string; endsAt: string; status: string } | null;
  timeline: { stage: Stage; at: string }[];
  vacancy: { id: string; title: L10n } | null;
  visa: { title: L10n; visaLabel: string } | null;
}

interface WorkersResponse {
  items: Worker[];
  stepCount: number;
  summary: { inProcess: number; approved: number; arrivingThisMonth: number; arrived: number };
}

type SortKey = 'started' | 'stage' | 'arrival' | 'days' | 'name';
const DAY = 24 * 60 * 60 * 1000;

const plannedArrival = (w: Worker) => w.arrival?.arrivalTime ?? w.arrival?.flightDate ?? null;
const ts = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

/** Gantt-like bar: each stage the case went through, on a shared time axis. */
const TimelineBar = ({ w, from, to, now }: { w: Worker; from: number; to: number; now: number }) => {
  const { t } = useTranslation();
  const span = Math.max(DAY, to - from);
  const pos = (x: number) => `${Math.max(0, Math.min(100, ((x - from) / span) * 100))}%`;
  const end = w.stage === 'ARRIVED' || w.stage === 'REJECTED' || w.stage === 'CANCELLED' ? ts(w.timeline.at(-1)!.at)! : now;
  const arrival = ts(plannedArrival(w));
  return (
    <div className="relative h-3 w-full rounded-full bg-surface ring-1 ring-line">
      {w.timeline.map((seg, i) => {
        const start = ts(seg.at)!;
        const stop = i + 1 < w.timeline.length ? ts(w.timeline[i + 1].at)! : Math.max(end, start + DAY / 2);
        return (
          <span
            key={`${seg.stage}-${seg.at}`}
            title={`${t(`requests.workers.stage.${seg.stage}`)} · ${fmtDate(seg.at)}`}
            className={clsx('absolute inset-y-0 rounded-full', STAGE_TONE[seg.stage].bar)}
            style={{ left: pos(start), width: `calc(${pos(stop)} - ${pos(start)})`, minWidth: 4 }}
          />
        );
      })}
      {arrival && w.stage !== 'ARRIVED' && (
        <span
          className="absolute -top-1 size-5 -translate-x-1/2 rounded-full border-2 border-card bg-emerald-600 text-white"
          style={{ left: pos(arrival) }}
          title={`${t('requests.workers.arrival')}: ${fmtDateTime(plannedArrival(w))}`}
        >
          <PlaneLanding className="m-auto mt-[2px] size-3" aria-hidden />
        </span>
      )}
      <span className="absolute -inset-y-1 w-px bg-navy-900/50" style={{ left: pos(now) }} aria-hidden />
    </div>
  );
};

export const CompanyWorkers = () => {
  const { t } = useTranslation();
  const { tr, locale } = useL10n();
  const [stage, setStage] = useState<Stage | ''>('');
  const [next30, setNext30] = useState(false);
  const [sort, setSort] = useState<SortKey>('started');
  const { data, isLoading } = useQuery({
    queryKey: ['company-workers'],
    queryFn: async () => (await api.get<WorkersResponse>('/company/workers')).data,
  });
  // Re-evaluated with each data load; enough for "today" in an employer panel.
  const now = useMemo(() => Date.now(), [data]);

  const items = useMemo(() => {
    let list = data?.items ?? [];
    if (stage) list = list.filter((w) => w.stage === stage);
    if (next30) {
      list = list.filter((w) => {
        const a = ts(plannedArrival(w));
        return w.stage === 'APPROVED' && a != null && a >= now - DAY && a <= now + 30 * DAY;
      });
    }
    const by: Record<SortKey, (a: Worker, b: Worker) => number> = {
      started: (a, b) => b.startedAt.localeCompare(a.startedAt),
      stage: (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || b.daysInStage - a.daysInStage,
      arrival: (a, b) => (ts(plannedArrival(a)) ?? Infinity) - (ts(plannedArrival(b)) ?? Infinity),
      days: (a, b) => b.daysInStage - a.daysInStage,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...list].sort(by[sort]);
  }, [data, stage, next30, sort, now]);

  const axis = useMemo(() => {
    if (!items.length) return { from: now - 30 * DAY, to: now + 30 * DAY };
    let from = now;
    let to = now + 14 * DAY;
    for (const w of items) {
      from = Math.min(from, ts(w.startedAt)!);
      const a = ts(plannedArrival(w));
      if (a) to = Math.max(to, a + 3 * DAY);
    }
    return { from, to };
  }, [items, now]);

  if (isLoading || !data) return <Loading />;
  const s = data.summary;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('requests.workers.summary.inProcess')} value={s.inProcess} icon={Hourglass} />
        <Kpi label={t('requests.workers.summary.approved')} value={s.approved} icon={ShieldCheck} tone="good" />
        <Kpi label={t('requests.workers.summary.arrivingThisMonth')} value={s.arrivingThisMonth} icon={PlaneLanding} tone="violet" />
        <Kpi label={t('requests.workers.summary.arrived')} value={s.arrived} icon={CheckCircle2} tone="good" />
      </div>

      <Section
        title={t('jobsArea.portal.workers.title')}
        icon={Handshake}
        actions={
          data.items.length > 0 && (
            <a href={`/api/company/workers/export.xlsx?lang=${locale}`} className="btn-ghost btn-sm" download>
              <Download className="size-4" aria-hidden /> {t('requests.workers.export')}
            </a>
          )
        }
      >
        <p className="-mt-2 mb-5 text-sm text-muted">{t('jobsArea.portal.workers.subtitle')}</p>
        {data.items.length === 0 ? (
          <Empty icon={Handshake} title={t('jobsArea.portal.workers.empty')} text={t('jobsArea.portal.workers.emptyText')} />
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="wk-stage">
                {t('requests.workers.stageCol')}
              </label>
              <select id="wk-stage" className="input w-auto min-w-44 py-2 text-sm" value={stage} onChange={(e) => setStage(e.target.value as Stage | '')}>
                <option value="">{t('requests.workers.allStages')}</option>
                {STAGE_ORDER.map((st) => (
                  <option key={st} value={st}>
                    {t(`requests.workers.stage.${st}`)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-pressed={next30}
                onClick={() => setNext30((v) => !v)}
                className={clsx('inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition', next30 ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-card text-ink hover:border-brand-400')}
              >
                <PlaneLanding className="size-4" aria-hidden /> {t('requests.workers.next30')}
              </button>
              <div className="ml-auto flex items-center gap-2">
                <label htmlFor="wk-sort" className="text-xs font-semibold text-muted">
                  {t('requests.workers.sortBy')}
                </label>
                <select id="wk-sort" className="input w-auto py-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  {(['started', 'stage', 'arrival', 'days', 'name'] as SortKey[]).map((k) => (
                    <option key={k} value={k}>
                      {t(`requests.workers.sort.${k}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {items.length === 0 ? (
              <Empty icon={Users} title={t('requests.workers.noMatch')} />
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted" aria-hidden>
                  {STAGE_ORDER.slice(0, 7).map((st) => (
                    <span key={st} className="inline-flex items-center gap-1">
                      <span className={clsx('size-2.5 rounded-full', STAGE_TONE[st].bar)} /> {t(`requests.workers.stage.${st}`)}
                    </span>
                  ))}
                  <span className="ml-auto tabular-nums">
                    {fmtDate(new Date(axis.from))} – {fmtDate(new Date(axis.to))}
                  </span>
                </div>
                <ul className="space-y-3">
                  {items.map((w) => {
                    const arrival = plannedArrival(w);
                    return (
                      <li key={w.id} className="min-w-0 rounded-2xl border border-line bg-card p-4 sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-display text-base font-bold text-navy-900">{w.name}</p>
                            <p className="truncate text-sm text-muted">{[w.profession, w.vacancy ? tr(w.vacancy.title) : null].filter(Boolean).join(' · ')}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="badge bg-surface text-ink ring-1 ring-line">{t(`requests.workers.visaType.${w.visaType}`, { defaultValue: w.visaType })}</span>
                            {w.visa && <span className="badge bg-navy-900 text-white">{w.visa.visaLabel}</span>}
                            <span className={clsx('badge', STAGE_TONE[w.stage].pill)}>{t(`requests.workers.stage.${w.stage}`)}</span>
                          </div>
                        </div>

                        <div className="mt-4">
                          <TimelineBar w={w} from={axis.from} to={axis.to} now={now} />
                          <p className="mt-1.5 text-[11px] text-muted">{t('requests.workers.daysInStage', { count: w.daysInStage })}</p>
                        </div>

                        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 border-t border-line pt-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                          <div className="flex items-center gap-1.5">
                            <CalendarClock className="size-3.5 shrink-0 text-brand-600" aria-hidden />
                            <dt className="sr-only">{t('requests.workers.sort.started')}</dt>
                            <dd className="text-ink/80">{t('jobsArea.portal.workers.started', { date: fmtDate(w.startedAt) })}</dd>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Landmark className="size-3.5 shrink-0 text-violet-600" aria-hidden />
                            <dt className="text-muted">{t('requests.workers.appointment')}:</dt>
                            <dd className="font-medium text-ink">{w.appointmentAt ? fmtDateTime(w.appointmentAt) : '—'}</dd>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Gavel className="size-3.5 shrink-0 text-amber-600" aria-hidden />
                            <dt className="text-muted">{t('requests.workers.decision')}:</dt>
                            <dd className="font-medium text-ink">
                              {w.decisionAt
                                ? fmtDate(w.decisionAt)
                                : w.expectedDecision
                                  ? `≈ ${fmtDate(w.expectedDecision.from)} – ${fmtDate(w.expectedDecision.to)}`
                                  : '—'}
                            </dd>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <PlaneLanding className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
                            <dt className="text-muted">{t('requests.workers.arrival')}:</dt>
                            <dd className="font-medium text-ink">
                              {arrival ? fmtDateTime(arrival) : '—'}
                              {w.arrival && <span className="ml-1 text-muted">({t(`requests.workers.arrivalStatus.${w.arrival.status}`, { defaultValue: w.arrival.status })})</span>}
                            </dd>
                          </div>
                          {w.nextInterview && (
                            <div className="flex items-center gap-1.5 sm:col-span-2">
                              <Video className="size-3.5 shrink-0 text-brand-600" aria-hidden />
                              <dt className="text-muted">{t('requests.workers.interview')}:</dt>
                              <dd className="font-medium text-ink">{fmtDateTime(w.nextInterview.startsAt)}</dd>
                            </div>
                          )}
                          {w.status === 'APPROVED' && w.visaValidFrom && (
                            <div className="flex items-center gap-1.5 font-semibold text-emerald-700 sm:col-span-2">
                              <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
                              <dt className="sr-only">{t('requests.workers.visa')}</dt>
                              <dd>{t('jobsArea.portal.workers.visaFrom', { date: fmtDate(w.visaValidFrom) })}</dd>
                            </div>
                          )}
                        </dl>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </Section>
    </div>
  );
};
