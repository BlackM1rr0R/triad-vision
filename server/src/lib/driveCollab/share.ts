import crypto from 'node:crypto';
import type { DriveShareLink } from '@prisma/client';
import { config } from '../../config.js';

/**
 * External share links of the drive. The token (32 random bytes, base64url) is shown once; only its
 * SHA-256 is stored. A password-protected link is opened with a short-lived signed key (cookie or
 * header) bound to the link. Files inside a shared folder are addressed by opaque ids that are only
 * valid for that one link.
 */

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const MAX_LINK_DAYS = 90;
export const UNLOCK_TTL_MS = 2 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const newShareToken = () => crypto.randomBytes(32).toString('base64url');
export const shareUrl = (token: string) => `${config.clientUrl}/share/${token}`;
export const maxExpiry = (now = Date.now()) => new Date(now + MAX_LINK_DAYS * DAY);

export type LinkStatus = 'active' | 'expired' | 'revoked' | 'exhausted';

export const linkStatus = (l: Pick<DriveShareLink, 'revokedAt' | 'expiresAt' | 'maxDownloads' | 'downloads'>, now = Date.now()): LinkStatus =>
  l.revokedAt ? 'revoked' : l.expiresAt.getTime() <= now ? 'expired' : l.maxDownloads !== null && l.downloads >= l.maxDownloads ? 'exhausted' : 'active';

const hmac = (data: string) => crypto.createHmac('sha256', `${config.jwtSecret}:drive-share`).update(data).digest('base64url');

/** Key proving the password of a link was entered: "<expiresMs>.<signature>". */
export const signUnlock = (linkId: string, now = Date.now()) => {
  const exp = now + UNLOCK_TTL_MS;
  return `${exp}.${hmac(`unlock:${linkId}:${exp}`)}`;
};

export const verifyUnlock = (linkId: string, key: string | undefined | null, now = Date.now()) => {
  if (!key || key.length > 200) return false;
  const [expRaw, sig] = key.split('.');
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < now || !sig) return false;
  const want = Buffer.from(hmac(`unlock:${linkId}:${exp}`));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
};

/** Opaque id of a node inside a shared folder, valid only for this link. */
export const childRef = (linkId: string, nodeId: string) => hmac(`child:${linkId}:${nodeId}`).slice(0, 22);
