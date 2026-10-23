import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { hasMinRole, type AuthUser } from '../../middleware/auth.js';
import { audit } from '../audit.js';
import { HttpError } from '../http.js';
import { impersonationStore } from './impersonationContext.js';

/**
 * "Müştəri kimi bax" — an ADMIN / SUPER_ADMIN opens a CLIENT's or COMPANY user's portal exactly as that
 * user sees it, read-only.
 *
 *  - Started by POST /api/admin/impersonate/:userId (reason required). The admin's own session stays
 *    untouched; the browser gets a second httpOnly cookie (tv_imp) with a random token whose sha256 is
 *    stored in ImpersonationSession, bound to the admin's session id. 30 minutes, never renewed.
 *  - While it runs: req.user = the target user, req.impersonator = the admin, req.impersonation = the row.
 *  - Read-only: every non-GET/HEAD/OPTIONS request answers 403 IMPERSONATION_READ_ONLY (except stop and
 *    logout), GETs with side effects are blocked, and inside the request the Prisma write guard
 *    (impersonationContext.ts) rejects any write; notifications, e-mails, pushes, read receipts and
 *    "viewed" markers are skipped (isImpersonating()).
 *  - Audit: IMPERSONATION_STARTED / IMPERSONATION_STOPPED (with reason), and ImpersonationLog keeps the
 *    distinct paths viewed per minute.
 */

export const IMPERSONATION_COOKIE = 'tv_imp';
export const IMPERSONATION_TTL_MS = 30 * 60 * 1000;
export const IMPERSONATION_REASONS = ['SUPPORT_REQUEST', 'BUG_CHECK', 'OTHER'] as const;
export type ImpersonationReason = (typeof IMPERSONATION_REASONS)[number];
/** Roles whose portal can be viewed. */
export const IMPERSONATABLE_ROLES = ['CLIENT', 'COMPANY'] as const;

export interface ImpersonationInfo {
  id: string;
  reason: string;
  startedAt: Date;
  expiresAt: Date;
  returnTo: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The admin really behind the request while they view a client's portal. */
      impersonator?: AuthUser;
      impersonation?: ImpersonationInfo;
    }
  }
}

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const cookieOpts = () => ({ httpOnly: true, sameSite: 'lax' as const, secure: config.isProd, path: '/' });

export const setImpersonationCookie = (res: Response, token: string) =>
  res.cookie(IMPERSONATION_COOKIE, token, { ...cookieOpts(), maxAge: IMPERSONATION_TTL_MS });
export const clearImpersonationCookie = (res: Response) => res.clearCookie(IMPERSONATION_COOKIE, cookieOpts());

const toAuthUser = (u: { id: string; role: AuthUser['role']; email: string; firstName: string; lastName: string; locale: string; totpEnabledAt: Date | null }): AuthUser => ({
  id: u.id,
  role: u.role,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  locale: u.locale,
  twoFactorEnabled: !!u.totpEnabledAt,
});

// ─── Viewed paths (one row per session and minute) ─────────────────────

type Window = { minute: number; paths: Set<string>; hits: number };
const windows = new Map<string, Window>();
const MAX_PATHS_PER_WINDOW = 200;

const writeWindow = async (sessionId: string, w: Window) => {
  if (!w.hits) return;
  try {
    const { count } = await prisma.impersonationSession.updateMany({ where: { id: sessionId }, data: { requestCount: { increment: w.hits } } });
    if (count) await prisma.impersonationLog.create({ data: { sessionId, windowStart: new Date(w.minute * 60_000), paths: [...w.paths], hits: w.hits } });
  } catch (err) {
    console.error('[impersonation] log write failed', err);
  }
};

/** Normalises ids out of nothing: the exact path is what the admin looked at (query strings dropped). */
const recordPath = (sessionId: string, entry: string) => {
  const minute = Math.floor(Date.now() / 60_000);
  let w = windows.get(sessionId);
  if (w && w.minute !== minute) {
    void writeWindow(sessionId, w);
    w = undefined;
  }
  if (!w) {
    w = { minute, paths: new Set(), hits: 0 };
    windows.set(sessionId, w);
  }
  w.hits++;
  if (w.paths.size < MAX_PATHS_PER_WINDOW) w.paths.add(entry.slice(0, 300));
};

