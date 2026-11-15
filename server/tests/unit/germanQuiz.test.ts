import { describe, expect, it } from 'vitest';
import { buildQuiz, QUIZ_OPTIONS, QUIZ_SIZE, shuffle, type QuizWord } from '../../src/lib/german/quiz.js';
import { germanVocabulary } from '../../prisma/seed/germanVocabulary.js';
import { VOCAB_FIELDS } from '../../src/lib/german/vocab.js';

/** Deterministic random source (mulberry32). */
const seeded = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const electrical: QuizWord[] = germanVocabulary.filter((w) => w.field === 'ELECTRICAL').map((w) => ({ id: w.slug, de: w.de, article: w.article, example: w.example, translations: w.translations }));

describe('vocabulary quiz', () => {
  it('ELECTRICAL is a job field with about 40 words', () => {
    expect(VOCAB_FIELDS).toContain('ELECTRICAL');
    expect(electrical.length).toBeGreaterThanOrEqual(40);
    expect(electrical.every((w) => ['A2', 'B1'].includes(germanVocabulary.find((g) => g.slug === w.id)!.level))).toBe(true);
  });

  it('10 distinct words, 4 distinct options each, the right translation at `answer`', () => {
    for (const lang of ['az', 'ru', 'en'] as const) {
      const qs = buildQuiz(electrical, lang, { random: seeded(7) });
      expect(qs).toHaveLength(QUIZ_SIZE);
      expect(new Set(qs.map((q) => q.wordId)).size).toBe(QUIZ_SIZE);
      for (const q of qs) {
        const w = electrical.find((x) => x.id === q.wordId)!;
        expect(q.options).toHaveLength(QUIZ_OPTIONS);
        expect(new Set(q.options).size).toBe(QUIZ_OPTIONS);
        expect(q.options[q.answer]).toBe(w.translations[lang]);
        expect(q.word).toBe(w.article ? `${w.article} ${w.de}` : w.de);
      }
    }
  });

  it('is random but reproducible with the same source; small pools give fewer options', () => {
    expect(buildQuiz(electrical, 'en', { random: seeded(1) })).toEqual(buildQuiz(electrical, 'en', { random: seeded(1) }));
    expect(buildQuiz(electrical, 'en', { random: seeded(1) })).not.toEqual(buildQuiz(electrical, 'en', { random: seeded(2) }));
    const tiny = electrical.slice(0, 3);
    const qs = buildQuiz(tiny, 'az', { random: seeded(3) });
    expect(qs).toHaveLength(3);
    expect(qs.every((q) => q.options.length === 3)).toBe(true);
    expect(buildQuiz(electrical.slice(0, 1), 'az')).toEqual([]);
    // Words without a translation in the language are skipped.
    expect(buildQuiz([{ ...electrical[0], translations: { az: '', ru: 'x', en: 'y' } }, ...electrical.slice(1, 5)], 'az').map((q) => q.wordId)).not.toContain(electrical[0].id);
  });

  it('shuffle keeps every item', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect([...shuffle(items, seeded(4))].sort((a, b) => a - b)).toEqual(items);
  });
});
