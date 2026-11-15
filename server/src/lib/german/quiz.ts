import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest } from '../http.js';
import { VOCAB_FIELDS } from './vocab.js';

/**
 * Per-profession vocabulary quiz (portal "Alman dili"): 10 multiple-choice questions drawn from one job field's
 * words — the German word, four translations in the candidate's language, one of them right. Practice only:
 * nothing is stored (the score and the review of wrong answers are shown by the client).
 */

export const QUIZ_SIZE = 10;
export const QUIZ_OPTIONS = 4;
export const QUIZ_LANGS = ['az', 'ru', 'en'] as const;
export type QuizLang = (typeof QUIZ_LANGS)[number];

export const quizQuerySchema = z.object({
  field: z.enum(VOCAB_FIELDS),
  lang: z.enum(QUIZ_LANGS).default('en'),
});

export interface QuizWord {
  id: string;
  de: string;
  article: string | null;
  example?: string | null;
  translations: Record<QuizLang, string>;
}

export interface QuizQuestion {
  wordId: string;
  word: string;
  example: string | null;
  options: string[];
  answer: number;
}

/** Fisher–Yates with an injectable random source (tests pass a seeded one). */
export const shuffle = <T>(items: readonly T[], random: () => number = Math.random): T[] => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Up to `size` questions from `words`: each word at most once, options are distinct translations (the right one
 * plus three other words of the same field), in random order. Words without a translation are skipped.
 */
export const buildQuiz = (words: QuizWord[], lang: QuizLang, opts: { size?: number; random?: () => number } = {}): QuizQuestion[] => {
  const random = opts.random ?? Math.random;
  const size = opts.size ?? QUIZ_SIZE;
  const usable = words.filter((w) => w.translations[lang]?.trim());
  const picked = shuffle(usable, random).slice(0, size);
  return picked.flatMap((w) => {
    const right = w.translations[lang].trim();
    const pool = Array.from(new Set(usable.map((o) => o.translations[lang].trim()).filter((t) => t.toLowerCase() !== right.toLowerCase())));
    const wrong = shuffle(pool, random).slice(0, QUIZ_OPTIONS - 1);
    if (wrong.length < 1) return [];
    const options = shuffle([right, ...wrong], random);
    return [{ wordId: w.id, word: w.article ? `${w.article} ${w.de}` : w.de, example: w.example ?? null, options, answer: options.indexOf(right) }];
  });
};

const translationsOf = (v: Prisma.JsonValue): Record<QuizLang, string> => {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
  return { az: s('az'), ru: s('ru'), en: s('en') };
};

/** GET /api/german/vocab/quiz?field&lang */
export const vocabQuiz = async (q: z.infer<typeof quizQuerySchema>) => {
  const rows = await prisma.germanWord.findMany({ where: { published: true, field: q.field }, select: { id: true, de: true, article: true, example: true, translations: true } });
  if (rows.length < QUIZ_OPTIONS) throw badRequest('NOT_ENOUGH_WORDS');
  const questions = buildQuiz(
    rows.map((r) => ({ ...r, translations: translationsOf(r.translations) })),
    q.lang,
  );
  return { field: q.field, lang: q.lang, questions };
};
