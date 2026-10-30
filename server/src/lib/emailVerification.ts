import crypto from 'node:crypto';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { renderEmail, sendMail } from './mailer.js';

/** Verification links are valid for 24 hours and can be used once. */
export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const VERIFY_TEXT = {
  az: {
    title: 'E-poçt ünvanınızı təsdiqləyin',
    body: 'Triad Vision-da qeydiyyatdan keçdiyiniz üçün təşəkkür edirik. Hesabınızı aktivləşdirmək üçün aşağıdakı düyməyə klikləyin. Link 24 saat etibarlıdır.\n\nQeydiyyatdan siz keçməmisinizsə, bu məktubu nəzərə almayın.',
    cta: 'E-poçtu təsdiqlə',
  },
  de: {
    title: 'Bitte bestätigen Sie Ihre E-Mail-Adresse',
    body: 'Vielen Dank für Ihre Registrierung bei Triad Vision. Bitte klicken Sie auf die Schaltfläche, um Ihre E-Mail-Adresse zu bestätigen. Der Link ist 24 Stunden gültig.\n\nFalls Sie sich nicht registriert haben, ignorieren Sie diese E-Mail bitte.',
    cta: 'E-Mail-Adresse bestätigen',
  },
  en: {
    title: 'Please confirm your email address',
    body: 'Thank you for registering with Triad Vision. Click the button below to confirm your email address. The link is valid for 24 hours.\n\nIf you did not register, please ignore this email.',
    cta: 'Confirm email address',
  },
  ru: {
    title: 'Подтвердите адрес электронной почты',
    body: 'Спасибо за регистрацию в Triad Vision. Нажмите кнопку ниже, чтобы подтвердить адрес электронной почты. Ссылка действительна 24 часа.\n\nЕсли вы не регистрировались, просто проигнорируйте это письмо.',
    cta: 'Подтвердить e-mail',
  },
};

/**
 * Creates a fresh single-use token (older unused ones are invalidated) and returns the raw value.
 * Only the sha256 hash is stored. Exported for tests; production code calls sendVerificationEmail.
 */
export const createVerificationToken = async (userId: string) => {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.$transaction([
    // E-mail change tokens (newEmail set, lib/emailChange.ts) are a separate flow and stay valid.
    prisma.emailVerificationToken.updateMany({ where: { userId, usedAt: null, newEmail: null }, data: { usedAt: new Date() } }),
    prisma.emailVerificationToken.create({
      data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS) },
    }),
  ]);
  return token;
};

/**
 * Email verification (owned by the legal & security work stream).
 * Creates a single-use token (EmailVerificationToken) and emails the /verify-email?token=… link in the
 * user's language. Safe to call right after creating a user (candidate or employer). Never throws.
 */
export const sendVerificationEmail = async (userId: string): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, locale: true, emailVerifiedAt: true, isActive: true },
    });
    if (!user || user.emailVerifiedAt || !user.isActive) return;
    const token = await createVerificationToken(userId);
    const t = VERIFY_TEXT[user.locale] ?? VERIFY_TEXT.az;
    await sendMail(
      user.email,
      `Triad Vision · ${t.title}`,
      renderEmail(t.title, t.body, { label: t.cta, url: `${config.clientUrl}/verify-email?token=${token}` }),
    );
  } catch (err) {
    console.error('[verify-email] could not send', err);
  }
};

/**
 * Consumes a token. Returns the user id on success, or null when the token is unknown, used or expired.
 * The conditional update makes a token single-use even under concurrent requests.
 */
export const consumeVerificationToken = async (token: string): Promise<string | null> => {
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
  // An e-mail change token only works on its own confirm route (it must not verify the old address).
  if (!record || record.usedAt || record.newEmail || record.expiresAt < new Date()) return null;
  const now = new Date();
  const { count } = await prisma.emailVerificationToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: now },
  });
  if (!count) return null;
  await prisma.user.updateMany({ where: { id: record.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
  return record.userId;
};
