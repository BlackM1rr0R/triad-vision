import { cancelOfficeVisit, loadVisit } from '../../lib/clientProcess/office.js';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole } from '../../middleware/auth.js';
import { HttpError, badRequest, forbidden, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { isValidTimeZone, zonedDay, zonedToUtc } from '../../lib/ics.js';
import { notifyUser } from '../../lib/notifications.js';
import { bookerText, bookingInclude, mailBooker, notifySlotStaff } from '../booking.js';

// Admin: booking — mounted at /api/admin/booking (STAFF+). Staff manage their own slots and
// bookings; admins can act for anyone.
export const adminBookingRouter = Router();

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
export const SLOT_LENGTHS = [15, 30, 45, 60] as const;
const MAX_SLOTS_PER_REQUEST = 1000;

const isAdmin = (req: Request) => hasMinRole(req.user!.role, 'ADMIN');

/** Which staff member the request acts for: yourself, or anyone when you are an admin. */
const targetStaffId = async (req: Request, requested?: string | null) => {
  if (!requested || requested === req.user!.id) return req.user!.id;
  if (!isAdmin(req)) throw forbidden();
  const staff = await prisma.user.findUnique({ where: { id: requested }, select: { role: true, isActive: true } });
  if (!staff || !hasMinRole(staff.role, 'STAFF')) throw notFound('STAFF_NOT_FOUND');
  return requested;
};

/** Scope for list queries: staff see their own; admins see everyone or a chosen staff member. */
const staffScope = (req: Request, staffId?: string) => {
  if (!isAdmin(req)) return req.user!.id;
  return staffId && staffId !== 'all' ? staffId : undefined;
};

const lengthSchema = z.coerce.number().refine((n) => (SLOT_LENGTHS as readonly number[]).includes(n), 'INVALID_LENGTH');

const rangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  staffId: z.string().max(64).optional(),
});

