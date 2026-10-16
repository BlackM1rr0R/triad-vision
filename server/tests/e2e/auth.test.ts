import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { anon, app, loginAgent, sessionAgent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, TEST_PASSWORD } from '../helpers/factories';

// Note: /register, /login, /forgot-password and /reset-password share a limiter of 30 requests
// per 15 minutes per IP. Each test file gets a fresh app, so keep this file well below that.

/** Fields every candidate sign-up must send besides name, email and password. */
const REQUIRED = { phone: '+994501234567', birthDate: '1990-05-14' };

const sessionCookie = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('tv_session='));

describe('health and fallbacks', () => {
  it('GET /api/health', async () => {
    const res = await anon().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('unknown API routes return JSON 404', async () => {
    const res = await anon().get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NOT_FOUND' });
  });

  it('sets security headers and hides x-powered-by', async () => {
    const res = await anon().get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('POST /api/auth/register', () => {
  it('creates a client, sets an httpOnly session cookie and returns no token for the web', async () => {
    const res = await anon()
      .post('/api/auth/register')
      .send({ email: '  Ali.Mammadov@Example.COM ', password: 'Password123', firstName: ' Əli ', lastName: 'Məmmədov', phone: '+994 50 123-45-67', birthDate: '1990-05-14' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeUndefined();
    expect(res.body.user).toEqual({
      id: expect.any(String),
      email: 'ali.mammadov@example.com',
      role: 'CLIENT',
      firstName: 'Əli',
      lastName: 'Məmmədov',
      phone: '+994501234567',
      locale: 'az',
      // phone is normalised; the rest of the candidate profile starts empty; notification preferences default to on
      birthDate: '1990-05-14',
      nationality: null,
      city: null,
      address: null,
      profession: null,
      experienceYears: null,
      germanLevel: null,
      education: null,
      drivingLicence: null,
      about: null,
      emailNotifications: true,
      pushNotifications: true,
      whatsappOptIn: true,
      smsNotifications: true,
      createdAt: expect.any(String),
      // new accounts must confirm their email; 2FA is optional for candidates
      emailVerified: false,
      twoFactorEnabled: false,
      twoFactorRequired: false,
      emailOtpEnabled: false,
    });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const db = await prisma.user.findUniqueOrThrow({ where: { email: 'ali.mammadov@example.com' } });
    expect(db.passwordHash).not.toContain('Password123');
    expect(db.role).toBe('CLIENT');

    const me = await anon().get('/api/auth/me').set('Cookie', cookie!.split(';')[0]);
    expect(me.body.user.email).toBe('ali.mammadov@example.com');
  });

  it('cannot be used to self-assign a role', async () => {
    const res = await anon()
      .post('/api/auth/register')
      .send({ email: 'sneaky@test.local', password: 'Password123', firstName: 'S', lastName: 'N', role: 'ADMIN', locale: 'de', ...REQUIRED });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('CLIENT');
    expect(res.body.user.locale).toBe('de');
  });

  it.each([
    ['short password', { email: 'a@test.local', password: 'short', firstName: 'A', lastName: 'B', ...REQUIRED }],
    ['invalid email', { email: 'not-an-email', password: 'Password123', firstName: 'A', lastName: 'B', ...REQUIRED }],
    ['missing first name', { email: 'b@test.local', password: 'Password123', firstName: '  ', lastName: 'B', ...REQUIRED }],
    ['unknown locale', { email: 'c@test.local', password: 'Password123', firstName: 'A', lastName: 'B', locale: 'fr', ...REQUIRED }],
  ])('rejects %s with 400 VALIDATION', async (_label, body) => {
    const res = await anon().post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
    expect(await prisma.user.count()).toBe(0);
  });

  it('rejects an existing email (case-insensitive) with 409 EMAIL_TAKEN', async () => {
    await createClient({ email: 'taken@test.local' });
    const res = await anon()
      .post('/api/auth/register')
      .send({ email: 'TAKEN@test.local', password: 'Password123', firstName: 'A', lastName: 'B', ...REQUIRED });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EMAIL_TAKEN');
  });

  it('returns a Bearer token for the mobile app (x-client: mobile)', async () => {
    const res = await anon()
      .post('/api/auth/register')
      .set('x-client', 'mobile')
      .send({ email: 'mobile@test.local', password: 'Password123', firstName: 'M', lastName: 'B', ...REQUIRED });
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    const me = await anon().get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.body.user.email).toBe('mobile@test.local');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in case-insensitively and sets the cookie (no token for the web)', async () => {
    const { user } = await createClient({ email: 'login@test.local', locale: 'ru' });
    const res = await anon().post('/api/auth/login').send({ email: ' LOGIN@test.local ', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, email: 'login@test.local', role: 'CLIENT', locale: 'ru' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.token).toBeUndefined();
    expect(sessionCookie(res)).toBeDefined();
  });

  it.each([
    ['wrong password', 'login@test.local', 'WrongPassword1'],
    ['unknown email', 'nobody@test.local', TEST_PASSWORD],
  ])('rejects %s with 401 INVALID_CREDENTIALS', async (_label, email, password) => {
    await createClient({ email: 'login@test.local' });
    const res = await anon().post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('rejects a deactivated user', async () => {
    await createClient({ email: 'off@test.local', isActive: false });
    const res = await anon().post('/api/auth/login').send({ email: 'off@test.local', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('mobile flow: token in body, then Bearer auth on protected routes', async () => {
    await createClient({ email: 'phone@test.local' });
    const res = await anon()
      .post('/api/auth/login')
      .set('x-client', 'mobile')
      .send({ email: 'phone@test.local', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    const bearer = sessionAgent(res.body.token, 'bearer');
    expect((await bearer.get('/api/cases')).status).toBe(200);
    expect((await bearer.get('/api/notifications')).status).toBe(200);
    expect((await anon().get('/api/cases').set('Authorization', 'Bearer not-a-token')).status).toBe(401);
  });
});

describe('session lifecycle', () => {
  it('GET /me is null for anonymous and for an invalid cookie', async () => {
    expect((await anon().get('/api/auth/me')).body).toEqual({ user: null });
    expect((await anon().get('/api/auth/me').set('Cookie', 'tv_session=garbage')).body).toEqual({ user: null, reason: 'INVALID_TOKEN' });
  });

  it('logout clears the cookie so the agent is anonymous again', async () => {
    await createClient({ email: 'bye@test.local' });
    const agent = await loginAgent('bye@test.local', TEST_PASSWORD);
    expect((await agent.get('/api/auth/me')).body.user.email).toBe('bye@test.local');
    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ ok: true });
    expect(sessionCookie(out)).toMatch(/tv_session=;/);
    expect((await agent.get('/api/auth/me')).body).toMatchObject({ user: null });
    expect((await agent.get('/api/cases')).status).toBe(401);
  });

  it('a deactivated user’s existing session stops working', async () => {
    const { user, token } = await createClient();
    const agent = sessionAgent(token);
    expect((await agent.get('/api/cases')).status).toBe(200);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect((await agent.get('/api/cases')).status).toBe(401);
    expect((await agent.get('/api/auth/me')).body).toMatchObject({ user: null });
  });

  it('logout works without a session', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(200);
  });
});
