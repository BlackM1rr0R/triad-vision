import type { Request } from 'express';
import type { Prisma, RateAlert } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { escapeHtml, localizedPath } from '../seo.js';
import { renderEmail, sendMailDetailed } from '../mailer.js';
import { recordConsent } from '../privacy/consents.js';
import { getEurAzn, type EurAzn } from '../life/cbar.js';
import {
  ENDED_TTL_DAYS,
  MAX_ALERTS_PER_EMAIL,
  UNCONFIRMED_TTL_DAYS,
  alertToken,
  daysAgo,
  expiryFrom,
  fmtDay,
  fmtRate,
  maskEmail,
  shouldFire,
  verifyAlertToken,
  type AlertInput,
  type Direction,
} from './logic.js';
import { CONSENT_VERSION, RATE_ALERT_MAIL, mailLocale, type MailLocale } from './texts.js';

/**
 * EUR → AZN rate alerts (model RateAlert): "e-mail me once 1 EUR is ≥ / ≤ X AZN" at the official CBAR rate
 * (lib/life/cbar.ts, fetched by the server at most once per Baku day). Offered on /send-money-home,
 * /life-in-germany and in the client portal (/account/rate-alerts).
 *
 *  - Visitors: double opt-in like the Germany job alerts (only the confirmation e-mail before the address is
 *    confirmed; unconfirmed alerts are deleted after 7 days). Signed-in clients: confirmed for their account
 *    address, no opt-in e-mail; e-mails go to the account's current address. Consent (and withdrawal) is written to
 *    the consent log (type RATE_ALERT).
 *  - Every e-mail carries manage / unsubscribe links and List-Unsubscribe one-click headers (signed token derived
 *    from the id with the server secret, never stored).
 *  - Job (jobs/rateAlerts.ts, every 30 min): after the daily CBAR fetch, an alert whose condition holds gets ONE
 *    e-mail (rate, bulletin date, link to /send-money-home) and is paused until the person re-arms it; never more
 *    than one e-mail per alert and Baku day. A stale rate (CBAR unreachable / old bulletin) never fires anything.
 *  - Lifetime 6 months from confirmation / re-arming; then the alert ends with a notice e-mail (one-click extend).
 *  - Max 3 active alerts per address / account. Unsubscribed and expired alerts are deleted 30 days later; with
 *    the account; on a privacy erasure.
 */

const origin = () => new URL(config.clientUrl).origin;

export const manageUrl = (token: string, lng: MailLocale, action?: 'confirm' | 'unsubscribe' | 'rearm') =>
  `${origin()}${localizedPath('/rate-alert', lng)}?token=${encodeURIComponent(token)}${action ? `&action=${action}` : ''}`;

export const oneClickUrl = (token: string) => `${origin()}/api/rate-alerts/unsubscribe/${encodeURIComponent(token)}`;

const calcUrl = (lng: MailLocale) => `${origin()}${localizedPath('/send-money-home', lng)}?utm_source=rate-alert&utm_medium=email`;

