import type { Role } from '@prisma/client';
import { prisma } from '../db.js';
import { FINAL_STATUSES } from './caseFlow.js';
import { absences, ineligibility, readAssignmentConfig, readPrefs, staffLoads, targetOfCase, type IneligibleReason } from './assignment/index.js';
import { OPEN_STATUSES as TASK_OPEN } from './tasks/core.js';

/**
 * Team workload board (Admin → Komanda → Yüklənmə, routes/admin/workload.ts): per active staff member the open cases,
 * overdue items (team tasks and client to-dos past their deadline), open tasks, client messages waiting for an answer,
 * this week's appointments (embassy, interviews, consultations, arrivals) and a capacity indicator against the
 * personal "max open cases" preference (Automation → Assignment) or a default. The suggestion for an assignment uses
 * the auto-assignment rules (lib/assignment): eligible staff by weighted load.
 */

const DAY = 24 * 60 * 60 * 1000;
const BAKU_OFFSET = 4 * 60 * 60 * 1000;
/** Capacity when a staff member has no "max open cases" preference. */
export const DEFAULT_CAPACITY = 25;

/** Monday 00:00 … next Monday 00:00 in Baku. */
export const bakuWeekRange = (now = new Date()) => {
  const local = new Date(now.getTime() + BAKU_OFFSET);
  const dow = (local.getUTCDay() + 6) % 7;
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow) - BAKU_OFFSET;
  return { from: new Date(start), to: new Date(start + 7 * DAY) };
};
const bakuWeekday = (now: Date) => ((new Date(now.getTime() + BAKU_OFFSET).getUTCDay() + 6) % 7) + 1;

export type CapacityLevel = 'low' | 'ok' | 'high' | 'over';
export const capacityLevel = (pct: number): CapacityLevel => (pct >= 100 ? 'over' : pct >= 80 ? 'high' : pct >= 40 ? 'ok' : 'low');

export interface WorkloadRow {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
  activeCases: number;
  weighted: number;
  overdue: number;
  overdueTasks: number;
  overdueClientTasks: number;
  openTasks: number;
  unanswered: number;
  appointments: number;
  appointmentsByType: { embassy: number; interview: number; consultation: number; arrival: number };
  capacity: number;
  capacityCustom: boolean;
  capacityPct: number;
  level: CapacityLevel;
  absentUntil: string | null;
}

const inc = (m: Map<string, number>, k: string | null | undefined, by = 1) => {
  if (k) m.set(k, (m.get(k) ?? 0) + by);
};

