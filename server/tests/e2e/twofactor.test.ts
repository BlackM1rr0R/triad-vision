import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asClient, asStaff, asSuperAdmin, ORIGIN, sessionAgent, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createUser, TEST_PASSWORD } from '../helpers/factories';
import { generateTotp } from '../../src/lib/totp.js';
import { forgetUsedCodes, resetTwoFactorState } from '../../src/lib/twoFactor.js';
import { resetLoginGuard } from '../../src/lib/loginGuard.js';

beforeEach(() => {
  resetTwoFactorState();
  resetLoginGuard();
});

/** Current code; forgets earlier accepted steps so a test can use "now" more than once. */
const code = (secret: string) => {
  forgetUsedCodes();
  return generateTotp(secret);
};

const enroll = async (agent: Agent) => {
  const setup = await agent.post('/api/auth/2fa/setup');
  expect(setup.status).toBe(200);
  const { secret } = setup.body as { secret: string };
  const enable = await agent.post('/api/auth/2fa/enable').send({ code: code(secret) });
  expect(enable.status).toBe(200);
  return { secret, recoveryCodes: enable.body.recoveryCodes as string[] };
};

/** A staff member as created by an admin: no 2FA yet. */
const newStaff = async (role: 'STAFF' | 'ADMIN' = 'STAFF') => {
  const u = await createUser({ role, twoFactor: false });
  return { ...u, agent: sessionAgent(u.token) };
};

const login = (email: string, password = TEST_PASSWORD, mobile = false) => {
  const req = anon().post('/api/auth/login').set('Origin', ORIGIN);
  if (mobile) req.set('x-client', 'mobile');
  return req.send({ email, password });
};

describe('2FA enrollment', () => {
  it('setup returns a secret + otpauth URI and stores the secret encrypted', async () => {
    const { agent, user } = await asClient();
    const res = await agent.post('/api/auth/2fa/setup');
    expect(res.status).toBe(200);
    expect(res.body.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(res.body.otpauthUri).toContain(`secret=${res.body.secret}`);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.totpSecret).toMatch(/^v1:/);
    expect(row.totpSecret).not.toContain(res.body.secret);
    expect(row.totpEnabledAt).toBeNull();
    expect((await agent.get('/api/auth/2fa/status')).body).toMatchObject({ enabled: false, pending: true, required: false });
  });

  it('enable needs a valid code, returns 10 recovery codes once and stores only hashes', async () => {
    const { agent, user } = await asClient();
    expect((await agent.post('/api/auth/2fa/enable').send({ code: '123456' })).body.error).toBe('TWO_FACTOR_SETUP_REQUIRED');
    const { secret } = (await agent.post('/api/auth/2fa/setup')).body;
    expect((await agent.post('/api/auth/2fa/enable').send({ code: 'abc' })).status).toBe(400);
    const wrong = generateTotp(secret, Date.now() + 10 * 60_000);
    expect((await agent.post('/api/auth/2fa/enable').send({ code: wrong })).body.error).toBe('INVALID_CODE');

    const res = await agent.post('/api/auth/2fa/enable').send({ code: code(secret) });
    expect(res.status).toBe(200);
    expect(res.body.recoveryCodes).toHaveLength(10);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.totpEnabledAt).not.toBeNull();
    const stored = row.recoveryCodes as string[];
    expect(stored).toHaveLength(10);
    for (const h of stored) expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(res.body.recoveryCodes[0]);

    expect((await agent.post('/api/auth/2fa/setup')).body.error).toBe('TWO_FACTOR_ALREADY_ENABLED');
    expect((await agent.post('/api/auth/2fa/enable').send({ code: code(secret) })).body.error).toBe('TWO_FACTOR_ALREADY_ENABLED');
    const me = (await agent.get('/api/auth/me')).body.user;
    expect(me).toMatchObject({ twoFactorEnabled: true, twoFactorRequired: false, emailVerified: true });
    expect(await prisma.auditLog.count({ where: { action: 'TWO_FACTOR_ENABLED', target: `user:${user.id}` } })).toBe(1);
  });

  it('a code cannot be used twice (replay protection)', async () => {
    const { agent } = await asClient();
    const { secret } = (await agent.post('/api/auth/2fa/setup')).body;
    const c = code(secret);
    expect((await agent.post('/api/auth/2fa/enable').send({ code: c })).status).toBe(200);
    expect((await agent.post('/api/auth/2fa/recovery-codes').send({ code: c })).body.error).toBe('INVALID_CODE');
  });

  it('requires authentication', async () => {
    for (const url of ['/api/auth/2fa/setup', '/api/auth/2fa/enable', '/api/auth/2fa/disable', '/api/auth/2fa/recovery-codes']) {
      expect((await anon().post(url).send({})).status, url).toBe(401);
    }
    expect((await anon().get('/api/auth/2fa/status')).status).toBe(401);
  });
});

