import type { Prisma, Role, TimeActivity } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { hasMinRole } from '../../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../http.js';
import { notifyUser } from '../notifications.js';
import { bakuDay, dateKey, dayRange } from '../reports/dates.js';
import { timerTexts } from './texts.js';

/**
 * Staff time tracking per case (Admin → Vaxt uçotu).
 *
 *  - Timer: at most ONE running timer per staff member (TimeEntry.runningKey = userId while running, unique in
 *    the database). Starting a new timer stops the running one first ("switch"). The timer lives in the
 *    database, so it survives page reloads and shows in the admin / workspace header.
 *  - Manual entries: a day, a duration, an activity and a note.
 *  - Idle protection: a timer running for 10 hours sends a "still working?" notification (once); at 12 hours
 *    it stops itself at start + 12 h with a note. The job does this every 10 minutes, and every read of the
 *    current timer does it too (so a missed job run never leaves a stale timer).
 *  - Privacy: STAFF see and change only their own entries; ADMIN+ see all. Hourly cost rates: SUPER_ADMIN only
 *    (see rates.ts).
 */

export const ACTIVITIES = ['DOCUMENTS', 'CLIENT_COMMUNICATION', 'EMPLOYER_COMMUNICATION', 'TRANSLATION', 'EMBASSY', 'OTHER'] as const satisfies readonly TimeActivity[];
export const IDLE_WARN_HOURS = 10;
export const AUTO_STOP_HOURS = 12;
/** Longest manual entry (one working day + overtime). */
export const MAX_MANUAL_MINUTES = 16 * 60;

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

export interface Viewer {
  id: string;
  role: Role;
  locale?: string;
}

export const isAdminViewer = (v: Viewer) => hasMinRole(v.role, 'ADMIN');

export const minutesBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / MIN));

const person = { select: { id: true, firstName: true, lastName: true } } as const;
export const entryInclude = {
  user: person,
  case: { select: { id: true, number: true, client: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.TimeEntryInclude;
type EntryRow = Prisma.TimeEntryGetPayload<{ include: typeof entryInclude }>;

const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);

export const entryView = (e: EntryRow, now = new Date()) => {
  const running = !e.endedAt;
  const elapsed = running ? minutesBetween(e.startedAt, now) : e.minutes;
  return {
    id: e.id,
    userId: e.userId,
    userName: fullName(e.user),
    caseId: e.caseId,
    caseNumber: e.case?.number ?? null,
    clientName: fullName(e.case?.client),
    taskId: e.taskId,
    activity: e.activity,
    note: e.note,
    source: e.source,
    startedAt: e.startedAt,
    endedAt: e.endedAt,
    minutes: elapsed,
    running,
    autoStopped: e.autoStopped,
    day: bakuDay(e.startedAt),
  };
};
export type EntryView = ReturnType<typeof entryView>;

const tasksTitle = async (ids: string[]) => {
  const rows = ids.length ? await prisma.task.findMany({ where: { id: { in: ids } }, select: { id: true, number: true, title: true } }) : [];
  return new Map(rows.map((t) => [t.id, { key: `T-${String(t.number).padStart(4, '0')}`, title: t.title }]));
};

/** Entry views with the linked task's key / title. */
export const withTasks = async (rows: EntryRow[], now = new Date()) => {
  const tasks = await tasksTitle([...new Set(rows.map((r) => r.taskId).filter((x): x is string => !!x))]);
  return rows.map((r) => ({ ...entryView(r, now), task: r.taskId ? (tasks.get(r.taskId) ?? null) : null }));
};

/** Resolves and checks the optional case / task link (a task's case is used when no case is given). */
const resolveLinks = async (caseId: string | null | undefined, taskId: string | null | undefined) => {
  let resolvedCase = caseId ?? null;
  if (taskId) {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, caseId: true } });
    if (!task) throw notFound('TASK_NOT_FOUND');
    resolvedCase ??= task.caseId;
  }
  if (resolvedCase && !(await prisma.case.findUnique({ where: { id: resolvedCase }, select: { id: true } }))) throw notFound('CASE_NOT_FOUND');
  return { caseId: resolvedCase, taskId: taskId ?? null };
};

