import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Locale } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { renderEmail, sendMail } from './mailer.js';

/**
 * Employer team (employer portal › Profile › Team): the company's owner invites colleagues as further COMPANY
 * logins of the same company, sees them and can deactivate them (never deleted: their decisions, signatures and
 * audit entries stay attributable).
 *
 * Owner: the schema has no owner flag, so the owner is the company's OLDEST ACTIVE employer login (the one who
 * registered the company or was invited first by staff). If staff deactivate that login, the next oldest active
 * one takes over automatically — no extra field to keep in sync.
 */

/** Active employer logins per company (owner included). */
export const COMPANY_TEAM_CAP = 10;
/** The set-password link of an invitation stays valid this long (same as staff invitations). */
export const TEAM_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const companyOwnerId = async (companyId: string): Promise<string | null> => {
  const u = await prisma.user.findFirst({
    where: { companyId, role: 'COMPANY', isActive: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  return u?.id ?? null;
};

const INVITE_TEXT: Record<Locale, { title: string; body: (inviter: string, company: string) => string; cta: string }> = {
  az: {
    title: 'Triad Vision işəgötürən kabinetinə dəvət',
    body: (i, c) => `${i} sizi Triad Vision işəgötürən kabinetində ${c} komandasına əlavə etdi. Şifrənizi təyin etmək üçün aşağıdakı düyməyə klikləyin. Link 7 gün etibarlıdır.`,
    cta: 'Şifrəni təyin et',
  },
  de: {
    title: 'Einladung zum Triad-Vision-Arbeitgeberportal',
    body: (i, c) => `${i} hat Sie zum Team von ${c} im Triad-Vision-Arbeitgeberportal hinzugefügt. Klicken Sie auf die Schaltfläche, um Ihr Passwort festzulegen. Der Link ist 7 Tage gültig.`,
    cta: 'Passwort festlegen',
  },
  en: {
    title: 'Invitation to the Triad Vision employer portal',
    body: (i, c) => `${i} added you to the ${c} team in the Triad Vision employer portal. Click the button below to set your password. The link is valid for 7 days.`,
    cta: 'Set your password',
  },
  ru: {
    title: 'Приглашение в кабинет работодателя Triad Vision',
    body: (i, c) => `${i} добавил(а) вас в команду ${c} в кабинете работодателя Triad Vision. Нажмите кнопку ниже, чтобы задать пароль. Ссылка действительна 7 дней.`,
    cta: 'Задать пароль',
  },
};

/** New single-use set-password link (the regular password-reset token flow) mailed to the member. */
export const sendTeamInvite = async (user: { id: string; email: string; locale: Locale }, inviter: string, companyName: string) => {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.$transaction([
    // A resend replaces the previous link.
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + TEAM_INVITE_TTL_MS) },
    }),
  ]);
  const t = INVITE_TEXT[user.locale] ?? INVITE_TEXT.de;
  void sendMail(user.email, `Triad Vision · ${t.title}`, renderEmail(t.title, t.body(inviter, companyName), { label: t.cta, url: `${config.clientUrl}/reset-password?token=${token}` }));
  return token;
};

/** Creates the COMPANY login with an unusable random password (set through the link). */
export const createTeamMember = async (companyId: string, input: { email: string; firstName: string; lastName: string; locale: Locale }) =>
  prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
      role: 'COMPANY',
      firstName: input.firstName,
      lastName: input.lastName,
      locale: input.locale,
      companyId,
    },
  });
