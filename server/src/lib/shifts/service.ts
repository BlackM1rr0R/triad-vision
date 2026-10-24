import type { Prisma, StaffShift } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound } from '../http.js';
import { STAFF_ROLES } from '../workspace/team.js';
import { SHIFT_KINDS, addDays, coverage, dayDate, dayKeyOf, daysBetween, isDayKey, normalizeCoverage, overlaps, weekStart, type CoverageConfig } from './coverage.js';

/**
 * Team calendar (workspace → Komanda → Növbələr, Admin → Növbələr): shifts, leave (approved + pending) and
 * active case handovers per person, with the coverage check. Everyone in the team sees the calendar; only
 * ADMIN+ changes shifts and the coverage rule (Setting `shiftCoverage`).
 */

export const COVERAGE_KEY = 'shiftCoverage';
/** Longest calendar range one request may load. */
export const MAX_RANGE_DAYS = 62;

const dayKey = z.string().refine(isDayKey, 'INVALID_DAY');
const minute = z.number().int().min(0).max(24 * 60);

export const shiftSchema = z
  .object({
    userId: z.string().min(1).max(40),
    date: dayKey,
    startMin: minute,
    endMin: minute,
    kind: z.enum(SHIFT_KINDS).default('OFFICE'),
    note: z.string().trim().max(300).nullable().optional(),
  })
  .refine((s) => s.endMin > s.startMin, { message: 'END_BEFORE_START', path: ['endMin'] });