// ─── Timer ─────────────────────────────────────────────────────────────

const appendNote = (note: string | null, extra: string) => (note ? `${note} · ${extra}` : extra).slice(0, 1000);

/**
 * Stops the running timer of `userId`. `auto`: the idle protection (ends at start + 12 h with a note).
 * A timer that is already older than 12 h is always capped at 12 h.
 */
export const stopRunning = async (userId: string, opts: { now?: Date; note?: string | null; activity?: TimeActivity; auto?: boolean } = {}) => {
  const now = opts.now ?? new Date();
  const run = await prisma.timeEntry.findUnique({ where: { runningKey: userId }, include: { user: { select: { locale: true } } } });
  if (!run) return null;
  const cap = new Date(run.startedAt.getTime() + AUTO_STOP_HOURS * HOUR);
  const auto = !!opts.auto || now >= cap;
  const end = auto ? (now < cap ? now : cap) : now;
  const note = opts.note !== undefined ? opts.note : run.note;
  // updateMany on runningKey: a concurrent stop of the same timer changes nothing the second time.
  const res = await prisma.timeEntry.updateMany({
    where: { id: run.id, runningKey: userId },
    data: {
      endedAt: end,
      minutes: minutesBetween(run.startedAt, end),
      runningKey: null,
      autoStopped: auto,
      note: auto ? appendNote(note ?? null, timerTexts(run.user.locale).stopNote) : (note ?? null),
      ...(opts.activity ? { activity: opts.activity } : {}),
    },
  });
  if (!res.count) return null;
  return prisma.timeEntry.findUniqueOrThrow({ where: { id: run.id }, include: entryInclude });
};

const notifyAutoStopped = (e: EntryRow & { user: { id: string } }, locale: string) => {
  const tx = timerTexts(locale as never);
  return notifyUser(e.userId, { type: 'TIMER_AUTO_STOPPED', title: tx.stopTitle, body: tx.stopBody({ number: e.case?.number ?? null, hours: AUTO_STOP_HOURS }), link: '/admin/time', email: false }).catch(() => undefined);
};

/** Applies the 12 h auto-stop to the user's running timer (on every read of the current timer). */
const autoStopIfStale = async (userId: string, now: Date) => {
  const run = await prisma.timeEntry.findUnique({ where: { runningKey: userId }, select: { startedAt: true, user: { select: { locale: true } } } });
  if (!run || now.getTime() - run.startedAt.getTime() < AUTO_STOP_HOURS * HOUR) return null;
  const stopped = await stopRunning(userId, { now, auto: true });
  if (stopped) await notifyAutoStopped(stopped, run.user.locale);
  return stopped;
};

export const currentTimer = async (userId: string, now = new Date()) => {
  const autoStopped = await autoStopIfStale(userId, now);
  const run = await prisma.timeEntry.findUnique({ where: { runningKey: userId }, include: entryInclude });
  if (!run) return { running: null, autoStopped: autoStopped ? entryView(autoStopped, now) : null };
  const [view] = await withTasks([run], now);
  const elapsedMs = now.getTime() - run.startedAt.getTime();
  return {
    running: { ...view, idleWarning: elapsedMs >= IDLE_WARN_HOURS * HOUR, autoStopAt: new Date(run.startedAt.getTime() + AUTO_STOP_HOURS * HOUR) },
    autoStopped: null,
  };
};

export const startSchema = z.object({
  caseId: z.string().trim().min(1).max(40).nullish(),
  taskId: z.string().trim().min(1).max(40).nullish(),
  activity: z.enum(ACTIVITIES).default('OTHER'),
  note: z.string().trim().max(1000).nullish(),
});

