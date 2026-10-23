import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { Booking, ConsultationSlot, Prisma, User } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError, limiter, notFound, parse } from '../lib/http.js';
import { renderEmail, sendMail } from '../lib/mailer.js';
import { notifyUser } from '../lib/notifications.js';
import { buildIcs } from '../lib/ics.js';
import { asBookingLocale, bookingTexts, formatSlot, topicLabel, type BookingLocale } from '../lib/bookingTexts.js';
import { emitAutomationEvent } from '../lib/automation/events.js';

// Public consultation booking — mounted at /api/booking
export const bookingRouter = Router();

/** How far ahead the public page shows slots, and the minimum notice for a booking. */
export const BOOKING_WINDOW_DAYS = 21;
export const BOOKING_MIN_NOTICE_MS = 2 * 60 * 60 * 1000;
/** Max bookings per e-mail address in a rolling 7-day window. */
export const BOOKING_MAX_PER_EMAIL = 3;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const TOPICS = ['candidate', 'company', 'other'] as const;

// ─── Shared helpers (also used by the admin routes and the reminder job) ─────

/**
 * The manage token is derived from the booking id with an HMAC of the server secret, so reminder
 * emails can carry the same link again. Only its sha256 is stored in the database.
 */
export const manageTokenFor = (bookingId: string) =>
  crypto.createHmac('sha256', config.jwtSecret).update(`booking-manage:${bookingId}`).digest('base64url');

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export const manageUrl = (token: string) => `${config.clientUrl}/booking/manage?token=${encodeURIComponent(token)}`;
export const rebookUrl = () => `${config.clientUrl}/booking`;

/** A random, unguessable Jitsi room (20 hex chars after the prefix). */
export const newMeetingUrl = () => `https://meet.jit.si/TriadVision-${crypto.randomBytes(10).toString('hex')}`;

type BookingFull = Booking & { slot: ConsultationSlot & { staff: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'locale'> } };

export const bookingInclude = {
  slot: { include: { staff: { select: { id: true, firstName: true, lastName: true, email: true, locale: true } } } },
} satisfies Prisma.BookingInclude;

const ctxFor = (b: BookingFull, locale: BookingLocale, message?: string | null) => ({
  name: b.name,
  when: formatSlot(b.slot.startsAt, locale),
  topic: topicLabel(b.topic, locale),
  meetingUrl: b.meetingUrl,
  manageUrl: manageUrl(manageTokenFor(b.id)),
  rebookUrl: rebookUrl(),
  staffName: `${b.slot.staff.firstName} ${b.slot.staff.lastName}`.trim(),
  message: message ?? b.message,
});

export const bookingIcs = (b: BookingFull, cancelled = false) => {
  const locale = asBookingLocale(b.locale);
  const t = bookingTexts[locale];
  return buildIcs({
    uid: `booking-${b.id}@triad-vision.de`,
    start: b.slot.startsAt,
    end: b.slot.endsAt,
    summary: t.icsSummary,
    description: t.icsDescription(ctxFor(b, locale)),
    location: b.meetingUrl,
    url: b.meetingUrl,
    status: cancelled ? 'CANCELLED' : 'CONFIRMED',
  });
};

type BookerMail = 'confirmed' | 'cancelledByBooker' | 'cancelledByStaff' | 'reminder24h' | 'reminder1h';

/** Text for the person who booked, in the language they booked in. */
export const bookerText = (b: BookingFull, kind: BookerMail, message?: string | null) => {
  const locale = asBookingLocale(b.locale);
  const ctx = ctxFor(b, locale, kind === 'cancelledByStaff' ? (message ?? null) : undefined);
  return { ctx, msg: bookingTexts[locale][kind](ctx) };
};

/** Emails the person who booked. Fire-and-forget safe. */
export const mailBooker = async (b: BookingFull, kind: BookerMail, message?: string | null) => {
  const { ctx, msg } = bookerText(b, kind, message);
  const cancelled = kind === 'cancelledByBooker' || kind === 'cancelledByStaff';
  const html = renderEmail(msg.title, msg.body, { label: msg.cta, url: cancelled ? ctx.rebookUrl : ctx.manageUrl });
  const attachments =
    kind === 'confirmed' || cancelled
      ? [{ filename: 'triad-vision-consultation.ics', content: bookingIcs(b, cancelled), contentType: 'text/calendar; charset=utf-8' }]
      : undefined;
  await sendMail(b.email, `Triad Vision · ${msg.title}`, html, attachments);
};

