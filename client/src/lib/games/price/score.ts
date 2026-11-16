/**
 * "Guess the price" rules: 10 rounds picked from a seed (same seed = same items and slider ranges, so a shared
 * link replays the same game), a slider per round whose upper end is a random multiple of the price (the
 * position of the answer gives nothing away), and points by closeness.
 */
import { seededRandom, shuffle } from '@/lib/games/common';
import { PRICE_ITEMS, type PriceItem } from './items';

export const ROUNDS = 10;
export const MAX_POINTS = 100;

export interface Round {
  item: PriceItem;
  /** Slider range and step in euro. */
  min: number;
  max: number;
  step: number;
  /** Where the slider starts. */
  start: number;
}

/** Slider step: cents for small prices, whole euros / tens for big ones. */
export const stepFor = (price: number) => (price < 3 ? 0.05 : price < 20 ? 0.1 : price < 100 ? 1 : 10);

const snap = (v: number, step: number) => Math.round(Math.round(v / step) * step * 100) / 100;

export const buildRounds = (seed: number, n = ROUNDS): Round[] => {
  const rnd = seededRandom(seed);
  return shuffle(PRICE_ITEMS, rnd)
    .slice(0, n)
    .map((item) => {
      const step = stepFor(item.price);
      const max = Math.max(step * 10, snap(item.price * (2 + rnd() * 1.6), step));
      return { item, min: 0, max, step, start: snap(max / 2, step) };
    });
};

/** Relative error |guess − price| / price. */
export const relError = (guess: number, price: number) => Math.abs(guess - price) / price;

/** 100 points within 5 %, then linearly down to 0 at 65 % off. */
export const pointsFor = (guess: number, price: number) => {
  const e = relError(guess, price);
  if (e <= 0.05) return MAX_POINTS;
  return Math.max(0, Math.round(MAX_POINTS * (1 - (e - 0.05) / 0.6)));
};

/** Verdict shown after each round (keys priceGame.verdict.*). */
export const verdictFor = (guess: number, price: number): 'spotOn' | 'close' | 'off' | 'far' => {
  const e = relError(guess, price);
  return e <= 0.05 ? 'spotOn' : e <= 0.2 ? 'close' : e <= 0.45 ? 'off' : 'far';
};

export const newSeed = () => Math.floor(Math.random() * 900_000) + 100_000;

/** ?seed= value of a share link (6 digits), else null. */
export const parseSeed = (v: string | null) => {
  if (!v || !/^\d{1,9}$/.test(v)) return null;
  return Number(v);
};
