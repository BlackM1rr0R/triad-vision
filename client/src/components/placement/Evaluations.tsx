import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ClipboardCheck, Pencil, Star, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesPlacement } from '@/i18n/pagesPlacement';
import { PanelBodySkeleton } from '@/components/admin/case/TabSkeleton';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { Panel } from '@/components/admin/ui';
import { fmtDate, fmtDateTime } from '@/components/admin/labels';
import { EVAL_CRITERIA, REC_TONE, toastPlacementError, type CandidateEvaluationList, type EvalCriterion, type Evaluation, type EvaluationSummary, type InterviewEvaluations as IEvals, type Recommendation } from './api';
import { confirmDialog } from '@/components/ui/ConfirmHost';

registerCopy(pagesPlacement);

const RECS: Recommendation[] = ['HIRE', 'MAYBE', 'NO'];

/** 1–5 as filled stars (read-only). */
export const Stars = ({ value, className }: { value: number | null; className?: string }) => (
  <span className={clsx('inline-flex items-center gap-0.5', className)} aria-label={value == null ? '—' : `${value} / 5`} role="img">
    {[1, 2, 3, 4, 5].map((i) => (
      <Star key={i} className={clsx('size-3.5', value != null && i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-line')} aria-hidden />
    ))}
  </span>
);

/** Clickable 1–5 rating (radio group). */
const RatingInput = ({ label, value, onChange, name }: { label: string; value: number; onChange: (n: number) => void; name: string }) => {
  const { t } = useTranslation();
  return (
    <fieldset className="flex flex-wrap items-center justify-between gap-2">
      <legend className="sr-only">{label}</legend>
      <span className="text-sm text-ink/80" aria-hidden>
        {label}
      </span>
      <span className="inline-flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer" title={t('placement.evaluations.rateLabel', { label, n })}>
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="peer sr-only" />
            <span
              className={clsx(
                'grid size-8 place-items-center rounded-md border text-xs font-bold transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500',
                value >= n ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-line text-muted hover:border-amber-300',
              )}
            >
              {n}
            </span>
          </label>
        ))}
      </span>
    </fieldset>
  );
};

interface FormState {
  overall: number;
  scores: Record<EvalCriterion, number>;
  recommendation: Recommendation;
  strengths: string;
  concerns: string;
  notes: string;
}
const emptyForm = (e?: Evaluation | null): FormState => ({
  overall: e?.overall ?? 3,
  scores: Object.fromEntries(EVAL_CRITERIA.map((k) => [k, e?.scores[k] ?? 3])) as Record<EvalCriterion, number>,
  recommendation: e?.recommendation ?? 'MAYBE',
  strengths: e?.strengths ?? '',
  concerns: e?.concerns ?? '',
  notes: e?.notes ?? '',
});