type StaffNote = 'staffNew' | 'staffCancelled' | 'staffReminder24h' | 'staffReminder1h';

/** In-app + push + email to the staff member who owns the slot, in their language. */
export const notifySlotStaff = async (b: BookingFull, kind: StaffNote, message?: string | null) => {
  const locale = asBookingLocale(b.slot.staff.locale);
  const ctx = ctxFor(b, locale, kind === 'staffCancelled' ? (message ?? null) : undefined);
  const { title, body } = bookingTexts[locale][kind](ctx);
  await notifyUser(b.slot.staffId, { type: `BOOKING_${kind.replace('staff', '').toUpperCase()}`, title, body, link: '/admin/bookings' });
};

/** A slot can be (re)booked when it has no booking or only a cancelled one. */
export const freeSlotWhere = (): Prisma.ConsultationSlotWhereInput => ({
  OR: [{ booking: { is: null } }, { booking: { is: { status: 'CANCELLED' } } }],
});

const bumpAnalytics = async () => {
  try {
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await prisma.analyticsDaily.upsert({
      where: { day_metric_source: { day, metric: 'booking', source: '' } },
      create: { day, metric: 'booking', source: '', count: 1 },
      update: { count: { increment: 1 } },
    });
  } catch {
    // counters are best effort
  }
};

// ─── Public endpoints ─────────────────────────────────────────────────

