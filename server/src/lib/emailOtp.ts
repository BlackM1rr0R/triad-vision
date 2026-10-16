import crypto from 'node:crypto';
import type { Locale, Role, User } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { renderEmail, sendMail } from './mailer.js';

/**
 * One-time codes sent by email ("email OTP").
 *
 *  - CLIENT / COMPANY accounts may turn on two-step login by email (User.emailOtpEnabledAt).
 *  - Staff keep the authenticator app as the mandatory factor; for them an email code is only a
 *    fallback on the 2FA login step (see emailLoginAllowed).
 *
 * Codes: 6 digits (crypto.randomInt), valid 10 minutes, single use, at most 5 wrong guesses each.
 * Only HMAC-SHA256(pepper, userId:purpose:code) is stored, the pepper being derived from JWT_SECRET,
 * so a database dump alone does not allow brute-forcing the 10^6 code space offline.
 * Only the newest code of a purpose is accepted (a resend invalidates the previous one).
 * Sending is throttled: one code per 60 s, at most 5 per login challenge and 5 per hour per account.
 */

export type EmailOtpPurpose = 'LOGIN' | 'ENABLE';

export const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;
export const EMAIL_OTP_MAX_ATTEMPTS = 5;
export const EMAIL_OTP_RESEND_SECONDS = 60;
export const EMAIL_OTP_MAX_PER_CHALLENGE = 5;
export const EMAIL_OTP_MAX_PER_HOUR = 5;

/** Only candidates and employers can choose email codes as their second factor. */
export const canEnableEmailOtp = (role: Role) => role === 'CLIENT' || role === 'COMPANY';

const isStaffRole = (role: Role) => role === 'STAFF' || role === 'ADMIN' || role === 'SUPER_ADMIN';

/** Email two-step login is switched on (and allowed for this role). */
export const emailOtpActive = (u: Pick<User, 'role' | 'emailOtpEnabledAt'>) => !!u.emailOtpEnabledAt && canEnableEmailOtp(u.role);

/** May this account finish the 2FA login step with an emailed code? */
export const emailLoginAllowed = (u: Pick<User, 'role' | 'emailOtpEnabledAt' | 'totpEnabledAt'>) =>
  emailOtpActive(u) || (isStaffRole(u.role) && !!u.totpEnabledAt);

export type LoginMethod = 'totp' | 'email';
export type LoginAlternative = 'email' | 'recovery';

/** Which second factor the login asks for, or null when the password is enough. */
export const loginMethods = (
  u: Pick<User, 'role' | 'emailOtpEnabledAt' | 'totpEnabledAt'>,
): { method: LoginMethod; alternatives: LoginAlternative[] } | null => {
  if (u.totpEnabledAt) {
    return { method: 'totp', alternatives: emailLoginAllowed(u) ? ['email', 'recovery'] : ['recovery'] };
  }
  if (emailOtpActive(u)) return { method: 'email', alternatives: [] };
  return null;
};

/** a***@gmail.com — enough for the user to recognise the address, useless for harvesting. */
export const maskEmail = (email: string) => {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
};

const pepper = crypto.createHmac('sha256', config.jwtSecret).update('tv-email-otp-v1').digest();

const hashCode = (userId: string, purpose: EmailOtpPurpose, code: string) =>
  crypto.createHmac('sha256', pepper).update(`${userId}:${purpose}:${code}`).digest('hex');

const generateCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