/** Writes the open minute window(s); `sessionId` limits it to one session. */
export const flushImpersonationLogs = async (sessionId?: string) => {
  const ids = sessionId ? [sessionId] : [...windows.keys()];
  for (const id of ids) {
    const w = windows.get(id);
    if (!w) continue;
    windows.delete(id);
    await writeWindow(id, w);
  }
};

// Closed minute windows are written once a minute even when the admin stops clicking.
const flushTimer = setInterval(() => {
  const minute = Math.floor(Date.now() / 60_000);
  for (const [id, w] of windows) {
    if (w.minute < minute) {
      windows.delete(id);
      void writeWindow(id, w);
    }
  }
}, 60_000);
flushTimer.unref?.();

// ─── Start / stop ──────────────────────────────────────────────────────

export const endImpersonation = async (
  req: Pick<Request, 'ip'>,
  session: { id: string; adminId: string; targetUserId: string; reason: string; startedAt: Date },
  endReason: 'STOPPED' | 'EXPIRED' | 'LOGOUT' | 'REPLACED',
) => {
  await flushImpersonationLogs(session.id);
  const ended = await prisma.impersonationSession.updateMany({ where: { id: session.id, endedAt: null }, data: { endedAt: new Date(), endReason } });
  if (!ended.count) return;
  const fresh = await prisma.impersonationSession.findUnique({ where: { id: session.id }, select: { requestCount: true } });
  const admin = await prisma.user.findUnique({ where: { id: session.adminId }, select: { id: true, role: true, email: true, firstName: true, lastName: true, locale: true, totpEnabledAt: true } });
  await audit({ user: admin ? toAuthUser(admin) : undefined, ip: req.ip }, 'IMPERSONATION_STOPPED', `user:${session.targetUserId}`, {
    sessionId: session.id,
    reason: session.reason,
    endReason,
    durationSec: Math.round((Date.now() - session.startedAt.getTime()) / 1000),
    requests: fresh?.requestCount ?? 0,
  });
};

export const startImpersonation = async (
  req: Request,
  res: Response,
  input: { targetUserId: string; reason: ImpersonationReason; note?: string | null; returnTo?: string | null },
) => {
  const admin = req.user!;
  if (!req.session || !req.cookieAuth) throw new HttpError(400, 'WEB_SESSION_REQUIRED');
  const target = await prisma.user.findUnique({ where: { id: input.targetUserId }, select: { id: true, role: true, isActive: true, firstName: true, lastName: true, email: true, companyId: true } });
  if (!target) throw new HttpError(404, 'USER_NOT_FOUND');
  if (!(IMPERSONATABLE_ROLES as readonly string[]).includes(target.role)) throw new HttpError(400, 'NOT_IMPERSONATABLE');
  if (!target.isActive) throw new HttpError(409, 'USER_INACTIVE');
  if (target.role === 'COMPANY' && !target.companyId) throw new HttpError(409, 'COMPANY_MISSING');

  // One view at a time per admin session: an older one still running is closed first.
  const running = await prisma.impersonationSession.findMany({ where: { adminSessionId: req.session.id, endedAt: null } });
  for (const r of running) await endImpersonation(req, r, 'REPLACED');

  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const row = await prisma.impersonationSession.create({
    data: {
      adminId: admin.id,
      adminSessionId: req.session.id,
      targetUserId: target.id,
      reason: input.reason,
      note: input.note || null,
      tokenHash: hashToken(token),
      returnTo: input.returnTo || null,
      ip: req.ip?.slice(0, 64) ?? null,
      userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
      startedAt: now,
      expiresAt: new Date(now.getTime() + IMPERSONATION_TTL_MS),
    },
  });
  await audit(req, 'IMPERSONATION_STARTED', `user:${target.id}`, {
    sessionId: row.id,
    reason: input.reason,
    ...(input.note ? { note: input.note } : {}),
    targetRole: target.role,
    targetName: `${target.firstName} ${target.lastName}`.trim(),
  } as Prisma.InputJsonValue);
  setImpersonationCookie(res, token);
  return { session: row, target, landing: target.role === 'COMPANY' ? '/company' : '/account' };
};

