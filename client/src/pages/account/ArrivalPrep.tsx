import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, BedDouble, Check, CheckCircle2, ChevronDown, Circle, Compass, ExternalLink, ListChecks, Plane, PlaneLanding, Sparkles, Undo2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { useChosenCase } from '@/lib/caseContext';
import { usePageTitle } from '@/lib/usePageTitle';
import type { L10n } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesPortalPlans } from '@/i18n/pagesPortalPlans';
import { Icon, hasIcon } from '@/components/ui/Icon';
import { TONE_CLASS } from '@/components/ui/status';
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';
import { Traveller } from '@/components/illustrations';
import { ProgressRing } from '@/components/portal/ProgressRing';
import { useApiError } from '@/components/portal/useApiError';
import { ONBOARDING_KEY } from '@/components/journey/api';

registerCopy(pagesPortalPlans);

type BeforeKey = 'flight' | 'housing' | 'firstDay';

interface BeforeTask {
  key: BeforeKey;
  done: boolean;
  date: string | null;
  detail: string | null;
  link: string;
}

interface AfterTask {
  id: string;
  slug: string;
  icon: string;
  title: L10n;
  body: L10n;
  link: string | null;
  dueDays: number | null;
  dueAt: string | null;
  done: boolean;
  doneAt: string | null;
  overdue: boolean;
  core: boolean;
  appointmentAt: string | null;
}

/** GET /api/account/plus/arrival-prep (server: lib/account/arrivalPrep.ts). */
interface ArrivalPrepResponse {
  case: { id: string; number: string } | null;
  arrivalAt: string | null;
  firstWorkDay?: string | null;
  before: BeforeTask[];
  after: AfterTask[];
  progress: { done: number; total: number; percent: number } | null;
}

const PREP_KEY = ['account-arrival-prep'] as const;
const BEFORE_ICON: Record<BeforeKey, typeof Plane> = { flight: Plane, housing: BedDouble, firstDay: PlaneLanding };
const HOUSING_STATES = ['REQUESTED', 'SEARCHING', 'OFFERED', 'ARRANGED'];

const DoneMark = ({ done }: { done: boolean }) => (done ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden /> : <Circle className="size-5 shrink-0 text-line-strong" aria-hidden />);

