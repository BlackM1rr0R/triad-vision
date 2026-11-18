import type { Role } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import {
  EMPTY_SNAPSHOT,
  contractAllows,
  contractCheckOn,
  lifetimeFor,
  needsTwoFactorSetup,
  twoFactorRequiredFor,
  type PolicySnapshot,
  type RolePolicy,
  type UserOverride,
} from './policy.js';

export * from './policy.js';

/**
 * Login security settings from the database (LoginSecurityRole / LoginSecurityUser), cached in memory for a few
 * seconds (every authenticated request reads them) and dropped right away when the Access Center saves. A database
 * error keeps the last good snapshot — or the empty one, which is exactly today's behaviour.
 */

// Tests reset the database between cases: no caching there.
const TTL_MS = config.isTest ? 0 : 10_000;
let snapshot: PolicySnapshot = EMPTY_SNAPSHOT;
let loadedAt = 0;
let inFlight: Promise<PolicySnapshot> | null = null;

const load = async (): Promise<PolicySnapshot> => {
  const [roles, users] = await Promise.all([prisma.loginSecurityRole.findMany(), prisma.loginSecurityUser.findMany()]);
  const out: PolicySnapshot = { roles: {}, users: new Map() };
  for (const r of roles) {
    const p: RolePolicy = {
      require2fa: r.require2fa,
      webIdleMinutes: r.webIdleMinutes,
      webMaxHours: r.webMaxHours,
      mobileIdleDays: r.mobileIdleDays,
      mobileMaxDays: r.mobileMaxDays,
      requireActiveContract: r.requireActiveContract,
    };
    out.roles[r.role as Role] = p;
  }
  for (const u of users) {
    const o: UserOverride = { require2fa: u.require2fa, webIdleMinutes: u.webIdleMinutes, webMaxHours: u.webMaxHours, mobileIdleDays: u.mobileIdleDays, mobileMaxDays: u.mobileMaxDays };
    out.users.set(u.userId, o);
  }
  return out;
};

/** The current snapshot, refreshed when older than a few seconds. Never throws. */
export const loginPolicy = async (): Promise<PolicySnapshot> => {
  if (Date.now() - loadedAt < TTL_MS) return snapshot;
  if (!inFlight) {
    inFlight = load()
      .then((s) => {
        snapshot = s;
        loadedAt = Date.now();
        return s;
      })
      .catch((err) => {
        if (!config.isTest) console.error('[loginSecurity] settings could not be loaded; keeping the last ones', err);
        loadedAt = Date.now() - TTL_MS / 2; // retry soon
        return snapshot;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
};

/** The last loaded snapshot without waiting (for synchronous helpers such as the "who am I" flags). */
export const cachedLoginPolicy = () => snapshot;

/** Called after every change in the Access Center (and by tests). */
export const invalidateLoginPolicy = () => {
  loadedAt = 0;
};

export const configLifetimes = () => ({
  webIdleMinutes: config.session.webIdleMinutes,
  webMaxHours: config.session.webMaxHours,
  mobileIdleDays: config.session.mobileIdleDays,
  mobileMaxDays: config.session.mobileMaxDays,
});

export const sessionLifetimeFor = (role: Role, userId: string, client: 'web' | 'mobile', snap: PolicySnapshot = snapshot) =>
  lifetimeFor(role, userId, client, snap, configLifetimes());

export const twoFactorRequiredNow = (u: { id?: string; role: Role }) => twoFactorRequiredFor(u.role, u.id, snapshot);

export const twoFactorSetupNeededNow = (u: { id?: string; role: Role; totpEnabledAt: Date | null; emailOtpEnabledAt: Date | null }) =>
  !!u.id && needsTwoFactorSetup({ id: u.id, role: u.role, totpEnabledAt: u.totpEnabledAt, emailOtpEnabledAt: u.emailOtpEnabledAt }, snapshot);

/**
 * May this AGENT login sign in / keep its session (only when the contract check is switched on)? Logins that are
 * neither a partner's own login nor a team member (the agent programme) are not affected.
 */
export const partnerContractAllowsLogin = async (user: { id: string; role: Role }, snap?: PolicySnapshot): Promise<boolean> => {
  const s = snap ?? (await loginPolicy());
  if (!contractCheckOn(user.role, s)) return true;
  const own = await prisma.referralPartner.findUnique({ where: { userId: user.id }, select: { active: true, contractEnd: true } });
  if (own) return contractAllows(own);
  const member = await prisma.partnerMember.findUnique({ where: { userId: user.id }, select: { partnerId: true } });
  if (!member) return true;
  const partner = await prisma.referralPartner.findUnique({ where: { id: member.partnerId }, select: { active: true, contractEnd: true } });
  return partner ? contractAllows(partner) : false;
};

/** Web idle timeout in minutes when the settings differ from the server configuration (the browser mirrors it), else null. */
export const webIdleOverrideNow = (u: { id?: string; role: Role }) => {
  if (!u.id) return null;
  const minutes = Math.round(sessionLifetimeFor(u.role, u.id, 'web').idleMs / 60_000);
  return minutes !== config.session.webIdleMinutes ? minutes : null;
};

/** The effective web idle timeout in minutes for this account (settings or the server configuration; 0 = off). */
export const webIdleMinutesNow = (u: { id?: string; role: Role }) =>
  u.id ? Math.round(sessionLifetimeFor(u.role, u.id, 'web').idleMs / 60_000) : config.session.webIdleMinutes;
