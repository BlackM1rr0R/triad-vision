/**
 * Waste sorting game rules (pure, deterministic): which items a round shows (seeded, so a shared link replays
 * the same items), points per answer with a combo multiplier and a speed bonus, and the round summary.
 */
import { seededRandom, shuffle } from '../common';
import { WASTE_ITEMS, type WasteBin, type WasteItem } from './items';

export const ROUND_SIZE = 20;
/** Time for the whole round; the clock pauses while the explanation of an answer is shown. */
export const ROUND_SECONDS = 120;
export const BASE_POINTS = 10;
export const MAX_MULTIPLIER = 3;

/** A random seed for a new round (1 … 999 999). */
export const newSeed = () => 1 + Math.floor(Math.random() * 999_999);

/** Parses ?seed= (positive integer up to 999 999), else null. */
export const parseSeed = (v: string | null): number | null => {
  if (!v || !/^\d{1,6}$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
};

/** The items of a round: shuffled by `seed`, at least a quarter tricky ones when available. */
export const pickRound = (seed: number, size = ROUND_SIZE, items: readonly WasteItem[] = WASTE_ITEMS): WasteItem[] => {
  const rnd = seededRandom(seed);
  const all = shuffle(items, rnd);
  const tricky = all.filter((i) => i.tricky);
  const minTricky = Math.min(tricky.length, Math.ceil(size / 4));
  const chosen = all.slice(0, size);
  const missing = minTricky - chosen.filter((i) => i.tricky).length;
  if (missing > 0) {
    const extra = tricky.filter((t) => !chosen.includes(t)).slice(0, missing);
    // replace the last non-tricky items
    for (const e of extra) {
      const idx = chosen.map((c) => c.tricky).lastIndexOf(false);
      if (idx >= 0) chosen[idx] = e;
    }
  }
  return shuffle(chosen, rnd);
};

/** Combo multiplier after `combo` correct answers in a row: ×1, from 3 in a row ×1.5, 6 ×2, 9 ×2.5, 12+ ×3. */
export const multiplierFor = (combo: number) => Math.min(MAX_MULTIPLIER, 1 + Math.floor(Math.max(0, combo) / 3) * 0.5);

/** Speed bonus: answered within 3 s +5, within 6 s +2. */
export const speedBonus = (seconds: number) => (seconds <= 3 ? 5 : seconds <= 6 ? 2 : 0);

export interface AnswerResult {
  correct: boolean;
  points: number;
  combo: number;
}

/** Points for one answer given the combo before it and the seconds it took. Wrong answers reset the combo. */
export const scoreAnswer = (correct: boolean, comboBefore: number, seconds: number): AnswerResult => {
  if (!correct) return { correct: false, points: 0, combo: 0 };
  const combo = comboBefore + 1;
  return { correct: true, points: Math.round(BASE_POINTS * multiplierFor(combo)) + speedBonus(seconds), combo };
};

/** Bonus for finishing all items before the time ran out: 1 point per remaining second. */
export const timeBonus = (remainingSeconds: number, finished: boolean) => (finished ? Math.max(0, Math.floor(remainingSeconds)) : 0);

export interface Answer {
  itemId: string;
  chosen: WasteBin;
  correct: boolean;
  points: number;
}

export interface RoundSummary {
  total: number;
  answered: number;
  correct: number;
  /** 0–100, of the answered items. */
  accuracy: number;
  points: number;
  maxCombo: number;
  mistakes: Answer[];
}

export const summarize = (answers: Answer[], bonus = 0): RoundSummary => {
  let combo = 0;
  let maxCombo = 0;
  for (const a of answers) {
    combo = a.correct ? combo + 1 : 0;
    maxCombo = Math.max(maxCombo, combo);
  }
  const correct = answers.filter((a) => a.correct).length;
  return {
    total: ROUND_SIZE,
    answered: answers.length,
    correct,
    accuracy: answers.length ? Math.round((correct / answers.length) * 100) : 0,
    points: answers.reduce((s, a) => s + a.points, 0) + bonus,
    maxCombo,
    mistakes: answers.filter((a) => !a.correct),
  };
};
