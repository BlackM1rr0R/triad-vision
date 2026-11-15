import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { TvDisplayToken } from '@prisma/client';
import { prisma } from '../../db.js';
import { HttpError } from '../http.js';

/**
 * TV display tokens: a long random secret that opens ONLY the TV dashboard data + stream (/api/tv/*). It is not a
 * session: the auth middleware never accepts it (it is not a JWT), so every other endpoint treats a request that
 * carries it as anonymous / invalid. Only the SHA-256 is stored; the plain token is shown once when created.
 */
export const TV_TOKEN_PREFIX = 'tvd_';
const TOKEN_RE = /^tvd_[A-Za-z0-9_-]{43}$/;

export const hashTvToken = (token: string) => crypto.createHash('sha256').update(token, 'utf8').digest('hex');

export const newTvToken = () => `${TV_TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;

export const createTvToken = async (name: string, createdById: string) => {
  const token = newTvToken();
  const row = await prisma.tvDisplayToken.create({ data: { name, tokenHash: hashTvToken(token), tokenPrefix: token.slice(0, 10), createdById } });
  return { token, row };
};

/** Open TV streams per token id, so a revoke cuts a running stream at once. */
const streams = new Map<string, Set<() => void>>();
export const trackTvStream = (tokenId: string, close: () => void) => {
  const set = streams.get(tokenId) ?? new Set();
  set.add(close);
  streams.set(tokenId, set);
  return () => {
    set.delete(close);
    if (!set.size) streams.delete(tokenId);
  };
};

export const revokeTvToken = async (id: string, actorId: string) => {
  const { count } = await prisma.tvDisplayToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date(), revokedById: actorId } });
  for (const close of [...(streams.get(id) ?? [])]) close();
  return count > 0;
};

export const publicTvToken = (t: TvDisplayToken) => ({
  id: t.id,
  name: t.name,
  tokenPrefix: t.tokenPrefix,
  createdAt: t.createdAt,
  lastSeenAt: t.lastSeenAt,
  lastSeenIp: t.lastSeenIp,
  revokedAt: t.revokedAt,
  active: !t.revokedAt,
});

/** The token from `Authorization: Bearer tvd_…` or `X-TV-Token` (never from the URL: it would land in logs). */
const presented = (req: Request) => {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return req.get('x-tv-token')?.trim() ?? '';
};

const TOUCH_MS = 60 * 1000;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireTvToken on /api/tv/* only. */
      tvToken?: { id: string; name: string };
    }
  }
}

/** Accepts a live TV display token (401 TV_TOKEN_INVALID / TV_TOKEN_REVOKED otherwise) and records last-seen. */
export const requireTvToken = async (req: Request, _res: Response, next: NextFunction) => {
  const token = presented(req);
  if (!TOKEN_RE.test(token)) return next(new HttpError(401, 'TV_TOKEN_INVALID'));
  const row = await prisma.tvDisplayToken.findUnique({ where: { tokenHash: hashTvToken(token) } });
  if (!row) return next(new HttpError(401, 'TV_TOKEN_INVALID'));
  if (row.revokedAt) return next(new HttpError(401, 'TV_TOKEN_REVOKED'));
  if (!row.lastSeenAt || Date.now() - row.lastSeenAt.getTime() > TOUCH_MS || row.lastSeenIp !== (req.ip ?? null)) {
    await prisma.tvDisplayToken.update({ where: { id: row.id }, data: { lastSeenAt: new Date(), lastSeenIp: req.ip?.slice(0, 64) ?? null } }).catch(() => undefined);
  }
  req.tvToken = { id: row.id, name: row.name };
  next();
};
