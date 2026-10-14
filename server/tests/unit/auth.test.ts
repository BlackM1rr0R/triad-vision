import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  prisma: {
    session: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock('../../src/db.js', () => ({ prisma: m.prisma }));

const auth = await import('../../src/middleware/auth.js');
const { config } = await import('../../src/config.js');
const { HttpError } = await import('../../src/lib/http.js');

const users: Record<string, object> = {
  u1: { id: 'u1', role: 'CLIENT', email: 'c@test.local', firstName: 'C', lastName: 'L', locale: 'de', isActive: true },
  u2: { id: 'u2', role: 'ADMIN', email: 'a@test.local', firstName: 'A', lastName: 'L', locale: 'az', isActive: true },
  off: { id: 'off', role: 'ADMIN', email: 'x@test.local', firstName: 'X', lastName: 'L', locale: 'az', isActive: false },
};

type SessionRow = {
  id: string;
  userId: string;
  client: string;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  user: object;
};
const sessions = new Map<string, SessionRow>();
let seq = 0;

/** Signs a token for a (mocked) session row, like issueSession would. */
const tokenFor = (userId: string, over: Partial<SessionRow> = {}) => {
  const id = `s${++seq}`;
  sessions.set(id, {
    id,
    userId,
    client: 'web',
    lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + 3600_000),
    revokedAt: null,
    user: users[userId] ?? users.u1,
    ...over,
  });
  return jwt.sign({ sub: userId, sid: id }, config.jwtSecret, { algorithm: 'HS256', expiresIn: 3600 });
};

beforeEach(() => {
  sessions.clear();
  for (const fn of Object.values(m.prisma.session)) fn.mockReset();
  m.prisma.session.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => sessions.get(where.id) ?? null);
  m.prisma.session.update.mockResolvedValue({});
  m.prisma.session.updateMany.mockResolvedValue({ count: 1 });
  m.prisma.session.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'created', ...data }));
});

const fakeReq = (opts: { cookie?: string; authorization?: string; xClient?: string; user?: unknown; headers?: Record<string, string>; method?: string; cookieAuth?: boolean } = {}) =>
  ({
    method: opts.method ?? 'POST',
    cookies: opts.cookie ? { [auth.AUTH_COOKIE]: opts.cookie } : {},
    get: (name: string) =>
      ({ authorization: opts.authorization, 'x-client': opts.xClient, ...(opts.headers ?? {}) })[name.toLowerCase()],
    user: opts.user,
    cookieAuth: opts.cookieAuth,
  }) as unknown as Request;

const runLoad = async (req: Request) => {
  const next = vi.fn();
  await auth.loadUser(req, {} as Response, next as unknown as NextFunction);
  expect(next).toHaveBeenCalledWith();
  return req.user;
};

describe('issueSession', () => {
  it('creates a session row and signs {sub, sid} with HS256', async () => {
    const { token, session } = await auth.issueSession('u1', { client: 'web', ip: '1.2.3.4', userAgent: 'UA' });
    expect(session.id).toBe('created');
    expect(m.prisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', client: 'web', ip: '1.2.3.4', userAgent: 'UA' }) }),
    );
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as { sub: string; sid: string; iat: number; exp: number };
    expect(payload).toMatchObject({ sub: 'u1', sid: 'created' });
    expect(payload.exp - payload.iat).toBe(config.session.webMaxHours * 3600);
  });

  it('mobile sessions live longer than web sessions', async () => {
    const web = await auth.issueSession('u1', { client: 'web' });
    const mobile = await auth.issueSession('u1', { client: 'mobile' });
    expect(mobile.session.expiresAt.getTime()).toBeGreaterThan(web.session.expiresAt.getTime());
  });
});

