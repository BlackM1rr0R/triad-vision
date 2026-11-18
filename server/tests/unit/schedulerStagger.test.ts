import { describe, expect, it } from 'vitest';
import { FIRST_RUN_SPACING_MS, firstRunDelays } from '../../src/lib/scheduler.js';

describe('firstRunDelays', () => {
  it('keeps a unique delay unchanged', () => {
    expect(firstRunDelays([{ firstRunAfterMs: 20_000 }, { firstRunAfterMs: 90_000 }])).toEqual([20_000, 90_000]);
  });

  it('uses the 60 s default and spreads jobs sharing a delay in registration order', () => {
    const s = FIRST_RUN_SPACING_MS;
    expect(firstRunDelays([{}, { firstRunAfterMs: 180_000 }, {}, { firstRunAfterMs: 180_000 }, {}])).toEqual([60_000, 180_000, 60_000 + s, 180_000 + s, 60_000 + 2 * s]);
  });

  it('never starts two jobs at the same moment for the registered job mix', () => {
    const mix = [...Array(20)].map(() => ({})).concat([...Array(8)].map(() => ({ firstRunAfterMs: 300_000 })));
    const delays = firstRunDelays(mix, 5_000);
    expect(new Set(delays).size).toBe(delays.length);
    expect(Math.max(...delays)).toBe(300_000 + 7 * 5_000);
  });
});
