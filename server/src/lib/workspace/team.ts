import type { LeaveStatus, LeaveType, Prisma, Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { subscriberCount } from '../messaging/realtime.js';

/** Team directory: presence (who is online / away), status lines and leave requests. */

export const STAFF_ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];
export const LEAVE_TYPES = ['VACATION', 'SICK', 'REMOTE', 'OTHER'] as const;
export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

const DAY = 24 * 60 * 60 * 1000;

export const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

export const staffIds = async (except?: string) =>
  (await prisma.user.findMany({ where: { role: { in: STAFF_ROLES }, isActive: true, ...(except ? { id: { not: except } } : {}) }, select: { id: true } })).map((u) => u.id);

export const adminIds = async (except?: string) =>
  (await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true, ...(except ? { id: { not: except } } : {}) }, select: { id: true } })).map((u) => u.id);

// ─── Presence ──────────────────────────────────────────────────────────

export interface PresenceRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  online: boolean;
  lastSeenAt: Date | null;
  statusText: string | null;
  statusEmoji: string | null;
  statusUntil: Date | null;
  onLeave: { id: string; type: LeaveType; until: Date } | null;
}

/** Every active staff member with live presence (SSE subscribers), last request time, status and current leave. */
export const presenceList = async (now = new Date()): Promise<PresenceRow[]> => {
  const users = await prisma.user.findMany({
    where: { role: { in: STAFF_ROLES }, isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, statusText: true, statusEmoji: true, statusUntil: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  const ids = users.map((u) => u.id);
  const [seen, leave] = await Promise.all([
    prisma.session.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _max: { lastSeenAt: true } }),
    prisma.leaveRequest.findMany({
      where: { userId: { in: ids }, status: 'APPROVED', startsAt: { lte: now }, endsAt: { gte: now } },
      select: { id: true, userId: true, type: true, endsAt: true },
      orderBy: { endsAt: 'desc' },
    }),
  ]);
  const seenMap = new Map(seen.map((s) => [s.userId, s._max.lastSeenAt]));
  const leaveMap = new Map<string, { id: string; type: LeaveType; until: Date }>();
  for (const l of leave) if (!leaveMap.has(l.userId)) leaveMap.set(l.userId, { id: l.id, type: l.type, until: l.endsAt });
  return users.map((u) => {
    const expired = !!u.statusUntil && u.statusUntil.getTime() <= now.getTime();
    return {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      role: u.role,
      online: subscriberCount(u.id) > 0,
      lastSeenAt: seenMap.get(u.id) ?? null,
      statusText: expired ? null : u.statusText,
      statusEmoji: expired ? null : u.statusEmoji,
      statusUntil: expired ? null : u.statusUntil,
      onLeave: leaveMap.get(u.id) ?? null,
    };
  });
};

// ─── Leave ─────────────────────────────────────────────────────────────

/** "2026-05-01" → 00:00 UTC; full ISO datetimes pass through. */
export const parseLeaveDate = (s: string, end = false): Date | null => {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (day) {
    const d = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 0, 0, 0, 0));
    if (Number.isNaN(d.getTime())) return null;
    return end ? new Date(d.getTime() + DAY - 1) : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Weekdays (Mon–Fri, UTC calendar days) covered by a span, inclusive. */
export const weekdaysBetween = (startsAt: Date, endsAt: Date) => {
  let n = 0;
  const start = Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate());
  const end = Date.UTC(endsAt.getUTCFullYear(), endsAt.getUTCMonth(), endsAt.getUTCDate());
  for (let t = start; t <= end; t += DAY) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
};

/** Overlap with another pending/approved request of the same user. */
export const overlapWhere = (userId: string, startsAt: Date, endsAt: Date, excludeId?: string): Prisma.LeaveRequestWhereInput => ({
  userId,
  status: { in: ['PENDING', 'APPROVED'] },
  startsAt: { lte: endsAt },
  endsAt: { gte: startsAt },
  ...(excludeId ? { id: { not: excludeId } } : {}),
});

export const leaveSelect = {
  id: true,
  userId: true,
  user: { select: { id: true, firstName: true, lastName: true, role: true } },
  type: true,
  status: true,
  startsAt: true,
  endsAt: true,
  note: true,
  decidedById: true,
  decidedBy: { select: { id: true, firstName: true, lastName: true } },
  decidedAt: true,
  decisionNote: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LeaveRequestSelect;

export type LeaveRow = Prisma.LeaveRequestGetPayload<{ select: typeof leaveSelect }>;

export const toLeave = (l: LeaveRow) => ({ ...l, days: weekdaysBetween(l.startsAt, l.endsAt) });

export type LeaveOut = ReturnType<typeof toLeave>;

/** Days used this year per type (approved) and pending, as weekdays. */
export const leaveBalance = async (userId: string, now = new Date()) => {
  const year = now.getUTCFullYear();
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1) - 1);
  const rows = await prisma.leaveRequest.findMany({
    where: { userId, status: { in: ['APPROVED', 'PENDING'] }, startsAt: { lte: to }, endsAt: { gte: from } },
    select: { type: true, status: true, startsAt: true, endsAt: true },
  });
  const used: Record<LeaveType, number> = { VACATION: 0, SICK: 0, REMOTE: 0, OTHER: 0 };
  const pending: Record<LeaveType, number> = { VACATION: 0, SICK: 0, REMOTE: 0, OTHER: 0 };
  for (const r of rows) {
    // Clip to the year so a span over New Year only counts its days in this year.
    const s = r.startsAt < from ? from : r.startsAt;
    const e = r.endsAt > to ? to : r.endsAt;
    const n = weekdaysBetween(s, e);
    if (r.status === 'APPROVED') used[r.type] += n;
    else pending[r.type] += n;
  }
  return { year, used, pending };
};

export const isLeaveStatus = (s: string): s is LeaveStatus => (LEAVE_STATUSES as readonly string[]).includes(s);
