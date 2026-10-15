import { Router, type Request } from 'express';
import { z } from 'zod';
import type { AttendeeStatus, Prisma } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireMinRole } from '../middleware/auth.js';
import { badRequest, forbidden, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { buildIcs } from '../lib/ics.js';
import {
  EVENT_COLORS,
  MAX_RANGE_MS,
  activeStaff,
  canManage,
  canSee,
  eventInclude,
  eventLink,
  freeBusy,
  fullName,
  isAttendee,
  notifyAttendees,
  notifyResponse,
  occurrencesOf,
  publishEvent,
  rangeWhere,
  systemItemsFor,
  toBusy,
  toEvent,
  type Actor,
  type EventRow,
} from '../lib/calendar/core.js';
import { parseRRule } from '../lib/calendar/rrule.js';
import { parseQuickAdd } from '../lib/calendar/quickAdd.js';

/**
 * Team calendar (/api/events): events with attendees, recurrence and reminders, plus read-only
 * items from cases, consultation bookings, interviews and task deadlines. Staff only.
 * Realtime: calendar.updated to the owner and attendees of a changed event.
 */
export const eventsRouter = Router();
eventsRouter.use(requireMinRole('STAFF'));

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

const actorOf = (req: Request): Actor => ({
  id: req.user!.id,
  role: req.user!.role,
  firstName: req.user!.firstName,
  lastName: req.user!.lastName,
  locale: (req.user!.locale as Actor['locale']) ?? 'az',
});
const idParam = (req: Request, key = 'id') => {
  const id = String(req.params[key] ?? '');
  if (!id || id.length > 60) throw notFound('EVENT_NOT_FOUND');
  return id;
};
const id = z.string().trim().min(1).max(60);
const dateIn = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s));
const csvIds = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean).slice(0, 20)));
const STATUSES = ['NEEDS_ACTION', 'ACCEPTED', 'DECLINED', 'TENTATIVE'] as const;

const text = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.replace(/\r\n/g, '\n').trim())
    .transform((s) => (s ? s : null))
    .nullable();
const rruleIn = z
  .string()
  .max(255)
  .transform((s) => s.trim().toUpperCase())
  .refine((s) => !s || parseRRule(s) !== null, 'INVALID_RRULE')
  .transform((s) => s || null)
  .nullable();

const eventFields = {
  title: z.string().trim().min(1).max(200),
  description: text(5000).optional(),
  location: text(255).optional(),
  meetingUrl: z
    .string()
    .trim()
    .max(500)
    .refine((s) => !s || /^https?:\/\//i.test(s), 'INVALID_URL')
    .transform((s) => s || null)
    .nullable()
    .optional(),
  startsAt: dateIn,
  endsAt: dateIn,
  allDay: z.boolean().optional(),
  color: z.enum(EVENT_COLORS).nullable().optional(),
  visibility: z.enum(['PRIVATE', 'TEAM']).optional(),
  rrule: rruleIn.optional(),
  reminderMinutes: z.number().int().min(0).max(7 * 24 * 60).nullable().optional(),
  caseId: id.nullable().optional(),
  attendeeIds: z.array(id).max(100).optional(),
};
const createBody = z.object(eventFields);
const patchBody = z.object({ ...eventFields, title: eventFields.title.optional(), startsAt: dateIn.optional(), endsAt: dateIn.optional(), status: z.enum(STATUSES).optional() });

const checkSpan = (startsAt: Date, endsAt: Date) => {
  if (endsAt.getTime() <= startsAt.getTime()) throw badRequest('END_BEFORE_START');
  if (endsAt.getTime() - startsAt.getTime() > 366 * DAY) throw badRequest('EVENT_TOO_LONG');
};

const validateCase = async (caseId: string | null | undefined) => {
  if (!caseId) return;
  if (!(await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } }))) throw badRequest('INVALID_CASE');
};

const loadEvent = async (eventId: string, actor: Actor) => {
  const e = await prisma.calendarEvent.findUnique({ where: { id: eventId }, include: eventInclude });
  if (!e || !canSee(e, actor)) throw notFound('EVENT_NOT_FOUND');
  return e;
};

const me = async (actor: Actor) => {
  const u = await prisma.user.findUnique({ where: { id: actor.id }, select: { id: true, firstName: true, lastName: true, locale: true } });
  return u ?? { id: actor.id, firstName: actor.firstName, lastName: actor.lastName, locale: actor.locale };
};

// ─── Listing ───────────────────────────────────────────────────────────

const listQuery = z.object({
  from: dateIn,
  to: dateIn,
  users: csvIds,
  mine: z.enum(['1', '0', 'true', 'false']).optional(),
  /** skip the read-only items from cases, bookings, interviews and tasks */
  system: z.enum(['0', '1']).optional(),
});

