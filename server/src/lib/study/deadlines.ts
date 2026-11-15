import { z } from 'zod';

/**
 * Application deadlines of a study programme. Universities publish them as recurring day + month per intake
 * ("winter semester: 1 April – 31 May", "summer semester: until 15 January"), so a deadline is stored as
 * { intake, from?, to, note? } with "MM-DD" values and the next occurrence is computed for "today" in Germany.
 *
 * - closes: the next date on or after today that matches `to` (29 Feb → 28 Feb in other years).
 * - opens: the last `from` date on or before `closes` (a window may cross the new year: 1 Dec – 15 Jan).
 * - intake year: the winter semester starts in October, the summer semester in April — a deadline in
 *   July 2027 is for WS 2027/28, one in January 2027 for SS 2027 or WS 2027/28, one in November 2026 for SS 2027.
 * Pure functions (no clock, no database): tests/unit/studyDeadlines.test.ts.
 */

export const INTAKES = ['WINTER', 'SUMMER'] as const;
export type Intake = (typeof INTAKES)[number];

const mmdd = z
  .string()
  .trim()
  .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'MM_DD')
  .refine((v) => {
    const [m, d] = v.split('-').map(Number);
    return d <= DAYS_IN_MONTH[m - 1];
  }, 'MM_DD');

export const deadlineSchema = z.object({
  intake: z.enum(INTAKES),
  from: mmdd.nullable().optional().transform((v) => v ?? null),
  to: mmdd,
  note: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .optional()
    .transform((v) => v || null),
});
export type Deadline = z.infer<typeof deadlineSchema>;
export const deadlineList = z.array(deadlineSchema).max(8);

/** Max days per month (February 29: valid in leap years, clamped otherwise). */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y: number, m: number) => (m === 2 ? (isLeap(y) ? 29 : 28) : DAYS_IN_MONTH[m - 1]);

/** "MM-DD" in year y (29 Feb → 28 Feb outside leap years). */
const inYear = (value: string, y: number): Ymd => {
  const [m, d] = value.split('-').map(Number);
  return { y, m, d: Math.min(d, daysIn(y, m)) };
};

const serial = (x: Ymd) => Date.UTC(x.y, x.m - 1, x.d) / 86_400_000;
export const compareYmd = (a: Ymd, b: Ymd) => serial(a) - serial(b);
export const daysBetween = (from: Ymd, to: Ymd) => Math.round(serial(to) - serial(from));
export const isoOf = (x: Ymd) => `${x.y}-${String(x.m).padStart(2, '0')}-${String(x.d).padStart(2, '0')}`;
export const parseIso = (s: string): Ymd => {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
};

/** Today's calendar date in Germany (deadlines are German calendar dates, whatever the server's time zone). */
export const berlinToday = (now = new Date()): Ymd => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
};

/** Same day N months later (clamped to the month's last day). */
export const addMonths = (x: Ymd, n: number): Ymd => {
  const total = x.y * 12 + (x.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, d: Math.min(x.d, daysIn(y, m)) };
};

/** Year the semester of a deadline starts in: winter = October, summer = April (after the deadline). */
export const intakeYear = (intake: Intake, closes: Ymd) => (intake === 'WINTER' ? (closes.m <= 9 ? closes.y : closes.y + 1) : closes.m <= 3 ? closes.y : closes.y + 1);

export interface DeadlineOccurrence {
  intake: Intake;
  from: string | null;
  to: string;
  note: string | null;
  /** Next closing date (YYYY-MM-DD, German calendar date), today included. */
  closes: string;
  /** Start of that application window (YYYY-MM-DD) when the university states one. */
  opens: string | null;
  /** Calendar days from today to `closes` (0 = closes today). */
  daysLeft: number;
  /** true / false when the window start is known, null otherwise. */
  open: boolean | null;
  /** Start year of the semester (WINTER 2027 = WS 2027/28). */
  intakeYear: number;
}

export const occurrence = (dl: Deadline, today: Ymd): DeadlineOccurrence => {
  let closes = inYear(dl.to, today.y);
  if (compareYmd(closes, today) < 0) closes = inYear(dl.to, today.y + 1);
  let opens: Ymd | null = null;
  if (dl.from) {
    opens = inYear(dl.from, closes.y);
    if (compareYmd(opens, closes) > 0) opens = inYear(dl.from, closes.y - 1);
  }
  return {
    intake: dl.intake,
    from: dl.from,
    to: dl.to,
    note: dl.note,
    closes: isoOf(closes),
    opens: opens ? isoOf(opens) : null,
    daysLeft: daysBetween(today, closes),
    open: opens ? compareYmd(today, opens) >= 0 : null,
    intakeYear: intakeYear(dl.intake, closes),
  };
};

/** Stored JSON → valid deadlines (invalid entries are dropped, never thrown). */
export const readDeadlines = (raw: unknown): Deadline[] => {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    const r = deadlineSchema.safeParse(x);
    return r.success ? [r.data] : [];
  });
};

/** Every deadline's next occurrence, soonest first. */
export const upcomingDeadlines = (raw: unknown, today: Ymd): DeadlineOccurrence[] =>
  readDeadlines(raw)
    .map((d) => occurrence(d, today))
    .sort((a, b) => a.daysLeft - b.daysLeft || a.intake.localeCompare(b.intake));

export const nextDeadline = (raw: unknown, today: Ymd): DeadlineOccurrence | null => upcomingDeadlines(raw, today)[0] ?? null;

/** "Deadline soon" marker (admin list, public cards): closes within this many days. */
export const DEADLINE_SOON_DAYS = 30;
export const isSoon = (o: DeadlineOccurrence | null, days = DEADLINE_SOON_DAYS) => !!o && o.daysLeft <= days;

/** Next deadline within N months of today (the /study "deadline within" filter). */
export const closesWithinMonths = (o: DeadlineOccurrence | null, today: Ymd, months: number) =>
  !!o && compareYmd(parseIso(o.closes), addMonths(today, months)) <= 0;

// ─── CSV notation ─────────────────────────────────────────────────────

/**
 * One cell for all deadlines: entries separated by "|", each `intake:[from..]to[ note]`, e.g.
 * "winter:04-01..05-31 non-EU | summer:..11-30" or "WINTER:07-15". Intake case-insensitive (also ws / ss).
 */
export const formatDeadlines = (list: Deadline[]) =>
  list.map((d) => `${d.intake.toLowerCase()}:${d.from ? `${d.from}..` : ''}${d.to}${d.note ? ` ${d.note}` : ''}`).join(' | ');

export const parseDeadlines = (cell: string): { ok: true; value: Deadline[] } | { ok: false; error: string } => {
  const parts = cell
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);
  const out: Deadline[] = [];
  for (const p of parts) {
    const m = /^(winter|summer|ws|ss|wise|sose)\s*:\s*(?:(\d{2}-\d{2})?\s*\.\.\s*)?(\d{2}-\d{2})(?:\s+(.+))?$/i.exec(p);
    if (!m) return { ok: false, error: `DEADLINE_FORMAT: ${p}` };
    const intake = /^(winter|ws|wise)$/i.test(m[1]) ? 'WINTER' : 'SUMMER';
    const r = deadlineSchema.safeParse({ intake, from: m[2] ?? null, to: m[3], note: m[4] ?? null });
    if (!r.success) return { ok: false, error: `DEADLINE_DATE: ${p}` };
    out.push(r.data);
  }
  if (out.length > 8) return { ok: false, error: 'DEADLINE_TOO_MANY' };
  return { ok: true, value: out };
};
