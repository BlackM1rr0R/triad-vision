import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role, User } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { hasMinRole } from '../middleware/auth.js';
import { emailOtpActive } from './emailOtp.js';
import { open } from './secretBox.js';
import { hashRecoveryCode, normalizeRecoveryCode, verifyTotp } from './totp.js';

/** Staff accounts can open sensitive client data, so two-factor authentication is mandatory for them. */
export const isTwoFactorRequired = (role: Role) => hasMinRole(role, 'STAFF');

/** The fields every "who am I" response carries so clients can drive the verify / 2FA flows. */
export const securityFlags = (u: Pick<User, 'role' | 'emailVerifiedAt' | 'totpEnabledAt' | 'emailOtpEnabledAt'>) => ({
  emailVerified: !!u.emailVerifiedAt,
  twoFactorEnabled: !!u.totpEnabledAt,
  twoFactorRequired: isTwoFactorRequired(u.role),
  /** Two-step login with a code sent by email (candidates / employers only). */
  emailOtpEnabled: emailOtpActive(u),
});

// ─── Login challenge ────────────────────────────────────────────────────

/**
 * How long the "enter your code" step stays open after the password was accepted. 10 minutes for
 * every method (it used to be 5): an emailed code is valid for 10 minutes and delivery can be slow,
 * and the guess budget is bounded per challenge and per account anyway.
 */
export const CHALLENGE_TTL_SECONDS = 10 * 60;
/** Wrong codes accepted per challenge before the user must start over with the password. */
export const MAX_ATTEMPTS_PER_CHALLENGE = 5;
const AUDIENCE = 'tv-2fa-login';

interface ChallengeState {
  attempts: number;
  used: boolean;
  expiresAt: number;
}
const challenges = new Map<string, ChallengeState>();

/**
 * Short-lived signed token proving the password step succeeded. It is not a session.
 * `jti` identifies the challenge server-side (emailed login codes are bound to it).
 */
export const createLoginChallenge = (userId: string) => {
  const jti = crypto.randomBytes(16).toString('hex');
  challenges.set(jti, { attempts: 0, used: false, expiresAt: Date.now() + CHALLENGE_TTL_SECONDS * 1000 });
  const token = jwt.sign({ sub: userId, typ: '2fa' }, config.jwtSecret, {
    algorithm: 'HS256',
    audience: AUDIENCE,
    expiresIn: CHALLENGE_TTL_SECONDS,
    jwtid: jti,
  });
  return { token, jti };
};

export type ChallengeResult = { ok: true; userId: string; jti: string } | { ok: false };

/** Validates signature, expiry and server-side state (attempt budget, single use). */
export const readLoginChallenge = (token: string): ChallengeResult => {
  let payload: { sub?: string; typ?: string; jti?: string };
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], audience: AUDIENCE }) as typeof payload;
  } catch {
    return { ok: false };
  }
  if (payload.typ !== '2fa' || !payload.sub || !payload.jti) return { ok: false };
  const state = challenges.get(payload.jti);
  // Unknown jti = issued before a restart (or by another instance): ask for the password again.
  if (!state || state.used || state.attempts >= MAX_ATTEMPTS_PER_CHALLENGE || state.expiresAt < Date.now()) return { ok: false };
  return { ok: true, userId: payload.sub, jti: payload.jti };
};

/** Records a wrong code; returns how many attempts are left on this challenge. */
export const challengeFailed = (jti: string) => {
  const state = challenges.get(jti);
  if (!state) return 0;
  state.attempts += 1;
  return Math.max(0, MAX_ATTEMPTS_PER_CHALLENGE - state.attempts);
};

export const challengeSucceeded = (jti: string) => {
  const state = challenges.get(jti);
  if (state) state.used = true;
};

// ─── Code checks ────────────────────────────────────────────────────────

/** Last accepted TOTP step per user: a code can never be used twice (RFC 6238 §5.2). */
const lastStep = new Map<string, number>();

/** Verifies a TOTP code against the user's stored (encrypted) secret, refusing replays. */
export const checkTotp = (user: Pick<User, 'id' | 'totpSecret'>, code: string) => {
  const secret = open(user.totpSecret);
  if (!secret) return false;
  const step = verifyTotp(secret, code);
  if (step === null) return false;
  const last = lastStep.get(user.id);
  if (last !== undefined && step <= last) return false;
  lastStep.set(user.id, step);
  return true;
};

const recoveryList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

export const recoveryCodesLeft = (user: Pick<User, 'recoveryCodes'>) => recoveryList(user.recoveryCodes).length;

/** Uses up a recovery code (single use, row-locked so two parallel requests cannot both spend it). */
export const consumeRecoveryCode = async (userId: string, code: string) => {
  if (normalizeRecoveryCode(code).length < 8) return false;
  const hash = hashRecoveryCode(code);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ recoveryCodes: unknown }[]>`SELECT recoveryCodes FROM \`User\` WHERE id = ${userId} FOR UPDATE`;
    let list = rows[0]?.recoveryCodes;
    if (typeof list === 'string') {
      try {
        list = JSON.parse(list);
      } catch {
        list = [];
      }
    }
    const codes = recoveryList(list);
    const idx = codes.findIndex((h) => h.length === hash.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash)));
    if (idx < 0) return false;
    codes.splice(idx, 1);
    await tx.user.update({ where: { id: userId }, data: { recoveryCodes: codes } });
    return true;
  });
};

/** Test hook: lets a test reuse the current time step for another check. */
export const forgetUsedCodes = () => lastStep.clear();

/** Test hook. */
export const resetTwoFactorState = () => {
  challenges.clear();
  lastStep.clear();
};

// Drop expired challenges so the map cannot grow without bound.
const sweep = () => {
  const now = Date.now();
  for (const [k, s] of challenges) if (s.expiresAt < now) challenges.delete(k);
};
if (!config.isTest) setInterval(sweep, 5 * 60 * 1000).unref();
