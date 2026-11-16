/**
 * "Is my schedule legal?" — a weekly shift plan checked against the Arbeitszeitgesetz (/work-schedule-check), for
 * nurses, carers, cooks and other shift workers. Pure; unit-tested in server/tests/unit/publicCalcWork.test.ts.
 *
 * Rules (checked 2026-11 against gesetze-im-internet.de/arbzg):
 *  - §3: ≤ 8 h work per working day, up to 10 h only if the average stays ≤ 8 h within 6 months / 24 weeks
 *    (Mon – Sat = 48 h a week on average; > 60 h in one week cannot be compensated within the 10-h cap).
 *  - §4: breaks of ≥ 30 min after > 6 h and ≥ 45 min after > 9 h of work (blocks of ≥ 15 min).
 *  - §5 Abs. 1: ≥ 11 h uninterrupted rest after the end of the working day. §5 Abs. 2: hospitals and other
 *    treatment / care facilities, restaurants / hotels (and transport, broadcasting, agriculture) may shorten it by
 *    up to 1 h (≥ 10 h) if another rest within one calendar month / 4 weeks is extended to ≥ 12 h.
 *  - §2 Abs. 3 – 5, §6 Abs. 2: night time 23 – 6 h; night work = > 2 h of night time; night workers ≤ 8 h, up to
 *    10 h if the average stays ≤ 8 h within one calendar month / 4 weeks.
 *  - §9 – §11: no work on Sundays except the §10 exceptions (hospitals, care, restaurants / hotels …); ≥ 15 free
 *    Sundays a year; a replacement rest day within two weeks that include the Sunday worked (§11 Abs. 3).
 * Collective agreements (§7) may deviate; they are not modelled.
 */

export const SCHEDULE_CHECKED = '2026-11-16';

export type Sector = 'hospital' | 'care' | 'hospitality' | 'other';
export const SECTORS: Sector[] = ['hospital', 'care', 'hospitality', 'other'];
/** Sectors of §5 Abs. 2 (shorter rest) and §10 (Sunday work allowed) covered here. */
const REDUCED_REST_SECTORS: Sector[] = ['hospital', 'care', 'hospitality'];

export interface ShiftDay {
  off: boolean;
  /** "HH:MM" */
  start: string;
  end: string;
  breakMin: number;
}
export interface ScheduleInput {
  sector: Sector;
  /** 7 or 14 days, day 0 = Monday. */
  days: ShiftDay[];
}

export type ScheduleCode =
  | 'daily10'
  | 'daily8'
  | 'night10'
  | 'night8'
  | 'break'
  | 'rest'
  | 'restReduced'
  | 'restCompensation'
  | 'weekly60'
  | 'weekly48'
  | 'sundayOther'
  | 'sundayAllowed'
  | 'noReplacementDay'
  | 'nightWorker'
  | 'invalid';
export type Severity = 'violation' | 'warning' | 'info';

export interface ScheduleFinding {
  code: ScheduleCode;
  severity: Severity;
  rule: string;
  day: number;
  minutes: number;
}

export interface ScheduleDayResult {
  day: number;
  off: boolean;
  start: number;
  end: number;
  work: number;
  breakMin: number;
  night: boolean;
  /** Rest before this shift (minutes since the previous shift ended), null for the first shift. */
  restBefore: number | null;
}

export interface ScheduleResult {
  days: ScheduleDayResult[];
  weeks: number[];
  findings: ScheduleFinding[];
  status: 'ok' | 'warnings' | 'violations';
}

const DAY = 1_440;

export const parseHm = (s: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 24 && min < 60 && h * 60 + min <= DAY ? h * 60 + min : null;
};

/** Minutes of [a, b) inside night time 23:00 – 6:00 (§2 Abs. 3 ArbZG). */
export const nightMinutes = (a: number, b: number) => {
  let sum = 0;
  for (let d = Math.floor(a / DAY) - 1; d <= Math.floor(b / DAY); d++) {
    const from = d * DAY + 23 * 60;
    const to = d * DAY + DAY + 6 * 60;
    sum += Math.max(0, Math.min(b, to) - Math.max(a, from));
  }
  return sum;
};

