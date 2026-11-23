import { describe, expect, it } from 'vitest';
import { moneyBars } from './chart';
import type { CostLine } from './calc';

const lines: CostLine[] = [
  { key: 'rent', range: [400, 600] },
  { key: 'groceries', range: [200, 300] },
  { key: 'leisure', range: [100, 200] },
];

describe('moneyBars', () => {
  it('without a net salary: rent, food, other only', () => {
    const { bars, deficit } = moneyBars(lines, [700, 1100], null);
    expect(bars.map((b) => [b.key, b.value])).toEqual([['rent', 500], ['food', 250], ['other', 150]]);
    expect(bars[0].percent).toBe(100);
    expect(deficit).toBe(false);
  });
  it('with a net salary: net first, what is left last', () => {
    const { bars, deficit } = moneyBars(lines, [700, 1100], 2000);
    expect(bars.map((b) => b.key)).toEqual(['net', 'rent', 'food', 'other', 'left']);
    expect(bars[4].value).toBe(1100);
    expect(deficit).toBe(false);
  });
  it('flags a deficit', () => {
    const { bars, deficit } = moneyBars(lines, [700, 1100], 600);
    expect(deficit).toBe(true);
    expect(bars.find((b) => b.key === 'left')!.value).toBe(300);
  });
});
