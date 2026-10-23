import type { InfoEvent, InfoEventRegistration } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { buildIcs } from '../ics.js';
import { renderEmail, sendMail } from '../mailer.js';
import { onInquiryCreated } from '../assignment/inquiry.js';
import { asEventLocale, eventTexts, formatEventTime, type EventCtx, type EventLocale } from './eventTexts.js';

/** Info sessions / webinars: e-mails with .ics, leads, reminders (24 h / 1 h) and the follow-up mail. */

const HOUR = 60 * 60 * 1000;

const pickL10n = (value: unknown, locale: EventLocale) => {
  if (!value || typeof value !== 'object') return '';
  const v = value as Record<string, unknown>;
  const s = v[locale] ?? v.az ?? v.en ?? '';
  return typeof s === 'string' ? s : '';
};

export const eventUrl = (slug: string) => `${config.clientUrl}/events/${encodeURIComponent(slug)}`;
export const bookingUrl = () => `${config.clientUrl}/booking`;

export const eventWhere = (e: Pick<InfoEvent, 'mode' | 'meetingUrl' | 'address'>) =>
  e.mode === 'ONLINE' ? (e.meetingUrl ?? '') : (e.address ?? '');

const ctxFor = (e: InfoEvent, r: Pick<InfoEventRegistration, 'name' | 'locale'>, note?: string): EventCtx => {
  const locale = asEventLocale(r.locale);
  return {
    name: r.name,
    title: pickL10n(e.title, locale),
    when: formatEventTime(e.startsAt, locale),
    where: eventWhere(e),
    online: e.mode === 'ONLINE',
    eventUrl: eventUrl(e.slug),
    bookingUrl: bookingUrl(),
    note,
  };
};

export const eventIcs = (e: InfoEvent, locale: EventLocale, cancelled = false) => {
  const title = pickL10n(e.title, locale);
  const ctx = ctxFor(e, { name: '', locale });
  return buildIcs({
    uid: `info-event-${e.id}@triad-vision.de`,
    start: e.startsAt,
    end: e.endsAt,
    summary: `Triad Vision · ${title}`,
    description: eventTexts[locale].icsDescription(ctx),
    location: eventWhere(e) || undefined,
    url: e.mode === 'ONLINE' && e.meetingUrl ? e.meetingUrl : eventUrl(e.slug),
    status: cancelled ? 'CANCELLED' : 'CONFIRMED',
  });
};

export type RegistrantMail = 'confirmed' | 'reminder24h' | 'reminder1h' | 'cancelled' | 'followUp';

/** E-mails one registrant in the language they registered in. */
export const mailRegistrant = async (e: InfoEvent, r: InfoEventRegistration, kind: RegistrantMail) => {
  const locale = asEventLocale(r.locale);
  const note = kind === 'followUp' ? pickL10n(e.followUpNote, locale).trim() || undefined : undefined;
  const ctx = ctxFor(e, r, note);
  const msg = eventTexts[locale][kind](ctx);
  const ctaUrl =
    kind === 'followUp' || kind === 'cancelled'
      ? ctx.bookingUrl
      : (kind === 'reminder1h' || kind === 'reminder24h') && ctx.online && ctx.where
        ? ctx.where
        : ctx.eventUrl;
  const attachments =
    kind === 'confirmed' || kind === 'cancelled'
      ? [{ filename: 'triad-vision-event.ics', content: eventIcs(e, locale, kind === 'cancelled'), contentType: 'text/calendar; charset=utf-8' }]
      : undefined;
  await sendMail(r.email, `Triad Vision · ${msg.title}`, renderEmail(msg.title, msg.body, { label: msg.cta, url: ctaUrl }), attachments);
};

const digits = (phone: string | null | undefined) => (phone ?? '').replace(/\D/g, '');

/**
 * Every registrant becomes a lead (Inquiry, source "event:<id>"), unless the person is already known:
 * an existing inquiry or account with the same e-mail, or an inquiry with the same phone number.
 * Returns the inquiry id that represents the person (new or existing), or null for existing accounts.
 */
