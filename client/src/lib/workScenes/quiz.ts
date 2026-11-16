/**
 * "Quiz me" mode of the work scenes: one hotspot is highlighted, the learner picks its German word from four.
 * Pure functions with an injectable random source (lib/games/common seededRandom) so tests are deterministic.
 */
import { shuffle } from '@/lib/games/common';

export interface QuizItem {
  id: string;
  de: string;
}

export const OPTION_COUNT = 4;

/** The order in which the hotspots are asked (every one once). */
export const quizOrder = (items: readonly QuizItem[], rnd: () => number = Math.random): string[] => shuffle(items.map((i) => i.id), rnd);

/**
 * Four answer options for `targetId`: the target and three other hotspots of the scene with a different
 * German word, in random order. Fewer when the scene has fewer distinct words.
 */
export const quizOptions = (targetId: string, items: readonly QuizItem[], rnd: () => number = Math.random, count = OPTION_COUNT): QuizItem[] => {
  const target = items.find((i) => i.id === targetId);
  if (!target) return [];
  const seen = new Set([target.de.toLowerCase()]);
  const others: QuizItem[] = [];
  for (const i of shuffle(items, rnd)) {
    const k = i.de.toLowerCase();
    if (i.id === targetId || seen.has(k)) continue;
    seen.add(k);
    others.push(i);
    if (others.length === count - 1) break;
  }
  return shuffle([target, ...others], rnd);
};

export interface QuizState {
  order: string[];
  index: number;
  correct: number;
  /** Id chosen for the current question (null while unanswered). */
  answer: string | null;
  /** Ids answered wrongly, for the review at the end. */
  missed: string[];
}

export const startQuiz = (items: readonly QuizItem[], rnd: () => number = Math.random): QuizState => ({ order: quizOrder(items, rnd), index: 0, correct: 0, answer: null, missed: [] });

export const currentTarget = (s: QuizState): string | null => s.order[s.index] ?? null;
export const isFinished = (s: QuizState) => s.index >= s.order.length;

/** Records the answer to the current question (ignored when already answered or finished). */
export const answerQuiz = (s: QuizState, chosenId: string): QuizState => {
  const target = currentTarget(s);
  if (!target || s.answer !== null) return s;
  const ok = chosenId === target;
  return { ...s, answer: chosenId, correct: s.correct + (ok ? 1 : 0), missed: ok ? s.missed : [...s.missed, target] };
};

/** Moves to the next question (only after answering). */
export const nextQuestion = (s: QuizState): QuizState => (s.answer === null ? s : { ...s, index: s.index + 1, answer: null });

/** Rounded percentage of correct answers. */
export const quizPercent = (s: QuizState) => (s.order.length ? Math.round((s.correct / s.order.length) * 100) : 0);