const BeforeRow = ({ task }: { task: BeforeTask }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const TaskIcon = BEFORE_ICON[task.key];
  const detail = task.key === 'housing' && task.detail && HOUSING_STATES.includes(task.detail) ? t(`pplan.prep.housingStatus.${task.detail}`) : task.key === 'firstDay' && task.detail ? t('pplan.prep.employerChecklist', { value: task.detail }) : task.detail;
  return (
    <li className={clsx('flex gap-3 rounded-xl border p-3 sm:p-4', task.done ? 'border-line bg-sunken' : 'border-line bg-card')}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-sky">
        <TaskIcon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">{t(`pplan.prep.tasks.${task.key}.title`)}</span>
          <span className={clsx('badge', task.done ? TONE_CLASS.success : TONE_CLASS.neutral)}>
            {task.done ? t('pplan.prep.done') : t('pplan.prep.todo')}
          </span>
          <span className="badge bg-sunken text-[11px] text-muted">{t('pplan.prep.auto')}</span>
        </p>
        <p className="mt-1 text-sm text-muted">{t(`pplan.prep.tasks.${task.key}.text`)}</p>
        {(task.date || detail) && (
          <p className="mt-1 text-xs font-medium text-ink">
            {task.date && <time dateTime={task.date}>{date(task.date, { day: 'numeric', month: 'long', year: 'numeric' })}</time>}
            {task.date && detail && ' · '}
            {detail}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <DoneMark done={task.done} />
        <Link to={task.link} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-link hover:underline">
          {t('pplan.prep.open')} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </li>
  );
};

const AfterRow = ({ task, caseId }: { task: AfterTask; caseId: string }) => {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  const qc = useQueryClient();
  const onError = useApiError();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: async (done: boolean) => (await api.put(`/journey/onboarding/${task.id}`, { done, caseId })).data,
    onMutate: async (done) => {
      await qc.cancelQueries({ queryKey: PREP_KEY });
      const prev = qc.getQueriesData<ArrivalPrepResponse>({ queryKey: PREP_KEY });
      qc.setQueriesData<ArrivalPrepResponse>({ queryKey: PREP_KEY }, (old) => {
        if (!old?.progress) return old;
        const after = old.after.map((a) => (a.id === task.id ? { ...a, done, doneAt: done ? new Date().toISOString() : null, overdue: done ? false : a.overdue } : a));
        const n = old.before.filter((b) => b.done).length + after.filter((a) => a.done).length;
        return { ...old, after, progress: { ...old.progress, done: n, percent: old.progress.total ? Math.round((n / old.progress.total) * 100) : 0 } };
      });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data));
      onError(err);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: PREP_KEY });
      void qc.invalidateQueries({ queryKey: ONBOARDING_KEY });
    },
  });
  const paragraphs = tr(task.body)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const title = tr(task.title);
  const day = (iso: string) => date(iso, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <li className={clsx('rounded-xl border', task.done ? 'border-line bg-sunken' : task.overdue ? 'border-danger-border bg-card' : 'border-line bg-card')}>
      <div className="flex gap-3 p-3 sm:p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-sage">
          {hasIcon(task.icon) ? <Icon name={task.icon} className="size-5" aria-hidden /> : <Compass className="size-5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={clsx('font-semibold break-words text-ink', task.done && 'text-muted line-through decoration-1')}>{title}</p>
          <p className="mt-0.5 text-xs">
            {task.done ? (
              task.doneAt && <span className="text-success-fg">{t('pplan.prep.doneAt', { date: day(task.doneAt) })}</span>
            ) : task.dueAt ? (
              <span className={clsx(task.overdue ? 'font-semibold text-danger-fg' : 'text-muted')}>
                {t('pplan.prep.due', { date: day(task.dueAt) })}
                {task.overdue && ` · ${t('pplan.prep.overdue')}`}
              </span>
            ) : (
              task.dueDays !== null && <span className="text-muted">{t('pplan.prep.within', { count: task.dueDays })}</span>
            )}
          </p>
          {task.appointmentAt && !task.done && <p className="mt-0.5 text-xs font-medium text-ink">{t('pplan.prep.appointment', { date: day(task.appointmentAt) })}</p>}
          {paragraphs.length > 0 && (
            <button type="button" className="mt-1 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-link hover:underline" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
              <ChevronDown className={clsx('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
              {open ? t('pplan.prep.less') : t('pplan.prep.more')}
            </button>
          )}
        </div>
        <button
          type="button"
          className={clsx('inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-lg px-3 text-sm font-semibold', task.done ? 'btn-secondary' : 'btn-primary')}
          aria-pressed={task.done}
          aria-label={`${task.done ? t('pplan.prep.undo') : t('pplan.prep.markDone')}: ${title}`}
          disabled={m.isPending}
          onClick={() => m.mutate(!task.done)}
        >
          {task.done ? <Undo2 className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
          <span className="hidden sm:inline">{task.done ? t('pplan.prep.undo') : t('pplan.prep.markDone')}</span>
        </button>
      </div>
      {open && (
        <div id={panelId} className="space-y-2 border-t border-line px-3 py-3 text-sm leading-relaxed text-ink sm:px-4">
          {paragraphs.map((p) => (
            <p key={p} className="whitespace-pre-line">
              {p}
            </p>
          ))}
          {task.link && /^https?:\/\//i.test(task.link) && (
            <a href={task.link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-link hover:underline">
              {task.link.replace(/^https?:\/\//, '').split('/')[0]} <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>
      )}
    </li>
  );
};

/**
 * Portal › Home › Arrival preparation: flight, housing and first day (from the arrival plan, ticked automatically)
 * and the first weeks in Germany — Anmeldung, health insurance, bank account, tax ID, SIM card … — as checkable tasks
 * with explanations and deadlines counted from the arrival day.
 */
export default function AccountArrivalPrep() {
  const { t } = useTranslation();
  const { date } = useL10n();
  usePageTitle(t('pplan.prep.title'));
  const { user } = useAuth();
  const chosen = useChosenCase(user?.id);
  const q = useQuery({
    queryKey: [...PREP_KEY, chosen ?? 'default'],
    queryFn: async () => {
      try {
        return (await api.get<ArrivalPrepResponse>('/account/plus/arrival-prep', { params: chosen ? { case: chosen } : undefined })).data;
      } catch {
        // The chosen family case may not be approved / own: fall back to the default approved case.
        return (await api.get<ArrivalPrepResponse>('/account/plus/arrival-prep')).data;
      }
    },
    placeholderData: (prev) => prev,
  });

  const header = (
    <div>
      <h2 className="type-page-title flex items-center gap-2">
        <ListChecks className="size-6 text-primary" aria-hidden /> {t('pplan.prep.title')}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{t('pplan.prep.subtitle')}</p>
    </div>
  );

  if (q.isLoading) {
    return (
      <div className="space-y-6" aria-busy>
        <div>
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        </div>
        <div className="card p-5">
          <SkeletonList count={5} />
        </div>
      </div>
    );
  }
  const d = q.data;
  if (!d) return <p className="text-sm text-danger-fg" role="alert">{t('common.error')}</p>;

  if (!d.case || !d.progress) {
    return (
      <div className="space-y-6">
        {header}
        <div className="card flex flex-col items-center p-8 text-center">
          <Traveller className="w-40" />
          <p className="type-card-title mt-4">{t('pplan.prep.noCaseTitle')}</p>
          <p className="max-w-lg text-sm text-muted">{t('pplan.prep.noCaseText')}</p>
        </div>
      </div>
    );
  }

  const day = (iso: string) => date(iso, { day: 'numeric', month: 'long', year: 'numeric' });
  const p = d.progress;
  const caseId = d.case.id;

  return (
    <div className="space-y-6">
      {header}

      <div className="card flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <ProgressRing percent={p.percent} size={64} stroke={6} label={t('pplan.prep.progress', { done: p.done, total: p.total })}>
          <span className="font-display text-sm font-semibold text-ink tabular-nums">
            {p.done}/{p.total}
          </span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{t('pplan.prep.progress', { done: p.done, total: p.total })}</p>
          {d.arrivalAt && <p className="text-sm text-muted">{t('pplan.prep.arrival', { date: day(d.arrivalAt) })}</p>}
          {d.firstWorkDay && <p className="text-sm text-muted">{t('pplan.prep.firstWork', { date: day(d.firstWorkDay) })}</p>}
        </div>
        {p.percent === 100 && <Sparkles className="size-6 text-highlight" aria-hidden />}
      </div>

      <section className="card p-4 sm:p-6" aria-labelledby="prep-before">
        <h3 id="prep-before" className="type-card-title">
          {t('pplan.prep.before.title')}
        </h3>
        <p className="mt-0.5 text-sm text-muted">{t('pplan.prep.before.text')}</p>
        <ul className="mt-4 space-y-3">
          {d.before.map((task) => (
            <BeforeRow key={task.key} task={task} />
          ))}
        </ul>
      </section>

      <section className="card p-4 sm:p-6" aria-labelledby="prep-after">
        <h3 id="prep-after" className="type-card-title">
          {t('pplan.prep.after.title')}
        </h3>
        <p className="mt-0.5 text-sm text-muted">{t('pplan.prep.after.text')}</p>
        <ul className="mt-4 space-y-3">
          {d.after.map((task) => (
            <AfterRow key={task.id} task={task} caseId={caseId} />
          ))}
        </ul>
      </section>
    </div>
  );
}
