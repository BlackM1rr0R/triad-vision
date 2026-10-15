import type { AttendeeStatus, Locale, Prisma, Role } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { hasMinRole } from '../../middleware/auth.js';
import { notifyUser } from '../notifications.js';
import { publish } from '../messaging/realtime.js';
import { staffFeedEvents, type FeedEvent } from '../ops/calendar.js';
import { expandOccurrences } from './rrule.js';
import { calendarTexts, formatWhen } from './texts.js';

/** Shared rules and response shapes for the team calendar (/api/events). */

export const STAFF_ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];
export const EVENT_COLORS = ['blue', 'green', 'amber', 'red', 'violet', 'pink', 'teal', 'slate'] as const;
export const REMINDER_PRESETS = [0, 5, 10, 15, 30, 60, 120, 1440];
/** Longest window one listing may ask for (a year keeps recurring expansion bounded). */
export const MAX_RANGE_MS = 370 * 24 * 60 * 60 * 1000;

export interface Actor {
  id: string;
  role: Role;
  firstName: string;
  lastName: string;
  locale: Locale;
}

export const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');

export const personSelect = { id: true, firstName: true, lastName: true, role: true } satisfies Prisma.UserSelect;

export const eventInclude = {
  owner: { select: personSelect },
  attendees: { select: { userId: true, status: true, user: { select: personSelect } } },
  case: { select: { id: true, number: true } },
} satisfies Prisma.CalendarEventInclude;

export type EventRow = Prisma.CalendarEventGetPayload<{ include: typeof eventInclude }>;

export type Source = 'event' | 'case' | 'booking' | 'interview' | 'task';

// ─── Permissions / visibility ──────────────────────────────────────────

export const isOwner = (e: { ownerId: string }, actor: Pick<Actor, 'id'>) => e.ownerId === actor.id;
export const isAttendee = (e: { attendees: { userId: string }[] }, actor: Pick<Actor, 'id'>) => e.attendees.some((a) => a.userId === actor.id);
export const canManage = (e: { ownerId: string }, actor: Pick<Actor, 'id' | 'role'>) => isOwner(e, actor) || hasMinRole(actor.role, 'ADMIN');
/** Full details: owner, attendees, admins, and everyone for TEAM-visible events. */
export const canSee = (e: EventRow, actor: Pick<Actor, 'id' | 'role'>) => canManage(e, actor) || isAttendee(e, actor) || e.visibility === 'TEAM';

// ─── Response shapes ───────────────────────────────────────────────────

