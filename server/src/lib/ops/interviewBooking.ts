import type { InterviewInviteStatus, Locale, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { notifyUser } from '../notifications.js';
import { expandOccurrences } from '../calendar/rrule.js';
import { emitWebhook } from './webhooks.js';
import { interviewWebhookPayload, notifyCandidate, notifyCompany, notifyInterviewStaff, type InterviewFull } from './interviews.js';
import type { AvailabilityRule, Interval } from './interviewSlots.js';

/**
 * Interview calendar, database side: an employer's availability and booking rules, the busy times
 * a slot must not touch, "pick a time" invites and their notifications. The slot maths is pure and
 * lives in interviewSlots.ts; the routes are in routes/interviewCalendar.ts.
 */

const HOUR = 60 * 60 * 1000;

export const SETTINGS_DEFAULTS = { slotMinutes: 45, bufferMinutes: 15, minNoticeHours: 24, horizonDays: 21, cancelCutoffHours: 12, maxReschedules: 2 };
export type SchedulingSettings = typeof SETTINGS_DEFAULTS;

export const SETTINGS_LIMITS: Record<keyof SchedulingSettings, [number, number]> = {
  slotMinutes: [15, 240],
  bufferMinutes: [0, 120],
  minNoticeHours: [0, 336],
  horizonDays: [1, 90],
  cancelCutoffHours: [0, 168],
  maxReschedules: [0, 10],
};

export const loadSettings = async (companyId: string): Promise<SchedulingSettings> => {
  const s = await prisma.interviewSchedulingSettings.findUnique({ where: { companyId } });
  if (!s) return { ...SETTINGS_DEFAULTS };
  const { slotMinutes, bufferMinutes, minNoticeHours, horizonDays, cancelCutoffHours, maxReschedules } = s;
  return { slotMinutes, bufferMinutes, minNoticeHours, horizonDays, cancelCutoffHours, maxReschedules };
};

export const loadRules = (companyId: string) =>
  prisma.interviewAvailability.findMany({ where: { companyId }, orderBy: [{ kind: 'asc' }, { weekday: 'asc' }, { day: 'asc' }, { startTime: 'asc' }] });

/** Free hours exist at all (weekly or one-off) — without them nobody can pick a time. */
export const hasAvailability = (rules: AvailabilityRule[]) => rules.some((r) => r.kind !== 'BLOCK');

/**
 * Times a new slot must keep clear of in [from, to): the employer's live interviews, the
 * candidate's live interviews (any employer) and calendar events of the employer's users
 * (owned or attended, recurring ones expanded). `exceptInterviewId` is the interview being moved.
 */
export const busyTimes = async (companyId: string, candidateId: string | null, from: Date, to: Date, exceptInterviewId?: string): Promise<Interval[]> => {
  const live = { status: { in: ['PROPOSED', 'CONFIRMED'] as ('PROPOSED' | 'CONFIRMED')[] }, startsAt: { lt: to }, endsAt: { gt: from }, ...(exceptInterviewId ? { id: { not: exceptInterviewId } } : {}) };
  const [interviews, users] = await Promise.all([
    prisma.interview.findMany({ where: { ...live, OR: [{ companyId }, ...(candidateId ? [{ candidateId }] : [])] }, select: { startsAt: true, endsAt: true } }),
    prisma.user.findMany({ where: { companyId, role: 'COMPANY', isActive: true }, select: { id: true } }),
  ]);
  const ids = users.map((u) => u.id);
  const events = ids.length
    ? await prisma.calendarEvent.findMany({
        where: {
          startsAt: { lt: to },
          AND: [
            { OR: [{ ownerId: { in: ids } }, { attendees: { some: { userId: { in: ids }, status: { not: 'DECLINED' } } } }] },
            // A recurring event's own end is only its first occurrence; expandOccurrences sorts those out.
            { OR: [{ rrule: { not: null } }, { endsAt: { gt: from } }] },
          ],
        },
        select: { startsAt: true, endsAt: true, rrule: true },
        take: 2000,
      })
    : [];
  const out: Interval[] = interviews.map((i) => ({ start: i.startsAt, end: i.endsAt }));
  for (const e of events) for (const o of expandOccurrences(e.startsAt, e.endsAt, e.rrule, from, to)) out.push(o);
  return out;
};

/** Booking rules relative to the slot's own length (the invite decides the length). */
export const slotOptions = (s: SchedulingSettings, minutes: number, now: Date) => ({
  slotMinutes: minutes,
  bufferMinutes: s.bufferMinutes,
  minNoticeMinutes: s.minNoticeHours * 60,
  now,
});

export const horizonEnd = (s: SchedulingSettings, now: Date) => new Date(now.getTime() + s.horizonDays * 24 * HOUR);

// ─── Invites ───────────────────────────────────────────────────────────

export const inviteInclude = {
  company: { select: { id: true, name: true } },
  candidate: { select: { id: true, firstName: true, lastName: true, locale: true, profession: true } },
  application: { select: { id: true, status: true, vacancy: { select: { id: true, title: true, slug: true } } } },
  interview: { select: { id: true, status: true, startsAt: true, endsAt: true, meetingUrl: true } },
} satisfies Prisma.InterviewInviteInclude;

export type InviteFull = Prisma.InterviewInviteGetPayload<{ include: typeof inviteInclude }>;

const anonymised = (u: { firstName: string; lastName: string }) => `${u.firstName.trim()}${u.lastName.trim() ? ` ${u.lastName.trim()[0].toUpperCase()}.` : ''}`;

const liveInterview = (i: InviteFull) => (i.interview && (i.interview.status === 'PROPOSED' || i.interview.status === 'CONFIRMED') ? i.interview : null);

/** What the candidate may still do with a booked interview (cut-off and reschedule limit). */
export const moveRules = (i: InviteFull, s: SchedulingSettings, now = new Date()) => {
  const iv = liveInterview(i);
  if (!iv) return { canMove: false, canCancel: false, moveUntil: null as Date | null, reschedulesLeft: 0 };
  const moveUntil = new Date(iv.startsAt.getTime() - s.cancelCutoffHours * HOUR);
  const inTime = now.getTime() <= moveUntil.getTime();
  const reschedulesLeft = Math.max(0, s.maxReschedules - i.reschedules);
  return { canMove: inTime && reschedulesLeft > 0, canCancel: inTime, moveUntil, reschedulesLeft };
};

export const inviteView = (i: InviteFull, audience: 'staff' | 'company' | 'candidate', s: SchedulingSettings, now = new Date()) => {
  const iv = liveInterview(i);
  return {
    id: i.id,
    status: i.status as InterviewInviteStatus,
    minutes: i.minutes,
    notes: i.notes,
    createdAt: i.createdAt,
    company: i.company,
    application: i.application ? { id: i.application.id, status: i.application.status, vacancy: i.application.vacancy } : null,
    candidate: { id: i.candidate.id, name: audience === 'company' ? anonymised(i.candidate) : `${i.candidate.firstName} ${i.candidate.lastName}`.trim(), profession: i.candidate.profession },
    interview: iv ? { id: iv.id, status: iv.status, startsAt: iv.startsAt, endsAt: iv.endsAt, meetingUrl: iv.meetingUrl } : null,
    reschedules: i.reschedules,
    ...moveRules(i, s, now),
  };
};

/** A cancelled / declined / deleted interview closes its invite (the candidate cannot re-book on their own). */
export const closeInviteOf = (interviewId: string) =>
  prisma.interviewInvite.updateMany({ where: { interviewId, status: { not: 'CANCELLED' } }, data: { status: 'CANCELLED' } });

// ─── Texts ─────────────────────────────────────────────────────────────

interface InviteCtx {
  company: string;
  minutes: number;
}
type Msg = { title: string; body: string };
const INVITE_TEXTS: Record<Locale, { invited: (c: InviteCtx) => Msg; nudge: (c: InviteCtx) => Msg; cta: string }> = {
  az: {
    cta: 'Vaxt seç',
    invited: (c) => ({ title: `Müsahibə vaxtını seçin: ${c.company}`, body: `${c.company} şirkəti sizinlə ${c.minutes} dəqiqəlik video müsahibə keçirmək istəyir. Kabinetinizdə şirkətin boş vaxtlarından sizə uyğun olanı seçin — vaxtlar Bakı və Almaniya vaxtı ilə göstərilir.` }),
    nudge: (c) => ({ title: 'Xatırlatma: müsahibə vaxtını hələ seçməmisiniz', body: `${c.company} ilə müsahibə üçün kabinetinizdə vaxt seçməyi unutmayın.` }),
  },
  de: {
    cta: 'Termin wählen',
    invited: (c) => ({ title: `Bitte wählen Sie einen Interviewtermin: ${c.company}`, body: `${c.company} möchte ein ${c.minutes}-minütiges Video-Vorstellungsgespräch mit Ihnen führen. Wählen Sie in Ihrem Konto einen freien Termin – die Zeiten werden in Baku- und deutscher Zeit angezeigt.` }),
    nudge: (c) => ({ title: 'Erinnerung: Sie haben noch keinen Interviewtermin gewählt', body: `Bitte wählen Sie in Ihrem Konto einen Termin für das Vorstellungsgespräch mit ${c.company}.` }),
  },
  en: {
    cta: 'Pick a time',
    invited: (c) => ({ title: `Choose your interview time: ${c.company}`, body: `${c.company} would like a ${c.minutes}-minute video interview with you. Pick one of their free times in your account — times are shown in Baku and German time.` }),
    nudge: (c) => ({ title: 'Reminder: you have not picked an interview time yet', body: `Please choose a time in your account for your interview with ${c.company}.` }),
  },
  ru: {
    cta: 'Выбрать время',
    invited: (c) => ({ title: `Выберите время собеседования: ${c.company}`, body: `${c.company} хочет провести с вами видеособеседование на ${c.minutes} минут. Выберите свободное время в личном кабинете — время указано по Баку и по Германии.` }),
    nudge: (c) => ({ title: 'Напоминание: вы ещё не выбрали время собеседования', body: `Пожалуйста, выберите в личном кабинете время собеседования с ${c.company}.` }),
  },
};

export const inviteTexts = INVITE_TEXTS;

/** The candidate hears about a new invite (or gets the one-off nudge to pick a time). */
export const notifyInvite = async (i: InviteFull, kind: 'invited' | 'nudge') => {
  const t = INVITE_TEXTS[i.candidate.locale];
  const msg = t[kind]({ company: i.company.name, minutes: i.minutes });
  await notifyUser(i.candidate.id, { type: kind === 'invited' ? 'INTERVIEW_INVITED' : 'INTERVIEW_INVITE_NUDGE', title: msg.title, body: msg.body, link: '/account/interviews', ctaLabel: t.cta });
};

/**
 * Booked or moved from the free slots: the candidate always gets the confirmation with the .ics
 * (it is their appointment), employer users and the responsible staff member the "booked" /
 * "moved" notice with the .ics — except whoever acted. Then the partner webhook.
 */
export const broadcastBooking = async (i: InterviewFull, kind: 'booked' | 'moved', actorId: string, webhook: 'interview.scheduled' | 'interview.updated') => {
  const jobs = [notifyCandidate(i, 'confirmed'), notifyCompany(i, kind, null, actorId), notifyInterviewStaff(i, kind, null, actorId)];
  await Promise.all(jobs.map((p) => p.catch((e) => console.error('[interview-calendar] notify failed', e))));
  await emitWebhook(webhook, interviewWebhookPayload(i), i.companyId);
};