describe('loadUser', () => {
  it('is anonymous without a token and does not hit the DB', async () => {
    expect(await runLoad(fakeReq())).toBeUndefined();
    expect(m.prisma.session.findUnique).not.toHaveBeenCalled();
  });

  it('reads the session cookie and marks the request as cookie-authenticated', async () => {
    const req = fakeReq({ cookie: tokenFor('u1') });
    expect(await runLoad(req)).toEqual({ id: 'u1', role: 'CLIENT', email: 'c@test.local', firstName: 'C', lastName: 'L', locale: 'de' });
    expect(req.cookieAuth).toBe(true);
    expect(req.session?.client).toBe('web');
  });

  it('reads a Bearer token (not cookie-authenticated)', async () => {
    const req = fakeReq({ authorization: `Bearer ${tokenFor('u2')}` });
    expect((await runLoad(req))?.id).toBe('u2');
    expect(req.cookieAuth).toBe(false);
  });

  it('prefers the Bearer token over the cookie', async () => {
    const user = await runLoad(fakeReq({ cookie: tokenFor('u1'), authorization: `Bearer ${tokenFor('u2')}` }));
    expect(user?.id).toBe('u2');
  });

  it('ignores non-Bearer authorization headers and falls back to the cookie', async () => {
    const user = await runLoad(fakeReq({ cookie: tokenFor('u1'), authorization: `Basic abc` }));
    expect(user?.id).toBe('u1');
  });

  it.each([
    ['garbage', 'not-a-jwt', 'INVALID_TOKEN'],
    ['wrong secret', jwt.sign({ sub: 'u1', sid: 'x' }, 'another-secret'), 'INVALID_TOKEN'],
    ['expired', jwt.sign({ sub: 'u1', sid: 'x' }, config.jwtSecret, { expiresIn: -10 }), 'SESSION_EXPIRED'],
    ['missing sid', jwt.sign({ sub: 'u1' }, config.jwtSecret), 'INVALID_TOKEN'],
    ['none algorithm', jwt.sign({ sub: 'u1', sid: 'x' }, '', { algorithm: 'none' }), 'INVALID_TOKEN'],
  ])('treats a %s token as anonymous with reason %s', async (_label, token, reason) => {
    const req = fakeReq({ cookie: token });
    expect(await runLoad(req)).toBeUndefined();
    expect(req.authFailure).toBe(reason);
    expect(await runLoad(fakeReq({ authorization: `Bearer ${token}` }))).toBeUndefined();
  });

  it('rejects a token whose session belongs to another user', async () => {
    const token = tokenFor('u1');
    const sid = (jwt.decode(token) as { sid: string }).sid;
    sessions.get(sid)!.userId = 'u2';
    const req = fakeReq({ cookie: token });
    expect(await runLoad(req)).toBeUndefined();
    expect(req.authFailure).toBe('INVALID_TOKEN');
  });

  it('rejects a revoked session', async () => {
    const req = fakeReq({ cookie: tokenFor('u1', { revokedAt: new Date() }) });
    expect(await runLoad(req)).toBeUndefined();
    expect(req.authFailure).toBe('SESSION_REVOKED');
  });

  it('rejects a session past its absolute expiry', async () => {
    const req = fakeReq({ cookie: tokenFor('u1', { expiresAt: new Date(Date.now() - 1000) }) });
    expect(await runLoad(req)).toBeUndefined();
    expect(req.authFailure).toBe('SESSION_EXPIRED');
  });

  it('revokes and rejects a web session idle for longer than the idle timeout', async () => {
    const idle = config.session.webIdleMinutes * 60_000 + 1000;
    const req = fakeReq({ cookie: tokenFor('u1', { lastSeenAt: new Date(Date.now() - idle) }) });
    expect(await runLoad(req)).toBeUndefined();
    expect(req.authFailure).toBe('SESSION_EXPIRED');
    expect(m.prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { revokedAt: expect.any(Date) } }));
  });

  it('keeps a mobile session alive across the web idle timeout', async () => {
    const idle = config.session.webIdleMinutes * 60_000 + 1000;
    const req = fakeReq({ authorization: `Bearer ${tokenFor('u1', { client: 'mobile', lastSeenAt: new Date(Date.now() - idle) })}` });
    expect((await runLoad(req))?.id).toBe('u1');
    expect(req.session?.client).toBe('mobile');
  });

  it('touches lastSeenAt only when it is older than a minute', async () => {
    await runLoad(fakeReq({ cookie: tokenFor('u1') }));
    expect(m.prisma.session.update).not.toHaveBeenCalled();
    await runLoad(fakeReq({ cookie: tokenFor('u1', { lastSeenAt: new Date(Date.now() - 120_000) }) }));
    expect(m.prisma.session.update).toHaveBeenCalledTimes(1);
  });

  it('treats an inactive user as revoked', async () => {
    const req = fakeReq({ cookie: tokenFor('off') });
    expect(await runLoad(req)).toBeUndefined();
    expect(req.authFailure).toBe('SESSION_REVOKED');
  });

  it('treats an unknown session as anonymous', async () => {
    const token = jwt.sign({ sub: 'u1', sid: 'nope' }, config.jwtSecret);
    expect(await runLoad(fakeReq({ cookie: token }))).toBeUndefined();
  });

  it('treats a DB error as anonymous instead of failing the request', async () => {
    m.prisma.session.findUnique.mockRejectedValueOnce(new Error('db down'));
    expect(await runLoad(fakeReq({ cookie: tokenFor('u1') }))).toBeUndefined();
  });
});

const runGuard = (guard: (req: Request, res: Response, next: NextFunction) => void, req: Request) => {
  const next = vi.fn();
  guard(req, {} as Response, next as unknown as NextFunction);
  expect(next).toHaveBeenCalledTimes(1);
  return next.mock.calls[0][0] as InstanceType<typeof HttpError> | undefined;
};

