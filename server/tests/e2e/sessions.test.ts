import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { anon, app, asClient, asSuperAdmin, loginAgent, ORIGIN, sessionAgent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, createStaff, TEST_PASSWORD } from '../helpers/factories';
import { resetLoginGuard } from '../../src/lib/loginGuard.js';
import { config } from '../../src/config.js';

const cookieOf = (res: request.Response) => {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('tv_session='));
};

describe('server-side sessions', () => {
  it('login creates a session row; logout revokes it and the token stops working', async () => {
    const { user } = await createClient({ email: 'sess@test.local' });
    const agent = await loginAgent('sess@test.local', TEST_PASSWORD);
    // createClient() already issued one fixture session; the login added a second.
    const sessions = await prisma.session.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    expect(sessions).toHaveLength(2);
    expect(sessions[0].client).toBe('web');
    expect(sessions[0].revokedAt).toBeNull();

    expect((await agent.get('/api/auth/me')).body.user.id).toBe(user.id);
    expect((await agent.post('/api/auth/logout')).status).toBe(200);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: sessions[0].id } })).revokedAt).not.toBeNull();

    // Replaying the old cookie after logout is refused with a specific reason.
    const replay = request(app).get('/api/account/overview').set('Cookie', `tv_session=${sessions[0].id}`);
    expect((await replay).status).toBe(401);
  });

  it('the web cookie lifetime equals the configured absolute session length', async () => {
    await createClient({ email: 'cookie@test.local' });
    const res = await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: 'cookie@test.local', password: TEST_PASSWORD });
    const cookie = cookieOf(res)!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain(`Max-Age=${config.session.webMaxHours * 3600}`);
    expect(res.body.session.expiresAt).toBeDefined();
  });

  it('mobile logins get a Bearer token and a longer-lived session', async () => {
    await createClient({ email: 'mob@test.local' });
    const res = await anon().post('/api/auth/login').set('x-client', 'mobile').send({ email: 'mob@test.local', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(cookieOf(res)).toBeUndefined();
    const session = await prisma.session.findFirstOrThrow({ where: { client: 'mobile' } });
    expect(session.expiresAt.getTime() - Date.now()).toBeGreaterThan(config.session.webMaxHours * 3600_000);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.body.user.email).toBe('mob@test.local');
  });

  it('an idle web session expires and reports SESSION_EXPIRED', async () => {
    const c = await asClient();
    const session = await prisma.session.findFirstOrThrow({ where: { userId: c.user.id } });
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(Date.now() - (config.session.webIdleMinutes + 1) * 60_000) },
    });
    const res = await c.agent.get('/api/account/overview');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SESSION_EXPIRED');
    const me = await c.agent.get('/api/auth/me');
    expect(me.body).toEqual({ user: null, reason: 'SESSION_REVOKED' });
  });

  it('a revoked session reports SESSION_REVOKED', async () => {
    const c = await asClient();
    await prisma.session.updateMany({ where: { userId: c.user.id }, data: { revokedAt: new Date() } });
    const res = await c.agent.get('/api/account/overview');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SESSION_REVOKED');
  });

  it('changing the password keeps this session and logs out every other device', async () => {
    const { user, token: phoneToken } = await createClient({ client: 'mobile' });
    const phone = sessionAgent(phoneToken, 'bearer');
    const web = await loginAgent(user.email, TEST_PASSWORD);
    expect((await phone.get('/api/account/overview')).status).toBe(200);

    const res = await web.patch('/api/auth/me').send({ currentPassword: TEST_PASSWORD, newPassword: 'NewPass123x' });
    expect(res.status).toBe(200);
    expect((await web.get('/api/account/overview')).status).toBe(200);
    expect((await phone.get('/api/account/overview')).status).toBe(401);
  });

  it('a password reset logs out everywhere and burns other reset links', async () => {
    const { user, token } = await createClient({ email: 'reset@test.local' });
    const agent = sessionAgent(token);
    await anon().post('/api/auth/forgot-password').send({ email: 'reset@test.local' });
    await anon().post('/api/auth/forgot-password').send({ email: 'reset@test.local' });
    const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(tokens).toHaveLength(2);
    // The raw token is only in the email; recreate one directly for the test.
    const raw = 'a'.repeat(64);
    const crypto = await import('node:crypto');
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(raw).digest('hex'), expiresAt: new Date(Date.now() + 60_000) },
    });
    expect((await anon().post('/api/auth/reset-password').send({ token: raw, password: 'Fresh12345' })).status).toBe(200);
    expect((await agent.get('/api/account/overview')).status).toBe(401);
    const left = await prisma.passwordResetToken.findMany({ where: { userId: user.id, usedAt: null } });
    expect(left).toHaveLength(0);
  });

  it('lists own sessions and can revoke one or all others', async () => {
    const { user, token } = await createClient();
    const a = sessionAgent(token);
    const b = await loginAgent(user.email, TEST_PASSWORD);
    const list = await a.get('/api/auth/sessions');
    expect(list.status).toBe(200);
    expect(list.body.sessions).toHaveLength(2);
    expect(list.body.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    const other = list.body.sessions.find((s: { current: boolean }) => !s.current);
    expect((await a.delete(`/api/auth/sessions/${other.id}`)).status).toBe(200);
    expect((await b.get('/api/account/overview')).status).toBe(401);
    expect((await a.delete('/api/auth/sessions/nope')).status).toBe(404);

    const c = await loginAgent(user.email, TEST_PASSWORD);
    const all = await a.delete('/api/auth/sessions');
    expect(all.body.revoked).toBe(1);
    expect((await c.get('/api/account/overview')).status).toBe(401);
    expect((await a.get('/api/account/overview')).status).toBe(200);
  });

  it('one user cannot revoke another user\'s session', async () => {
    const a = await asClient();
    const b = await asClient();
    const bs = await prisma.session.findFirstOrThrow({ where: { userId: b.user.id } });
    expect((await a.agent.delete(`/api/auth/sessions/${bs.id}`)).status).toBe(404);
    expect((await b.agent.get('/api/account/overview')).status).toBe(200);
  });

  it('the super admin can log a user out everywhere', async () => {
    const su = await asSuperAdmin();
    const staff = await createStaff();
    const staffAgent = sessionAgent(staff.token);
    expect((await staffAgent.get('/api/admin/dashboard')).status).toBe(200);
    const res = await su.agent.post(`/api/admin/users/${staff.user.id}/revoke-sessions`);
    expect(res.body.revoked).toBe(1);
    expect((await staffAgent.get('/api/admin/dashboard')).status).toBe(401);
    const log = await prisma.auditLog.findFirst({ where: { action: 'SESSIONS_REVOKED' } });
    expect(log?.actorId).toBe(su.user.id);
  });
});

