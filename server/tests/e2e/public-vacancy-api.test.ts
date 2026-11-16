import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { anon, app, asAdmin, asStaff, ORIGIN } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';
import { generateApiKey } from '../../src/lib/ops/apiKeys.js';
import { asCandidate, cleanJobs, createCompany, createVacancy } from './vacancies.fixtures';

beforeEach(cleanJobs);

const PARTNER_ORIGIN = 'https://school.example.org';

const newPartner = async (name = `Dil məktəbi ${Date.now()}${Math.random().toString(36).slice(2, 6)}`) => prisma.referralPartner.create({ data: { name } });

/** Creates a key through the admin API (as an admin does it) and returns the secret. */
const createKey = async (admin: Awaited<ReturnType<typeof asAdmin>>, partnerId: string, rateLimitPerMinute = 60) => {
  const res = expectStatus(await admin.agent.post('/api/admin/public-api-keys').send({ partnerId, name: 'Website', rateLimitPerMinute }), 201);
  return { secret: res.body.secret as string, key: res.body.key as { id: string; prefix: string } };
};

const get = (url: string, secret?: string) => {
  const r = request(app).get(url).set('Origin', PARTNER_ORIGIN);
  return secret ? r.set('Authorization', `Bearer ${secret}`) : r;
};

describe('public vacancy API: keys', () => {
  it('requires a valid, unrevoked partner key; employer keys and partner keys never cross over', async () => {
    const admin = await asAdmin();
    const partner = await newPartner();
    const { secret, key } = await createKey(admin, partner.id);
    expect(secret.startsWith('tvp_')).toBe(true);
    expect(key.prefix).toBe(secret.slice(0, 12));
    // Only the hash is stored.
    const row = await prisma.publicApiKey.findUniqueOrThrow({ where: { id: key.id } });
    expect(row.keyHash).not.toContain(secret);

    expect((await get('/api/public/v1/vacancies')).body.error).toBe('API_KEY_REQUIRED');
    expect((await get('/api/public/v1/vacancies', `tvp_${'x'.repeat(43)}`)).status).toBe(401);
    expect((await get('/api/public/v1/vacancies', secret)).status).toBe(200);
    // X-API-Key works too.
    expect((await request(app).get('/api/public/v1/vacancies').set('X-API-Key', secret)).status).toBe(200);

    // An employer key (/api/v1, "tv_") is not a public API key …
    const emp = generateApiKey();
    await prisma.apiKey.create({ data: { name: 'ERP', prefix: emp.prefix, keyHash: emp.keyHash, scopes: ['vacancies:read'] } });
    expect((await get('/api/public/v1/vacancies', emp.key)).status).toBe(401);
    expect((await request(app).get('/api/v1/vacancies').set('Authorization', `Bearer ${emp.key}`)).status).toBe(200);
    // … and a partner key does nothing on the employer API.
    expect((await request(app).get('/api/v1/vacancies').set('Authorization', `Bearer ${secret}`)).status).toBe(401);
    // A session cookie is no substitute for a key.
    const client = await createUser({ role: 'CLIENT' });
    expect((await request(app).get('/api/public/v1/vacancies').set('Cookie', `tv_session=${client.token}`)).status).toBe(401);

    expectStatus(await admin.agent.post(`/api/admin/public-api-keys/${key.id}/revoke`), 200);
    const revoked = await get('/api/public/v1/vacancies', secret);
    expect(revoked.status).toBe(401);
    expect(revoked.body.error).toBe('API_KEY_REVOKED');
    expectStatus(await admin.agent.post(`/api/admin/public-api-keys/${key.id}/revoke`), 409);
  });

  it('refuses keys of inactive partners', async () => {
    const admin = await asAdmin();
    const partner = await newPartner();
    const { secret } = await createKey(admin, partner.id);
    await prisma.referralPartner.update({ where: { id: partner.id }, data: { active: false } });
    expect((await get('/api/public/v1/vacancies', secret)).status).toBe(403);
  });

  it('is managed by admins only', async () => {
    const staff = await asStaff();
    const partner = await newPartner();
    expect((await staff.agent.get('/api/admin/public-api-keys')).status).toBe(403);
    expect((await staff.agent.post('/api/admin/public-api-keys').send({ partnerId: partner.id, name: 'x' })).status).toBe(403);
    expect((await anon().get('/api/admin/public-api-keys')).status).toBe(401);
    const admin = await asAdmin();
    expectStatus(await admin.agent.post('/api/admin/public-api-keys').send({ partnerId: 'nope', name: 'Website' }), 400);
    const { key } = await createKey(admin, partner.id);
    expectStatus(await admin.agent.patch(`/api/admin/public-api-keys/${key.id}`).send({ rateLimitPerMinute: 120 }), 200);
    const list = expectStatus(await admin.agent.get('/api/admin/public-api-keys'), 200).body;
    const mine = list.keys.find((k: { id: string }) => k.id === key.id);
    expect(mine).toMatchObject({ rateLimitPerMinute: 120, partner: { id: partner.id }, requests30d: 0, applications: 0 });
    expect(JSON.stringify(list)).not.toContain('keyHash');
    expect(await prisma.auditLog.count({ where: { action: { startsWith: 'PUBLIC_API_KEY_' }, target: `public-api-key:${key.id}` } })).toBe(2);
  });
});

