/**
 * German public holidays per Bundesland and bridge days (/holiday-planner). Pure, no `@/` imports and no browser
 * APIs: unit-tested in server/tests/unit/publicCalc.test.ts against published holiday lists.
 *
 * Every date is computed (Gauss / Meeus Gregorian Easter algorithm, fixed dates, Buß- und Bettag = the Wednesday
 * before 23 November). Legal basis: the holiday laws of the 16 states (Feiertagsgesetze; 3 October: Einigungsvertrag).
 * Checked 2026-11:
 *  - Heilige Drei Könige (6 Jan): BW, BY, ST.
 *  - Internationaler Frauentag (8 Mar): BE (since 2019), MV (since 2023).
 *  - Ostersonntag / Pfingstsonntag: official holidays only in BB (they are Sundays anyway).
 *  - Fronleichnam (Easter + 60): BW, BY, HE, NW, RP, SL; in SN and TH only in some (Catholic / Sorbian) municipalities.
 *  - Augsburger Hohes Friedensfest (8 Aug): only the city of Augsburg (BY).
 *  - Mariä Himmelfahrt (15 Aug): SL; BY only in municipalities with a predominantly Catholic population (the majority).
 *  - Weltkindertag (20 Sep): TH (since 2019).
 *  - Reformationstag (31 Oct): BB, HB, HH, MV, NI, SN, ST, SH, TH.
 *  - Allerheiligen (1 Nov): BW, BY, NW, RP, SL.
 *  - Buß- und Bettag: SN.
 * Regional ("partial") holidays are listed but never counted as days off in the bridge-day planner.
 */

export const HOLIDAY_STATES = ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'] as const;
export type HolidayState = (typeof HOLIDAY_STATES)[number];
export const HOLIDAY_YEARS = [2026, 2027, 2028] as const;
export const HOLIDAYS_CHECKED = '2026-11-16';

export type HolidayKey =
  | 'newYear'
  | 'epiphany'
  | 'womensDay'
  | 'goodFriday'
  | 'easterSunday'
  | 'easterMonday'
  | 'labourDay'
  | 'ascension'
  | 'whitSunday'
  | 'whitMonday'
  | 'corpusChristi'
  | 'peaceFestival'
  | 'assumption'
  | 'childrensDay'
  | 'germanUnity'
  | 'reformation'
  | 'allSaints'
  | 'repentance'
  | 'christmas'
  | 'boxingDay';

/** German names (shown next to the translated name, as on official calendars). */
export const HOLIDAY_DE: Record<HolidayKey, string> = {
  newYear: 'Neujahr',
  epiphany: 'Heilige Drei Könige',
  womensDay: 'Internationaler Frauentag',
  goodFriday: 'Karfreitag',
  easterSunday: 'Ostersonntag',
  easterMonday: 'Ostermontag',
  labourDay: 'Tag der Arbeit',
  ascension: 'Christi Himmelfahrt',
  whitSunday: 'Pfingstsonntag',
  whitMonday: 'Pfingstmontag',
  corpusChristi: 'Fronleichnam',
  peaceFestival: 'Augsburger Hohes Friedensfest',
  assumption: 'Mariä Himmelfahrt',
  childrensDay: 'Weltkindertag',
  germanUnity: 'Tag der Deutschen Einheit',
  reformation: 'Reformationstag',
  allSaints: 'Allerheiligen',
  repentance: 'Buß- und Bettag',
  christmas: '1. Weihnachtstag',
  boxingDay: '2. Weihnachtstag',
};

export interface Holiday {
  /** ISO date YYYY-MM-DD. */
  date: string;
  key: HolidayKey;
  /** Only in some municipalities of the state (not a day off for everyone). */
  partial: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
/** Day number since the epoch (UTC, no time-zone effects). */
export const dayNumber = (iso: string) => Math.round(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000);
export const fromDayNumber = (n: number) => {
  const d = new Date(n * 86_400_000);
  return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};
/** 0 = Sunday … 6 = Saturday. */
export const weekday = (iso: string) => new Date(dayNumber(iso) * 86_400_000).getUTCDay();
const addDays = (iso: string, n: number) => fromDayNumber(dayNumber(iso) + n);

/** Easter Sunday (Gregorian calendar, anonymous Gregorian algorithm / Meeus–Jones–Butcher). */
export const easterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(year, month, day);
};

