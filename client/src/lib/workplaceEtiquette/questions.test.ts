import { describe, expect, it } from 'vitest';
import { ETIQUETTE_PASS_RATIO, ETIQUETTE_QUESTIONS, ETIQUETTE_TOTAL, gradeEtiquette } from './questions';
import { ETIQUETTE_SOURCES } from './sources';
import { readyActivity } from '../readyProgress/activities';

const LOCALES = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;

describe('workplace etiquette quiz data', () => {
  it('has ~25 questions with unique kebab-case ids, 3–4 options and a valid right answer', () => {
    expect(ETIQUETTE_TOTAL).toBe(25);
    const ids = ETIQUETTE_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of ETIQUETTE_QUESTIONS) {
      expect(q.id).toMatch(/^[a-z0-9-]{1,40}$/);
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      expect(q.options.length).toBeLessThanOrEqual(4);
      expect(q.correct).toBeGreaterThanOrEqual(0);
      expect(q.correct).toBeLessThan(q.options.length);
    }
  });

  it('is fully translated into the six site languages', () => {
    for (const q of ETIQUETTE_QUESTIONS) {
      for (const l of LOCALES) {
        expect(q.q[l], `${q.id} q ${l}`).toBeTruthy();
        expect(q.explain[l], `${q.id} explain ${l}`).toBeTruthy();
        for (const o of q.options) expect(o[l], `${q.id} option ${l}`).toBeTruthy();
      }
    }
  });

  it('backs every legal answer with an official source; customs are labelled', () => {
    for (const q of ETIQUETTE_QUESTIONS) {
      if (q.kind === 'law') expect(q.sources.length, q.id).toBeGreaterThan(0);
      for (const s of q.sources) expect(ETIQUETTE_SOURCES[s].url).toMatch(/^https:\/\//);
    }
    expect(ETIQUETTE_QUESTIONS.some((q) => q.kind === 'custom')).toBe(true);
  });

  it('does not always put the right answer in the same place', () => {
    const positions = new Set(ETIQUETTE_QUESTIONS.map((q) => q.correct));
    expect(positions.size).toBeGreaterThanOrEqual(3);
  });

  it('grades answers and passes at 70 %', () => {
    const all = Object.fromEntries(ETIQUETTE_QUESTIONS.map((q) => [q.id, q.correct]));
    expect(gradeEtiquette(all)).toMatchObject({ correct: 25, total: 25, percent: 100, passed: true, mistakes: [] });
    expect(gradeEtiquette({})).toMatchObject({ correct: 0, passed: false });
    const wrong = ETIQUETTE_QUESTIONS.slice(0, 8).map((q) => q.id);
    const some = { ...all, ...Object.fromEntries(wrong.map((id) => [id, -1])) };
    const r = gradeEtiquette(some);
    expect(r).toMatchObject({ correct: 17, percent: 68, passed: false });
    expect(r.mistakes).toEqual(wrong);
    expect(ETIQUETTE_PASS_RATIO * 100).toBe(readyActivity('workplace-etiquette')?.passPercent);
  });
});
