import { DEUTSCHLANDTICKET, RUNDFUNK, type City, type Range } from './data';

/** Monthly cost estimate for one household in one city (pure; values are [low, high] euro ranges). */

export type Household = 'single' | 'couple' | 'family';
export type Housing = 'wg' | 'room1' | 'room2' | 'room3';

export interface CalcInput {
  household: Household;
  children: number; // only for "family"
  housing: Housing;
  car: boolean;
}

export type CostKey = 'rent' | 'utilities' | 'electricity' | 'internet' | 'mobile' | 'groceries' | 'transport' | 'car' | 'children' | 'insurance' | 'rundfunk' | 'leisure';

export interface CostLine {
  key: CostKey;
  range: Range;
}

/** Typical living space per flat type (m²). */
export const FLAT_SIZE: Record<Exclude<Housing, 'wg'>, number> = { room1: 35, room2: 55, room3: 75 };

export const adultsOf = (i: Pick<CalcInput, 'household'>) => (i.household === 'single' ? 1 : 2);
export const childrenOf = (i: Pick<CalcInput, 'household' | 'children'>) => (i.household === 'family' ? Math.max(0, Math.min(6, Math.round(i.children))) : 0);

/** A sensible default flat for the household. */
export const suggestedHousing = (household: Household, children: number): Housing =>
  household === 'single' ? 'room1' : household === 'couple' ? 'room2' : children >= 2 ? 'room3' : 'room2';

const r = (lo: number, hi: number): Range => [Math.round(lo), Math.round(hi)];
const scale = (x: Range, k: number): Range => r(x[0] * k, x[1] * k);

/** Cold rent for a flat: small flats use the 1-room rate, larger ones the 2-room rate (3-room ≈ 5 % cheaper per m²). */
export const flatRent = (city: City, housing: Exclude<Housing, 'wg'>): Range => {
  const m2 = FLAT_SIZE[housing];
  const rate = housing === 'room1' ? city.rent.oneRoom : housing === 'room2' ? city.rent.twoRoom : scale(city.rent.twoRoom, 0.95);
  return r(rate[0] * m2, rate[1] * m2);
};

export const estimate = (city: City, input: CalcInput) => {
  const adults = adultsOf(input);
  const kids = childrenOf(input);
  const people = adults + kids;
  const wg = input.housing === 'wg';
  const lines: CostLine[] = [];

  if (wg) {
    // One WG room per adult; utilities, internet and electricity are normally included.
    lines.push({ key: 'rent', range: scale(city.wgRoom, adults) });
  } else {
    const m2 = FLAT_SIZE[input.housing as Exclude<Housing, 'wg'>];
    lines.push({ key: 'rent', range: flatRent(city, input.housing as Exclude<Housing, 'wg'>) });
    lines.push({ key: 'utilities', range: r(city.utilities[0] * m2, city.utilities[1] * m2) });
    lines.push({ key: 'electricity', range: r(35 + (people - 1) * 15, 50 + (people - 1) * 20) });
    lines.push({ key: 'internet', range: [30, 45] });
  }
  lines.push({ key: 'mobile', range: r(10 * adults, 25 * adults) });
  lines.push({ key: 'groceries', range: r(city.groceries[0] * adults + city.groceries[0] * 0.6 * kids, city.groceries[1] * adults + city.groceries[1] * 0.6 * kids) });
  // One Deutschlandticket per adult; with a car one adult drives instead.
  const tickets = input.car ? adults - 1 : adults;
  if (tickets > 0) lines.push({ key: 'transport', range: [DEUTSCHLANDTICKET * tickets, DEUTSCHLANDTICKET * tickets] });
  if (input.car) lines.push({ key: 'car', range: city.car });
  if (kids) lines.push({ key: 'children', range: r(120 * kids, 250 * kids) });
  lines.push({ key: 'insurance', range: [6, 15] }); // personal liability + household contents
  lines.push({ key: 'rundfunk', range: wg ? r(RUNDFUNK / 3, RUNDFUNK / 2) : r(RUNDFUNK, RUNDFUNK) });
  lines.push({ key: 'leisure', range: r(100 * adults + 40 * kids, 220 * adults + 80 * kids) });

  const total = lines.reduce<[number, number]>((acc, l) => [acc[0] + l.range[0], acc[1] + l.range[1]], [0, 0]);
  return { lines, total: total as Range, mid: Math.round((total[0] + total[1]) / 2), people, adults, kids };
};

/** Key figures for a city card: 1-room flat cold, WG room, groceries per adult. */
export const keyFigures = (city: City) => ({
  oneRoom: flatRent(city, 'room1'),
  twoRoom: flatRent(city, 'room2'),
  wg: city.wgRoom,
  groceries: city.groceries,
  single: estimate(city, { household: 'single', children: 0, housing: 'room1', car: false }).total,
});