/**
 * GET /api/events?from=&to=&users=&mine=1 → occurrences in the window: my events (owner / attendee),
 * TEAM-visible events of colleagues (unless mine=1), the selected colleagues' events (private ones as
 * busy blocks) and my system items (cases, bookings, interviews, task deadlines).
 */
eventsRouter.get('/', async (req, res) => {
  const actor = actorOf(req);
  const q = parse(listQuery, req.query);
  if (q.to.getTime() <= q.from.getTime() || q.to.getTime() - q.from.getTime() > MAX_RANGE_MS) throw badRequest('INVALID_RANGE');
  const mine = q.mine === '1' || q.mine === 'true';
  const others = q.users.filter((u) => u !== actor.id);
  const where: Prisma.CalendarEventWhereInput = {
    AND: [
      rangeWhere(q.from, q.to),
      {
        OR: [
          { ownerId: actor.id },
          { attendees: { some: { userId: actor.id } } },
          ...(mine ? [] : [{ visibility: 'TEAM' as const }]),
          ...(others.length ? [{ ownerId: { in: others } }, { attendees: { some: { userId: { in: others } } } }] : []),
        ],
      },
    ],
  };
  const rows = await prisma.calendarEvent.findMany({ where, include: eventInclude, take: 2000 });
  const events: unknown[] = [];
  for (const e of rows) {
    if (canSee(e, actor)) events.push(...occurrencesOf(toEvent(e, actor), e, q.from, q.to));
    else events.push(...occurrencesOf(toBusy(e, e.startsAt, e.endsAt), e, q.from, q.to));
  }
  const system: unknown[] = [];
  if (q.system !== '0') {
    system.push(...(await systemItemsFor(await me(actor), q.from, q.to)));
    if (others.length) {
      const users = await activeStaff(others.slice(0, 10));
      for (const u of users) system.push(...(await systemItemsFor(u, q.from, q.to)));
    }
  }
  res.json({ events, system });
});

/** GET /api/events/summary → today's count and the next upcoming item (home widget). */
eventsRouter.get('/summary', async (req, res) => {
  const actor = actorOf(req);
  const now = new Date();
  const tz = Math.max(-840, Math.min(840, Number(req.query.tzOffset ?? 240) || 240));
  const local = new Date(now.getTime() + tz * MIN);
  const dayStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - tz * MIN);
  const dayEnd = new Date(dayStart.getTime() + DAY);
  const horizon = new Date(now.getTime() + 30 * DAY);
  const rows = await prisma.calendarEvent.findMany({
    where: { AND: [rangeWhere(dayStart, horizon), { OR: [{ ownerId: actor.id }, { attendees: { some: { userId: actor.id, status: { not: 'DECLINED' } } } }] }] },
    include: eventInclude,
    take: 500,
  });
  const items: { id: string; title: string; startsAt: Date; endsAt: Date; source: string; link?: string | null }[] = [];
  for (const e of rows) for (const o of occurrencesOf(toEvent(e, actor), e, dayStart, horizon)) items.push({ id: o.id, title: o.title, startsAt: o.startsAt, endsAt: o.endsAt, source: 'event', link: eventLink(o.id) });
  for (const s of await systemItemsFor(await me(actor), dayStart, horizon, now)) items.push({ id: s.id, title: s.title, startsAt: s.startsAt, endsAt: s.endsAt, source: s.source, link: s.link });
  items.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const today = items.filter((i) => i.startsAt.getTime() < dayEnd.getTime() && i.endsAt.getTime() > dayStart.getTime()).length;
  const next = items.find((i) => i.endsAt.getTime() > now.getTime()) ?? null;
  res.json({ today, next });
});

/** GET /api/events/free-busy?users=&from=&to= → busy blocks per user from every source. */
eventsRouter.get('/free-busy', async (req, res) => {
  const actor = actorOf(req);
  const q = parse(z.object({ from: dateIn, to: dateIn, users: csvIds }), req.query);
  if (q.to.getTime() <= q.from.getTime() || q.to.getTime() - q.from.getTime() > 31 * DAY) throw badRequest('INVALID_RANGE');
  const ids = q.users.length ? q.users : [actor.id];
  res.json({ users: await freeBusy(ids.slice(0, 20), q.from, q.to) });
});

// ─── Create / quick add ────────────────────────────────────────────────

