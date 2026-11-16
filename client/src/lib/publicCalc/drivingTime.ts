/**
 * Driving & rest time checker for lorry / bus drivers (/driving-time-calculator). Pure; unit-tested in
 * server/tests/unit/publicCalcWork.test.ts.
 *
 * Input: one or two weeks, day by day (day 0 = Monday 00:00), each day a list of blocks (driving, other work,
 * break, rest) in time order. Time a day leaves unplanned (blocks shorter than 24 h) counts as rest at the end of
 * the day. Consecutive break / rest blocks — also across midnight — form one "off" period, classified by length.
 * The period is assumed to start right after a regular weekly rest.
 *
 * Rules (checked 2026-11 against the texts on eur-lex.europa.eu and gesetze-im-internet.de):
 *  VO (EG) Nr. 561/2006
 *   - Art. 6 Abs. 1: daily driving time ≤ 9 h, at most twice a week ≤ 10 h.
 *   - Art. 6 Abs. 2 / 3: weekly driving ≤ 56 h; two consecutive weeks ≤ 90 h.
 *   - Art. 7: after 4.5 h of driving a break of ≥ 45 min (or 15 min followed by 30 min); a rest counts as a break.
 *   - Art. 8 Abs. 2, 4 / Art. 4 g: within 24 h after the end of the previous daily or weekly rest a new daily rest:
 *     regular ≥ 11 h (or split 3 h + 9 h), reduced ≥ 9 h at most three times between two weekly rests.
 *   - Art. 8 Abs. 6: a weekly rest (regular ≥ 45 h, reduced ≥ 24 h) starts at the latest after six 24-h periods;
 *     in two consecutive weeks at least two regular or one regular + one reduced (reduction compensated en bloc by
 *     the end of the third week; the exception for two reduced rests in international transport is not modelled).
 *  ArbZG (working time = driving + other work; standby under §21a Abs. 3 is not working time)
 *   - §21a Abs. 4: ≤ 48 h per week, up to 60 h if the average over 4 months / 16 weeks stays ≤ 48 h.
 *   - §3: ≤ 8 h per day, up to 10 h with compensation (collective agreements may differ, §21a Abs. 6).
 *   - §4: breaks of 30 min after > 6 h and 45 min after > 9 h of work, in blocks of ≥ 15 min; never > 6 h in a row.
 * Fines: indicative Regelsätze of the Länder catalogue (LASI LV 48 Buß- und Verwarnungsgeldkatalog
 * Fahrpersonalrecht, as reported by fine portals — not an official calculation). Maximums: §8 FPersG 5,000 €
 * (driver), §8a FPersG 30,000 € (company), §22 ArbZG 30,000 € (employer).
 */

export const DRIVING_CHECKED = '2026-11-16';

export type BlockKind = 'drive' | 'work' | 'break' | 'rest';
export const BLOCK_KINDS: BlockKind[] = ['drive', 'work', 'break', 'rest'];

export interface Block {
  kind: BlockKind;
  minutes: number;
}
export interface DriverInput {
  /** 7 or 14 days, day 0 = Monday. */
  days: Block[][];
}

export const DAY = 1_440;
export const L = {
  dailyDrive: 540,
  dailyDriveExtended: 600,
  extensionsPerWeek: 2,
  weeklyDrive: 3_360,
  twoWeekDrive: 5_400,
  driveBeforeBreak: 270,
  breakFull: 45,
  breakFirst: 15,
  breakSecond: 30,
  restRegular: 660,
  restReduced: 540,
  restSplitFirst: 180,
  reducedRestsMax: 3,
  weeklyRestRegular: 2_700,
  weeklyRestReduced: 1_440,
  weeklyRestDeadline: 6 * DAY,
  workWeekAvg: 2_880,
  workWeekMax: 3_600,
  workDayMax: 600,
  workBeforeBreak: 360,
} as const;

export type DriverCode =
  | 'dailyDriving'
  | 'extensionUsed'
  | 'weeklyDriving'
  | 'twoWeekDriving'
  | 'break'
  | 'dailyRest'
  | 'reducedRest'
  | 'reducedRestTooOften'
  | 'noDailyRest'
  | 'weeklyRestLate'
  | 'weeklyRestReduced'
  | 'twoReducedWeekly'
  | 'arbzgWeek60'
  | 'arbzgWeek48'
  | 'arbzgDay'
  | 'arbzgBreak'
  | 'arbzgSixHours'
  | 'dayOver24';

export type Severity = 'violation' | 'warning' | 'info';

export interface Fine {
  driver: number;
  company: number;
}

