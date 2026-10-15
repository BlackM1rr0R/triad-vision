import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError } from '../lib/http.js';

export const AUTH_COOKIE = 'tv_session';

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
  locale: string;
  /** True once the user has completed TOTP enrollment (see the 2FA gate below). */
  twoFactorEnabled?: boolean;
}

export interface AuthSession {
  id: string;
  client: 'web' | 'mobile';
  expiresAt: Date;
}

/** Why a presented token was not accepted; surfaced as the 401 error code so the UI can explain. */
export type AuthFailure = 'SESSION_EXPIRED' | 'SESSION_REVOKED' | 'INVALID_TOKEN';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      session?: AuthSession;
      authFailure?: AuthFailure;
      /** True when the session came from the cookie (CSRF checks apply) rather than a Bearer token. */
      cookieAuth?: boolean;
      /** Exact request bytes (set by the JSON parser) for webhook signature checks. */
      rawBody?: Buffer;
    }
  }
}

// COMPANY (employer) sits at the client level: no staff powers. Client-only routes must check role === 'CLIENT'.
export const ROLE_RANK: Record<Role, number> = { CLIENT: 0, COMPANY: 0, STAFF: 1, ADMIN: 2, SUPER_ADMIN: 3 };
export const hasMinRole = (role: Role | undefined, min: Role) => role !== undefined && ROLE_RANK[role] >= ROLE_RANK[min];
export const isStaff = (user?: AuthUser) => hasMinRole(user?.role, 'STAFF');

/** Mobile apps can't rely on cookies, so they ask for the token in the response body. */
export const wantsBearerToken = (req: Request) => req.get('x-client') === 'mobile';

const sessionLifetime = (client: 'web' | 'mobile') => {
  const s = config.session;
  return client === 'mobile'
    ? { idleMs: s.mobileIdleDays * 24 * 60 * 60 * 1000, maxMs: s.mobileMaxDays * 24 * 60 * 60 * 1000 }
    : { idleMs: s.webIdleMinutes * 60 * 1000, maxMs: s.webMaxHours * 60 * 60 * 1000 };
};

/**
 * Creates a server-side session and returns the JWT that references it. The token is only a
 * pointer: revoking the session row invalidates the token immediately.
 */
export const issueSession = async (
  userId: string,
  meta: { client: 'web' | 'mobile'; ip?: string; userAgent?: string },
) => {
  const { maxMs } = sessionLifetime(meta.client);
  const expiresAt = new Date(Date.now() + maxMs);
  const session = await prisma.session.create({
    data: { userId, client: meta.client, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 500) ?? null, expiresAt },
  });
  const token = jwt.sign({ sub: userId, sid: session.id }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: Math.floor(maxMs / 1000),
  });
  return { token, session };
};

export const setSessionCookie = (res: Response, token: string, client: 'web' | 'mobile' = 'web') => {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    maxAge: sessionLifetime(client).maxMs,
  });
};

export const clearSessionCookie = (res: Response) => {
  res.clearCookie(AUTH_COOKIE, { httpOnly: true, sameSite: 'lax', secure: config.isProd, path: '/' });
};

export const revokeSession = (sessionId: string) =>
  prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });

/** Revokes every live session of a user, optionally keeping the one making the request. */
export const revokeUserSessions = (userId: string, except?: string) =>
  prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(except ? { id: { not: except } } : {}) },
    data: { revokedAt: new Date() },
  });

/** Deletes sessions that can never be used again (run periodically). */
export const purgeDeadSessions = () =>
  prisma.session.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }],
    },
  });

const tokenFrom = (req: Request): { token: string; fromCookie: boolean } | undefined => {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return { token: header.slice(7).trim(), fromCookie: false };
  const cookie = req.cookies?.[AUTH_COOKIE];
  return typeof cookie === 'string' && cookie ? { token: cookie, fromCookie: true } : undefined;
};

/** How often `lastSeenAt` is written back (every request would be a needless write per call). */
const TOUCH_INTERVAL_MS = 60 * 1000;

/**
 * Attaches req.user/req.session when a valid, live session token is present. Never rejects by
 * itself; `requireAuth` turns a failure into a 401 with a specific code.
 */