/** Starts a timer (stopping a running one first). Returns the new timer and the one that was stopped. */
export const startTimer = async (userId: string, input: z.infer<typeof startSchema>, now = new Date()) => {
  const links = await resolveLinks(input.caseId, input.taskId);
  await autoStopIfStale(userId, now);
  const stopped = await stopRunning(userId, { now });
  try {
    const entry = await prisma.timeEntry.create({
      data: { userId, ...links, activity: input.activity, note: input.note || null, source: 'TIMER', startedAt: now, runningKey: userId },
      include: entryInclude,
    });
    return { entry: entryView(entry, now), stopped: stopped ? entryView(stopped, now) : null };
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('TIMER_RUNNING');
    throw err;
  }
};

/** Every 10 minutes: "still working?" at 10 h (once per timer), auto-stop at 12 h. */
export const runTimerIdleCheck = async (now = new Date()) => {
  const rows = await prisma.timeEntry.findMany({
    where: { runningKey: { not: null }, startedAt: { lte: new Date(now.getTime() - IDLE_WARN_HOURS * HOUR) } },
    include: { ...entryInclude, user: { select: { id: true, firstName: true, lastName: true, locale: true } } },
  });
  let warned = 0;
  let stopped = 0;
  for (const r of rows) {
    const tx = timerTexts(r.user.locale);
    if (now.getTime() - r.startedAt.getTime() >= AUTO_STOP_HOURS * HOUR) {
      const s = await stopRunning(r.userId, { now, auto: true });
      if (s) {
        stopped++;
        await notifyAutoStopped(s, r.user.locale);
      }
    } else if (!r.idleWarnedAt) {
      const claimed = await prisma.timeEntry.updateMany({ where: { id: r.id, idleWarnedAt: null }, data: { idleWarnedAt: now } });
      if (!claimed.count) continue;
      warned++;
      await notifyUser(r.userId, {
        type: 'TIMER_IDLE',
        title: tx.idleTitle,
        body: tx.idleBody({ number: r.case?.number ?? null, hours: Math.floor((now.getTime() - r.startedAt.getTime()) / HOUR) }),
        link: r.caseId ? `/admin/cases/${r.caseId}` : '/admin/time',
        email: false,
      }).catch(() => undefined);
    }
  }
  return { warned, stopped };
};

// ─── Manual entries ───────────────────────────────────────────────────

const dayRe = /^\d{4}-\d{2}-\d{2}$/;

export const manualSchema = z.object({
  caseId: z.string().trim().min(1).max(40).nullish(),
  taskId: z.string().trim().min(1).max(40).nullish(),
  date: z.string().regex(dayRe),
  minutes: z.number().int().min(1).max(MAX_MANUAL_MINUTES),
  activity: z.enum(ACTIVITIES),
  note: z.string().trim().max(1000).nullish(),
});