export interface DriverFinding {
  code: DriverCode;
  severity: Severity;
  /** Legal basis as cited in the UI (German, not translated). */
  rule: string;
  /** Day index (0 = Monday of week 1) where it happens. */
  day: number;
  /** Excess / shortfall / amount in minutes (meaning depends on the code). */
  minutes: number;
  /** Indicative fine (Regelsatz) when the catalogue has a clear step for it; else null → only the maximum. */
  fine: Fine | null;
}

export interface DutyPeriod {
  /** Absolute start minute and day index. */
  start: number;
  day: number;
  drive: number;
  work: number;
  /** Following rest (minutes inside the 24-h window, null = beyond the planned period). */
  rest: number | null;
  restType: 'regular' | 'split' | 'reduced' | 'short' | 'weekly' | 'open';
}

export interface DriverResult {
  findings: DriverFinding[];
  duties: DutyPeriod[];
  weeks: { drive: number; work: number }[];
  /** Total driving in weeks 1 + 2 (only with 14 days). */
  twoWeeks: number | null;
  status: 'ok' | 'warnings' | 'violations';
  /** Sum of the indicative fines (driver / company). */
  fines: Fine;
}

type Seg = { kind: 'drive' | 'work' | 'off'; start: number; len: number };

const clampMin = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(DAY, Math.round(n))) : 0);

/** Sanitised days: 7 or 14 days, blocks with 0 < minutes ≤ 24 h, at most 30 blocks per day. */
export const sanitizeDriver = (i: DriverInput): DriverInput => {
  const days = Array.isArray(i?.days) ? i.days : [];
  const n = days.length > 7 ? 14 : 7;
  return {
    days: Array.from({ length: n }, (_, d) =>
      (Array.isArray(days[d]) ? days[d] : [])
        .filter((b) => b && BLOCK_KINDS.includes(b.kind))
        .map((b) => ({ kind: b.kind, minutes: clampMin(b.minutes) }))
        .filter((b) => b.minutes > 0)
        .slice(0, 30),
    ),
  };
};

/** Timeline of merged segments; unplanned time of a day is rest. */
export const timeline = (days: Block[][]): Seg[] => {
  const out: Seg[] = [];
  const push = (kind: Seg['kind'], start: number, len: number) => {
    if (len <= 0) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind && last.start + last.len === start) last.len += len;
    else out.push({ kind, start, len });
  };
  let t = 0;
  days.forEach((blocks, d) => {
    t = d * DAY;
    for (const b of blocks) {
      push(b.kind === 'drive' ? 'drive' : b.kind === 'work' ? 'work' : 'off', t, b.minutes);
      t += b.minutes;
    }
    // Over-long days push into the next one (flagged as dayOver24); the remainder of a short day is rest.
    if (t < (d + 1) * DAY) push('off', t, (d + 1) * DAY - t);
  });
  return out;
};

const steps = (m: number, size: number) => Math.ceil(Math.max(0, m) / size);

/** Daily driving time exceeded by m minutes: ≤ 1 h 30 € (driver); up to 2 h + 30 / 90 € per started ½ h; beyond + 60 / 180 €. */
export const drivingFine = (m: number): Fine => {
  if (m <= 0) return { driver: 0, company: 0 };
  const mid = steps(Math.min(m, 120) - 60, 30);
  const high = steps(m - 120, 30);
  return { driver: 30 + mid * 30 + high * 60, company: mid * 90 + high * 180 };
};

/** Break missing (driving beyond 4.5 h by m minutes): ≤ 15 min 30 / 90 €; + 60 / 180 € per further started ¼ h. */
export const breakFine = (m: number): Fine => {
  if (m <= 0) return { driver: 0, company: 0 };
  const more = steps(m - 15, 15);
  return { driver: 30 + more * 60, company: 90 + more * 180 };
};

/** Daily rest shortened by m minutes: ≤ 1 h 30 € (driver); up to 3 h + 30 / 90 € per started h; beyond + 60 / 180 €. */
export const restFine = (m: number): Fine => {
  if (m <= 0) return { driver: 0, company: 0 };
  const mid = steps(Math.min(m, 180) - 60, 60);
  const high = steps(m - 180, 60);
  return { driver: 30 + mid * 30 + high * 60, company: mid * 90 + high * 180 };
};

const R561 = 'VO (EG) 561/2006';

