/**
 * German Advent calendar (/advent-calendar): which doors are open, the countdown, progress in localStorage and
 * the seasonal promotion window. Pure (no React), unit-tested in calendar.test.ts.
 *
 * Dates: the Berlin calendar day decides (a new door at 00:00 Europe/Berlin = 03:00 in Baku in winter, Asia/Baku
 * is UTC+4 and Berlin UTC+1). 1–24 December: doors 1…day; 25 December – 31 January: all 24 open (season review);
 * February – November: countdown to 1 December, all doors closed (door 1 shown as a locked preview).
 */
import { loadProgress, saveProgress } from '@/lib/games/common';

export { adventPromoActive, berlinDay } from '@/lib/seasonal';

/** Season the door texts were written for (year-specific tips like weekdays of the holidays). Data freshness: 'advent-calendar'. */
export const ADVENT_YEAR = 2026;
export const ADVENT_AS_OF = '2026-11-17';
export const DOOR_COUNT = 24;

export type AdventPhase = 'before' | 'advent' | 'after';

export interface AdventState {
  phase: AdventPhase;
  /** Season year (December of this year). */
  season: number;
  /** Highest open door (0 = none). */
  unlocked: number;
  /** Whole days until 1 December (0 when not 'before'). */
  daysToStart: number;
}

const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number];
const utcDays = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86_400_000;

export const adventState = (iso: string): AdventState => {
  const [y, m, d] = parts(iso);
  if (m === 12 && d <= DOOR_COUNT) return { phase: 'advent', season: y, unlocked: d, daysToStart: 0 };
  if (m === 12) return { phase: 'after', season: y, unlocked: DOOR_COUNT, daysToStart: 0 };
  if (m === 1) return { phase: 'after', season: y - 1, unlocked: DOOR_COUNT, daysToStart: 0 };
  return { phase: 'before', season: y, unlocked: 0, daysToStart: utcDays(y, 12, 1) - utcDays(y, m, d) };
};

/** Doors open for this visitor: by date, or all of them for a staff / dev preview. */
export const isOpenable = (day: number, state: AdventState, previewAll = false) => previewAll || day <= state.unlocked;

/** Classic calendars hide the numbers in a scattered order; fixed so the layout is the same for everyone. */
export const DOOR_ORDER: readonly number[] = [13, 5, 21, 1, 17, 9, 24, 3, 11, 19, 7, 15, 2, 22, 10, 6, 18, 14, 23, 4, 12, 20, 8, 16];

// ── progress (localStorage, per season) ──────────────────────────────────────────────────────────────────────

export interface AdventProgress {
  opened: number[];
  /** Quiz answers: door → chosen option index. */
  quiz: Record<string, number>;
}

const key = (season: number) => `advent.${season}`;
export const loadAdvent = (season: number): AdventProgress => {
  const p = loadProgress<Partial<AdventProgress>>(key(season), {});
  return {
    opened: Array.isArray(p.opened) ? p.opened.filter((n) => Number.isInteger(n) && n >= 1 && n <= DOOR_COUNT) : [],
    quiz: p.quiz && typeof p.quiz === 'object' ? p.quiz : {},
  };
};
export const saveAdvent = (season: number, p: AdventProgress) => saveProgress(key(season), p);

export const withOpened = (p: AdventProgress, day: number): AdventProgress => (p.opened.includes(day) ? p : { ...p, opened: [...p.opened, day].sort((a, b) => a - b) });
export const withAnswer = (p: AdventProgress, day: number, choice: number): AdventProgress => (String(day) in p.quiz ? p : { ...p, quiz: { ...p.quiz, [day]: choice } });
