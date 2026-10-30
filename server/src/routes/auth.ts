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
import { cancelEmailChange, confirmEmailChange, emailTaken, pendingEmailChange, requestEmailChange } from '../lib/emailChange.js';
import { createLoginChallenge, securityFlags } from '../lib/twoFactor.js';
import { issueEmailOtp, loginMethods, maskEmail } from '../lib/emailOtp.js';
import multer from 'multer';
import { bufferMatches } from '../lib/fileCheck.js';
import { OCR_IMAGE_MIME, langDataAvailable } from '../lib/docsIntel/ocr.js';
import { PASSPORT_SCAN_TIMEOUT_MS, scanPassportImage } from '../lib/docsIntel/passportScan.js';
import { recordConsent } from '../lib/privacy/consents.js';
import { setMarketingOptIn } from '../lib/campaigns/consent.js';
import { attachReferral } from '../lib/agents/referral.js';
import { attachPartnerOwner, findPartnerByCode } from '../lib/partners/owned.js';
import { attachClientReferral, REF_COOKIE, normaliseRefCode, resolveReferralCode } from '../lib/growth/referral.js';
import { markClientsExcelDirty } from '../lib/clientsExcel.js';
import { syncClientFolders } from '../lib/drive/caseFolders.js';
import { scanUserDuplicates } from '../lib/duplicates/detect.js';
import { RECOGNITION_STATUSES } from '../lib/matching.js';

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
  recognitionStatus: u.recognitionStatus, // Anerkennung of the foreign qualification (matching)
  recognitionNote: u.recognitionNote,
  drivingLicence: u.drivingLicence,
  about: u.about,
  emailNotifications: u.emailNotifications,
  pushNotifications: u.pushNotifications,
  whatsappOptIn: u.whatsappOptIn,
  smsNotifications: u.smsNotifications,
  marketingOptIn: u.marketingOptIn, // news & offers (campaigns); consent log type MARKETING_EMAIL
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
      // True when the client typed the code into the visible "Referral code" field: an unknown code is then
      // refused (REFERRAL_CODE_UNKNOWN) instead of silently ignored, so the person can fix a typo.
      refEntered: z.boolean().optional(),
      // The form was filled from a passport photo (POST /passport-scan): logged as a PASSPORT_OCR consent.
      passportScanned: z.boolean().optional(),
      // Optional, unchecked by default: news and offers by e-mail (marketing consent, logged).
      marketingOptIn: z.boolean().optional(),
      // Required checkbox on the web form: "I accept the AGB" (logged as a TERMS consent with the version).
      // Older app builds do not send it: they accept the terms later in the re-acceptance dialog.
      acceptTerms: z.boolean().optional(),
      // Signing up with a referral partner's code: "my application data may be shared with <partner>" (PARTNER_SHARING consent).
      partnerConsent: z.boolean().optional(),
    }),
    req.body,
  );
  if (body.acceptTerms === false) throw badRequest('TERMS_REQUIRED');
  if (body.refEntered && body.ref && !(await findPartnerByCode(body.ref)) && !(await resolveReferralCode(body.ref))) throw badRequest('REFERRAL_CODE_UNKNOWN');
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
  // Both rows carry the current published version (recordConsent resolves version + legalDocumentId).
  await recordConsent({ userId: user.id, email: user.email, type: 'PRIVACY_POLICY', granted: true, source: 'REGISTER', req });
  if (body.acceptTerms) await recordConsent({ userId: user.id, email: user.email, type: 'TERMS', granted: true, source: 'REGISTER', req });
  if (body.passportScanned) {
    await recordConsent({ userId: user.id, email: user.email, type: 'PASSPORT_OCR', granted: true, source: 'REGISTER', req });
  }
  if (body.marketingOptIn === true) await setMarketingOptIn(user.id, true, 'REGISTER', req);
  // `ref` from the form or the 60-day first-party cookie (?ref= on any page). An agent code wins; otherwise
  // it may be a client's "bring a friend" code (lib/growth/referral.ts).
  const refCode = body.ref || (typeof req.cookies?.[REF_COOKIE] === 'string' ? String(req.cookies[REF_COOKIE]).slice(0, 64) : null);
  if (refCode) {
    // A referral partner's code wins: the client belongs to the partner (lib/partners/owned.ts) and creates
    // neither an agent commission nor a client-referral reward.
    const partner = await findPartnerByCode(refCode);
    const owned = partner ? await attachPartnerOwner(user.id, partner.id, { source: 'SIGNUP_LINK', actorId: user.id }) : false;
    if (owned && body.partnerConsent !== undefined) {
      await recordConsent({ userId: user.id, email: user.email, type: 'PARTNER_SHARING', granted: body.partnerConsent, source: 'REGISTER', req });
    }
    const agentId = owned ? null : await attachReferral(user.id, refCode);
    if (!owned && !agentId) await attachClientReferral(user.id, refCode);
    res.clearCookie(REF_COOKIE, { path: '/' });
  }
  await sendVerificationEmail(user.id);
  // The super admins' client list (Excel) gets the new client within a minute.
  markClientsExcelDirty();
  void scanUserDuplicates(user.id); // possible duplicate accounts (Admin → Dublikatlar)
  res.status(201).json(await startSession(req, res, user));
});

// ─── Referral code check (public, sign-up form) ──────────────────────