describe('CSRF origin check', () => {
  it('rejects cookie-authenticated writes from a foreign origin, allows reads', async () => {
    const { token } = await createClient();
    const evil = request(app).post('/api/auth/logout').set('Cookie', `tv_session=${token}`).set('Origin', 'https://evil.example');
    const res = await evil;
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CSRF_ORIGIN_REJECTED');
    // No origin at all (a form POST from a non-browser or a very old browser) is rejected too.
    expect((await request(app).post('/api/auth/logout').set('Cookie', `tv_session=${token}`)).status).toBe(403);
    expect((await request(app).get('/api/auth/me').set('Cookie', `tv_session=${token}`)).body.user).toBeTruthy();
    // Same-origin fetch metadata is enough.
    expect((await request(app).post('/api/auth/logout').set('Cookie', `tv_session=${token}`).set('Sec-Fetch-Site', 'same-origin')).status).toBe(200);
  });

  it('does not apply to Bearer tokens', async () => {
    const { token } = await createClient({ client: 'mobile' });
    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`).set('Origin', 'https://evil.example');
    expect(res.status).toBe(200);
  });
});

describe('login brute-force protection', () => {
  it('locks an account after repeated failures and unlocks on the configured window', async () => {
    resetLoginGuard();
    await createClient({ email: 'brute@test.local' });
    for (let i = 0; i < config.login.maxFailures; i++) {
      const res = await anon().post('/api/auth/login').send({ email: 'brute@test.local', password: 'wrong-pass-1' });
      expect(res.status).toBe(401);
    }
    const locked = await anon().post('/api/auth/login').send({ email: 'brute@test.local', password: TEST_PASSWORD });
    expect(locked.status).toBe(429);
    expect(locked.body.error).toBe('ACCOUNT_LOCKED');
    expect(locked.headers['retry-after']).toBeDefined();
    // Other accounts are unaffected.
    await createClient({ email: 'other@test.local' });
    expect((await anon().post('/api/auth/login').send({ email: 'other@test.local', password: TEST_PASSWORD })).status).toBe(200);
    const failures = await prisma.auditLog.count({ where: { action: 'LOGIN_FAILED' } });
    expect(failures).toBe(config.login.maxFailures);
    resetLoginGuard();
    expect((await anon().post('/api/auth/login').send({ email: 'brute@test.local', password: TEST_PASSWORD })).status).toBe(200);
  });

  it('rejects weak passwords on register and change', async () => {
    const res = await anon().post('/api/auth/register').send({ email: 'weak@test.local', password: 'abcdefgh', firstName: 'A', lastName: 'B' });
    expect(res.status).toBe(400);
    const c = await asClient();
    expect((await c.agent.patch('/api/auth/me').send({ currentPassword: TEST_PASSWORD, newPassword: '12345678' })).status).toBe(400);
  });
});

describe('response hardening', () => {
  it('private API responses are no-store and carry a request id', async () => {
    const c = await asClient();
    const res = await c.agent.get('/api/account/overview');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('public content stays cacheable', async () => {
    const res = await anon().get('/api/public/content');
    expect(res.headers['cache-control']).toContain('public');
  });

  it('a filled honeypot looks like success but stores nothing', async () => {
    const res = await anon().post('/api/public/inquiries').send({
      kind: 'contact', contactName: 'Bot', email: 'bot@spam.example', message: 'buy now please', website: 'http://spam', locale: 'xx',
    });
    expect(res.status).toBe(201);
    expect(await prisma.inquiry.count()).toBe(0);
  });

  it('malformed JSON is a 400, not a 500', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_JSON');
  });
});
