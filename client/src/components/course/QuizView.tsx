import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CheckCircle2, RotateCcw, Trophy, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { Button } from '@/components/ui/Button';
import { useApiError } from '@/components/portal/useApiError';
import type { LessonDetail, QuizResult } from './api';

/**
 * Quiz of a lesson: one fieldset per question (radio = one answer, checkbox = several), graded on the server.
 * Feedback: score, right / wrong and the explanation per question; the right options only after passing.
 */
export function QuizView({ lesson, onResult }: { lesson: LessonDetail; onResult: (r: QuizResult) => void }) {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const apiError = useApiError();
  const [answers, setAnswers] = useState<number[][]>(() => lesson.questions.map(() => []));
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);

  const toggle = (qi: number, oi: number, multiple: boolean) => {
    if (result) return;
    setMissing(false);
    setAnswers((a) => a.map((x, i) => (i !== qi ? x : multiple ? (x.includes(oi) ? x.filter((o) => o !== oi) : [...x, oi]) : [oi])));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (answers.some((a) => a.length === 0)) {
      setMissing(true);
      return;
    }
    setBusy(true);
    try {
      const r = (await api.post<QuizResult>(`/course/lessons/${lesson.id}/quiz`, { answers })).data;
      setResult(r);
      onResult(r);
      requestAnimationFrame(() => document.getElementById('quiz-result')?.focus());
    } catch (err) {
      apiError(err);
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    setResult(null);
    setAnswers(lesson.questions.map(() => []));
    requestAnimationFrame(() => document.getElementById(`q-${lesson.questions[0]?.id}`)?.focus());
  };

  const byId = new Map(result?.results.map((r) => [r.questionId, r]));

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <p className="text-sm text-muted">
        {t('course.lesson.quiz.passMark', { mark: lesson.passMark })}
        {lesson.quiz && lesson.quiz.attempts > 0 && lesson.quiz.score !== null && <> · {t('course.lesson.quiz.best', { score: lesson.quiz.score, attempts: lesson.quiz.attempts })}</>}
      </p>

      {result && (
        <div
          id="quiz-result"
          tabIndex={-1}
          role="status"
          className={clsx('flex items-start gap-3 rounded-2xl border p-4 outline-none', result.passed ? 'border-success-border bg-success-bg text-success-fg' : 'border-warning-border bg-warning-bg text-warning-fg')}
        >
          {result.passed ? <Trophy className="mt-0.5 size-5 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden />}
          <p className="font-semibold">{result.passed ? t('course.lesson.quiz.passed', { score: result.score }) : t('course.lesson.quiz.failed', { score: result.score, mark: result.passMark })}</p>
        </div>
      )}

      <ol className="space-y-4">
        {lesson.questions.map((q, qi) => {
          const multiple = q.kind === 'MULTIPLE';
          const fb = byId.get(q.id);
          return (
            <li key={q.id}>
              <fieldset
                id={`q-${q.id}`}
                tabIndex={-1}
                className={clsx('rounded-2xl border bg-card p-4 outline-none sm:p-5', fb ? (fb.correct ? 'border-success-border' : 'border-danger-border') : 'border-line')}
                aria-describedby={`q-${q.id}-hint`}
              >
                <legend className="type-caption float-left w-full">{t('course.lesson.quiz.question', { n: qi + 1, total: lesson.questions.length })}</legend>
                <p className="mt-1 font-semibold text-ink">{tr(q.prompt)}</p>
                <p id={`q-${q.id}-hint`} className="mt-1 text-xs text-muted">
                  {multiple ? t('course.lesson.quiz.multiple') : t('course.lesson.quiz.single')}
                </p>
                <div className="mt-3 space-y-2">
                  {q.options.map((o, oi) => {
                    const chosen = answers[qi]?.includes(oi) ?? false;
                    const isRight = fb?.correctOptions?.includes(oi) ?? false;
                    return (
                      <label
                        key={oi}
                        className={clsx(
                          'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-[15px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus',
                          isRight ? 'border-success-border bg-success-bg' : chosen ? 'border-primary bg-primary/[0.06]' : 'border-line hover:bg-sunken',
                          result && 'cursor-default',
                        )}
                      >
                        <input
                          type={multiple ? 'checkbox' : 'radio'}
                          name={`q-${q.id}`}
                          className="size-5 shrink-0 accent-primary"
                          checked={chosen}
                          disabled={!!result}
                          onChange={() => toggle(qi, oi, multiple)}
                        />
                        <span className="min-w-0 flex-1 text-ink">{tr(o)}</span>
                        {isRight && <span className="text-xs font-semibold text-success-fg">{t('course.lesson.quiz.rightAnswer')}</span>}
                      </label>
                    );
                  })}
                </div>
                {fb && (
                  <div className={clsx('mt-3 flex items-start gap-2 text-sm', fb.correct ? 'text-success-fg' : 'text-danger-fg')}>
                    {fb.correct ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />}
                    <p>
                      <span className="font-semibold">{fb.correct ? t('course.lesson.quiz.correct') : t('course.lesson.quiz.wrong')}</span>
                      {fb.explanation && tr(fb.explanation) && <span className="text-ink"> — {tr(fb.explanation)}</span>}
                    </p>
                  </div>
                )}
              </fieldset>
            </li>
          );
        })}
      </ol>

      {missing && (
        <p role="alert" className="text-sm font-semibold text-danger-fg">
          {t('course.lesson.quiz.answerAll')}
        </p>
      )}
      {result ? (
        !result.passed && (
          <Button variant="secondary" icon={RotateCcw} onClick={retry}>
            {t('course.lesson.quiz.retry')}
          </Button>
        )
      ) : (
        <Button type="submit" loading={busy}>
          {t('course.lesson.quiz.submit')}
        </Button>
      )}
    </form>
  );
}
