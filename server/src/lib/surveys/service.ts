import crypto from 'node:crypto';
import type { CaseStatus, SurveyTrigger } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { renderEmail, sendMail } from '../mailer.js';
import { notifyUser } from '../notifications.js';
import { surveyTexts } from './texts.js';

/**
 * Internal satisfaction surveys (NPS + four ratings), separate from the public review invitations.
 *
 * Link tokens: the token is HMAC-SHA256(server secret, survey id) — 32 pseudo-random bytes, base64url.
 * Only its sha256 is stored (tokenHash), so a database leak alone reveals no working link, while the
 * server can rebuild the same link for the reminder / a resend without invalidating the first e-mail.
 */

export const SURVEY_TTL_DAYS = 30;
export const SURVEY_REMINDER_DAYS = 3;
/** A client is not surveyed again within this many days (family member cases, quick re-closures). */
export const SURVEY_CLIENT_COOLDOWN_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export const SURVEY_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const hashSurveyToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
export const surveyToken = (surveyId: string) => crypto.createHmac('sha256', config.jwtSecret).update(`survey:${surveyId}`).digest('base64url');
export const surveyUrl = (token: string) => `${config.clientUrl}/survey/${token}`;

export const surveyExpired = (sentAt: Date, now = new Date()) => now.getTime() - sentAt.getTime() > SURVEY_TTL_DAYS * DAY;

export const triggerFor = (status: CaseStatus): SurveyTrigger | null =>
  status === 'APPROVED' ? 'VISA_APPROVED' : status === 'REJECTED' || status === 'CANCELLED' ? 'CASE_CLOSED' : null;

/**
 * E-mail with the tokenised link + in-app notification. The in-app link carries the survey id instead
 * of the token: the logged-in client is recognised by their session, so no raw token is stored anywhere.
 */
export const deliverSurvey = async (surveyId: string, kind: 'invite' | 'reminder') => {
  const s = await prisma.satisfactionSurvey.findUnique({
    where: { id: surveyId },
    include: { client: true, case: { select: { number: true } } },
  });
  if (!s || !s.client.isActive) return false;
  const tx = surveyTexts(s.client.locale);
  const title = kind === 'invite' ? tx.inviteTitle : tx.reminderTitle;
  const body =
    kind === 'invite'
      ? tx.inviteBody({ firstName: s.client.firstName, number: s.case.number, approved: s.trigger === 'VISA_APPROVED' })
      : tx.reminderBody({ firstName: s.client.firstName, number: s.case.number });
  await notifyUser(s.clientId, { type: 'SURVEY', title, body, link: `/survey/${s.id}`, caseId: s.caseId, email: false });
  if (s.client.emailNotifications !== false) {
    void sendMail(s.client.email, `Triad Vision · ${title}`, renderEmail(title, body, { label: tx.cta, url: surveyUrl(surveyToken(s.id)) }));
  }
  return true;
};

/**
 * Creates the survey for a case that just reached APPROVED / REJECTED / CANCELLED and sends it.
 * One survey per case (unique caseId); family member cases are never surveyed (the main case is), and a
 * client surveyed in the last 30 days is skipped. Returns the survey or null when nothing was sent.
 */
export const createSurveyForCase = async (caseId: string, status: CaseStatus, now = new Date()) => {
  const trigger = triggerFor(status);
  if (!trigger) return null;
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, clientId: true, status: true, parentCaseId: true, assignedStaffId: true, client: { select: { isActive: true, role: true } } },
  });
  if (!c || c.status !== status || c.parentCaseId || !c.client?.isActive || c.client.role !== 'CLIENT') return null;
  if (await prisma.satisfactionSurvey.findUnique({ where: { caseId }, select: { id: true } })) return null;
  const recent = await prisma.satisfactionSurvey.count({
    where: { clientId: c.clientId, sentAt: { gte: new Date(now.getTime() - SURVEY_CLIENT_COOLDOWN_DAYS * DAY) } },
  });
  if (recent > 0) return null;

  const id = crypto.randomBytes(12).toString('hex');
  try {
    const survey = await prisma.satisfactionSurvey.create({
      data: { id, caseId, clientId: c.clientId, staffId: c.assignedStaffId, trigger, tokenHash: hashSurveyToken(surveyToken(id)), sentAt: now },
    });
    await deliverSurvey(survey.id, 'invite');
    return survey;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return null; // concurrent close of the same case
    throw err;
  }
};

/** Fire-and-forget hook for caseFlow: never throws, never blocks the transition. */
export const surveyOnCaseFinal = async (caseId: string, status: CaseStatus) => {
  try {
    await createSurveyForCase(caseId, status);
  } catch (err) {
    if (!config.isTest) console.error('[survey] could not create the survey', caseId, err);
  }
};

/**
 * Daily job: one reminder 3 days after sending when still unanswered (remindedAt makes it idempotent),
 * nothing after that and nothing once the link expired.
 */
export const runSurveyReminders = async (now = new Date()) => {
  const due = await prisma.satisfactionSurvey.findMany({
    where: {
      answeredAt: null,
      remindedAt: null,
      sentAt: { lte: new Date(now.getTime() - SURVEY_REMINDER_DAYS * DAY), gt: new Date(now.getTime() - SURVEY_TTL_DAYS * DAY) },
    },
    select: { id: true },
    take: 500,
  });
  let reminded = 0;
  for (const s of due) {
    // Claim first, so overlapping runs never send twice.
    const { count } = await prisma.satisfactionSurvey.updateMany({ where: { id: s.id, remindedAt: null, answeredAt: null }, data: { remindedAt: now } });
    if (!count) continue;
    if (await deliverSurvey(s.id, 'reminder')) reminded++;
  }
  return { reminded };
};
