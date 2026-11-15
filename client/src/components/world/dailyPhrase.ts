/**
 * Which phrase is "the phrase of the day" (pure; server/tests/unit/worldHome.test.ts loads this file directly).
 *
 * The day is the calendar day in Germany (Europe/Berlin), so the server render, the browser and every visitor
 * — in Baku or in Berlin — see the same phrase, and it changes at midnight German time. The index walks the list
 * with a fixed stride that is coprime with its length: every phrase comes once before any repeats, and
 * neighbouring days get phrases from different parts (topics) of the list.
 */
import { PHRASES, type Phrase } from './phrases';

/** "YYYY-MM-DD" of an instant in Germany. */
export const berlinDay = (at: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (s: unknown): s is string => typeof s === 'string' && DAY_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Days since 1970-01-01 of a "YYYY-MM-DD" day. */
export const dayNumber = (day: string): number => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

/** The day `delta` days before (negative) or after a day. */
export const shiftDay = (day: string, delta: number): string => new Date((dayNumber(day) + delta) * 86_400_000).toISOString().slice(0, 10);

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Smallest stride ≥ 37 that is coprime with n (so the walk visits every index once per cycle). */
export const strideFor = (n: number): number => {
  if (n <= 1) return 1;
  let k = 37;
  while (gcd(k, n) !== 1) k++;
  return k;
};

export const phraseIndex = (day: string, n = PHRASES.length): number => {
  if (n <= 0) return 0;
  const k = strideFor(n);
  return (((dayNumber(day) * k) % n) + n) % n;
};

export const phraseForDay = (day: string, list: Phrase[] = PHRASES): Phrase => list[phraseIndex(day, list.length)];

/** The last `count` days up to and including `today`, newest first, each with its phrase. */
export const recentPhrases = (today: string, count: number, list: Phrase[] = PHRASES): { day: string; phrase: Phrase }[] =>
  Array.from({ length: Math.max(0, count) }, (_, i) => {
    const day = shiftDay(today, -i);
    return { day, phrase: phraseForDay(day, list) };
  });
