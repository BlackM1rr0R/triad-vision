import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireMinRole, revokeUserSessions } from '../middleware/auth.js';
import { HttpError, badRequest, conflict, limiter, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { loginLockedFor, recordLoginFailure, recordLoginSuccess } from '../lib/loginGuard.js';
import { seal } from '../lib/secretBox.js';
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, otpauthUri } from '../lib/totp.js';
import {
  challengeFailed,
  challengeSucceeded,
  checkTotp,
  consumeRecoveryCode,
  isTwoFactorRequired,
  readLoginChallenge,
  recoveryCodesLeft,
} from '../lib/twoFactor.js';
import { startSession } from './auth.js';

/**
 * Two-factor authentication (TOTP, RFC 6238) — mounted at /api/auth/2fa.
 *
 *   GET  /status                       → { enabled, required, pending, enabledAt, recoveryCodesLeft }
 *   POST /setup                        → { secret, otpauthUri }            (starts / restarts enrollment)
 *   POST /enable          { code }     → { ok, recoveryCodes: string[10] } (shown once)
 *   POST /disable         { password, code }  (code = TOTP or a recovery code)
 *   POST /recovery-codes  { code }     → { recoveryCodes }                 (regenerates, old ones die)
 *   POST /verify          { challenge, code | recoveryCode } → same body as POST /api/auth/login
 *   GET  /staff                        → SUPER_ADMIN: staff list with 2FA state
 *   POST /users/:id/reset              → SUPER_ADMIN resets another user's 2FA
 */
export const twoFactorRouter = Router();

/** Per IP: generous enough for a typo or two, far too small to guess 6-digit codes. */
const verifyLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 30 });
/** Per account (these routes need a session): bounds code guessing with a stolen session cookie. */
const manageLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => (req.user ? `u:${req.user.id}` : `ip:${req.ip}`),
});

const totpCode = z.string().trim().regex(/^\d{6}$/, 'INVALID_CODE');
const anyCode = z.string().trim().min(6).max(40);

const loadUser = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });

const issueRecoveryCodes = () => {
  const codes = generateRecoveryCodes();
  return { codes, hashes: codes.map(hashRecoveryCode) };
};

twoFactorRouter.get('/status', requireAuth, async (req, res) => {
  const u = await loadUser(req.user!.id);
  res.json({
    enabled: !!u.totpEnabledAt,
    required: isTwoFactorRequired(u.role),
    pending: !u.totpEnabledAt && !!u.totpSecret,
    enabledAt: u.totpEnabledAt,
    recoveryCodesLeft: u.totpEnabledAt ? recoveryCodesLeft(u) : 0,
  });
});

twoFactorRouter.post('/setup', manageLimiter, requireAuth, async (req, res) => {
  const u = await loadUser(req.user!.id);
  if (u.totpEnabledAt) throw conflict('TWO_FACTOR_ALREADY_ENABLED');
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: u.id }, data: { totpSecret: seal(secret), recoveryCodes: [] } });
  res.json({ secret, otpauthUri: otpauthUri(secret, u.email) });
});

twoFactorRouter.post('/enable', manageLimiter, requireAuth, async (req, res) => {
  const { code } = parse(z.object({ code: totpCode }), req.body);
  const u = await loadUser(req.user!.id);
  if (u.totpEnabledAt) throw conflict('TWO_FACTOR_ALREADY_ENABLED');
  if (!u.totpSecret) throw badRequest('TWO_FACTOR_SETUP_REQUIRED');
  if (!checkTotp(u, code)) {
    await audit(req, 'TWO_FACTOR_ENABLE_FAILED', `user:${u.id}`);
    throw badRequest('INVALID_CODE');
  }
  const { codes, hashes } = issueRecoveryCodes();
  // Conditional update: two parallel "enable" calls cannot both hand out recovery codes.
  const { count } = await prisma.user.updateMany({
    where: { id: u.id, totpEnabledAt: null },
    data: { totpEnabledAt: new Date(), recoveryCodes: hashes },
  });
  if (!count) throw conflict('TWO_FACTOR_ALREADY_ENABLED');
  await audit(req, 'TWO_FACTOR_ENABLED', `user:${u.id}`);
  res.json({ ok: true, recoveryCodes: codes });
});