export const checkDriver = (input: DriverInput): DriverResult => {
  const { days } = sanitizeDriver(input);
  const findings: DriverFinding[] = [];
  const add = (code: DriverCode, severity: Severity, rule: string, at: number, minutes: number, fine: Fine | null = null) =>
    findings.push({ code, severity, rule, day: Math.min(days.length - 1, Math.max(0, Math.floor(at / DAY))), minutes: Math.round(minutes), fine });

  days.forEach((blocks, d) => {
    const sum = blocks.reduce((s, b) => s + b.minutes, 0);
    if (sum > DAY) add('dayOver24', 'warning', '—', d * DAY, sum - DAY);
  });

  const segs = timeline(days);
  const end = segs.length ? segs[segs.length - 1].start + segs[segs.length - 1].len : days.length * DAY;
  const weekOf = (t: number) => Math.min(Math.floor(t / (7 * DAY)), days.length / 7 - 1);
  const weeks = Array.from({ length: days.length / 7 }, () => ({ drive: 0, work: 0 }));
  for (const s of segs) {
    if (s.kind === 'off') continue;
    // Split at week boundaries for the weekly sums (overflow past the plan counts to the last week).
    const e = s.start + s.len;
    for (let t = s.start; t < e; ) {
      const w = weekOf(t);
      const until = w === weeks.length - 1 ? e : Math.min(e, (w + 1) * 7 * DAY);
      weeks[w][s.kind] += until - t;
      t = until;
    }
  }

  // ── Art. 7 breaks (globally; rests count as breaks) ──
  let since = 0;
  let pending = false;
  let startOfStretch = 0;
  const flushBreak = () => {
    if (since > L.driveBeforeBreak) add('break', 'violation', `Art. 7 ${R561}`, startOfStretch, since - L.driveBeforeBreak, breakFine(since - L.driveBeforeBreak));
  };
  for (const s of segs) {
    if (s.kind === 'drive') {
      if (since === 0) startOfStretch = s.start;
      since += s.len;
    } else if (s.kind === 'off') {
      if (s.len >= L.breakFull || (pending && s.len >= L.breakSecond)) {
        flushBreak();
        since = 0;
        pending = false;
      } else if (s.len >= L.breakFirst) pending = true;
    }
  }
  flushBreak();

  // ── Duty periods between daily / weekly rests ──
  const duties: DutyPeriod[] = [];
  const firstActive = segs.find((s) => s.kind !== 'off');
  let reducedSinceWeekly = 0;
  const extensions = weeks.map(() => 0);
  let lastWeeklyEnd = firstActive ? firstActive.start : 0;
  let lastWeeklyReduced = false;

  let i = segs.findIndex((s) => s.kind !== 'off');
  while (i >= 0 && i < segs.length) {
    const start = segs[i].start;
    const windowEnd = start + DAY;
    // End of the duty: the first off period ≥ 9 h. Without one inside the 24-h window, the longest off period
    // ≥ 3 h that started inside the window counts as a (too short) daily rest.
    let j = i;
    let best = -1;
    let shortRest = false;
    for (; j < segs.length; j++) {
      const s = segs[j];
      if (s.kind === 'off' && s.len >= L.restReduced) break;
      if (s.start >= windowEnd && best >= 0) {
        j = best;
        shortRest = true;
        break;
      }
      if (s.kind === 'off' && s.len >= L.restSplitFirst && s.start < windowEnd && (best < 0 || s.len >= segs[best].len)) best = j;
    }
    let drive = 0;
    let work = 0;
    let splitPart = false;
    let breaks = 0;
    let workRun = 0;
    let sixFlag = false;
    for (let k = i; k < j; k++) {
      const s = segs[k];
      if (s.kind === 'off') {
        if (s.len >= L.restSplitFirst) splitPart = true;
        if (s.len >= 15) {
          breaks += s.len;
          workRun = 0;
        }
      } else {
        if (s.kind === 'drive') drive += s.len;
        else work += s.len;
        workRun += s.len;
        if (workRun > L.workBeforeBreak && !sixFlag) {
          sixFlag = true;
          add('arbzgSixHours', 'violation', '§ 4 ArbZG', s.start, workRun - L.workBeforeBreak);
        }
      }
    }
    const rest = j < segs.length ? segs[j] : null;
    const day = Math.floor(start / DAY);
    const duty: DutyPeriod = { start, day, drive, work, rest: null, restType: 'open' };

    // Daily driving + extensions (Art. 6 Abs. 1).
    const w = weekOf(start);
    if (drive > L.dailyDrive) {
      if (drive <= L.dailyDriveExtended && extensions[w] < L.extensionsPerWeek) {
        extensions[w]++;
        add('extensionUsed', 'info', `Art. 6 Abs. 1 ${R561}`, start, drive - L.dailyDrive);
      } else {
        const allowed = extensions[w] < L.extensionsPerWeek ? L.dailyDriveExtended : L.dailyDrive;
        if (extensions[w] < L.extensionsPerWeek) extensions[w]++;
        add('dailyDriving', 'violation', `Art. 6 Abs. 1 ${R561}`, start, drive - allowed, drivingFine(drive - allowed));
      }
    }

    // ArbZG per duty (§3, §4).
    const working = drive + work;
    if (working > L.workDayMax) add('arbzgDay', 'violation', '§ 3 ArbZG', start, working - L.workDayMax);
    const needBreak = working > 540 ? 45 : working > 360 ? 30 : 0;
    if (breaks < needBreak) add('arbzgBreak', 'violation', '§ 4 ArbZG', start, needBreak - breaks);

    // Daily / weekly rest (Art. 8).
    if (rest) {
      const restEnd = rest.start + rest.len;
      const open = restEnd >= end;
      const inWindow = Math.max(0, Math.min(restEnd, windowEnd) - rest.start);
      const weekly = rest.len >= L.weeklyRestReduced;
      const required = reducedSinceWeekly < L.reducedRestsMax ? L.restReduced : L.restRegular;
      if (shortRest) {
        duty.restType = 'short';
        duty.rest = rest.len;
        add('dailyRest', 'violation', `Art. 8 Abs. 2 ${R561}`, rest.start, required - rest.len, restFine(required - rest.len));
      } else if (rest.start >= windowEnd) {
        add('noDailyRest', 'violation', `Art. 8 Abs. 2 ${R561}`, windowEnd, rest.start - windowEnd, restFine(L.restReduced));
        duty.restType = 'short';
        duty.rest = 0;
      } else if (open && windowEnd > end && inWindow < L.restRegular) {
        duty.restType = 'open';
      } else if (splitPart && inWindow >= L.restReduced) {
        duty.restType = 'split';
        duty.rest = inWindow;
      } else if (inWindow >= L.restRegular) {
        duty.restType = 'regular';
        duty.rest = inWindow;
      } else if (inWindow >= L.restReduced && reducedSinceWeekly < L.reducedRestsMax) {
        reducedSinceWeekly++;
        duty.restType = 'reduced';
        duty.rest = inWindow;
        add('reducedRest', 'info', `Art. 8 Abs. 4 ${R561}`, rest.start, L.restRegular - inWindow);
      } else if (inWindow >= L.restReduced) {
        duty.restType = 'short';
        duty.rest = inWindow;
        add('reducedRestTooOften', 'violation', `Art. 8 Abs. 4 ${R561}`, rest.start, L.restRegular - inWindow, restFine(L.restRegular - inWindow));
      } else {
        // The rest starts so late that less than 9 h of it fall inside the 24-h window.
        duty.restType = 'short';
        duty.rest = inWindow;
        add('dailyRest', 'violation', `Art. 8 Abs. 2 ${R561}`, rest.start, required - inWindow, restFine(required - inWindow));
      }
      if (weekly) {
        if (duty.restType !== 'short') duty.restType = 'weekly';
        // Art. 8 Abs. 6: start at the latest after six 24-h periods.
        if (rest.start - lastWeeklyEnd > L.weeklyRestDeadline) add('weeklyRestLate', 'violation', `Art. 8 Abs. 6 ${R561}`, lastWeeklyEnd + L.weeklyRestDeadline, rest.start - lastWeeklyEnd - L.weeklyRestDeadline);
        const reduced = rest.len < L.weeklyRestRegular && !open;
        if (reduced) {
          if (lastWeeklyReduced) add('twoReducedWeekly', 'violation', `Art. 8 Abs. 6 ${R561}`, rest.start, L.weeklyRestRegular - rest.len);
          else add('weeklyRestReduced', 'warning', `Art. 8 Abs. 6 ${R561}`, rest.start, L.weeklyRestRegular - rest.len);
        }
        lastWeeklyReduced = reduced;
        lastWeeklyEnd = restEnd;
        reducedSinceWeekly = 0;
      }
      duties.push(duty);
      i = segs.findIndex((s, k) => k > j && s.kind !== 'off');
    } else {
      duties.push(duty);
      break;
    }
  }
  // No weekly rest started within six 24-h periods although the plan reaches that far.
  const deadline = lastWeeklyEnd + L.weeklyRestDeadline;
  if (firstActive && deadline < end) {
    const startsWeekly = segs.some((s) => s.kind === 'off' && s.start >= lastWeeklyEnd && s.start <= deadline && (s.len >= L.weeklyRestReduced || s.start + s.len >= end));
    if (!startsWeekly) add('weeklyRestLate', 'violation', `Art. 8 Abs. 6 ${R561}`, deadline, Math.min(end, deadline + DAY) - deadline);
  }

  // Weekly / two-week driving (Art. 6 Abs. 2, 3) and ArbZG weekly working time.
  weeks.forEach((wk, n) => {
    const at = n * 7 * DAY;
    if (wk.drive > L.weeklyDrive) add('weeklyDriving', 'violation', `Art. 6 Abs. 2 ${R561}`, at, wk.drive - L.weeklyDrive);
    const working = wk.drive + wk.work;
    if (working > L.workWeekMax) add('arbzgWeek60', 'violation', '§ 21a Abs. 4 ArbZG', at, working - L.workWeekMax);
    else if (working > L.workWeekAvg) add('arbzgWeek48', 'warning', '§ 21a Abs. 4 ArbZG', at, working - L.workWeekAvg);
  });
  const twoWeeks = weeks.length === 2 ? weeks[0].drive + weeks[1].drive : null;
  if (twoWeeks != null && twoWeeks > L.twoWeekDrive) add('twoWeekDriving', 'violation', `Art. 6 Abs. 3 ${R561}`, 7 * DAY, twoWeeks - L.twoWeekDrive);

  findings.sort((a, b) => a.day - b.day || (a.severity === b.severity ? 0 : a.severity === 'violation' ? -1 : b.severity === 'violation' ? 1 : a.severity === 'warning' ? -1 : 1));
  const status = findings.some((f) => f.severity === 'violation') ? 'violations' : findings.some((f) => f.severity === 'warning') ? 'warnings' : 'ok';
  const fines = findings.reduce((s, f) => ({ driver: s.driver + (f.fine?.driver ?? 0), company: s.company + (f.fine?.company ?? 0) }), { driver: 0, company: 0 });
  return { findings, duties, weeks, twoWeeks, status, fines };
};

