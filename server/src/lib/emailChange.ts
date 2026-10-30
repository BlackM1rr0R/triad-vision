import crypto from 'node:crypto';
import type { Locale } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { renderEmail, sendMail } from './mailer.js';
import { maskEmail } from './emailOtp.js';

/**
 * Self-service e-mail change (every role):
 *
 *   request  (signed in, current password checked by the route) → EmailVerificationToken with `newEmail`
 *            (24 h, single use, only the sha256 stored) + a confirmation mail to the NEW address and an
 *            information mail to the OLD address ("was this you?").
 *   confirm  (token from the new mailbox; no session needed) → uniqueness re-checked, User.email replaced and
 *            marked verified, other change links of the user die, every other session is revoked.
 *
 * The regular verification flow (lib/emailVerification.ts) ignores these tokens and vice versa.
 */

export const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const TEXT: Record<Locale, { title: string; body: (to: string) => string; cta: string; infoTitle: string; info: (to: string) => string }> = {
  az: {
    title: 'Yeni e-poçt ünvanınızı təsdiqləyin',
    body: (to) => `Triad Vision hesabınızın e-poçt ünvanını ${to} ilə əvəz etmək istədiniz. Dəyişikliyi tamamlamaq üçün aşağıdakı düyməyə klikləyin. Link 24 saat etibarlıdır.\n\nBu sorğunu siz göndərməmisinizsə, bu məktubu nəzərə almayın — ünvanınız dəyişməyəcək.`,
    cta: 'Yeni ünvanı təsdiqlə',
    infoTitle: 'E-poçt ünvanının dəyişdirilməsi tələb olundu',
    info: (to) => `Hesabınızın e-poçt ünvanını ${to} ilə əvəz etmək üçün sorğu göndərildi. Dəyişiklik yalnız yeni ünvana göndərilən link təsdiqləndikdən sonra qüvvəyə minir.\n\nBu siz deyilsinizsə, dərhal şifrənizi dəyişin və bizimlə əlaqə saxlayın.`,
  },
  de: {
    title: 'Bitte bestätigen Sie Ihre neue E-Mail-Adresse',
    body: (to) => `Sie möchten die E-Mail-Adresse Ihres Triad-Vision-Kontos in ${to} ändern. Klicken Sie auf die Schaltfläche, um die Änderung abzuschließen. Der Link ist 24 Stunden gültig.\n\nFalls Sie das nicht angefordert haben, ignorieren Sie diese E-Mail — Ihre Adresse bleibt unverändert.`,
    cta: 'Neue Adresse bestätigen',
    infoTitle: 'Änderung Ihrer E-Mail-Adresse angefordert',
    info: (to) => `Für Ihr Konto wurde eine Änderung der E-Mail-Adresse in ${to} angefordert. Sie wird erst wirksam, wenn der Link an die neue Adresse bestätigt wird.\n\nWaren Sie das nicht? Ändern Sie bitte sofort Ihr Passwort und kontaktieren Sie uns.`,
  },
  en: {
    title: 'Please confirm your new email address',
    body: (to) => `You asked to change the email address of your Triad Vision account to ${to}. Click the button below to complete the change. The link is valid for 24 hours.\n\nIf you did not request this, ignore this email — your address stays the same.`,
    cta: 'Confirm new address',
    infoTitle: 'Email address change requested',
    info: (to) => `A change of your account's email address to ${to} was requested. It only takes effect once the link sent to the new address is confirmed.\n\nIf this was not you, change your password right away and contact us.`,
  },
  ru: {
    title: 'Подтвердите новый адрес электронной почты',
    body: (to) => `Вы хотите изменить адрес электронной почты аккаунта Triad Vision на ${to}. Нажмите кнопку ниже, чтобы завершить изменение. Ссылка действительна 24 часа.\n\nЕсли вы этого не запрашивали, проигнорируйте письмо — адрес останется прежним.`,
    cta: 'Подтвердить новый адрес',
    infoTitle: 'Запрошено изменение адреса e-mail',
    info: (to) => `Запрошено изменение адреса электронной почты вашего аккаунта на ${to}. Изменение вступит в силу только после подтверждения ссылки, отправленной на новый адрес.\n\nЕсли это были не вы, немедленно смените пароль и свяжитесь с нами.`,
  },
};

