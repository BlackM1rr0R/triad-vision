import { describe, expect, it } from 'vitest';
import { reachedFull, ringOffset, ringPercent } from './ring';

describe('document ring', () => {
  it('percent', () => {
    expect(ringPercent(7, 10)).toBe(70);
    expect(ringPercent(0, 0)).toBe(100);
    expect(ringPercent(12, 10)).toBe(100);
    expect(ringPercent(-1, 10)).toBe(0);
  });
  it('offset', () => {
    expect(ringOffset(100, 70)).toBeCloseTo(30);
    expect(ringOffset(100, 150)).toBe(0);
  });
  it('celebrates only on the transition to complete', () => {
    expect(reachedFull({ done: 9, total: 10 }, { done: 10, total: 10 })).toBe(true);
    expect(reachedFull(null, { done: 10, total: 10 })).toBe(false);
    expect(reachedFull({ done: 10, total: 10 }, { done: 10, total: 10 })).toBe(false);
    expect(reachedFull({ done: 0, total: 0 }, { done: 0, total: 0 })).toBe(false);
  });
});
