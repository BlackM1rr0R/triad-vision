import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../http.js';

/**
 * White-label licence of this instance.
 *
 * Token: `TV1.<base64url(payload JSON)>.<base64url(Ed25519 signature of "TV1.<payload part>")>`, issued by the
 * owner with deploy/whitelabel/issue-license.mjs and the PRIVATE key, which never leaves the owner's machine.
 * Only the PUBLIC key below is compiled into the app, so an instance can verify a token but never mint one.
 *
 * Instance role (env INSTANCE_ROLE):
 *   owner     the owner's own installation (triad-vision.de): no licence needed, everything unlimited;
 *   customer  an agency's instance: LICENSE_KEY is required.
 * When INSTANCE_ROLE is unset: a LICENSE_KEY makes it a customer instance; without one, the instance is the
 * owner's when its domain is the owner's (triad-vision.de) or it is not a production build (dev, tests).
 * Any other production instance without a key counts as a customer instance with a missing licence — so
 * every customer instance must have LICENSE_KEY (new-instance.sh writes INSTANCE_ROLE=customer + the key).
 *
 * Behaviour: valid → normal. Expired → GRACE_DAYS with a banner for admins, then read-only for staff.
 * Invalid (bad signature, other domain) or missing → read-only for staff at once. Clients, employers and
 * partners are never locked out of their own data (DSGVO): only staff writes are refused.
 * Plan limits are soft: the staff seat limit blocks creating / promoting more staff accounts, modules not in
 * the plan are hidden like modules switched off in System → Modules.
 */

