import type { Locale } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import type { FeedEvent } from '../ops/calendar.js';

/**
 * Personal ICS feed for a client (CLIENT role): only their own dates, titled in their language and
 * linking back to the portal page that handles each one. Never carries staff notes or other people's
 * data — every query is scoped to the client's own user id.
 *
 *   - embassy appointment of each own case (Case.appointmentAt / appointmentPlace)
 *   - job interviews as candidate (not cancelled)
 *   - arrival in Germany (ArrivalPlan.arrivalTime, or the flight day as an all-day entry)
 *   - due date of open translation orders (all-day)
 *   - e-signature requests waiting for the client's signature: expiry day as an all-day reminder
 */

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const PAST_DAYS = 30;
const FUTURE_DAYS = 180;

const LABEL: Record<Locale, { appointment: string; interview: string; arrival: string; flight: string; translation: string; signature: string; calendar: string }> = {
  az: { appointment: 'Səfirlik görüşü', interview: 'İş müsahibəsi', arrival: 'Almaniyaya gəliş', flight: 'Almaniyaya uçuş', translation: 'Tərcümə hazır olmalıdır', signature: 'İmzalamağın son günü', calendar: 'Triad Vision' },
  de: { appointment: 'Botschaftstermin', interview: 'Vorstellungsgespräch', arrival: 'Ankunft in Deutschland', flight: 'Flug nach Deutschland', translation: 'Übersetzung fällig', signature: 'Letzter Tag zum Unterschreiben', calendar: 'Triad Vision' },
  en: { appointment: 'Embassy appointment', interview: 'Job interview', arrival: 'Arrival in Germany', flight: 'Flight to Germany', translation: 'Translation due', signature: 'Last day to sign', calendar: 'Triad Vision' },
  ru: { appointment: 'Встреча в посольстве', interview: 'Собеседование', arrival: 'Прибытие в Германию', flight: 'Вылет в Германию', translation: 'Срок готовности перевода', signature: 'Последний день для подписи', calendar: 'Triad Vision' },
};

const l10n = (v: unknown, locale: Locale) => {
  const o = (v ?? {}) as Partial<Record<Locale, string>>;
  return o[locale] || o.az || o.en || '';
};

const trKey = (n: number) => `TR-${String(n).padStart(4, '0')}`;

export const clientFeedEvents = async (user: { id: string; locale: Locale }, now = new Date()): Promise<FeedEvent[]> => {
  const from = new Date(now.getTime() - PAST_DAYS * DAY);
  const to = new Date(now.getTime() + FUTURE_DAYS * DAY);
  const L = LABEL[user.locale] ?? LABEL.az;
  const portal = `${config.clientUrl.replace(/\/$/, '')}/account`;

  const [cases, interviews, arrivals, translations, signers] = await Promise.all([
    prisma.case.findMany({
      where: { clientId: user.id, appointmentAt: { gte: from, lte: to } },
      select: { id: true, number: true, status: true, appointmentAt: true, appointmentPlace: true, updatedAt: true },
    }),
    prisma.interview.findMany({
      where: { candidateId: user.id, status: { not: 'CANCELLED' }, startsAt: { gte: from, lte: to } },
      select: { id: true, startsAt: true, endsAt: true, meetingUrl: true, updatedAt: true, company: { select: { name: true } }, application: { select: { vacancy: { select: { title: true } } } } },
    }),
    prisma.arrivalPlan.findMany({
      where: {
        clientId: user.id,
        status: { in: ['SUBMITTED', 'CONFIRMED', 'COMPLETED'] },
        OR: [{ arrivalTime: { gte: from, lte: to } }, { arrivalTime: null, flightDate: { gte: from, lte: to } }],
      },
      select: { id: true, arrivalTime: true, flightDate: true, flightNumber: true, departureAirport: true, arrivalAirport: true, updatedAt: true },
    }),
    prisma.translationOrder.findMany({
      where: { clientId: user.id, status: { notIn: ['DELIVERED', 'CANCELLED'] }, dueAt: { gte: from, lte: to } },
      select: { id: true, number: true, dueAt: true, updatedAt: true },
    }),
    prisma.signatureSigner.findMany({
      where: { userId: user.id, status: { in: ['PENDING', 'VIEWED'] }, request: { status: 'SENT', expiresAt: { gte: from, lte: to } } },
      select: { id: true, updatedAt: true, request: { select: { id: true, title: true, expiresAt: true } } },
    }),
  ]);

  const events: FeedEvent[] = [];
  for (const c of cases) {
    events.push({
      uid: `client-appointment-${c.id}@triad-vision.de`,
      start: c.appointmentAt!,
      end: new Date(c.appointmentAt!.getTime() + HOUR),
      summary: L.appointment,
      description: [c.number, c.appointmentPlace].filter(Boolean).join('\n'),
      location: c.appointmentPlace ?? undefined,
      url: `${portal}/cases/${c.id}`,
      cancelled: c.status === 'CANCELLED',
      stamp: c.updatedAt,
    });
  }
  for (const i of interviews) {
    const vacancy = l10n(i.application?.vacancy.title, user.locale);
    events.push({
      uid: `client-interview-${i.id}@triad-vision.de`,
      start: i.startsAt,
      end: i.endsAt,
      summary: `${L.interview}${i.company ? `: ${i.company.name}` : ''}`,
      description: [vacancy, i.meetingUrl].filter(Boolean).join('\n') || undefined,
      location: i.meetingUrl ?? undefined,
      url: `${portal}/interviews`,
      stamp: i.updatedAt,
    });
  }
  for (const a of arrivals) {
    const route = [a.departureAirport, a.arrivalAirport].filter(Boolean).join(' → ');
    const description = [a.flightNumber, route].filter(Boolean).join('\n') || undefined;
    if (a.arrivalTime) {
      events.push({
        uid: `client-arrival-${a.id}@triad-vision.de`,
        start: a.arrivalTime,
        end: new Date(a.arrivalTime.getTime() + HOUR),
        summary: `${L.arrival}${a.flightNumber ? ` · ${a.flightNumber}` : ''}`,
        description,
        location: a.arrivalAirport ?? undefined,
        url: `${portal}/arrival`,
        stamp: a.updatedAt,
      });
    } else {
      events.push({
        uid: `client-arrival-${a.id}@triad-vision.de`,
        start: a.flightDate!,
        end: a.flightDate!,
        allDay: true,
        summary: `${L.flight}${a.flightNumber ? ` · ${a.flightNumber}` : ''}`,
        description,
        url: `${portal}/arrival`,
        stamp: a.updatedAt,
      });
    }
  }
  for (const t of translations) {
    events.push({
      uid: `client-translation-${t.id}@triad-vision.de`,
      start: t.dueAt!,
      end: t.dueAt!,
      allDay: true,
      summary: `${L.translation}: ${trKey(t.number)}`,
      url: `${portal}/translations/${t.id}`,
      stamp: t.updatedAt,
    });
  }
  for (const s of signers) {
    events.push({
      uid: `client-signature-${s.id}@triad-vision.de`,
      start: s.request.expiresAt!,
      end: s.request.expiresAt!,
      allDay: true,
      summary: `${L.signature}: ${s.request.title}`,
      url: `${portal}/signatures/${s.id}`,
      stamp: s.updatedAt,
    });
  }
  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return events;
};

export const clientCalendarName = (locale: Locale) => (LABEL[locale] ?? LABEL.az).calendar;