twoFactorRouter.post('/disable', manageLimiter, requireAuth, async (req, res) => {
  const body = parse(z.object({ password: z.string().min(1).max(128), code: anyCode }), req.body);
  const u = await loadUser(req.user!.id);
  if (!u.totpEnabledAt) throw conflict('TWO_FACTOR_NOT_ENABLED');
  if (!(await bcrypt.compare(body.password, u.passwordHash))) {
    await audit(req, 'TWO_FACTOR_DISABLE_FAILED', `user:${u.id}`, { reason: 'password' });
    throw new HttpError(400, 'WRONG_PASSWORD');
  }
  const ok = /^\d{6}$/.test(body.code) ? checkTotp(u, body.code) : await consumeRecoveryCode(u.id, body.code);
  if (!ok) {
    await audit(req, 'TWO_FACTOR_DISABLE_FAILED', `user:${u.id}`, { reason: 'code' });
    throw badRequest('INVALID_CODE');
  }
  await prisma.user.update({ where: { id: u.id }, data: { totpSecret: null, totpEnabledAt: null, recoveryCodes: [] } });
  await audit(req, 'TWO_FACTOR_DISABLED', `user:${u.id}`);
  // Staff lose access to the admin area until they enroll again (see the gate in middleware/auth.ts).
  res.json({ ok: true, enrollmentRequired: isTwoFactorRequired(u.role) });
});

twoFactorRouter.post('/recovery-codes', manageLimiter, requireAuth, async (req, res) => {
  const { code } = parse(z.object({ code: totpCode }), req.body);
  const u = await loadUser(req.user!.id);
  if (!u.totpEnabledAt) throw conflict('TWO_FACTOR_NOT_ENABLED');
  if (!checkTotp(u, code)) throw badRequest('INVALID_CODE');
  const { codes, hashes } = issueRecoveryCodes();
  await prisma.user.update({ where: { id: u.id }, data: { recoveryCodes: hashes } });
  await audit(req, 'TWO_FACTOR_RECOVERY_CODES_REGENERATED', `user:${u.id}`);
  res.json({ recoveryCodes: codes });
});

/** Second login step. Answers exactly like POST /api/auth/login (incl. the mobile token). */
twoFactorRouter.post('/verify', verifyLimiter, async (req, res) => {
  const body = parse(
    z
      .object({ challenge: z.string().min(10).max(2000), code: totpCode.optional(), recoveryCode: anyCode.optional() })
      .refine((b) => !!b.code !== !!b.recoveryCode, 'CODE_OR_RECOVERY_CODE'),
    req.body,
  );
  const challenge = readLoginChallenge(body.challenge);
  if (!challenge.ok) throw new HttpError(401, 'TWO_FACTOR_CHALLENGE_INVALID');
  const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
  if (!user || !user.isActive || !user.totpEnabledAt) throw new HttpError(401, 'TWO_FACTOR_CHALLENGE_INVALID');

  // Per-account lock shared with the password step (several challenges cannot multiply the guesses).
  const lockedFor = loginLockedFor(user.email);
  if (lockedFor > 0) {
    res.setHeader('Retry-After', String(lockedFor));
    throw new HttpError(429, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${lockedFor}s`);
  }

  const ok = body.code ? checkTotp(user, body.code) : await consumeRecoveryCode(user.id, body.recoveryCode!);
  if (!ok) {
    recordLoginFailure(user.email);
    const attemptsLeft = challengeFailed(challenge.jti);
    await audit({ user: undefined, ip: req.ip }, 'LOGIN_2FA_FAILED', `user:${user.id}`, {
      method: body.code ? 'totp' : 'recovery',
    });
    res.status(401).json({ error: 'INVALID_CODE', attemptsLeft });
    return;
  }
  challengeSucceeded(challenge.jti);
  recordLoginSuccess(user.email);
  if (body.recoveryCode) {
    const fresh = await loadUser(user.id);
    await audit({ user: undefined, ip: req.ip }, 'LOGIN_2FA_RECOVERY_CODE_USED', `user:${user.id}`, {
      left: recoveryCodesLeft(fresh),
    });
  }
  res.json(await startSession(req, res, user));
});

/** SUPER_ADMIN: who among the staff has 2FA set up (Admin → Security). */
twoFactorRouter.get('/staff', requireMinRole('SUPER_ADMIN'), async (_req, res) => {
  const staff = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true, totpEnabledAt: true },
    orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
  });
  res.json({
    staff: staff.map(({ totpEnabledAt, ...s }) => ({ ...s, twoFactorEnabled: !!totpEnabledAt, twoFactorEnabledAt: totpEnabledAt })),
  });
});

/** SUPER_ADMIN: clear another account's 2FA (lost phone). The user's sessions are revoked. */
twoFactorRouter.post('/users/:id/reset', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const id = parse(z.string().min(1).max(64), req.params.id);
  if (id === req.user!.id) throw badRequest('CANNOT_RESET_SELF');
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, totpEnabledAt: true, totpSecret: true } });
  if (!target) throw notFound('USER_NOT_FOUND');
  await prisma.user.update({ where: { id }, data: { totpSecret: null, totpEnabledAt: null, recoveryCodes: [] } });
  const { count } = await revokeUserSessions(id);
  await audit(req, 'TWO_FACTOR_RESET', `user:${id}`, { email: target.email, wasEnabled: !!target.totpEnabledAt, sessionsRevoked: count });
  res.json({ ok: true });
});
