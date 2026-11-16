import { describe, expect, it } from 'vitest';
import { alignWords, normalizeWords } from './align';
import { SENTENCES, SENTENCE_LEVELS, SENTENCE_TOPICS } from './sentences';

describe('pronunciation: normalisation', () => {
  it('folds case, punctuation, umlauts, ß and small numbers', () => {
    expect(normalizeWords('Guten Tag! Ich heiße Ayşe.')).toEqual(['guten', 'tag', 'ich', 'heisse', 'ayse']);
    expect(normalizeWords('Ich habe 3 Kinder')).toEqual(['ich', 'habe', 'drei', 'kinder']);
    expect(normalizeWords('Grüß Gott')).toEqual(normalizeWords('gruess gott'));
  });
});

describe('pronunciation: word alignment', () => {
  it('gives 100 % for a perfect transcript', () => {
    const r = alignWords('Können Sie das bitte wiederholen?', 'können sie das bitte wiederholen');
    expect(r.percent).toBe(100);
    expect(r.words.every((w) => w.status === 'ok')).toBe(true);
    expect(r.extra).toEqual([]);
  });

  it('marks a substituted word as wrong with what was heard', () => {
    const r = alignWords('Ich habe einen Termin.', 'ich habe einen termine');
    expect(r.words.map((w) => w.status)).toEqual(['ok', 'ok', 'ok', 'wrong']);
    expect(r.words[3].heard).toBe('termine');
    expect(r.percent).toBe(75);
  });

  it('marks missing words and counts extra words', () => {
    const missing = alignWords('Ich komme aus Aserbaidschan.', 'ich komme aserbaidschan');
    expect(missing.words.map((w) => w.status)).toEqual(['ok', 'ok', 'missing', 'ok']);
    const extra = alignWords('Guten Morgen', 'ja guten morgen');
    expect(extra.extra).toEqual(['ja']);
    expect(extra.words.every((w) => w.status === 'ok')).toBe(true);
    expect(extra.percent).toBe(67);
  });

  it('gives 0 % for nothing heard', () => {
    const r = alignWords('Guten Tag', '');
    expect(r.percent).toBe(0);
    expect(r.words.every((w) => w.status === 'missing')).toBe(true);
  });
});

describe('pronunciation: sentence lists', () => {
  it('has sentences for every level and topic with unique ids and translations', () => {
    expect(new Set(SENTENCES.map((s) => s.id)).size).toBe(SENTENCES.length);
    for (const l of SENTENCE_LEVELS) expect(SENTENCES.filter((s) => s.level === l).length, l).toBeGreaterThanOrEqual(8);
    for (const tp of SENTENCE_TOPICS) expect(SENTENCES.filter((s) => s.topic === tp).length, tp).toBeGreaterThanOrEqual(5);
    for (const s of SENTENCES) for (const l of ['az', 'en', 'ru', 'tr', 'uk'] as const) expect(s.tx[l], `${s.id} ${l}`).toBeTruthy();
  });
});
