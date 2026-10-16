import crypto from 'node:crypto';
import type { Locale } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { renderEmail, sendMail } from '../mailer.js';
import { AGENT_TEXT } from './texts.js';

/**
 * Emails a 7-day "set your password" link (the regular password-reset token flow), like the
 * employer invitations. Earlier unused invitation tokens of the user are dropped.
 */
export const sendAgentInvite = async (user: { id: string; email: string; locale: Locale }, code: string) => {
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  const t = AGENT_TEXT[user.locale];
  void sendMail(
    user.email,
    `Triad Vision · ${t.inviteTitle}`,
    renderEmail(t.inviteTitle, t.inviteBody(code), { label: t.inviteCta, url: `${config.clientUrl}/reset-password?token=${token}` }),
  );
};