describe('public vacancy API: vacancies', () => {
  it('lists only open Triad Vision vacancies, with filters, language and the partner apply link', async () => {
    const admin = await asAdmin();
    const partner = await newPartner('İlqar Məmmədov');
    const { secret, key } = await createKey(admin, partner.id);
    const code = (await prisma.referralPartner.findUniqueOrThrow({ where: { id: partner.id } })).code!;
    expect(code).toBeTruthy();

    const company = await createCompany({ name: 'Spedition Nord GmbH' });
    const truck = await createVacancy({ companyId: company.id, city: 'Bonn', profession: 'Berufskraftfahrer', germanLevel: 'A2', showCompany: true });
    const nurse = await createVacancy({ city: 'Berlin', profession: 'Pflegefachkraft', germanLevel: 'B2', title: { az: 'Tibb bacısı', de: 'Pflegefachkraft', en: 'Nurse', ru: 'Медсестра' } });
    await createVacancy({ status: 'DRAFT', publishedAt: null });
    await createVacancy({ status: 'CLOSED' });
    await createVacancy({ closesAt: new Date(Date.now() - 24 * 60 * 60 * 1000) });

    const all = expectStatus(await get('/api/public/v1/vacancies', secret), 200);
    expect(all.headers['access-control-allow-origin']).toBe('*');
    expect(all.headers['access-control-allow-credentials']).toBeUndefined();
    expect(all.headers['ratelimit-limit']).toBe('60');
    expect(all.body.total).toBe(2);
    expect(all.body.items.map((v: { id: string }) => v.id).sort()).toEqual([truck.id, nurse.id].sort());
    const t = all.body.items.find((v: { id: string }) => v.id === truck.id);
    expect(t).toMatchObject({ language: 'en', title: 'LKW-Fahrer en', city: 'Bonn', country: 'DE', professionKey: 'truck_driver', companyName: 'Spedition Nord GmbH', salary: { min: 2800, max: 3400, currency: 'EUR' } });
    expect(t.applyUrl).toContain(`/jobs/${truck.slug}?ref=${encodeURIComponent(code)}&src=${encodeURIComponent(key.prefix)}`);
    expect(JSON.stringify(all.body)).not.toMatch(/staffNote|companyId|driveFolderId/);

    const de = expectStatus(await get('/api/public/v1/vacancies?lng=de&profession=nurse', secret), 200).body;
    expect(de.items).toHaveLength(1);
    expect(de.items[0]).toMatchObject({ id: nurse.id, title: 'Pflegefachkraft', language: 'de' });
    expect((await get('/api/public/v1/vacancies?city=bonn', secret)).body.items.map((v: { id: string }) => v.id)).toEqual([truck.id]);
    expect((await get('/api/public/v1/vacancies?germanLevel=B1', secret)).body.items.map((v: { id: string }) => v.id)).toEqual([truck.id]);
    expect((await get('/api/public/v1/vacancies?page=2&pageSize=1', secret)).body).toMatchObject({ page: 2, pageSize: 1, total: 2 });
    expect((await get('/api/public/v1/vacancies?lng=xx', secret)).status).toBe(400);

    expectStatus(await get(`/api/public/v1/vacancies/${truck.slug}?lng=az`, secret), 200);
    expect((await get('/api/public/v1/vacancies/does-not-exist', secret)).status).toBe(404);

    // The JSON Schema is public.
    const schema = expectStatus(await get('/api/public/v1/schema.json'), 200).body;
    expect(schema.$defs.vacancy.required).toContain('applyUrl');
  });

  it('answers CORS preflights for any origin', async () => {
    const res = await request(app).options('/api/public/v1/vacancies').set('Origin', PARTNER_ORIGIN).set('Access-Control-Request-Method', 'GET').set('Access-Control-Request-Headers', 'authorization');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-headers']).toMatch(/Authorization/);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    // Even our own site origin gets "*" without credentials here.
    const own = await request(app).get('/api/public/v1/schema.json').set('Origin', ORIGIN);
    expect(own.headers['access-control-allow-origin']).toBe('*');
    expect(own.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('rate-limits per key and counts usage', async () => {
    const admin = await asAdmin();
    const partner = await newPartner();
    const { secret, key } = await createKey(admin, partner.id, 2);
    const other = await createKey(admin, partner.id, 2);
    expectStatus(await get('/api/public/v1/vacancies', secret), 200);
    expectStatus(await get('/api/public/v1/vacancies', secret), 200);
    const limited = await get('/api/public/v1/vacancies', secret);
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe('TOO_MANY_REQUESTS');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers['ratelimit-remaining']).toBe('0');
    // Another key has its own budget.
    expectStatus(await get('/api/public/v1/vacancies', other.secret), 200);

    const usage = await waitFor(async () => {
      const u = await prisma.publicApiKeyUsage.findFirst({ where: { keyId: key.id } });
      return u && u.requests === 3 && u.rateLimited === 1 ? u : null;
    });
    expect(usage).toMatchObject({ requests: 3, rateLimited: 1 });
    const list = expectStatus(await admin.agent.get('/api/admin/public-api-keys'), 200).body;
    expect(list.keys.find((k: { id: string }) => k.id === key.id)).toMatchObject({ requests30d: 3, rateLimited30d: 1 });
  });

  it('attributes applications made through the apply link (tv_src cookie) to the key', async () => {
    const admin = await asAdmin();
    const partner = await newPartner();
    const { key } = await createKey(admin, partner.id);
    const v = await createVacancy();
    const cand = await asCandidate();
    const res = await request(app)
      .post(`/api/vacancies/${v.slug}/apply`)
      .set('Origin', ORIGIN)
      .set('Cookie', `tv_session=${cand.token}; tv_src=${key.prefix}`)
      .send({ message: 'Hi' });
    expectStatus(res, 201);
    const row = await waitFor(() => prisma.publicApiAttribution.findUnique({ where: { applicationId: res.body.application.id } }));
    expect(row).toMatchObject({ keyId: key.id, partnerId: partner.id, vacancyId: v.id });

    // A forged / unknown source records nothing.
    const v2 = await createVacancy();
    const res2 = await request(app).post(`/api/vacancies/${v2.slug}/apply`).set('Origin', ORIGIN).set('Cookie', `tv_session=${cand.token}; tv_src=tvp_zzzzzzzz`).send({});
    expectStatus(res2, 201);
    await new Promise((r) => setTimeout(r, 200));
    expect(await prisma.publicApiAttribution.count({ where: { applicationId: res2.body.application.id } })).toBe(0);

    const list = expectStatus(await admin.agent.get('/api/admin/public-api-keys'), 200).body;
    expect(list.keys.find((k: { id: string }) => k.id === key.id)).toMatchObject({ applications: 1 });
  });
});
