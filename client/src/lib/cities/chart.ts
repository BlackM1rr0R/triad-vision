import type { CostLine } from './calc';

export type BarKey = 'net' | 'rent' | 'food' | 'other' | 'left';
export interface MoneyBar {
  key: BarKey;
  value: number;
  /** 0..100 of the longest bar. */
  percent: number;
}

const mid = (l: CostLine | undefined) => (l ? (l.range[0] + l.range[1]) / 2 : 0);

/**
 * Pure: the bars of the city chart, all monthly estimates (middle of each range): net salary (only when entered),
 * rent, food (groceries), the other costs, and what is left (or missing) of the net salary.
 */
export const moneyBars = (lines: readonly CostLine[], total: readonly [number, number], net: number | null): { bars: MoneyBar[]; deficit: boolean } => {
  const rent = Math.round(mid(lines.find((l) => l.key === 'rent')));
  const food = Math.round(mid(lines.find((l) => l.key === 'groceries')));
  const all = Math.round((total[0] + total[1]) / 2);
  const other = Math.max(0, all - rent - food);
  const hasNet = net !== null && net > 0;
  const left = hasNet ? net - all : 0;
  const rows: { key: BarKey; value: number }[] = [
    ...(hasNet ? [{ key: 'net' as const, value: Math.round(net) }] : []),
    { key: 'rent', value: rent },
    { key: 'food', value: food },
    { key: 'other', value: other },
    ...(hasNet ? [{ key: 'left' as const, value: Math.abs(Math.round(left)) }] : []),
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));
  return { bars: rows.map((r) => ({ ...r, percent: Math.max(r.value > 0 ? 2 : 0, Math.round((r.value / max) * 100)) })), deficit: hasNet && left < 0 };
};