adminBookingRouter.get('/staff', async (req, res) => {
  const staff = await prisma.user.findMany({
    where: isAdmin(req) ? { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true } : { id: req.user!.id },
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  res.json({ staff, canManageOthers: isAdmin(req) });
});

/** Slots in a range (default: today → +28 days), with their booking if any. */
adminBookingRouter.get('/slots', async (req, res) => {
  const q = parse(rangeQuery, req.query);
  const from = q.from ?? new Date(Date.now() - DAY);
  const to = q.to ?? new Date(from.getTime() + 35 * DAY);
  if (to.getTime() - from.getTime() > 120 * DAY) throw badRequest('RANGE_TOO_LARGE');
  const staffId = staffScope(req, q.staffId);
  const slots = await prisma.consultationSlot.findMany({
    where: { startsAt: { gte: from, lt: to }, kind: 'ONLINE', ...(staffId ? { staffId } : {}) }, // office seats: /admin/client-process/office/slots
    orderBy: { startsAt: 'asc' },
    include: {
      staff: { select: { id: true, firstName: true, lastName: true } },
      booking: { select: { id: true, status: true, name: true, email: true, phone: true, topic: true, message: true, meetingUrl: true, locale: true, createdAt: true } },
    },
    take: 3000,
  });
  res.json({ slots });
});

/** Overlap check: no two slots of the same staff member may overlap. */
const overlapping = (staffId: string, startsAt: Date, endsAt: Date) =>
  prisma.consultationSlot.findFirst({
    where: { staffId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
    select: { id: true },
  });

adminBookingRouter.post('/slots', async (req, res) => {
  const body = parse(
    z.object({
      startsAt: z.coerce.date(),
      minutes: lengthSchema,
      staffId: z.string().max(64).optional().nullable(),
    }),
    req.body,
  );
  const staffId = await targetStaffId(req, body.staffId);
  if (body.startsAt.getTime() <= Date.now()) throw badRequest('SLOT_IN_PAST');
  if (body.startsAt.getTime() > Date.now() + 366 * DAY) throw badRequest('SLOT_TOO_FAR');
  const endsAt = new Date(body.startsAt.getTime() + body.minutes * MIN);
  if (await overlapping(staffId, body.startsAt, endsAt)) throw new HttpError(409, 'SLOT_OVERLAP');
  const slot = await prisma.consultationSlot.create({ data: { staffId, startsAt: body.startsAt, endsAt } });
  res.status(201).json({ slot });
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const toMinutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

export const templateSchema = z.object({
  staffId: z.string().max(64).optional().nullable(),
  timeZone: z.string().max(64).default('Asia/Baku'),
  minutes: lengthSchema,
  /** pause between two generated slots */
  gapMinutes: z.coerce.number().int().min(0).max(120).default(0),
  weeks: z.coerce.number().int().min(1).max(12),
  /** first day to generate (YYYY-MM-DD in `timeZone`); default today */
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6), // 0 = Sunday … 6 = Saturday
        ranges: z.array(z.object({ from: hhmm, to: hhmm })).min(1).max(6),
      }),
    )
    .min(1)
    .max(7),
});

/** Expands a weekly template into concrete UTC slots. Pure, exported for unit tests. */
export const expandTemplate = (t: z.infer<typeof templateSchema>, now: Date) => {
  const start = t.startDate
    ? (() => {
        const [y, m, d] = t.startDate.split('-').map(Number);
        return { y, m, d };
      })()
    : zonedDay(now, t.timeZone);
  const out: { startsAt: Date; endsAt: Date }[] = [];
  const base = Date.UTC(start.y, start.m - 1, start.d);
  for (let i = 0; i < t.weeks * 7; i++) {
    const day = new Date(base + i * DAY);
    const weekday = day.getUTCDay();
    for (const entry of t.days.filter((e) => e.weekday === weekday)) {
      for (const r of entry.ranges) {
        const from = toMinutes(r.from);
        const to = toMinutes(r.to);
        for (let m = from; m + t.minutes <= to; m += t.minutes + t.gapMinutes) {
          const startsAt = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), Math.floor(m / 60), m % 60, t.timeZone);
          if (startsAt.getTime() <= now.getTime()) continue;
          out.push({ startsAt, endsAt: new Date(startsAt.getTime() + t.minutes * MIN) });
        }
      }
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
};

adminBookingRouter.post('/slots/template', async (req, res) => {
  const t = parse(templateSchema, req.body);
  if (!isValidTimeZone(t.timeZone)) throw badRequest('INVALID_TIMEZONE');
  for (const d of t.days) for (const r of d.ranges) if (toMinutes(r.to) <= toMinutes(r.from)) throw badRequest('INVALID_RANGE');
  const staffId = await targetStaffId(req, t.staffId);
  const candidates = expandTemplate(t, new Date());
  if (candidates.length > MAX_SLOTS_PER_REQUEST) throw badRequest('TOO_MANY_SLOTS');
  if (candidates.length === 0) {
    res.status(201).json({ created: 0, skipped: 0 });
    return;
  }
  // Skip anything that would overlap an existing slot (or another generated one).
  const existing = await prisma.consultationSlot.findMany({
    where: { staffId, startsAt: { lt: candidates.at(-1)!.endsAt }, endsAt: { gt: candidates[0].startsAt } },
    select: { startsAt: true, endsAt: true },
  });
  const taken = existing.map((s) => [s.startsAt.getTime(), s.endsAt.getTime()] as const);
  const fresh: { staffId: string; startsAt: Date; endsAt: Date }[] = [];
  for (const c of candidates) {
    const a = c.startsAt.getTime();
    const b = c.endsAt.getTime();
    if (taken.some(([s, e]) => s < b && e > a)) continue;
    taken.push([a, b]);
    fresh.push({ staffId, ...c });
  }
  const result = fresh.length ? await prisma.consultationSlot.createMany({ data: fresh, skipDuplicates: true }) : { count: 0 };
  res.status(201).json({ created: result.count, skipped: candidates.length - result.count });
});

const isFree = (s: { booking: { status: string } | null }) => !s.booking || s.booking.status === 'CANCELLED';

adminBookingRouter.delete('/slots/:id', async (req, res) => {
  const slot = await prisma.consultationSlot.findUnique({ where: { id: req.params.id }, include: { booking: { select: { status: true } } } });
  if (!slot) throw notFound('SLOT_NOT_FOUND');
  if (slot.staffId !== req.user!.id && !isAdmin(req)) throw notFound('SLOT_NOT_FOUND');
  if (!isFree(slot)) throw new HttpError(409, 'SLOT_BOOKED');
  await prisma.consultationSlot.delete({ where: { id: slot.id } });
  res.json({ ok: true });
});

/** Deletes several free slots at once (booked ones are kept and reported). */
adminBookingRouter.post('/slots/bulk-delete', async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string().max(64)).min(1).max(500) }), req.body);
  const slots = await prisma.consultationSlot.findMany({
    where: { id: { in: ids }, ...(isAdmin(req) ? {} : { staffId: req.user!.id }) },
    include: { booking: { select: { status: true } } },
  });
  const deletable = slots.filter(isFree).map((s) => s.id);
  if (deletable.length) await prisma.consultationSlot.deleteMany({ where: { id: { in: deletable } } });
  res.json({ deleted: deletable.length, kept: ids.length - deletable.length });
});

