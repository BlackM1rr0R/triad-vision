import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anon, asClient, asStaff, ORIGIN, sessionAgent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createUser, TEST_PASSWORD } from '../helpers/factories';
import { resetTwoFactorState } from '../../src/lib/twoFactor.js';
import { resetLoginGuard } from '../../src/lib/loginGuard.js';

/** Captures the HTML of every email (the real sendMail still writes the EmailLog row). */
const mails = vi.hoisted(() => [] as { to: string; subject: string; html: string }[]);
vi.mock('../../src/lib/mailer.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/lib/mailer.js')>();
  return {
    ...mod,
    sendMail: async (to: string, subject: string, html: string, attachments?: never) => {
      mails.push({ to, subject, html });
      return mod.sendMail(to, subject, html, attachments);
    },
  };
});

beforeEach(() => {
  resetTwoFactorState();
  resetLoginGuard();
  mails.length = 0;
});

/** The code from the newest email to `to`. */
const lastCode = (to: string) => {
  const m = [...mails].reverse().find((x) => x.to === to);
  const code = m?.html.match(/:\s*(\d{6})/)?.[1];
  if (!code) throw new Error(`no code mailed to ${to}`);
  return code;
};

const login = (email: string, opts: { password?: string; mobile?: boolean } = {}) => {
  const req = anon().post('/api/auth/login').set('Origin', ORIGIN);
  if (opts.mobile) req.set('x-client', 'mobile');
  return req.send({ email, password: opts.password ?? TEST_PASSWORD });
};

const verify = (body: Record<string, string>, mobile = false) => {
  const req = anon().post('/api/auth/2fa/verify').set('Origin', ORIGIN);
  if (mobile) req.set('x-client', 'mobile');
  return req.send(body);
};

const sendCode = (challenge: string) => anon().post('/api/auth/2fa/email/send').set('Origin', ORIGIN).send({ challenge });

/** Pretend the last code was sent more than a minute ago (lifts the 60 s resend throttle). */
const pastResendWindow = (userId: string) =>
  prisma.emailOtpCode.updateMany({ where: { userId }, data: { createdAt: new Date(Date.now() - 61_000) } });

/** A candidate who has email two-step login switched on (set directly; enrollment is tested below). */
const emailOtpClient = async (opts: { locale?: 'az' | 'de' | 'en' | 'ru' } = {}) => {
  const c = await asClient({ email: `otp${Math.random().toString(36).slice(2, 8)}@gmail.com`, ...opts });
  await prisma.user.update({ where: { id: c.user.id }, data: { emailOtpEnabledAt: new Date() } });
  return c;
};