// ─── Middleware ────────────────────────────────────────────────────────

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Requests that stay possible while viewing: leaving the view, and logging out altogether. */
const STOP_PATH = '/api/admin/impersonate/stop';
const LOGOUT_PATH = '/api/auth/logout';

/**
 * GET endpoints with side effects, blocked while impersonating (their write would also be stopped by
 * the Prisma guard, but these fail fast with a clear code):
 *  - /api/privacy/export: records a completed DSGVO export request and e-mails the user
 *  - /api/documents/cases/:id/packet?store=1: stores the generated embassy packet as a case document
 *  - /api/share/*, /api/sign/*, /api/surveys/*: external links (access logs, "viewed" markers, survey opens)
 *  - /api/track/*: page-view analytics; /api/o/*, /api/c/*, /api/unsubscribe/*: campaign opens / clicks
 */
const BLOCKED_GETS: ((req: Request) => boolean)[] = [
  (req) => /^\/api\/privacy\/export\/?$/.test(req.path),
  (req) => /^\/api\/documents\/cases\/[^/]+\/packet\/?$/.test(req.path) && req.query.store === '1',
  (req) => /^\/api\/(share|sign|surveys|track|o|c|unsubscribe)(\/|$)/.test(req.path),
];

const readOnly = (code = 'IMPERSONATION_READ_ONLY') => new HttpError(403, code);

/**
 * Mounted in app.ts right after loadUser: swaps req.user for the viewed user when a valid impersonation
 * cookie belongs to the current admin session, then enforces read-only mode.
 */
export const impersonation = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.[IMPERSONATION_COOKIE];
  if (typeof token !== 'string' || !token) return next();
  if (!req.user || !req.session || !req.cookieAuth) {
    // Logged out (or a Bearer client): a leftover cookie means nothing.
    clearImpersonationCookie(res);
    return next();
  }
  let row;
  try {
    row = await prisma.impersonationSession.findUnique({ where: { tokenHash: hashToken(token) } });
  } catch {
    return next(new HttpError(503, 'IMPERSONATION_UNAVAILABLE'));
  }
  const valid = row && !row.endedAt && row.adminId === req.user.id && row.adminSessionId === req.session.id && hasMinRole(req.user.role, 'ADMIN');
  if (!row || !valid) {
    clearImpersonationCookie(res);
    res.setHeader('X-Impersonation-Ended', 'INVALID');
    return next();
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    await endImpersonation(req, row, 'EXPIRED');
    clearImpersonationCookie(res);
    res.setHeader('X-Impersonation-Ended', 'EXPIRED');
    return next();
  }
  const target = await prisma.user.findUnique({ where: { id: row.targetUserId } });
  if (!target || !target.isActive || !(IMPERSONATABLE_ROLES as readonly string[]).includes(target.role)) {
    await endImpersonation(req, row, 'STOPPED');
    clearImpersonationCookie(res);
    res.setHeader('X-Impersonation-Ended', 'INVALID');
    return next();
  }

  req.impersonator = req.user;
  req.user = toAuthUser(target);
  req.impersonation = { id: row.id, reason: row.reason, startedAt: row.startedAt, expiresAt: row.expiresAt, returnTo: row.returnTo };
  res.setHeader('X-Impersonating', '1');

  if (req.method === 'POST' && req.path === STOP_PATH) return next();
  if (req.method === 'POST' && req.path === LOGOUT_PATH) {
    await endImpersonation(req, row, 'LOGOUT');
    clearImpersonationCookie(res);
    // Logging out ends the admin's own session: hand the request back to the admin.
    req.user = req.impersonator;
    req.impersonator = undefined;
    req.impersonation = undefined;
    return next();
  }
  if (!READ_METHODS.has(req.method)) return next(readOnly());
  if (req.path.startsWith('/api/') && BLOCKED_GETS.some((fn) => fn(req))) return next(readOnly());

  recordPath(row.id, `${req.method} ${req.path}`);
  const page = req.get('x-page-path');
  if (page && /^\/[\w\-./%]*$/.test(page)) recordPath(row.id, `PAGE ${page.slice(0, 200)}`);

  impersonationStore.run({ sessionId: row.id, adminId: req.impersonator.id, targetUserId: target.id }, () => next());
};
