import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import type { User } from '@prisma/client';
import { prisma } from '../db.js';
import {
  clearSessionCookie,
  issueSession,
  requireAuth,
  revokeSession,
  revokeUserSessions,
  setSessionCookie,
  wantsBearerToken,
} from '../middleware/auth.js';
import { HttpError, badRequest, conflict, limiter, parse } from '../lib/http.js';
import { renderEmail, sendMail } from '../lib/mailer.js';
import { loginLockedForAsync as loginLockedFor, recordLoginFailureAsync as recordLoginFailure, recordLoginSuccessAsync as recordLoginSuccess } from '../lib/loginGuard.js';
import { audit } from '../lib/audit.js';
import { consumeVerificationToken, sendVerificationEmail } from '../lib/emailVerification.js';
import { createLoginChallenge, securityFlags } from '../lib/twoFactor.js';
import { issueEmailOtp, loginMethods, maskEmail } from '../lib/emailOtp.js';
import multer from 'multer';
import { bufferMatches } from '../lib/fileCheck.js';
import { OCR_IMAGE_MIME, langDataAvailable } from '../lib/docsIntel/ocr.js';
import { PASSPORT_SCAN_TIMEOUT_MS, scanPassportImage } from '../lib/docsIntel/passportScan.js';
import { recordConsent } from '../lib/privacy/consents.js';
import { attachReferral } from '../lib/agents/referral.js';
import { markClientsExcelDirty } from '../lib/clientsExcel.js';

export const authRouter = Router();

const authLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 30 });

const locale = z.enum(['az', 'de', 'en', 'ru']);
/** Passwords: 8–128 chars, at least one letter and one digit; anything longer than 128 is a bcrypt DoS. */
export const password = z
  .string()
  .min(8)
  .max(128)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'PASSWORD_TOO_WEAK');

/** The signed-in user as returned to the client (never includes the password hash). */
export const publicUser = (u: User) => ({
  id: u.id,
  email: u.email,
  role: u.role,
  firstName: u.firstName,
  lastName: u.lastName,
  phone: u.phone,
  locale: u.locale,
  birthDate: u.birthDate ? u.birthDate.toISOString().slice(0, 10) : null,
  passportNumber: u.passportNumber,
  nationality: u.nationality,
  city: u.city,
  address: u.address,
  profession: u.profession,
  experienceYears: u.experienceYears,
  germanLevel: u.germanLevel,
  education: u.education,
  drivingLicence: u.drivingLicence,
  about: u.about,
  emailNotifications: u.emailNotifications,
  pushNotifications: u.pushNotifications,
  whatsappOptIn: u.whatsappOptIn,
  smsNotifications: u.smsNotifications,
  createdAt: u.createdAt,
  // emailVerified, twoFactorEnabled, twoFactorRequired
  ...securityFlags(u),
});

export const GERMAN_LEVELS = ['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const EDUCATION_LEVELS = ['school', 'vocational', 'university'] as const;
export const MIN_AGE = 16;
export const MAX_AGE = 80;

/** Optional free-text profile field: trimmed; an empty string clears it (stored as null). */
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));

/** Whole years between `birth` and `now`, both read as UTC calendar dates. */
export const ageOn = (birth: Date, now = new Date()) => {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
};

/** A YYYY-MM-DD birth date: a real calendar date, in the past, age MIN_AGE..MAX_AGE. */
const checkBirthDate = (v: string, ctx: z.RefinementCtx): Date => {
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_DATE' });
    return z.NEVER;
  }
  if (d.getTime() >= Date.now()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'DATE_NOT_IN_PAST' });
    return z.NEVER;
  }
  const age = ageOn(d);
  if (age < MIN_AGE || age > MAX_AGE) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'AGE_OUT_OF_RANGE' });
    return z.NEVER;
  }
  return d;
};

/** YYYY-MM-DD, in the past, age MIN_AGE..MAX_AGE. Empty string or null clears it. */
const birthDate = z
  .union([z.literal(''), z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === '' || v === null) return null;
    return checkBirthDate(v, ctx);
  });

