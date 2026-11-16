import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../../db.js';
import { HttpError } from '../http.js';
import { hashApiKey } from '../ops/apiKeys.js';
import { suggestPartnerCode } from '../partners/owned.js';
import { FixedWindowLimiter, KEY_PREFIX_RE, PUBLIC_KEY_PREFIX, parsePublicApiKey, rateLimitHeaders } from './rateLimit.js';

/**
 * Keys of the public vacancy API (/api/public/v1). One partner (ReferralPartner) may have several keys; only
 * the sha256 is stored and the full key is shown once. These keys are separate from the employer API keys
 * (ApiKey, /api/v1, prefix "tv_"): a "tvp_" key is never accepted there and vice versa.
 */

export interface PublicKeyContext {
  id: string;
  prefix: string;
  partnerId: string;
  partnerCode: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      publicApiKey?: PublicKeyContext;
    }
  }
}

export const generatePublicApiKey = () => {
  const key = `${PUBLIC_KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
  return { key, keyHash: hashApiKey(key), prefix: key.slice(0, 12) };
};

/** The partner's sign-up code (created on first use): the `ref` of every apply link. */
export const ensurePartnerCode = async (partnerId: string): Promise<string | null> => {
  const p = await prisma.referralPartner.findUnique({ where: { id: partnerId }, select: { id: true, name: true, code: true } });
  if (!p) return null;
  if (p.code) return p.code;
  const code = await suggestPartnerCode(p.name, p.id);
  const updated = await prisma.referralPartner.update({ where: { id: p.id }, data: { code } }).catch(() => null);
  return updated?.code ?? null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const utcDay = (d = new Date()) => new Date(Math.floor(d.getTime() / DAY_MS) * DAY_MS);

/** Counts one request (and whether it was rate-limited) for the key's day. Never throws. */
export const countUsage = async (keyId: string, rateLimited: boolean) => {
  const day = utcDay();
  const inc = { requests: { increment: 1 }, ...(rateLimited ? { rateLimited: { increment: 1 } } : {}) };
  try {
    await prisma.publicApiKeyUsage.upsert({
      where: { keyId_day: { keyId, day } },
      create: { keyId, day, requests: 1, rateLimited: rateLimited ? 1 : 0 },
      update: inc,
    });
  } catch (err) {
    // Two first requests of the day at once: the second create hits the unique index — update instead.
    if ((err as { code?: string }).code === 'P2002') {
      await prisma.publicApiKeyUsage.update({ where: { keyId_day: { keyId, day } }, data: inc }).catch(() => undefined);
    } else console.error('[public-api] usage count failed', err);
  }
};

export const limiter = new FixedWindowLimiter();
const TOUCH_INTERVAL_MS = 60 * 1000;

/** Key auth + per-key rate limit (key.rateLimitPerMinute) + usage counting for /api/public/v1. */
export const publicApiKeyAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = parsePublicApiKey(req.get('authorization'), req.get('x-api-key'));
    if (!token) return next(new HttpError(401, 'API_KEY_REQUIRED'));
    const row = await prisma.publicApiKey.findUnique({ where: { keyHash: hashApiKey(token) } });
    if (!row) return next(new HttpError(401, 'INVALID_API_KEY'));
    if (row.revokedAt) return next(new HttpError(401, 'API_KEY_REVOKED'));
    const partner = await prisma.referralPartner.findUnique({ where: { id: row.referralPartnerId }, select: { id: true, active: true, code: true } });
    if (!partner || !partner.active) return next(new HttpError(403, 'PARTNER_INACTIVE'));

    const hit = limiter.hit(row.id, row.rateLimitPerMinute);
    for (const [k, v] of Object.entries(rateLimitHeaders(hit))) res.setHeader(k, v);
    void countUsage(row.id, !hit.allowed);
    if (!hit.allowed) return next(new HttpError(429, 'TOO_MANY_REQUESTS'));

    const code = partner.code ?? (await ensurePartnerCode(partner.id)) ?? '';
    req.publicApiKey = { id: row.id, prefix: row.prefix, partnerId: partner.id, partnerCode: code };
    // Sessions never count here: the public API is key-only.
    req.user = undefined;
    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      void prisma.publicApiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    }
    next();
  } catch (err) {
    next(err);
  }
};

export const SRC_COOKIE = 'tv_src';

/**
 * Vacancy application made after following a partner's API apply link (`?src=<key prefix>` → cookie tv_src):
 * stores which key / partner it came through. Never throws (called fire-and-forget from the apply route).
 */
export const recordApiAttribution = async (req: { cookies?: Record<string, unknown> }, applicationId: string, vacancyId: string) => {
  try {
    const raw = req.cookies?.[SRC_COOKIE];
    if (typeof raw !== 'string' || !KEY_PREFIX_RE.test(raw)) return;
    const key = await prisma.publicApiKey.findUnique({ where: { prefix: raw }, select: { id: true, referralPartnerId: true, revokedAt: true } });
    if (!key || key.revokedAt) return;
    await prisma.publicApiAttribution.upsert({
      where: { applicationId },
      create: { applicationId, vacancyId, keyId: key.id, partnerId: key.referralPartnerId },
      update: {},
    });
  } catch (err) {
    console.error('[public-api] attribution failed', applicationId, err);
  }
};