const createEvent = async (req: Request, actor: Actor, data: z.infer<typeof createBody>) => {
  checkSpan(data.startsAt, data.endsAt);
  await validateCase(data.caseId);
  const attendees = (await activeStaff((data.attendeeIds ?? []).filter((x) => x !== actor.id))).map((u) => u.id);
  const e = await prisma.calendarEvent.create({
    data: {
      ownerId: actor.id,
      title: data.title,
      description: data.description ?? null,
      location: data.location ?? null,
      meetingUrl: data.meetingUrl ?? null,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      allDay: data.allDay ?? false,
      color: data.color ?? null,
      visibility: data.visibility ?? 'TEAM',
      rrule: data.rrule ?? null,
      reminderMinutes: data.reminderMinutes ?? null,
      caseId: data.caseId ?? null,
      attendees: { create: attendees.map((userId) => ({ userId })) },
    },
    include: eventInclude,
  });
  await audit(req, 'EVENT_CREATED', `event:${e.id}`, { title: e.title, startsAt: e.startsAt.toISOString(), attendees: attendees.length });
  publishEvent(e, 'created');
  void notifyAttendees(e, attendees, 'invite', actor);
  return e;
};

/** POST /api/events */
eventsRouter.post('/', async (req, res) => {
  const actor = actorOf(req);
  const e = await createEvent(req, actor, parse(createBody, req.body));
  res.status(201).json({ event: toEvent(e, actor) });
});

/** POST /api/events/quick { text, tzOffset?, attendeeIds?, dryRun? } → "Görüş sabah 15:00 1 saat". */
eventsRouter.post('/quick', async (req, res) => {
  const actor = actorOf(req);
  const body = parse(
    z.object({ text: z.string().trim().min(1).max(300), tzOffset: z.number().int().min(-840).max(840).optional(), attendeeIds: z.array(id).max(100).optional(), dryRun: z.boolean().optional() }),
    req.body,
  );
  const parsed = parseQuickAdd(body.text, { tzOffsetMinutes: body.tzOffset ?? 240 });
  if (body.dryRun) {
    res.json({ parsed });
    return;
  }
  const e = await createEvent(req, actor, { title: parsed.title, startsAt: parsed.startsAt, endsAt: parsed.endsAt, allDay: parsed.allDay, attendeeIds: body.attendeeIds });
  res.status(201).json({ event: toEvent(e, actor), parsed });
});

// ─── One event ─────────────────────────────────────────────────────────

/** GET /api/events/:id.ics → the event as a calendar file. */
eventsRouter.get('/:id.ics', async (req, res) => {
  const actor = actorOf(req);
  const e = await loadEvent(idParam(req), actor);
  const ics = buildIcs({
    uid: `event-${e.id}@triad-vision.de`,
    start: e.startsAt,
    end: e.endsAt,
    summary: e.title,
    description: [e.description, e.meetingUrl, e.rrule ? `RRULE:${e.rrule}` : null].filter(Boolean).join('\n') || undefined,
    location: e.location ?? e.meetingUrl ?? undefined,
    url: `${config.clientUrl.replace(/\/$/, '')}${eventLink(e.id)}`,
    organizer: { name: fullName(e.owner), email: config.smtp.from.replace(/^.*<|>.*$/g, '') || 'no-reply@triad-vision.de' },
    stamp: e.updatedAt,
  });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${e.title.slice(0, 60)}.ics`)}`);
  res.send(ics);
});

/** GET /api/events/:id */
eventsRouter.get('/:id', async (req, res) => {
  const actor = actorOf(req);
  res.json({ event: toEvent(await loadEvent(idParam(req), actor), actor) });
});

const respond = async (req: Request, e: EventRow, status: AttendeeStatus, actor: Actor) => {
  if (!isAttendee(e, actor)) throw forbidden('NOT_AN_ATTENDEE');
  await prisma.calendarAttendee.update({ where: { eventId_userId: { eventId: e.id, userId: actor.id } }, data: { status } });
  await audit(req, 'EVENT_RESPONDED', `event:${e.id}`, { status });
  const after = (await prisma.calendarEvent.findUnique({ where: { id: e.id }, include: eventInclude }))!;
  publishEvent(after, 'responded', { userId: actor.id, status });
  void notifyResponse(after, status, actor);
  return after;
};

