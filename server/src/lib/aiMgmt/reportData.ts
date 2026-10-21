import type { CaseStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { DAY_MS, bakuDay, weekDays } from './week.js';

/**
 * Deterministic numbers of the weekly management report — every figure is a DB query, nothing is estimated by
 * the AI. "cur" is the reported week [start, end), "prev" the week before it. Snapshots (open cases per status,
 * stuck cases, overdue tasks / invoices) are taken at generation time (`now`).
 */

export interface Pair {
  cur: number;
  prev: number;
}

/** Amounts in cents per currency. */
export type Money = Record<string, number>;

export interface StaffRow {
  id: string;
  name: string;
  role: string;
  openCases: number;
  casesHandled: number;
  decisions: number;
  messagesSent: number;
  /** Average hours from a client's message to the first reply by this person (null: no replies this week). */
  avgResponseHours: number | null;
  responses: number;
  /** Client messages of the week on this person's cases that nobody answered yet. */
  unanswered: number;
  overdueTasks: number;
  stuckCases: number;
  needsSupport: boolean;
  reasons: ('overdueTasks' | 'slowResponse' | 'unanswered' | 'stuckCases')[];
}

export interface ReportData {
  version: 1;
  weekStart: string;
  weekEnd: string;
  prevStart: string;
  generatedAt: string;
  metrics: {
    inquiries: Pair;
    registrations: Pair;
    casesCreated: Pair;
    approvals: Pair;
    rejections: Pair;
    bookingsHeld: Pair;
    bookingsNoShow: Pair;
    bookingsCancelled: Pair;
    invoicesSent: Pair;
    invoicesPaid: Pair;
    aiSpendUsd: Pair;
  };
  money: { invoicesSent: { cur: Money; prev: Money }; invoicesPaid: { cur: Money; prev: Money }; overdue: { count: number; amount: Money } };
  leadsBySource: { source: string; inquiries: number; registrations: number; bookings: number; total: number; prevTotal: number }[];
  inquiriesByKind: Record<string, Pair>;
  casesByStatus: Partial<Record<CaseStatus, number>>;
  stepDurations: { status: CaseStatus; avgDays: number; transitions: number }[];
  stuck: { days: number; count: number; items: { id: string; number: string; client: string; status: CaseStatus; staff: string | null; idleDays: number }[] };
  overdueTasks: { total: number; perStaff: { staffId: string | null; name: string; count: number }[] };
  staff: StaffRow[];
  mailTriage: { cur: number; prev: number; byCategory: Record<string, number> } | null;
}

/** Thresholds behind the factual "needs support" note of the staff table. */
export const SUPPORT_LIMITS = { overdueTasks: 3, slowResponseHours: 48, unanswered: 3, stuckCases: 3 } as const;

const STAFF_ROLES = ['STAFF', 'ADMIN', 'SUPER_ADMIN'] as const;
const OPEN_TASK = { notIn: ['DONE', 'CANCELLED'] as ('DONE' | 'CANCELLED')[] };
const name = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '—');
const round1 = (n: number) => Math.round(n * 10) / 10;
const pair = (cur: number, prev: number): Pair => ({ cur, prev });

const sumMoney = (rows: { currency: string; grossCents: number }[]) => {
  const m: Money = {};
  for (const r of rows) m[r.currency] = (m[r.currency] ?? 0) + r.grossCents;
  return m;
};

const aiSpend = async (from: Date, to: Date) => {
  const r = await prisma.aiMessage.aggregate({ _sum: { costMicros: true }, where: { createdAt: { gte: from, lt: to } } });
  return Math.round(((r._sum.costMicros ?? 0) / 1e6) * 100) / 100;
};

