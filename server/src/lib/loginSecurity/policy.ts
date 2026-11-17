import type { Role } from '@prisma/client';

/**
 * Login security rules (Access Center → Login security) — pure logic, no database.
 *
 *  - Two-factor authentication: staff roles (STAFF / ADMIN / SUPER_ADMIN) always need TOTP, exactly as before —
 *    this can never be switched off (not per role, not per user). For AGENT / COMPANY / CLIENT a super admin may
 *    require it per role and override it per user; nothing is required by default. A user who must but has no
 *    second factor yet is NOT locked out: after login they are guided through the set-up (the portal API answers
 *    403 TWO_FACTOR_ENROLLMENT_REQUIRED until then). For these roles the e-mail code (lib/emailOtp.ts) or an
 *    authenticator app both count.
 *  - Session lifetime: idle timeout and maximum age per role and per user, separately for web and the mobile app;
 *    empty = the server configuration (today's values).
 *  - Partner contract: AGENT logins linked to a referral partner (owner or team member) may log in only while the
 *    partner is active and its contract end date (ReferralPartner.contractEnd) has not passed — only when switched on.
 */

export const LOGIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'STAFF', 'AGENT', 'COMPANY', 'CLIENT'] as const satisfies readonly Role[];
export const STAFF_ROLES: readonly Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];
export const isStaffRole = (role: Role) => STAFF_ROLES.includes(role);

export interface LifetimeFields {
  webIdleMinutes: number | null;
  webMaxHours: number | null;
  mobileIdleDays: number | null;
  mobileMaxDays: number | null;
}

export interface RolePolicy extends LifetimeFields {
  /** null = today's rule (staff required, others not). Ignored (always true) for staff roles. */
  require2fa: boolean | null;
  /** AGENT only. */
  requireActiveContract: boolean;
}

export interface UserOverride extends LifetimeFields {
  /** null = the role's rule; false is never honoured for staff roles. */
  require2fa: boolean | null;
}

export interface PolicySnapshot {
  roles: Partial<Record<Role, RolePolicy>>;
  users: Map<string, UserOverride>;
}

export const EMPTY_SNAPSHOT: PolicySnapshot = { roles: {}, users: new Map() };

/** Bounds of the editable values (a super admin can never set a lifetime that makes logging in impossible). */
export const LIMITS = {
  webIdleMinutes: { min: 5, max: 7 * 24 * 60 },
  webMaxHours: { min: 1, max: 90 * 24 },
  mobileIdleDays: { min: 1, max: 365 },
  mobileMaxDays: { min: 1, max: 365 },
} as const;

export interface ConfigLifetimes {
  webIdleMinutes: number;
  webMaxHours: number;
  mobileIdleDays: number;
  mobileMaxDays: number;
}

/** Must this user use a second factor? */
export const twoFactorRequiredFor = (role: Role, userId: string | null | undefined, snap: PolicySnapshot): boolean => {
  if (isStaffRole(role)) return true; // today's rule, locked
  const user = userId ? snap.users.get(userId) : undefined;
  if (user && user.require2fa !== null) return user.require2fa;
  const r = snap.roles[role];
  return r?.require2fa ?? false;
};

/** For AGENT / COMPANY / CLIENT both factors count; staff need TOTP (unchanged). */
export const hasSecondFactor = (u: { role: Role; totpEnabledAt: Date | null; emailOtpEnabledAt: Date | null }) =>
  !!u.totpEnabledAt || (!isStaffRole(u.role) && !!u.emailOtpEnabledAt);

/**
 * Non-staff user who must use 2FA but has not set it up: guided to the set-up, the rest of the API waits.
 * (Staff keep their own gate in middleware/auth.ts, unchanged.)
 */
export const needsTwoFactorSetup = (u: { id: string; role: Role; totpEnabledAt: Date | null; emailOtpEnabledAt: Date | null }, snap: PolicySnapshot) =>
  !isStaffRole(u.role) && twoFactorRequiredFor(u.role, u.id, snap) && !hasSecondFactor(u);

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Idle timeout and maximum age (ms) of a session: user override → role → server configuration. */
export const lifetimeFor = (
  role: Role,
  userId: string | null | undefined,
  client: 'web' | 'mobile',
  snap: PolicySnapshot,
  defaults: ConfigLifetimes,
): { idleMs: number; maxMs: number } => {
  const user = userId ? snap.users.get(userId) : undefined;
  const r = snap.roles[role];
  const pick = <K extends keyof LifetimeFields>(k: K): number | null => user?.[k] ?? r?.[k] ?? null;
  if (client === 'mobile') {
    return { idleMs: (pick('mobileIdleDays') ?? defaults.mobileIdleDays) * DAY, maxMs: (pick('mobileMaxDays') ?? defaults.mobileMaxDays) * DAY };
  }
  return { idleMs: (pick('webIdleMinutes') ?? defaults.webIdleMinutes) * MIN, maxMs: (pick('webMaxHours') ?? defaults.webMaxHours) * HOUR };
};

/** Is the contract check switched on for this role? */
export const contractCheckOn = (role: Role, snap: PolicySnapshot) => role === 'AGENT' && !!snap.roles.AGENT?.requireActiveContract;

/** A partner may be used for logging in: active, and the contract end date (a calendar day) not yet passed. */
export const contractAllows = (partner: { active: boolean; contractEnd: Date | null }, now = new Date()) => {
  if (!partner.active) return false;
  if (!partner.contractEnd) return true;
  // contractEnd is a DATE: the whole day still counts.
  return partner.contractEnd.getTime() + DAY > now.getTime();
};
