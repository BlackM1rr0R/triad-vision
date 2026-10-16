import crypto from 'node:crypto';
import type { SignatureSigner } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';

/**
 * Email codes that confirm a signer's identity before they sign through the emailed link.
 * Same rules as the login codes (lib/emailOtp.ts) but stored on the signer row:
 * 6 digits, 10 minutes, single use, 5 wrong guesses, one send per 60 s and at most 5 per hour.
 * Only HMAC-SHA256(pepper, signerId:code) is stored. A correct code yields a short-lived signing
 * session (random secret, only its SHA-256 stored) carried in an HttpOnly cookie.
 */

export const SIGN_OTP_TTL_MS = 10 * 60 * 1000;
export const SIGN_OTP_MAX_ATTEMPTS = 5;
export const SIGN_OTP_RESEND_SECONDS = 60;
export const SIGN_OTP_MAX_PER_HOUR = 5;
export const SIGN_SESSION_TTL_MS = 30 * 60 * 1000;

const pepper = crypto.createHmac('sha256', config.jwtSecret).update('tv-esign-otp-v1').digest();
const hashCode = (signerId: string, code: string) => crypto.createHmac('sha256', pepper).update(`${signerId}:${code}`).digest('hex');
export const sha256Hex = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');

/** Constant-time comparison of two hex digests. */
export const sameHex = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a || !b || a.length !== b.length) return false;
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

export type SignOtpIssue =
  | { ok: true; code: string; retryAfter: number }
  | { ok: false; error: 'OTP_TOO_SOON' | 'OTP_LIMIT'; retryAfter: number };

/** Creates a new code (the previous one dies). The caller emails it. */
export const issueSignOtp = async (signer: Pick<SignatureSigner, 'id'>, now = new Date()): Promise<SignOtpIssue> => {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM SignatureSigner WHERE id = ${signer.id} FOR UPDATE`;
    const s = await tx.signatureSigner.findUniqueOrThrow({ where: { id: signer.id } });
    const t = now.getTime();
    if (s.otpSentAt) {
      const elapsed = (t - s.otpSentAt.getTime()) / 1000;
      if (elapsed < SIGN_OTP_RESEND_SECONDS) {
        return { ok: false as const, error: 'OTP_TOO_SOON' as const, retryAfter: Math.max(1, Math.ceil(SIGN_OTP_RESEND_SECONDS - elapsed)) };
      }
    }
    const windowFresh = s.otpWindowAt && t - s.otpWindowAt.getTime() < 60 * 60 * 1000;
    const count = windowFresh ? s.otpWindowCount : 0;
    if (count >= SIGN_OTP_MAX_PER_HOUR) {
      return { ok: false as const, error: 'OTP_LIMIT' as const, retryAfter: Math.max(1, Math.ceil((s.otpWindowAt!.getTime() + 60 * 60 * 1000 - t) / 1000)) };
    }
    await tx.signatureSigner.update({
      where: { id: s.id },
      data: {
        otpHash: hashCode(s.id, code),
        otpExpiresAt: new Date(t + SIGN_OTP_TTL_MS),
        otpAttempts: 0,
        otpSentAt: now,
        otpWindowAt: windowFresh ? s.otpWindowAt : now,
        otpWindowCount: count + 1,
      },
    });
    return { ok: true as const, code, retryAfter: SIGN_OTP_RESEND_SECONDS };
  });
};

export type SignOtpCheck = { ok: true; session: string } | { ok: false; reason: 'INVALID_CODE' | 'CODE_EXPIRED'; attemptsLeft: number };

/** Checks (and on success consumes) the current code and opens a signing session. */
export const verifySignOtp = async (signerId: string, code: string, now = new Date()): Promise<SignOtpCheck> => {
  const s = await prisma.signatureSigner.findUnique({ where: { id: signerId } });
  if (!s || !s.otpHash || !s.otpExpiresAt || s.otpExpiresAt.getTime() < now.getTime() || s.otpAttempts >= SIGN_OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: 'CODE_EXPIRED', attemptsLeft: 0 };
  }
  const match = sameHex(s.otpHash, hashCode(s.id, /^\d{6}$/.test(code) ? code : '-'));
  if (!match) {
    await prisma.signatureSigner.updateMany({
      where: { id: s.id, otpHash: s.otpHash, otpAttempts: { lt: SIGN_OTP_MAX_ATTEMPTS } },
      data: { otpAttempts: { increment: 1 } },
    });
    const left = Math.max(0, SIGN_OTP_MAX_ATTEMPTS - s.otpAttempts - 1);
    return { ok: false, reason: left > 0 ? 'INVALID_CODE' : 'CODE_EXPIRED', attemptsLeft: left };
  }
  const session = crypto.randomBytes(32).toString('base64url');
  // Conditional update: the same code cannot open two sessions.
  const { count } = await prisma.signatureSigner.updateMany({
    where: { id: s.id, otpHash: s.otpHash, otpAttempts: { lt: SIGN_OTP_MAX_ATTEMPTS } },
    data: {
      otpHash: null,
      otpExpiresAt: null,
      otpVerifiedAt: now,
      sessionHash: sha256Hex(session),
      sessionExpiresAt: new Date(now.getTime() + SIGN_SESSION_TTL_MS),
    },
  });
  return count ? { ok: true, session } : { ok: false, reason: 'CODE_EXPIRED', attemptsLeft: 0 };
};

/** Is `session` (from the cookie) the live signing session of this signer? */
export const signSessionValid = (s: Pick<SignatureSigner, 'sessionHash' | 'sessionExpiresAt'>, session: string | undefined, now = new Date()) =>
  !!session && !!s.sessionExpiresAt && s.sessionExpiresAt.getTime() > now.getTime() && sameHex(s.sessionHash, sha256Hex(session));

/** a***@gmail.com */
export const maskEmail = (email: string) => {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
};