export const loadUser = async (req: Request, _res: Response, next: NextFunction) => {
  const presented = tokenFrom(req);
  if (!presented) return next();

  let payload: { sub?: string; sid?: string };
  try {
    payload = jwt.verify(presented.token, config.jwtSecret, { algorithms: ['HS256'] }) as { sub?: string; sid?: string };
  } catch (err) {
    req.authFailure = (err as { name?: string }).name === 'TokenExpiredError' ? 'SESSION_EXPIRED' : 'INVALID_TOKEN';
    return next();
  }
  if (!payload.sid || !payload.sub) {
    req.authFailure = 'INVALID_TOKEN';
    return next();
  }

  try {
    const session = await prisma.session.findUnique({ where: { id: payload.sid }, include: { user: true } });
    const now = Date.now();
    if (!session || session.userId !== payload.sub) {
      req.authFailure = 'INVALID_TOKEN';
      return next();
    }
    if (session.revokedAt) {
      req.authFailure = 'SESSION_REVOKED';
      return next();
    }
    if (session.expiresAt.getTime() <= now) {
      req.authFailure = 'SESSION_EXPIRED';
      return next();
    }
    const { idleMs } = sessionLifetime(session.client === 'mobile' ? 'mobile' : 'web');
    if (idleMs > 0 && now - session.lastSeenAt.getTime() > idleMs) {
      req.authFailure = 'SESSION_EXPIRED';
      await revokeSession(session.id);
      return next();
    }
    if (!session.user.isActive) {
      req.authFailure = 'SESSION_REVOKED';
      return next();
    }

    req.user = {
      id: session.user.id,
      role: session.user.role,
      email: session.user.email,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      locale: session.user.locale,
      twoFactorEnabled: !!session.user.totpEnabledAt,
    };
    req.session = { id: session.id, client: session.client === 'mobile' ? 'mobile' : 'web', expiresAt: session.expiresAt };
    req.cookieAuth = presented.fromCookie;

    if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      // Best effort: a lost write only means the idle clock is slightly behind.
      void prisma.session
        .update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } })
        .catch(() => undefined);
    }
  } catch {
    // Database hiccup: treat as anonymous; protected routes answer 401 rather than 500.
    req.authFailure = 'INVALID_TOKEN';
  }
  next();
};

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new HttpError(401, req.authFailure ?? 'UNAUTHENTICATED'));
  next();
};

// ─── 2FA enrollment gate (legal & security stream) ─────────────────────
// Two-factor authentication is mandatory for staff roles. A staff member without completed TOTP
// enrollment can still log in, read /api/auth/me and enroll via /api/auth/2fa/*, but every route
// protected by a staff-level role check (all of /api/admin/* and /api/docs/*) answers
// 403 TWO_FACTOR_ENROLLMENT_REQUIRED until enrollment is finished.
const twoFactorGate = (req: Request) =>
  req.user && hasMinRole(req.user.role, 'STAFF') && !req.user.twoFactorEnabled
    ? new HttpError(403, 'TWO_FACTOR_ENROLLMENT_REQUIRED')
    : undefined;
// ─────────────────────────────────────────────────────────────────────────

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, req.authFailure ?? 'UNAUTHENTICATED'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'FORBIDDEN'));
    // 2FA gate: only when the check grants staff powers.
    if (roles.every((r) => hasMinRole(r, 'STAFF'))) {
      const gate = twoFactorGate(req);
      if (gate) return next(gate);
    }
    next();
  };

/** Allows the given role and every role above it (STAFF < ADMIN < SUPER_ADMIN). */
export const requireMinRole = (min: Role) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new HttpError(401, req.authFailure ?? 'UNAUTHENTICATED'));
  if (!hasMinRole(req.user.role, min)) return next(new HttpError(403, 'FORBIDDEN'));
  // 2FA gate: only when the check grants staff powers.
  if (hasMinRole(min, 'STAFF')) {
    const gate = twoFactorGate(req);
    if (gate) return next(gate);
  }
  next();
};

/**
 * CSRF defence in depth for cookie sessions: state-changing requests must come from an allowed
 * origin. Browsers always send Origin (or Sec-Fetch-Site) on cross-site POST/PUT/PATCH/DELETE;
 * Bearer-token clients (mobile) are not affected because a cookie is never attached to them.
 */
export const csrfGuard = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.cookieAuth || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite === 'same-origin' || fetchSite === 'none') return next();
  const origin = req.get('origin') ?? (req.get('referer') ? safeOrigin(req.get('referer')!) : undefined);
  if (origin && config.allowedOrigins.includes(origin)) return next();
  next(new HttpError(403, 'CSRF_ORIGIN_REJECTED'));
};

const safeOrigin = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};