/** Registration: the birth date is required (as written in the foreign passport). */
const requiredBirthDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'INVALID_DATE')
  .transform((v, ctx) => checkBirthDate(v, ctx));

/**
 * Foreign (international) passport number, as printed in the passport: letters and digits only,
 * 5–20 characters. Spaces and dashes are removed and letters upper-cased ("c 0123 4567" → "C01234567").
 */
export const passportNo = z
  .string()
  .trim()
  .max(40)
  .transform((v, ctx) => {
    const compact = v.replace(/[\s-]/g, '').toUpperCase();
    if (!/^[A-Z0-9]{5,20}$/.test(compact)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_PASSPORT' });
      return z.NEVER;
    }
    return compact;
  });

/**
 * International phone number: "+" and 8–15 digits; spaces, dashes, dots and brackets between the
 * digits are allowed and removed ("+994 50 123-45-67" → "+994501234567").
 */
export const intlPhone = z
  .string()
  .trim()
  .max(40)
  .transform((v, ctx) => {
    const compact = v.replace(/[\s\-.()]/g, '');
    if (!/^\+\d{8,15}$/.test(compact)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_PHONE' });
      return z.NEVER;
    }
    return compact;
  });

/** Creates the session for a freshly authenticated user and writes it to the response. */
export const startSession = async (req: Parameters<typeof wantsBearerToken>[0], res: Parameters<typeof setSessionCookie>[0], user: User) => {
  const client = wantsBearerToken(req) ? 'mobile' : 'web';
  const { token, session } = await issueSession(user.id, { client, ip: req.ip, userAgent: req.get('user-agent') });
  if (client === 'web') setSessionCookie(res, token, client);
  return {
    user: publicUser(user),
    session: { id: session.id, expiresAt: session.expiresAt },
    ...(client === 'mobile' ? { token } : {}),
  };
};

authRouter.post('/register', authLimiter, async (req, res) => {
  const body = parse(
    z.object({
      email: z.string().trim().toLowerCase().email().max(200),
      password,
      firstName: z.string().trim().min(1).max(80),
      lastName: z.string().trim().min(1).max(80),
      // Candidates: phone (with country code) and birth date are required at sign-up.
      phone: intlPhone,
      birthDate: requiredBirthDate,
      // Registration is done with the foreign passport: its number is required.
      passportNumber: passportNo,
      locale: locale.default('az'),
      // Agent referral code from the sign-up link (?ref=CODE); unknown or paused codes are ignored.
      ref: z.string().trim().max(64).optional().nullable(),
      // The form was filled from a passport photo (POST /passport-scan): logged as a PASSPORT_OCR consent.
      passportScanned: z.boolean().optional(),
    }),
    req.body,
  );
  const exists = await prisma.user.findUnique({ where: { email: body.email } });
  if (exists) throw conflict('EMAIL_TAKEN');

  const user = await prisma.user.create({
    data: {
      email: body.email,
      passwordHash: await bcrypt.hash(body.password, 12),
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      birthDate: body.birthDate,
      passportNumber: body.passportNumber,
      locale: body.locale,
    },
  });
  // The sign-up form requires accepting the privacy policy; the consent log is the proof.
  await recordConsent({ userId: user.id, email: user.email, type: 'PRIVACY_POLICY', granted: true, source: 'REGISTER', req });
  if (body.passportScanned) {
    await recordConsent({ userId: user.id, email: user.email, type: 'PASSPORT_OCR', granted: true, source: 'REGISTER', req });
  }
  if (body.ref) await attachReferral(user.id, body.ref);
  await sendVerificationEmail(user.id);
  // The super admins' client list (Excel) gets the new client within a minute.
  markClientsExcelDirty();
  res.status(201).json(await startSession(req, res, user));
});

// ─── Passport photo → sign-up fields (public) ─────────────────────────