/** Modal form for the caller's own evaluation of an interview (employer portal and admin). */
export const EvaluationForm = ({ interviewId, existing, open, onClose, onSaved }: { interviewId: string; existing?: Evaluation | null; open: boolean; onClose: () => void; onSaved: () => void }) => {
  const { t } = useTranslation();
  const [f, setF] = useState<FormState>(() => emptyForm(existing));
  useEffect(() => {
    if (open) setF(emptyForm(existing));
  }, [open, existing]);
  const save = useMutation({
    mutationFn: () =>
      api.put(`/interviews/${interviewId}/evaluations/mine`, {
        ...f,
        strengths: f.strengths.trim() || null,
        concerns: f.concerns.trim() || null,
        notes: f.notes.trim() || null,
      }),
    onSuccess: () => {
      toast.success(t('placement.evaluations.saved'));
      onSaved();
      onClose();
    },
    onError: toastPlacementError,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('placement.evaluations.formTitle')}
      description={t('placement.evaluations.formIntro')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('placement.common.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner className="size-3.5" />} {t('placement.evaluations.save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2 rounded-lg border border-line p-3">
          <RatingInput name="ev-overall" label={t('placement.evaluations.overall')} value={f.overall} onChange={(n) => setF((p) => ({ ...p, overall: n }))} />
          <div className="border-t border-line pt-2" />
          {EVAL_CRITERIA.map((k) => (
            <RatingInput key={k} name={`ev-${k}`} label={t(`placement.evaluations.criteria.${k}`)} value={f.scores[k]} onChange={(n) => setF((p) => ({ ...p, scores: { ...p.scores, [k]: n } }))} />
          ))}
        </div>
        <fieldset>
          <legend className="label">{t('placement.evaluations.recommendation')}</legend>
          <div className="flex flex-wrap gap-2">
            {RECS.map((r) => (
              <label key={r} className="cursor-pointer">
                <input type="radio" name="ev-rec" value={r} checked={f.recommendation === r} onChange={() => setF((p) => ({ ...p, recommendation: r }))} className="peer sr-only" />
                <span className={clsx('inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500', f.recommendation === r ? clsx(REC_TONE[r], 'border-transparent') : 'border-line text-ink/75')}>
                  {t(`placement.evaluations.rec.${r}`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {(['strengths', 'concerns', 'notes'] as const).map((k) => (
          <div key={k}>
            <label className="label" htmlFor={`ev-${k}-t`}>
              {t(`placement.evaluations.${k}`)}
            </label>
            <textarea id={`ev-${k}-t`} rows={2} maxLength={3000} className="input" value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} />
          </div>
        ))}
      </div>
    </Modal>
  );
};

const EvaluationCard = ({ e, onDelete, deleting, extra }: { e: Evaluation; onDelete?: () => void; deleting?: boolean; extra?: string | null }) => {
  const { t } = useTranslation();
  return (
    <li className="rounded-lg border border-line p-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-navy-900">
            {e.authorName ?? '—'} <span className="font-normal text-muted">· {t(`placement.evaluations.${e.authorKind === 'EMPLOYER' ? 'employer' : 'staff'}`)}</span>
          </p>
          <p className="text-muted">{[extra, fmtDateTime(e.updatedAt)].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Stars value={e.overall} />
          <span className={clsx('badge', REC_TONE[e.recommendation])}>{t(`placement.evaluations.rec.${e.recommendation}`)}</span>
          {onDelete && (
            <button type="button" className="btn-ghost btn-sm text-danger" disabled={deleting} onClick={async () => (await confirmDialog({ title: t('placement.evaluations.delete'), message: t('ui.confirmDlg.deleteNamed', { name: [e.authorName ?? '—', fmtDateTime(e.updatedAt)].join(' · ') }), confirmLabel: t('ui.confirmDlg.delete') })) && onDelete()} aria-label={t('placement.evaluations.delete')}>
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-5">
        {EVAL_CRITERIA.map((k) => (
          <div key={k} className="flex items-center justify-between gap-1 sm:block">
            <dt className="truncate text-[11px] text-muted">{t(`placement.evaluations.criteria.${k}`)}</dt>
            <dd className="font-semibold text-navy-900 tabular-nums">{e.scores[k] ?? '—'}/5</dd>
          </div>
        ))}
      </dl>
      {(['strengths', 'concerns', 'notes'] as const).map((k) =>
        e[k] ? (
          <p key={k} className="mt-1.5 whitespace-pre-line text-ink/80">
            <span className="font-semibold">{t(`placement.evaluations.${k}`)}:</span> {e[k]}
          </p>
        ) : null,
      )}
    </li>
  );
};

/** Averages: overall stars, per criterion and the recommendation counts. */
export const EvaluationSummaryBox = ({ s, className }: { s: EvaluationSummary; className?: string }) => {
  const { t } = useTranslation();
  if (!s.count) return null;
  return (
    <div className={clsx('rounded-lg bg-surface/60 p-3 text-xs', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold text-navy-900">
          {t('placement.evaluations.average')}: <span className="font-display text-lg tabular-nums">{s.overall ?? '—'}</span> <Stars value={s.overall} />
        </p>
        <p className="text-muted">{t('placement.evaluations.count', { count: s.count })}</p>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-5">
        {EVAL_CRITERIA.map((k) => (
          <div key={k} className="flex items-center justify-between gap-1 sm:block">
            <dt className="truncate text-[11px] text-muted">{t(`placement.evaluations.criteria.${k}`)}</dt>
            <dd className="font-semibold text-navy-900 tabular-nums">{s.scores[k] ?? '—'}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {RECS.filter((r) => s.recommendations[r] > 0).map((r) => (
          <span key={r} className={clsx('badge', REC_TONE[r])}>
            {t(`placement.evaluations.rec.${r}`)} × {s.recommendations[r]}
          </span>
        ))}
      </div>
    </div>
  );
};

/**
 * Evaluations of one interview with the caller's "Evaluate / edit mine" button. Employers see the employer side
 * only (the API filters); staff see all and may delete any.
 */
export const InterviewEvaluations = ({ interviewId, canDeleteAll = false, compact = false }: { interviewId: string; canDeleteAll?: boolean; compact?: boolean }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ['interview-evaluations', interviewId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: async () => (await api.get<IEvals>(`/interviews/${interviewId}/evaluations`)).data });
  const [open, setOpen] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ['candidate-evaluations'] });
  };
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/interviews/${interviewId}/evaluations/${id}`),
    onSuccess: () => {
      toast.success(t('placement.evaluations.deleted'));
      refresh();
    },
    onError: toastPlacementError,
  });
  if (isLoading || !data) return <Spinner className="size-4 text-brand-600" />;
  const mine = data.items.find((e) => e.id === data.mineId) ?? null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-navy-900">
          <ClipboardCheck className="size-3.5 text-brand-600" aria-hidden /> {t('placement.evaluations.title')}
        </p>
        {data.canEvaluate ? (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
            {mine ? <Pencil className="size-3.5" /> : <ClipboardCheck className="size-3.5" />} {mine ? t('placement.evaluations.editMine') : t('placement.evaluations.evaluate')}
          </button>
        ) : (
          <span className="text-[11px] text-muted">{t('placement.evaluations.afterInterview')}</span>
        )}
      </div>
      {!compact && data.items.length > 1 && <EvaluationSummaryBox s={data.summary} />}
      {data.items.length > 0 && (
        <ul className="space-y-2">
          {data.items.map((e) => (
            <EvaluationCard key={e.id} e={e} deleting={remove.isPending} onDelete={canDeleteAll || e.id === data.mineId ? () => remove.mutate(e.id) : undefined} />
          ))}
        </ul>
      )}
      <EvaluationForm interviewId={interviewId} existing={mine} open={open} onClose={() => setOpen(false)} onSaved={refresh} />
    </div>
  );
};

/** Candidate card (admin): every evaluation of the candidate with averages, employer and team side. */
export const CandidateEvaluations = ({ candidateId, hideEmpty = false }: { candidateId: string; hideEmpty?: boolean }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { data, isLoading } = useQuery({
    queryKey: ['candidate-evaluations', candidateId],
    queryFn: async () => (await api.get<CandidateEvaluationList>(`/admin/placement/candidates/${candidateId}/evaluations`)).data,
  });
  if (hideEmpty && !data?.items.length) return null;
  return (
    <Panel title={t('placement.evaluations.title')} icon={ClipboardCheck}>
      {isLoading || !data ? (
        <PanelBodySkeleton rows={3} />
      ) : !data.items.length ? (
        <p className="text-sm text-muted">{t('placement.evaluations.empty')}</p>
      ) : (
        <div className="space-y-3">
          <EvaluationSummaryBox s={data.summary} />
          {data.byAuthor.EMPLOYER.count > 0 && data.byAuthor.STAFF.count > 0 && (
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>
                {t('placement.evaluations.employer')}: <strong className="text-navy-900">{data.byAuthor.EMPLOYER.overall}</strong>
              </span>
              <span>
                {t('placement.evaluations.staff')}: <strong className="text-navy-900">{data.byAuthor.STAFF.overall}</strong>
              </span>
            </p>
          )}
          <ul className="space-y-2">
            {data.items.map((e) => (
              <EvaluationCard
                key={e.id}
                e={e}
                extra={
                  e.interview
                    ? [t('placement.evaluations.interviewOn', { date: fmtDate(e.interview.startsAt) }), e.interview.company?.name, e.interview.vacancy ? tr(e.interview.vacancy.title) : null].filter(Boolean).join(' · ')
                    : null
                }
              />
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
};

/**
 * Compact "Evaluate / edit my evaluation" button with the caller's current rating, for interview cards (employer
 * portal). Hidden when the interview cannot be evaluated yet and nothing was written.
 */
export const EvaluateButton = ({ interviewId }: { interviewId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ['interview-evaluations', interviewId];
  const { data } = useQuery({ queryKey: key, queryFn: async () => (await api.get<IEvals>(`/interviews/${interviewId}/evaluations`)).data });
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const mine = data.items.find((e) => e.id === data.mineId) ?? null;
  if (!data.canEvaluate && !mine) return null;
  return (
    <>
      {mine && (
        <span className="inline-flex items-center gap-1.5 text-xs">
          <Stars value={mine.overall} /> <span className={clsx('badge', REC_TONE[mine.recommendation])}>{t(`placement.evaluations.rec.${mine.recommendation}`)}</span>
        </span>
      )}
      {data.canEvaluate && (
        <button type="button" className={clsx('btn-sm', mine ? 'btn-secondary' : 'btn-primary')} onClick={() => setOpen(true)}>
          {mine ? <Pencil className="size-3.5" /> : <ClipboardCheck className="size-3.5" />} {mine ? t('placement.evaluations.editMine') : t('placement.evaluations.evaluate')}
        </button>
      )}
      <EvaluationForm interviewId={interviewId} existing={mine} open={open} onClose={() => setOpen(false)} onSaved={() => void qc.invalidateQueries({ queryKey: key })} />
    </>
  );
};
