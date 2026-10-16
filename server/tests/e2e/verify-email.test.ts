import { describe, expect, it } from 'vitest';
import { anon, ORIGIN, sessionAgent } from '../helpers/api';
import { emailsTo, prisma, settle } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { createVerificationToken, VERIFY_TOKEN_TTL_MS } from '../../src/lib/emailVerification.js';

const unverified = async () => {
  const u = await createUser({ emailVerified: false });
  return { ...u, agent: sessionAgent(u.token) };
};

describe('email verification', () => {
  it('registration sends a verification email and the new account starts unverified', async () => {
    const res = await anon()
      .post('/api/auth/register')
      .set('Origin', ORIGIN)
      .send({ email: 'new.candidate@test.local', password: 'Password123', firstName: 'Aysel', lastName: 'Q', locale: 'de', phone: '+4915112345678', birthDate: '1995-03-01' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ emailVerified: false, twoFactorEnabled: false, twoFactorRequired: false });
    const [mail] = await emailsTo('new.candidate@test.local');
    expect(mail!.subject).toContain('E-Mail-Adresse');
    const tokens = await prisma.emailVerificationToken.findMany({ where: { userId: res.body.user.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    const ttl = tokens[0]!.expiresAt.getTime() - tokens[0]!.createdAt.getTime();
    expect(Math.abs(ttl - VERIFY_TOKEN_TTL_MS)).toBeLessThan(5000);
  });

  it('POST /verify-email marks the account verified; the token is single-use', async () => {
    const u = await unverified();
    const token = await createVerificationToken(u.user.id);
    expect((await u.agent.get('/api/auth/me')).body.user.emailVerified).toBe(false);
    const res = await anon().post('/api/auth/verify-email').set('Origin', ORIGIN).send({ token });
    expect(res.status).toBe(200);
    expect((await u.agent.get('/api/auth/me')).body.user.emailVerified).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.user.id } })).emailVerifiedAt).not.toBeNull();
    const again = await anon().post('/api/auth/verify-email').send({ token });
    expect(again.status).toBe(400);
    expect(again.body.error).toBe('INVALID_TOKEN');
    expect(await prisma.auditLog.count({ where: { action: 'EMAIL_VERIFIED', target: `user:${u.user.id}` } })).toBe(1);
  });

  it('GET /verify-email?token= works too', async () => {
    const u = await unverified();
    const token = await createVerificationToken(u.user.id);
    expect((await anon().get(`/api/auth/verify-email?token=${token}`)).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.user.id } })).emailVerifiedAt).not.toBeNull();
  });

  it('rejects expired, unknown and malformed tokens', async () => {
    const u = await unverified();
    const token = await createVerificationToken(u.user.id);
    await prisma.emailVerificationToken.updateMany({ where: { userId: u.user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await anon().post('/api/auth/verify-email').send({ token })).body.error).toBe('INVALID_TOKEN');
    expect((await anon().post('/api/auth/verify-email').send({ token: 'a'.repeat(64) })).body.error).toBe('INVALID_TOKEN');
    expect((await anon().post('/api/auth/verify-email').send({ token: 'short' })).status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.user.id } })).emailVerifiedAt).toBeNull();
  });

  it('a new link invalidates the previous one', async () => {
    const u = await unverified();
    const first = await createVerificationToken(u.user.id);
    const second = await createVerificationToken(u.user.id);
    expect((await anon().post('/api/auth/verify-email').send({ token: first })).status).toBe(400);
    expect((await anon().post('/api/auth/verify-email').send({ token: second })).status).toBe(200);
  });

  it('resend: needs a session, sends a new link, throttles per account, no-op once verified', async () => {
    expect((await anon().post('/api/auth/resend-verification').set('Origin', ORIGIN)).status).toBe(401);
    const u = await unverified();
    const res = await u.agent.post('/api/auth/resend-verification');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    await emailsTo(u.user.email);
    const throttled = await u.agent.post('/api/auth/resend-verification');
    expect(throttled.status).toBe(429);

    const v = await createUser();
    const done = await sessionAgent(v.token).post('/api/auth/resend-verification');
    expect(done.body).toEqual({ ok: true, alreadyVerified: true });
    await settle();
    expect(await prisma.emailLog.count({ where: { to: v.user.email } })).toBe(0);
  });

  it('creating a visa case requires a verified email', async () => {
    const u = await unverified();
    const blocked = await u.agent.post('/api/cases').send({ profession: 'Kaynakçı' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe('EMAIL_NOT_VERIFIED');
    await anon().post('/api/auth/verify-email').send({ token: await createVerificationToken(u.user.id) });
    expect((await u.agent.post('/api/cases').send({ profession: 'Kaynakçı' })).status).toBe(201);
  });
});
