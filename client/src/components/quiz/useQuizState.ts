import { useCallback, useEffect, useMemo, useState } from 'react';
import { isDriverField, stepsFor, type QuestionId, type QuizAnswers } from './scoring';

const KEY = 'tv_eligibility_v1';

interface Persisted {
  answers: QuizAnswers;
  step: number;
  done: boolean;
}

const EMPTY: Persisted = { answers: {}, step: 0, done: false };

const load = (): Persisted & { restored: boolean } => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { ...EMPTY, restored: false };
    const p = JSON.parse(raw) as Partial<Persisted>;
    const answers = p.answers && typeof p.answers === 'object' ? p.answers : {};
    const restored = Object.keys(answers).length > 0;
    return { answers, step: Number.isInteger(p.step) ? Number(p.step) : 0, done: !!p.done, restored };
  } catch {
    return { ...EMPTY, restored: false };
  }
};

/** Wizard state (answers, current step, finished flag) persisted in sessionStorage. */
export const useQuizState = () => {
  const [initial] = useState(load);
  const [answers, setAnswers] = useState<QuizAnswers>(initial.answers);
  const [step, setStep] = useState(initial.step);
  const [done, setDone] = useState(initial.done);
  const [direction, setDirection] = useState<1 | -1>(1);

  const steps = useMemo(() => stepsFor(answers), [answers]);
  const safeStep = Math.min(Math.max(step, 0), steps.length - 1);
  const current: QuestionId = steps[safeStep];

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ answers, step: safeStep, done } satisfies Persisted));
    } catch {
      /* storage unavailable — progress just isn't saved */
    }
  }, [answers, safeStep, done]);

  const answer = useCallback((id: QuestionId, value: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [id]: value } as QuizAnswers;
      if (id === 'field' && !isDriverField(value)) delete next.licence;
      return next;
    });
  }, []);

  const goNext = useCallback(() => {
    setDirection(1);
    if (safeStep >= steps.length - 1) setDone(true);
    else setStep(safeStep + 1);
  }, [safeStep, steps.length]);

  const goBack = useCallback(() => {
    setDirection(-1);
    if (done) setDone(false);
    else setStep(Math.max(0, safeStep - 1));
  }, [done, safeStep]);

  const reset = useCallback(() => {
    setDirection(-1);
    setAnswers({});
    setStep(0);
    setDone(false);
  }, []);

  return {
    answers,
    steps,
    step: safeStep,
    current,
    done,
    direction,
    restored: initial.restored,
    answer,
    goNext,
    goBack,
    reset,
  };
};