/** Free future slots, one per start time (several staff can offer the same time). */
bookingRouter.get('/slots', async (_req, res) => {
  const now = Date.now();
  const slots = await prisma.consultationSlot.findMany({
    where: {
      startsAt: { gte: new Date(now + BOOKING_MIN_NOTICE_MS), lte: new Date(now + BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000) },
      staff: { isActive: true },
      kind: 'ONLINE', // office-visit slots are booked from the client portal (lib/clientProcess/office)
      ...freeSlotWhere(),
    },
    orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, startsAt: true, endsAt: true },
    take: 2000,
  });
  const seen = new Set<string>();
  const unique = slots.filter((s) => {
    const k = `${s.startsAt.toISOString()}|${s.endsAt.toISOString()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  res.json({ slots: unique, minNoticeHours: BOOKING_MIN_NOTICE_MS / 3600000, windowDays: BOOKING_WINDOW_DAYS });
});

const createLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10, skip: () => config.isTest });
const tokenLimiter = limiter({ windowMs: 60 * 1000, limit: 30, skip: () => config.isTest });

const bookSchema = z.object({
  slotId: z.string().min(1).max(64),
  topic: z.enum(TOPICS),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z.string().trim().max(40).optional().or(z.literal('').transform(() => undefined)),
  message: z.string().trim().max(2000).optional().or(z.literal('').transform(() => undefined)),
  locale: z.enum(['az', 'de', 'en', 'ru']).catch('az'),
  consent: z.literal(true),
  // honeypot: real users never fill this hidden field
  website: z.string().max(200).optional(),
});

bookingRouter.post('/', createLimiter, async (req, res) => {
  const body = parse(bookSchema, req.body);
  if (body.website) {
    // A bot filled the hidden field: answer like a success so it learns nothing.
    res.status(201).json({ booking: { id: 'ok', status: 'BOOKED' } });
    return;
  }

  const recent = await prisma.booking.count({ where: { email: body.email, createdAt: { gte: new Date(Date.now() - WEEK_MS) } } });
  if (recent >= BOOKING_MAX_PER_EMAIL) throw new HttpError(429, 'BOOKING_LIMIT');

  const slot = await prisma.consultationSlot.findUnique({
    where: { id: body.slotId },
    include: { booking: { select: { status: true } }, staff: { select: { isActive: true } } },
  });
  if (!slot || !slot.staff.isActive || slot.kind !== 'ONLINE') throw notFound('SLOT_NOT_FOUND');
  if (slot.startsAt.getTime() < Date.now() + BOOKING_MIN_NOTICE_MS) throw new HttpError(400, 'SLOT_TOO_SOON');
  if (slot.booking && slot.booking.status !== 'CANCELLED') throw new HttpError(409, 'SLOT_TAKEN');

  const id = crypto.randomUUID();
  const token = manageTokenFor(id);
  let booking: BookingFull;
  try {
    booking = await prisma.$transaction(async (tx) => {
      // A cancelled booking still holds the slot row (slotId is unique); replace it.
      await tx.booking.deleteMany({ where: { slotId: slot.id, status: 'CANCELLED' } });
      return tx.booking.create({
        data: {
          id,
          slotId: slot.id,
          userId: req.user?.id ?? null,
          name: body.name,
          email: body.email,
          phone: body.phone ?? null,
          topic: body.topic,
          message: body.message ?? null,
          locale: body.locale,
          meetingUrl: newMeetingUrl(),
          manageToken: hashToken(token),
        },
        include: bookingInclude,
      });
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    // P2002: someone else booked the slot first. P2034: write conflict / deadlock between two bookers.
    if (code === 'P2002' || code === 'P2034') throw new HttpError(409, 'SLOT_TAKEN');
    throw err;
  }

  void mailBooker(booking, 'confirmed').catch(() => undefined);
  void emitAutomationEvent({ type: 'BOOKING_CREATED', entityType: 'booking', entityId: booking.id }); // automation hook
  await notifySlotStaff(booking, 'staffNew').catch((e) => console.error('[booking] staff notify failed', e));
  void bumpAnalytics();

  res.status(201).json({
    booking: {
      id: booking.id,
      status: booking.status,
      startsAt: booking.slot.startsAt,
      endsAt: booking.slot.endsAt,
      meetingUrl: booking.meetingUrl,
      topic: booking.topic,
    },
    manageToken: token,
  });
});

const tokenSchema = z.string().min(20).max(200);

const byToken = async (raw: unknown) => {
  const token = parse(tokenSchema, raw);
  const booking = await prisma.booking.findUnique({ where: { manageToken: hashToken(token) }, include: bookingInclude });
  if (!booking) throw notFound('BOOKING_NOT_FOUND');
  return booking;
};

const publicView = (b: BookingFull) => ({
  id: b.id,
  status: b.status,
  name: b.name,
  email: b.email,
  phone: b.phone,
  topic: b.topic,
  message: b.message,
  locale: b.locale,
  startsAt: b.slot.startsAt,
  endsAt: b.slot.endsAt,
  meetingUrl: b.status === 'BOOKED' ? b.meetingUrl : null,
  staffName: b.slot.staff.firstName,
  canCancel: b.status === 'BOOKED' && b.slot.startsAt.getTime() > Date.now(),
});

bookingRouter.get('/manage', tokenLimiter, async (req, res) => {
  res.json({ booking: publicView(await byToken(req.query.token)) });
});

bookingRouter.post('/manage/cancel', tokenLimiter, async (req, res) => {
  const { token, reason } = parse(z.object({ token: tokenSchema, reason: z.string().trim().max(1000).optional() }), req.body);
  const booking = await byToken(token);
  if (booking.status !== 'BOOKED') throw new HttpError(409, 'BOOKING_NOT_ACTIVE');
  if (booking.slot.startsAt.getTime() <= Date.now()) throw new HttpError(409, 'BOOKING_STARTED');
  const updated = await prisma.booking.updateMany({ where: { id: booking.id, status: 'BOOKED' }, data: { status: 'CANCELLED' } });
  if (updated.count === 0) throw new HttpError(409, 'BOOKING_NOT_ACTIVE');
  const cancelled = { ...booking, status: 'CANCELLED' as const };
  void mailBooker(cancelled, 'cancelledByBooker').catch(() => undefined);
  await notifySlotStaff(cancelled, 'staffCancelled', reason ?? null).catch(() => undefined);
  res.json({ booking: publicView(cancelled) });
});

bookingRouter.get('/ics', tokenLimiter, async (req, res) => {
  const booking = await byToken(req.query.token);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="triad-vision-consultation.ics"');
  res.send(bookingIcs(booking, booking.status === 'CANCELLED'));
});
