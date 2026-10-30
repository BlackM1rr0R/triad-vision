import { useRef, useState, type FormEvent } from 'react';
import { statusTone, TONE_CLASS } from '@/components/ui/status';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Award, BookOpen, CalendarClock, CheckCircle2, ExternalLink, FileUp, Flag, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesFamilyLanguage } from '@/i18n/pagesFamilyLanguage';
import { pagesGermanVocab } from '@/i18n/pagesGermanVocab';
import { Spinner } from '@/components/ui/Spinner';
import { useApiError } from '@/components/portal/useApiError';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { daysUntil } from '@/components/journey/api';
import { germanKey, useGermanOverview, useGermanWrite } from './api';
import { CEFR, COURSE_STATUSES, day, EXAM_STATUSES, levelLabel, MODULES, PROVIDERS, RANK, type GermanCourse, type GermanExam, type GermanOverview } from './types';
import { useQueryClient } from '@tanstack/react-query';

registerCopy(pagesFamilyLanguage);
registerCopy(pagesGermanVocab);

const STEPS = ['none', ...CEFR] as const;

/** A0 → target with a tick per level; the reached part is filled. */
export const LevelProgress = ({ ov, compact = false }: { ov: GermanOverview; compact?: boolean }) => {
  const { t } = useTranslation();
  const target = RANK[ov.progress.target] ?? 3;
  const current = RANK[ov.progress.current] ?? 0;
  const steps = STEPS.slice(0, Math.max(target, current, 1) + 1);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-ink">{t('germanProgress.toTarget', { from: levelLabel(ov.progress.current), to: levelLabel(ov.progress.target) })}</span>
        <span className="font-semibold tabular-nums text-ink">{ov.progress.percent}%</span>
      </div>
      <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ov.progress.percent} aria-label={t('germanProgress.title')}>
        <span className="absolute inset-y-0 left-0 rounded-full bg-highlight" style={{ width: `${ov.progress.percent}%` }} />
      </div>
      {!compact && (
        <ol className="mt-2 flex justify-between text-[11px] font-semibold">
          {steps.map((s, i) => (
            <li key={s} className={clsx(i <= current ? 'text-link' : 'text-muted', i === target && 'underline decoration-2 underline-offset-4')}>
              {levelLabel(s)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

const resultTone = (passed: boolean | null) => TONE_CLASS[statusTone('result', passed === true ? 'passed' : passed === false ? 'failed' : 'pending')];

// ─── Course form ───────────────────────────────────────────────────────

const CourseForm = ({ initial, onSubmit, onCancel }: { initial: GermanCourse | null; onSubmit: (body: Record<string, unknown>) => Promise<void>; onCancel: () => void }) => {
  const { t } = useTranslation();
  const [f, setF] = useState({
    school: initial?.school ?? '',
    level: initial?.level ?? 'A1',
    startsAt: day(initial?.startsAt),
    endsAt: day(initial?.endsAt),
    schedule: initial?.schedule ?? '',
    format: initial?.format ?? '',
    status: initial?.status ?? 'PLANNED',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit({ school: f.school.trim(), level: f.level, startsAt: f.startsAt || null, endsAt: f.endsAt || null, schedule: f.schedule.trim() || null, format: f.format || null, status: f.status });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="gc-school" className="label">{t('germanProgress.courses.school')}</label>
        <input id="gc-school" className="input" value={f.school} onChange={set('school')} required maxLength={160} />
      </div>
      <div>
        <label htmlFor="gc-level" className="label">{t('germanProgress.courses.level')}</label>
        <select id="gc-level" className="input" value={f.level} onChange={set('level')}>
          {CEFR.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="gc-status" className="label">{t('germanProgress.courses.status')}</label>
        <select id="gc-status" className="input" value={f.status} onChange={set('status')}>
          {COURSE_STATUSES.map((s) => <option key={s} value={s}>{t(`germanProgress.courses.statuses.${s}`)}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="gc-start" className="label">{t('germanProgress.courses.startsAt')}</label>
        <input id="gc-start" type="date" className="input" value={f.startsAt} onChange={set('startsAt')} />
      </div>
      <div>
        <label htmlFor="gc-end" className="label">{t('germanProgress.courses.endsAt')}</label>
        <input id="gc-end" type="date" className="input" value={f.endsAt} onChange={set('endsAt')} min={f.startsAt || undefined} />
      </div>
      <div>
        <label htmlFor="gc-schedule" className="label">{t('germanProgress.courses.schedule')}</label>
        <input id="gc-schedule" className="input" value={f.schedule} onChange={set('schedule')} maxLength={200} placeholder={t('germanProgress.courses.schedulePh')} />
      </div>
      <div>
        <label htmlFor="gc-format" className="label">{t('germanProgress.courses.format')}</label>
        <select id="gc-format" className="input" value={f.format} onChange={set('format')}>
          <option value="">—</option>
          {(['online', 'offline', 'hybrid'] as const).map((x) => <option key={x} value={x}>{t(`germanProgress.courses.formats.${x}`)}</option>)}
        </select>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary btn-sm" onClick={onCancel}>{t('germanProgress.cancel')}</button>
        <button type="submit" className="btn-primary btn-sm" disabled={busy || !f.school.trim()}>{busy && <Spinner className="size-3.5" />} {t('germanProgress.save')}</button>
      </div>
    </form>
  );
};

// ─── Exam form ─────────────────────────────────────────────────────────

const ExamForm = ({ ov, initial, onSubmit, onCancel }: { ov: GermanOverview; initial: GermanExam | null; onSubmit: (body: Record<string, unknown>) => Promise<void>; onCancel: () => void }) => {
  const { t } = useTranslation();
  const { dateTime } = useL10n();
  const [pick, setPick] = useState(initial ? (initial.examDateId ?? '') : (ov.examDates[0]?.id ?? ''));
  const [f, setF] = useState({
    provider: initial?.provider ?? 'GOETHE',
    level: initial?.level ?? ov.examDates[0]?.level ?? 'A1',
    examDate: day(initial?.examDate),
    location: initial?.location ?? '',
    registrationDeadline: day(initial?.registrationDeadline),
    status: initial?.status ?? 'PLANNED',
    passed: initial?.passed === true ? 'true' : initial?.passed === false ? 'false' : '',
  });
  const [results, setResults] = useState(() =>
    Object.fromEntries(MODULES.map((m) => [m, { score: initial?.results[m]?.score?.toString() ?? '', max: initial?.results[m]?.max?.toString() ?? (initial?.provider === 'TESTDAF' ? '5' : '100') }])),
  );
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const manual = !pick;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    const res = Object.fromEntries(MODULES.filter((m) => results[m].score.trim() !== '').map((m) => [m, { score: num(results[m].score), max: num(results[m].max) }]));
    try {
      await onSubmit({
        ...(manual
          ? { examDateId: initial?.examDateId ? null : undefined, provider: f.provider, level: f.level, examDate: f.examDate || null, location: f.location.trim() || null, registrationDeadline: f.registrationDeadline || null }
          : { examDateId: pick, level: f.level }),
        status: f.status,
        ...(initial ? { results: Object.keys(res).length ? res : null, passed: f.passed === '' ? null : f.passed === 'true' } : {}),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      {ov.examDates.length > 0 && (
        <div>
          <label htmlFor="ge-pick" className="label">{t('germanProgress.exams.pickDate')}</label>
          <select
            id="ge-pick"
            className="input"
            value={pick}
            onChange={(e) => {
              setPick(e.target.value);
              const lvl = ov.examDates.find((d) => d.id === e.target.value)?.level;
              if (lvl) setF((s) => ({ ...s, level: lvl }));
            }}
          >
            {ov.examDates.map((d) => (
              <option key={d.id} value={d.id}>
                {t(`germanProgress.exams.providers.${d.provider}`)} {d.level ?? ''} · {dateTime(d.examDate)} · {d.city}
              </option>
            ))}
            <option value="">{t('germanProgress.exams.manual')}</option>
          </select>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {manual && (
          <div>
            <label htmlFor="ge-provider" className="label">{t('germanProgress.exams.provider')}</label>
            <select id="ge-provider" className="input" value={f.provider} onChange={set('provider')}>
              {PROVIDERS.map((p) => <option key={p} value={p}>{t(`germanProgress.exams.providers.${p}`)}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="ge-level" className="label">{t('germanProgress.exams.level')}</label>
          <select id="ge-level" className="input" value={f.level} onChange={set('level')}>
            {CEFR.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        {manual && (
          <>
            <div>
              <label htmlFor="ge-date" className="label">{t('germanProgress.exams.examDate')}</label>
              <input id="ge-date" type="date" className="input" value={f.examDate} onChange={set('examDate')} />
            </div>
            <div>
              <label htmlFor="ge-deadline" className="label">{t('germanProgress.exams.deadline')}</label>
              <input id="ge-deadline" type="date" className="input" value={f.registrationDeadline} onChange={set('registrationDeadline')} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="ge-loc" className="label">{t('germanProgress.exams.location')}</label>
              <input id="ge-loc" className="input" value={f.location} onChange={set('location')} maxLength={200} />
            </div>
          </>
        )}
        <div>
          <label htmlFor="ge-status" className="label">{t('germanProgress.exams.status')}</label>
          <select id="ge-status" className="input" value={f.status} onChange={set('status')}>
            {EXAM_STATUSES.map((s) => <option key={s} value={s}>{t(`germanProgress.exams.statuses.${s}`)}</option>)}
          </select>
        </div>
      </div>

      {initial && (
        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-xs font-bold tracking-wide text-muted uppercase">{t('germanProgress.exams.results')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {MODULES.map((m) => (
              <div key={m} className="flex items-end gap-2">
                <span className="w-24 shrink-0 pb-2.5 text-sm font-medium text-ink">{t(`germanProgress.exams.modules.${m}`)}</span>
                <label className="min-w-0 flex-1">
                  <span className="sr-only">{t(`germanProgress.exams.modules.${m}`)} · {t('germanProgress.exams.score')}</span>
                  <input type="number" min={0} max={1000} step="0.5" inputMode="decimal" className="input" placeholder={t('germanProgress.exams.score')} value={results[m].score} onChange={(e) => setResults((r) => ({ ...r, [m]: { ...r[m], score: e.target.value } }))} />
                </label>
                <span className="pb-2.5 text-muted">/</span>
                <label className="w-20 shrink-0">
                  <span className="sr-only">{t('germanProgress.exams.max')}</span>
                  <input type="number" min={1} max={1000} className="input" placeholder={t('germanProgress.exams.max')} value={results[m].max} onChange={(e) => setResults((r) => ({ ...r, [m]: { ...r[m], max: e.target.value } }))} />
                </label>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <label htmlFor="ge-passed" className="label">{t('germanProgress.exams.overall')}</label>
            <select id="ge-passed" className="input sm:w-56" value={f.passed} onChange={set('passed')}>
              <option value="">{t('germanProgress.exams.unknown')} (auto)</option>
              <option value="true">{t('germanProgress.exams.passed')}</option>
              <option value="false">{t('germanProgress.exams.failed')}</option>
            </select>
          </div>
        </fieldset>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary btn-sm" onClick={onCancel}>{t('germanProgress.cancel')}</button>
        <button type="submit" className="btn-primary btn-sm" disabled={busy}>{busy && <Spinner className="size-3.5" />} {t('germanProgress.save')}</button>
      </div>
    </form>
  );
};

// ─── Board ─────────────────────────────────────────────────────────────

/**
 * Courses, exams, timeline and goal of one candidate. `userId` given = staff view (admin API), else the
 * signed-in candidate (with the certificate upload per exam).
 */
export const GermanProgressBoard = ({ userId }: { userId?: string }) => {
  const { t } = useTranslation();
  const { date, dateTime } = useL10n();
  const apiError = useApiError();
  const qc = useQueryClient();
  const write = useGermanWrite(userId);
  const { data: ov, isLoading } = useGermanOverview(userId);
  const [course, setCourse] = useState<GermanCourse | 'new' | null>(null);
  const [exam, setExam] = useState<GermanExam | 'new' | null>(null);
  const [deleting, setDeleting] = useState<{ kind: 'courses' | 'exams'; id: string } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string | null>(null);
  const [plan, setPlan] = useState<{ targetLevel: string; targetDate: string } | null>(null);
  const staff = !!userId;

  if (isLoading || !ov) {
    return (
      <div className="grid place-items-center py-10">
        <Spinner className="size-5 text-primary" />
      </div>
    );
  }

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      return true;
    } catch (err) {
      apiError(err);
      return false;
    }
  };

  const planForm = plan ?? { targetLevel: ov.plan?.targetLevel ?? '', targetDate: day(ov.plan?.targetDate) };
  const savePlan = () => void run(() => write('put', '/plan', { targetLevel: planForm.targetLevel || null, targetDate: planForm.targetDate || null, notes: ov.plan?.notes ?? null }), t('germanProgress.plan.saved')).then((ok) => ok && setPlan(null));

  const upload = async (file: File) => {
    const id = uploadFor.current;
    if (!id) return;
    setUploading(id);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post<GermanOverview>(`/german/me/exams/${id}/certificate`, form);
      qc.setQueryData(germanKey(userId), res.data);
      void qc.invalidateQueries({ queryKey: ['case'] });
      toast.success(t('germanProgress.exams.certUploaded'));
    } catch (err) {
      apiError(err);
    } finally {
      setUploading(null);
      uploadFor.current = null;
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Goal + progress */}
      <section className="card p-5 sm:p-6" aria-labelledby="gp-goal">
        <h2 id="gp-goal" className="flex items-center gap-2.5 text-base font-semibold text-ink">
          <Flag className="size-4 text-primary" aria-hidden /> {t('germanProgress.plan.title')}
        </h2>
        <div className="mt-4">
          <LevelProgress ov={ov} />
        </div>
        <p className="mt-3 text-xs text-muted">{t('germanProgress.autoLevel')}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="gp-target" className="label">{t('germanProgress.plan.targetLevel')}</label>
            <select id="gp-target" className="input" value={planForm.targetLevel} onChange={(e) => setPlan({ ...planForm, targetLevel: e.target.value })}>
              <option value="">{t('germanProgress.plan.none')}</option>
              {CEFR.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="gp-date" className="label">{t('germanProgress.plan.targetDate')}</label>
            <input id="gp-date" type="date" className="input" value={planForm.targetDate} onChange={(e) => setPlan({ ...planForm, targetDate: e.target.value })} />
          </div>
          <button type="button" className="btn-primary btn-sm" disabled={!plan} onClick={savePlan}>{t('germanProgress.plan.save')}</button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        {/* Courses */}
        <section className="card p-5 sm:p-6" aria-labelledby="gp-courses">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="gp-courses" className="flex items-center gap-2.5 text-base font-semibold text-ink">
              <BookOpen className="size-4 text-primary" aria-hidden /> {t('germanProgress.courses.title')}
            </h2>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setCourse('new')}>
              <Plus className="size-3.5" aria-hidden /> {t('germanProgress.courses.add')}
            </button>
          </div>
          {ov.courses.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{t('germanProgress.courses.empty')}</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {ov.courses.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                      <span className="break-words">{c.school}</span>
                      <span className="badge bg-sunken text-link">{c.level}</span>
                      <span className="badge bg-neutral-bg text-neutral-fg">{t(`germanProgress.courses.statuses.${c.status}`)}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {[c.startsAt && date(c.startsAt), c.endsAt && date(c.endsAt)].filter(Boolean).join(' – ') || '—'}
                      {c.schedule && <> · {c.schedule}</>}
                      {c.format && <> · {t(`germanProgress.courses.formats.${c.format}`)}</>}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-link" onClick={() => setCourse(c)} aria-label={`${t('germanProgress.edit')}: ${c.school}`}>
                      <Pencil className="size-3.5" />
                    </button>
                    <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger-fg" onClick={() => setDeleting({ kind: 'courses', id: c.id })} aria-label={`${t('germanProgress.delete')}: ${c.school}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Exams */}
        <section className="card p-5 sm:p-6" aria-labelledby="gp-exams">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="gp-exams" className="flex items-center gap-2.5 text-base font-semibold text-ink">
              <Award className="size-4 text-primary" aria-hidden /> {t('germanProgress.exams.title')}
            </h2>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setExam('new')}>
              <Plus className="size-3.5" aria-hidden /> {t('germanProgress.exams.add')}
            </button>
          </div>
          {ov.exams.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{t('germanProgress.exams.empty')}</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {ov.exams.map((e) => {
                const left = e.registrationDeadline && e.status === 'PLANNED' ? daysUntil(e.registrationDeadline) : null;
                const link = ov.examDates.find((d) => d.id === e.examDateId)?.link;
                return (
                  <li key={e.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                          {t(`germanProgress.exams.providers.${e.provider}`)} {e.level}
                          <span className={clsx('badge', resultTone(e.passed))}>
                            {e.passed === true ? <CheckCircle2 className="size-3" aria-hidden /> : e.passed === false ? <XCircle className="size-3" aria-hidden /> : null}
                            {t(`germanProgress.exams.statuses.${e.status}`)}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {e.examDate ? dateTime(e.examDate) : '—'}
                          {e.location && <> · {e.location}</>}
                        </p>
                        {left !== null && (
                          <p className={clsx('mt-1 inline-flex items-center gap-1 text-xs font-semibold', left < 0 ? 'text-danger-fg' : left <= 7 ? 'text-warning-fg' : 'text-muted')}>
                            <CalendarClock className="size-3.5" aria-hidden />
                            {t('germanProgress.exams.deadline')}: {date(e.registrationDeadline!)} · {left < 0 ? t('germanProgress.exams.deadlinePassed') : t('germanProgress.exams.deadlineIn', { count: left })}
                          </p>
                        )}
                        {Object.keys(e.results).length > 0 && (
                          <ul className="mt-2 flex flex-wrap gap-1.5">
                            {MODULES.filter((m) => e.results[m]).map((m) => (
                              <li key={m} className={clsx('badge', resultTone(e.results[m]!.passed))}>
                                {t(`germanProgress.exams.modules.${m}`)} {e.results[m]!.score ?? '–'}
                                {e.results[m]!.max ? `/${e.results[m]!.max}` : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                          {e.status === 'PLANNED' && (
                            <button
                              type="button"
                              className="inline-flex min-h-9 items-center gap-1 font-semibold text-link hover:underline"
                              onClick={() => void run(() => write('patch', `/exams/${e.id}`, { status: 'REGISTERED' }), t('germanVocab.registered'))}
                            >
                              <CheckCircle2 className="size-3.5" aria-hidden /> {t('germanVocab.markRegistered')}
                            </button>
                          )}
                          {link && (
                            <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
                              {t('germanProgress.exams.register')} <ExternalLink className="size-3" aria-hidden />
                            </a>
                          )}
                          {e.certificateDocumentId ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-success-fg">
                              <CheckCircle2 className="size-3.5" aria-hidden /> {t('germanProgress.exams.certLinked')}
                            </span>
                          ) : (
                            !staff &&
                            e.status !== 'FAILED' &&
                            e.status !== 'CANCELLED' && (
                              <button
                                type="button"
                                className="inline-flex min-h-9 items-center gap-1 font-semibold text-link hover:text-link disabled:opacity-60"
                                disabled={!ov.case || uploading === e.id}
                                title={!ov.case ? t('germanProgress.exams.noCase') : undefined}
                                onClick={() => {
                                  uploadFor.current = e.id;
                                  fileRef.current?.click();
                                }}
                              >
                                {uploading === e.id ? <Spinner className="size-3.5" /> : <FileUp className="size-3.5" aria-hidden />} {t('germanProgress.exams.uploadCert')}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-link" onClick={() => setExam(e)} aria-label={`${t('germanProgress.edit')}: ${e.provider} ${e.level}`}>
                          <Pencil className="size-3.5" />
                        </button>
                        <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger-fg" onClick={() => setDeleting({ kind: 'exams', id: e.id })} aria-label={`${t('germanProgress.delete')}: ${e.provider} ${e.level}`}>
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        </section>
      </div>

      {/* Timeline */}
      <section className="card p-5 sm:p-6" aria-labelledby="gp-timeline">
        <h2 id="gp-timeline" className="flex items-center gap-2.5 text-base font-semibold text-ink">
          <CalendarClock className="size-4 text-primary" aria-hidden /> {t('germanProgress.timeline.title')}
        </h2>
        {ov.timeline.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t('germanProgress.timeline.empty')}</p>
        ) : (
          <ol className="relative mt-4 space-y-4 border-l-2 border-line pl-5">
            {ov.timeline.map((i) => {
              const past = new Date(i.date).getTime() < Date.now();
              return (
                <li key={`${i.kind}-${i.refId}-${i.date}`} className="relative">
                  <span className={clsx('absolute top-1 -left-[27px] size-3 rounded-full ring-4 ring-card', past ? 'bg-highlight' : 'bg-line')} aria-hidden />
                  <p className="text-xs font-semibold text-muted">{date(i.date)}</p>
                  <p className="text-sm font-semibold break-words text-ink">
                    {t(`germanProgress.timeline.kinds.${i.kind}`)} · {i.kind === 'exam' || i.kind === 'deadline' ? t(`germanProgress.exams.providers.${i.title}`) : i.title}
                    {i.level && <span className="ml-1.5 badge bg-sunken text-link">{i.level}</span>}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <Modal open={!!course} onClose={() => setCourse(null)} title={course === 'new' ? t('germanProgress.courses.add') : t('germanProgress.edit')} size="lg">
        {course && (
          <CourseForm
            initial={course === 'new' ? null : course}
            onCancel={() => setCourse(null)}
            onSubmit={async (body) => {
              const ok = await run(() => (course === 'new' ? write('post', '/courses', body) : write('patch', `/courses/${course.id}`, body)), t('germanProgress.courses.saved'));
              if (ok) setCourse(null);
            }}
          />
        )}
      </Modal>
      <Modal open={!!exam} onClose={() => setExam(null)} title={exam === 'new' ? t('germanProgress.exams.add') : t('germanProgress.edit')} size="lg">
        {exam && (
          <ExamForm
            ov={ov}
            initial={exam === 'new' ? null : exam}
            onCancel={() => setExam(null)}
            onSubmit={async (body) => {
              const ok = await run(() => (exam === 'new' ? write('post', '/exams', body) : write('patch', `/exams/${exam.id}`, body)), t('germanProgress.exams.saved'));
              if (ok) setExam(null);
            }}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          const d = deleting!;
          void run(() => write('delete', `/${d.kind}/${d.id}`), d.kind === 'courses' ? t('germanProgress.courses.deleted') : t('germanProgress.exams.deleted')).then(() => setDeleting(null));
        }}
        title={t('germanProgress.delete')}
        confirmLabel={t('germanProgress.delete')}
      />
    </div>
  );
};

export default GermanProgressBoard;