describe('turning email two-step login on and off', () => {
  it('needs the password and the emailed code; stores only a hash; exposed in status and /me', async () => {
    const { agent, user } = await asClient({ locale: 'de' });
    expect((await agent.get('/api/auth/2fa/status')).body).toMatchObject({ emailOtpEnabled: false, emailOtpAvailable: true });
    expect((await agent.post('/api/auth/2fa/email/start').send({ password: 'Wrong-pass-1' })).body.error).toBe('WRONG_PASSWORD');
    expect((await agent.post('/api/auth/2fa/email/enable').send({ code: '123456' })).body.error).toBe('CODE_EXPIRED');

    const start = await agent.post('/api/auth/2fa/email/start').send({ password: TEST_PASSWORD });
    expect(start.status).toBe(200);
    expect(start.body).toEqual({ ok: true, email: `${user.email[0]}***@test.local`, retryAfter: 60 });
    const code = lastCode(user.email);
    expect(JSON.stringify(start.body)).not.toContain(code);
    const log = await prisma.emailLog.findFirstOrThrow({ where: { to: user.email } });
    expect(log.subject).toContain('Anmeldecode');
    expect(log.subject).not.toContain(code);
    expect(mails.at(-1)!.html).toContain('10 Minuten');
    const row = await prisma.emailOtpCode.findFirstOrThrow({ where: { userId: user.id } });
    expect(row).toMatchObject({ purpose: 'ENABLE', challengeId: null, attempts: 0, usedAt: null });
    expect(row.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.codeHash).not.toContain(code);
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);

    const wrong = code === '000000' ? '111111' : '000000';
    const bad = await agent.post('/api/auth/2fa/email/enable').send({ code: wrong });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: 'INVALID_CODE', attemptsLeft: 4 });
    expect((await agent.post('/api/auth/2fa/email/enable').send({ code: 'abc' })).status).toBe(400);

    const ok = await agent.post('/api/auth/2fa/email/enable').send({ code });
    expect(ok.body).toEqual({ ok: true, emailOtpEnabled: true });
    expect((await agent.get('/api/auth/2fa/status')).body).toMatchObject({ emailOtpEnabled: true, enabled: false });
    expect((await agent.get('/api/auth/me')).body.user).toMatchObject({ emailOtpEnabled: true, twoFactorEnabled: false });
    expect((await agent.post('/api/auth/2fa/email/start').send({ password: TEST_PASSWORD })).body.error).toBe('EMAIL_OTP_ALREADY_ENABLED');
    expect(await prisma.auditLog.count({ where: { action: 'EMAIL_OTP_ENABLED', target: `user:${user.id}` } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'EMAIL_OTP_ENABLE_FAILED', target: `user:${user.id}` } })).toBe(3);
  });

  it('requires a verified email address', async () => {
    const { agent } = await asClient({ emailVerified: false });
    const res = await agent.post('/api/auth/2fa/email/start').send({ password: TEST_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('EMAIL_NOT_VERIFIED');
    expect(mails).toHaveLength(0);
  });

  it('employers can turn it on too', async () => {
    const u = await createUser({ role: 'COMPANY' });
    const agent = sessionAgent(u.token);
    expect((await agent.post('/api/auth/2fa/email/start').send({ password: TEST_PASSWORD })).status).toBe(200);
    expect((await agent.post('/api/auth/2fa/email/enable').send({ code: lastCode(u.user.email) })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.user.id } })).emailOtpEnabledAt).not.toBeNull();
  });

  it('staff cannot make email codes their (only) factor', async () => {
    for (const twoFactor of [true, false]) {
      const s = await createUser({ role: 'STAFF', twoFactor });
      const agent = sessionAgent(s.token);
      expect((await agent.get('/api/auth/2fa/status')).body).toMatchObject({ emailOtpAvailable: false, emailOtpEnabled: false });
      for (const [url, body] of [
        ['/api/auth/2fa/email/start', { password: TEST_PASSWORD }],
        ['/api/auth/2fa/email/enable', { code: '123456' }],
        ['/api/auth/2fa/email/disable', { password: TEST_PASSWORD }],
      ] as const) {
        const res = await agent.post(url).send(body);
        expect(res.status, url).toBe(403);
        expect(res.body.error, url).toBe('EMAIL_OTP_NOT_AVAILABLE');
      }
    }
    // Even a flag set behind the API's back does not turn email into a staff member's only factor.
    const s = await createUser({ role: 'ADMIN', twoFactor: false });
    await prisma.user.update({ where: { id: s.user.id }, data: { emailOtpEnabledAt: new Date() } });
    const res = await login(s.user.email);
    expect(res.body.twoFactorRequired).toBeUndefined();
    expect(res.body.user).toMatchObject({ emailOtpEnabled: false, twoFactorEnabled: false });
  });

  it('disable needs the password; afterwards the password alone logs in', async () => {
    const { agent, user } = await emailOtpClient();
    expect((await agent.post('/api/auth/2fa/email/disable').send({ password: 'Wrong-pass-1' })).body.error).toBe('WRONG_PASSWORD');
    expect((await agent.post('/api/auth/2fa/email/disable').send({})).status).toBe(400);
    const res = await agent.post('/api/auth/2fa/email/disable').send({ password: TEST_PASSWORD });
    expect(res.body).toEqual({ ok: true, emailOtpEnabled: false });
    expect((await agent.post('/api/auth/2fa/email/disable').send({ password: TEST_PASSWORD })).body.error).toBe('EMAIL_OTP_NOT_ENABLED');
    expect(await prisma.auditLog.count({ where: { action: 'EMAIL_OTP_DISABLED', target: `user:${user.id}` } })).toBe(1);
    expect((await login(user.email)).body.user.id).toBe(user.id);
  });

  it('requires authentication', async () => {
    for (const url of ['/api/auth/2fa/email/start', '/api/auth/2fa/email/enable', '/api/auth/2fa/email/disable']) {
      expect((await anon().post(url).set('Origin', ORIGIN).send({ password: 'x', code: '123456' })).status, url).toBe(401);
    }
  });
});

