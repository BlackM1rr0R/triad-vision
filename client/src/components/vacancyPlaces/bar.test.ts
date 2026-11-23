import { describe, expect, it } from 'vitest';
import { placesBar } from './bar';

describe('placesBar', () => {
  it('5 places, 2 left', () => {
    expect(placesBar({ positions: 5, filled: 3, free: 2 })).toEqual({ positions: 5, free: 2, filled: 3, percent: 60, full: false, low: false });
  });
  it('low and full', () => {
    expect(placesBar({ positions: 6, filled: 5, free: 1 })!.low).toBe(true);
    expect(placesBar({ positions: 4, filled: 4, free: 0 })!.full).toBe(true);
  });
  it('nothing for one place or unknown counts', () => {
    expect(placesBar({ positions: 1, filled: 0, free: 1 })).toBeNull();
    expect(placesBar({ positions: 5 })).toBeNull();
  });
  it('clamps free to the positions', () => {
    expect(placesBar({ positions: 3, filled: 0, free: 9 })!.percent).toBe(0);
  });
});
