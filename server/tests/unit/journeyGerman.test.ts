import { describe, expect, it } from 'vitest';
import { pickBalanced, scoreTest, TEST_SIZE } from '../../src/lib/journey/german.js';

const q = (id: string, level: string, answer = 0) => ({ id, level, answer });

describe('German self-test rule', () => {
  it('unlocks a level with at least 70 % and stops at the first gap', () => {
    const questions = [
      ...['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => q(id, 'A1')),
      ...['b1', 'b2', 'b3', 'b4', 'b5'].map((id) => q(id, 'A2')),
      ...['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => q(id, 'B1')),
      ...['d1', 'd2', 'd3', 'd4', 'd5'].map((id) => q(id, 'B2')),
    ];
    // A1 5/5, A2 4/5 (80 %), B1 3/5 (60 %), B2 5/5 → estimate A2 (B1 is the gap, B2 does not count)
    const answers: Record<string, number> = {};
    for (const id of ['a1', 'a2', 'a3', 'a4', 'a5', 'b1', 'b2', 'b3', 'b4', 'c1', 'c2', 'c3', 'd1', 'd2', 'd3', 'd4', 'd5']) answers[id] = 0;
    answers.b5 = 1;
    answers.c4 = 2;
    answers.c5 = 3;
    const r = scoreTest(questions, answers);
    expect(r.estimated).toBe('A2');
    expect(r.levels.map((l) => l.percent)).toEqual([100, 80, 60, 100]);
    expect(r.levels.map((l) => l.passed)).toEqual([true, true, false, true]);
    expect(r.total).toBe(20);
    expect(r.correct).toBe(17);
    expect(r.percent).toBe(85);
  });

  it('is "none" below 70 % at A1 and B2 when everything passes', () => {
    const questions = [q('a', 'A1'), q('b', 'A1'), q('c', 'A1'), q('d', 'A2'), q('e', 'B1'), q('f', 'B2')];
    expect(scoreTest(questions, { a: 0, b: 1, c: 1, d: 0, e: 0, f: 0 }).estimated).toBe('none');
    expect(scoreTest(questions, { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }).estimated).toBe('B2');
    // Unanswered questions count as wrong.
    expect(scoreTest(questions, { a: 0, b: 0, c: 0, d: 0 }).estimated).toBe('A2');
  });

  it('exactly 70 % passes', () => {
    const questions = Array.from({ length: 10 }, (_, i) => q(`q${i}`, 'A1'));
    const answers = Object.fromEntries(questions.map((x, i) => [x.id, i < 7 ? 0 : 1]));
    expect(scoreTest(questions, answers).levels[0].passed).toBe(true);
  });

  it('picks a level-balanced random test', () => {
    const pool = [
      ...Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, level: 'A1' })),
      ...Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, level: 'A2' })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, level: 'B1' })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `d${i}`, level: 'B2' })),
    ];
    const picked = pickBalanced(pool, TEST_SIZE);
    expect(picked).toHaveLength(20);
    expect(new Set(picked.map((p) => p.id)).size).toBe(20);
    const count = (l: string) => picked.filter((p) => p.level === l).length;
    expect([count('A1'), count('A2'), count('B1'), count('B2')]).toEqual([5, 5, 5, 5]);
  });

  it('fills missing levels from the others and copes with a small pool', () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, level: 'A1' })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, level: 'A2' })),
      { id: 'c0', level: 'B1' },
    ];
    const picked = pickBalanced(pool, 20);
    expect(picked).toHaveLength(20);
    expect(picked.filter((p) => p.level === 'B1')).toHaveLength(1);
    expect(pickBalanced(pool.slice(0, 3), 20)).toHaveLength(3);
    expect(pickBalanced([], 20)).toEqual([]);
  });
});
