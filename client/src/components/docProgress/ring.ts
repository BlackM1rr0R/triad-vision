/** Document readiness ring: pure math (required documents handed in / total). */

export const ringPercent = (done: number, total: number): number => {
  if (!(total > 0)) return 100;
  return Math.max(0, Math.min(100, Math.round((Math.max(0, done) / total) * 100)));
};

/** Dash offset of an SVG circle of circumference `c` filled to `percent`. */
export const ringOffset = (c: number, percent: number): number => c * (1 - Math.max(0, Math.min(100, percent)) / 100);

/**
 * Confetti only when this view saw the ring go from incomplete to complete (a case that already is at 100 % when the
 * page opens, or a stage without required documents, never celebrates).
 */
export const reachedFull = (prev: { done: number; total: number } | null, next: { done: number; total: number }): boolean =>
  !!prev && prev.total > 0 && prev.done < prev.total && next.total > 0 && next.done >= next.total;