describe('login with an emailed code', () => {
  it('the password step mails a code and creates no session; the code completes the login once', async () => {
    const { user } = await emailOtpClient({ locale: 'ru' });
    const sessionsBefore = await prisma.session.count({ where: { userId: user.id } });
    const step1 = await login(user.email);
    expect(step1.status).toBe(200);
    expect(step1.body).toEqual({
      twoFactorRequired: true,
      challenge: expect.any(String),
      method: 'email',
      alternatives: [],
      email: `${user.email[0]}***@gmail.com`,
      emailSent: true,
      retryAfter: 60,
    });
    expect(step1.headers['set-cookie']).toBeUndefined();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(sessionsBefore);
    const code = lastCode(user.email);
    expect(JSON.stringify(step1.body)).not.toContain(code);
    expect(mails.at(-1)!.html).toContain('Ваш код для входа');
    const log = await prisma.emailLog.findFirstOrThrow({ where: { to: user.email } });
    expect(log.subject).not.toContain(code);
    expect(await prisma.emailOtpCode.count({ where: { userId: user.id, purpose: 'LOGIN', challengeId: { not: null } } })).toBe(1);

    // A TOTP code or a recovery code is no way in for an email-only account.
    expect((await verify({ challenge: step1.body.challenge, code })).body.error).toBe('INVALID_CODE');
    expect((await verify({ challenge: step1.body.challenge, emailCode: code, code })).status).toBe(400);

    const ok = await verify({ challenge: step1.body.challenge, emailCode: code });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ id: user.id, emailOtpEnabled: true });
    expect(String(ok.headers['set-cookie'])).toContain('tv_session=');
    expect(ok.body.token).toBeUndefined();

    const again = await verify({ challenge: step1.body.challenge, emailCode: code });
    expect(again.body.error).toBe('TWO_FACTOR_CHALLENGE_INVALID');
    expect(await prisma.auditLog.count({ where: { action: 'LOGIN_EMAIL_OTP_SENT', target: `user:${user.id}` } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'LOGIN_EMAIL_OTP_USED', target: `user:${user.id}` } })).toBe(1);
  });

  it('a code only works with the challenge it was sent for', async () => {
    const { user } = await emailOtpClient();
    const ch1 = (await login(user.email)).body.challenge;
    const code1 = lastCode(user.email);
    await pastResendWindow(user.id);
    const ch2 = (await login(user.email)).body.challenge;
    expect((await verify({ challenge: ch2, emailCode: code1 })).status).toBe(401);
    expect((await verify({ challenge: ch1, emailCode: code1 })).body.error).toBe('CODE_EXPIRED');
    expect((await verify({ challenge: ch2, emailCode: lastCode(user.email) })).status).toBe(200);
  });

  it('wrong codes use up the challenge and lock the account like wrong TOTP codes', async () => {
    const { user } = await emailOtpClient();
    const ch = (await login(user.email)).body.challenge;
    const code = lastCode(user.email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) {
      const r = await verify({ challenge: ch, emailCode: wrong });
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ error: 'INVALID_CODE', attemptsLeft: 4 - i });
    }
    expect((await verify({ challenge: ch, emailCode: wrong })).status).toBe(401);
    expect((await verify({ challenge: ch, emailCode: code })).body.error).toBe('TWO_FACTOR_CHALLENGE_INVALID');
    expect((await sendCode(ch)).body.error).toBe('TWO_FACTOR_CHALLENGE_INVALID');
    const pwd = await login(user.email);
    expect(pwd.status).toBe(429);
    expect(pwd.body.error).toBe('ACCOUNT_LOCKED');
    expect(await prisma.auditLog.count({ where: { action: 'LOGIN_EMAIL_OTP_FAILED', target: `user:${user.id}` } })).toBe(5);
    expect((await prisma.emailOtpCode.findFirstOrThrow({ where: { userId: user.id } })).attempts).toBe(5);
  });

  it('an expired or exhausted code is refused; a resent code works and replaces the old one', async () => {
    const { user } = await emailOtpClient();
    const ch = (await login(user.email)).body.challenge;
    const first = lastCode(user.email);
    await prisma.emailOtpCode.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await verify({ challenge: ch, emailCode: first });
    expect(expired.status).toBe(401);
    expect(expired.body.error).toBe('CODE_EXPIRED');

    const tooSoon = await sendCode(ch);
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.error).toBe('EMAIL_OTP_TOO_SOON');
    expect(tooSoon.body.retryAfter).toBeGreaterThan(50);
    expect(tooSoon.headers['retry-after']).toBeTruthy();

    await pastResendWindow(user.id);
    const resent = await sendCode(ch);
    expect(resent.status).toBe(200);
    expect(resent.body).toEqual({ ok: true, email: `${user.email[0]}***@gmail.com`, retryAfter: 60 });
    const second = lastCode(user.email);
    if (second !== first) expect((await verify({ challenge: ch, emailCode: first })).status).toBe(401);

    // A code with 5 wrong guesses on it is dead even when the right digits arrive.
    await prisma.emailOtpCode.updateMany({ where: { userId: user.id, usedAt: null }, data: { attempts: 5 } });
    expect((await verify({ challenge: ch, emailCode: second })).body.error).toBe('CODE_EXPIRED');
  });

  it('throttles sending: 5 codes per challenge and 5 per hour', async () => {
    const { user } = await emailOtpClient();
    const ch = (await login(user.email)).body.challenge;
    for (let i = 2; i <= 5; i++) {
      await pastResendWindow(user.id);
      expect((await sendCode(ch)).status, `send #${i}`).toBe(200);
    }
    await pastResendWindow(user.id);
    const sixth = await sendCode(ch);
    expect(sixth.status).toBe(429);
    expect(sixth.body).toEqual({ error: 'EMAIL_OTP_LIMIT', retryAfter: null });
    expect(mails.filter((m) => m.to === user.email)).toHaveLength(5);

    // A fresh password login does not get around the hourly budget.
    const again = await login(user.email);
    expect(again.body).toMatchObject({ twoFactorRequired: true, method: 'email', emailSent: false });
    expect(again.body.retryAfter).toBeGreaterThan(60 * 59 - 5);
    const send = await sendCode(again.body.challenge);
    expect(send.status).toBe(429);
    expect(send.body.error).toBe('EMAIL_OTP_LIMIT');
    expect(mails.filter((m) => m.to === user.email)).toHaveLength(5);
    expect(await prisma.auditLog.count({ where: { action: 'LOGIN_EMAIL_OTP_SENT', target: `user:${user.id}` } })).toBe(5);
  });

  it('mobile clients get the bearer token from the verify step', async () => {
    const { user } = await emailOtpClient();
    const step1 = await login(user.email, { mobile: true });
    expect(step1.body).toMatchObject({ twoFactorRequired: true, method: 'email' });
    expect(step1.body.token).toBeUndefined();
    const step2 = await verify({ challenge: step1.body.challenge, emailCode: lastCode(user.email) }, true);
    expect(step2.status).toBe(200);
    expect(step2.body.token).toBeTruthy();
    expect(step2.headers['set-cookie']).toBeUndefined();
    const me = await anon().get('/api/auth/me').set('Authorization', `Bearer ${step2.body.token}`);
    expect(me.body.user).toMatchObject({ id: user.id, emailOtpEnabled: true });
  });

  it('a wrong password sends nothing and reveals nothing', async () => {
    const { user } = await emailOtpClient();
    const res = await login(user.email, { password: 'Wrong-pass-1' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'INVALID_CREDENTIALS', message: 'INVALID_CREDENTIALS' });
    expect(mails).toHaveLength(0);
  });
});

