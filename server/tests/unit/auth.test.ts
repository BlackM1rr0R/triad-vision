import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock('../../src/db.js', () => ({ prisma: m.prisma }));

const auth = await import('../../src/middleware/auth.js');
const { config } = await import('../../src/config.js');
const { HttpError } = await import('../../src/lib/http.js');

const users: Record<string, object> = {
  u1: { id: 'u1', role: 'CLIENT', email: 'c@test.local', firstName: 'C', lastName: 'L', locale: 'de', isActive: true },
  u2: { id: 'u2', role: 'ADMIN', email: 'a@test.local', firstName: 'A', lastName: 'L', locale: 'az', isActive: true },
  off: { id: 'off', role: 'ADMIN', email: 'x@test.local', firstName: 'X', lastName: 'L', locale: 'az', isActive: false },
};

beforeEach(() => {
  m.prisma.user.findUnique.mockReset();
  m.prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => users[where.id] ?? null);
});

const fakeReq = (opts: { cookie?: string; authorization?: string; xClient?: string; user?: unknown } = {}) =>
  ({
    cookies: opts.cookie ? { [auth.AUTH_COOKIE]: opts.cookie } : {},
    get: (name: string) =>
      ({ authorization: opts.authorization, 'x-client': opts.xClient })[name.toLowerCase() as 'authorization' | 'x-client'],
    user: opts.user,
  }) as unknown as Request;

const runLoad = async (req: Request) => {
  const next = vi.fn();
  await auth.loadUser(req, {} as Response, next as unknown as NextFunction);
  expect(next).toHaveBeenCalledWith();
  return req.user;
};

describe('signSession', () => {
  it('signs {sub} valid for 7 days', () => {
    const payload = jwt.verify(auth.signSession('u1'), config.jwtSecret) as { sub: string; iat: number; exp: number };
    expect(payload.sub).toBe('u1');
    expect(payload.exp - payload.iat).toBe(7 * 24 * 3600);
  });
});

describe('loadUser', () => {
  it('is anonymous without a token and does not hit the DB', async () => {
    expect(await runLoad(fakeReq())).toBeUndefined();
    expect(m.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('reads the session cookie', async () => {
    expect(await runLoad(fakeReq({ cookie: auth.signSession('u1') }))).toEqual({
      id: 'u1',
      role: 'CLIENT',
      email: 'c@test.local',
      firstName: 'C',
      lastName: 'L',
      locale: 'de',
    });
  });

  it('reads a Bearer token', async () => {
    expect((await runLoad(fakeReq({ authorization: `Bearer ${auth.signSession('u2')}` })))?.id).toBe('u2');
  });

  it('prefers the Bearer token over the cookie', async () => {
    const user = await runLoad(fakeReq({ cookie: auth.signSession('u1'), authorization: `Bearer ${auth.signSession('u2')}` }));
    expect(user?.id).toBe('u2');
  });

  it('ignores non-Bearer authorization headers and falls back to the cookie', async () => {
    const user = await runLoad(fakeReq({ cookie: auth.signSession('u1'), authorization: `Basic abc` }));
    expect(user?.id).toBe('u1');
  });

  it.each([
    ['garbage', 'not-a-jwt'],
    ['wrong secret', jwt.sign({ sub: 'u1' }, 'another-secret')],
    ['expired', jwt.sign({ sub: 'u1' }, config.jwtSecret, { expiresIn: -10 })],
  ])('treats a %s token as anonymous', async (_label, token) => {
    expect(await runLoad(fakeReq({ cookie: token }))).toBeUndefined();
    expect(await runLoad(fakeReq({ authorization: `Bearer ${token}` }))).toBeUndefined();
  });

  it('treats an inactive user as anonymous', async () => {
    expect(await runLoad(fakeReq({ cookie: auth.signSession('off') }))).toBeUndefined();
  });

  it('treats a deleted user as anonymous', async () => {
    expect(await runLoad(fakeReq({ cookie: auth.signSession('gone') }))).toBeUndefined();
  });

  it('treats a DB error as anonymous instead of failing the request', async () => {
    m.prisma.user.findUnique.mockRejectedValueOnce(new Error('db down'));
    expect(await runLoad(fakeReq({ cookie: auth.signSession('u1') }))).toBeUndefined();
  });
});

const runGuard = (guard: (req: Request, res: Response, next: NextFunction) => void, user?: unknown) => {
  const next = vi.fn();
  guard(fakeReq({ user }), {} as Response, next as unknown as NextFunction);
  expect(next).toHaveBeenCalledTimes(1);
  return next.mock.calls[0][0] as InstanceType<typeof HttpError> | undefined;
};

describe('requireAuth / requireRole', () => {
  it('requireAuth: 401 for anonymous, passes when logged in', () => {
    expect(runGuard(auth.requireAuth)).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(runGuard(auth.requireAuth, { id: 'u1', role: 'CLIENT' })).toBeUndefined();
  });

  it('requireRole: 401 anonymous, 403 wrong role, passes allowed roles', () => {
    const guard = auth.requireRole('STAFF', 'ADMIN');
    expect(runGuard(guard)).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(runGuard(guard, { role: 'CLIENT' })).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(runGuard(guard, { role: 'STAFF' })).toBeUndefined();
    expect(runGuard(guard, { role: 'ADMIN' })).toBeUndefined();
    expect(runGuard(auth.requireRole('ADMIN'), { role: 'STAFF' })).toMatchObject({ status: 403 });
  });

  it('isStaff', () => {
    expect(auth.isStaff({ role: 'STAFF' } as never)).toBe(true);
    expect(auth.isStaff({ role: 'ADMIN' } as never)).toBe(true);
    expect(auth.isStaff({ role: 'CLIENT' } as never)).toBe(false);
    expect(auth.isStaff(undefined)).toBe(false);
  });

  it('wantsBearerToken only for x-client: mobile', () => {
    expect(auth.wantsBearerToken(fakeReq({ xClient: 'mobile' }))).toBe(true);
    expect(auth.wantsBearerToken(fakeReq({ xClient: 'web' }))).toBe(false);
    expect(auth.wantsBearerToken(fakeReq())).toBe(false);
  });
});

describe('setSessionCookie', () => {
  it('sets an httpOnly lax cookie for 7 days', () => {
    const cookie = vi.fn();
    auth.setSessionCookie({ cookie } as unknown as Response, 'tok');
    expect(cookie).toHaveBeenCalledWith('tv_session', 'tok', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  });
});
