/**
 * Pure maths of the team calendar (no database access, unit tested): calendar days, week starts and the
 * coverage check — a working day needs at least one person in the OFFICE and / or ON_CALL (configurable).
 * Shift days are calendar days (StaffShift.date, @db.Date, stored as UTC midnight); times are minutes after
 * midnight Baku time. Leave is stored in UTC calendar days too (lib/workspace/team.ts), so both line up.
 */

export const SHIFT_KINDS = ['OFFICE', 'REMOTE', 'ON_CALL'] as const;
export type ShiftKind = (typeof SHIFT_KINDS)[number];

const DAY = 24 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

export const isDayKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
/** "YYYY-MM-DD" → UTC midnight (the value of a @db.Date column). */
export const dayDate = (key: string) => new Date(`${key}T00:00:00.000Z`);
export const dayKeyOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const addDays = (key: string, n: number) => dayKeyOf(new Date(dayDate(key).getTime() + n * DAY));
/** ISO weekday 1 (Mon) … 7 (Sun) of a calendar day. */
export const weekdayOf = (key: string) => ((dayDate(key).getUTCDay() + 6) % 7) + 1;
/** Monday of the week that contains the day. */
export const weekStart = (key: string) => addDays(key, 1 - weekdayOf(key));

/** Every day from `from` to `to` inclusive (at most `max`). */
export const daysBetween = (from: string, to: string, max = 400) => {
  const out: string[] = [];
  for (let k = from; k <= to && out.length < max; k = addDays(k, 1)) out.push(k);
  return out;
};

export const fmtMinutes = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/** Two time ranges [a1, a2) and [b1, b2) overlap. */
export const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2;

export interface CoverageConfig {
  /** A working day needs someone in the office. */
  requireOffice: boolean;
  /** A working day needs someone on call. */
  requireOnCall: boolean;
  /** Working days checked (ISO weekdays). */
  weekdays: number[];
}

export const DEFAULT_COVERAGE: CoverageConfig = { requireOffice: true, requireOnCall: false, weekdays: [1, 2, 3, 4, 5] };

export const normalizeCoverage = (raw: unknown): CoverageConfig => {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const days = Array.isArray(v.weekdays) ? [...new Set(v.weekdays.filter((d): d is number => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7))].sort() : null;
  return {
    requireOffice: typeof v.requireOffice === 'boolean' ? v.requireOffice : DEFAULT_COVERAGE.requireOffice,
    requireOnCall: typeof v.requireOnCall === 'boolean' ? v.requireOnCall : DEFAULT_COVERAGE.requireOnCall,
    weekdays: days ?? DEFAULT_COVERAGE.weekdays,
  };
};

export interface ShiftLite {
  userId: string;
  day: string;
  kind: string;
}

export interface LeaveLite {
  userId: string;
  status: string;
  type: string;
  startsAt: Date;
  endsAt: Date;
}

/** Approved leave (not REMOTE) that covers the calendar day: the person is away. */
export const awayOn = (leave: LeaveLite[], userId: string, day: string) => {
  const start = dayDate(day).getTime();
  const end = start + DAY - 1;
  return leave.some((l) => l.userId === userId && l.status === 'APPROVED' && l.type !== 'REMOTE' && l.startsAt.getTime() <= end && l.endsAt.getTime() >= start);
};

export type CoverageWarning = 'NO_OFFICE' | 'NO_ON_CALL';

/** People in the office / on call per day (shifts of people away on leave do not count) and the warnings. */
export const coverage = (days: string[], shifts: ShiftLite[], leave: LeaveLite[], cfg: CoverageConfig) =>
  days.map((day) => {
    const present = shifts.filter((s) => s.day === day && !awayOn(leave, s.userId, day));
    const office = new Set(present.filter((s) => s.kind === 'OFFICE').map((s) => s.userId)).size;
    const remote = new Set(present.filter((s) => s.kind === 'REMOTE').map((s) => s.userId)).size;
    const onCall = new Set(present.filter((s) => s.kind === 'ON_CALL').map((s) => s.userId)).size;
    const checked = cfg.weekdays.includes(weekdayOf(day));
    const warnings: CoverageWarning[] = [];
    if (checked && cfg.requireOffice && office === 0) warnings.push('NO_OFFICE');
    if (checked && cfg.requireOnCall && onCall === 0) warnings.push('NO_ON_CALL');
    return { day, office, remote, onCall, checked, warnings };
  });