describe('mandatory 2FA for staff', () => {
  it('blocks /api/admin and /api/drive until the staff member enrolls', async () => {
    const staff = await newStaff();
    const me = (await staff.agent.get('/api/auth/me')).body.user;
    expect(me).toMatchObject({ twoFactorEnabled: false, twoFactorRequired: true });
    for (const url of ['/api/admin/dashboard', '/api/admin/cases', '/api/drive/roots']) {
      const res = await staff.agent.get(url);
      expect(res.status, url).toBe(403);
      expect(res.body.error).toBe('TWO_FACTOR_ENROLLMENT_REQUIRED');
    }
    // Enrollment itself and the account basics stay reachable.
    expect((await staff.agent.get('/api/auth/2fa/status')).body).toMatchObject({ required: true, enabled: false });
    await enroll(staff.agent);
    expect((await staff.agent.get('/api/admin/dashboard')).status).toBe(200);
  });

  it('clients are never gated and 2FA is optional for them', async () => {
    const { agent } = await asClient();
    expect((await agent.get('/api/auth/me')).body.user).toMatchObject({ twoFactorEnabled: false, twoFactorRequired: false });
    expect((await agent.get('/api/admin/dashboard')).body.error).toBe('FORBIDDEN');
  });

  it('a staff member can log in with password only while not enrolled (to reach the wizard)', async () => {
    const staff = await newStaff('ADMIN');
    const res = await login(staff.user.email);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ twoFactorRequired: true, twoFactorEnabled: false });
  });
});