export const toEvent = (e: EventRow, actor: Pick<Actor, 'id' | 'role'>) => {
  const mine = e.attendees.find((a) => a.userId === actor.id);
  return {
    id: e.id,
    source: 'event' as Source,
    title: e.title,
    description: e.description,
    location: e.location,
    meetingUrl: e.meetingUrl,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    allDay: e.allDay,
    color: e.color,
    visibility: e.visibility,
    rrule: e.rrule,
    reminderMinutes: e.reminderMinutes,
    caseId: e.caseId,
    case: e.case,
    ownerId: e.ownerId,
    owner: e.owner,
    attendees: e.attendees.map((a) => ({ ...a.user, status: a.status })),
    myStatus: mine?.status ?? null,
    isOwner: isOwner(e, actor),
    isAttendee: !!mine,
    canEdit: canManage(e, actor),
    busy: false,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
};

export type EventDto = ReturnType<typeof toEvent>;

/** A private event of a colleague: time only. */
export const toBusy = (e: EventRow, start: Date, end: Date) => ({
  id: e.id,
  source: 'event' as Source,
  title: null,
  startsAt: start,
  endsAt: end,
  allDay: e.allDay,
  ownerId: e.ownerId,
  owner: e.owner,
  attendees: e.attendees.map((a) => ({ id: a.userId })),
  visibility: e.visibility,
  busy: true,
  canEdit: false,
  color: null as string | null,
  rrule: e.rrule,
});

const SOURCE_BY_UID: [string, Source][] = [
  ['case-appointment-', 'case'],
  ['booking-staff-', 'booking'],
  ['interview-', 'interview'],
  ['task-due-', 'task'],
];

const relativeLink = (url?: string) => {
  if (!url) return null;
  const base = config.clientUrl.replace(/\/$/, '');
  return url.startsWith(base) ? url.slice(base.length) || '/' : url;
};

/** Read-only items from cases, bookings, interviews and task deadlines. */
export const toSystemItem = (f: FeedEvent, userId: string) => {
  const source = SOURCE_BY_UID.find(([p]) => f.uid.startsWith(p))?.[1] ?? 'event';
  return {
    id: f.uid.replace(/@.*$/, ''),
    source,
    title: f.summary,
    description: f.description ?? null,
    location: f.location ?? null,
    meetingUrl: f.location && /^https?:\/\//.test(f.location) ? f.location : null,
    startsAt: f.start,
    endsAt: f.end,
    allDay: false,
    cancelled: !!f.cancelled,
    link: relativeLink(f.url),
    ownerId: userId,
    busy: false,
    canEdit: false,
    color: null as string | null,
  };
};

export type SystemItemDto = ReturnType<typeof toSystemItem>;

/** Non-cancelled system items of one staff member inside [from, to). */
export const systemItemsFor = async (user: { id: string; locale: Locale; firstName: string; lastName: string }, from: Date, to: Date, now = new Date()) => {
  const items = await staffFeedEvents(user, now);
  return items.filter((f) => !f.cancelled && f.start.getTime() < to.getTime() && f.end.getTime() > from.getTime()).map((f) => toSystemItem(f, user.id));
};

// ─── Querying ──────────────────────────────────────────────────────────

/** Events that may overlap [from, to): single ones by their span, recurring ones by their start (expansion filters). */
export const rangeWhere = (from: Date, to: Date): Prisma.CalendarEventWhereInput => ({
  startsAt: { lt: to },
  OR: [{ rrule: null, endsAt: { gt: from } }, { rrule: { not: null } }],
});

/** Occurrences of a stored event in the window as DTOs (one per occurrence; recurring ones carry `occurrence`). */
export const occurrencesOf = <T extends { startsAt: Date; endsAt: Date }>(base: T, e: { startsAt: Date; endsAt: Date; rrule: string | null }, from: Date, to: Date) =>
  expandOccurrences(e.startsAt, e.endsAt, e.rrule, from, to).map((o) => ({ ...base, startsAt: o.start, endsAt: o.end, occurrence: e.rrule ? o.start.toISOString() : null }));

/** Busy blocks of several users from every source (own/attended events not declined, plus system items). */
export const freeBusy = async (userIds: string[], from: Date, to: Date, now = new Date()) => {
  const users = await prisma.user.findMany({ where: { id: { in: userIds }, isActive: true, role: { in: STAFF_ROLES } }, select: { id: true, firstName: true, lastName: true, locale: true } });
  const events = await prisma.calendarEvent.findMany({
    where: { AND: [rangeWhere(from, to), { OR: [{ ownerId: { in: users.map((u) => u.id) } }, { attendees: { some: { userId: { in: users.map((u) => u.id) }, status: { not: 'DECLINED' } } } }] }] },
    select: { id: true, ownerId: true, startsAt: true, endsAt: true, rrule: true, allDay: true, title: true, visibility: true, attendees: { select: { userId: true, status: true } } },
  });
  return Promise.all(
    users.map(async (u) => {
      const busy: { start: Date; end: Date; source: Source; title: string | null; id: string }[] = [];
      for (const e of events) {
        const involved = e.ownerId === u.id || e.attendees.some((a) => a.userId === u.id && a.status !== 'DECLINED');
        if (!involved) continue;
        for (const o of expandOccurrences(e.startsAt, e.endsAt, e.rrule, from, to)) busy.push({ start: o.start, end: o.end, source: 'event', title: e.visibility === 'TEAM' ? e.title : null, id: e.id });
      }
      for (const s of await systemItemsFor(u, from, to, now)) busy.push({ start: s.startsAt, end: s.endsAt, source: s.source, title: s.title, id: s.id });
      busy.sort((a, b) => a.start.getTime() - b.start.getTime());
      return { userId: u.id, firstName: u.firstName, lastName: u.lastName, busy };
    }),
  );
};

export const activeStaff = (ids: string[]) =>
  ids.length
    ? prisma.user.findMany({ where: { id: { in: [...new Set(ids)] }, isActive: true, role: { in: STAFF_ROLES } }, select: { id: true, firstName: true, lastName: true, locale: true } })
    : Promise.resolve([]);

// ─── Realtime + notifications ──────────────────────────────────────────

export const eventLink = (id: string) => `/workspace/calendar?event=${id}`;

export const publishEvent = (e: { id: string; ownerId: string; attendees: { userId: string }[] }, action: 'created' | 'updated' | 'deleted' | 'responded', extra: Record<string, unknown> = {}) => {
  publish([e.ownerId, ...e.attendees.map((a) => a.userId)], 'calendar.updated', { eventId: e.id, action, ...extra });
};

const safely = async (what: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (err) {
    console.error(`[calendar] notification failed: ${what}`, err);
  }
};

type Kind = 'invite' | 'updated' | 'cancelled';

/** Invitation / change / cancellation to the given attendees (never the actor). */
export const notifyAttendees = (e: EventRow, userIds: string[], kind: Kind, actor: Actor) =>
  safely(kind, async () => {
    for (const u of await activeStaff(userIds.filter((x) => x !== actor.id))) {
      const tx = calendarTexts(u.locale);
      const msg = tx[kind]({ actor: fullName(actor), title: e.title, when: formatWhen(e.startsAt, e.endsAt, e.allDay, u.locale) });
      await notifyUser(u.id, { type: kind === 'invite' ? 'CALENDAR_INVITE' : kind === 'updated' ? 'CALENDAR_UPDATED' : 'CALENDAR_CANCELLED', ...msg, link: kind === 'cancelled' ? '/workspace/calendar' : eventLink(e.id), ctaLabel: tx.cta, caseId: e.caseId ?? undefined });
    }
  });

/** The owner hears about every response. */
export const notifyResponse = (e: EventRow, status: AttendeeStatus, actor: Actor) =>
  safely('response', async () => {
    if (e.ownerId === actor.id) return;
    const [owner] = await activeStaff([e.ownerId]);
    if (!owner) return;
    const tx = calendarTexts(owner.locale);
    const msg = tx.response({ actor: fullName(actor), title: e.title, status });
    await notifyUser(owner.id, { type: 'CALENDAR_RESPONSE', ...msg, link: eventLink(e.id), ctaLabel: tx.cta, email: false });
  });

export const notifyReminder = (e: EventRow, start: Date, end: Date, userIds: string[]) =>
  safely('reminder', async () => {
    for (const u of await activeStaff(userIds)) {
      const tx = calendarTexts(u.locale);
      const msg = tx.reminder({ title: e.title, when: formatWhen(start, end, e.allDay, u.locale), minutes: e.reminderMinutes ?? 0, location: e.location ?? e.meetingUrl });
      await notifyUser(u.id, { type: 'CALENDAR_REMINDER', ...msg, link: eventLink(e.id), ctaLabel: tx.cta, email: false });
    }
  });
