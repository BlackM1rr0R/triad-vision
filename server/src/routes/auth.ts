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
import { HttpError, conflict, limiter, parse } from '../lib/http.js';
import { renderEmail, sendMail } from '../lib/mailer.js';
import { loginLockedFor, recordLoginFailure, recordLoginSuccess } from '../lib/loginGuard.js';
import { audit } from '../lib/audit.js';

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
  createdAt: u.createdAt,
});

export const GERMAN_LEVELS = ['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const EDUCATION_LEVELS = ['school', 'vocational', 'university'] as const;
export const MIN_AGE = 16;
export const MAX_AGE = 70;

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

/** YYYY-MM-DD, in the past, age MIN_AGE..MAX_AGE. Empty string or null clears it. */
const birthDate = z
  .union([z.literal(''), z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === '' || v === null) return null;
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
  });

/** Creates the session for a freshly authenticated user and writes it to the response. */
const startSession = async (req: Parameters<typeof wantsBearerToken>[0], res: Parameters<typeof setSessionCookie>[0], user: User) => {
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
      phone: z.string().trim().max(40).optional(),
      locale: locale.default('az'),
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
      locale: body.locale,
    },
  });
  res.status(201).json(await startSession(req, res, user));
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const body = parse(
    z.object({ email: z.string().max(200).transform((s) => s.toLowerCase().trim()), password: z.string().max(128) }),
    req.body,
  );
  const lockedFor = loginLockedFor(body.email);
  if (lockedFor > 0) {
    res.setHeader('Retry-After', String(lockedFor));
    throw new HttpError(429, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${lockedFor}s`);
  }
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  // Always run bcrypt so a missing account takes as long as a wrong password (no user enumeration by timing).
  const hash = user?.passwordHash ?? '$2a$12$CwTycUXWue0Thq9StjUM0uJ8Z7gzXx5hQl1aQ2M0tVqF1q0uZ7m6W';
  const ok = await bcrypt.compare(body.password, hash);
  if (!user || !user.isActive || !ok) {
    recordLoginFailure(body.email);
    await audit(req, 'LOGIN_FAILED', user ? `user:${user.id}` : undefined, { email: body.email });
    throw new HttpError(401, 'INVALID_CREDENTIALS');
  }
  recordLoginSuccess(body.email);
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
      currentPassword: z.string().max(128).optional(),
      newPassword: password.optional(),
    }),
    req.body,
  );
  const { currentPassword: _currentPassword, newPassword: _newPassword, ...fields } = body;
  const data: Record<string, unknown> = { ...fields };
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