export const PASSPORT_SCAN_MAX_BYTES = 8 * 1024 * 1024;
const passportScanLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 10 });
/** Memory only: the photo is never written to disk or the database. */
const passportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PASSPORT_SCAN_MAX_BYTES, files: 1, fields: 5, fieldSize: 1000 },
  fileFilter: (_req, file, cb) => {
    if (OCR_IMAGE_MIME.includes(file.mimetype)) cb(null, true);
    else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
});

authRouter.post('/passport-scan', passportScanLimiter, passportUpload.single('image'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('NO_FILE');
  if (!bufferMatches(file.buffer, file.mimetype)) throw badRequest('FILE_CONTENT_MISMATCH');
  if (!langDataAvailable()) throw new HttpError(503, 'OCR_UNAVAILABLE');
  res.setHeader('Cache-Control', 'no-store');
  let result;
  try {
    result = await scanPassportImage(file.buffer, { timeoutMs: PASSPORT_SCAN_TIMEOUT_MS });
  } catch (err) {
    console.error('[passport-scan] OCR failed', (err as Error)?.message);
    throw new HttpError(503, 'OCR_UNAVAILABLE');
  }
  if (!result.ok) {
    res.status(result.error === 'OCR_TIMEOUT' ? 504 : 422).json(result);
    return;
  }
  res.json(result);
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const body = parse(
    z.object({ email: z.string().max(200).transform((s) => s.toLowerCase().trim()), password: z.string().max(128) }),
    req.body,
  );
  const lockedFor = await loginLockedFor(body.email);
  if (lockedFor > 0) {
    res.setHeader('Retry-After', String(lockedFor));
    throw new HttpError(429, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${lockedFor}s`);
  }
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  // Always run bcrypt so a missing account takes as long as a wrong password (no user enumeration by timing).
  const hash = user?.passwordHash ?? '$2a$12$CwTycUXWue0Thq9StjUM0uJ8Z7gzXx5hQl1aQ2M0tVqF1q0uZ7m6W';
  const ok = await bcrypt.compare(body.password, hash);
  if (!user || !user.isActive || !ok) {
    await recordLoginFailure(body.email);
    await audit(req, 'LOGIN_FAILED', user ? `user:${user.id}` : undefined, { email: body.email });
    throw new HttpError(401, 'INVALID_CREDENTIALS');
  }
  const methods = loginMethods(user);
  if (methods) {
    // Password accepted, but no session yet: the client must complete POST /api/auth/2fa/verify.
    // The failure counter is only reset once the second factor succeeds, so a known password does
    // not give unlimited code guesses.
    const { token: challenge, jti } = createLoginChallenge(user.id);
    await audit({ user: undefined, ip: req.ip }, 'LOGIN_2FA_CHALLENGE', `user:${user.id}`, { method: methods.method });
    if (methods.method === 'email') {
      // Email two-step login (candidates / employers without an authenticator app): send the code now.
      const sent = await issueEmailOtp(user, 'LOGIN', jti);
      if (sent.ok) await audit({ user: undefined, ip: req.ip }, 'LOGIN_EMAIL_OTP_SENT', `user:${user.id}`, { trigger: 'login' });
      res.json({
        twoFactorRequired: true,
        challenge,
        ...methods,
        email: maskEmail(user.email),
        emailSent: sent.ok,
        retryAfter: sent.retryAfter,
      });
      return;
    }
    res.json({ twoFactorRequired: true, challenge, ...methods });
    return;
  }
  await recordLoginSuccess(body.email);
  res.json(await startSession(req, res, user));
});

authRouter.post('/logout', async (req, res) => {
  if (req.session) await revokeSession(req.session.id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', async (req, res) => {
  if (!req.user) {
    // Tell the client *why* its token no longer works so it can show "session expired" instead of a generic error.
    res.json({ user: null, ...(req.authFailure ? { reason: req.authFailure } : {}) });
    return;
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
  res.json({ user: publicUser(user), session: { id: req.session!.id, expiresAt: req.session!.expiresAt } });
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const body = parse(
    z.object({
      firstName: z.string().trim().min(1).max(80).optional(),
      lastName: z.string().trim().min(1).max(80).optional(),
      phone: z.string().trim().max(40).nullable().optional(),
      locale: locale.optional(),
      birthDate,
      passportNumber: z.union([z.literal(''), z.null(), passportNo]).optional().transform((v) => (v === '' ? null : v)),
      nationality: optText(80),
      city: optText(80),
      address: optText(300),
      profession: optText(120),
      experienceYears: z.number().int().min(0).max(50).nullable().optional(),
      germanLevel: z.enum(GERMAN_LEVELS).nullable().optional(),
      education: z.enum(EDUCATION_LEVELS).nullable().optional(),
      drivingLicence: optText(60),
      about: optText(2000),
      emailNotifications: z.boolean().optional(),
      pushNotifications: z.boolean().optional(),
      // Phone channels (messaging module); current values come from GET /api/messaging/preferences.
      whatsappOptIn: z.boolean().optional(),
      smsNotifications: z.boolean().optional(),
      currentPassword: z.string().max(128).optional(),
      newPassword: password.optional(),
    }),
    req.body,
  );
  const { currentPassword: _currentPassword, newPassword: _newPassword, ...fields } = body;
  const data: Record<string, unknown> = { ...fields };
  const channelsTouched = body.whatsappOptIn !== undefined || body.smsNotifications !== undefined;
  const before = channelsTouched
    ? await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { whatsappOptIn: true, smsNotifications: true } })
    : null;
  if (body.newPassword) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!body.currentPassword || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
      throw new HttpError(400, 'WRONG_PASSWORD');
    }
    data.passwordHash = await bcrypt.hash(body.newPassword, 12);
  }
  const user = await prisma.user.update({ where: { id: req.user!.id }, data });
  if (body.newPassword) {
    // Every other device must log in again with the new password; this one keeps its session.
    await revokeUserSessions(user.id, req.session!.id);
    await audit(req, 'PASSWORD_CHANGED', `user:${user.id}`);
  }
  // Phone channels are consents: every change is appended to the consent log.
  if (before && body.whatsappOptIn !== undefined && body.whatsappOptIn !== before.whatsappOptIn) {
    await recordConsent({ userId: user.id, email: user.email, type: 'WHATSAPP', granted: body.whatsappOptIn, source: 'PROFILE', req });
  }
  if (before && body.smsNotifications !== undefined && body.smsNotifications !== before.smsNotifications) {
    await recordConsent({ userId: user.id, email: user.email, type: 'SMS', granted: body.smsNotifications, source: 'PROFILE', req });
  }
  res.json({ user: publicUser(user) });
});

// ─── Sessions (security page: "where am I logged in?") ─────────────────

authRouter.get('/sessions', requireAuth, async (req, res) => {
  const sessions = await prisma.session.findMany({
    where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: { id: true, client: true, ip: true, userAgent: true, createdAt: true, lastSeenAt: true, expiresAt: true },
  });
  res.json({ sessions: sessions.map((s) => ({ ...s, current: s.id === req.session!.id })) });
});

/** Logs out every other device. */
authRouter.delete('/sessions', requireAuth, async (req, res) => {
  const { count } = await revokeUserSessions(req.user!.id, req.session!.id);
  await audit(req, 'SESSIONS_REVOKED', `user:${req.user!.id}`, { count });
  res.json({ ok: true, revoked: count });
});

authRouter.delete('/sessions/:id', requireAuth, async (req, res) => {
  const { count } = await prisma.session.updateMany({
    where: { id: String(req.params.id), userId: req.user!.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!count) throw new HttpError(404, 'SESSION_NOT_FOUND');
  if (req.params.id === req.session!.id) clearSessionCookie(res);
  res.json({ ok: true });
});

// ─── Password reset ────────────────────────────────────────────────────

const RESET_TEXT = {
  az: { title: 'Şifrənin bərpası', body: 'Şifrənizi yeniləmək üçün aşağıdakı düyməyə klikləyin. Link 1 saat etibarlıdır. Bu sorğunu siz göndərməmisinizsə, bu məktubu nəzərə almayın.', cta: 'Yeni şifrə təyin et' },
  de: { title: 'Passwort zurücksetzen', body: 'Klicken Sie auf die Schaltfläche, um Ihr Passwort zurückzusetzen. Der Link ist 1 Stunde gültig. Falls Sie dies nicht angefordert haben, ignorieren Sie diese E-Mail.', cta: 'Neues Passwort festlegen' },
  en: { title: 'Reset your password', body: 'Click the button below to reset your password. The link is valid for 1 hour. If you did not request this, ignore this email.', cta: 'Set a new password' },
  ru: { title: 'Восстановление пароля', body: 'Нажмите кнопку ниже, чтобы сменить пароль. Ссылка действительна 1 час. Если вы не запрашивали восстановление, проигнорируйте это письмо.', cta: 'Задать новый пароль' },
};

authRouter.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = parse(z.object({ email: z.string().max(200).transform((s) => s.toLowerCase().trim()) }), req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  // Always answer the same way so the endpoint cannot be used to discover registered emails.
  if (user && user.isActive) {
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const t = RESET_TEXT[user.locale];
    void sendMail(
      user.email,
      `Triad Vision · ${t.title}`,
      renderEmail(t.title, t.body, { label: t.cta, url: `${config.clientUrl}/reset-password?token=${token}` }),
    );
  }
  res.json({ ok: true });
});

authRouter.post('/reset-password', authLimiter, async (req, res) => {
  const body = parse(z.object({ token: z.string().min(10).max(200), password }), req.body);
  const tokenHash = crypto.createHash('sha256').update(body.token).digest('hex');
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) throw new HttpError(400, 'INVALID_TOKEN');

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await bcrypt.hash(body.password, 12) } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Other unused reset links for this account become useless too.
    prisma.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: new Date() } }),
    // A reset usually follows a compromise: log every device out.
    prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit({ user: undefined, ip: req.ip }, 'PASSWORD_RESET', `user:${record.userId}`);
  res.json({ ok: true });
});

// ─── Email verification ────────────────────────────────────────────────

const verifyLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 20 });
const resendLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 5 });
const verifyToken = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });

const verifyEmail = async (req: Parameters<typeof audit>[0], token: string) => {
  const userId = await consumeVerificationToken(token);
  if (!userId) throw new HttpError(400, 'INVALID_TOKEN');
  await audit({ user: undefined, ip: req.ip }, 'EMAIL_VERIFIED', `user:${userId}`);
  return { ok: true };
};

// The link in the email opens the site's /verify-email page, which POSTs the token. GET is accepted
// too (e.g. for API clients), but it is a state change, so it is rate-limited the same way.
authRouter.get('/verify-email', verifyLimiter, async (req, res) => {
  const { token } = parse(verifyToken, req.query);
  res.json(await verifyEmail(req, token));
});

authRouter.post('/verify-email', verifyLimiter, async (req, res) => {
  const { token } = parse(verifyToken, req.body);
  res.json(await verifyEmail(req, token));
});

authRouter.post('/resend-verification', resendLimiter, requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { emailVerifiedAt: true } });
  if (user.emailVerifiedAt) {
    res.json({ ok: true, alreadyVerified: true });
    return;
  }
  // At most one new link per minute per account (on top of the per-IP limit).
  const recent = await prisma.emailVerificationToken.count({
    where: { userId: req.user!.id, createdAt: { gt: new Date(Date.now() - 60 * 1000) } },
  });
  if (recent > 0) throw new HttpError(429, 'TOO_MANY_REQUESTS');
  await sendVerificationEmail(req.user!.id);
  res.json({ ok: true });
});
