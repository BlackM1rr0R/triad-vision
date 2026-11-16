/**
 * German traffic signs test (/traffic-signs): the sign list (data.ts) as objects and the pure exam logic —
 * building a 30-question exam with four answer options each and grading it (pass at 90 %).
 */
import type { Tx } from '../common';
import { shuffle } from '../common';
import { SIGN_ROWS, type SignCategoryKey } from './data';

export type SignCategory = SignCategoryKey;
export const SIGN_CATEGORIES: SignCategory[] = ['warning', 'priority', 'regulatory', 'informational'];

export interface Sign {
  /** Number in the Verkehrszeichenkatalog, e.g. "205", "274-30", "325.1". */
  id: string;
  /** Public path of the bundled SVG. */
  file: string;
  category: SignCategory;
  /** Official German name. */
  de: string;
  name: Tx;
  text: Tx;
}

export const SIGNS_AS_OF = '2026-11';

/** Official sources of the sign meanings (StVO Anlagen 1–3) and of the images. */
export const SIGN_SOURCES = [
  { label: 'StVO Anlage 1 (Gefahrzeichen)', url: 'https://www.gesetze-im-internet.de/stvo_2013/anlage_1.html' },
  { label: 'StVO Anlage 2 (Vorschriftzeichen)', url: 'https://www.gesetze-im-internet.de/stvo_2013/anlage_2.html' },
  { label: 'StVO Anlage 3 (Richtzeichen)', url: 'https://www.gesetze-im-internet.de/stvo_2013/anlage_3.html' },
  { label: 'Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/Category:Diagrams_of_regulatory_road_signs_of_Germany,_2017_set' },
];

export const SIGNS: Sign[] = SIGN_ROWS.map(([id, category, de, n, x]) => ({
  id,
  file: `/signs/${id}.svg`,
  category,
  de,
  name: { az: n[0], de, en: n[1], ru: n[2], tr: n[3], uk: n[4] },
  text: { az: x[0], de: x[1], en: x[2], ru: x[3], tr: x[4], uk: x[5] },
}));

export const SIGN_BY_ID = new Map(SIGNS.map((s) => [s.id, s]));

export const signsByCategory = (category: SignCategory) => SIGNS.filter((s) => s.category === category);

export const EXAM_SIZE = 30;
export const EXAM_SECONDS = 15 * 60;
export const PASS_RATIO = 0.9;

export interface ExamQuestion {
  /** The sign shown. */
  signId: string;
  /** Four sign ids whose names are the answer options (shuffled; one is signId). */
  options: string[];
}

/**
 * `n` questions on distinct signs (or the given pool, e.g. only past mistakes), each with the correct name and
 * three distractors — from the same category first, filled from the others when a category is small.
 */
export const buildExam = (rnd: () => number = Math.random, n = EXAM_SIZE, pool: readonly Sign[] = SIGNS): ExamQuestion[] => {
  const picked = shuffle(pool, rnd).slice(0, Math.min(n, pool.length));
  return picked.map((sign) => {
    const same = shuffle(
      SIGNS.filter((s) => s.category === sign.category && s.id !== sign.id),
      rnd,
    );
    const other = shuffle(
      SIGNS.filter((s) => s.category !== sign.category),
      rnd,
    );
    const distractors: string[] = [];
    for (const s of [...same, ...other]) {
      if (distractors.length === 3) break;
      if (s.de !== sign.de && !distractors.some((d) => SIGN_BY_ID.get(d)?.de === s.de)) distractors.push(s.id);
    }
    return { signId: sign.id, options: shuffle([sign.id, ...distractors], rnd) };
  });
};

/** Minimum correct answers to pass `total` questions (27 of 30). */
export const passMark = (total: number) => Math.ceil(total * PASS_RATIO - 1e-9);

export interface ExamResult {
  correct: number;
  total: number;
  percent: number;
  passed: boolean;
  /** Sign ids answered wrongly or not at all. */
  mistakes: string[];
}

/** Grades answers (question index → chosen sign id; missing = unanswered = wrong). */
export const grade = (questions: readonly ExamQuestion[], answers: Readonly<Record<number, string>>): ExamResult => {
  const total = questions.length;
  const mistakes = questions.filter((q, i) => answers[i] !== q.signId).map((q) => q.signId);
  const correct = total - mistakes.length;
  return { correct, total, percent: total ? Math.round((correct / total) * 100) : 0, passed: total > 0 && correct >= passMark(total), mistakes };
};
