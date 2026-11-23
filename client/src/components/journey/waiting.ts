/**
 * Waiting-time bar of the case view: pure math. The usual duration (minDays..maxDays) is the forecast of the current
 * waiting step (history of similar cases, the default or the team's own range); the elapsed time counts from the day the
 * case entered the step. Nothing is shown without a real range and a real start day.
 */

export type WaitState = 'early' | 'within' | 'over';

export interface WaitProgress {
  elapsedDays: number;
  /** Usual range expressed in the shown unit. */
  unit: 'week' | 'day';
  min: number;
  max: number;
  /** Elapsed time in the same unit (weeks: whole weeks completed + the running one = "week N"). */
  elapsed: number;
  /** 0..100: elapsed share of the longest usual duration. */
  percent: number;
  /** 0..100: where the usual window starts on the bar. */
  windowStart: number;
  state: WaitState;
}

const DAY = 86_400_000;

/** Steps that are mostly waiting on someone else (the embassy), not work for the client. */
export const WAITING_STEPS = ['APPOINTMENT', 'DECISION'] as const;
export const isWaitingStep = (key: string | null | undefined): boolean => !!key && (WAITING_STEPS as readonly string[]).includes(key);

/** Weeks when the usual range is two weeks or more (same rule as the forecast strip), else days. */
export const waitUnit = (minDays: number, maxDays: number): 'week' | 'day' =>
  minDays >= 14 || (maxDays >= 14 && minDays % 7 === 0 && maxDays % 7 === 0) ? 'week' : 'day';

/** null = nothing to show (no usable range, no start day, a start in the future or an unparsable date). */
export const waitProgress = (minDays: number | null | undefined, maxDays: number | null | undefined, since: string | null | undefined, now: Date = new Date()): WaitProgress | null => {
  if (!since || !maxDays || maxDays <= 0) return null;
  const min = Math.max(0, minDays ?? 0);
  if (min > maxDays) return null;
  const start = new Date(since).getTime();
  if (!Number.isFinite(start) || start > now.getTime()) return null;
  const elapsedDays = Math.floor((now.getTime() - start) / DAY);
  const unit = waitUnit(min, maxDays);
  const div = unit === 'week' ? 7 : 1;
  const percent = Math.min(100, Math.round((elapsedDays / maxDays) * 100));
  const windowStart = Math.round((min / maxDays) * 100);
  const state: WaitState = elapsedDays > maxDays ? 'over' : elapsedDays < min ? 'early' : 'within';
  return {
    elapsedDays,
    unit,
    min: Math.max(1, Math.round(min / div)),
    max: Math.max(1, Math.round(maxDays / div)),
    elapsed: unit === 'week' ? Math.floor(elapsedDays / 7) + 1 : elapsedDays,
    percent,
    windowStart,
    state,
  };
};
