import { describe, expect, it } from 'vitest';
import { countMarks, deckOf, parseMarks, setMark, stepIndex } from './flipMarks';

describe('interview flip card marks', () => {
  it('parses only valid marks', () => {
    expect(parseMarks(null)).toEqual({});
    expect(parseMarks('not json')).toEqual({});
    expect(parseMarks('[1,2]')).toEqual({});
    expect(parseMarks(JSON.stringify({ a: 'knew', b: 'again', c: 'maybe', d: 3 }))).toEqual({ a: 'knew', b: 'again' });
  });

  it('sets and clears a mark without mutating', () => {
    const m = { a: 'knew' as const };
    const n = setMark(m, 'b', 'again');
    expect(n).toEqual({ a: 'knew', b: 'again' });
    expect(m).toEqual({ a: 'knew' });
    expect(setMark(n, 'a', null)).toEqual({ b: 'again' });
  });

  it('"only practise again" keeps unmarked and again cards; counts per deck', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const marks = { a: 'knew' as const, b: 'again' as const };
    expect(deckOf(items, marks, false)).toHaveLength(3);
    expect(deckOf(items, marks, true).map((q) => q.id)).toEqual(['b', 'c']);
    expect(countMarks(['a', 'b', 'c'], marks)).toEqual({ knew: 1, again: 1 });
  });

  it('steps wrap around', () => {
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(1, 1, 3)).toBe(2);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});