export const checkSchedule = (input: ScheduleInput): ScheduleResult => {
  const sector: Sector = SECTORS.includes(input?.sector) ? input.sector : 'other';
  const raw = Array.isArray(input?.days) ? input.days : [];
  const n = raw.length > 7 ? 14 : 7;
  const findings: ScheduleFinding[] = [];
  const add = (code: ScheduleCode, severity: Severity, rule: string, day: number, minutes = 0) => findings.push({ code, severity, rule, day, minutes: Math.round(minutes) });

  const days: ScheduleDayResult[] = Array.from({ length: n }, (_, d) => {
    const x = raw[d];
    const s = x && !x.off ? parseHm(x.start) : null;
    const e = x && !x.off ? parseHm(x.end) : null;
    if (!x || x.off || s == null || e == null) {
      if (x && !x.off) add('invalid', 'warning', '—', d);
      return { day: d, off: true, start: 0, end: 0, work: 0, breakMin: 0, night: false, restBefore: null };
    }
    const start = d * DAY + s;
    const end = d * DAY + (e <= s ? e + DAY : e);
    const breakMin = Math.max(0, Math.min(end - start, Math.round(Number(x.breakMin) || 0)));
    return { day: d, off: false, start, end, work: end - start - breakMin, breakMin, night: nightMinutes(start, end) > 120, restBefore: null };
  });

  const shifts = days.filter((d) => !d.off);
  const nightWorker = shifts.some((d) => d.night);
  const reducedOk = REDUCED_REST_SECTORS.includes(sector);
  let reduced = 0;
  let longRest = false;

  shifts.forEach((d, k) => {
    // §3 / §6 Abs. 2 daily working time.
    if (d.night) {
      if (d.work > 600) add('night10', 'violation', '§ 6 Abs. 2 ArbZG', d.day, d.work - 600);
      else if (d.work > 480) add('night8', 'warning', '§ 6 Abs. 2 ArbZG', d.day, d.work - 480);
    } else if (d.work > 600) add('daily10', 'violation', '§ 3 ArbZG', d.day, d.work - 600);
    else if (d.work > 480) add('daily8', 'info', '§ 3 ArbZG', d.day, d.work - 480);
    // §4 breaks.
    const need = d.work > 540 ? 45 : d.work > 360 ? 30 : 0;
    if (d.breakMin < need) add('break', 'violation', '§ 4 ArbZG', d.day, need - d.breakMin);
    // §5 rest since the previous shift.
    const prev = shifts[k - 1];
    if (prev) {
      const gap = d.start - prev.end;
      d.restBefore = gap;
      if (gap >= 720) longRest = true;
      if (gap < 0) add('invalid', 'warning', '—', d.day, -gap);
      else if (gap < 660) {
        if (reducedOk && gap >= 600) {
          reduced++;
          add('restReduced', 'warning', '§ 5 Abs. 2 ArbZG', d.day, 660 - gap);
        } else add('rest', 'violation', '§ 5 ArbZG', d.day, 660 - gap);
      }
    }
    // §9 – §11 Sunday work.
    if (d.day % 7 === 6) {
      if (sector === 'other') add('sundayOther', 'warning', '§§ 9, 10 ArbZG', d.day);
      else add('sundayAllowed', 'info', '§ 10 ArbZG', d.day);
      // Replacement rest day: a free weekday (Mon – Sat) within the two weeks including this Sunday.
      const free = days.some((x) => x.off && x.day % 7 !== 6 && Math.abs(x.day - d.day) <= 13);
      if (!free) add('noReplacementDay', n === 14 ? 'violation' : 'warning', '§ 11 Abs. 3 ArbZG', d.day);
    }
  });
  if (reduced > 0 && !longRest) add('restCompensation', 'warning', '§ 5 Abs. 2 ArbZG', shifts[0]?.day ?? 0);
  if (nightWorker) add('nightWorker', 'info', '§ 6 ArbZG', shifts.find((d) => d.night)!.day);

  const weeks = Array.from({ length: n / 7 }, (_, w) => days.filter((d) => Math.floor(d.day / 7) === w).reduce((s, d) => s + d.work, 0));
  weeks.forEach((m, w) => {
    if (m > 3_600) add('weekly60', 'violation', '§ 3 ArbZG', w * 7, m - 3_600);
    else if (m > 2_880) add('weekly48', 'warning', '§ 3 ArbZG', w * 7, m - 2_880);
  });

  const order: Record<Severity, number> = { violation: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.day - b.day);
  const status = findings.some((f) => f.severity === 'violation') ? 'violations' : findings.some((f) => f.severity === 'warning') ? 'warnings' : 'ok';
  return { days, weeks, findings, status };
};

// ── Presets ──
export const SHIFT_PRESETS = {
  early: { off: false, start: '06:00', end: '14:30', breakMin: 30 },
  late: { off: false, start: '13:30', end: '22:00', breakMin: 30 },
  night: { off: false, start: '21:45', end: '06:15', breakMin: 30 },
  split: { off: false, start: '10:00', end: '21:00', breakMin: 60 },
  off: { off: true, start: '', end: '', breakMin: 0 },
} satisfies Record<string, ShiftDay>;
export type ShiftPreset = keyof typeof SHIFT_PRESETS;

const plan = (sector: Sector, ...d: ShiftPreset[]): ScheduleInput => ({ sector, days: d.map((k) => ({ ...SHIFT_PRESETS[k] })) });

export const PLAN_PRESETS = {
  nurse: () => plan('hospital', 'early', 'early', 'late', 'late', 'off', 'night', 'night'),
  cook: () => plan('hospitality', 'off', 'off', 'split', 'split', 'split', 'split', 'split'),
  quickReturn: () => plan('care', 'late', 'early', 'early', 'late', 'early', 'off', 'off'),
} as const;
export type PlanPreset = keyof typeof PLAN_PRESETS;

export const DEFAULT_SCHEDULE: ScheduleInput = PLAN_PRESETS.nurse();
