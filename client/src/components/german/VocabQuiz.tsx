import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CheckCircle2, GraduationCap, Play, RotateCcw, X, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesGermanVocab } from '@/i18n/pagesGermanVocab';
import { pagesGermanQuiz } from '@/i18n/pagesGermanQuiz';
import { Spinner } from '@/components/ui/Spinner';
import { useApiError } from '@/components/portal/useApiError';
import { useVocabSummary } from './api';
import { VOCAB_FIELDS } from './types';
import { translationLang } from './VocabTrainer';

registerCopy(pagesGermanVocab);
registerCopy(pagesGermanQuiz);

/** GET /api/german/vocab/quiz (server/src/lib/german/quiz.ts). */
interface QuizQuestion {
  wordId: string;
  word: string;
  example: string | null;
  options: string[];
  answer: number;
}

/**
 * Per-profession quiz: 10 multiple-choice questions from one job field's words (German word → translation in the
 * interface language), immediate feedback, then the score and a review of the wrong answers. Nothing is stored.
 */
export const VocabQuiz = () => {
  const { t, i18n } = useTranslation();
  const apiError = useApiError();
  const { data: s } = useVocabSummary();
  const fields = VOCAB_FIELDS.filter((f) => (s?.fields.find((g) => g.key === f)?.total ?? 0) >= 4);
  const [field, setField] = useState<string>('');
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  if (!s || fields.length === 0) return null;
  const chosen = field && fields.includes(field as (typeof fields)[number]) ? field : (fields.find((f) => f === 'ELECTRICAL') ?? fields[0]);

  const start = async () => {
    setLoading(true);
    try {
      const res = (await api.get<{ questions: QuizQuestion[] }>('/german/vocab/quiz', { params: { field: chosen, lang: translationLang(i18n.language) } })).data;
      setQuestions(res.questions);
      setAnswers([]);
    } catch (err) {
      apiError(err);
    } finally {
      setLoading(false);
    }
  };

  // The current question keeps its feedback on screen until "Next" records the answer.
  const pos = answers.length;

  return (
    <section className="card overflow-hidden" aria-labelledby="vocab-quiz-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 id="vocab-quiz-title" className="flex items-center gap-2.5 text-base font-semibold text-ink">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft">
              <GraduationCap className="size-4" aria-hidden />
            </span>
            {t('germanQuiz.title')}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">{t('germanQuiz.subtitle')}</p>
        </div>
        {questions && (
          <button type="button" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken" onClick={() => setQuestions(null)} aria-label={t('germanQuiz.close')}>
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="p-5 sm:p-6">
        {!questions ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1 sm:max-w-xs">
              <label htmlFor="vocab-quiz-field" className="label">
                {t('germanQuiz.field')}
              </label>
              <select id="vocab-quiz-field" className="input" value={chosen} onChange={(e) => setField(e.target.value)}>
                {fields.map((f) => (
                  <option key={f} value={f}>
                    {t(`germanVocab.fields.${f}`)}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn-primary min-h-11" disabled={loading} onClick={() => void start()}>
              {loading ? <Spinner className="size-4" /> : <Play className="size-4" aria-hidden />}
              {t('germanQuiz.start')}
            </button>
          </div>
        ) : pos >= questions.length ? (
          <QuizResult questions={questions} answers={answers} onAgain={() => void start()} onClose={() => setQuestions(null)} loading={loading} />
        ) : (
          <QuizStep key={questions[pos].wordId} q={questions[pos]} n={pos + 1} total={questions.length} onAnswer={(i) => setAnswers((a) => [...a, i])} />
        )}
      </div>
    </section>
  );
};

/** One question: pick an option → feedback → "Next" records the answer. */
const QuizStep = ({ q, n, total, onAnswer }: { q: QuizQuestion; n: number; total: number; onAnswer: (i: number) => void }) => {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<number | null>(null);
  const done = picked !== null;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted">
        <span className="tabular-nums">{t('germanQuiz.question', { n, total })}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-highlight" style={{ width: `${((n - 1) / total) * 100}%` }} />
      </div>
      <p className="mt-5 text-sm text-muted">{t('germanQuiz.meaning')}</p>
      <p className="mt-1 font-display text-2xl font-semibold break-words text-ink sm:text-3xl" lang="de">
        {q.word}
      </p>
      {q.example && (
        <p className="mt-1 text-sm text-muted italic" lang="de">
          {q.example}
        </p>
      )}
      <ul className="mt-5 grid gap-2 sm:grid-cols-2" role="list">
        {q.options.map((o, i) => {
          const right = i === q.answer;
          const mine = i === picked;
          return (
            <li key={o}>
              <button
                type="button"
                disabled={done}
                onClick={() => setPicked(i)}
                aria-pressed={mine}
                className={clsx(
                  'flex min-h-12 w-full items-center gap-2 rounded-xl border px-4 py-2 text-left text-sm font-medium transition-colors',
                  !done && 'border-line bg-card text-ink hover:border-primary',
                  done && right && 'border-success/40 bg-success-bg text-success-fg',
                  done && mine && !right && 'border-danger-border bg-danger-bg text-danger-fg',
                  done && !mine && !right && 'border-line bg-card text-muted',
                )}
              >
                {done && right && <CheckCircle2 className="size-4 shrink-0" aria-hidden />}
                {done && mine && !right && <XCircle className="size-4 shrink-0" aria-hidden />}
                <span className="min-w-0 break-words">{o}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {done && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p role="status" className={clsx('text-sm font-semibold', picked === q.answer ? 'text-success-fg' : 'text-danger-fg')}>
            {picked === q.answer ? t('germanQuiz.right') : t('germanQuiz.wrong', { answer: q.options[q.answer] })}
          </p>
          <button type="button" className="btn-primary min-h-11" autoFocus onClick={() => onAnswer(picked ?? -1)}>
            {n === total ? t('germanQuiz.finish') : t('germanQuiz.next')}
          </button>
        </div>
      )}
    </div>
  );
};

const QuizResult = ({ questions, answers, onAgain, onClose, loading }: { questions: QuizQuestion[]; answers: number[]; onAgain: () => void; onClose: () => void; loading: boolean }) => {
  const { t } = useTranslation();
  const correct = questions.filter((q, i) => answers[i] === q.answer).length;
  const wrong = questions.map((q, i) => ({ q, a: answers[i] })).filter((x) => x.a !== x.q.answer);
  const ratio = questions.length ? correct / questions.length : 0;
  return (
    <div>
      <div className="text-center">
        <p className="font-display text-3xl font-semibold text-ink tabular-nums">{t('germanQuiz.score', { correct, total: questions.length })}</p>
        <p className="mt-1 text-sm text-muted">{ratio >= 0.9 ? t('germanQuiz.great') : ratio >= 0.6 ? t('germanQuiz.good') : t('germanQuiz.practise')}</p>
      </div>
      <h3 className="mt-6 text-xs font-semibold text-muted uppercase">{t('germanQuiz.review')}</h3>
      {wrong.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-success-fg">
          <CheckCircle2 className="size-4" aria-hidden /> {t('germanQuiz.noMistakes')}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {wrong.map(({ q, a }) => (
            <li key={q.wordId} className="rounded-xl border border-line bg-sunken px-4 py-3 text-sm">
              <p className="font-semibold text-ink" lang="de">
                {q.word}
              </p>
              <p className="mt-1 text-danger-fg">
                {t('germanQuiz.yourAnswer')}: {q.options[a] ?? '—'}
              </p>
              <p className="text-success-fg">
                {t('germanQuiz.correctAnswer')}: {q.options[q.answer]}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn-primary" disabled={loading} onClick={onAgain}>
          {loading ? <Spinner className="size-4" /> : <RotateCcw className="size-4" aria-hidden />}
          {t('germanQuiz.again')}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          {t('germanQuiz.close')}
        </button>
      </div>
    </div>
  );
};

export default VocabQuiz;