/** Live check of the optional "Referral code" field. Rate-limited; says only whether and which kind of code it is. */
const referralCheckLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 60 });
authRouter.get('/referral-code', referralCheckLimiter, async (req, res) => {
  const code = normaliseRefCode(typeof req.query.code === 'string' ? req.query.code.slice(0, 64) : '');
  // A referral partner's code: the form names the partner for the data-sharing checkbox.
  const partner = code ? await findPartnerByCode(code) : null;
  const kind = partner ? 'PARTNER' : code ? await resolveReferralCode(code) : null;
  res.json({ code, valid: !!kind, kind, ...(partner ? { partnerName: partner.name } : {}) });
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
  // "View as client": the portal renders as the viewed user; the banner needs the admin and the deadline.
  const impersonation =
    req.impersonation && req.impersonator
      ? {
          id: req.impersonation.id,
          reason: req.impersonation.reason,
          startedAt: req.impersonation.startedAt,
          expiresAt: req.impersonation.expiresAt,
          returnTo: req.impersonation.returnTo,
          admin: { id: req.impersonator.id, firstName: req.impersonator.firstName, lastName: req.impersonator.lastName, role: req.impersonator.role },
        }
      : undefined;
  res.json({ user: publicUser(user), session: { id: req.session!.id, expiresAt: req.session!.expiresAt }, ...(impersonation ? { impersonation } : {}) });
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
      recognitionStatus: z.enum(RECOGNITION_STATUSES).nullable().optional(),
      recognitionNote: optText(300),
      drivingLicence: optText(60),
      about: optText(2000),
      emailNotifications: z.boolean().optional(),
      pushNotifications: z.boolean().optional(),
      // Phone channels (messaging module); current values come from GET /api/messaging/preferences.
      whatsappOptIn: z.boolean().optional(),
      smsNotifications: z.boolean().optional(),
      // Marketing consent (campaigns): saved with date and source, logged as MARKETING_EMAIL.
      marketingOptIn: z.boolean().optional(),
      currentPassword: z.string().max(128).optional(),
      newPassword: password.optional(),
    }),
    req.body,
  );
  const { currentPassword: _currentPassword, newPassword: _newPassword, marketingOptIn, ...fields } = body;
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
  let user = await prisma.user.update({ where: { id: req.user!.id }, data });
  if (marketingOptIn !== undefined && (await setMarketingOptIn(user.id, marketingOptIn, 'PROFILE', req))) {
    user = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  }
  if (body.firstName !== undefined || body.lastName !== undefined || body.passportNumber !== undefined) void syncClientFolders(user.id); // folder names
  if (['firstName', 'lastName', 'phone', 'birthDate', 'passportNumber', 'city'].some((k) => k in body)) void scanUserDuplicates(user.id);
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
    // The link arrived in the account's mailbox, which proves the address: invited accounts (partner-registered
    // clients, package orders, partner / agent logins) count as verified once they set their password.
    prisma.user.updateMany({ where: { id: record.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } }),
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

// ─── E-mail change (every role; lib/emailChange.ts) ────────────────────

const emailChangeLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10 });

/** The open change request (or null), for the profile card. */
authRouter.get('/email-change', requireAuth, async (req, res) => {
  res.json({ pending: await pendingEmailChange(req.user!.id) });
});

/** { newEmail, currentPassword } → link to the new address (24 h) + information mail to the current one. */
authRouter.post('/email-change', emailChangeLimiter, requireAuth, async (req, res) => {
  const body = parse(
    z.object({ newEmail: z.string().trim().toLowerCase().email().max(191), currentPassword: z.string().min(1).max(128) }),
    req.body,
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
    await audit(req, 'EMAIL_CHANGE_WRONG_PASSWORD', `user:${user.id}`);
    throw new HttpError(400, 'WRONG_PASSWORD');
  }
  if (body.newEmail === user.email) throw badRequest('SAME_EMAIL');
  if (await emailTaken(body.newEmail, user.id)) throw conflict('EMAIL_TAKEN');
  // At most one new link per minute per account (on top of the per-IP limit).
  const recent = await prisma.emailVerificationToken.count({ where: { userId: user.id, newEmail: { not: null }, createdAt: { gt: new Date(Date.now() - 60 * 1000) } } });
  if (recent > 0) throw new HttpError(429, 'TOO_MANY_REQUESTS');
  await requestEmailChange(user, body.newEmail);
  await audit(req, 'EMAIL_CHANGE_REQUESTED', `user:${user.id}`, { to: maskEmail(body.newEmail) });
  res.json({ ok: true, pending: await pendingEmailChange(user.id) });
});

authRouter.delete('/email-change', requireAuth, async (req, res) => {
  const count = await cancelEmailChange(req.user!.id);
  if (count) await audit(req, 'EMAIL_CHANGE_CANCELLED', `user:${req.user!.id}`);
  res.json({ ok: true });
});

/** The link from the new mailbox (the site's /confirm-email-change page POSTs it); no session needed. */
authRouter.post('/email-change/confirm', verifyLimiter, async (req, res) => {
  const { token } = parse(verifyToken, req.body);
  const result = await confirmEmailChange(token);
  if (!result.ok) throw result.error === 'EMAIL_TAKEN' ? conflict('EMAIL_TAKEN') : new HttpError(400, 'INVALID_TOKEN');
  // Every other device logs in again with the new address; the browser confirming it (when it is the same account) stays.
  const keep = req.user?.id === result.userId ? req.session?.id : undefined;
  const { count } = await revokeUserSessions(result.userId, keep);
  await audit({ user: req.user?.id === result.userId ? req.user : undefined, ip: req.ip }, 'EMAIL_CHANGED', `user:${result.userId}`, {
    from: maskEmail(result.oldEmail),
    to: maskEmail(result.newEmail),
    sessionsRevoked: count,
  });
  markClientsExcelDirty(); // the clients sheet shows the e-mail
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
  res.json({ ok: true, email: fresh.email, user: keep ? publicUser(fresh) : null });
});