/** Buß- und Bettag: the last Wednesday before 23 November (16 – 22 November). */
export const repentanceDay = (year: number) => {
  const nov22 = isoDate(year, 11, 22);
  const back = (weekday(nov22) - 3 + 7) % 7;
  return addDays(nov22, -back);
};

const ALL = HOLIDAY_STATES;
/** States per holiday; `partial` = only some municipalities. */
const RULES: { key: HolidayKey; at: (y: number) => string; states: readonly HolidayState[]; partial?: readonly HolidayState[] }[] = [
  { key: 'newYear', at: (y) => isoDate(y, 1, 1), states: ALL },
  { key: 'epiphany', at: (y) => isoDate(y, 1, 6), states: ['BW', 'BY', 'ST'] },
  { key: 'womensDay', at: (y) => isoDate(y, 3, 8), states: ['BE', 'MV'] },
  { key: 'goodFriday', at: (y) => addDays(easterSunday(y), -2), states: ALL },
  { key: 'easterSunday', at: (y) => easterSunday(y), states: ['BB'] },
  { key: 'easterMonday', at: (y) => addDays(easterSunday(y), 1), states: ALL },
  { key: 'labourDay', at: (y) => isoDate(y, 5, 1), states: ALL },
  { key: 'ascension', at: (y) => addDays(easterSunday(y), 39), states: ALL },
  { key: 'whitSunday', at: (y) => addDays(easterSunday(y), 49), states: ['BB'] },
  { key: 'whitMonday', at: (y) => addDays(easterSunday(y), 50), states: ALL },
  { key: 'corpusChristi', at: (y) => addDays(easterSunday(y), 60), states: ['BW', 'BY', 'HE', 'NW', 'RP', 'SL'], partial: ['SN', 'TH'] },
  { key: 'peaceFestival', at: (y) => isoDate(y, 8, 8), states: [], partial: ['BY'] },
  { key: 'assumption', at: (y) => isoDate(y, 8, 15), states: ['SL'], partial: ['BY'] },
  { key: 'childrensDay', at: (y) => isoDate(y, 9, 20), states: ['TH'] },
  { key: 'germanUnity', at: (y) => isoDate(y, 10, 3), states: ALL },
  { key: 'reformation', at: (y) => isoDate(y, 10, 31), states: ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH'] },
  { key: 'allSaints', at: (y) => isoDate(y, 11, 1), states: ['BW', 'BY', 'NW', 'RP', 'SL'] },
  { key: 'repentance', at: repentanceDay, states: ['SN'] },
  { key: 'christmas', at: (y) => isoDate(y, 12, 25), states: ALL },
  { key: 'boxingDay', at: (y) => isoDate(y, 12, 26), states: ALL },
];

/** Holidays of a state in a year, in date order (partial ones flagged). */
export const holidaysFor = (state: HolidayState, year: number): Holiday[] =>
  RULES.flatMap((r) => {
    if (r.states.includes(state)) return [{ date: r.at(year), key: r.key, partial: false }];
    if (r.partial?.includes(state)) return [{ date: r.at(year), key: r.key, partial: true }];
    return [];
  }).sort((a, b) => a.date.localeCompare(b.date));

export const isWeekend = (iso: string) => {
  const w = weekday(iso);
  return w === 0 || w === 6;
};

export interface BridgeOption {
  /** First and last day off (inclusive). */
  start: string;
  end: string;
  /** Vacation days to take (working days Monday – Friday in the window that are not holidays). */
  vacationDays: number;
  /** Consecutive days off in total. */
  daysOff: number;
  /** The vacation dates to book. */
  vacationDates: string[];
  /** Holidays inside the window. */
  holidays: HolidayKey[];
}

/**
 * Best bridge-day combinations of a year: for every block of holidays, the window (≤ `maxVacation` vacation days)
 * with the most days off per vacation day, plus the longest one.  Assumes a Monday – Friday week; partial holidays do
 * not count. Windows are always extended over adjacent weekends / holidays. Sorted by date.
 */
export const bridgeDays = (state: HolidayState, year: number, maxVacation = 4): BridgeOption[] => {
  const hol = new Map(holidaysFor(state, year).filter((h) => !h.partial).map((h) => [h.date, h.key]));
  // Neighbouring years' New Year / Christmas can extend windows at the edges.
  for (const y of [year - 1, year + 1]) for (const h of holidaysFor(state, y)) if (!h.partial) hol.set(h.date, h.key);
  const off = (n: number) => {
    const iso = fromDayNumber(n);
    return isWeekend(iso) || hol.has(iso);
  };
  const first = dayNumber(isoDate(year, 1, 1));
  const last = dayNumber(isoDate(year, 12, 31));
  const weekdayHolidays = [...hol.entries()].filter(([d]) => d.startsWith(String(year)) && !isWeekend(d)).map(([d]) => dayNumber(d));

  const groups = new Map<string, BridgeOption[]>();
  for (const h of weekdayHolidays) {
    // Windows [s, e] containing h, at most 16 days long, extended over adjacent days off.
    for (let s = h - 12; s <= h; s++) {
      for (let e = h; e <= h + 12 && e - s <= 16; e++) {
        let a = s;
        let b = e;
        while (off(a - 1)) a--;
        while (off(b + 1)) b++;
        if (a < first - 3 || b > last + 3) continue;
        const vacationDates: string[] = [];
        const keys: HolidayKey[] = [];
        const bridged: string[] = [];
        for (let n = a; n <= b; n++) {
          const iso = fromDayNumber(n);
          if (!off(n)) vacationDates.push(iso);
          const k = hol.get(iso);
          if (k && !keys.includes(k)) keys.push(k);
          if (k && !isWeekend(iso)) bridged.push(iso);
        }
        const vacationDays = vacationDates.length;
        if (vacationDays < 1 || vacationDays > maxVacation) continue;
        const daysOff = b - a + 1;
        // Worth it only with at least twice as many days off as vacation days.
        if (daysOff / vacationDays < 2) continue;
        const group = bridged.join('+');
        const list = groups.get(group) ?? [];
        if (!list.some((o) => o.start === fromDayNumber(a) && o.end === fromDayNumber(b))) list.push({ start: fromDayNumber(a), end: fromDayNumber(b), vacationDays, daysOff, vacationDates, holidays: keys });
        groups.set(group, list);
      }
    }
  }
  // Per holiday block: the most efficient option and the longest one (if different).
  const ratio = (o: BridgeOption) => o.daysOff / o.vacationDays;
  const picked: BridgeOption[] = [];
  for (const list of groups.values()) {
    const efficient = [...list].sort((x, y) => ratio(y) - ratio(x) || y.daysOff - x.daysOff)[0];
    const longest = [...list].sort((x, y) => y.daysOff - x.daysOff || x.vacationDays - y.vacationDays)[0];
    for (const o of [efficient, longest]) if (!picked.some((p) => p.start === o.start && p.end === o.end)) picked.push(o);
  }
  return picked
    .filter((o) => o.start.startsWith(String(year)) || o.end.startsWith(String(year)))
    .sort((a, b) => a.start.localeCompare(b.start) || a.vacationDays - b.vacationDays);
};

/** Escapes iCalendar TEXT (RFC 5545 §3.3.11). */
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/**
 * iCalendar file with all-day events (DTSTART;VALUE=DATE). Lines stay short (no folding needed for these names).
 * `stamp` is the DTSTAMP (UTC, e.g. 20261116T000000Z) so the output is deterministic in tests.
 */
export const holidaysIcs = (
  events: { date: string; endExclusive?: string; summary: string; description?: string; uid: string }[],
  calName: string,
  stamp: string,
) => {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Triad Vision//Holiday planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsText(calName)}`];
  for (const e of events) {
    const end = e.endExclusive ?? addDays(e.date, 1);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${end.replace(/-/g, '')}`,
      `SUMMARY:${icsText(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
};

export const nextDay = (iso: string) => addDays(iso, 1);