export const leadForRegistrant = async (e: InfoEvent, r: { name: string; email: string; phone?: string | null; locale: string }) => {
  const email = r.email.trim().toLowerCase();
  const byEmail = await prisma.inquiry.findFirst({ where: { email }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  if (byEmail) return { inquiryId: byEmail.id, created: false };
  const phoneDigits = digits(r.phone);
  if (phoneDigits.length >= 7) {
    const tail = phoneDigits.slice(-9);
    // Phone numbers are stored as typed ("+994 50 111 22 33"): compare the last 9 digits only.
    const same = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM Inquiry WHERE phone IS NOT NULL AND REGEXP_REPLACE(phone, '[^0-9]', '') LIKE ${`%${tail}`} ORDER BY createdAt ASC LIMIT 1`;
    if (same[0]) return { inquiryId: same[0].id, created: false };
  }
  const account = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (account) return { inquiryId: null, created: false };
  const title = pickL10n(e.title, 'az') || pickL10n(e.title, asEventLocale(r.locale));
  const inquiry = await prisma.inquiry.create({
    data: {
      kind: 'contact',
      source: `event:${e.id}`,
      contactName: r.name,
      email,
      phone: r.phone ?? null,
      locale: asEventLocale(r.locale),
      message: `Tədbir qeydiyyatı: ${title} (${e.startsAt.toISOString().slice(0, 16).replace('T', ' ')} UTC)`,
    },
  });
  void onInquiryCreated(inquiry.id);
  return { inquiryId: inquiry.id, created: true };
};

const claim = async (key: string) => {
  try {
    await prisma.reminderLog.create({ data: { key } });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
};

/**
 * Reminders 24 h and 1 h before a published event, to every registrant. Idempotent through
 * ReminderLog ("info-event-<kind>:<registrationId>:<startsAt ISO>", so a moved event reminds again).
 * Registrations made less than 24 h before the start get no 24 h reminder (the confirmation is enough).
 */
export const runEventReminders = async (now = new Date()) => {
  const events = await prisma.infoEvent.findMany({
    where: { status: 'PUBLISHED', startsAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) } },
    include: { registrations: true },
  });
  let sent = 0;
  for (const e of events) {
    const left = e.startsAt.getTime() - now.getTime();
    const kind = left <= HOUR ? '1h' : '24h';
    for (const r of e.registrations) {
      if (kind === '24h' && e.startsAt.getTime() - r.createdAt.getTime() < 24 * HOUR) continue;
      if (!(await claim(`info-event-${kind}:${r.id}:${e.startsAt.toISOString()}`))) continue;
      await mailRegistrant(e, r, kind === '1h' ? 'reminder1h' : 'reminder24h');
      sent++;
    }
  }
  return sent;
};

export type FollowUpAudience = 'attended' | 'all' | 'noShow';

/** Post-event follow-up ("Thanks for attending — book your free consultation"). Each registrant at most once. */
export const sendFollowUps = async (eventId: string, audience: FollowUpAudience) => {
  const e = await prisma.infoEvent.findUnique({ where: { id: eventId }, include: { registrations: true } });
  if (!e) return null;
  const targets = e.registrations.filter(
    (r) =>
      !r.followUpSentAt &&
      (audience === 'all' || (audience === 'attended' ? r.attendance === 'CHECKED_IN' : r.attendance === 'NO_SHOW')),
  );
  let sent = 0;
  for (const r of targets) {
    const { count } = await prisma.infoEventRegistration.updateMany({ where: { id: r.id, followUpSentAt: null }, data: { followUpSentAt: new Date() } });
    if (!count) continue;
    await mailRegistrant(e, r, 'followUp');
    sent++;
  }
  await prisma.infoEvent.update({ where: { id: e.id }, data: { followUpSentAt: new Date() } });
  return { sent, skipped: e.registrations.length - sent };
};

export { pickL10n };
