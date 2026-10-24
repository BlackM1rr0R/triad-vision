import type { Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { computeProfitability } from '../profitability/compute.js';
import { getProfitSettings } from '../profitability/settings.js';
import {
  averageStages,
  deltas,
  emptyMetrics,
  firstResponses,
  mean,
  monthOf,
  monthRange,
  monthsEnding,
  round1,
  stageDurations,
  surveyScores,
  teamAverage,
  type KpiMetrics,
  type StageStatus,
} from './compute.js';

/**
 * Staff KPI (Admin → KPI, staff detail card, own card in the workspace): one consolidated view per staff
 * member and Baku month, computed from existing tables — cases, case events, case messages, field history
 * (assignment changes), surveys, profitability, time entries, tasks and four-eyes package approvals.
 *
 * Attribution: closed cases, case duration, time per stage and revenue / margin go to the CURRENT owner of
 * the case (the case keeps no owner history at close time); first replies go to whoever replied.
 */

export const STAFF_ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];
export const SPARK_MONTHS = 6;

const DAY = 24 * 60 * 60 * 1000;
const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

export interface KpiStaff {
  id: string;
  name: string;
  role: Role;
  isActive: boolean;
}

/** Metrics of every given staff member for every month in `months` (oldest first, consecutive). */
export const computeKpis = async (staffIds: string[], months: string[], now = new Date()) => {
  const out = new Map<string, Map<string, KpiMetrics>>();
  for (const id of staffIds) out.set(id, new Map(months.map((m) => [m, emptyMetrics()])));
  if (!staffIds.length || !months.length) return out;
  const from = monthRange(months[0]).start;
  const to = monthRange(months[months.length - 1]).end;
  const ids = new Set(staffIds);
  const cell = (staffId: string | null | undefined, at: Date | null | undefined) => (staffId && at && ids.has(staffId) ? out.get(staffId)!.get(monthOf(at)) : undefined);

  const [closed, created, assignments, reviews, messages, surveys, time, tasksDone, tasksDue, approvals] = await Promise.all([
    prisma.case.findMany({
      where: { assignedStaffId: { in: staffIds }, closedAt: { gte: from, lt: to } },
      select: { id: true, assignedStaffId: true, status: true, createdAt: true, decisionAt: true, closedAt: true },
    }),
    prisma.case.findMany({ where: { assignedStaffId: { in: staffIds }, createdAt: { gte: from, lt: to } }, select: { id: true, assignedStaffId: true, createdAt: true } }),
    prisma.fieldChange.findMany({ where: { entity: 'CASE', field: 'assignedStaffId', createdAt: { gte: from, lt: to }, revertedAt: null }, select: { entityId: true, newValue: true, createdAt: true } }),
    prisma.caseEvent.findMany({ where: { actorId: { in: staffIds }, type: { in: ['DOCUMENT_ACCEPTED', 'DOCUMENT_REJECTED'] }, createdAt: { gte: from, lt: to } }, select: { actorId: true, type: true, createdAt: true } }),
    // A month of history before the window, so a reply early in the first month finds its question.
    prisma.caseMessage.findMany({
      where: { createdAt: { gte: new Date(from.getTime() - 30 * DAY), lt: to } },
      select: { caseId: true, authorId: true, createdAt: true, case: { select: { clientId: true } } },
    }),
    prisma.satisfactionSurvey.findMany({ where: { staffId: { in: staffIds }, answeredAt: { gte: from, lt: to } }, select: { staffId: true, answeredAt: true, score: true, ratings: true } }),
    prisma.timeEntry.findMany({ where: { userId: { in: staffIds }, startedAt: { gte: from, lt: to }, endedAt: { not: null } }, select: { userId: true, startedAt: true, minutes: true } }),
    prisma.task.findMany({
      where: { status: 'DONE', completedAt: { gte: from, lt: to }, assignees: { some: { userId: { in: staffIds } } } },
      select: { completedAt: true, assignees: { select: { userId: true } } },
    }),
    // Overdue: the deadline fell in the month (and has passed) and the task was not done by then.
    prisma.task.findMany({
      where: { status: { not: 'CANCELLED' }, dueAt: { gte: from, lt: to < now ? to : now }, assignees: { some: { userId: { in: staffIds } } } },
      select: { dueAt: true, completedAt: true, assignees: { select: { userId: true } } },
    }),
    prisma.embassyPackageApproval.findMany({ where: { reviewerId: { in: staffIds }, status: { in: ['APPROVED', 'REJECTED'] }, reviewedAt: { gte: from, lt: to } }, select: { reviewerId: true, reviewedAt: true } }),
  ]);

  // Closed cases: split, duration, time per stage.
  const closedIds = closed.map((c) => c.id);
  const statusEvents = closedIds.length
    ? await prisma.caseEvent.findMany({ where: { caseId: { in: closedIds }, toStatus: { not: null } }, select: { caseId: true, createdAt: true, fromStatus: true, toStatus: true } })
    : [];
  const eventsByCase = new Map<string, typeof statusEvents>();
  for (const e of statusEvents) eventsByCase.set(e.caseId, [...(eventsByCase.get(e.caseId) ?? []), e]);
  const durations = new Map<KpiMetrics, number[]>();
  const stages = new Map<KpiMetrics, Partial<Record<StageStatus, number>>[]>();
  for (const c of closed) {
    const m = cell(c.assignedStaffId, c.closedAt);
    if (!m) continue;
    m.closed += 1;
    if (c.status === 'APPROVED') m.approved += 1;
    else if (c.status === 'REJECTED') m.rejected += 1;
    else m.cancelled += 1;
    if (c.status !== 'CANCELLED') {
      const end = c.decisionAt ?? c.closedAt!;
      durations.set(m, [...(durations.get(m) ?? []), Math.max(0, (end.getTime() - c.createdAt.getTime()) / DAY)]);
    }
    stages.set(m, [...(stages.get(m) ?? []), stageDurations(c.createdAt, eventsByCase.get(c.id) ?? [], c.closedAt)]);
  }
  for (const [m, xs] of durations) m.avgCaseDays = round1(mean(xs)!);
  for (const [m, xs] of stages) m.stageDays = averageStages(xs);

  // New cases: an assignment change to the person, or a case opened in the month they own (counted once).
  const seen = new Set<string>();
  for (const a of assignments) {
    const to = typeof a.newValue === 'string' ? a.newValue : null;
    const m = cell(to, a.createdAt);
    if (!m || seen.has(`${to}:${a.entityId}:${monthOf(a.createdAt)}`)) continue;
    seen.add(`${to}:${a.entityId}:${monthOf(a.createdAt)}`);
    m.assigned += 1;
  }
  for (const c of created) {
    const key = `${c.assignedStaffId}:${c.id}:${monthOf(c.createdAt)}`;
    const m = cell(c.assignedStaffId, c.createdAt);
    if (!m || seen.has(key)) continue;
    seen.add(key);
    m.assigned += 1;
  }

  for (const r of reviews) {
    const m = cell(r.actorId, r.createdAt);
    if (!m) continue;
    m.docsReviewed += 1;
    if (r.type === 'DOCUMENT_ACCEPTED') m.docsAccepted += 1;
    else m.docsRejected += 1;
  }

  const replies = new Map<KpiMetrics, number[]>();
  for (const r of firstResponses(messages.map((x) => ({ caseId: x.caseId, authorId: x.authorId, clientId: x.case.clientId, createdAt: x.createdAt })))) {
    if (r.at < from) continue;
    const m = cell(r.responderId, r.at);
    if (m) replies.set(m, [...(replies.get(m) ?? []), r.hours]);
  }
  for (const [m, xs] of replies) {
    m.responses = xs.length;
    m.avgFirstResponseHours = round1(mean(xs)!);
  }

  const answered = new Map<KpiMetrics, typeof surveys>();
  for (const s of surveys) {
    const m = cell(s.staffId, s.answeredAt);
    if (m) answered.set(m, [...(answered.get(m) ?? []), s]);
  }
  for (const [m, rows] of answered) Object.assign(m, surveyScores(rows));

  for (const e of time) {
    const m = cell(e.userId, e.startedAt);
    if (m) m.minutes += e.minutes;
  }
  for (const t of tasksDone) for (const a of t.assignees) {
    const m = cell(a.userId, t.completedAt);
    if (m) m.tasksDone += 1;
  }
  for (const t of tasksDue) {
    if (t.completedAt && t.completedAt <= t.dueAt!) continue;
    for (const a of t.assignees) {
      const m = cell(a.userId, t.dueAt);
      if (m) m.tasksOverdue += 1;
    }
  }
  for (const a of approvals) {
    const m = cell(a.reviewerId, a.reviewedAt);
    if (m) m.approvalsGiven += 1;
  }

  // Revenue / margin of the closed cases (lifetime figures of each case, in the month it closed).
  if (closedIds.length) {
    const s = await getProfitSettings();
    const rows = await computeProfitability({ id: { in: closedIds } }, s);
    const closedAt = new Map(closed.map((c) => [c.id, c.closedAt]));
    for (const r of rows) {
      const m = cell(r.staffId, closedAt.get(r.caseId));
      if (!m) continue;
      m.revenueCents += r.revenue.total;
      m.marginCents += r.marginCents;
    }
  }
  return out;
};