/** Is the address in use by another account? */
export const emailTaken = async (email: string, exceptUserId?: string) => {
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return !!u && u.id !== exceptUserId;
};

/** The open (unused, not expired) change request of a user, or null. */
export const pendingEmailChange = async (userId: string) => {
  const t = await prisma.emailVerificationToken.findFirst({
    where: { userId, usedAt: null, newEmail: { not: null }, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { newEmail: true, expiresAt: true, createdAt: true },
  });
  return t ? { newEmail: t.newEmail!, expiresAt: t.expiresAt, requestedAt: t.createdAt } : null;
};

/** Cancels every open change request of the user. Returns how many were open. */
export const cancelEmailChange = async (userId: string) =>
  (await prisma.emailVerificationToken.updateMany({ where: { userId, usedAt: null, newEmail: { not: null } }, data: { usedAt: new Date() } })).count;

/**
 * Creates the change token (older open requests die) and mails both addresses. Returns the raw token
 * (tests). The caller checked the password and that `newEmail` is free and different.
 */
export const requestEmailChange = async (user: { id: string; email: string; locale: Locale }, newEmail: string) => {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({ where: { userId: user.id, usedAt: null, newEmail: { not: null } }, data: { usedAt: new Date() } }),
    prisma.emailVerificationToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), newEmail, expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS) },
    }),
  ]);
  const t = TEXT[user.locale] ?? TEXT.az;
  // renderEmail + sendMail: branded HTML with the plain-text alternative (mailer.plainTextOf).
  void sendMail(newEmail, `Triad Vision · ${t.title}`, renderEmail(t.title, t.body(newEmail), { label: t.cta, url: `${config.clientUrl}/confirm-email-change?token=${token}` }));
  void sendMail(user.email, `Triad Vision · ${t.infoTitle}`, renderEmail(t.infoTitle, t.info(maskEmail(newEmail))));
  return token;
};

export type ConfirmResult =
  | { ok: true; userId: string; oldEmail: string; newEmail: string }
  | { ok: false; error: 'INVALID_TOKEN' | 'EMAIL_TAKEN' };

/**
 * Uses a change token: the address must still be free (re-checked, plus the unique index as the last word).
 * The token is consumed atomically, so two concurrent confirmations change the address once.
 */
export const confirmEmailChange = async (token: string): Promise<ConfirmResult> => {
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || !record.newEmail || record.usedAt || record.expiresAt < new Date()) return { ok: false, error: 'INVALID_TOKEN' };
  const user = await prisma.user.findUnique({ where: { id: record.userId }, select: { id: true, email: true, isActive: true } });
  if (!user || !user.isActive) return { ok: false, error: 'INVALID_TOKEN' };
  const newEmail = record.newEmail;
  if (await emailTaken(newEmail, user.id)) return { ok: false, error: 'EMAIL_TAKEN' };
  const now = new Date();
  try {
    const changed = await prisma.$transaction(async (tx) => {
      const { count } = await tx.emailVerificationToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: now } });
      if (!count) return false;
      await tx.user.update({ where: { id: user.id }, data: { email: newEmail, emailVerifiedAt: now } });
      // Every other open change link (and plain verification link of the old address) becomes useless.
      await tx.emailVerificationToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
      // Password reset links went to the old mailbox: they die with the address.
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
      return true;
    });
    if (!changed) return { ok: false, error: 'INVALID_TOKEN' };
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return { ok: false, error: 'EMAIL_TAKEN' };
    throw err;
  }
  return { ok: true, userId: user.id, oldEmail: user.email, newEmail };
};
