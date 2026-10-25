import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/http.js';
import { getLicense } from '../lib/license/index.js';
import { isStaff } from './auth.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Staff writes that stay possible in read-only mode: signing in and out (incl. 2FA), the user's own sidebar
 * preferences, marking notifications read and device / push registrations.
 */
const ALLOWED = [/^\/api\/auth(\/|$)/, /^\/api\/admin\/me\//, /^\/api\/notifications(\/|$)/, /^\/api\/devices(\/|$)/, /^\/api\/site\/push\//];

/**
 * Licence read-only mode (expired beyond the grace period, invalid or missing licence on a customer
 * instance, lib/license): staff accounts can still sign in and read everything, but every other write is
 * refused with 403 LICENSE_READ_ONLY. Clients, employers and partners are never affected — their own data
 * stays reachable and editable (DSGVO), and their requests keep reaching the agency.
 */
export const licenseGuard = (req: Request, _res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (getLicense().mode !== 'readonly') return next();
  if (!req.user || !isStaff(req.user)) return next();
  const path = req.originalUrl.split('?')[0];
  if (ALLOWED.some((re) => re.test(path))) return next();
  next(new HttpError(403, 'LICENSE_READ_ONLY'));
};