describe('email code as a fallback for authenticator users', () => {
  it('staff with TOTP may finish the login with an emailed code instead', async () => {
    const { user } = await asStaff();
    const step1 = await login(user.email);
    expect(step1.body).toEqual({ twoFactorRequired: true, challenge: expect.any(String), method: 'totp', alternatives: ['email', 'recovery'] });
    expect(mails).toHaveLength(0); // nothing is sent until asked for

    const sent = await sendCode(step1.body.challenge);
    expect(sent.status).toBe(200);
    expect(sent.body.email).toBe(`${user.email[0]}***@test.local`);
    const ok = await verify({ challenge: step1.body.challenge, emailCode: lastCode(user.email) });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe('STAFF');
    expect(await prisma.auditLog.findFirstOrThrow({ where: { action: 'LOGIN_EMAIL_OTP_SENT' } })).toMatchObject({
      target: `user:${user.id}`,
      details: { trigger: 'fallback' },
    });
    expect(await prisma.auditLog.findFirstOrThrow({ where: { action: 'LOGIN_EMAIL_OTP_USED' } })).toMatchObject({ details: { fallback: true } });
  });

  it('candidates with TOTP and email codes may switch; with TOTP only they may not', async () => {
    const both = await emailOtpClient();
    await prisma.user.update({ where: { id: both.user.id }, data: { totpEnabledAt: new Date() } });
    const ch = await login(both.user.email);
    expect(ch.body).toEqual({ twoFactorRequired: true, challenge: expect.any(String), method: 'totp', alternatives: ['email', 'recovery'] });
    expect((await sendCode(ch.body.challenge)).status).toBe(200);
    expect((await verify({ challenge: ch.body.challenge, emailCode: lastCode(both.user.email) })).status).toBe(200);

    const totpOnly = await createUser({ role: 'CLIENT', twoFactor: true });
    const ch2 = await login(totpOnly.user.email);
    expect(ch2.body.alternatives).toEqual(['recovery']);
    const send = await sendCode(ch2.body.challenge);
    expect(send.status).toBe(403);
    expect(send.body.error).toBe('EMAIL_OTP_NOT_AVAILABLE');
    expect((await verify({ challenge: ch2.body.challenge, emailCode: '123456' })).body.error).toBe('EMAIL_OTP_NOT_AVAILABLE');
    expect(mails.filter((m) => m.to === totpOnly.user.email)).toHaveLength(0);
  });

  it('rejects forged challenges and session tokens on /email/send', async () => {
    const { token } = await asClient();
    expect((await sendCode(token)).body.error).toBe('TWO_FACTOR_CHALLENGE_INVALID');
    expect((await sendCode('x'.repeat(40))).body.error).toBe('TWO_FACTOR_CHALLENGE_INVALID');
    expect((await anon().post('/api/auth/2fa/email/send').set('Origin', ORIGIN).send({})).status).toBe(400);
  });
});
