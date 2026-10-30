import crypto from 'node:crypto';
import type { Interview, InterviewStatus, Locale, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { buildIcs } from '../ics.js';
import { renderEmail, sendMail } from '../mailer.js';
import { notifyUser } from '../notifications.js';
import { asBookingLocale, formatSlot } from '../bookingTexts.js';
import { emitWebhook } from './webhooks.js';

/**
 * Employer ↔ candidate interviews: shared shape, texts in four languages, notifications with an
 * .ics attachment and the webhook events. Used by routes/interviews.ts and jobs/interviews.ts.
 */

export const INTERVIEW_STATUSES: InterviewStatus[] = ['PROPOSED', 'CONFIRMED', 'CANCELLED', 'DONE', 'NO_SHOW'];
export const MIN_MINUTES = 10;
export const MAX_MINUTES = 8 * 60;

/** A random, unguessable Jitsi room (same convention as consultation bookings). */
export const newMeetingUrl = () => `https://meet.jit.si/TriadVision-${crypto.randomBytes(10).toString('hex')}`;

export const interviewInclude = {
  candidate: { select: { id: true, firstName: true, lastName: true, email: true, locale: true, emailNotifications: true, profession: true } },
  staff: { select: { id: true, firstName: true, lastName: true, locale: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true, role: true, locale: true } },
  company: { select: { id: true, name: true } },
  application: { select: { id: true, status: true, vacancy: { select: { id: true, title: true, slug: true } } } },
  invite: { select: { id: true } },
} satisfies Prisma.InterviewInclude;

export type InterviewFull = Prisma.InterviewGetPayload<{ include: typeof interviewInclude }>;

export const loadInterview = (id: string) => prisma.interview.findUnique({ where: { id }, include: interviewInclude });

const anonymised = (u: { firstName: string; lastName: string }) =>
  `${u.firstName.trim()}${u.lastName.trim() ? ` ${u.lastName.trim()[0].toUpperCase()}.` : ''}`;

/** Full view for staff; the employer and the candidate see a reduced one (no e-mail, anonymised name for employers). */
export const interviewView = (i: InterviewFull, audience: 'staff' | 'company' | 'candidate') => ({
  id: i.id,
  status: i.status,
  startsAt: i.startsAt,
  endsAt: i.endsAt,
  meetingUrl: i.status === 'CANCELLED' ? null : i.meetingUrl,
  notes: i.notes,
  createdAt: i.createdAt,
  updatedAt: i.updatedAt,
  company: i.company,
  application: i.application ? { id: i.application.id, status: i.application.status, vacancy: i.application.vacancy } : null,
  candidate:
    audience === 'company'
      ? { id: i.candidate.id, name: anonymised(i.candidate), profession: i.candidate.profession }
      : { id: i.candidate.id, name: `${i.candidate.firstName} ${i.candidate.lastName}`.trim(), email: audience === 'staff' ? i.candidate.email : undefined, profession: i.candidate.profession },
  staff: i.staff ? { id: i.staff.id, name: `${i.staff.firstName} ${i.staff.lastName}`.trim() } : null,
  createdBy: i.createdBy ? { id: i.createdBy.id, name: `${i.createdBy.firstName} ${i.createdBy.lastName}`.trim(), role: i.createdBy.role } : null,
  /** Set when the candidate picked the time from the employer's free slots (routes/interviewCalendar.ts). */
  inviteId: i.invite?.id ?? null,
});

/** Payload for partner webhooks (no personal data beyond what the employer already sees). */
export const interviewWebhookPayload = (i: InterviewFull) => ({
  id: i.id,
  status: i.status,
  startsAt: i.startsAt.toISOString(),
  endsAt: i.endsAt.toISOString(),
  companyId: i.companyId,
  applicationId: i.applicationId,
  candidate: { id: i.candidate.id, name: anonymised(i.candidate) },
  meetingUrl: i.status === 'CANCELLED' ? null : i.meetingUrl,
});

// ─── Texts ──────────────────────────────────────────────────────────────

export type InterviewMail = 'scheduled' | 'confirmed' | 'cancelled' | 'rescheduled' | 'reminder24h' | 'reminder1h' | 'declined' | 'booked' | 'moved';

interface Ctx {
  when: string;
  company: string;
  candidate: string;
  vacancy: string;
  meetingUrl: string;
  notes: string;
}

type Msg = { title: string; body: string };
interface Catalogue {
  scheduled: (c: Ctx) => Msg;
  confirmed: (c: Ctx) => Msg;
  cancelled: (c: Ctx) => Msg;
  rescheduled: (c: Ctx) => Msg;
  reminder24h: (c: Ctx) => Msg;
  reminder1h: (c: Ctx) => Msg;
  declined: (c: Ctx) => Msg;
  /** Employer / staff: the candidate picked a free slot, or moved their self-booked interview. */
  booked: (c: Ctx) => Msg;
  moved: (c: Ctx) => Msg;
  icsSummary: (c: Ctx) => string;
  cta: string;
  ctaStaff: string;
  notesLabel: string;
  linkLabel: string;
}

const tail = (c: Ctx, t: { notesLabel: string; linkLabel: string }) =>
  `${c.meetingUrl ? `\n\n${t.linkLabel}: ${c.meetingUrl}` : ''}${c.notes ? `\n\n${t.notesLabel}: ${c.notes}` : ''}`;

const az: Catalogue = {
  notesLabel: 'Qeyd',
  linkLabel: 'Görüş linki',
  cta: 'Müsahibələrə keç',
  ctaStaff: 'Admin paneldə aç',
  icsSummary: (c) => `Müsahibə: ${c.company || 'Triad Vision'}`,
  scheduled: (c) => ({ title: `Müsahibə təklif edildi: ${c.company || c.vacancy || 'Triad Vision'}`, body: `${c.company ? `${c.company} şirkəti` : 'Triad Vision'} sizinlə müsahibə keçirmək istəyir.\n\nVaxt:\n${c.when}\n\nZəhmət olmasa kabinetinizdə vaxtı təsdiqləyin və ya rədd edin.` + tail(c, az) }),
  confirmed: (c) => ({ title: `Müsahibə təsdiqləndi: ${c.when.split('\n')[0]}`, body: `Müsahibə təsdiqləndi.\n\nVaxt:\n${c.when}\n\nGörüşə 5 dəqiqə əvvəl linkdən qoşulun.` + tail(c, az) }),
  cancelled: (c) => ({ title: 'Müsahibə ləğv edildi', body: `${c.when.split('\n')[0]} tarixinə planlaşdırılan müsahibə ləğv edildi.${c.notes ? `\n\n${az.notesLabel}: ${c.notes}` : ''}` }),
  rescheduled: (c) => ({ title: 'Müsahibənin vaxtı dəyişdirildi', body: `Müsahibənin yeni vaxtı:\n${c.when}\n\nZəhmət olmasa kabinetinizdə təsdiqləyin.` + tail(c, az) }),
  reminder24h: (c) => ({ title: 'Xatırlatma: sabah müsahibəniz var', body: `Sabah ${c.company ? `${c.company} ilə ` : ''}müsahibəniz var.\n\nVaxt:\n${c.when}` + tail(c, az) }),
  reminder1h: (c) => ({ title: 'Xatırlatma: müsahibə 1 saatdan sonra', body: `Müsahibə 1 saatdan sonra başlayır.\n\nVaxt:\n${c.when}` + tail(c, az) }),
  declined: (c) => ({ title: `Namizəd müsahibəni rədd etdi: ${c.candidate}`, body: `${c.candidate} ${c.when.split('\n')[0]} tarixinə təklif olunan müsahibəni rədd etdi. Zəhmət olmasa yeni vaxt təklif edin.` }),
  booked: (c) => ({ title: `Namizəd müsahibə vaxtını seçdi: ${c.candidate}`, body: `${c.candidate} müsahibə üçün boş vaxtlarınızdan birini seçdi.\n\nVaxt:\n${c.when}` + tail(c, az) }),
  moved: (c) => ({ title: `Müsahibə başqa vaxta keçirildi: ${c.candidate}`, body: `${c.candidate} ilə müsahibə yeni vaxta keçirildi.\n\nYeni vaxt:\n${c.when}` + tail(c, az) }),
};

const de: Catalogue = {
  notesLabel: 'Hinweis',
  linkLabel: 'Meeting-Link',
  cta: 'Zu den Interviews',
  ctaStaff: 'Im Admin-Panel öffnen',
  icsSummary: (c) => `Vorstellungsgespräch: ${c.company || 'Triad Vision'}`,
  scheduled: (c) => ({ title: `Vorstellungsgespräch vorgeschlagen: ${c.company || c.vacancy || 'Triad Vision'}`, body: `${c.company ? `Das Unternehmen ${c.company}` : 'Triad Vision'} möchte ein Vorstellungsgespräch mit Ihnen führen.\n\nTermin:\n${c.when}\n\nBitte bestätigen Sie den Termin in Ihrem Konto oder lehnen Sie ihn ab.` + tail(c, de) }),
  confirmed: (c) => ({ title: `Vorstellungsgespräch bestätigt: ${c.when.split('\n')[0]}`, body: `Das Vorstellungsgespräch ist bestätigt.\n\nTermin:\n${c.when}\n\nBitte treten Sie 5 Minuten vorher über den Link bei.` + tail(c, de) }),
  cancelled: (c) => ({ title: 'Vorstellungsgespräch abgesagt', body: `Das für ${c.when.split('\n')[0]} geplante Vorstellungsgespräch wurde abgesagt.${c.notes ? `\n\n${de.notesLabel}: ${c.notes}` : ''}` }),
  rescheduled: (c) => ({ title: 'Vorstellungsgespräch verschoben', body: `Neuer Termin:\n${c.when}\n\nBitte bestätigen Sie ihn in Ihrem Konto.` + tail(c, de) }),
  reminder24h: (c) => ({ title: 'Erinnerung: morgen Vorstellungsgespräch', body: `Morgen findet Ihr Vorstellungsgespräch${c.company ? ` mit ${c.company}` : ''} statt.\n\nTermin:\n${c.when}` + tail(c, de) }),
  reminder1h: (c) => ({ title: 'Erinnerung: Vorstellungsgespräch in 1 Stunde', body: `Das Vorstellungsgespräch beginnt in einer Stunde.\n\nTermin:\n${c.when}` + tail(c, de) }),
  declined: (c) => ({ title: `Kandidat hat abgelehnt: ${c.candidate}`, body: `${c.candidate} hat den vorgeschlagenen Termin am ${c.when.split('\n')[0]} abgelehnt. Bitte schlagen Sie einen neuen Termin vor.` }),
  booked: (c) => ({ title: `Termin gewählt: ${c.candidate}`, body: `${c.candidate} hat einen Ihrer freien Termine für das Vorstellungsgespräch gewählt.\n\nTermin:\n${c.when}` + tail(c, de) }),
  moved: (c) => ({ title: `Termin verschoben: ${c.candidate}`, body: `Das Vorstellungsgespräch mit ${c.candidate} wurde verschoben.\n\nNeuer Termin:\n${c.when}` + tail(c, de) }),
};

const en: Catalogue = {
  notesLabel: 'Note',
  linkLabel: 'Meeting link',
  cta: 'Open my interviews',
  ctaStaff: 'Open in admin panel',
  icsSummary: (c) => `Interview: ${c.company || 'Triad Vision'}`,
  scheduled: (c) => ({ title: `Interview proposed: ${c.company || c.vacancy || 'Triad Vision'}`, body: `${c.company ? `${c.company}` : 'Triad Vision'} would like to interview you.\n\nTime:\n${c.when}\n\nPlease confirm or decline the time in your account.` + tail(c, en) }),
  confirmed: (c) => ({ title: `Interview confirmed: ${c.when.split('\n')[0]}`, body: `The interview is confirmed.\n\nTime:\n${c.when}\n\nPlease join via the link 5 minutes early.` + tail(c, en) }),
  cancelled: (c) => ({ title: 'Interview cancelled', body: `The interview planned for ${c.when.split('\n')[0]} was cancelled.${c.notes ? `\n\n${en.notesLabel}: ${c.notes}` : ''}` }),
  rescheduled: (c) => ({ title: 'Interview rescheduled', body: `New time:\n${c.when}\n\nPlease confirm it in your account.` + tail(c, en) }),
  reminder24h: (c) => ({ title: 'Reminder: interview tomorrow', body: `Your interview${c.company ? ` with ${c.company}` : ''} is tomorrow.\n\nTime:\n${c.when}` + tail(c, en) }),
  reminder1h: (c) => ({ title: 'Reminder: interview in 1 hour', body: `The interview starts in one hour.\n\nTime:\n${c.when}` + tail(c, en) }),
  declined: (c) => ({ title: `Candidate declined: ${c.candidate}`, body: `${c.candidate} declined the interview proposed for ${c.when.split('\n')[0]}. Please propose a new time.` }),
  booked: (c) => ({ title: `Interview time chosen: ${c.candidate}`, body: `${c.candidate} picked one of your free times for the interview.\n\nTime:\n${c.when}` + tail(c, en) }),
  moved: (c) => ({ title: `Interview moved: ${c.candidate}`, body: `The interview with ${c.candidate} was moved.\n\nNew time:\n${c.when}` + tail(c, en) }),
};

const ru: Catalogue = {
  notesLabel: 'Примечание',
  linkLabel: 'Ссылка на встречу',
  cta: 'К собеседованиям',
  ctaStaff: 'Открыть в админ-панели',
  icsSummary: (c) => `Собеседование: ${c.company || 'Triad Vision'}`,
  scheduled: (c) => ({ title: `Предложено собеседование: ${c.company || c.vacancy || 'Triad Vision'}`, body: `${c.company ? `Компания ${c.company}` : 'Triad Vision'} хочет провести с вами собеседование.\n\nВремя:\n${c.when}\n\nПожалуйста, подтвердите или отклоните время в личном кабинете.` + tail(c, ru) }),
  confirmed: (c) => ({ title: `Собеседование подтверждено: ${c.when.split('\n')[0]}`, body: `Собеседование подтверждено.\n\nВремя:\n${c.when}\n\nПодключитесь по ссылке за 5 минут до начала.` + tail(c, ru) }),
  cancelled: (c) => ({ title: 'Собеседование отменено', body: `Собеседование, запланированное на ${c.when.split('\n')[0]}, отменено.${c.notes ? `\n\n${ru.notesLabel}: ${c.notes}` : ''}` }),
  rescheduled: (c) => ({ title: 'Время собеседования изменено', body: `Новое время:\n${c.when}\n\nПожалуйста, подтвердите его в личном кабинете.` + tail(c, ru) }),
  reminder24h: (c) => ({ title: 'Напоминание: завтра собеседование', body: `Завтра у вас собеседование${c.company ? ` с ${c.company}` : ''}.\n\nВремя:\n${c.when}` + tail(c, ru) }),
  reminder1h: (c) => ({ title: 'Напоминание: собеседование через 1 час', body: `Собеседование начнётся через час.\n\nВремя:\n${c.when}` + tail(c, ru) }),
  declined: (c) => ({ title: `Кандидат отклонил собеседование: ${c.candidate}`, body: `${c.candidate} отклонил(а) собеседование, предложенное на ${c.when.split('\n')[0]}. Пожалуйста, предложите новое время.` }),
  booked: (c) => ({ title: `Кандидат выбрал время собеседования: ${c.candidate}`, body: `${c.candidate} выбрал(а) одно из ваших свободных окон для собеседования.\n\nВремя:\n${c.when}` + tail(c, ru) }),
  moved: (c) => ({ title: `Собеседование перенесено: ${c.candidate}`, body: `Собеседование с ${c.candidate} перенесено.\n\nНовое время:\n${c.when}` + tail(c, ru) }),
};

export const interviewTexts: Record<Locale, Catalogue> = { az, de, en, ru };

const l10n = (v: unknown, locale: Locale) => {
  const o = (v ?? {}) as Partial<Record<Locale, string>>;
  return o[locale] || o.az || o.en || o.de || '';
};

export const interviewCtx = (i: InterviewFull, locale: Locale, audience: 'staff' | 'company' | 'candidate', notes?: string | null): Ctx => ({
  when: formatSlot(i.startsAt, asBookingLocale(locale)),
  company: i.company?.name ?? '',
  candidate: audience === 'company' ? anonymised(i.candidate) : `${i.candidate.firstName} ${i.candidate.lastName}`.trim(),
  vacancy: l10n(i.application?.vacancy.title, locale),
  meetingUrl: i.status === 'CANCELLED' ? '' : (i.meetingUrl ?? ''),
  notes: notes ?? i.notes ?? '',
});

export const interviewIcs = (i: InterviewFull, locale: Locale, cancelled = i.status === 'CANCELLED') => {
  const t = interviewTexts[locale];
  const c = interviewCtx(i, locale, 'candidate');
  return buildIcs({
    uid: `interview-${i.id}@triad-vision.de`,
    start: i.startsAt,
    end: i.endsAt,
    summary: t.icsSummary(c),
    description: `${c.when}${c.vacancy ? `\n${c.vacancy}` : ''}${c.meetingUrl ? `\n${t.linkLabel}: ${c.meetingUrl}` : ''}`,
    location: c.meetingUrl || undefined,
    url: c.meetingUrl || undefined,
    status: cancelled ? 'CANCELLED' : 'CONFIRMED',
    // Grows with every change, so calendar apps apply a moved time or a cancellation to the same event.
    sequence: Math.max(0, Math.floor((i.updatedAt.getTime() - i.createdAt.getTime()) / 1000)) + (cancelled ? 1 : 0),
  });
};

// ─── Notifications ──────────────────────────────────────────────────────

const CANDIDATE_LINK = '/account/interviews';
const COMPANY_LINK = '/company/interviews';
const STAFF_LINK = '/admin/interviews';

/** Mails that carry the calendar invite (.ics): every change of the time or the status. */
const ICS_KINDS: InterviewMail[] = ['scheduled', 'confirmed', 'cancelled', 'rescheduled', 'booked', 'moved'];

const icsAttachment = (i: InterviewFull, locale: Locale, kind: InterviewMail) => [
  { filename: 'triad-vision-interview.ics', content: interviewIcs(i, locale, kind === 'cancelled'), contentType: 'text/calendar; charset=utf-8' },
];

/** In-app + push through notifyUser; the e-mail is sent here so the .ics can be attached. */
export const notifyCandidate = async (i: InterviewFull, kind: InterviewMail, notes?: string | null) => {
  const u = i.candidate;
  const t = interviewTexts[u.locale];
  const msg = t[kind](interviewCtx(i, u.locale, 'candidate', notes));
  await notifyUser(u.id, { type: `INTERVIEW_${kind.toUpperCase()}`, title: msg.title, body: msg.body, link: CANDIDATE_LINK, email: false, ctaLabel: t.cta });
  if (u.emailNotifications === false) return;
  const withIcs = ICS_KINDS.includes(kind);
  const html = renderEmail(msg.title, msg.body, { label: t.cta, url: `${config.clientUrl}${CANDIDATE_LINK}` });
  void sendMail(u.email, `Triad Vision · ${msg.title}`, html, withIcs ? icsAttachment(i, u.locale, kind) : undefined);
};

/** Every active employer user of the interview's company, in their own language (time changes with the .ics). */
export const notifyCompany = async (i: InterviewFull, kind: InterviewMail, notes?: string | null, except?: string) => {
  if (!i.companyId) return;
  const users = await prisma.user.findMany({ where: { companyId: i.companyId, role: 'COMPANY', isActive: true }, select: { id: true, locale: true, email: true, emailNotifications: true } });
  const withIcs = ICS_KINDS.includes(kind);
  for (const u of users) {
    if (u.id === except) continue;
    const t = interviewTexts[u.locale];
    const msg = t[kind](interviewCtx(i, u.locale, 'company', notes));
    await notifyUser(u.id, { type: `INTERVIEW_${kind.toUpperCase()}`, title: msg.title, body: msg.body, link: COMPANY_LINK, ctaLabel: t.cta, email: !withIcs });
    if (withIcs && u.emailNotifications !== false) {
      const html = renderEmail(msg.title, msg.body, { label: t.cta, url: `${config.clientUrl}${COMPANY_LINK}` });
      void sendMail(u.email, `Triad Vision · ${msg.title}`, html, icsAttachment(i, u.locale, kind));
    }
  }
};

/** The responsible staff member (or the staff creator); never the person who just acted. */
export const notifyInterviewStaff = async (i: InterviewFull, kind: InterviewMail, notes?: string | null, except?: string) => {
  const target = i.staff ?? (i.createdBy && i.createdBy.role !== 'CLIENT' && i.createdBy.role !== 'COMPANY' ? i.createdBy : null);
  if (!target || target.id === except) return;
  const t = interviewTexts[target.locale];
  const msg = t[kind](interviewCtx(i, target.locale, 'staff', notes));
  await notifyUser(target.id, { type: `INTERVIEW_${kind.toUpperCase()}`, title: msg.title, body: msg.body, link: STAFF_LINK, ctaLabel: t.ctaStaff });
};

/** Fans out one lifecycle event to everyone involved except the actor, then emits the webhook. */
export const broadcastInterview = async (i: InterviewFull, kind: InterviewMail, opts: { actorId?: string; notes?: string | null; webhook: 'interview.scheduled' | 'interview.updated' }) => {
  const jobs: Promise<unknown>[] = [];
  if (kind !== 'declined' && i.candidateId !== opts.actorId) jobs.push(notifyCandidate(i, kind, opts.notes));
  jobs.push(notifyCompany(i, kind, opts.notes, opts.actorId));
  jobs.push(notifyInterviewStaff(i, kind, opts.notes, opts.actorId));
  await Promise.all(jobs.map((p) => p.catch((e) => console.error('[interviews] notify failed', e))));
  await emitWebhook(opts.webhook, interviewWebhookPayload(i), i.companyId);
};

export type { Interview };
