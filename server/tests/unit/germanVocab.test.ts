import { describe, expect, it } from 'vitest';
import { addDays, buildSession, dayKey, isLearned, NEW_STATE, newWordLevels, recommendedLevel, review, streakOf } from '../../src/lib/german/vocab.js';
import { germanVocabulary, wordSlug } from '../../prisma/seed/germanVocabulary.js';

const NOW = new Date('2026-03-10T08:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('SM-2 scheduling', () => {
  it('goes 1 day → 6 days → interval × easiness on correct answers', () => {
    const a = review(NEW_STATE, 4, NOW);
    expect(a).toMatchObject({ repetitions: 1, intervalDays: 1, easiness: 2.5, correct: true });
    expect(a.dueAt.getTime()).toBe(NOW.getTime() + DAY);
    const b = review(a, 4, NOW);
    expect(b).toMatchObject({ repetitions: 2, intervalDays: 6 });
    const c = review(b, 5, NOW);
    expect(c.easiness).toBe(2.6);
    expect(c.intervalDays).toBe(Math.round(6 * 2.6));
  });

  it('a wrong answer resets repetitions, lowers easiness and brings the word back in 10 minutes', () => {
    const learned = { repetitions: 4, easiness: 2.5, intervalDays: 30 };
    expect(isLearned(learned)).toBe(true);
    const r = review(learned, 1, NOW);
    expect(r).toMatchObject({ repetitions: 0, intervalDays: 0, correct: false });
    expect(r.easiness).toBeCloseTo(1.96, 2);
    expect(r.dueAt.getTime()).toBe(NOW.getTime() + 10 * 60 * 1000);
    expect(isLearned(r)).toBe(false);
  });

  it('easiness never drops below 1.3; grades are clamped to 0–5', () => {
    let s = { ...NEW_STATE };
    for (let i = 0; i < 10; i++) s = review(s, 0, NOW);
    expect(s.easiness).toBe(1.3);
    expect(review(NEW_STATE, 9, NOW).easiness).toBe(2.6);
    // "hard" (3) still passes but lowers easiness
    expect(review(NEW_STATE, 3, NOW)).toMatchObject({ correct: true, easiness: 2.36 });
  });
});

describe('days and streaks (Baku calendar)', () => {
  it('uses the Baku day (UTC+4)', () => {
    expect(dayKey(new Date('2026-03-10T19:59:00.000Z'))).toBe('2026-03-10');
    expect(dayKey(new Date('2026-03-10T20:01:00.000Z'))).toBe('2026-03-11');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('counts consecutive days ending today or yesterday; best is the longest run', () => {
    const days = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-08', '2026-03-09'];
    expect(streakOf(days, '2026-03-10')).toEqual({ current: 2, best: 4, practisedToday: false });
    expect(streakOf([...days, '2026-03-10'], '2026-03-10')).toEqual({ current: 3, best: 4, practisedToday: true });
    expect(streakOf(days, '2026-03-11').current).toBe(0); // missed yesterday
    expect(streakOf([], '2026-03-10')).toEqual({ current: 0, best: 0, practisedToday: false });
  });
});

describe('session', () => {
  it('due reviews first (most overdue first), then new words within the daily allowance', () => {
    const due = [{ id: 'b', dueAt: new Date(NOW.getTime() - DAY) }, { id: 'a', dueAt: new Date(NOW.getTime() - 3 * DAY) }];
    const fresh = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}` }));
    const s = buildSession(due, fresh, { limit: 20, newToday: 4 });
    expect(s.reviews.map((r) => r.id)).toEqual(['a', 'b']);
    expect(s.news).toHaveLength(6); // 10 a day, 4 already introduced today
    expect(buildSession(due, fresh, { limit: 5, newToday: 0 }).news).toHaveLength(3);
    expect(buildSession(due, fresh, { limit: 20, newToday: 12 }).news).toHaveLength(0);
  });

  it('new words come from the profile level and the next one', () => {
    expect(newWordLevels(null)).toEqual(['A1']);
    expect(newWordLevels('none')).toEqual(['A1']);
    expect(newWordLevels('A1')).toEqual(['A1', 'A2']);
    expect(newWordLevels('B1')).toEqual(['A1', 'A2', 'B1', 'B2']);
    expect(newWordLevels('C1')).toEqual(['A1', 'A2', 'B1', 'B2']);
    expect(recommendedLevel('none')).toBe('A1');
    expect(recommendedLevel('A2')).toBe('B1');
  });
});

describe('starter vocabulary', () => {
  it('has unique slugs, all three translations and a few hundred words over A1–B1 and every job field', () => {
    expect(germanVocabulary.length).toBeGreaterThanOrEqual(300);
    expect(new Set(germanVocabulary.map((w) => w.slug)).size).toBe(germanVocabulary.length);
    for (const w of germanVocabulary) {
      expect(w.translations.az && w.translations.ru && w.translations.en, w.slug).toBeTruthy();
      expect(w.slug.length).toBeLessThanOrEqual(80);
      if (w.article) expect(['der', 'die', 'das']).toContain(w.article);
    }
    for (const level of ['A1', 'A2', 'B1']) expect(germanVocabulary.filter((w) => w.level === level).length).toBeGreaterThanOrEqual(60);
    for (const field of ['GENERAL', 'WORK', 'CARE', 'CONSTRUCTION', 'HOSPITALITY', 'DRIVING']) expect(germanVocabulary.filter((w) => w.field === field).length).toBeGreaterThanOrEqual(25);
    expect(wordSlug('die', 'Bohrmaschine')).toBe('die-bohrmaschine');
    expect(wordSlug('', 'sich gewöhnen an')).toBe('sich-gewoehnen-an');
  });
});
