import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { anon, asClient } from '../helpers/api';
import { emailsTo, prisma, settle } from '../helpers/db';
import { createClient, TEST_PASSWORD } from '../helpers/factories';

const login = (email: string, password: string) => anon().post('/api/auth/login').send({ email, password });

describe('PATCH /api/auth/me', () => {
  it('requires a session', async () => {
    const res = await anon().patch('/api/auth/me').send({ firstName: 'X' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHENTICATED');
  });

  it('updates profile fields and leaves others untouched', async () => {
    const { agent, user } = await asClient({ firstName: 'Old', lastName: 'Name', phone: '+49 1', locale: 'az' });
    const res = await agent.patch('/api/auth/me').send({ firstName: ' Şəhla ', locale: 'de' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, firstName: 'Şəhla', lastName: 'Name', phone: '+49 1', locale: 'de' });

    const cleared = await agent.patch('/api/auth/me').send({ phone: null });
    expect(cleared.body.user.phone).toBeNull();
    expect((await agent.get('/api/auth/me')).body.user.locale).toBe('de');
  });

  it('ignores attempts to change role or email', async () => {
    const { agent, user } = await asClient();
    const res = await agent.patch('/api/auth/me').send({ role: 'ADMIN', email: 'x@evil.test' });
    expect(res.status).toBe(200);
    const db = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(db.role).toBe('CLIENT');
    expect(db.email).toBe(user.email);
  });

  it.each([
    [{ locale: 'fr' }],
    [{ firstName: '' }],
    [{ newPassword: 'short', currentPassword: TEST_PASSWORD }],
  ])('rejects invalid input %j', async (body) => {
    const { agent } = await asClient();
    const res = await agent.patch('/api/auth/me').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });

  it('changes the password only with the correct current password', async () => {
    const { agent, user } = await asClient({ email: 'pw@test.local' });

    const missing = await agent.patch('/api/auth/me').send({ newPassword: 'NewPassword456' });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('WRONG_PASSWORD');

    const wrong = await agent.patch('/api/auth/me').send({ currentPassword: 'nope-nope', newPassword: 'NewPassword456', firstName: 'Changed' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe('WRONG_PASSWORD');
    // a failed password change must not apply the other fields either
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(before.firstName).toBe(user.firstName);

    const ok = await agent.patch('/api/auth/me').send({ currentPassword: TEST_PASSWORD, newPassword: 'NewPassword456' });
    expect(ok.status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.passwordHash).not.toBe(before.passwordHash);

    expect((await login('pw@test.local', TEST_PASSWORD)).status).toBe(401);
    expect((await login('pw@test.local', 'NewPassword456')).status).toBe(200);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('answers the same for unknown emails and creates nothing', async () => {
    const res = await anon().post('/api/auth/forgot-password').send({ email: 'nobody@test.local' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    await settle();
    expect(await prisma.passwordResetToken.count()).toBe(0);
    expect(await prisma.emailLog.count({ where: { to: 'nobody@test.local' } })).toBe(0);
  });

  it('creates a hashed 1-hour token and emails the user in their language', async () => {
    const { user } = await createClient({ email: 'forgot@test.local', locale: 'de' });
    const res = await anon().post('/api/auth/forgot-password').send({ email: ' FORGOT@test.local' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens[0].usedAt).toBeNull();
    const ttl = tokens[0].expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(55 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000);

    const [mail] = await emailsTo('forgot@test.local');
    expect(mail.subject).toBe('Triad Vision · Passwort zurücksetzen');
  });

  it('does nothing for a deactivated account', async () => {
    await createClient({ email: 'inactive@test.local', isActive: false });
    const res = await anon().post('/api/auth/forgot-password').send({ email: 'inactive@test.local' });
    expect(res.body).toEqual({ ok: true });
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });
});

describe('POST /api/auth/reset-password', () => {
  const issue = async (userId: string, expiresInMs = 60 * 60 * 1000, usedAt: Date | null = null) => {
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + expiresInMs),
        usedAt,
      },
    });
    return token;
  };

  it('sets a new password with a valid token and refuses to reuse it', async () => {
    const { user } = await createClient({ email: 'reset@test.local' });
    const token = await issue(user.id);

    const res = await anon().post('/api/auth/reset-password').send({ token, password: 'BrandNew789' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect((await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } })).usedAt).not.toBeNull();
    expect((await login('reset@test.local', 'BrandNew789')).status).toBe(200);

    const again = await anon().post('/api/auth/reset-password').send({ token, password: 'Another999' });
    expect(again.status).toBe(400);
    expect(again.body.error).toBe('INVALID_TOKEN');
  });

  it('refuses an expired token', async () => {
    const { user } = await createClient();
    const token = await issue(user.id, -1000);
    const res = await anon().post('/api/auth/reset-password').send({ token, password: 'BrandNew789' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_TOKEN');
  });

  it('refuses an unknown token', async () => {
    const res = await anon().post('/api/auth/reset-password').send({ token: 'a'.repeat(64), password: 'BrandNew789' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_TOKEN');
  });

  it.each([
    [{ token: 'short', password: 'BrandNew789' }],
    [{ token: 'a'.repeat(64), password: 'short' }],
  ])('validates input %j', async (body) => {
    const res = await anon().post('/api/auth/reset-password').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });
});
