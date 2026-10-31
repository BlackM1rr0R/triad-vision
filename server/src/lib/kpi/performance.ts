import type { CaseStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { csvSafe } from '../csvSafe.js';
import { bakuMidnight } from '../reports/dates.js';
import { mean, round1 } from './compute.js';
import { computeKpiPeriod, STAFF_ROLES, type KpiStaff } from './service.js';

/**
 * Staff performance report (Admin → KPI → "Performance report", ADMIN+): one row per staff member over a free
 * period of Baku days. Reuses the monthly KPI computation (lib/kpi/service computeKpiPeriod: closed cases, tasks
 * done / missed deadlines, first reply to client messages, survey CSAT / NPS, documents reviewed, hours) and adds:
 *
 *   - inquiries: average hours from a new lead to the first staff action on it (status change, "take", notes,
 *     conversion; from the audit log), attributed to whoever acted first;
 *   - client reviews (Review, 1–5) submitted in the period, attributed to the case's current owner;
 *   - open backlog right now: open tasks past their deadline and cases waiting on the team longer than the SLA
 *     (the my-work "case waiting" rule: staff-turn status, no update for 72 h).
 *
 * The period is inclusive of both days; at most MAX_DAYS long.
 */

export const MAX_DAYS = 366;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Same SLA as lib/myWork (WAIT_SLA_HOURS) for "cases overdue". */
const CASE_SLA_HOURS = 72;
const STAFF_TURN: CaseStatus[] = ['DOCUMENTS_REVIEW', 'CONTRACT_SIGNED', 'EMBASSY_REVIEW'];
const INQUIRY_RESPONSE_ACTIONS = ['INQUIRY_STATUS_CHANGED', 'INQUIRY_ASSIGNED', 'INQUIRY_NOTES_UPDATED', 'INQUIRY_CONVERTED_CLIENT', 'INQUIRY_CONVERTED_COMPANY'];
const MAX_INQUIRIES = 5000;

/** A real calendar day "YYYY-MM-DD" (2026-02-30 is rejected). */
export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** [start, end) instants of the Baku days `from`..`to` (inclusive); null when invalid or too long. */
export const periodRange = (from: string, to: string) => {
  if (!isDay(from) || !isDay(to)) return null;
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const start = bakuMidnight(fy, fm - 1, fd);
  const end = bakuMidnight(ty, tm - 1, td + 1);
  if (end <= start || end.getTime() - start.getTime() > MAX_DAYS * DAY) return null;
  return { start, end };
};

export interface PerformanceRow {
  staff: KpiStaff;
  casesClosed: number;
  approved: number;
  rejected: number;
  casesAssigned: number;
  tasksDone: number;
  tasksMissed: number;
  openOverdueTasks: number;
  overdueCases: number;
  avgMessageReplyHours: number | null;
  messageReplies: number;
  avgInquiryResponseHours: number | null;
  inquiryResponses: number;
  csat: number | null;
  nps: number | null;
  surveys: number;
  reviewAvg: number | null;
  reviews: number;
  docsReviewed: number;
  hours: number;
}

type NumKey = Exclude<keyof PerformanceRow, 'staff'>;
const SUM_KEYS: NumKey[] = ['casesClosed', 'approved', 'rejected', 'casesAssigned', 'tasksDone', 'tasksMissed', 'openOverdueTasks', 'overdueCases', 'messageReplies', 'inquiryResponses', 'surveys', 'reviews', 'docsReviewed', 'hours'];

/** Inquiry first-response hours per staff member: the first qualifying staff action after the lead came in. */
const inquiryResponses = async (staffIds: Set<string>, start: Date, end: Date) => {
  const out = new Map<string, number[]>();
  const leads = await prisma.inquiry.findMany({ where: { createdAt: { gte: start, lt: end } }, select: { id: true, createdAt: true }, orderBy: { createdAt: 'asc' }, take: MAX_INQUIRIES });
  if (!leads.length) return out;
  const created = new Map(leads.map((l) => [l.id, l.createdAt]));
  // INQUIRY_STATUS_CHANGED stores the bare id as target, the others "inquiry:<id>".
  const targets = leads.flatMap((l) => [l.id, `inquiry:${l.id}`]);
  const logs = await prisma.auditLog.findMany({
    where: { action: { in: INQUIRY_RESPONSE_ACTIONS }, target: { in: targets }, actorId: { not: null }, createdAt: { gte: start } },
    select: { actorId: true, action: true, target: true, details: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const done = new Set<string>();
  for (const l of logs) {
    // Assigning a lead to someone else is triage, not a response; "take" (assign to myself) is.
    if (l.action === 'INQUIRY_ASSIGNED' && (l.details as { via?: string } | null)?.via !== 'take') continue;
    const id = l.target!.startsWith('inquiry:') ? l.target!.slice('inquiry:'.length) : l.target!;
    const at = created.get(id);
    if (!at || done.has(id) || l.createdAt < at) continue;
    done.add(id);
    if (!staffIds.has(l.actorId!)) continue;
    out.set(l.actorId!, [...(out.get(l.actorId!) ?? []), (l.createdAt.getTime() - at.getTime()) / HOUR]);
  }
  return out;
};

export const staffPerformance = async (from: string, to: string, now = new Date()) => {
  const range = periodRange(from, to);
  if (!range) return null;
  const { start, end } = range;
  const team = (
    await prisma.user.findMany({
      where: { role: { in: STAFF_ROLES }, isActive: true },
      select: { id: true, firstName: true, lastName: true, role: true, isActive: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    })
  ).map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), role: u.role, isActive: u.isActive }));
  const ids = team.map((t) => t.id);
  const idSet = new Set(ids);
  const openTaskWhere: Prisma.TaskWhereInput = { status: { notIn: ['DONE', 'CANCELLED'] }, dueAt: { lt: now } };

  const [kpis, inquiries, reviews, overdueTasks, overdueCases] = await Promise.all([
    computeKpiPeriod(ids, start, end, now),
    inquiryResponses(idSet, start, end),
    prisma.review.findMany({ where: { submittedAt: { gte: start, lt: end }, rating: { not: null } }, select: { rating: true, caseId: true } }),
    ids.length
      ? prisma.taskAssignee.findMany({ where: { userId: { in: ids }, task: openTaskWhere }, select: { userId: true } })
      : [],
    ids.length
      ? prisma.case.groupBy({ by: ['assignedStaffId'], where: { assignedStaffId: { in: ids }, status: { in: STAFF_TURN }, updatedAt: { lt: new Date(now.getTime() - CASE_SLA_HOURS * HOUR) } }, _count: { _all: true } })
      : [],
  ]);

  const reviewCases = reviews.length ? await prisma.case.findMany({ where: { id: { in: reviews.map((r) => r.caseId) } }, select: { id: true, assignedStaffId: true } }) : [];
  const ownerOf = new Map(reviewCases.map((c) => [c.id, c.assignedStaffId]));
  const ratings = new Map<string, number[]>();
  for (const r of reviews) {
    const owner = ownerOf.get(r.caseId);
    if (owner && idSet.has(owner)) ratings.set(owner, [...(ratings.get(owner) ?? []), r.rating!]);
  }
  const taskCount = new Map<string, number>();
  for (const a of overdueTasks) taskCount.set(a.userId, (taskCount.get(a.userId) ?? 0) + 1);
  const caseCount = new Map(overdueCases.map((g) => [g.assignedStaffId!, g._count._all]));

  const rows: PerformanceRow[] = team.map((staff) => {
    const k = kpis.get(staff.id)!;
    const inq = inquiries.get(staff.id) ?? [];
    const rev = ratings.get(staff.id) ?? [];
    const avg = (xs: number[]) => (xs.length ? round1(mean(xs)!) : null);
    return {
      staff,
      casesClosed: k.closed,
      approved: k.approved,
      rejected: k.rejected,
      casesAssigned: k.assigned,
      tasksDone: k.tasksDone,
      tasksMissed: k.tasksOverdue,
      openOverdueTasks: taskCount.get(staff.id) ?? 0,
      overdueCases: caseCount.get(staff.id) ?? 0,
      avgMessageReplyHours: k.avgFirstResponseHours,
      messageReplies: k.responses,
      avgInquiryResponseHours: avg(inq),
      inquiryResponses: inq.length,
      csat: k.csat,
      nps: k.nps,
      surveys: k.surveys,
      reviewAvg: avg(rev),
      reviews: rev.length,
      docsReviewed: k.docsReviewed,
      hours: round1(k.minutes / 60),
    };
  });

  // Team line: sums for counts, averages weighted by the number of observations for the averages.
  const total = Object.fromEntries(SUM_KEYS.map((key) => [key, round1(rows.reduce((n, r) => n + (r[key] as number), 0))])) as Record<NumKey, number | null>;
  const weighted = (val: NumKey, weight: NumKey) => {
    const w = rows.reduce((n, r) => n + (r[val] === null ? 0 : (r[weight] as number)), 0);
    return w ? round1(rows.reduce((n, r) => n + (r[val] === null ? 0 : (r[val] as number) * (r[weight] as number)), 0) / w) : null;
  };
  total.avgMessageReplyHours = weighted('avgMessageReplyHours', 'messageReplies');
  total.avgInquiryResponseHours = weighted('avgInquiryResponseHours', 'inquiryResponses');
  total.csat = weighted('csat', 'surveys');
  total.nps = weighted('nps', 'surveys');
  total.reviewAvg = weighted('reviewAvg', 'reviews');

  return { from, to, generatedAt: now.toISOString(), rows, team: { size: team.length, total } };
};

export type StaffPerformance = NonNullable<Awaited<ReturnType<typeof staffPerformance>>>;

// ─── CSV ────────────────────────────────────────────────────────────────

export const PERFORMANCE_CSV_COLUMNS: NumKey[] = [
  'casesClosed', 'approved', 'rejected', 'casesAssigned', 'tasksDone', 'tasksMissed', 'openOverdueTasks', 'overdueCases',
  'avgMessageReplyHours', 'messageReplies', 'avgInquiryResponseHours', 'inquiryResponses', 'csat', 'nps', 'surveys', 'reviewAvg', 'reviews', 'docsReviewed', 'hours',
];

const cell = (v: unknown) => `"${csvSafe(v === null || v === undefined ? '' : String(v)).replace(/"/g, '""')}"`;

export const performanceCsv = (data: StaffPerformance) => {
  const head = ['staff', 'role', 'from', 'to', ...PERFORMANCE_CSV_COLUMNS].join(',');
  const lines = data.rows.map((r) => [r.staff.name, r.staff.role, data.from, data.to, ...PERFORMANCE_CSV_COLUMNS.map((k) => r[k])].map(cell).join(','));
  lines.push(['Team', '', data.from, data.to, ...PERFORMANCE_CSV_COLUMNS.map((k) => data.team.total[k])].map(cell).join(','));
  return `﻿${[head, ...lines].join('\r\n')}\r\n`;
};
