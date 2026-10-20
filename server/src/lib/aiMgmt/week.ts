/**
 * Asia/Baku calendar helpers (UTC+4 all year, no DST). A report week runs Monday 00:00 → next Monday 00:00
 * Baku time; instants are stored as UTC.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;
export const BAKU_OFFSET_MS = 4 * 60 * 60 * 1000;

const shifted = (d: Date) => new Date(d.getTime() + BAKU_OFFSET_MS);

/** "YYYY-MM-DD" of the Baku calendar day. */
export const bakuDay = (d: Date) => shifted(d).toISOString().slice(0, 10);
export const bakuHour = (d: Date) => shifted(d).getUTCHours();
/** 0 = Sunday … 6 = Saturday (Baku). */
export const bakuWeekday = (d: Date) => shifted(d).getUTCDay();

/** Monday 00:00 Baku of the week that contains `d`. */
export const weekStartOf = (d: Date) => {
  const s = shifted(d);
  const midnight = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
  const sinceMonday = (s.getUTCDay() + 6) % 7;
  return new Date(midnight - sinceMonday * DAY_MS - BAKU_OFFSET_MS);
};

/** The last complete week before `now`: [start, end). */
export const lastFullWeek = (now: Date) => {
  const end = weekStartOf(now);
  return { start: new Date(end.getTime() - 7 * DAY_MS), end };
};

/** Baku date strings Monday … Sunday of the week starting at `start`. */
export const weekDays = (start: Date) => Array.from({ length: 7 }, (_, i) => bakuDay(new Date(start.getTime() + i * DAY_MS)));