// ── Presets ──
const b = (kind: BlockKind, h: number): Block => ({ kind, minutes: Math.round(h * 60) });

/** Day templates for the editor. */
export const DAY_PRESETS = {
  /** 06:00 start, 4.5 h + 45 min + 4 h driving, 1 h loading: 8.5 h driving, 10¼ h on duty. */
  typical: [b('rest', 6), b('drive', 4.5), b('break', 0.75), b('drive', 4), b('work', 1)],
  /** Extended 10-h driving day with split break 15 + 30. */
  long: [b('rest', 5), b('drive', 3), b('break', 0.25), b('drive', 1.5), b('break', 0.5), b('drive', 4.5), b('break', 0.75), b('drive', 1)],
  /** Short local day. */
  short: [b('rest', 7), b('work', 1), b('drive', 3), b('break', 0.75), b('drive', 2), b('work', 1)],
  off: [] as Block[],
} satisfies Record<string, Block[]>;
export type DayPreset = keyof typeof DAY_PRESETS;

const week = (...d: DayPreset[]) => d.map((k) => DAY_PRESETS[k].map((x) => ({ ...x })));

/** Week templates: a legal week and one with typical violations. */
export const WEEK_PRESETS = {
  legal: () => ({ days: week('typical', 'long', 'typical', 'long', 'short', 'off', 'off') }),
  violations: () => ({
    days: [
      DAY_PRESETS.typical.map((x) => ({ ...x })),
      // 5 h 15 driving without a break, 10 h 45 driving, 13 h duty.
      [b('rest', 5), b('drive', 5.25), b('break', 0.75), b('drive', 4.5), b('break', 0.75), b('drive', 1), b('work', 1)],
      // Starts at 02:00: only 7 h rest in between.
      [b('rest', 2), b('drive', 4.5), b('break', 0.75), b('drive', 4.5), b('work', 0.5)],
      DAY_PRESETS.long.map((x) => ({ ...x })),
      DAY_PRESETS.long.map((x) => ({ ...x })),
      DAY_PRESETS.typical.map((x) => ({ ...x })),
      DAY_PRESETS.short.map((x) => ({ ...x })),
    ],
  }),
} as const;
export type WeekPreset = keyof typeof WEEK_PRESETS;

export const DEFAULT_DRIVER: DriverInput = WEEK_PRESETS.legal();

/** "4:30" from minutes. */
export const hm = (m: number) => `${Math.floor(Math.abs(m) / 60)}:${String(Math.round(Math.abs(m) % 60)).padStart(2, '0')}`;