/** Mail triage counts when that feature's table exists in this build (looked up at runtime, no import). */
const mailTriageCounts = async (cur: { gte: Date; lt: Date }, prev: { gte: Date; lt: Date }) => {
  const delegate = (prisma as unknown as Record<string, unknown>).mailTriage as
    | { count?: (a: unknown) => Promise<number>; groupBy?: (a: unknown) => Promise<{ category: string | null; _count: { _all: number } }[]> }
    | undefined;
  if (!delegate || typeof delegate.count !== 'function') return null;
  try {
    const [c, p] = await Promise.all([delegate.count({ where: { createdAt: cur } }), delegate.count({ where: { createdAt: prev } })]);
    const byCategory: Record<string, number> = {};
    if (typeof delegate.groupBy === 'function') {
      try {
        for (const g of await delegate.groupBy({ by: ['category'], where: { createdAt: cur }, _count: { _all: true } })) byCategory[g.category ?? 'NONE'] = g._count._all;
      } catch {
        /* column differs: totals only */
      }
    }
    return { cur: c, prev: p, byCategory };
  } catch {
    return null;
  }
};

/** Average time spent in each status, from the status changes that happened in the week. */
const stepDurations = async (start: Date, end: Date) => {
  const moves = await prisma.caseEvent.findMany({
    where: { createdAt: { gte: start, lt: end }, fromStatus: { not: null }, toStatus: { not: null } },
    select: { caseId: true, fromStatus: true, createdAt: true },
    take: 5000,
  });
  if (!moves.length) return [];
  const caseIds = [...new Set(moves.map((m) => m.caseId))];
  const history = await prisma.caseEvent.findMany({
    where: { caseId: { in: caseIds }, toStatus: { not: null }, createdAt: { lt: end } },
    select: { caseId: true, toStatus: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const created = new Map((await prisma.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, createdAt: true } })).map((c) => [c.id, c.createdAt]));
  const byCase = new Map<string, { toStatus: CaseStatus; createdAt: Date }[]>();
  for (const h of history) {
    const list = byCase.get(h.caseId) ?? [];
    list.push({ toStatus: h.toStatus!, createdAt: h.createdAt });
    byCase.set(h.caseId, list);
  }
  const acc = new Map<CaseStatus, number[]>();
  for (const m of moves) {
    // When did the case enter the status it just left? The latest earlier event that moved it there.
    const entered = (byCase.get(m.caseId) ?? []).filter((h) => h.toStatus === m.fromStatus && h.createdAt < m.createdAt).at(-1)?.createdAt ?? created.get(m.caseId);
    if (!entered) continue;
    const list = acc.get(m.fromStatus!) ?? [];
    list.push((m.createdAt.getTime() - entered.getTime()) / DAY_MS);
    acc.set(m.fromStatus!, list);
  }
  return [...acc.entries()]
    .map(([status, xs]) => ({ status, avgDays: round1(xs.reduce((a, b) => a + b, 0) / xs.length), transitions: xs.length }))
    .sort((a, b) => b.avgDays - a.avgDays);
};

