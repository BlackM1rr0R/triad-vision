import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../../db.js';
import { HttpError } from '../http.js';

/**
 * Partner API keys (/api/v1). A key looks like `tv_<43 url-safe chars>`; only its sha256 is stored,
 * so a leaked database does not leak keys. The full key is shown exactly once, when it is created.
 */

export const API_SCOPES = ['vacancies:read', 'applications:read', 'applications:write', 'candidates:read', 'cases:read', 'events:read'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export interface ApiKeyContext {
  id: string;
  name: string;
  scopes: ApiScope[];
  /** Bound company: every partner endpoint is limited to its data. Null = platform-wide key (admin-created). */
  companyId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ApiKeyContext;
    }
  }
}

export const KEY_PREFIX = 'tv_';

export const hashApiKey = (key: string) => crypto.createHash('sha256').update(key).digest('hex');

/** A fresh key and the data to store for it. */
export const generateApiKey = () => {
  const key = `${KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
  return { key, keyHash: hashApiKey(key), prefix: key.slice(0, 8) };
};

export const isApiScope = (s: unknown): s is ApiScope => typeof s === 'string' && (API_SCOPES as readonly string[]).includes(s);

/** `lastUsedAt` is written at most this often per key (a busy integration would otherwise write on every call). */
const TOUCH_INTERVAL_MS = 60 * 1000;

const bearerKey = (req: Request) => {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice(7).trim();
  return token.startsWith(KEY_PREFIX) && token.length >= 20 && token.length <= 120 ? token : undefined;
};

/** Authenticates with an API key only (cookies and session tokens are ignored on /api/v1). */
export const apiKeyAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const token = bearerKey(req);
  if (!token) return next(new HttpError(401, 'API_KEY_REQUIRED'));
  const row = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(token) } });
  if (!row) return next(new HttpError(401, 'INVALID_API_KEY'));
  if (row.revokedAt) return next(new HttpError(401, 'API_KEY_REVOKED'));
  req.apiKey = {
    id: row.id,
    name: row.name,
    scopes: (Array.isArray(row.scopes) ? row.scopes : []).filter(isApiScope),
    companyId: row.companyId,
  };
  // Session cookies must not grant anything here: the partner API is key-only.
  req.user = undefined;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    void prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  next();
};

export const requireScope = (scope: ApiScope) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.apiKey) return next(new HttpError(401, 'API_KEY_REQUIRED'));
  if (!req.apiKey.scopes.includes(scope)) return next(new HttpError(403, 'INSUFFICIENT_SCOPE', `Scope ${scope} required`));
  next();
};
