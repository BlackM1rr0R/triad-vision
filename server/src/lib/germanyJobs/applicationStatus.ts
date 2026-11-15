import type { Locale, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { notifyUser } from '../notifications.js';
import { renderEmail, sendMail } from '../mailer.js';
import { isImpersonating } from '../privacy/impersonationContext.js';

/**
 * Progress of an "apply via Triad Vision" application, shown to the client in the portal (My applications):
 * submitted → forwarded to the employer → interview → answer (accepted / rejected / no reply). Staff set it from
 * the inquiry; each change is an event with an optional note the client sees, and the client is notified.
 */

export const EXTERNAL_APP_STATUSES = ['SUBMITTED', 'FORWARDED', 'INTERVIEW', 'ACCEPTED', 'REJECTED', 'NO_REPLY'] as const;
export type ExternalAppStatus = (typeof EXTERNAL_APP_STATUSES)[number];
export const FINAL_STATUSES: readonly ExternalAppStatus[] = ['ACCEPTED', 'REJECTED', 'NO_REPLY'];

export const readStatus = (s: string | null | undefined): ExternalAppStatus =>
  (EXTERNAL_APP_STATUSES as readonly string[]).includes(s ?? '') ? (s as ExternalAppStatus) : 'SUBMITTED';

/** The four steps of the portal timeline; the answer step carries the outcome. */
export type TimelineStep = { key: 'SUBMITTED' | 'FORWARDED' | 'INTERVIEW' | 'ANSWER'; state: 'done' | 'current' | 'todo' | 'skipped'; at: Date | null; outcome?: ExternalAppStatus };

/** Steps reached: forwarded / interview count as done once a later status was set (also when skipped by staff). */
export const buildTimeline = (createdAt: Date, status: ExternalAppStatus, events: { status: string; createdAt: Date }[]): TimelineStep[] => {
  const firstAt = (s: string) => events.find((e) => e.status === s)?.createdAt ?? null;
  const order: Record<ExternalAppStatus, number> = { SUBMITTED: 0, FORWARDED: 1, INTERVIEW: 2, ACCEPTED: 3, REJECTED: 3, NO_REPLY: 3 };
  const rank = order[status];
  const final = FINAL_STATUSES.includes(status);
  const step = (key: 'FORWARDED' | 'INTERVIEW', r: number): TimelineStep => {
    const at = firstAt(key);
    if (rank === r) return { key, state: 'current', at };
    if (rank > r) return { key, state: at ? 'done' : 'skipped', at };
    return { key, state: 'todo', at: null };
  };
  const answerAt = final ? ([...events].reverse().find((e) => e.status === status)?.createdAt ?? null) : null;
  return [
    { key: 'SUBMITTED', state: rank === 0 ? 'current' : 'done', at: createdAt },
    step('FORWARDED', 1),
    step('INTERVIEW', 2),
    final ? { key: 'ANSWER', state: 'done', at: answerAt, outcome: status } : { key: 'ANSWER', state: 'todo', at: null },
  ];
};

// ─── Client-facing texts (in-app notification + e-mail) ────────────────────

const STATUS_TEXT: Record<Locale, Record<ExternalAppStatus, string>> = {
  az: { SUBMITTED: 'Göndərildi', FORWARDED: 'İşəgötürənə göndərildi', INTERVIEW: 'Müsahibə', ACCEPTED: 'Qəbul edildi', REJECTED: 'İmtina', NO_REPLY: 'Cavab gəlmədi' },
  de: { SUBMITTED: 'Eingereicht', FORWARDED: 'An den Arbeitgeber weitergeleitet', INTERVIEW: 'Vorstellungsgespräch', ACCEPTED: 'Zusage', REJECTED: 'Absage', NO_REPLY: 'Keine Rückmeldung' },
  en: { SUBMITTED: 'Submitted', FORWARDED: 'Forwarded to the employer', INTERVIEW: 'Interview', ACCEPTED: 'Accepted', REJECTED: 'Rejected', NO_REPLY: 'No reply' },
  ru: { SUBMITTED: 'Отправлена', FORWARDED: 'Передана работодателю', INTERVIEW: 'Собеседование', ACCEPTED: 'Принято', REJECTED: 'Отказ', NO_REPLY: 'Нет ответа' },
};

const BODY: Record<Locale, Record<ExternalAppStatus, string>> = {
  az: {
    SUBMITTED: 'Müraciətiniz yenidən "göndərildi" mərhələsinə qaytarıldı.',
    FORWARDED: 'Müraciətinizi işəgötürənə göndərdik. Cavab gələn kimi sizə xəbər verəcəyik.',
    INTERVIEW: 'İşəgötürən sizinlə müsahibə keçirmək istəyir. Komandamız vaxtı və hazırlığı sizinlə razılaşdıracaq.',
    ACCEPTED: 'Təbriklər! İşəgötürən müsbət cavab verdi. Növbəti addımlar (müqavilə, viza) üçün sizinlə əlaqə saxlayacağıq.',
    REJECTED: 'Təəssüf ki, işəgötürən bu dəfə imtina etdi. Digər uyğun vakansiyalarda sizə kömək etməyə davam edirik.',
    NO_REPLY: 'İşəgötürən müəyyən müddət ərzində cavab vermədi. Digər vakansiyalara müraciət etməyi tövsiyə edirik.',
  },
  de: {
    SUBMITTED: 'Ihre Bewerbung steht wieder auf „Eingereicht“.',
    FORWARDED: 'Wir haben Ihre Bewerbung an den Arbeitgeber weitergeleitet. Sobald eine Antwort kommt, melden wir uns.',
    INTERVIEW: 'Der Arbeitgeber möchte Sie zu einem Vorstellungsgespräch einladen. Unser Team stimmt Termin und Vorbereitung mit Ihnen ab.',
    ACCEPTED: 'Herzlichen Glückwunsch! Der Arbeitgeber hat zugesagt. Wir melden uns zu den nächsten Schritten (Vertrag, Visum).',
    REJECTED: 'Leider hat der Arbeitgeber diesmal abgesagt. Wir unterstützen Sie gerne bei weiteren passenden Stellen.',
    NO_REPLY: 'Der Arbeitgeber hat in angemessener Zeit nicht geantwortet. Wir empfehlen, sich auf weitere Stellen zu bewerben.',
  },
  en: {
    SUBMITTED: 'Your application is back at "submitted".',
    FORWARDED: 'We forwarded your application to the employer. We will let you know as soon as they reply.',
    INTERVIEW: 'The employer would like to interview you. Our team will agree the date and preparation with you.',
    ACCEPTED: 'Congratulations! The employer said yes. We will contact you about the next steps (contract, visa).',
    REJECTED: 'Unfortunately the employer declined this time. We are happy to help you with other suitable jobs.',
    NO_REPLY: 'The employer did not reply within a reasonable time. We recommend applying for other jobs as well.',
  },
  ru: {
    SUBMITTED: 'Статус вашей заявки снова «отправлена».',
    FORWARDED: 'Мы передали вашу заявку работодателю. Сообщим, как только придёт ответ.',
    INTERVIEW: 'Работодатель хочет провести с вами собеседование. Наша команда согласует с вами время и подготовку.',
    ACCEPTED: 'Поздравляем! Работодатель ответил согласием. Мы свяжемся с вами по следующим шагам (договор, виза).',
    REJECTED: 'К сожалению, работодатель на этот раз отказал. Мы продолжим помогать вам с другими подходящими вакансиями.',
    NO_REPLY: 'Работодатель не ответил в разумный срок. Рекомендуем откликаться и на другие вакансии.',
  },
};

const PREFIX: Record<Locale, string> = { az: 'Müraciət', de: 'Bewerbung', en: 'Application', ru: 'Заявка' };
const NOTE: Record<Locale, string> = { az: 'Qeyd', de: 'Hinweis', en: 'Note', ru: 'Примечание' };
const CTA: Record<Locale, string> = { az: 'Müraciətlərimə bax', de: 'Meine Bewerbungen', en: 'My applications', ru: 'Мои заявки' };

export const statusLabel = (status: ExternalAppStatus, locale: Locale) => STATUS_TEXT[locale][status];

export const statusMessage = (status: ExternalAppStatus, locale: Locale, job: string, note?: string | null) => ({
  title: `${PREFIX[locale]}: ${STATUS_TEXT[locale][status]} · ${job}`.slice(0, 190),
  body: `${BODY[locale][status]}${note ? `\n\n${NOTE[locale]}: ${note}` : ''}`,
});

export const PORTAL_LINK = '/account/job-applications';

/**
 * Tells the client about a status change: in-app + push + e-mail for an account; e-mail only to the address of
 * the form when the application is not linked to an account yet. Never throws.
 */
export const notifyStatusChange = async (app: { userId: string | null; listingTitle: string | null; listingCompany: string | null; listingUrl: string; inquiry: { email: string; contactName: string; locale: string; anonymizedAt: Date | null } }, status: ExternalAppStatus, note: string | null) => {
  if (isImpersonating()) return;
  try {
    let host = '';
    try {
      host = new URL(app.listingUrl).hostname.replace(/^www\./, '');
    } catch {
      /* validated on input */
    }
    const job = app.listingTitle ?? app.listingCompany ?? host;
    if (app.userId) {
      const user = await prisma.user.findUnique({ where: { id: app.userId }, select: { locale: true } });
      if (user) {
        const m = statusMessage(status, user.locale, job, note);
        await notifyUser(app.userId, { type: 'EXTERNAL_APPLICATION_STATUS', title: m.title, body: m.body, link: PORTAL_LINK, ctaLabel: CTA[user.locale] });
        return;
      }
    }
    if (app.inquiry.anonymizedAt) return;
    const locale: Locale = (['az', 'de', 'en', 'ru'] as const).find((l) => l === app.inquiry.locale) ?? 'az';
    const m = statusMessage(status, locale, job, note);
    const html = renderEmail(m.title, m.body, { label: CTA[locale], url: `${config.clientUrl}${PORTAL_LINK}` });
    void sendMail(app.inquiry.email, `Triad Vision · ${m.title}`, html);
  } catch (err) {
    console.error('[germany-jobs] status notification failed', err);
  }
};

/**
 * Links earlier applications sent with the client's e-mail before they signed in (or registered). Only for a
 * verified e-mail address, only rows without an account and only leads that were not anonymised.
 */
export const linkApplicationsByEmail = async (user: { id: string; email: string; emailVerifiedAt: Date | null; role: string }) => {
  if (user.role !== 'CLIENT' || !user.emailVerifiedAt || isImpersonating()) return 0;
  const where: Prisma.ExternalJobApplicationWhereInput = { userId: null, inquiry: { email: user.email.trim().toLowerCase(), anonymizedAt: null } };
  const rows = await prisma.externalJobApplication.findMany({ where, select: { id: true } });
  if (!rows.length) return 0;
  const r = await prisma.externalJobApplication.updateMany({ where: { id: { in: rows.map((x) => x.id) }, userId: null }, data: { userId: user.id } });
  return r.count;
};