describe('login with 2FA', () => {
  const enrolledClient = async () => {
    const c = await asClient();
    const { secret, recoveryCodes } = await enroll(c.agent);
    return { ...c, secret, recoveryCodes };
  };

  it('password step returns a challenge instead of a session; verify completes the login', async () => {
    const c = await enrolledClient();
    const sessionsBefore = await prisma.session.count({ where: { userId: c.user.id } });
    const step1 = await login(c.user.email);
    expect(step1.status).toBe(200);
    expect(step1.body).toEqual({ twoFactorRequired: true, challenge: expect.any(String), method: 'totp', alternatives: ['recovery'] });
    expect(step1.headers['set-cookie']).toBeUndefined();
    expect(await prisma.session.count({ where: { userId: c.user.id } })).toBe(sessionsBefore);

    // The challenge is not a session token.
    expect((await anon().get('/api/auth/me').set('Authorization', `Bearer ${step1.body.challenge}`)).body.user).toBeNull();

    const step2 = await anon().post('/api/auth/2fa/verify').set('Origin', ORIGIN).send({ challenge: step1.body.challenge, code: code(c.secret) });
    expect(step2.status).toBe(200);
    expect(step2.body.user.email).toBe(c.user.email);
    expect(step2.body.session.id).toBeTruthy();
    expect(String(step2.headers['set-cookie'])).toContain('tv_session=');
    expect(step2.body.token).toBeUndefined();

    // Single use.
    const again = await anon().post('/api/auth/2fa/verify').send({ challenge: step1.body.challenge, code: code(c.secret) });
    expect(again.status).toBe(401);
    expect(again.body.error).toBe('TWO_FACTOR_CHALLENGE_INVALID');
  });

  it('mobile clients get the bearer token from the verify step', async () => {
    const c = await enrolledClient();
    const step1 = await login(c.user.email, TEST_PASSWORD, true);
    expect(step1.body.twoFactorRequired).toBe(true);
    expect(step1.body.token).toBeUndefined();
    const step2 = await anon().post('/api/auth/2fa/verify').set('x-client', 'mobile').send({ challenge: step1.body.challenge, code: code(c.secret) });
    expect(step2.status).toBe(200);
    expect(step2.body.token).toBeTruthy();
    expect(step2.headers['set-cookie']).toBeUndefined();
    const me = await anon().get('/api/auth/me').set('Authorization', `Bearer ${step2.body.token}`);
    expect(me.body.user.id).toBe(c.user.id);
  });

  it('a recovery code works exactly once', async () => {
    const c = await enrolledClient();
    const rc = c.recoveryCodes[3]!;
    const ch1 = (await login(c.user.email)).body.challenge;
    const ok = await anon().post('/api/auth/2fa/verify').send({ challenge: ch1, recoveryCode: rc.toUpperCase() });
    expect(ok.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: c.user.id } })).recoveryCodes).toHaveLength(9);
    expect(await prisma.auditLog.count({ where: { action: 'LOGIN_2FA_RECOVERY_CODE_USED' } })).toBe(1);

    const ch2 = (await login(c.user.email)).body.challenge;
    const reuse = await anon().post('/api/auth/2fa/verify').send({ challenge: ch2, recoveryCode: rc });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error).toBe('INVALID_CODE');
  });

  it('rejects malformed verify bodies and forged / expired challenges', async () => {
    const c = await enrolledClient();
    const ch = (await login(c.user.email)).body.challenge;
    expect((await anon().post('/api/auth/2fa/verify').send({ challenge: ch })).status).toBe(400);
    expect((await anon().post('/api/auth/2fa/verify').send({ challenge: ch, code: '123456', recoveryCode: 'abcde-fghij' })).status).toBe(400);
    const forged = await anon().post('/api/auth/2fa/verify').send({ challenge: `${ch.slice(0, -4)}AAAA`, code: code(c.secret) });
    expect(forged.body.error).toBe('TWO_FACTOR_CHALLENGE_INVALID');
    // A regular session token is not a challenge.
    const asSession = await anon().post('/api/auth/2fa/verify').send({ challenge: c.token, code: code(c.secret) });
    expect(asSession.body.error).toBe('TWO_FACTOR_CHALLENGE_INVALID');
  });

  it('a challenge dies after 5 wrong codes, and the account locks after repeated failures', async () => {
    const c = await enrolledClient();
    const wrong = generateTotp(c.secret, Date.now() + 10 * 60_000);
    const ch = (await login(c.user.email)).body.challenge;
    for (let i = 0; i < 4; i++) {
      const r = await anon().post('/api/auth/2fa/verify').send({ challenge: ch, code: wrong });
      expect(r.status).toBe(401);
      expect(r.body).toMatchObject({ error: 'INVALID_CODE', attemptsLeft: 4 - i });
    }
    // 5th failure locks the account (LOGIN_MAX_FAILURES = 5) …
    expect((await anon().post('/api/auth/2fa/verify').send({ challenge: ch, code: wrong })).status).toBe(401);
    // … so even the right code is refused now, on any challenge.
    const locked = await anon().post('/api/auth/2fa/verify').send({ challenge: ch, code: code(c.secret) });
    expect(locked.status).toBe(401);
    expect(locked.body.error).toBe('TWO_FACTOR_CHALLENGE_INVALID');
    const pwd = await login(c.user.email);
    expect(pwd.status).toBe(429);
    expect(pwd.body.error).toBe('ACCOUNT_LOCKED');
    expect(await prisma.auditLog.count({ where: { action: 'LOGIN_2FA_FAILED', target: `user:${c.user.id}` } })).toBe(5);
  });

  it('a wrong password never reveals whether 2FA is on', async () => {
    const c = await enrolledClient();
    const res = await login(c.user.email, 'Wrong-password-1');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
    expect(res.body.challenge).toBeUndefined();
  });
});

