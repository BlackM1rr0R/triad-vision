import crypto from 'node:crypto';
import type { Locale, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { HttpError, badRequest, conflict, notFound } from '../http.js';
import { buildIcs } from '../ics.js';
import { renderEmail, sendMail } from '../mailer.js';
import { notifyUser } from '../notifications.js';
import { hashToken, manageTokenFor } from '../../routes/booking.js';
import { asReason, cta, fmtWhen, reasonLabel, visitTexts, type VisitMail, type VisitReason } from './texts.js';

/**
 * Office visits: clients book a seat in an OFFICE slot of the consultation booking module (ConsultationSlot
 * kind OFFICE, one row per seat — capacity = seats sharing staffId + startsAt) for a reason tied to their case.
 * Bookings stay ordinary Booking rows (caseId set, topic = reason), so the admin booking list, done / no-show
 * and the my-work "booking" items work unchanged.
 */

export const OFFICE_WINDOW_DAYS = 30;
export const OFFICE_MIN_NOTICE_MS = 2 * 3600 * 1000;
/** Upcoming office visits a client may hold per case. */
export const MAX_UPCOMING_PER_CASE = 2;

export interface Office {
  index: number;
  city: string;
  address: string;
}

/** Offices from Setting 'contact' (city in the reader's language). */
export const listOffices = async (locale: Locale = 'az'): Promise<Office[]> => {
  const row = await prisma.setting.findUnique({ where: { key: 'contact' } });
  const contact = (row?.value ?? {}) as Record<string, unknown>;
  const offices = Array.isArray(contact.offices) ? (contact.offices as Record<string, unknown>[]) : [];
  return offices
    .map((o, index) => {
      const c = o.city;
      const city = typeof c === 'string' ? c : c && typeof c === 'object' ? String((c as Record<string, unknown>)[locale] ?? (c as Record<string, unknown>).en ?? (c as Record<string, unknown>).az ?? '') : '';
      return { index, city, address: typeof o.address === 'string' ? o.address : '' };
    })
    .filter((o) => o.address);
};

export const officeLocation = (o: Office) => (o.city ? `${o.city} · ${o.address}` : o.address);

export const visitInclude = {
  slot: { include: { staff: { select: { id: true, firstName: true, lastName: true, email: true, locale: true } } } },
  case: { select: { id: true, number: true, clientId: true, client: { select: { id: true, firstName: true, lastName: true, email: true, locale: true } } } },
} satisfies Prisma.BookingInclude;

export type VisitFull = Prisma.BookingGetPayload<{ include: typeof visitInclude }>;

const freeSeat: Prisma.ConsultationSlotWhereInput = { OR: [{ booking: { is: null } }, { booking: { is: { status: 'CANCELLED' } } }] };

/** Free office slots ahead (grouped per time + office; `id` = one free seat, `free` = free seats). */
export const freeOfficeSlots = async (now = new Date()) => {
  const rows = await prisma.consultationSlot.findMany({
    where: {
      kind: 'OFFICE',
      startsAt: { gte: new Date(now.getTime() + OFFICE_MIN_NOTICE_MS), lte: new Date(now.getTime() + OFFICE_WINDOW_DAYS * 86400000) },
      staff: { isActive: true },
      ...freeSeat,
    },
    orderBy: [{ startsAt: 'asc' }, { seat: 'asc' }],
    select: { id: true, startsAt: true, endsAt: true, location: true },
    take: 3000,
  });
  const groups = new Map<string, { id: string; startsAt: Date; endsAt: Date; location: string | null; free: number }>();
  for (const r of rows) {
    const k = `${r.startsAt.toISOString()}|${r.endsAt.toISOString()}|${r.location ?? ''}`;
    const g = groups.get(k);
    if (g) g.free++;
    else groups.set(k, { ...r, free: 1 });
  }
  return [...groups.values()];
};

const visitCtx = (v: VisitFull, locale: Locale, message?: string | null) => ({
  when: fmtWhen(v.slot.startsAt, locale),
  address: v.slot.location ?? '',
  reason: reasonLabel[locale][asReason(v.topic)],
  number: v.case?.number ?? '',
  message: message ?? v.message,
});

export const visitIcs = (v: VisitFull, cancelled = false) => {
  const locale = (v.case?.client.locale ?? (v.locale as Locale)) || 'az';
  const t = visitTexts[locale];
  return buildIcs({
    uid: `office-visit-${v.id}@triad-vision.de`,
    start: v.slot.startsAt,
    end: v.slot.endsAt,
    summary: t.icsSummary,
    description: t.icsDescription(visitCtx(v, locale)),
    location: v.slot.location ?? undefined,
    url: v.caseId ? `${config.clientUrl}/account/cases/${v.caseId}#office-visits` : undefined,
    status: cancelled ? 'CANCELLED' : 'CONFIRMED',
  });
};

/** Tells the client (in-app + push, e-mail with .ics for confirmations / cancellations). Never throws. */
export const notifyVisitClient = async (v: VisitFull, kind: VisitMail, message?: string | null) => {
  try {
    const client = v.case?.client;
    if (!client) return;
    const locale = client.locale;
    const msg = visitTexts[locale][kind](visitCtx(v, locale, message));
    const link = `/account/cases/${v.caseId}#office-visits`;
    const withIcs = kind === 'confirmed' || kind === 'rescheduled' || kind === 'cancelledByClient' || kind === 'cancelledByStaff';
    const cancelled = kind === 'cancelledByClient' || kind === 'cancelledByStaff';
    await notifyUser(client.id, { type: `OFFICE_VISIT_${kind.toUpperCase()}`, ...msg, link, caseId: v.caseId ?? undefined, email: !withIcs, ctaLabel: cta[locale] });
    if (withIcs) {
      // Booking confirmations are transactional: always e-mailed, with the calendar file.
      const html = renderEmail(msg.title, msg.body, { label: cta[locale], url: `${config.clientUrl}${link}` });
      void sendMail(client.email, `Triad Vision · ${msg.title}`, html, [
        { filename: 'triad-vision-office-visit.ics', content: visitIcs(v, cancelled), contentType: 'text/calendar; charset=utf-8' },
      ]).catch(() => undefined);
    }
  } catch (err) {
    console.error('[office-visit] client notify failed', v.id, err);
  }
};

/** The staff member who owns the slot (their language). Never throws. */
export const notifyVisitStaff = async (v: VisitFull, kind: 'staffNew' | 'staffCancelled' | 'staffToday') => {
  try {
    const locale = v.slot.staff.locale;
    const client = v.case?.client ? `${v.case.client.firstName} ${v.case.client.lastName}`.trim() : v.name;
    const msg = visitTexts[locale][kind]({ ...visitCtx(v, locale), client });
    await notifyUser(v.slot.staffId, { type: `OFFICE_VISIT_${kind.replace('staff', '').toUpperCase()}`, ...msg, link: '/admin/bookings?tab=office', caseId: v.caseId ?? undefined, email: kind !== 'staffToday' });
  } catch (err) {
    console.error('[office-visit] staff notify failed', v.id, err);
  }
};

/** Picks a free seat of the same time / office as `slotId` (any staff member offering it). */
const pickSeat = async (tx: Prisma.TransactionClient, slotId: string, now: Date) => {
  const slot = await tx.consultationSlot.findUnique({ where: { id: slotId }, include: { staff: { select: { isActive: true } } } });
  if (!slot || slot.kind !== 'OFFICE' || !slot.staff.isActive) throw notFound('SLOT_NOT_FOUND');
  if (slot.startsAt.getTime() < now.getTime() + OFFICE_MIN_NOTICE_MS) throw badRequest('SLOT_TOO_SOON');
  const seat = await tx.consultationSlot.findFirst({
    where: { kind: 'OFFICE', startsAt: slot.startsAt, endsAt: slot.endsAt, location: slot.location, staff: { isActive: true }, ...freeSeat },
    orderBy: [{ startsAt: 'asc' }, { seat: 'asc' }],
    select: { id: true },
  });
  // Prefer the seat that was asked for when it is still free.
  const asked = await tx.consultationSlot.count({ where: { id: slot.id, ...freeSeat } });
  if (asked) return slot.id;
  if (!seat) throw new HttpError(409, 'SLOT_TAKEN');
  return seat.id;
};

const createVisit = async (tx: Prisma.TransactionClient, seatId: string, c: { id: string; client: { id: string; firstName: string; lastName: string; email: string; phone: string | null; locale: Locale } }, reason: VisitReason, message: string | null) => {
  await tx.booking.deleteMany({ where: { slotId: seatId, status: 'CANCELLED' } });
  const id = crypto.randomUUID();
  return tx.booking.create({
    data: {
      id,
      slotId: seatId,
      userId: c.client.id,
      caseId: c.id,
      name: `${c.client.firstName} ${c.client.lastName}`.trim(),
      email: c.client.email,
      phone: c.client.phone,
      topic: reason,
      message,
      locale: c.client.locale,
      meetingUrl: '',
      manageToken: hashToken(manageTokenFor(id)),
    },
    include: visitInclude,
  });
};

const mapConflict = (err: unknown) => {
  const code = (err as { code?: string }).code;
  if (code === 'P2002' || code === 'P2034') return new HttpError(409, 'SLOT_TAKEN');
  return err;
};

/** Client books an office visit for their case. */
export const bookOfficeVisit = async (clientId: string, input: { caseId: string; slotId: string; reason: VisitReason; message?: string | null }, now = new Date()) => {
  const c = await prisma.case.findUnique({
    where: { id: input.caseId },
    select: { id: true, clientId: true, client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, locale: true } } },
  });
  if (!c || c.clientId !== clientId) throw notFound('CASE_NOT_FOUND');
  const upcoming = await prisma.booking.count({ where: { caseId: c.id, status: 'BOOKED', slot: { kind: 'OFFICE', startsAt: { gt: now } } } });
  if (upcoming >= MAX_UPCOMING_PER_CASE) throw conflict('OFFICE_VISIT_LIMIT');
  let visit: VisitFull;
  try {
    visit = await prisma.$transaction(async (tx) => createVisit(tx, await pickSeat(tx, input.slotId, now), c, input.reason, input.message ?? null));
  } catch (err) {
    throw mapConflict(err);
  }
  await notifyVisitClient(visit, 'confirmed');
  await notifyVisitStaff(visit, 'staffNew');
  return visit;
};

