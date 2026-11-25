import { prisma } from '../../db.js';

/**
 * Weekly management report (Monday morning, Europe/Berlin, to every active SUPER_ADMIN): pure week maths + KPI
 * queries. The "report week" is the last complete Mon 00:00 – Mon 00:00 Berlin week before `now`; its key
 * (YYYY-Www, ISO week) is the idempotency marker (ReminderLog `weekly-report:<key>`).
 */
const TZ = 'Europe/Berlin';
const DAY = 24 * 60 * 60 * 1000;

const partsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });

export const berlinParts = (d: Date) => {
  const o: Record<string, string> = {};
  for (const p of partsFmt.formatToParts(d)) o[p.type] = p.value;
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(o.weekday!); // Monday = 0
  return { y: Number(o.year), m: Number(o.month), d: Number(o.day), h: Number(o.hour), min: Number(o.minute), wd };
};

/** Instant of Berlin local midnight of y-m-d (m 1-based). */
const berlinMidnight = (y: number, m: number, d: number) => {
  const utc = Date.UTC(y, m - 1, d);
  const p = berlinParts(new Date(utc + 12 * 60 * 60 * 1000)); // noon: no DST edge on that day
  const offsetH = p.h - 12; // local - UTC at noon (1 or 2 hours; same calendar day)
  return new Date(utc - offsetH * 60 * 60 * 1000);
};

export interface WeekWindow {
  key: string;
  start: Date;
  end: Date;
}

/** ISO week key of a Berlin calendar date. */
export const isoWeekKey = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow + 3); // Thursday of this week
  const year = t.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((t.getTime() - jan4.getTime()) / DAY - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
};

/** The last complete Berlin week before `now` (Mon..next Mon). */
export const reportWeek = (now: Date): WeekWindow => {
  const p = berlinParts(now);
  const thisMonday = new Date(Date.UTC(p.y, p.m - 1, p.d - p.wd));
  const prev = new Date(thisMonday.getTime() - 7 * DAY);
  const start = berlinMidnight(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate());
  const end = berlinMidnight(thisMonday.getUTCFullYear(), thisMonday.getUTCMonth() + 1, thisMonday.getUTCDate());
  return { key: isoWeekKey(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate()), start, end };
};

/** The week before a window (same length, Berlin-aligned by construction: end of it = start of `w`). */
export const previousWeek = (w: WeekWindow): WeekWindow => {
  const p = berlinParts(new Date(w.start.getTime() - 3 * DAY));
  const start = berlinMidnight(p.y, p.m, p.d - p.wd);
  const q = berlinParts(new Date(start.getTime() + 12 * 60 * 60 * 1000));
  return { key: isoWeekKey(q.y, q.m, q.d), start, end: w.start };
};

/** Due when it is Monday, 07:00 Berlin or later (the job runs every 30 min; the week marker prevents a repeat). */
export const isSendTime = (now: Date) => {
  const p = berlinParts(now);
  return p.wd === 0 && p.h >= 7;
};

export const reminderKey = (weekKey: string) => `weekly-report:${weekKey}`;

export const KPI_KEYS = ['registrations', 'cases', 'documents', 'contracts', 'visas', 'revenueCents'] as const;
export type KpiKey = (typeof KPI_KEYS)[number];
export type Kpis = Record<KpiKey, number>;

export const delta = (cur: number, prev: number) => ({ diff: cur - prev, percent: prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null as number | null });

export const weekKpis = async (w: Pick<WeekWindow, 'start' | 'end'>): Promise<Kpis> => {
  const inWeek = { gte: w.start, lt: w.end };
  const [registrations, cases, documents, contracts, visas, paid] = await Promise.all([
    prisma.user.count({ where: { role: 'CLIENT', createdAt: inWeek } }),
    prisma.case.count({ where: { createdAt: inWeek } }),
    prisma.caseEvent.count({ where: { type: { in: ['DOCUMENT_ACCEPTED', 'DOCUMENT_REJECTED'] }, createdAt: inWeek } }),
    prisma.caseEvent.count({ where: { type: 'CONTRACT_SIGNED', createdAt: inWeek } }),
    prisma.caseEvent.count({ where: { toStatus: 'APPROVED', createdAt: inWeek } }),
    prisma.invoice.aggregate({ where: { status: 'PAID', paidAt: inWeek }, _sum: { grossCents: true } }),
  ]);
  return { registrations, cases, documents, contracts, visas, revenueCents: paid._sum.grossCents ?? 0 };
};