describe('managing 2FA', () => {
  it('regenerates recovery codes (old ones stop working)', async () => {
    const { agent, user } = await asClient();
    const { secret, recoveryCodes } = await enroll(agent);
    expect((await agent.post('/api/auth/2fa/recovery-codes').send({ code: '000000' })).status).toBe(400);
    const res = await agent.post('/api/auth/2fa/recovery-codes').send({ code: code(secret) });
    expect(res.status).toBe(200);
    expect(res.body.recoveryCodes).toHaveLength(10);
    const ch = (await login(user.email)).body.challenge;
    expect((await anon().post('/api/auth/2fa/verify').send({ challenge: ch, recoveryCode: recoveryCodes[0] })).status).toBe(401);
    expect((await anon().post('/api/auth/2fa/verify').send({ challenge: ch, recoveryCode: res.body.recoveryCodes[0] })).status).toBe(200);
  });

  it('disable needs the password and a code (TOTP or recovery code)', async () => {
    const { agent, user } = await asClient();
    const { secret, recoveryCodes } = await enroll(agent);
    expect((await agent.post('/api/auth/2fa/disable').send({ password: 'nope-nope-1', code: code(secret) })).body.error).toBe('WRONG_PASSWORD');
    expect((await agent.post('/api/auth/2fa/disable').send({ password: TEST_PASSWORD, code: '000000' })).body.error).toBe('INVALID_CODE');
    const res = await agent.post('/api/auth/2fa/disable').send({ password: TEST_PASSWORD, code: recoveryCodes[1] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, enrollmentRequired: false });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.totpEnabledAt).toBeNull();
    expect(row.totpSecret).toBeNull();
    expect((await login(user.email)).body.user.id).toBe(user.id);
    expect((await agent.post('/api/auth/2fa/disable').send({ password: TEST_PASSWORD, code: '123456' })).body.error).toBe('TWO_FACTOR_NOT_ENABLED');
  });

  it('a staff member who disables 2FA is gated again until re-enrollment', async () => {
    const staff = await newStaff();
    const { secret } = await enroll(staff.agent);
    expect((await staff.agent.get('/api/admin/cases')).status).toBe(200);
    const res = await staff.agent.post('/api/auth/2fa/disable').send({ password: TEST_PASSWORD, code: code(secret) });
    expect(res.body.enrollmentRequired).toBe(true);
    expect((await staff.agent.get('/api/admin/cases')).body.error).toBe('TWO_FACTOR_ENROLLMENT_REQUIRED');
  });
});

describe('POST /api/auth/2fa/users/:id/reset', () => {
  it('only the super admin may reset, never for themselves; sessions are revoked and audited', async () => {
    const target = await newStaff();
    await enroll(target.agent);
    const admin = await asStaff({ role: 'ADMIN' });
    expect((await admin.agent.post(`/api/auth/2fa/users/${target.user.id}/reset`)).status).toBe(403);
    expect((await anon().post(`/api/auth/2fa/users/${target.user.id}/reset`)).status).toBe(401);

    const sa = await asSuperAdmin();
    expect((await sa.agent.post(`/api/auth/2fa/users/${sa.user.id}/reset`)).body.error).toBe('CANNOT_RESET_SELF');
    expect((await sa.agent.post('/api/auth/2fa/users/nope/reset')).status).toBe(404);
    const res = await sa.agent.post(`/api/auth/2fa/users/${target.user.id}/reset`);
    expect(res.status).toBe(200);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } });
    expect(row.totpEnabledAt).toBeNull();
    expect(row.totpSecret).toBeNull();
    expect((await target.agent.get('/api/auth/me')).body.user).toBeNull();
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'TWO_FACTOR_RESET' } });
    expect(log).toMatchObject({ actorId: sa.user.id, target: `user:${target.user.id}` });
  });

  it('a super admin without 2FA cannot use it either', async () => {
    const sa = await createUser({ role: 'SUPER_ADMIN', twoFactor: false });
    const target = await newStaff();
    const res = await sessionAgent(sa.token).post(`/api/auth/2fa/users/${target.user.id}/reset`);
    expect(res.body.error).toBe('TWO_FACTOR_ENROLLMENT_REQUIRED');
  });
});

describe('GET /api/auth/2fa/staff', () => {
  it('lists staff with their 2FA state for the super admin only', async () => {
    const sa = await asSuperAdmin();
    const pending = await newStaff();
    await asClient();
    const res = await sa.agent.get('/api/auth/2fa/staff');
    expect(res.status).toBe(200);
    const rows = res.body.staff as { id: string; twoFactorEnabled: boolean; role: string }[];
    expect(rows.map((r) => r.role)).not.toContain('CLIENT');
    expect(rows.find((r) => r.id === pending.user.id)?.twoFactorEnabled).toBe(false);
    expect(rows.find((r) => r.id === sa.user.id)?.twoFactorEnabled).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('totpSecret');
    const admin = await asStaff();
    expect((await admin.agent.get('/api/auth/2fa/staff')).status).toBe(403);
  });
});
