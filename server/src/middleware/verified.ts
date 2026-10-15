import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.js';
import { HttpError } from '../lib/http.js';

/**
 * Blocks actions that need a confirmed email address (creating a visa case, applying for a vacancy).
 * Must run after requireAuth. Responds 403 EMAIL_NOT_VERIFIED so the UI can offer "resend link".
 */
export const requireVerifiedEmail = async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new HttpError(401, 'UNAUTHENTICATED'));
  const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { emailVerifiedAt: true } });
  if (!u?.emailVerifiedAt) return next(new HttpError(403, 'EMAIL_NOT_VERIFIED'));
  next();
};