/** Response times: first client message of a burst → first later message by someone else on that case. */
const responseStats = async (start: Date, end: Date, now: Date) => {
  const msgs = await prisma.caseMessage.findMany({
    where: { createdAt: { gte: new Date(start.getTime() - 7 * DAY_MS), lt: now } },
    select: { caseId: true, authorId: true, createdAt: true, case: { select: { clientId: true, assignedStaffId: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 20_000,
  });
  const byCase = new Map<string, typeof msgs>();
  for (const m of msgs) {
    const list = byCase.get(m.caseId) ?? [];
    list.push(m);
    byCase.set(m.caseId, list);
  }
  const hours = new Map<string, number[]>();
  const unanswered = new Map<string, number>();
  const sent = new Map<string, number>();
  for (const list of byCase.values()) {
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const fromClient = m.authorId === m.case.clientId;
      if (!fromClient && m.createdAt >= start && m.createdAt < end) sent.set(m.authorId, (sent.get(m.authorId) ?? 0) + 1);
      if (!fromClient || m.createdAt < start || m.createdAt >= end) continue;
      if (i > 0 && list[i - 1].authorId === m.case.clientId) continue; // same burst: counted from its first message
      const reply = list.slice(i + 1).find((r) => r.authorId !== m.case.clientId);
      if (reply) {
        const h = hours.get(reply.authorId) ?? [];
        h.push((reply.createdAt.getTime() - m.createdAt.getTime()) / 3_600_000);
        hours.set(reply.authorId, h);
      } else if (m.case.assignedStaffId) unanswered.set(m.case.assignedStaffId, (unanswered.get(m.case.assignedStaffId) ?? 0) + 1);
    }
  }
  return { hours, unanswered, sent };
};

export const buildReportData = async (opts: { start: Date; end: Date; now: Date; stuckDays: number }): Promise<ReportData> => {
  const { start, end, now, stuckDays } = opts;
  const prevStart = new Date(start.getTime() - 7 * DAY_MS);
  const cur = { gte: start, lt: end };
  const prev = { gte: prevStart, lt: start };
  const stuckCutoff = new Date(now.getTime() - stuckDays * DAY_MS);
  // AnalyticsDaily is keyed by calendar day: take the seven Baku dates of each week.
  const curDays = weekDays(start).map((d) => new Date(`${d}T00:00:00Z`));
  const prevDays = weekDays(prevStart).map((d) => new Date(`${d}T00:00:00Z`));

  const count2 = async (fn: (range: { gte: Date; lt: Date }) => Promise<number>) => pair(await fn(cur), await fn(prev));
  const bookings = async (range: { gte: Date; lt: Date }) => {
    const rows = await prisma.booking.findMany({ where: { slot: { startsAt: range } }, select: { status: true, slot: { select: { startsAt: true } } } });
    return {
      held: rows.filter((b) => b.status === 'DONE' || (b.status === 'BOOKED' && b.slot.startsAt < now)).length,
      noShow: rows.filter((b) => b.status === 'NO_SHOW').length,
      cancelled: rows.filter((b) => b.status === 'CANCELLED').length,
    };
  };

  const [
    inquiries,
    registrations,
    casesCreated,
    approvals,
    rejections,
    bookCur,
    bookPrev,
    sentCur,
    sentPrev,
    paidCur,
    paidPrev,
    overdueInv,
    aiCur,
    aiPrev,
    sources,
    prevSources,
    kindCur,
    kindPrev,
    byStatus,
    steps,
    stuckRows,
    stuckCount,
    tasks,
    staffUsers,
    events,
    decisions,
    openAssigned,
    responses,
    mailTriage,
  ] = await Promise.all([
    count2((r) => prisma.inquiry.count({ where: { createdAt: r } })),
    count2((r) => prisma.user.count({ where: { role: 'CLIENT', createdAt: r } })),
    count2((r) => prisma.case.count({ where: { createdAt: r, parentCaseId: null } })),
    count2((r) => prisma.case.count({ where: { status: 'APPROVED', decisionAt: r } })),
    count2((r) => prisma.case.count({ where: { status: 'REJECTED', decisionAt: r } })),
    bookings(cur),
    bookings(prev),
    prisma.invoice.findMany({ where: { sentAt: cur }, select: { currency: true, grossCents: true } }),
    prisma.invoice.findMany({ where: { sentAt: prev }, select: { currency: true, grossCents: true } }),
    prisma.invoice.findMany({ where: { paidAt: cur }, select: { currency: true, grossCents: true } }),
    prisma.invoice.findMany({ where: { paidAt: prev }, select: { currency: true, grossCents: true } }),
    prisma.invoice.findMany({ where: { OR: [{ status: 'OVERDUE' }, { status: 'SENT', dueDate: { lt: now } }] }, select: { currency: true, grossCents: true } }),
    aiSpend(start, end),
    aiSpend(prevStart, start),
    prisma.analyticsDaily.groupBy({ by: ['source', 'metric'], where: { day: { in: curDays }, metric: { in: ['inquiry', 'register', 'booking'] } }, _sum: { count: true } }),
    prisma.analyticsDaily.groupBy({ by: ['source'], where: { day: { in: prevDays }, metric: { in: ['inquiry', 'register', 'booking'] } }, _sum: { count: true } }),
    prisma.inquiry.groupBy({ by: ['kind'], where: { createdAt: cur }, _count: { _all: true } }),
    prisma.inquiry.groupBy({ by: ['kind'], where: { createdAt: prev }, _count: { _all: true } }),
    prisma.case.groupBy({ by: ['status'], where: { status: { notIn: FINAL_STATUSES } }, _count: { _all: true } }),
    stepDurations(start, end),
    prisma.case.findMany({
      where: { status: { notIn: FINAL_STATUSES }, updatedAt: { lt: stuckCutoff }, events: { none: { createdAt: { gte: stuckCutoff } } }, messages: { none: { createdAt: { gte: stuckCutoff } } } },
      orderBy: { updatedAt: 'asc' },
      take: 25,
      select: { id: true, number: true, status: true, updatedAt: true, assignedStaffId: true, client: { select: { firstName: true, lastName: true } }, assignedStaff: { select: { firstName: true, lastName: true } } },
    }),
    prisma.case.findMany({
      where: { status: { notIn: FINAL_STATUSES }, updatedAt: { lt: stuckCutoff }, events: { none: { createdAt: { gte: stuckCutoff } } }, messages: { none: { createdAt: { gte: stuckCutoff } } } },
      select: { assignedStaffId: true },
    }),
    prisma.task.findMany({ where: { status: OPEN_TASK, dueAt: { lt: now } }, select: { id: true, assignees: { select: { userId: true } } } }),
    prisma.user.findMany({ where: { role: { in: [...STAFF_ROLES] }, isActive: true }, select: { id: true, firstName: true, lastName: true, role: true }, orderBy: { firstName: 'asc' } }),
    prisma.caseEvent.findMany({ where: { createdAt: cur, actorId: { not: null } }, select: { actorId: true, caseId: true }, take: 50_000 }),
    prisma.caseEvent.groupBy({ by: ['actorId'], where: { createdAt: cur, toStatus: { in: ['APPROVED', 'REJECTED'] }, actorId: { not: null } }, _count: { _all: true } }),
    prisma.case.groupBy({ by: ['assignedStaffId'], where: { assignedStaffId: { not: null }, status: { notIn: FINAL_STATUSES } }, _count: { _all: true } }),
    responseStats(start, end, now),
    mailTriageCounts(cur, prev),
  ]);

  // Leads by source (site analytics): this week per metric, plus last week's total for the trend.
  const srcMap = new Map<string, { inquiries: number; registrations: number; bookings: number }>();
  for (const s of sources) {
    const key = s.source || 'direct';
    const row = srcMap.get(key) ?? { inquiries: 0, registrations: 0, bookings: 0 };
    const n = s._sum.count ?? 0;
    if (s.metric === 'inquiry') row.inquiries += n;
    else if (s.metric === 'register') row.registrations += n;
    else row.bookings += n;
    srcMap.set(key, row);
  }
  const prevSrc = new Map<string, number>();
  for (const s of prevSources) prevSrc.set(s.source || 'direct', (prevSrc.get(s.source || 'direct') ?? 0) + (s._sum.count ?? 0));
  const leadsBySource = [...new Set([...srcMap.keys(), ...prevSrc.keys()])]
    .map((source) => {
      const r = srcMap.get(source) ?? { inquiries: 0, registrations: 0, bookings: 0 };
      return { source, ...r, total: r.inquiries + r.registrations + r.bookings, prevTotal: prevSrc.get(source) ?? 0 };
    })
    .sort((a, b) => b.total - a.total || b.prevTotal - a.prevTotal)
    .slice(0, 12);

  const inquiriesByKind: Record<string, Pair> = {};
  for (const k of kindCur) inquiriesByKind[k.kind] = pair(k._count._all, 0);
  for (const k of kindPrev) inquiriesByKind[k.kind] = pair(inquiriesByKind[k.kind]?.cur ?? 0, k._count._all);

  // Overdue tasks per assignee (a task with several assignees counts for each; unassigned ones separately).
  const overdueBy = new Map<string | null, number>();
  for (const t of tasks) {
    if (!t.assignees.length) overdueBy.set(null, (overdueBy.get(null) ?? 0) + 1);
    for (const a of t.assignees) overdueBy.set(a.userId, (overdueBy.get(a.userId) ?? 0) + 1);
  }
  const staffName = new Map(staffUsers.map((u) => [u.id, name(u)]));
  const overduePerStaff = [...overdueBy.entries()].map(([staffId, count]) => ({ staffId, name: staffId ? (staffName.get(staffId) ?? '—') : '', count })).sort((a, b) => b.count - a.count);

  const handled = new Map<string, Set<string>>();
  for (const e of events) {
    const set = handled.get(e.actorId!) ?? new Set<string>();
    set.add(e.caseId);
    handled.set(e.actorId!, set);
  }
  const decided = new Map(decisions.map((d) => [d.actorId!, d._count._all]));
  const open = new Map(openAssigned.map((o) => [o.assignedStaffId!, o._count._all]));
  const stuckBy = new Map<string, number>();
  for (const s of stuckCount) if (s.assignedStaffId) stuckBy.set(s.assignedStaffId, (stuckBy.get(s.assignedStaffId) ?? 0) + 1);

  const staff: StaffRow[] = staffUsers.map((u) => {
    const hrs = responses.hours.get(u.id) ?? [];
    const avgResponseHours = hrs.length ? round1(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
    const row = {
      id: u.id,
      name: name(u),
      role: u.role,
      openCases: open.get(u.id) ?? 0,
      casesHandled: handled.get(u.id)?.size ?? 0,
      decisions: decided.get(u.id) ?? 0,
      messagesSent: responses.sent.get(u.id) ?? 0,
      avgResponseHours,
      responses: hrs.length,
      unanswered: responses.unanswered.get(u.id) ?? 0,
      overdueTasks: overdueBy.get(u.id) ?? 0,
      stuckCases: stuckBy.get(u.id) ?? 0,
    };
    const reasons: StaffRow['reasons'] = [];
    if (row.overdueTasks >= SUPPORT_LIMITS.overdueTasks) reasons.push('overdueTasks');
    if (avgResponseHours !== null && avgResponseHours > SUPPORT_LIMITS.slowResponseHours) reasons.push('slowResponse');
    if (row.unanswered >= SUPPORT_LIMITS.unanswered) reasons.push('unanswered');
    if (row.stuckCases >= SUPPORT_LIMITS.stuckCases) reasons.push('stuckCases');
    return { ...row, needsSupport: reasons.length > 0, reasons };
  });

  return {
    version: 1,
    weekStart: start.toISOString(),
    weekEnd: end.toISOString(),
    prevStart: prevStart.toISOString(),
    generatedAt: now.toISOString(),
    metrics: {
      inquiries,
      registrations,
      casesCreated,
      approvals,
      rejections,
      bookingsHeld: pair(bookCur.held, bookPrev.held),
      bookingsNoShow: pair(bookCur.noShow, bookPrev.noShow),
      bookingsCancelled: pair(bookCur.cancelled, bookPrev.cancelled),
      invoicesSent: pair(sentCur.length, sentPrev.length),
      invoicesPaid: pair(paidCur.length, paidPrev.length),
      aiSpendUsd: pair(aiCur, aiPrev),
    },
    money: {
      invoicesSent: { cur: sumMoney(sentCur), prev: sumMoney(sentPrev) },
      invoicesPaid: { cur: sumMoney(paidCur), prev: sumMoney(paidPrev) },
      overdue: { count: overdueInv.length, amount: sumMoney(overdueInv) },
    },
    leadsBySource,
    inquiriesByKind,
    casesByStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
    stepDurations: steps,
    stuck: {
      days: stuckDays,
      count: stuckCount.length,
      items: stuckRows.map((c) => ({
        id: c.id,
        number: c.number,
        client: name(c.client),
        status: c.status,
        staff: c.assignedStaff ? name(c.assignedStaff) : null,
        idleDays: Math.floor((now.getTime() - c.updatedAt.getTime()) / DAY_MS),
      })),
    },
    overdueTasks: { total: tasks.length, perStaff: overduePerStaff },
    staff,
    mailTriage,
  };
};

/** Short label of the reported week, e.g. "13.10 – 19.10.2026". */
export const weekLabel = (d: Pick<ReportData, 'weekStart' | 'weekEnd'>) => {
  const a = bakuDay(new Date(d.weekStart));
  const b = bakuDay(new Date(new Date(d.weekEnd).getTime() - 1));
  return `${a.slice(8, 10)}.${a.slice(5, 7)} – ${b.slice(8, 10)}.${b.slice(5, 7)}.${b.slice(0, 4)}`;
};
