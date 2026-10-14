import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createAdmin, createClient, createStaff, type UserOpts } from './factories';

/** One in-process app per test file (module graphs are isolated per file). */
export const app = createApp();

export const anon = () => request(app);

/** Cookie-keeping agent; goes through the real (rate-limited) login route. */
export const loginAgent = async (email: string, password: string) => {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
};

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Client sending the web session cookie on every request. The token is signed directly, so
 * fixtures are not throttled by the auth rate limiter.
 */
export const sessionAgent = (token: string, mode: 'cookie' | 'bearer' = 'cookie') => {
  const call = (method: Method) => (url: string) => {
    const t = request(app)[method](url);
    return mode === 'cookie' ? t.set('Cookie', `tv_session=${token}`) : t.set('Authorization', `Bearer ${token}`);
  };
  return { get: call('get'), post: call('post'), put: call('put'), patch: call('patch'), delete: call('delete') };
};

export type Agent = ReturnType<typeof sessionAgent>;

export const asClient = async (opts: UserOpts = {}) => {
  const u = await createClient(opts);
  return { ...u, agent: sessionAgent(u.token) };
};
export const asStaff = async (opts: UserOpts = {}) => {
  const u = await createStaff(opts);
  return { ...u, agent: sessionAgent(u.token) };
};
export const asAdmin = async (opts: UserOpts = {}) => {
  const u = await createAdmin(opts);
  return { ...u, agent: sessionAgent(u.token) };
};

export type Actor = Awaited<ReturnType<typeof asClient>>;