/** PATCH /api/events/:id — owner or admin edits anything; an attendee may only change their own status. */
eventsRouter.patch('/:id', async (req, res) => {
  const actor = actorOf(req);
  const e = await loadEvent(idParam(req), actor);
  const body = parse(patchBody, req.body);
  const { status, ...fields } = body;
  const hasFields = Object.values(fields).some((v) => v !== undefined);
  if (!canManage(e, actor)) {
    if (hasFields || !status) throw forbidden('EVENT_FORBIDDEN');
    res.json({ event: toEvent(await respond(req, e, status, actor), actor) });
    return;
  }
  const startsAt = fields.startsAt ?? e.startsAt;
  const endsAt = fields.endsAt ?? e.endsAt;
  checkSpan(startsAt, endsAt);
  await validateCase(fields.caseId);
  const before = e.attendees.map((a) => a.userId);
  const next = fields.attendeeIds ? (await activeStaff(fields.attendeeIds.filter((x) => x !== e.ownerId))).map((u) => u.id) : before;
  const added = next.filter((x) => !before.includes(x));
  const removed = before.filter((x) => !next.includes(x));
  const timeChanged = startsAt.getTime() !== e.startsAt.getTime() || endsAt.getTime() !== e.endsAt.getTime();
  const data: Prisma.CalendarEventUpdateInput = {
    ...(fields.title !== undefined ? { title: fields.title } : {}),
    ...(fields.description !== undefined ? { description: fields.description } : {}),
    ...(fields.location !== undefined ? { location: fields.location } : {}),
    ...(fields.meetingUrl !== undefined ? { meetingUrl: fields.meetingUrl } : {}),
    ...(fields.startsAt ? { startsAt } : {}),
    ...(fields.endsAt ? { endsAt } : {}),
    ...(fields.allDay !== undefined ? { allDay: fields.allDay } : {}),
    ...(fields.color !== undefined ? { color: fields.color } : {}),
    ...(fields.visibility !== undefined ? { visibility: fields.visibility } : {}),
    ...(fields.rrule !== undefined ? { rrule: fields.rrule } : {}),
    ...(fields.reminderMinutes !== undefined ? { reminderMinutes: fields.reminderMinutes } : {}),
    ...(fields.caseId !== undefined ? { case: fields.caseId ? { connect: { id: fields.caseId } } : { disconnect: true } } : {}),
  };
  await prisma.$transaction([
    prisma.calendarEvent.update({ where: { id: e.id }, data }),
    prisma.calendarAttendee.deleteMany({ where: { eventId: e.id, userId: { in: removed } } }),
    prisma.calendarAttendee.createMany({ data: added.map((userId) => ({ eventId: e.id, userId })), skipDuplicates: true }),
    // A moved event asks everyone again.
    ...(timeChanged ? [prisma.calendarAttendee.updateMany({ where: { eventId: e.id, userId: { notIn: added } }, data: { status: 'NEEDS_ACTION' } })] : []),
  ]);
  if (status && isAttendee({ attendees: next.map((userId) => ({ userId })) }, actor)) {
    await prisma.calendarAttendee.update({ where: { eventId_userId: { eventId: e.id, userId: actor.id } }, data: { status } });
  }
  const after = (await prisma.calendarEvent.findUnique({ where: { id: e.id }, include: eventInclude }))!;
  await audit(req, 'EVENT_UPDATED', `event:${e.id}`, { fields: Object.keys(fields).filter((k) => (fields as Record<string, unknown>)[k] !== undefined), added, removed });
  publish_(after, e, added, removed, timeChanged || fields.title !== undefined || fields.location !== undefined, actor);
  res.json({ event: toEvent(after, actor) });
});

const publish_ = (after: EventRow, before: EventRow, added: string[], removed: string[], changed: boolean, actor: Actor) => {
  publishEvent({ id: after.id, ownerId: after.ownerId, attendees: [...after.attendees, ...removed.map((userId) => ({ userId }))] }, 'updated');
  void notifyAttendees(after, added, 'invite', actor);
  void notifyAttendees(before, removed, 'cancelled', actor);
  if (changed) void notifyAttendees(after, after.attendees.map((a) => a.userId).filter((x) => !added.includes(x)), 'updated', actor);
};

/** DELETE /api/events/:id (owner or admin). */
eventsRouter.delete('/:id', async (req, res) => {
  const actor = actorOf(req);
  const e = await loadEvent(idParam(req), actor);
  if (!canManage(e, actor)) throw forbidden('EVENT_FORBIDDEN');
  await prisma.calendarEvent.delete({ where: { id: e.id } });
  await audit(req, 'EVENT_DELETED', `event:${e.id}`, { title: e.title });
  publishEvent(e, 'deleted');
  void notifyAttendees(e, e.attendees.map((a) => a.userId), 'cancelled', actor);
  res.json({ ok: true });
});

/** POST /api/events/:id/respond { status } (attendees). */
eventsRouter.post('/:id/respond', async (req, res) => {
  const actor = actorOf(req);
  const e = await loadEvent(idParam(req), actor);
  const { status } = parse(z.object({ status: z.enum(STATUSES) }), req.body);
  res.json({ event: toEvent(await respond(req, e, status, actor), actor) });
});