const listHeaders = (token: string) => ({ 'List-Unsubscribe': `<${oneClickUrl(token)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });

export const conditionText = (a: Pick<RateAlert, 'direction' | 'target'>, lng: MailLocale) =>
  RATE_ALERT_MAIL[lng].condition(a.direction === 'lte' ? 'lte' : 'gte', fmtRate(a.target, lng));

const footerHtml = (token: string, lng: MailLocale) => {
  const m = RATE_ALERT_MAIL[lng];
  return `<p style="margin:22px 0 0;font-size:12px;color:#5b6b88;line-height:1.6">${escapeHtml(m.source)}<br>${escapeHtml(m.why)}<br><a href="${escapeHtml(manageUrl(token, lng))}" style="color:#1565e8">${escapeHtml(m.manage)}</a> · <a href="${escapeHtml(manageUrl(token, lng, 'unsubscribe'))}" style="color:#1565e8">${escapeHtml(m.unsubscribe)}</a></p>`;
};

/** E-mail address an alert goes to: the account's current address for account alerts. */
const recipient = async (a: RateAlert) => {
  if (!a.userId) return a.email;
  const u = await prisma.user.findUnique({ where: { id: a.userId }, select: { email: true, isActive: true } });
  if (!u) return a.email;
  return u.isActive ? u.email : null;
};

// ─── Create / confirm / manage ──────────────────────────────────────────

const activeWhere = (where: Prisma.RateAlertWhereInput): Prisma.RateAlertWhereInput => ({ ...where, unsubscribedAt: null, expiredAt: null });

export const renderConfirmMail = (a: RateAlert) => {
  const lng = mailLocale(a.locale);
  const m = RATE_ALERT_MAIL[lng];
  const token = alertToken(a.id);
  const html = renderEmail(m.confirmSubject, m.confirmBody(conditionText(a, lng)), { label: m.confirmCta, url: manageUrl(token, lng, 'confirm') }, {
    html: `<p style="margin:18px 0 0;font-size:12px;color:#5b6b88">${escapeHtml(m.source)}</p>`,
  });
  return { subject: m.confirmSubject, html };
};

export const createPublicAlert = async (input: { email: string; alert: AlertInput; visitorId?: string | null }) => {
  const email = input.email.trim().toLowerCase();
  const active = await prisma.rateAlert.count({ where: activeWhere({ email }) });
  if (active >= MAX_ALERTS_PER_EMAIL) return { ok: false as const, code: 'TOO_MANY_ALERTS' };
  const alert = await prisma.rateAlert.create({
    data: {
      email,
      locale: mailLocale(input.alert.lng),
      direction: input.alert.direction,
      target: input.alert.target,
      consentVersion: CONSENT_VERSION,
      visitorId: input.visitorId ?? null,
    },
  });
  const mail = renderConfirmMail(alert);
  // The confirmation is a transactional e-mail: no unsubscribe header (nothing is subscribed yet).
  await sendMailDetailed({ to: email, subject: mail.subject, html: mail.html });
  return { ok: true as const, alert };
};

export const createAccountAlert = async (user: { id: string; email: string; locale: string }, input: AlertInput, req?: Pick<Request, 'ip' | 'get'>, now = new Date()) => {
  const active = await prisma.rateAlert.count({ where: activeWhere({ userId: user.id }) });
  if (active >= MAX_ALERTS_PER_EMAIL) return { ok: false as const, code: 'TOO_MANY_ALERTS' };
  const alert = await prisma.rateAlert.create({
    data: {
      email: user.email.toLowerCase(),
      userId: user.id,
      locale: mailLocale(input.lng ?? user.locale),
      direction: input.direction,
      target: input.target,
      consentVersion: CONSENT_VERSION,
      confirmedAt: now,
      expiresAt: expiryFrom(now),
    },
  });
  await recordConsent({ userId: user.id, email: user.email, type: 'RATE_ALERT', granted: true, source: 'PORTAL', version: CONSENT_VERSION, req });
  return { ok: true as const, alert };
};

export const findByToken = async (token: unknown) => {
  const id = verifyAlertToken(token);
  return id ? prisma.rateAlert.findUnique({ where: { id } }) : null;
};

export const confirmAlert = async (a: RateAlert, req?: Pick<Request, 'ip' | 'get'>, now = new Date()) => {
  if (a.confirmedAt && !a.unsubscribedAt) return a;
  const updated = await prisma.rateAlert.update({
    where: { id: a.id },
    data: { confirmedAt: a.confirmedAt ?? now, unsubscribedAt: null, expiresAt: a.expiresAt ?? expiryFrom(now) },
  });
  await recordConsent({ userId: a.userId, email: a.email, type: 'RATE_ALERT', granted: true, source: 'RATE_ALERT', version: a.consentVersion ?? CONSENT_VERSION, req });
  return updated;
};

/**
 * Re-arm after it fired / extend after it expired / resume after an unsubscribe (also a new condition): active
 * again for 6 months from now. Counts against the limit when the alert was not active.
 */
export const rearmAlert = async (a: RateAlert, patch: Partial<Pick<AlertInput, 'direction' | 'target'>>, req?: Pick<Request, 'ip' | 'get'>, now = new Date()) => {
  const wasActive = !a.unsubscribedAt && !a.expiredAt;
  if (!wasActive) {
    const active = await prisma.rateAlert.count({ where: activeWhere(a.userId ? { userId: a.userId } : { email: a.email }) });
    if (active >= MAX_ALERTS_PER_EMAIL) return { ok: false as const, code: 'TOO_MANY_ALERTS' };
  }
  const alert = await prisma.rateAlert.update({
    where: { id: a.id },
    data: {
      ...(patch.direction ? { direction: patch.direction } : {}),
      ...(patch.target ? { target: patch.target } : {}),
      confirmedAt: a.confirmedAt ?? now,
      pausedAt: null,
      expiredAt: null,
      unsubscribedAt: null,
      expiresAt: expiryFrom(now),
    },
  });
  if (a.unsubscribedAt || !a.confirmedAt) {
    await recordConsent({ userId: a.userId, email: a.email, type: 'RATE_ALERT', granted: true, source: 'RATE_ALERT', version: CONSENT_VERSION, req });
  }
  return { ok: true as const, alert };
};

export const unsubscribeAlert = async (a: RateAlert, req?: Pick<Request, 'ip' | 'get'>, now = new Date()) => {
  if (a.unsubscribedAt) return a;
  const updated = await prisma.rateAlert.update({ where: { id: a.id }, data: { unsubscribedAt: now } });
  await recordConsent({ userId: a.userId, email: a.email, type: 'RATE_ALERT', granted: false, source: 'UNSUBSCRIBE', version: a.consentVersion ?? CONSENT_VERSION, req });
  return updated;
};

export type AlertState = 'pending' | 'active' | 'paused' | 'expired' | 'unsubscribed';

export const alertState = (a: RateAlert): AlertState =>
  a.unsubscribedAt ? 'unsubscribed' : a.expiredAt ? 'expired' : !a.confirmedAt ? 'pending' : a.pausedAt ? 'paused' : 'active';

export const alertView = (a: RateAlert, opts: { maskedEmail?: boolean } = {}) => ({
  id: a.id,
  email: opts.maskedEmail ? maskEmail(a.email) : a.email,
  locale: a.locale,
  direction: a.direction as Direction,
  target: a.target,
  state: alertState(a),
  lastSentAt: a.lastSentAt,
  lastRate: a.lastRate,
  lastRateDate: a.lastRateDate,
  sentCount: a.sentCount,
  expiresAt: a.expiresAt,
  createdAt: a.createdAt,
});

// ─── Job ─────────────────────────────────────────────────────────────────

export interface RateAlertRun {
  rate: number | null;
  rateDate: string | null;
  skipped: 'NO_RATE' | 'STALE' | null;
  sent: number;
  expired: number;
}

const sendFired = async (a: RateAlert, rate: EurAzn) => {
  const to = await recipient(a);
  if (!to) return false;
  const lng = mailLocale(a.locale);
  const m = RATE_ALERT_MAIL[lng];
  const token = alertToken(a.id);
  const rateText = fmtRate(rate.rate, lng);
  const subject = m.firedSubject(rateText);
  const html = renderEmail(subject, m.firedBody({ rate: rateText, date: fmtDay(rate.date), condition: conditionText(a, lng) }), { label: m.firedCta, url: calcUrl(lng) }, {
    html: `<p style="margin:18px 0 0;line-height:1.5">${escapeHtml(m.pausedNote)} <a href="${escapeHtml(manageUrl(token, lng, 'rearm'))}" style="color:#1565e8;font-weight:600">${escapeHtml(m.rearm)}</a></p>${footerHtml(token, lng)}`,
  });
  await sendMailDetailed({ to, subject, html, headers: listHeaders(token) });
  return true;
};

const sendExpired = async (a: RateAlert) => {
  const to = await recipient(a);
  if (!to) return false;
  const lng = mailLocale(a.locale);
  const m = RATE_ALERT_MAIL[lng];
  const token = alertToken(a.id);
  const html = renderEmail(m.expiredSubject, m.expiredBody(conditionText(a, lng)), { label: m.expiredCta, url: manageUrl(token, lng, 'rearm') }, { html: footerHtml(token, lng) });
  await sendMailDetailed({ to, subject: m.expiredSubject, html, headers: listHeaders(token) });
  return true;
};

/**
 * One run: alerts past their lifetime end (notice e-mail), then alerts whose condition holds at the current CBAR
 * rate fire once and pause. Each alert is claimed with a conditional update before anything is sent, so overlapping
 * runs never e-mail twice. `rate` is for tests (default: getEurAzn(), which asks CBAR at most once per Baku day).
 */
export const runRateAlerts = async (now = new Date(), rateIn?: EurAzn | null): Promise<RateAlertRun> => {
  const result: RateAlertRun = { rate: null, rateDate: null, skipped: null, sent: 0, expired: 0 };

  const ending = await prisma.rateAlert.findMany({
    where: { confirmedAt: { not: null }, unsubscribedAt: null, expiredAt: null, expiresAt: { lte: now } },
    take: 500,
  });
  for (const a of ending) {
    const claimed = await prisma.rateAlert.updateMany({ where: { id: a.id, expiredAt: null, unsubscribedAt: null }, data: { expiredAt: now } });
    if (claimed.count && (await sendExpired(a))) result.expired++;
  }

  const rate = rateIn === undefined ? await getEurAzn({ now }) : rateIn;
  if (!rate) {
    result.skipped = 'NO_RATE';
    return result;
  }
  result.rate = rate.rate;
  result.rateDate = rate.date;
  if (rate.stale) {
    result.skipped = 'STALE';
    return result;
  }

  const candidates = await prisma.rateAlert.findMany({
    where: { confirmedAt: { not: null }, unsubscribedAt: null, expiredAt: null, pausedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: { createdAt: 'asc' },
    take: 5000,
  });
  for (const a of candidates) {
    if (!shouldFire(a, rate.rate, now)) continue;
    const claimed = await prisma.rateAlert.updateMany({
      where: { id: a.id, pausedAt: null, unsubscribedAt: null, expiredAt: null, lastSentAt: a.lastSentAt },
      data: { pausedAt: now, lastSentAt: now, lastRate: rate.rate, lastRateDate: rate.date, sentCount: { increment: 1 } },
    });
    if (claimed.count && (await sendFired(a, rate))) result.sent++;
  }
  return result;
};

/** DSGVO housekeeping: unconfirmed alerts after 7 days, unsubscribed / expired ones 30 days later. */
export const purgeRateAlerts = async (now = new Date()) => {
  const r = await prisma.rateAlert.deleteMany({
    where: {
      OR: [
        { confirmedAt: null, createdAt: { lt: daysAgo(now, UNCONFIRMED_TTL_DAYS) } },
        { unsubscribedAt: { lt: daysAgo(now, ENDED_TTL_DAYS) } },
        { expiredAt: { lt: daysAgo(now, ENDED_TTL_DAYS) } },
      ],
    },
  });
  return r.count;
};

// ─── Privacy (Art. 15 / 17) ─────────────────────────────────────────────

const personWhere = (email: string, userId?: string | null): Prisma.RateAlertWhereInput => ({
  OR: [{ email: email.trim().toLowerCase() }, ...(userId ? [{ userId }] : [])],
});

/** Art. 15: the rate alerts of an address / account. */
export const exportRateAlerts = async (email: string, userId?: string | null) =>
  (await prisma.rateAlert.findMany({ where: personWhere(email, userId), orderBy: { createdAt: 'asc' } })).map((a) => ({
    ...alertView(a),
    consentVersion: a.consentVersion,
    confirmedAt: a.confirmedAt,
    pausedAt: a.pausedAt,
    expiredAt: a.expiredAt,
    unsubscribedAt: a.unsubscribedAt,
  }));

/** Art. 17: deletes the rate alerts of an address / account (the consent log stays as the proof). */
export const eraseRateAlerts = async (email: string, userId?: string | null, tx: Prisma.TransactionClient = prisma) =>
  (await tx.rateAlert.deleteMany({ where: personWhere(email, userId) })).count;

// ─── Staff (Admin → Settings → Life in Germany) ──────────────────────────

export const rateAlertStats = async () => {
  const [active, paused, pending] = await Promise.all([
    prisma.rateAlert.count({ where: { confirmedAt: { not: null }, unsubscribedAt: null, expiredAt: null, pausedAt: null } }),
    prisma.rateAlert.count({ where: { confirmedAt: { not: null }, unsubscribedAt: null, expiredAt: null, pausedAt: { not: null } } }),
    prisma.rateAlert.count({ where: { confirmedAt: null } }),
  ]);
  return { active, paused, pending };
};