const staffList = async (ids?: string[]): Promise<KpiStaff[]> =>
  (
    await prisma.user.findMany({
      where: { role: { in: STAFF_ROLES }, ...(ids ? { id: { in: ids } } : { isActive: true }) },
      select: { id: true, firstName: true, lastName: true, role: true, isActive: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    })
  ).map((u) => ({ id: u.id, name: fullName(u), role: u.role, isActive: u.isActive }));

const currentMonth = (now: Date) => monthOf(now);

/** One person's card: the month, the previous month, a 6-month series and the team average for context. */
export const staffKpiCard = async (staffId: string, month?: string, now = new Date()) => {
  const [person] = await staffList([staffId]);
  if (!person) return null;
  const last = month ?? currentMonth(now);
  const months = monthsEnding(last, SPARK_MONTHS);
  const team = await staffList();
  const ids = [...new Set([staffId, ...team.map((t) => t.id)])];
  const all = await computeKpis(ids, months, now);
  const mine = all.get(staffId)!;
  const current = mine.get(last)!;
  const previous = mine.get(months[months.length - 2])!;
  return {
    staff: person,
    month: last,
    months,
    current,
    previous,
    deltas: deltas(current, previous),
    series: months.map((m) => ({ month: m, ...mine.get(m)! })),
    team: { size: team.length, average: teamAverage(team.map((t) => all.get(t.id)!.get(last)!)) },
  };
};

/** Every active staff member for the leaderboard (with their own 6-month series for sparklines). */
export const teamKpis = async (month?: string, now = new Date()) => {
  const last = month ?? currentMonth(now);
  const months = monthsEnding(last, SPARK_MONTHS);
  const team = await staffList();
  const all = await computeKpis(team.map((t) => t.id), months, now);
  const rows = team.map((t) => {
    const series = months.map((m) => all.get(t.id)!.get(m)!);
    const current = series[series.length - 1];
    const previous = series[series.length - 2];
    return { staff: t, current, previous, deltas: deltas(current, previous), series: months.map((m, i) => ({ month: m, ...series[i] })) };
  });
  return {
    month: last,
    months,
    rows,
    team: { size: team.length, average: teamAverage(rows.map((r) => r.current)), previous: teamAverage(rows.map((r) => r.previous)) },
  };
};

// ─── CSV ────────────────────────────────────────────────────────────────

/** Neutralises spreadsheet formulas (CSV injection) and quotes every cell. */
const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export const KPI_CSV_COLUMNS = [
  'staff', 'role', 'month', 'closed', 'approved', 'rejected', 'cancelled', 'assigned', 'avgCaseDays', 'docsReviewed', 'avgFirstResponseHours', 'responses',
  'csat', 'nps', 'surveys', 'revenueEur', 'marginEur', 'hours', 'tasksDone', 'tasksOverdue', 'approvalsGiven',
] as const;

export const kpiCsv = (data: Awaited<ReturnType<typeof teamKpis>>) => {
  const line = (name: string, role: string, month: string, m: KpiMetrics) =>
    [
      name, role, month, m.closed, m.approved, m.rejected, m.cancelled, m.assigned, m.avgCaseDays, m.docsReviewed, m.avgFirstResponseHours, m.responses,
      m.csat, m.nps, m.surveys, (m.revenueCents / 100).toFixed(2), (m.marginCents / 100).toFixed(2), round1(m.minutes / 60), m.tasksDone, m.tasksOverdue, m.approvalsGiven,
    ]
      .map(csvCell)
      .join(',');
  const lines = data.rows.map((r) => line(r.staff.name, r.staff.role, data.month, r.current));
  lines.push(line('Team average', '', data.month, data.team.average));
  return `﻿${[KPI_CSV_COLUMNS.join(','), ...lines].join('\r\n')}\r\n`;
};