export const shiftPatchSchema = z.object({
  date: dayKey.optional(),
  startMin: minute.optional(),
  endMin: minute.optional(),
  kind: z.enum(SHIFT_KINDS).optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

export const coverageSchema = z.object({
  requireOffice: z.boolean(),
  requireOnCall: z.boolean(),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7),
});

export const copyWeekSchema = z.object({
  /** Any day of the source week and of the target week (normalized to Mondays). */
  from: dayKey,
  to: dayKey,
  userIds: z.array(z.string().min(1).max(40)).max(200).optional(),
  /** Remove the target week's shifts of the same people first. */
  replace: z.boolean().optional(),
});

export const repeatSchema = z.object({
  /** Any day of the pattern week. */
  week: dayKey,
  weeks: z.number().int().min(1).max(12),
  userIds: z.array(z.string().min(1).max(40)).max(200).optional(),
  replace: z.boolean().optional(),
});

export const shiftView = (s: StaffShift) => ({
  id: s.id,
  userId: s.userId,
  date: dayKeyOf(s.date),
  startMin: s.startMin,
  endMin: s.endMin,
  kind: s.kind,
  note: s.note,
});
export type ShiftView = ReturnType<typeof shiftView>;

export const readCoverage = async (): Promise<CoverageConfig> => normalizeCoverage((await prisma.setting.findUnique({ where: { key: COVERAGE_KEY } }))?.value);

export const saveCoverage = async (cfg: CoverageConfig) => {
  const value = normalizeCoverage(cfg);
  await prisma.setting.upsert({ where: { key: COVERAGE_KEY }, create: { key: COVERAGE_KEY, value: value as unknown as Prisma.InputJsonValue }, update: { value: value as unknown as Prisma.InputJsonValue } });
  return value;
};

const assertStaff = async (userId: string) => {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
  if (!u || !STAFF_ROLES.includes(u.role)) throw badRequest('INVALID_STAFF');
};

/** Refuses a shift that overlaps another shift of the same person on that day. */
const assertNoOverlap = async (userId: string, date: string, startMin: number, endMin: number, exceptId?: string) => {
  const same = await prisma.staffShift.findMany({ where: { userId, date: dayDate(date), ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { startMin: true, endMin: true } });
  if (same.some((s) => overlaps(startMin, endMin, s.startMin, s.endMin))) throw conflict('SHIFT_OVERLAP');
};

export const createShift = async (input: z.infer<typeof shiftSchema>, actorId: string) => {
  await assertStaff(input.userId);
  await assertNoOverlap(input.userId, input.date, input.startMin, input.endMin);
  const row = await prisma.staffShift.create({
    data: { userId: input.userId, date: dayDate(input.date), startMin: input.startMin, endMin: input.endMin, kind: input.kind, note: input.note ?? null, createdById: actorId },
  });
  return shiftView(row);
};

export const updateShift = async (id: string, input: z.infer<typeof shiftPatchSchema>) => {
  const cur = await prisma.staffShift.findUnique({ where: { id } });
  if (!cur) throw notFound('SHIFT_NOT_FOUND');
  const next = { date: input.date ?? dayKeyOf(cur.date), startMin: input.startMin ?? cur.startMin, endMin: input.endMin ?? cur.endMin };
  if (next.endMin <= next.startMin) throw badRequest('END_BEFORE_START');
  await assertNoOverlap(cur.userId, next.date, next.startMin, next.endMin, cur.id);
  const row = await prisma.staffShift.update({
    where: { id },
    data: { date: dayDate(next.date), startMin: next.startMin, endMin: next.endMin, ...(input.kind ? { kind: input.kind } : {}), ...(input.note !== undefined ? { note: input.note } : {}) },
  });
  return shiftView(row);
};

export const deleteShift = async (id: string) => {
  const cur = await prisma.staffShift.findUnique({ where: { id } });
  if (!cur) throw notFound('SHIFT_NOT_FOUND');
  await prisma.staffShift.delete({ where: { id } });
  return shiftView(cur);
};

/**
 * Copies the shifts of the week containing `from` into the week containing `to` (same weekday, same times).
 * A copy that would overlap an existing shift of that person is skipped; `replace` clears the target first.
 */
export const copyWeek = async (input: { from: string; to: string; userIds?: string[]; replace?: boolean }, actorId: string) => {
  const src = weekStart(input.from);
  const dst = weekStart(input.to);
  if (src === dst) throw badRequest('SAME_WEEK');
  const offset = Math.round((dayDate(dst).getTime() - dayDate(src).getTime()) / (24 * 60 * 60 * 1000));
  const people = input.userIds?.length ? { userId: { in: input.userIds } } : {};
  const source = await prisma.staffShift.findMany({ where: { date: { gte: dayDate(src), lte: dayDate(addDays(src, 6)) }, ...people } });
  const range = { gte: dayDate(dst), lte: dayDate(addDays(dst, 6)) };
  if (input.replace) {
    const ids = [...new Set(source.map((s) => s.userId))];
    await prisma.staffShift.deleteMany({ where: { date: range, ...(input.userIds?.length ? people : { userId: { in: ids } }) } });
  }
  const existing = await prisma.staffShift.findMany({ where: { date: range, userId: { in: [...new Set(source.map((s) => s.userId))] } } });
  const taken = [...existing];
  let created = 0;
  let skipped = 0;
  for (const s of source) {
    const date = dayDate(addDays(dayKeyOf(s.date), offset));
    if (taken.some((e) => e.userId === s.userId && e.date.getTime() === date.getTime() && overlaps(s.startMin, s.endMin, e.startMin, e.endMin))) {
      skipped += 1;
      continue;
    }
    const row = await prisma.staffShift.create({ data: { userId: s.userId, date, startMin: s.startMin, endMin: s.endMin, kind: s.kind, note: s.note, createdById: actorId } });
    taken.push(row);
    created += 1;
  }
  return { created, skipped, from: src, to: dst };
};

/** Repeats the pattern week for the next `weeks` weeks. */
export const repeatWeek = async (input: { week: string; weeks: number; userIds?: string[]; replace?: boolean }, actorId: string) => {
  const src = weekStart(input.week);
  let created = 0;
  let skipped = 0;
  for (let i = 1; i <= input.weeks; i++) {
    const r = await copyWeek({ from: src, to: addDays(src, 7 * i), userIds: input.userIds, replace: input.replace }, actorId);
    created += r.created;
    skipped += r.skipped;
  }
  return { created, skipped };
};

/** Everything the calendar shows for [from, to]: people, shifts, leave, handovers, coverage per day. */
export const calendar = async (from: string, to: string) => {
  const days = daysBetween(from, to, MAX_RANGE_DAYS);
  if (!days.length) throw badRequest('INVALID_RANGE');
  const last = days[days.length - 1];
  const start = dayDate(from);
  const end = new Date(dayDate(last).getTime() + 24 * 60 * 60 * 1000 - 1);
  const [people, shifts, leave, handovers, cfg] = await Promise.all([
    prisma.user.findMany({ where: { role: { in: STAFF_ROLES }, isActive: true }, select: { id: true, firstName: true, lastName: true, role: true }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] }),
    prisma.staffShift.findMany({ where: { date: { gte: start, lte: dayDate(last) } }, orderBy: [{ date: 'asc' }, { startMin: 'asc' }] }),
    prisma.leaveRequest.findMany({
      where: { status: { in: ['APPROVED', 'PENDING'] }, startsAt: { lte: end }, endsAt: { gte: start } },
      select: { id: true, userId: true, type: true, status: true, startsAt: true, endsAt: true, note: true },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.caseHandover.findMany({
      where: { OR: [{ status: 'ACTIVE' }, { endedAt: { gte: start } }], startedAt: { lte: end } },
      select: { id: true, caseId: true, originalStaffId: true, substituteId: true, status: true, startedAt: true, plannedEndAt: true, endedAt: true, leaveId: true },
    }),
    readCoverage(),
  ]);
  const views = shifts.map(shiftView);
  // Handovers grouped per owner → substitute (one bar in the calendar instead of one per case).
  const groups = new Map<string, { originalStaffId: string; substituteId: string; cases: number; active: number; startedAt: Date; until: Date | null; leaveId: string | null }>();
  for (const h of handovers) {
    const key = `${h.originalStaffId}:${h.substituteId}:${h.leaveId ?? ''}`;
    const g = groups.get(key) ?? { originalStaffId: h.originalStaffId, substituteId: h.substituteId, cases: 0, active: 0, startedAt: h.startedAt, until: h.endedAt ?? h.plannedEndAt, leaveId: h.leaveId };
    g.cases += 1;
    if (h.status === 'ACTIVE') g.active += 1;
    if (h.startedAt < g.startedAt) g.startedAt = h.startedAt;
    const until = h.endedAt ?? h.plannedEndAt;
    if (until && (!g.until || until > g.until)) g.until = until;
    groups.set(key, g);
  }
  return {
    from,
    to: last,
    days,
    people,
    shifts: views,
    leave,
    handovers: [...groups.values()],
    coverage: coverage(
      days,
      views.map((s) => ({ userId: s.userId, day: s.date, kind: s.kind })),
      leave,
      cfg,
    ),
    config: cfg,
  };
};