export const loadVisit = async (id: string) => {
  const v = await prisma.booking.findUnique({ where: { id }, include: visitInclude });
  if (!v || v.slot.kind !== 'OFFICE') throw notFound('BOOKING_NOT_FOUND');
  return v;
};

/** Cancels an active future visit. `by` = who cancelled (client or staff). */
export const cancelOfficeVisit = async (v: VisitFull, by: 'client' | 'staff', message?: string | null, now = new Date()) => {
  if (v.status !== 'BOOKED') throw new HttpError(409, 'BOOKING_NOT_ACTIVE');
  if (by === 'client' && v.slot.startsAt.getTime() <= now.getTime()) throw new HttpError(409, 'BOOKING_STARTED');
  const res = await prisma.booking.updateMany({ where: { id: v.id, status: 'BOOKED' }, data: { status: 'CANCELLED' } });
  if (!res.count) throw new HttpError(409, 'BOOKING_NOT_ACTIVE');
  const cancelled = { ...v, status: 'CANCELLED' as const };
  await notifyVisitClient(cancelled, by === 'client' ? 'cancelledByClient' : 'cancelledByStaff', message ?? null);
  if (by === 'client') await notifyVisitStaff(cancelled, 'staffCancelled');
  return cancelled;
};

/** Moves a visit to another free office slot (new booking row, the old one is cancelled). */
export const rescheduleOfficeVisit = async (v: VisitFull, slotId: string, now = new Date()) => {
  if (v.status !== 'BOOKED') throw new HttpError(409, 'BOOKING_NOT_ACTIVE');
  if (v.slot.startsAt.getTime() <= now.getTime()) throw new HttpError(409, 'BOOKING_STARTED');
  if (!v.case) throw notFound('CASE_NOT_FOUND');
  const c = await prisma.case.findUniqueOrThrow({
    where: { id: v.case.id },
    select: { id: true, client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, locale: true } } },
  });
  let next: VisitFull;
  try {
    next = await prisma.$transaction(async (tx) => {
      const seat = await pickSeat(tx, slotId, now);
      if (seat === v.slotId) throw badRequest('SAME_SLOT');
      const res = await tx.booking.updateMany({ where: { id: v.id, status: 'BOOKED' }, data: { status: 'CANCELLED' } });
      if (!res.count) throw new HttpError(409, 'BOOKING_NOT_ACTIVE');
      return createVisit(tx, seat, c, asReason(v.topic), v.message);
    });
  } catch (err) {
    throw mapConflict(err);
  }
  await notifyVisitClient(next, 'rescheduled');
  await notifyVisitStaff(next, 'staffNew');
  if (next.slot.staffId !== v.slot.staffId) await notifyVisitStaff({ ...v, status: 'CANCELLED' }, 'staffCancelled');
  return next;
};

/** Shape for the client portal / app. */
export const visitView = (v: VisitFull, now = new Date()) => ({
  id: v.id,
  caseId: v.caseId,
  caseNumber: v.case?.number ?? null,
  status: v.status,
  reason: asReason(v.topic),
  message: v.message,
  startsAt: v.slot.startsAt,
  endsAt: v.slot.endsAt,
  location: v.slot.location,
  staffName: v.slot.staff.firstName,
  canCancel: v.status === 'BOOKED' && v.slot.startsAt.getTime() > now.getTime(),
  createdAt: v.createdAt,
});
