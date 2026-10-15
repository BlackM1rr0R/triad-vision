/**
 * German self-test: question selection and the level rule.
 * A level is "unlocked" with at least 70 % correct answers; the estimated level is the highest
 * level reached without a gap (A1 → A2 → B1 → B2). Below 70 % at A1 the estimate is "none".
 */

export const GERMAN_TEST_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
export type GermanTestLevel = (typeof GERMAN_TEST_LEVELS)[number];
export type EstimatedLevel = 'none' | GermanTestLevel;

export const PASS_PERCENT = 70;
export const TEST_SIZE = 20;

/** Certificate requirement keys (document templates) that count as a language certificate. */
export const LANGUAGE_CERT_KEYS = ['LANGUAGE_CERT', 'GERMAN_CERT'];

export interface LevelScore {
  level: GermanTestLevel;
  total: number;
  correct: number;
  percent: number;
  passed: boolean;
}

export interface TestScore {
  levels: LevelScore[];
  estimated: EstimatedLevel;
  total: number;
  correct: number;
  percent: number;
}

/** Score answers ({ questionId: chosenIndex }) against the questions that were asked. */
export const scoreTest = (questions: { id: string; level: string; answer: number }[], answers: Record<string, number>): TestScore => {
  const levels: LevelScore[] = GERMAN_TEST_LEVELS.map((level) => {
    const qs = questions.filter((q) => q.level === level);
    const correct = qs.filter((q) => answers[q.id] === q.answer).length;
    const percent = qs.length ? Math.round((correct / qs.length) * 100) : 0;
    return { level, total: qs.length, correct, percent, passed: qs.length > 0 && percent >= PASS_PERCENT };
  });
  let estimated: EstimatedLevel = 'none';
  for (const l of levels) {
    if (!l.passed) break;
    estimated = l.level;
  }
  const total = questions.length;
  const correct = questions.filter((q) => answers[q.id] === q.answer).length;
  return { levels, estimated, total, correct, percent: total ? Math.round((correct / total) * 100) : 0 };
};

const shuffle = <T>(arr: T[], random: () => number): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Picks `size` questions balanced across levels (size / levels each, remaining slots filled from
 * levels that still have questions), in random order.
 */
export const pickBalanced = <T extends { level: string }>(pool: T[], size = TEST_SIZE, random: () => number = Math.random): T[] => {
  const perLevel = Math.floor(size / GERMAN_TEST_LEVELS.length);
  const buckets = new Map<string, T[]>(GERMAN_TEST_LEVELS.map((l) => [l, shuffle(pool.filter((q) => q.level === l), random)]));
  const chosen: T[] = [];
  for (const l of GERMAN_TEST_LEVELS) chosen.push(...buckets.get(l)!.splice(0, perLevel));
  // Fill the remaining slots round-robin from whatever is left.
  let progress = true;
  while (chosen.length < size && progress) {
    progress = false;
    for (const l of GERMAN_TEST_LEVELS) {
      if (chosen.length >= size) break;
      const next = buckets.get(l)!.shift();
      if (next) {
        chosen.push(next);
        progress = true;
      }
    }
  }
  return shuffle(chosen, random);
};

/** Order of CEFR levels for "required vs. reached" comparisons. */
export const LEVEL_RANK: Record<string, number> = { none: 0, A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