export const workloadBoard = async (opts: { role?: Role; now?: Date } = {}) => {
  const now = opts.now ?? new Date();
  const week = bakuWeekRange(now);
  const staff = await prisma.user.findMany({
    where: { isActive: true, role: opts.role ? opts.role : { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  const ids = staff.map((s) => s.id);
  if (!ids.length) return { rows: [] as WorkloadRow[], totals: totalsOf([]), unassigned: 0, week: { from: week.from.toISOString(), to: week.to.toISOString() } };
  const cfg = await readAssignmentConfig();
  const openCase = { status: { notIn: FINAL_STATUSES } };

  const [loads, prefs, absent, overdueTasks, openTasks, overdueClient, openCases, appts, interviews, bookings, arrivals, unassigned] = await Promise.all([
    staffLoads(cfg, prisma, { includeSuper: true }),
    readPrefs(ids),
    absences(now),
    prisma.taskAssignee.groupBy({ by: ['userId'], where: { userId: { in: ids }, task: { status: { in: TASK_OPEN }, dueAt: { lt: now } } }, _count: { _all: true } }),
    prisma.taskAssignee.groupBy({ by: ['userId'], where: { userId: { in: ids }, task: { status: { in: TASK_OPEN } } }, _count: { _all: true } }),
    prisma.clientTask.findMany({ where: { status: 'OPEN', dueAt: { lt: now }, case: { ...openCase, assignedStaffId: { in: ids } } }, select: { case: { select: { assignedStaffId: true } } } }),
    // Last message per open case: a client message at the top = waiting for the team.
    prisma.case.findMany({
      where: { ...openCase, assignedStaffId: { in: ids } },
      select: { assignedStaffId: true, messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { author: { select: { role: true } } } } },
    }),
    prisma.case.findMany({ where: { assignedStaffId: { in: ids }, status: { not: 'CANCELLED' }, appointmentAt: { gte: week.from, lt: week.to } }, select: { assignedStaffId: true } }),
    prisma.interview.findMany({ where: { staffId: { in: ids }, status: { in: ['PROPOSED', 'CONFIRMED'] }, startsAt: { gte: week.from, lt: week.to } }, select: { staffId: true } }),
    prisma.booking.findMany({ where: { status: { in: ['BOOKED', 'DONE'] }, slot: { staffId: { in: ids }, startsAt: { gte: week.from, lt: week.to } } }, select: { slot: { select: { staffId: true } } } }),
    prisma.arrivalPlan.findMany({
      where: { status: { in: ['SUBMITTED', 'CONFIRMED', 'COMPLETED'] }, arrivalTime: { gte: week.from, lt: week.to } },
      select: { handledById: true, case: { select: { assignedStaffId: true } } },
    }),
    prisma.case.count({ where: { ...openCase, assignedStaffId: null } }),
  ]);

  const loadBy = new Map(loads.map((l) => [l.id, l]));
  const overdueTaskBy = new Map(overdueTasks.map((g) => [g.userId, g._count._all]));
  const openTaskBy = new Map(openTasks.map((g) => [g.userId, g._count._all]));
  const overdueClientBy = new Map<string, number>();
  for (const t of overdueClient) inc(overdueClientBy, t.case.assignedStaffId);
  const unansweredBy = new Map<string, number>();
  for (const c of openCases) if (c.messages[0]?.author.role === 'CLIENT') inc(unansweredBy, c.assignedStaffId);
  const embassyBy = new Map<string, number>();
  for (const c of appts) inc(embassyBy, c.assignedStaffId);
  const interviewBy = new Map<string, number>();
  for (const i of interviews) inc(interviewBy, i.staffId);
  const consultBy = new Map<string, number>();
  for (const b of bookings) inc(consultBy, b.slot.staffId);
  const arrivalBy = new Map<string, number>();
  for (const a of arrivals) inc(arrivalBy, a.handledById ?? a.case.assignedStaffId);

  const rows: WorkloadRow[] = staff.map((s) => {
    const p = prefs.get(s.id);
    const l = loadBy.get(s.id);
    const activeCases = l?.open ?? 0;
    const capacity = p?.maxOpenCases ?? DEFAULT_CAPACITY;
    const capacityPct = Math.round((activeCases / Math.max(1, capacity)) * 100);
    const appointmentsByType = { embassy: embassyBy.get(s.id) ?? 0, interview: interviewBy.get(s.id) ?? 0, consultation: consultBy.get(s.id) ?? 0, arrival: arrivalBy.get(s.id) ?? 0 };
    const ot = overdueTaskBy.get(s.id) ?? 0;
    const oc = overdueClientBy.get(s.id) ?? 0;
    return {
      ...s,
      activeCases,
      weighted: l?.weighted ?? 0,
      overdue: ot + oc,
      overdueTasks: ot,
      overdueClientTasks: oc,
      openTasks: openTaskBy.get(s.id) ?? 0,
      unanswered: unansweredBy.get(s.id) ?? 0,
      appointments: appointmentsByType.embassy + appointmentsByType.interview + appointmentsByType.consultation + appointmentsByType.arrival,
      appointmentsByType,
      capacity,
      capacityCustom: p?.maxOpenCases != null,
      capacityPct,
      level: capacityLevel(capacityPct),
      absentUntil: absent.get(s.id)?.endsAt.toISOString() ?? null,
    };
  });
  return { rows, totals: totalsOf(rows), unassigned, week: { from: week.from.toISOString(), to: week.to.toISOString() } };
};

export const totalsOf = (rows: WorkloadRow[]) => ({
  staff: rows.length,
  activeCases: rows.reduce((n, r) => n + r.activeCases, 0),
  overdue: rows.reduce((n, r) => n + r.overdue, 0),
  openTasks: rows.reduce((n, r) => n + r.openTasks, 0),
  unanswered: rows.reduce((n, r) => n + r.unanswered, 0),
  appointments: rows.reduce((n, r) => n + r.appointments, 0),
  overCapacity: rows.filter((r) => r.level === 'over').length,
});

export interface AssignSuggestion {
  id: string;
  firstName: string;
  lastName: string;
  open: number;
  weighted: number;
  capacityPct: number;
  eligible: boolean;
  reasons: IneligibleReason[];
}

/**
 * Staff ordered for assigning a case: eligible ones (language, visa type, leave, max open, working day — the
 * auto-assignment rules, pool ignored: a manual choice may pick anyone) by weighted load, then the rest.
 */
export const assignSuggestions = async (caseId: string | null, now = new Date()): Promise<{ suggested: AssignSuggestion | null; staff: AssignSuggestion[] }> => {
  const cfg = await readAssignmentConfig();
  const loads = await staffLoads(cfg, prisma, { includeSuper: true });
  const [prefs, absent, target] = await Promise.all([readPrefs(loads.map((l) => l.id)), absences(now), caseId ? targetOfCase(caseId) : Promise.resolve(null)]);
  const ctx = { absent: new Set(absent.keys()), weekday: bakuWeekday(now), usePool: false };
  const list = loads.map((s) => {
    const p = prefs.get(s.id)!;
    // AUTO_ASSIGN_OFF only stops the automation; someone may still be chosen by hand.
    const reasons = ineligibility(s, p, target ?? {}, cfg, ctx).filter((r) => r !== 'AUTO_ASSIGN_OFF');
    const capacity = p.maxOpenCases ?? DEFAULT_CAPACITY;
    return { id: s.id, firstName: s.firstName, lastName: s.lastName, open: s.open, weighted: s.weighted, capacityPct: Math.round((s.open / Math.max(1, capacity)) * 100), eligible: reasons.length === 0, reasons, lastAssignedAt: s.lastAssignedAt };
  });
  list.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.weighted - b.weighted || a.lastAssignedAt - b.lastAssignedAt);
  const staff = list.map(({ lastAssignedAt: _l, ...r }) => r);
  return { suggested: staff.find((s) => s.eligible) ?? null, staff };
};