export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAGqS+vybGzxMUy0I6JeLnwVDK+TikMqIx+zBhM0cIS1E=
-----END PUBLIC KEY-----
`;

/**
 * Tests sign their own tokens with a throw-away key pair and install its public key here. Deliberately not an
 * environment variable: an instance must not be able to swap the key by configuration.
 */
let publicKeyOverride: crypto.KeyObject | string | null = null;
export const setLicensePublicKeyForTests = (key: crypto.KeyObject | string | null) => {
  publicKeyOverride = key;
  cached = null;
};

export const TOKEN_PREFIX = 'TV1';
export const GRACE_DAYS = 14;
const DAY = 86_400_000;
/** Domains of the owner's own installation (and local development). */
export const OWNER_DOMAINS = ['triad-vision.de', 'www.triad-vision.de', 'localhost', '127.0.0.1'];

export const licensePayloadSchema = z.object({
  v: z.literal(1),
  id: z.string().min(1).max(64),
  customer: z.string().min(1).max(200),
  /** Site domain the licence is bound to ("*" = any, "*.example.com" = subdomains). */
  domain: z.string().min(1).max(200),
  plan: z.string().min(1).max(40),
  /** Modules of the plan ("*" = every module). Keys as in lib/navModules.ts MODULE_KEYS. */
  modules: z.union([z.literal('*'), z.array(z.string().max(40)).max(100)]),
  /** Active staff accounts (STAFF / ADMIN / SUPER_ADMIN) allowed; null = unlimited. */
  staffLimit: z.number().int().min(1).max(100_000).nullable(),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type LicensePayload = z.infer<typeof licensePayloadSchema>;

export type InstanceRole = 'owner' | 'customer';
export type LicenseStatus = 'owner' | 'valid' | 'grace' | 'expired' | 'invalid' | 'missing';
export type LicenseReason = 'format' | 'signature' | 'payload' | 'domain';

export interface LicenseState {
  role: InstanceRole;
  status: LicenseStatus;
  /** readonly: staff may read but not write (clients unaffected). */
  mode: 'normal' | 'readonly';
  reason?: LicenseReason;
  payload?: LicensePayload;
  domain: string;
  /** Allowed modules; null = all. */
  modules: string[] | null;
  staffLimit: number | null;
  expiresAt?: string;
  /** Days until expiry (negative once expired). */
  daysLeft?: number;
  graceEndsAt?: string;
  checkedAt: string;
}

const b64u = (buf: Buffer) => buf.toString('base64url');

/** Signs a payload (used by the owner's CLI and by tests; the server never has a private key). */
export const signLicense = (payload: LicensePayload, privateKey: crypto.KeyObject | string) => {
  const body = `${TOKEN_PREFIX}.${b64u(Buffer.from(JSON.stringify(payload), 'utf8'))}`;
  const sig = crypto.sign(null, Buffer.from(body, 'utf8'), privateKey);
  return `${body}.${b64u(sig)}`;
};

export const domainMatches = (licensed: string, actual: string) => {
  const l = licensed.trim().toLowerCase().replace(/^www\./, '');
  const a = actual.trim().toLowerCase().replace(/^www\./, '');
  if (l === '*') return true;
  if (l.startsWith('*.')) return a === l.slice(2) || a.endsWith(l.slice(1));
  return l === a;
};

export type VerifyResult = { ok: true; payload: LicensePayload } | { ok: false; reason: LicenseReason; payload?: LicensePayload };

/** Signature, payload shape and (optionally) domain. Expiry is judged by evaluateLicense. */
export const verifyLicenseToken = (token: string, opts: { publicKey?: crypto.KeyObject | string; domain?: string } = {}): VerifyResult => {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX || !parts[1] || !parts[2]) return { ok: false, reason: 'format' };
  let valid = false;
  try {
    valid = crypto.verify(null, Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8'), opts.publicKey ?? publicKeyOverride ?? LICENSE_PUBLIC_KEY_PEM, Buffer.from(parts[2], 'base64url'));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'signature' };
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'payload' };
  }
  const parsed = licensePayloadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'payload' };
  if (opts.domain !== undefined && !domainMatches(parsed.data.domain, opts.domain)) return { ok: false, reason: 'domain', payload: parsed.data };
  return { ok: true, payload: parsed.data };
};

/** The site's domain: BRAND_DOMAIN, else the host of CLIENT_URL. */
export const instanceDomain = (env: NodeJS.ProcessEnv = process.env) => {
  const explicit = (env.BRAND_DOMAIN ?? '').trim().toLowerCase();
  if (explicit) return explicit;
  try {
    return new URL(env.CLIENT_URL ?? 'http://localhost:5173').hostname.toLowerCase();
  } catch {
    return 'localhost';
  }
};

export const resolveInstanceRole = (env: NodeJS.ProcessEnv = process.env): InstanceRole => {
  const raw = (env.INSTANCE_ROLE ?? '').trim().toLowerCase();
  if (raw === 'owner' || raw === 'customer') return raw;
  if ((env.LICENSE_KEY ?? '').trim()) return 'customer';
  if (env.NODE_ENV !== 'production') return 'owner';
  return OWNER_DOMAINS.includes(instanceDomain(env)) ? 'owner' : 'customer';
};

/** Pure evaluation (unit tests pass env, clock and key). */
export const evaluateLicense = (
  opts: { env?: NodeJS.ProcessEnv; now?: Date; publicKey?: crypto.KeyObject | string } = {},
): LicenseState => {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const role = resolveInstanceRole(env);
  const domain = instanceDomain(env);
  const base = { role, domain, checkedAt: now.toISOString() };
  if (role === 'owner') return { ...base, status: 'owner', mode: 'normal', modules: null, staffLimit: null };
  const token = (env.LICENSE_KEY ?? '').trim();
  if (!token) return { ...base, status: 'missing', mode: 'readonly', modules: null, staffLimit: null };
  const result = verifyLicenseToken(token, { publicKey: opts.publicKey, domain });
  if (!result.ok) return { ...base, status: 'invalid', mode: 'readonly', reason: result.reason, payload: result.payload, modules: null, staffLimit: null };
  const p = result.payload;
  const expires = new Date(p.expiresAt).getTime();
  const daysLeft = Math.ceil((expires - now.getTime()) / DAY);
  const graceEnds = expires + GRACE_DAYS * DAY;
  const limits = { payload: p, modules: p.modules === '*' ? null : p.modules, staffLimit: p.staffLimit, expiresAt: p.expiresAt, daysLeft };
  if (now.getTime() < expires) return { ...base, ...limits, status: 'valid', mode: 'normal' };
  const graceEndsAt = new Date(graceEnds).toISOString();
  if (now.getTime() < graceEnds) return { ...base, ...limits, status: 'grace', mode: 'normal', graceEndsAt };
  return { ...base, ...limits, status: 'expired', mode: 'readonly', graceEndsAt };
};

// ─── Cached state (startup + daily job, lib/../jobs/license.ts) ───────

const TTL_MS = 60 * 60 * 1000;
let cached: LicenseState | null = null;
let cachedAt = 0;

export const getLicense = (): LicenseState => {
  if (!cached || Date.now() - cachedAt > TTL_MS) {
    cached = evaluateLicense();
    cachedAt = Date.now();
  }
  return cached;
};

/** Re-reads the environment (tests, daily job). */
export const refreshLicense = (): LicenseState => {
  cached = null;
  return getLicense();
};

/** Logged at startup and by the daily job, so a coming expiry shows in the server log too. */
export const logLicense = (s: LicenseState = getLicense()) => {
  if (s.status === 'owner') return;
  const msg = `[license] ${s.status} (${s.payload?.customer ?? 'no customer'}, plan ${s.payload?.plan ?? '-'}, domain ${s.domain}${s.expiresAt ? `, expires ${s.expiresAt.slice(0, 10)}` : ''}${s.reason ? `, reason ${s.reason}` : ''})`;
  if (s.status === 'valid' && (s.daysLeft ?? 99) > 14) console.log(msg);
  else console.warn(msg);
};

// ─── Plan enforcement ─────────────────────────────────────────────────

export const STAFF_ROLES = ['STAFF', 'ADMIN', 'SUPER_ADMIN'] as const;

/** Is this module part of the plan? (Unknown / owner / all-modules plans: yes.) */
export const moduleLicensed = (key: string, s: LicenseState = getLicense()) => s.modules === null || s.modules.includes(key);

export const activeStaffCount = () => prisma.user.count({ where: { role: { in: [...STAFF_ROLES] }, isActive: true } });

/** Throws 403 LICENSE_SEAT_LIMIT when one more active staff account would exceed the plan. */
export const assertStaffSeat = async (s: LicenseState = getLicense(), count: () => Promise<number> = activeStaffCount) => {
  if (s.staffLimit === null) return;
  const used = await count();
  if (used >= s.staffLimit) throw new HttpError(403, 'LICENSE_SEAT_LIMIT', `The plan allows ${s.staffLimit} active staff accounts`);
};

/** Status for the admin UI (banner, System → License). */
export const licenseSummary = (s: LicenseState = getLicense()) => ({
  role: s.role,
  status: s.status,
  mode: s.mode,
  reason: s.reason ?? null,
  domain: s.domain,
  customer: s.payload?.customer ?? null,
  licensedDomain: s.payload?.domain ?? null,
  plan: s.payload?.plan ?? null,
  licenseId: s.payload?.id ?? null,
  modules: s.modules,
  staffLimit: s.staffLimit,
  issuedAt: s.payload?.issuedAt ?? null,
  expiresAt: s.expiresAt ?? null,
  daysLeft: s.daysLeft ?? null,
  graceEndsAt: s.graceEndsAt ?? null,
  graceDays: GRACE_DAYS,
  checkedAt: s.checkedAt,
});
export type LicenseSummary = ReturnType<typeof licenseSummary>;
