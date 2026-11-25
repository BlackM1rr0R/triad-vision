import type { CaseStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { bakuDayWindow, bakuMonthWindow, bakuWeekWindow, daysBetween, maskFullName, maskName, tvText } from './mask.js';
import { buildLeaderboard } from './leaderboard.js';
import { getTvSettings, type TvPanel, type TvSettings } from './settings.js';

/**
 * The office TV payload (GET /api/tv/data). Built from a short allow-list of fields: people appear only as
 * "first name + initial" (lib/tvDisplay/mask.ts); no ids, case numbers, e-mails, phones, places or documents.
 * Panels switched off in the settings are not computed at all.
 *
 * Team leaderboard: an opt-in panel ('leaderboard', off by default; staff first names only, counts of reviews /
 * moves / approvals — lib/tvDisplay/leaderboard.ts). The KPI module keeps the detailed rankings for ADMIN+.
 */

/** Statuses in which the next step is the team's (the client has submitted / signed and waits for a review). */
export const WAITING_ON_TEAM: CaseStatus[] = ['DOCUMENTS_REVIEW', 'CONTRACT_SIGNED', 'EMBASSY_REVIEW'];

const nameSel = { select: { firstName: true, lastName: true } } as const;
const person = (u: { firstName: string; lastName: string } | null | undefined) => (u ? maskName(u.firstName, u.lastName) || null : null);
const LIST_MAX = 30;

const agenda = async (start: Date, end: Date) => {
  const [cases, interviews] = await Promise.all([
    prisma.case.findMany({
      where: { appointmentAt: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
      select: { appointmentAt: true, client: nameSel, assignedStaff: nameSel },
      orderBy: { appointmentAt: 'asc' },
      take: LIST_MAX,
    }),
    prisma.interview.findMany({
      where: { startsAt: { gte: start, lt: end }, status: { in: ['PROPOSED', 'CONFIRMED', 'DONE'] } },
      select: { startsAt: true, status: true, candidate: nameSel, staff: nameSel },
      orderBy: { startsAt: 'asc' },
      take: LIST_MAX,
    }),
  ]);
  const items = [
    ...cases.map((c) => ({ kind: 'embassy' as const, at: c.appointmentAt!, client: person(c.client), owner: person(c.assignedStaff) })),
    ...interviews.map((i) => ({ kind: 'interview' as const, at: i.startsAt, client: person(i.candidate), owner: person(i.staff) })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  return { embassy: cases.length, interviews: interviews.length, items: items.slice(0, LIST_MAX) };
};

const inquiries = async (start: Date, end: Date) => {
  const where = { createdAt: { gte: start, lt: end } };
  const [total, companies, hot, recent] = await Promise.all([
    prisma.inquiry.count({ where }),
    prisma.inquiry.count({ where: { ...where, kind: 'company' } }),
    prisma.inquiry.count({ where: { ...where, scoreLevel: 'HOT' } }),
    prisma.inquiry.findMany({ where, select: { kind: true, contactName: true, createdAt: true, scoreLevel: true, anonymizedAt: true }, orderBy: { createdAt: 'desc' }, take: 8 }),
  ]);
  return {
    today: total,
    companies,
    people: total - companies,
    hot,
    recent: recent.map((r) => ({ kind: r.kind === 'company' ? ('company' as const) : ('person' as const), name: r.anonymizedAt ? null : maskFullName(r.contactName) || null, at: r.createdAt, hot: r.scoreLevel === 'HOT' })),
  };
};

const waiting = async (now: Date) => {
  const rows = await prisma.case.findMany({
    where: { status: { in: WAITING_ON_TEAM } },
    select: {
      status: true,
      updatedAt: true,
      client: nameSel,
      assignedStaff: nameSel,
      // When the case entered its waiting status (latest event into one of them).
      events: { where: { toStatus: { in: WAITING_ON_TEAM } }, select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
    take: 2000,
  });
  const withSince = rows.map((r) => ({ ...r, since: r.events[0]?.createdAt ?? r.updatedAt })).sort((a, b) => a.since.getTime() - b.since.getTime());
  const byStatus = Object.fromEntries(WAITING_ON_TEAM.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<string, number>;
  return {
    count: rows.length,
    byStatus,
    oldestDays: withSince[0] ? daysBetween(withSince[0].since, now) : null,
    oldest: withSince.slice(0, 6).map((r) => ({ client: person(r.client), owner: person(r.assignedStaff), status: r.status, since: r.since, days: daysBetween(r.since, now) })),
  };
};

/** Destination city of an approved case: the vacancy's, else the employer's, else the planned housing city. */
const cityOf = (c: { vacancy: { city: string | null } | null; company: { city: string | null } | null; arrivalPlan: { housingCity: string | null } | null }) =>
  tvText(c.vacancy?.city ?? c.company?.city ?? c.arrivalPlan?.housingCity ?? null, 40);

export const approvedCaseSelect = {
  profession: true,
  decisionAt: true,
  closedAt: true,
  client: nameSel,
  vacancy: { select: { city: true } },
  company: { select: { city: true } },
  arrivalPlan: { select: { housingCity: true } },
} as const;

export const approvedEntry = (c: {
  profession: string;
  decisionAt: Date | null;
  closedAt: Date | null;
  client: { firstName: string; lastName: string };
  vacancy: { city: string | null } | null;
  company: { city: string | null } | null;
  arrivalPlan: { housingCity: string | null } | null;
}) => ({ client: person(c.client), profession: tvText(c.profession, 50), city: cityOf(c), at: c.decisionAt ?? c.closedAt });

const approved = async (start: Date, end: Date) => {
  const where = { status: 'APPROVED' as const, OR: [{ decisionAt: { gte: start, lt: end } }, { decisionAt: null, closedAt: { gte: start, lt: end } }] };
  const [count, rows] = await Promise.all([
    prisma.case.count({ where }),
    prisma.case.findMany({ where, select: approvedCaseSelect, orderBy: [{ decisionAt: 'desc' }, { closedAt: 'desc' }], take: LIST_MAX }),
  ]);
  return { count, items: rows.map(approvedEntry) };
};

const arrivals = async (start: Date, end: Date) => {
  const rows = await prisma.arrivalPlan.findMany({
    where: {
      status: { in: ['SUBMITTED', 'CONFIRMED', 'COMPLETED'] },
      OR: [{ arrivalTime: { gte: start, lt: end } }, { arrivalTime: null, flightDate: { gte: start, lt: end } }],
    },
    select: { arrivalTime: true, flightDate: true, status: true, client: nameSel, housingCity: true, case: { select: { vacancy: { select: { city: true } }, company: { select: { city: true } } } } },
    take: LIST_MAX,
  });
  const items = rows
    .map((a) => ({
      client: person(a.client),
      at: (a.arrivalTime ?? a.flightDate)!,
      city: tvText(a.case.vacancy?.city ?? a.case.company?.city ?? a.housingCity ?? null, 40),
      arrived: a.status === 'COMPLETED',
    }))
    .sort((x, y) => x.at.getTime() - y.at.getTime());
  return { count: items.length, items };
};

export interface TvPayload {
  generatedAt: Date;
  timezone: 'Asia/Baku';
  day: string;
  month: string;
  week: { start: Date; end: Date };
  settings: TvSettings;
  panels: Partial<{
    agenda: Awaited<ReturnType<typeof agenda>>;
    inquiries: Awaited<ReturnType<typeof inquiries>>;
    waiting: Awaited<ReturnType<typeof waiting>>;
    approved: Awaited<ReturnType<typeof approved>>;
    arrivals: Awaited<ReturnType<typeof arrivals>>;
    leaderboard: Awaited<ReturnType<typeof buildLeaderboard>>;
  }>;
}

export const buildTvPayload = async (now = new Date()): Promise<TvPayload> => {
  const settings = await getTvSettings();
  const day = bakuDayWindow(now);
  const week = bakuWeekWindow(now);
  const month = bakuMonthWindow(now);
  const want = new Set<TvPanel>(settings.panels);
  const [a, i, w, ap, ar, lb] = await Promise.all([
    want.has('agenda') ? agenda(day.start, day.end) : undefined,
    want.has('inquiries') ? inquiries(day.start, day.end) : undefined,
    want.has('waiting') ? waiting(now) : undefined,
    want.has('approved') ? approved(month.start, month.end) : undefined,
    want.has('arrivals') ? arrivals(week.start, week.end) : undefined,
    want.has('leaderboard') ? buildLeaderboard(week, month) : undefined,
  ]);
  const panels: TvPayload['panels'] = {};
  if (a) panels.agenda = a;
  if (i) panels.inquiries = i;
  if (w) panels.waiting = w;
  if (ap) panels.approved = ap;
  if (ar) panels.arrivals = ar;
  if (lb) panels.leaderboard = lb;
  return { generatedAt: now, timezone: 'Asia/Baku', day: day.key, month: month.key, week: { start: week.start, end: week.end }, settings, panels };
};