export const patchSchema = z.object({
  caseId: z.string().trim().min(1).max(40).nullable().optional(),
  taskId: z.string().trim().min(1).max(40).nullable().optional(),
  date: z.string().regex(dayRe).optional(),
  minutes: z.number().int().min(1).max(MAX_MANUAL_MINUTES).optional(),
  activity: z.enum(ACTIVITIES).optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

/** A manual entry starts at 09:00 Baku time of its day. */
const manualStart = (date: string) => new Date(dayRange(date, date).start.getTime() + 9 * HOUR);

const assertNotFuture = (date: string, now: Date) => {
  if (date > bakuDay(now)) throw badRequest('DATE_IN_FUTURE');
};

export const createManual = async (userId: string, input: z.infer<typeof manualSchema>, now = new Date()) => {
  assertNotFuture(input.date, now);
  const links = await resolveLinks(input.caseId, input.taskId);
  const startedAt = manualStart(input.date);
  const e = await prisma.timeEntry.create({
    data: { userId, ...links, activity: input.activity, note: input.note || null, source: 'MANUAL', startedAt, endedAt: new Date(startedAt.getTime() + input.minutes * MIN), minutes: input.minutes },
    include: entryInclude,
  });
  return e;
};

/** Loads an entry the viewer may change: own entries, or any for ADMIN+. */
export const loadOwnEntry = async (viewer: Viewer, id: string) => {
  const e = await prisma.timeEntry.findUnique({ where: { id }, include: entryInclude });
  if (!e) throw notFound('TIME_ENTRY_NOT_FOUND');
  if (e.userId !== viewer.id && !isAdminViewer(viewer)) throw notFound('TIME_ENTRY_NOT_FOUND');
  return e;
};

export const updateEntry = async (viewer: Viewer, id: string, input: z.infer<typeof patchSchema>, now = new Date()) => {
  const e = await loadOwnEntry(viewer, id);
  const data: Prisma.TimeEntryUncheckedUpdateInput = {};
  if (input.caseId !== undefined || input.taskId !== undefined) {
    const links = await resolveLinks(input.caseId === undefined ? e.caseId : input.caseId, input.taskId === undefined ? e.taskId : input.taskId);
    Object.assign(data, links);
  }
  if (input.activity) data.activity = input.activity;
  if (input.note !== undefined) data.note = input.note || null;
  if (!e.endedAt) {
    // A running timer: only links, activity and note can change.
    if (input.date || input.minutes) throw badRequest('TIMER_RUNNING');
  } else if (input.date || input.minutes) {
    if (input.date) assertNotFuture(input.date, now);
    // Another day keeps the time of day (manual entries: 09:00).
    const dayStart = (d: string) => dayRange(d, d).start.getTime();
    const startedAt = input.date ? new Date(dayStart(input.date) + (e.startedAt.getTime() - dayStart(bakuDay(e.startedAt)))) : e.startedAt;
    const minutes = input.minutes ?? e.minutes;
    Object.assign(data, { startedAt, minutes, endedAt: new Date(startedAt.getTime() + minutes * MIN) });
  }
  const before = { caseId: e.caseId, taskId: e.taskId, activity: e.activity, minutes: e.minutes, day: bakuDay(e.startedAt), note: e.note };
  const updated = await prisma.timeEntry.update({ where: { id }, data, include: entryInclude });
  return { before, entry: updated };
};

export const deleteEntry = async (viewer: Viewer, id: string) => {
  const e = await loadOwnEntry(viewer, id);
  await prisma.timeEntry.delete({ where: { id } });
  return e;
};

// ─── Lists and reports ────────────────────────────────────────────────

export const listQuery = z.object({
  from: z.string().regex(dayRe).optional(),
  to: z.string().regex(dayRe).optional(),
  userId: z.string().max(40).optional(),
  caseId: z.string().max(40).optional(),
  taskId: z.string().max(40).optional(),
  activity: z.enum(ACTIVITIES).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

/** Visible entries: STAFF only their own (a requested userId of someone else is refused). */
export const entriesWhere = (viewer: Viewer, q: Omit<z.infer<typeof listQuery>, 'page'>): Prisma.TimeEntryWhereInput => {
  if (q.userId && q.userId !== viewer.id && !isAdminViewer(viewer)) throw forbidden();
  const userId = isAdminViewer(viewer) ? q.userId : viewer.id;
  const and: Prisma.TimeEntryWhereInput[] = [];
  if (userId) and.push({ userId });
  if (q.caseId) and.push({ caseId: q.caseId });
  if (q.taskId) and.push({ taskId: q.taskId });
  if (q.activity) and.push({ activity: q.activity });
  if (q.from || q.to) {
    const r = dayRange(q.from ?? '1970-01-01', q.to ?? '2999-12-31');
    and.push({ startedAt: { ...(q.from ? { gte: r.start } : {}), ...(q.to ? { lt: r.end } : {}) } });
  }
  return { AND: and };
};

const PAGE = 50;

export const listEntries = async (viewer: Viewer, q: z.infer<typeof listQuery>, now = new Date()) => {
  const where = entriesWhere(viewer, q);
  const [rows, total, sum] = await Promise.all([
    prisma.timeEntry.findMany({ where, include: entryInclude, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: PAGE, skip: (q.page - 1) * PAGE }),
    prisma.timeEntry.count({ where }),
    prisma.timeEntry.aggregate({ where: { AND: [where, { endedAt: { not: null } }] }, _sum: { minutes: true } }),
  ]);
  return { items: await withTasks(rows, now), total, page: q.page, pageSize: PAGE, totalMinutes: sum._sum.minutes ?? 0 };
};

/** Per staff per (ISO) week, per case and per activity — finished entries only. */
export const summarize = async (viewer: Viewer, q: Omit<z.infer<typeof listQuery>, 'page'>) => {
  const where: Prisma.TimeEntryWhereInput = { AND: [entriesWhere(viewer, q), { endedAt: { not: null } }] };
  const rows = await prisma.timeEntry.findMany({ where, include: entryInclude, orderBy: { startedAt: 'asc' }, take: 20_000 });
  const staff = new Map<string, { userId: string; name: string; minutes: number; weeks: Record<string, number> }>();
  const cases = new Map<string, { caseId: string | null; number: string | null; clientName: string | null; minutes: number; entries: number }>();
  const activities = Object.fromEntries(ACTIVITIES.map((a) => [a, 0])) as Record<TimeActivity, number>;
  const weeks = new Set<string>();
  let totalMinutes = 0;
  for (const r of rows) {
    totalMinutes += r.minutes;
    activities[r.activity] += r.minutes;
    const week = dateKey(r.startedAt, 'week');
    weeks.add(week);
    let s = staff.get(r.userId);
    if (!s) staff.set(r.userId, (s = { userId: r.userId, name: fullName(r.user) ?? '', minutes: 0, weeks: {} }));
    s.minutes += r.minutes;
    s.weeks[week] = (s.weeks[week] ?? 0) + r.minutes;
    const ck = r.caseId ?? '';
    let c = cases.get(ck);
    if (!c) cases.set(ck, (c = { caseId: r.caseId, number: r.case?.number ?? null, clientName: fullName(r.case?.client), minutes: 0, entries: 0 }));
    c.minutes += r.minutes;
    c.entries++;
  }
  return {
    totalMinutes,
    entries: rows.length,
    weeks: [...weeks].sort(),
    byStaff: [...staff.values()].sort((a, b) => b.minutes - a.minutes),
    byCase: [...cases.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 200),
    byActivity: ACTIVITIES.map((a) => ({ activity: a, minutes: activities[a] })),
  };
};

/** Case page: entries (STAFF: own only) and totals per activity / staff. */
export const caseTime = async (viewer: Viewer, caseId: string, now = new Date()) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const where = entriesWhere(viewer, { caseId });
  const rows = await prisma.timeEntry.findMany({ where, include: entryInclude, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: 200 });
  const done = rows.filter((r) => r.endedAt);
  const byActivity = ACTIVITIES.map((a) => ({ activity: a, minutes: done.filter((r) => r.activity === a).reduce((s, r) => s + r.minutes, 0) })).filter((x) => x.minutes);
  const staff = new Map<string, { userId: string; name: string; minutes: number }>();
  for (const r of done) {
    const s = staff.get(r.userId) ?? { userId: r.userId, name: fullName(r.user) ?? '', minutes: 0 };
    s.minutes += r.minutes;
    staff.set(r.userId, s);
  }
  return {
    scope: isAdminViewer(viewer) ? ('all' as const) : ('mine' as const),
    totalMinutes: done.reduce((s, r) => s + r.minutes, 0),
    byActivity,
    byStaff: [...staff.values()].sort((a, b) => b.minutes - a.minutes),
    entries: await withTasks(rows, now),
  };
};
