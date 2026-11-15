import crypto from 'node:crypto';

/**
 * Login-free case upload links ("Request documents via link"): token helpers and the link state. Pure (unit
 * tested: tests/unit/uploadLinks.test.ts).
 *
 * The token is 32 random bytes in base64url (43 characters, 256 bits). Only its SHA-256 is stored, so a
 * database leak does not reveal working links; the first characters are kept to recognise a link in the list.
 */

export const UPLOAD_LINK_DEFAULT_DAYS = 7;
export const UPLOAD_LINK_MAX_DAYS = 30;
/** Files one link accepts in total (it is meant for a handful of documents, not a dump). */
export const UPLOAD_LINK_MAX_FILES = 30;
export const UPLOAD_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const DAY = 24 * 60 * 60 * 1000;

export const newUploadToken = () => crypto.randomBytes(32).toString('base64url');
export const hashUploadToken = (token: string) => crypto.createHash('sha256').update(token, 'utf8').digest('hex');
export const tokenPrefixOf = (token: string) => token.slice(0, 6);

/** Expiry from a number of days (clamped to 1 … UPLOAD_LINK_MAX_DAYS, default 7). */
export const expiryFrom = (now: Date, days?: number | null) => {
  const d = Math.min(UPLOAD_LINK_MAX_DAYS, Math.max(1, Math.round(days ?? UPLOAD_LINK_DEFAULT_DAYS)));
  return new Date(now.getTime() + d * DAY);
};

export type UploadLinkState = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'EXHAUSTED';

export const uploadLinkState = (
  link: { expiresAt: Date; revokedAt: Date | null; uploadCount: number },
  now = new Date(),
): UploadLinkState => {
  if (link.revokedAt) return 'REVOKED';
  if (link.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (link.uploadCount >= UPLOAD_LINK_MAX_FILES) return 'EXHAUSTED';
  return 'ACTIVE';
};

/** The requirement ids stored on a link (JSON array of strings; anything else is ignored). */
export const requirementIdsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 40) : []);

/** Public URL of the upload page. */
export const uploadPageUrl = (clientUrl: string, token: string) => `${clientUrl.replace(/\/+$/, '')}/upload/${token}`;