const TEXT: Record<Locale, { title: string; subject: string; login: (c: string) => string; enable: (c: string) => string; footer: string }> = {
  az: {
    title: 'Giriş kodunuz',
    subject: 'Triad Vision · Giriş kodu',
    login: (c) => `Triad Vision giriş kodunuz: ${c}`,
    enable: (c) => `E-poçt ilə iki mərhələli girişi aktivləşdirmək üçün təsdiq kodunuz: ${c}`,
    footer:
      'Kod 10 dəqiqə etibarlıdır və yalnız bir dəfə istifadə oluna bilər. Kodu heç kimə deməyin — Triad Vision əməkdaşları onu heç vaxt soruşmur.\n\nBu siz deyildinizsə, şifrənizi dəyişin.',
  },
  de: {
    title: 'Ihr Anmeldecode',
    subject: 'Triad Vision · Ihr Anmeldecode',
    login: (c) => `Ihr Triad Vision Anmeldecode: ${c}`,
    enable: (c) => `Ihr Bestätigungscode zum Aktivieren der Zwei-Schritt-Anmeldung per E-Mail: ${c}`,
    footer:
      'Der Code ist 10 Minuten gültig und kann nur einmal verwendet werden. Geben Sie den Code an niemanden weiter – Mitarbeiter von Triad Vision fragen nie danach.\n\nFalls Sie das nicht waren, ändern Sie bitte Ihr Passwort.',
  },
  en: {
    title: 'Your login code',
    subject: 'Triad Vision · Your login code',
    login: (c) => `Your Triad Vision login code: ${c}`,
    enable: (c) => `Your confirmation code to turn on two-step login by email: ${c}`,
    footer:
      "The code is valid for 10 minutes and can be used once. Never share it — Triad Vision staff will never ask for it.\n\nIf this wasn't you, change your password.",
  },
  ru: {
    title: 'Ваш код для входа',
    subject: 'Triad Vision · Код для входа',
    login: (c) => `Ваш код для входа в Triad Vision: ${c}`,
    enable: (c) => `Ваш код подтверждения для включения двухэтапного входа по e-mail: ${c}`,
    footer:
      'Код действителен 10 минут и может быть использован один раз. Никому не сообщайте код — сотрудники Triad Vision никогда его не спрашивают.\n\nЕсли это были не вы, смените пароль.',
  },
};

/**
 * The code is only in the body. The subject is stored in EmailLog (and printed by the dev console
 * transport), so it deliberately carries no code.
 */
const deliver = async (user: Pick<User, 'email' | 'locale'>, purpose: EmailOtpPurpose, code: string) => {
  const t = TEXT[user.locale] ?? TEXT.en;
  const line = purpose === 'LOGIN' ? t.login(code) : t.enable(code);
  await sendMail(user.email, t.subject, renderEmail(t.title, `${line}\n\n${t.footer}`));
};

export type IssueResult =
  | { ok: true; retryAfter: number }
  | { ok: false; error: 'EMAIL_OTP_TOO_SOON' | 'EMAIL_OTP_LIMIT'; retryAfter: number | null };

/**
 * Creates and emails a new code (older unused codes of the same purpose die), unless a send limit
 * is hit. The user row is locked for the check so parallel requests cannot exceed the limits.
 */
