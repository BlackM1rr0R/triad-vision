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
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const signSession = (userId: string) =>
  jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '7d' });

export const setSessionCookie = (res: Response, token: string) => {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

/** Mobile apps can't rely on cookies, so they ask for the token in the response body. */
export const wantsBearerToken = (req: Request) => req.get('x-client') === 'mobile';

const tokenFrom = (req: Request): string | undefined => {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.[AUTH_COOKIE];
};

/** Attaches req.user when a valid session cookie or Bearer token is present. Never rejects. */
export const loadUser = async (req: Request, _res: Response, next: NextFunction) => {
  const token = tokenFrom(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (user && user.isActive) {
      req.user = {
        id: user.id,
        role: user.role,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        locale: user.locale,
      };
    }
  } catch {
    // invalid/expired token: treat as anonymous
  }
  next();
};

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new HttpError(401, 'UNAUTHENTICATED'));
  next();
};

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'UNAUTHENTICATED'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'FORBIDDEN'));
    next();
  };

export const isStaff = (user?: AuthUser) => user?.role === 'STAFF' || user?.role === 'ADMIN';
