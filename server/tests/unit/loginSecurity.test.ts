import { describe, expect, it } from 'vitest';
import {
  EMPTY_SNAPSHOT,
  contractAllows,
  contractCheckOn,
  hasSecondFactor,
  lifetimeFor,
  needsTwoFactorSetup,
  twoFactorRequiredFor,
  type PolicySnapshot,
  type RolePolicy,
  type UserOverride,
} from '../../src/lib/loginSecurity/policy.js';

const defaults = { webIdleMinutes: 30, webMaxHours: 12, mobileIdleDays: 30, mobileMaxDays: 90 };
const role = (p: Partial<RolePolicy>): RolePolicy => ({ require2fa: null, webIdleMinutes: null, webMaxHours: null, mobileIdleDays: null, mobileMaxDays: null, requireActiveContract: false, ...p });
const user = (p: Partial<UserOverride>): UserOverride => ({ require2fa: null, webIdleMinutes: null, webMaxHours: null, mobileIdleDays: null, mobileMaxDays: null, ...p });
const snap = (roles: PolicySnapshot['roles'], users: [string, UserOverride][] = []): PolicySnapshot => ({ roles, users: new Map(users) });

describe('2FA requirement', () => {
  it('defaults = today: staff required, partners / employers / clients not', () => {
    for (const r of ['STAFF', 'ADMIN', 'SUPER_ADMIN'] as const) expect(twoFactorRequiredFor(r, 'u', EMPTY_SNAPSHOT)).toBe(true);
    for (const r of ['AGENT', 'COMPANY', 'CLIENT'] as const) expect(twoFactorRequiredFor(r, 'u', EMPTY_SNAPSHOT)).toBe(false);
  });

  it('staff can never be relaxed (role or user), super admins included', () => {
    const s = snap({ SUPER_ADMIN: role({ require2fa: false }), STAFF: role({ require2fa: false }) }, [['sa', user({ require2fa: false })]]);
    expect(twoFactorRequiredFor('SUPER_ADMIN', 'sa', s)).toBe(true);
    expect(twoFactorRequiredFor('STAFF', 'x', s)).toBe(true);
  });

  it('role switch and user override for partners', () => {
    const s = snap({ AGENT: role({ require2fa: true }) }, [['exempt', user({ require2fa: false })], ['client', user({ require2fa: true })]]);
    expect(twoFactorRequiredFor('AGENT', 'p1', s)).toBe(true);
    expect(twoFactorRequiredFor('AGENT', 'exempt', s)).toBe(false);
    expect(twoFactorRequiredFor('CLIENT', 'client', s)).toBe(true);
    expect(twoFactorRequiredFor('COMPANY', 'x', s)).toBe(false);
  });

  it('guided set-up only for non-staff without a factor; the e-mail code counts for them, not for staff', () => {
    const s = snap({ AGENT: role({ require2fa: true }), STAFF: role({}) });
    const none = { totpEnabledAt: null, emailOtpEnabledAt: null };
    expect(needsTwoFactorSetup({ id: 'p', role: 'AGENT', ...none }, s)).toBe(true);
    expect(needsTwoFactorSetup({ id: 'p', role: 'AGENT', totpEnabledAt: null, emailOtpEnabledAt: new Date() }, s)).toBe(false);
    expect(needsTwoFactorSetup({ id: 'p', role: 'AGENT', ...none }, EMPTY_SNAPSHOT)).toBe(false);
    // Staff keep their own (unchanged) gate in middleware/auth.ts.
    expect(needsTwoFactorSetup({ id: 's', role: 'STAFF', ...none }, s)).toBe(false);
    expect(hasSecondFactor({ role: 'STAFF', totpEnabledAt: null, emailOtpEnabledAt: new Date() })).toBe(false);
  });
});

describe('session lifetime', () => {
  it('defaults = the server configuration', () => {
    expect(lifetimeFor('AGENT', 'u', 'web', EMPTY_SNAPSHOT, defaults)).toEqual({ idleMs: 30 * 60_000, maxMs: 12 * 3_600_000 });
    expect(lifetimeFor('CLIENT', 'u', 'mobile', EMPTY_SNAPSHOT, defaults)).toEqual({ idleMs: 30 * 86_400_000, maxMs: 90 * 86_400_000 });
  });
  it('user override → role → default, per field', () => {
    const s = snap({ AGENT: role({ webIdleMinutes: 10, webMaxHours: 4 }) }, [['u1', user({ webIdleMinutes: 5 })]]);
    expect(lifetimeFor('AGENT', 'u1', 'web', s, defaults)).toEqual({ idleMs: 5 * 60_000, maxMs: 4 * 3_600_000 });
    expect(lifetimeFor('AGENT', 'u2', 'web', s, defaults)).toEqual({ idleMs: 10 * 60_000, maxMs: 4 * 3_600_000 });
    expect(lifetimeFor('AGENT', 'u2', 'mobile', s, defaults)).toEqual({ idleMs: 30 * 86_400_000, maxMs: 90 * 86_400_000 });
  });
});

describe('contract-bound partner logins', () => {
  it('off by default, AGENT only', () => {
    expect(contractCheckOn('AGENT', EMPTY_SNAPSHOT)).toBe(false);
    expect(contractCheckOn('AGENT', snap({ AGENT: role({ requireActiveContract: true }) }))).toBe(true);
    expect(contractCheckOn('COMPANY', snap({ COMPANY: role({ requireActiveContract: true }) }))).toBe(false);
  });
  it('active partner, contract end day still counts', () => {
    const now = new Date('2026-11-17T15:00:00Z');
    expect(contractAllows({ active: true, contractEnd: null }, now)).toBe(true);
    expect(contractAllows({ active: false, contractEnd: null }, now)).toBe(false);
    expect(contractAllows({ active: true, contractEnd: new Date('2026-11-17T00:00:00Z') }, now)).toBe(true);
    expect(contractAllows({ active: true, contractEnd: new Date('2026-11-16T00:00:00Z') }, now)).toBe(false);
  });
});