export const issueEmailOtp = async (
  user: Pick<User, 'id' | 'email' | 'locale'>,
  purpose: EmailOtpPurpose,
  challengeId?: string,
): Promise<IssueResult> => {
  const code = generateCode();
  const now = Date.now();
  const result = await prisma.$transaction(async (tx): Promise<IssueResult> => {
    await tx.$queryRaw`SELECT id FROM \`User\` WHERE id = ${user.id} FOR UPDATE`;
    const lastHour = await tx.emailOtpCode.findMany({
      where: { userId: user.id, createdAt: { gt: new Date(now - 60 * 60 * 1000) } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, purpose: true, challengeId: true },
    });
    const newest = lastHour.at(-1);
    if (newest) {
      const elapsed = (now - newest.createdAt.getTime()) / 1000;
      if (elapsed < EMAIL_OTP_RESEND_SECONDS) {
        return { ok: false, error: 'EMAIL_OTP_TOO_SOON', retryAfter: Math.max(1, Math.ceil(EMAIL_OTP_RESEND_SECONDS - elapsed)) };
      }
    }
    if (challengeId) {
      const perChallenge = await tx.emailOtpCode.count({ where: { userId: user.id, challengeId } });
      if (perChallenge >= EMAIL_OTP_MAX_PER_CHALLENGE) return { ok: false, error: 'EMAIL_OTP_LIMIT', retryAfter: null };
    }
    if (lastHour.length >= EMAIL_OTP_MAX_PER_HOUR) {
      const oldest = lastHour[0]!.createdAt.getTime();
      return { ok: false, error: 'EMAIL_OTP_LIMIT', retryAfter: Math.max(1, Math.ceil((oldest + 60 * 60 * 1000 - now) / 1000)) };
    }
    await tx.emailOtpCode.updateMany({ where: { userId: user.id, purpose, usedAt: null }, data: { usedAt: new Date(now) } });
    await tx.emailOtpCode.create({
      data: {
        userId: user.id,
        purpose,
        challengeId: challengeId ?? null,
        codeHash: hashCode(user.id, purpose, code),
        expiresAt: new Date(now + EMAIL_OTP_TTL_MS),
      },
    });
    return { ok: true, retryAfter: EMAIL_OTP_RESEND_SECONDS };
  });
  if (result.ok) await deliver(user, purpose, code);
  return result;
};

export type CheckResult = { ok: true } | { ok: false; reason: 'INVALID_CODE' | 'CODE_EXPIRED'; attemptsLeft: number };

/**
 * Checks (and on success consumes) the newest code of `purpose`. For LOGIN codes the code must
 * belong to the given login challenge. Wrong guesses are counted on the code itself.
 */
export const checkEmailOtp = async (
  userId: string,
  purpose: EmailOtpPurpose,
  code: string,
  challengeId?: string,
): Promise<CheckResult> => {
  const record = await prisma.emailOtpCode.findFirst({
    where: { userId, purpose, usedAt: null, ...(purpose === 'LOGIN' ? { challengeId: challengeId ?? '-' } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) return { ok: false, reason: 'CODE_EXPIRED', attemptsLeft: 0 };
  if (record.expiresAt.getTime() < Date.now() || record.attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: 'CODE_EXPIRED', attemptsLeft: 0 };
  }
  const expected = Buffer.from(record.codeHash, 'hex');
  const actual = Buffer.from(hashCode(userId, purpose, /^\d{6}$/.test(code) ? code : '-'), 'hex');
  const match = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!match) {
    await prisma.emailOtpCode.updateMany({
      where: { id: record.id, attempts: { lt: EMAIL_OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    const left = Math.max(0, EMAIL_OTP_MAX_ATTEMPTS - record.attempts - 1);
    return { ok: false, reason: left > 0 ? 'INVALID_CODE' : 'CODE_EXPIRED', attemptsLeft: left };
  }
  // Conditional update: two parallel requests cannot both spend the same code.
  const { count } = await prisma.emailOtpCode.updateMany({
    where: { id: record.id, usedAt: null, attempts: { lt: EMAIL_OTP_MAX_ATTEMPTS } },
    data: { usedAt: new Date() },
  });
  return count ? { ok: true } : { ok: false, reason: 'CODE_EXPIRED', attemptsLeft: 0 };
};

/** Kills every outstanding code of the account (after disabling, or when the flow is done). */
export const revokeEmailOtps = (userId: string, purpose?: EmailOtpPurpose) =>
  prisma.emailOtpCode.updateMany({ where: { userId, usedAt: null, ...(purpose ? { purpose } : {}) }, data: { usedAt: new Date() } });

/** Housekeeping: rows older than a day are useless (also covers the hourly send counter). */
export const purgeEmailOtps = () => prisma.emailOtpCode.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });

if (!config.isTest) {
  setInterval(() => {
    purgeEmailOtps().catch((err) => console.error('[email-otp] purge failed', err));
  }, 60 * 60 * 1000).unref();
}
