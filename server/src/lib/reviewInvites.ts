import crypto from 'node:crypto';
import type { User } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { renderEmail, sendMail } from './mailer.js';
import { notifyUser } from './notifications.js';
import { textsFor } from './growthTexts.js';

/** An invitation link is valid this long after it was (re)sent. */
export const REVIEW_INVITE_TTL_DAYS = 60;
const DAY = 24 * 60 * 60 * 1000;

export const hashReviewToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

export const inviteExpired = (createdAt: Date, now = new Date()) => now.getTime() - createdAt.getTime() > REVIEW_INVITE_TTL_DAYS * DAY;

/**
 * Email (with the tokenised link) + in-app notification (link without token: the logged-in
 * candidate is recognised by their session, so the raw token is never stored anywhere).
 */
const deliver = async (user: User, token: string) => {
  const tx = textsFor(user.locale);
  const { title, body } = tx.reviewInvite({ firstName: user.firstName });
  await notifyUser(user.id, { type: 'REVIEW_INVITE', title, body, link: '/review', email: false });
  if (user.isActive && user.emailNotifications !== false) {
    const url = `${config.clientUrl}/review?token=${encodeURIComponent(token)}`;
    void sendMail(user.email, `Triad Vision · ${title}`, renderEmail(title, body, { label: tx.cta.review, url }));
  }
};

/** Creates the REQUESTED review row for an approved case and sends the invitation. Returns null if one exists. */
export const inviteForCase = async (caseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, include: { client: true } });
  if (!c) return null;
  const token = newToken();
  try {
    const review = await prisma.review.create({
      data: { userId: c.clientId, caseId: c.id, tokenHash: hashReviewToken(token), locale: c.client.locale, status: 'REQUESTED' },
    });
    await deliver(c.client, token);
    return review;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return null;
    throw err;
  }
};

/** New token (the old link stops working), validity restarts, invitation sent again. */
export const resendInvite = async (reviewId: string) => {
  const token = newToken();
  const review = await prisma.review.update({
    where: { id: reviewId },
    data: { tokenHash: hashReviewToken(token), createdAt: new Date() },
    include: { user: true },
  });
  await deliver(review.user, token);
  return review;
};