describe('requireAuth / requireRole / requireMinRole', () => {
  it('requireAuth: 401 for anonymous (with the failure reason), passes when logged in', () => {
    expect(runGuard(auth.requireAuth, fakeReq())).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    const expired = fakeReq();
    expired.authFailure = 'SESSION_EXPIRED';
    expect(runGuard(auth.requireAuth, expired)).toMatchObject({ status: 401, code: 'SESSION_EXPIRED' });
    expect(runGuard(auth.requireAuth, fakeReq({ user: { id: 'u1', role: 'CLIENT' } }))).toBeUndefined();
  });

  it('requireRole: 401 anonymous, 403 wrong role, passes allowed roles', () => {
    const guard = auth.requireRole('STAFF', 'ADMIN');
    expect(runGuard(guard, fakeReq())).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(runGuard(guard, fakeReq({ user: { role: 'CLIENT' } }))).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(runGuard(guard, fakeReq({ user: { role: 'STAFF' } }))).toBeUndefined();
    expect(runGuard(guard, fakeReq({ user: { role: 'ADMIN' } }))).toBeUndefined();
    expect(runGuard(auth.requireRole('ADMIN'), fakeReq({ user: { role: 'STAFF' } }))).toMatchObject({ status: 403 });
  });

  it('requireMinRole follows the hierarchy CLIENT < STAFF < ADMIN < SUPER_ADMIN', () => {
    const admin = auth.requireMinRole('ADMIN');
    expect(runGuard(admin, fakeReq({ user: { role: 'STAFF' } }))).toMatchObject({ status: 403 });
    expect(runGuard(admin, fakeReq({ user: { role: 'ADMIN' } }))).toBeUndefined();
    expect(runGuard(admin, fakeReq({ user: { role: 'SUPER_ADMIN' } }))).toBeUndefined();
    expect(runGuard(auth.requireMinRole('SUPER_ADMIN'), fakeReq({ user: { role: 'ADMIN' } }))).toMatchObject({ status: 403 });
    expect(runGuard(auth.requireMinRole('STAFF'), fakeReq({ user: { role: 'CLIENT' } }))).toMatchObject({ status: 403 });
  });

  it('isStaff', () => {
    expect(auth.isStaff({ role: 'STAFF' } as never)).toBe(true);
    expect(auth.isStaff({ role: 'ADMIN' } as never)).toBe(true);
    expect(auth.isStaff({ role: 'SUPER_ADMIN' } as never)).toBe(true);
    expect(auth.isStaff({ role: 'CLIENT' } as never)).toBe(false);
    expect(auth.isStaff(undefined)).toBe(false);
  });

  it('wantsBearerToken only for x-client: mobile', () => {
    expect(auth.wantsBearerToken(fakeReq({ xClient: 'mobile' }))).toBe(true);
    expect(auth.wantsBearerToken(fakeReq({ xClient: 'web' }))).toBe(false);
    expect(auth.wantsBearerToken(fakeReq())).toBe(false);
  });
});

describe('csrfGuard', () => {
  it('ignores safe methods and Bearer-authenticated requests', () => {
    expect(runGuard(auth.csrfGuard, fakeReq({ method: 'GET', cookieAuth: true }))).toBeUndefined();
    expect(runGuard(auth.csrfGuard, fakeReq({ method: 'POST', cookieAuth: false }))).toBeUndefined();
    expect(runGuard(auth.csrfGuard, fakeReq({ method: 'POST' }))).toBeUndefined();
  });

  it('accepts same-origin fetch metadata or an allowed Origin/Referer', () => {
    expect(runGuard(auth.csrfGuard, fakeReq({ cookieAuth: true, headers: { 'sec-fetch-site': 'same-origin' } }))).toBeUndefined();
    expect(runGuard(auth.csrfGuard, fakeReq({ cookieAuth: true, headers: { origin: config.allowedOrigins[0] } }))).toBeUndefined();
    expect(runGuard(auth.csrfGuard, fakeReq({ cookieAuth: true, headers: { referer: `${config.allowedOrigins[0]}/admin/cases` } }))).toBeUndefined();
  });

  it('rejects cross-site cookie requests', () => {
    expect(runGuard(auth.csrfGuard, fakeReq({ cookieAuth: true, headers: { origin: 'https://evil.example' } }))).toMatchObject({ status: 403, code: 'CSRF_ORIGIN_REJECTED' });
    expect(runGuard(auth.csrfGuard, fakeReq({ cookieAuth: true, headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' } }))).toMatchObject({ status: 403 });
    expect(runGuard(auth.csrfGuard, fakeReq({ cookieAuth: true }))).toMatchObject({ status: 403 });
  });
});

describe('setSessionCookie', () => {
  it('sets an httpOnly lax cookie for the web session lifetime', () => {
    const cookie = vi.fn();
    auth.setSessionCookie({ cookie } as unknown as Response, 'tok');
    expect(cookie).toHaveBeenCalledWith('tv_session', 'tok', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: config.session.webMaxHours * 60 * 60 * 1000,
    });
  });
});
