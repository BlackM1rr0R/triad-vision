import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, BadgeCheck, BookOpen, CheckCircle2, Circle, Clock, GraduationCap, ListChecks, PlayCircle, RotateCcw, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Markdown } from '@/components/ops/Markdown';
import { ErrorBlock, LoadingBlock } from '@/components/admin/ui';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { TONE_CLASS, TONE_TEXT } from '@/components/ui/status';
import { useLearnCourses, useTrainingInvalidate, type LearnCourse, type LearnLesson, type QuizResult } from '../api';
import { toastTeamError } from '../shared';

/** Progress bar with an accessible value. */
export const ProgressBar = ({ percent, label, className }: { percent: number; label: string; className?: string }) => (
  <div className={clsx('h-2 overflow-hidden rounded-full bg-surface ring-1 ring-line', className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={label}>
    <div className={clsx('h-full rounded-full transition-all', percent >= 100 ? 'bg-success' : 'bg-brand-500')} style={{ width: `${percent}%` }} />
  </div>
);

const CourseCard = ({ c, onOpen }: { c: LearnCourse; onOpen: (lessonId: string) => void }) => {
  const { t } = useTranslation();
  const next = c.lessons.find((l) => !l.completedAt) ?? c.lessons[0];
  const minutes = c.lessons.reduce((a, l) => a + (l.minutes ?? 0), 0);
  return (
    <article className="flex flex-col rounded-xl border border-line bg-card">
      <div className="space-y-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {c.required && <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', c.progress.complete ? TONE_CLASS.success : TONE_CLASS.warning)}>{t('team.training.required')}</span>}
          {c.progress.complete && (
            <span className={clsx('inline-flex items-center gap-1 text-xs font-semibold', TONE_TEXT.success)}>
              <BadgeCheck className="size-3.5" aria-hidden /> {t('team.training.completed')}
            </span>
          )}
        </div>
        <h3 className="font-display text-lg font-bold text-ink">{c.title}</h3>
        {c.description && <p className="text-sm text-muted">{c.description}</p>}
        <p className="flex flex-wrap gap-x-3 text-xs text-muted">
          <span>{t('team.training.lessonsCount', { count: c.progress.lessons })}</span>
          {minutes > 0 && <span>{t('team.training.minutes', { count: minutes })}</span>}
          {c.progress.avgScore !== null && <span>{t('team.training.avgScore', { score: c.progress.avgScore })}</span>}
        </p>
        <div className="flex items-center gap-3 pt-1">
          <ProgressBar percent={c.progress.percent} label={t('team.training.progressAria', { title: c.title })} className="flex-1" />
          <span className="text-xs font-semibold text-ink tabular-nums">{c.progress.percent}%</span>
        </div>
      </div>
      <ol className="divide-y divide-line border-t border-line">
        {c.lessons.map((l, i) => (
          <li key={l.id}>
            <button type="button" onClick={() => onOpen(l.id)} className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-sm transition hover:bg-surface sm:px-5">
              {l.completedAt ? <CheckCircle2 className={clsx('size-4 shrink-0', TONE_TEXT.success)} aria-label={t('team.training.done')} /> : <Circle className="size-4 shrink-0 text-muted" aria-hidden />}
              <span className="min-w-0 flex-1 truncate text-ink">
                {i + 1}. {l.title}
              </span>
              {l.hasVideo && <PlayCircle className="size-3.5 shrink-0 text-muted" aria-label={t('team.training.hasVideo')} />}
              {l.hasQuiz && <ListChecks className="size-3.5 shrink-0 text-muted" aria-label={t('team.training.hasQuiz')} />}
              {l.quizScore !== null && <span className="text-xs text-muted tabular-nums">{l.quizScore}%</span>}
            </button>
          </li>
        ))}
      </ol>
      {next && (
        <div className="mt-auto border-t border-line p-3 sm:px-5">
          <button type="button" className="btn-primary btn-sm w-full sm:w-auto" onClick={() => onOpen(next.id)}>
            <PlayCircle className="size-4" /> {c.progress.completed === 0 ? t('team.training.start') : c.progress.complete ? t('team.training.review') : t('team.training.continue')}
          </button>
        </div>
      )}
    </article>
  );
};

const Video = ({ lesson }: { lesson: LearnLesson['lesson'] }) => {
  const { t } = useTranslation();
  if (lesson.video && lesson.video.kind !== 'file') {
    return (
      <div className="aspect-video overflow-hidden rounded-xl bg-black">
        <iframe
          src={lesson.video.src}
          title={t('team.training.videoTitle', { title: lesson.title })}
          className="size-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }
  const src = lesson.video?.src ?? (lesson.driveNodeId ? `/api/drive/nodes/${encodeURIComponent(lesson.driveNodeId)}/content` : null);
  if (!src) return null;
  return (
    <video controls preload="metadata" className="aspect-video w-full rounded-xl bg-black" src={src}>
      {t('team.training.noVideoSupport')}
    </video>
  );
};

const Quiz = ({ data, onDone }: { data: LearnLesson; onDone: () => void }) => {
  const { t } = useTranslation();
  const quiz = data.lesson.quiz;
  const [answers, setAnswers] = useState<(number | null)[]>(() => quiz.map(() => null));
  const [result, setResult] = useState<QuizResult | null>(null);
  useEffect(() => {
    setAnswers(quiz.map(() => null));
    setResult(null);
  }, [data.lesson.id, quiz]);
  const submit = useMutation({
    mutationFn: async () => (await api.post<QuizResult>(`/admin/training/learn/lessons/${data.lesson.id}/quiz`, { answers })).data,
    onSuccess: (r) => {
      setResult(r);
      if (r.passed) {
        toast.success(t('team.training.quizPassed', { score: r.score }));
        onDone();
      }
    },
    onError: toastTeamError,
  });
  const passedBefore = !!data.progress?.completedAt;
  return (
    <section className="rounded-xl border border-line bg-card p-4 sm:p-5" aria-labelledby="quiz-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id="quiz-title" className="flex items-center gap-2 font-semibold text-ink">
          <ListChecks className="size-4 text-brand-600" aria-hidden /> {t('team.training.quizTitle')}
        </h3>
        <span className="text-xs text-muted">
          {t('team.training.passScore', { score: data.lesson.passScore })}
          {data.progress?.attempts ? ` · ${t('team.training.attempts', { count: data.progress.attempts })}` : ''}
        </span>
      </div>
      {passedBefore && !result && <p className={clsx('mb-3 rounded-lg px-3 py-2 text-sm', TONE_CLASS.success)}>{t('team.training.alreadyPassed', { score: data.progress?.quizScore ?? 0 })}</p>}
      <ol className="space-y-4">
        {quiz.map((q, qi) => {
          const verdict = result ? result.correct[qi] : null;
          return (
            <li key={qi}>
              <fieldset>
                <legend className="mb-2 flex items-start gap-2 text-sm font-semibold text-ink">
                  <span className="text-muted tabular-nums">{qi + 1}.</span>
                  <span className="flex-1">{q.q}</span>
                  {verdict !== null &&
                    (verdict ? <CheckCircle2 className={clsx('size-4 shrink-0', TONE_TEXT.success)} aria-label={t('team.training.right')} /> : <XCircle className={clsx('size-4 shrink-0', TONE_TEXT.danger)} aria-label={t('team.training.wrong')} />)}
                </legend>
                <div className="grid gap-1.5">
                  {q.options.map((o, oi) => (
                    <label key={oi} className={clsx('flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition', answers[qi] === oi ? 'border-brand-500 bg-brand-50' : 'border-line hover:bg-surface')}>
                      <input
                        type="radio"
                        name={`q-${data.lesson.id}-${qi}`}
                        className="size-4"
                        checked={answers[qi] === oi}
                        onChange={() => {
                          setResult(null);
                          setAnswers((a) => a.map((x, i) => (i === qi ? oi : x)));
                        }}
                      />
                      <span className="text-ink">{o}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      {result && !result.passed && (
        <p className={clsx('mt-4 rounded-lg px-3 py-2 text-sm', TONE_CLASS.danger)} role="status">
          {t('team.training.quizFailed', { score: result.score, pass: result.passScore })}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-primary btn-sm" disabled={submit.isPending || answers.some((a) => a === null)} onClick={() => submit.mutate()}>
          {submit.isPending ? <Spinner className="size-3.5" /> : result && !result.passed ? <RotateCcw className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
          {result && !result.passed ? t('team.training.retry') : t('team.training.submit')}
        </button>
      </div>
    </section>
  );
};

const LessonView = ({ lessonId, onOpen, onBack }: { lessonId: string; onOpen: (id: string) => void; onBack: () => void }) => {
  const { t } = useTranslation();
  const inv = useTrainingInvalidate();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['training', 'lesson', lessonId],
    queryFn: async () => (await api.get<LearnLesson>(`/admin/training/learn/lessons/${lessonId}`)).data,
  });
  const complete = useMutation({
    mutationFn: async () => api.post(`/admin/training/learn/lessons/${lessonId}/complete`),
    onSuccess: () => {
      toast.success(t('team.training.lessonDone'));
      void inv();
    },
    onError: toastTeamError,
  });
  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;
  const done = !!data.progress?.completedAt;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button type="button" onClick={onBack} className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" /> {t('team.training.backToCourses')}
      </button>
      <header>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">
          {data.course.title} · {t('team.training.lessonOf', { n: data.position, total: data.total })}
        </p>
        <h2 className="mt-1 flex flex-wrap items-center gap-2 font-display text-2xl font-extrabold text-ink">
          {data.lesson.title}
          {done && (
            <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-xs font-semibold', TONE_CLASS.success)}>
              <CheckCircle2 className="size-3.5" aria-hidden /> {t('team.training.done')}
            </span>
          )}
        </h2>
        {data.lesson.minutes ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted">
            <Clock className="size-3.5" aria-hidden /> {t('team.training.minutes', { count: data.lesson.minutes })}
          </p>
        ) : null}
      </header>
      <Video lesson={data.lesson} />
      {data.lesson.body?.trim() && (
        <div className="rounded-xl border border-line bg-card p-4 sm:p-6">
          <Markdown source={data.lesson.body} />
        </div>
      )}
      {data.lesson.quiz.length > 0 ? (
        <Quiz
          data={data}
          onDone={() => {
            void inv();
          }}
        />
      ) : (
        !done && (
          <button type="button" className="btn-primary" disabled={complete.isPending} onClick={() => complete.mutate()}>
            {complete.isPending ? <Spinner className="size-4" /> : <CheckCircle2 className="size-4" />} {t('team.training.markDone')}
          </button>
        )
      )}
      <nav className="flex flex-wrap justify-between gap-2 border-t border-line pt-4" aria-label={t('team.training.lessonNav')}>
        {data.prev ? (
          <button type="button" className="btn-secondary btn-sm max-w-full" onClick={() => onOpen(data.prev!.id)}>
            <ArrowLeft className="size-3.5 shrink-0" /> <span className="truncate">{data.prev.title}</span>
          </button>
        ) : (
          <span />
        )}
        {data.next ? (
          <button type="button" className="btn-secondary btn-sm max-w-full" onClick={() => onOpen(data.next!.id)}>
            <span className="truncate">{data.next.title}</span> <ArrowRight className="size-3.5 shrink-0" />
          </button>
        ) : (
          <button type="button" className="btn-secondary btn-sm" onClick={onBack}>
            <GraduationCap className="size-3.5" /> {t('team.training.finishCourse')}
          </button>
        )}
      </nav>
    </div>
  );
};

/** Learner view: my courses with progress; ?lesson=<id> opens the lesson viewer (video, text, quiz). */
export const Learn = () => {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const lessonId = sp.get('lesson');
  const { data, isLoading, error, refetch } = useLearnCourses();
  const open = (id: string | null) =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (id) n.set('lesson', id);
        else n.delete('lesson');
        return n;
      },
      { replace: false },
    );

  if (lessonId) return <LessonView lessonId={lessonId} onOpen={open} onBack={() => open(null)} />;
  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;
  if (!data.length) return <EmptyState icon={BookOpen} title={t('team.training.noCourses')} text={t('team.training.noCoursesHint')} />;
  const required = data.filter((c) => c.required);
  const optional = data.filter((c) => !c.required);
  return (
    <div className="space-y-6">
      {[
        { key: 'required', list: required },
        { key: 'optional', list: optional },
      ]
        .filter((g) => g.list.length)
        .map((g) => (
          <section key={g.key} aria-labelledby={`learn-${g.key}`}>
            <h2 id={`learn-${g.key}`} className="mb-3 text-xs font-bold tracking-wide text-muted uppercase">
              {t(`team.training.group.${g.key}`)}
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {g.list.map((c) => (
                <CourseCard key={c.id} c={c} onOpen={open} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
};
