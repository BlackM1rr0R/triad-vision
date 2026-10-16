import type { Locale, PrivacyRequest } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { renderEmail, sendMail } from '../mailer.js';
import { notifyStaff, notifyUser } from '../notifications.js';
import { ADMIN_TYPE_NAME, decidedText, receivedText } from './texts.js';

const DAY = 24 * 60 * 60 * 1000;
/** Art. 12(3) GDPR: answer "without undue delay and in any event within one month". */
export const REQUEST_DUE_DAYS = 30;
export const dueFrom = (now = new Date()) => new Date(now.getTime() + REQUEST_DUE_DAYS * DAY);
export const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS'] as const;

const CTA: Record<Locale, string> = { az: 'Məxfilik bölməsini aç', de: 'Datenschutz öffnen', en: 'Open privacy centre', ru: 'Открыть раздел' };

/** What we hold about a user, as counts (privacy centre "Your data" cards, admin request detail). */
export const dataOverview = async (userId: string) => {
  const own = { clientId: userId };
  const now = new Date();
  const [cases, documents, messages, translationOrders, sessions, devices, applications, interviews, notifications, consents] = await Promise.all([
    prisma.case.count({ where: own }),
    prisma.document.count({ where: { case: own } }),
    prisma.caseMessage.count({ where: { case: own } }),
    prisma.translationOrder.count({ where: own }),
    prisma.session.count({ where: { userId, revokedAt: null, expiresAt: { gt: now } } }),
    prisma.pushDevice.count({ where: { userId } }),
    prisma.vacancyApplication.count({ where: { userId } }),
    prisma.interview.count({ where: { candidateId: userId } }),
    prisma.notification.count({ where: { userId } }),
    prisma.consentRecord.count({ where: { userId } }),
  ]);
  return { cases, documents, messages, translationOrders, sessions, devices, applications, interviews, notifications, consents };
};

/** Locale and account of whoever made the request (the account may be gone already). */
const requester = async (r: Pick<PrivacyRequest, 'userId' | 'email'>) => {
  const user = r.userId
    ? await prisma.user.findUnique({ where: { id: r.userId }, select: { id: true, locale: true, isActive: true, email: true } })
    : null;
  return { user, locale: (user?.locale ?? 'az') as Locale, email: user?.email ?? r.email };
};

/**
 * Tells the requester. Request confirmations are service messages (a legal duty), so the email goes
 * out regardless of the notification preferences; the in-app copy only exists when there is an account.
 */
const tellRequester = async (r: Pick<PrivacyRequest, 'userId' | 'email'>, texts: { title: string; body: string }, localeOverride?: Locale) => {
  const { user, locale, email } = await requester(r);
  const loc = localeOverride ?? locale;
  const link = '/account/privacy';
  if (user?.isActive) await notifyUser(user.id, { type: 'PRIVACY_REQUEST', title: texts.title, body: texts.body, link, email: false, push: true });
  void sendMail(email, `Triad Vision · ${texts.title}`, renderEmail(texts.title, texts.body, user ? { label: CTA[loc], url: `${config.clientUrl}${link}` } : undefined));
};

export const notifyRequestReceived = async (r: PrivacyRequest) => {
  const { locale } = await requester(r);
  await tellRequester(r, receivedText(locale, r.type, r.dueAt));
};

export const notifyRequestDecided = async (r: PrivacyRequest, locale?: Locale) => {
  const loc = locale ?? (await requester(r)).locale;
  await tellRequester(r, decidedText(loc, r.type, r.status, r.decisionNote), loc);
};

/** In-app to every ADMIN / SUPER_ADMIN plus the admin inbox (ADMIN_NOTIFY_EMAIL, when configured). */
export const notifyAdminsNewRequest = async (r: PrivacyRequest, opts: { public?: boolean } = {}) => {
  const lines = [
    `Növ: ${ADMIN_TYPE_NAME[r.type]}`,
    `E-poçt: ${r.email}`,
    opts.public ? 'Hesabı olmayan şəxsdən (ictimai forma) — şəxsiyyəti əl ilə yoxlayın.' : `İstifadəçi ID: ${r.userId}`,
    `Son tarix: ${r.dueAt.toISOString().slice(0, 10)}`,
    r.message ? `Mesaj: ${r.message}` : null,
  ].filter(Boolean);
  await notifyStaff(`Məxfilik sorğusu: ${ADMIN_TYPE_NAME[r.type]} (${r.email})`, lines.join('\n'), {
    link: `/admin/privacy-requests/${r.id}`,
    type: 'PRIVACY_REQUEST',
  });
};
