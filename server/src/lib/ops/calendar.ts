import crypto from 'node:crypto';
import type { Locale } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { foldLine, icsEscape } from '../ics.js';
import { OPEN_STATUSES, taskKey } from '../tasks/core.js';

/**
 * Personal ICS feed for staff: embassy appointments of their cases, booked consultation slots,
 * interviews and task deadlines, as one VCALENDAR that Google / Outlook / Apple Calendar can
 * subscribe to. The token is the only secret; rotating it invalidates the old URL at once.
 */

const DAY = 24 * 60 * 60 * 1000;
const PAST_DAYS = 30;
const FUTURE_DAYS = 180;
const DEADLINE_MINUTES = 30;

export const newCalendarToken = () => crypto.randomBytes(24).toString('base64url');

export const calendarFeedUrl = (token: string) => `${config.clientUrl.replace(/\/$/, '')}/api/calendar/${token}.ics`;

export interface FeedEvent {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  url?: string;
  location?: string;
  cancelled?: boolean;
  stamp?: Date;
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Multi-event VCALENDAR (PUBLISH). Every time is UTC; readers see their own zone. */
export const buildCalendar = (name: string, events: FeedEvent[]) => {
  const lines: (string | null)[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Triad Vision//Staff calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(name)}`,
    'X-PUBLISHED-TTL:PT5M',
  ];
  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}`,
      `DTSTAMP:${icsDate(ev.stamp ?? ev.start)}`,
      `DTSTART:${icsDate(ev.start)}`,
      `DTEND:${icsDate(ev.end)}`,
      `SUMMARY:${icsEscape(ev.summary)}`,
      ev.description ? `DESCRIPTION:${icsEscape(ev.description)}` : null,
      ev.location ? `LOCATION:${icsEscape(ev.location)}` : null,
      ev.url ? `URL:${ev.url}` : null,
      `STATUS:${ev.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines
    .filter((l): l is string => l !== null)
    .map(foldLine)
    .join('\r\n') + '\r\n';
};

const LABEL: Record<Locale, { appointment: string; consultation: string; interview: string; deadline: string; calendar: string }> = {
  az: { appointment: 'Səfirlik görüşü', consultation: 'Konsultasiya', interview: 'Müsahibə', deadline: 'Son tarix', calendar: 'Triad Vision' },
  de: { appointment: 'Botschaftstermin', consultation: 'Beratung', interview: 'Vorstellungsgespräch', deadline: 'Frist', calendar: 'Triad Vision' },
  en: { appointment: 'Embassy appointment', consultation: 'Consultation', interview: 'Interview', deadline: 'Deadline', calendar: 'Triad Vision' },
  ru: { appointment: 'Встреча в посольстве', consultation: 'Консультация', interview: 'Собеседование', deadline: 'Срок', calendar: 'Triad Vision' },
};

const l10n = (v: unknown, locale: Locale) => {
  const o = (v ?? {}) as Partial<Record<Locale, string>>;
  return o[locale] || o.az || o.en || '';
};

/** Everything on a staff member's plate as feed events, newest window only (−30 d … +180 d). */
export const staffFeedEvents = async (user: { id: string; locale: Locale; firstName: string; lastName: string }, now = new Date()): Promise<FeedEvent[]> => {
  const from = new Date(now.getTime() - PAST_DAYS * DAY);
  const to = new Date(now.getTime() + FUTURE_DAYS * DAY);
  const L = LABEL[user.locale];
  const admin = config.clientUrl.replace(/\/$/, '');
  const [cases, bookings, interviews, tasks] = await Promise.all([
    prisma.case.findMany({
      where: { assignedStaffId: user.id, appointmentAt: { gte: from, lte: to } },
      select: { id: true, number: true, status: true, appointmentAt: true, appointmentPlace: true, profession: true, updatedAt: true, client: { select: { firstName: true, lastName: true } } },
    }),
    prisma.booking.findMany({
      where: { slot: { staffId: user.id, startsAt: { gte: from, lte: to } } },
      select: { id: true, status: true, name: true, topic: true, meetingUrl: true, message: true, createdAt: true, slot: { select: { startsAt: true, endsAt: true } } },
    }),
    prisma.interview.findMany({
      where: { OR: [{ staffId: user.id }, { createdById: user.id }], startsAt: { gte: from, lte: to } },
      select: {
        id: true, status: true, startsAt: true, endsAt: true, meetingUrl: true, notes: true, updatedAt: true,
        candidate: { select: { firstName: true, lastName: true } },
        company: { select: { name: true } },
        application: { select: { vacancy: { select: { title: true } } } },
      },
    }),
    prisma.task.findMany({
      where: { status: { in: OPEN_STATUSES }, dueAt: { gte: from, lte: to }, OR: [{ assignees: { some: { userId: user.id } } }, { createdById: user.id, assignees: { none: {} } }] },
      select: { id: true, number: true, title: true, dueAt: true, priority: true, updatedAt: true },
    }),
  ]);
  const events: FeedEvent[] = [];
  for (const c of cases) {
    events.push({
      uid: `case-appointment-${c.id}@triad-vision.de`,
      start: c.appointmentAt!,
      end: new Date(c.appointmentAt!.getTime() + 60 * 60 * 1000),
      summary: `${L.appointment}: ${c.client.firstName} ${c.client.lastName} (${c.number})`,
      description: `${c.profession}${c.appointmentPlace ? `\n${c.appointmentPlace}` : ''}`,
      location: c.appointmentPlace ?? undefined,
      url: `${admin}/admin/cases/${c.id}`,
      cancelled: c.status === 'CANCELLED',
      stamp: c.updatedAt,
    });
  }
  for (const b of bookings) {
    events.push({
      uid: `booking-staff-${b.id}@triad-vision.de`,
      start: b.slot.startsAt,
      end: b.slot.endsAt,
      summary: `${L.consultation}: ${b.name}`,
      description: `${b.topic ?? ''}${b.message ? `\n${b.message}` : ''}\n${b.meetingUrl}`.trim(),
      location: b.meetingUrl,
      url: `${admin}/admin/bookings`,
      cancelled: b.status === 'CANCELLED',
      stamp: b.createdAt,
    });
  }
  for (const i of interviews) {
    events.push({
      uid: `interview-${i.id}@triad-vision.de`,
      start: i.startsAt,
      end: i.endsAt,
      summary: `${L.interview}: ${i.candidate.firstName} ${i.candidate.lastName}${i.company ? ` · ${i.company.name}` : ''}`,
      description: `${l10n(i.application?.vacancy.title, user.locale)}${i.notes ? `\n${i.notes}` : ''}${i.meetingUrl ? `\n${i.meetingUrl}` : ''}`.trim(),
      location: i.meetingUrl ?? undefined,
      url: `${admin}/admin/interviews`,
      cancelled: i.status === 'CANCELLED',
      stamp: i.updatedAt,
    });
  }
  for (const t of tasks) {
    events.push({
      uid: `task-due-${t.id}@triad-vision.de`,
      start: t.dueAt!,
      end: new Date(t.dueAt!.getTime() + DEADLINE_MINUTES * 60 * 1000),
      summary: `${L.deadline}: ${taskKey(t.number)} ${t.title}`,
      description: t.priority,
      url: `${admin}/workspace/tasks/${taskKey(t.number)}`,
      stamp: t.updatedAt,
    });
  }
  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return events;
};

export const calendarName = (locale: Locale) => LABEL[locale].calendar;