adminBookingRouter.get('/bookings', async (req, res) => {
  const q = parse(rangeQuery.extend({ status: z.enum(['BOOKED', 'CANCELLED', 'DONE', 'NO_SHOW']).optional() }), req.query);
  const staffId = staffScope(req, q.staffId);
  const where: Prisma.BookingWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    slot: {
      ...(staffId ? { staffId } : {}),
      ...(q.from || q.to ? { startsAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) } } : {}),
    },
  };
  const bookings = await prisma.booking.findMany({
    where,
    include: { slot: { include: { staff: { select: { id: true, firstName: true, lastName: true } } } } },
    orderBy: { slot: { startsAt: 'asc' } },
    take: 1000,
  });
  const now = new Date();
  const [upcoming, today] = await Promise.all([
    prisma.booking.count({ where: { status: 'BOOKED', slot: { startsAt: { gte: now }, ...(staffId ? { staffId } : {}) } } }),
    prisma.booking.count({
      where: { status: 'BOOKED', slot: { startsAt: { gte: now, lt: new Date(now.getTime() + DAY) }, ...(staffId ? { staffId } : {}) } },
    }),
  ]);
  res.json({ bookings: bookings.map(({ manageToken: _t, ...b }) => b), summary: { upcoming, next24h: today } });
});

const loadOwnBooking = async (req: Request) => {
  const booking = await prisma.booking.findUnique({ where: { id: String(req.params.id) }, include: bookingInclude });
  if (!booking) throw notFound('BOOKING_NOT_FOUND');
  if (booking.slot.staffId !== req.user!.id && !isAdmin(req)) throw notFound('BOOKING_NOT_FOUND');
  return booking;
};

adminBookingRouter.patch('/bookings/:id', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['BOOKED', 'DONE', 'NO_SHOW']) }), req.body);
  const booking = await loadOwnBooking(req);
  if (booking.status === 'CANCELLED') throw new HttpError(409, 'BOOKING_CANCELLED');
  if (status !== 'BOOKED' && booking.slot.startsAt.getTime() > Date.now()) throw badRequest('BOOKING_NOT_STARTED');
  const updated = await prisma.booking.update({ where: { id: booking.id }, data: { status } });
  await audit(req, 'BOOKING_STATUS', booking.id, { status });
  const { manageToken: _t, ...rest } = updated;
  res.json({ booking: rest });
});

adminBookingRouter.post('/bookings/:id/cancel', async (req, res) => {
  const { message } = parse(z.object({ message: z.string().trim().max(2000).optional() }), req.body);
  const booking = await loadOwnBooking(req);
  if (booking.status !== 'BOOKED') throw new HttpError(409, 'BOOKING_NOT_ACTIVE');
  // Office visits (client portal) have their own wording, .ics and notices — never the consultation e-mail.
  if (booking.slot.kind === 'OFFICE') {
    await cancelOfficeVisit(await loadVisit(booking.id), 'staff', message ?? null);
    await audit(req, 'BOOKING_CANCEL', booking.id, { by: 'staff', kind: 'OFFICE' });
    res.json({ ok: true });
    return;
  }
  const updated = await prisma.booking.updateMany({ where: { id: booking.id, status: 'BOOKED' }, data: { status: 'CANCELLED' } });
  if (updated.count === 0) throw new HttpError(409, 'BOOKING_NOT_ACTIVE');
  const cancelled = { ...booking, status: 'CANCELLED' as const };
  void mailBooker(cancelled, 'cancelledByStaff', message ?? null).catch(() => undefined);
  // A registered booker also gets it in their portal inbox (the email above already went out).
  if (booking.userId) {
    const { msg } = bookerText(cancelled, 'cancelledByStaff', message ?? null);
    await notifyUser(booking.userId, { type: 'BOOKING_CANCELLED', title: msg.title, body: msg.body, link: '/booking', email: false }).catch(() => undefined);
  }
  if (booking.slot.staffId !== req.user!.id) await notifySlotStaff(cancelled, 'staffCancelled', message ?? null).catch(() => undefined);
  await audit(req, 'BOOKING_CANCEL', booking.id, { by: 'staff' });
  res.json({ ok: true });
});
