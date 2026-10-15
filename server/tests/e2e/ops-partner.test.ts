import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { runWebhookDeliveries } from '../../src/jobs/webhooks.js';
import { emitWebhook, verifySignature } from '../../src/lib/ops/webhooks.js';
import { asCandidate, asCompany, createVacancy } from './vacancies.fixtures';
import { cleanOps } from './ops.fixtures';

beforeEach(cleanOps);

type Scope = 'vacancies:read' | 'applications:read' | 'applications:write' | 'candidates:read' | 'cases:read' | 'events:read';
const ALL: Scope[] = ['vacancies:read', 'applications:read', 'applications:write', 'candidates:read', 'cases:read', 'events:read'];

const makeKey = async (scopes: Scope[] = ALL, companyId: string | null = null, name = 'Partner') => {
  const admin = await asAdmin();
  const res = expectStatus(await admin.agent.post('/api/admin/ops/api-keys').send({ name, scopes, companyId }), 201);
  return { admin, secret: res.body.secret as string, key: res.body.key as { id: string; prefix: string } };
};

const withKey = (secret: string) => ({
  get: (url: string) => anon().get(url).set('Authorization', `Bearer ${secret}`),
  patch: (url: string) => anon().patch(url).set('Authorization', `Bearer ${secret}`),
});

/** Company A with an open vacancy, a presented (PROPOSED) applicant and a placed worker. */
const world = async () => {
  const a = await asCompany();
  const b = await asCompany();
  const vacA = await createVacancy({ companyId: a.company.id });
  const vacB = await createVacancy({ companyId: b.company.id });
  const cand = await asCandidate();
  const hidden = await asCandidate();
  const app = await prisma.vacancyApplication.create({ data: { vacancyId: vacA.id, userId: cand.user.id, status: 'PROPOSED', matchScore: 77 } });
  await prisma.vacancyApplication.create({ data: { vacancyId: vacA.id, userId: hidden.user.id, status: 'NEW' } });
  const worker = await asClient();
  const c = await createCaseVia(worker.agent, 'Fahrer');
  await prisma.case.update({ where: { id: c.id }, data: { companyId: a.company.id, vacancyId: vacA.id } });
  return { a, b, vacA, vacB, cand, hidden, app, placedCase: c };
};

describe('API keys', () => {
  it('admins create keys (secret shown once), list and revoke them; staff may not', async () => {
    const { admin, secret, key } = await makeKey(['vacancies:read'], null, 'Zapier');
    expect(secret).toMatch(/^tv_[A-Za-z0-9_-]{40,}$/);
    expect(key.prefix).toBe(secret.slice(0, 8));
    const list = expectStatus(await admin.agent.get('/api/admin/ops/api-keys'), 200);
    expect(list.body.keys).toHaveLength(1);
    expect(list.body.keys[0]).toMatchObject({ name: 'Zapier', scopes: ['vacancies:read'], revokedAt: null, lastUsedAt: null });
    expect(JSON.stringify(list.body)).not.toContain(secret);
    expect(list.body.scopes).toContain('applications:write');

    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/ops/api-keys')).status).toBe(403);
    expect((await staff.agent.post('/api/admin/ops/api-keys').send({ name: 'x', scopes: ['vacancies:read'] })).status).toBe(403);
    expect((await admin.agent.post('/api/admin/ops/api-keys').send({ name: 'x', scopes: [] })).status).toBe(400);
    expect((await admin.agent.post('/api/admin/ops/api-keys').send({ name: 'x', scopes: ['root'] })).status).toBe(400);
    expect((await admin.agent.post('/api/admin/ops/api-keys').send({ name: 'x', scopes: ['vacancies:read'], companyId: 'nope' })).status).toBe(400);

    // Using the key touches lastUsedAt.
    expectStatus(await withKey(secret).get('/api/v1/vacancies'), 200);
    // lastUsedAt is written fire-and-forget.
    await waitFor(async () => (await prisma.apiKey.findUniqueOrThrow({ where: { id: key.id } })).lastUsedAt);

    expectStatus(await admin.agent.post(`/api/admin/ops/api-keys/${key.id}/revoke`), 200);
    expect((await admin.agent.post(`/api/admin/ops/api-keys/${key.id}/revoke`)).status).toBe(409);
    const revoked = await withKey(secret).get('/api/v1/vacancies');
    expect(revoked.status).toBe(401);
    expect(revoked.body.error).toBe('API_KEY_REVOKED');
  });

  it('rejects missing, malformed and unknown keys, ignores session cookies and enforces scopes', async () => {
    const { secret } = await makeKey(['vacancies:read']);
    expect((await anon().get('/api/v1/vacancies')).body.error).toBe('API_KEY_REQUIRED');
    expect((await anon().get('/api/v1/vacancies').set('Authorization', 'Bearer nope')).body.error).toBe('API_KEY_REQUIRED');
    expect((await anon().get('/api/v1/vacancies').set('Authorization', `Bearer tv_${'x'.repeat(43)}`)).body.error).toBe('INVALID_API_KEY');
    // A staff session is not an API credential.
    const staff = await asStaff();
    expect((await staff.agent.get('/api/v1/vacancies')).status).toBe(401);
    const noScope = await withKey(secret).get('/api/v1/cases');
    expect(noScope.status).toBe(403);
    expect(noScope.body.error).toBe('INSUFFICIENT_SCOPE');
    // The OpenAPI document is public.
    const doc = await anon().get('/api/v1/openapi.json');
    expect(doc.status).toBe(200);
    expect(doc.body.openapi).toBe('3.0.3');
    expect(Object.keys(doc.body.paths)).toEqual(expect.arrayContaining(['/vacancies', '/applications/{id}', '/events']));
  });
});

describe('partner endpoints are scoped to the key’s company', () => {
  it('vacancies, applications, candidates and cases of company A only', async () => {
    const w = await world();
    const { secret } = await makeKey(ALL, w.a.company.id);
    const api = withKey(secret);

    const vacancies = expectStatus(await api.get('/api/v1/vacancies'), 200).body.items;
    expect(vacancies.map((v: { id: string }) => v.id)).toEqual([w.vacA.id]);
    expect(vacancies[0].applications).toEqual({ PROPOSED: 1 });

    const apps = expectStatus(await api.get(`/api/v1/vacancies/${w.vacA.id}/applications`), 200).body.items;
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ id: w.app.id, status: 'PROPOSED', candidate: { id: w.cand.user.id, name: 'Ali M.', profession: 'Sürücü' } });
    expect(apps[0].candidate.email).toBeUndefined();
    expect((await api.get(`/api/v1/vacancies/${w.vacB.id}/applications`)).status).toBe(404);

    expect(expectStatus(await api.get(`/api/v1/applications/${w.app.id}`), 200).body.application.id).toBe(w.app.id);
    const candidate = expectStatus(await api.get(`/api/v1/candidates/${w.cand.user.id}`), 200).body.candidate;
    expect(candidate).toMatchObject({ id: w.cand.user.id, name: 'Ali M.', germanLevel: 'B1' });
    expect(candidate.email).toBeUndefined();
    expect(candidate.applications).toHaveLength(1);
    // Applied but not yet presented → invisible.
    expect((await api.get(`/api/v1/candidates/${w.hidden.user.id}`)).status).toBe(404);

    const cases = expectStatus(await api.get('/api/v1/cases'), 200).body.items;
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ id: w.placedCase.id, number: w.placedCase.number, status: 'DOCUMENTS_PENDING', candidate: { name: 'Test U.' } });

    // Company B's key sees nothing of A.
    const { secret: secretB } = await makeKey(ALL, w.b.company.id);
    const apiB = withKey(secretB);
    expect(expectStatus(await apiB.get('/api/v1/vacancies'), 200).body.items.map((v: { id: string }) => v.id)).toEqual([w.vacB.id]);
    expect((await apiB.get(`/api/v1/applications/${w.app.id}`)).status).toBe(404);
    expect((await apiB.get(`/api/v1/candidates/${w.cand.user.id}`)).status).toBe(404);
    expect(expectStatus(await apiB.get('/api/v1/cases'), 200).body.items).toHaveLength(0);
  });

  it('PATCH /applications/:id moves the pipeline, notifies and emits a webhook event; events can be polled', async () => {
    const w = await world();
    const { secret } = await makeKey(ALL, w.a.company.id);
    const api = withKey(secret);
    const hook = await prisma.webhook.create({ data: { url: 'https://a.example/h', secret: 's', events: ['application.status_changed'], companyId: w.a.company.id } });

    const moved = expectStatus(await api.patch(`/api/v1/applications/${w.app.id}`).send({ status: 'INTERVIEW', note: 'Next Tuesday' }), 200);
    expect(moved.body.application.status).toBe('INTERVIEW');
    expect(moved.body.application.companyNote).toBe('Next Tuesday');
    expect(await prisma.notification.findFirst({ where: { userId: w.cand.user.id, type: 'APPLICATION_STATUS' } })).not.toBeNull();
    const d = await prisma.webhookDelivery.findFirst({ where: { webhookId: hook.id } });
    expect(d?.event).toBe('application.status_changed');
    expect((d?.payload as { data: { to: string } }).data.to).toBe('INTERVIEW');

    expect((await api.patch(`/api/v1/applications/${w.app.id}`).send({ status: 'INTERVIEW' })).status).toBe(409);
    expect((await api.patch(`/api/v1/applications/${w.app.id}`).send({ status: 'NEW' })).status).toBe(400);
    expectStatus(await api.patch(`/api/v1/applications/${w.app.id}`).send({ status: 'ACCEPTED' }), 200);

    const events = expectStatus(await api.get('/api/v1/events?limit=10'), 200).body.items;
    const kinds = events.map((e: { event: string }) => e.event);
    expect(kinds).toContain('application.status_changed');
    expect(kinds).toContain('vacancy.published');
    expect(events.find((e: { event: string }) => e.event === 'vacancy.published').data.id).toBe(w.vacA.id);
    expect(events.find((e: { event: string }) => e.event.startsWith('case.'))?.data.id).toBe(w.placedCase.id);
    const none = expectStatus(await api.get(`/api/v1/events?since=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`), 200).body.items;
    expect(none).toHaveLength(0);

    const { secret: readOnly } = await makeKey(['applications:read'], w.a.company.id);
    expect((await withKey(readOnly).patch(`/api/v1/applications/${w.app.id}`).send({ status: 'REJECTED' })).status).toBe(403);
  });
});

describe('webhooks', () => {
  const received: { headers: http.IncomingHttpHeaders; body: string }[] = [];
  let server: http.Server;
  let base = '';
  let answer = 200;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.statusCode = answer;
        res.end('ok');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => {
    received.length = 0;
    answer = 200;
  });

  it('admin CRUD: secret shown once, events validated, test ping is signed, deliveries listed', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/ops/webhooks')).status).toBe(403);
    expect((await admin.agent.post('/api/admin/ops/webhooks').send({ url: 'ftp://x', events: ['case.created'] })).status).toBe(400);
    expect((await admin.agent.post('/api/admin/ops/webhooks').send({ url: `${base}/h`, events: ['nope'] })).status).toBe(400);

    const created = expectStatus(await admin.agent.post('/api/admin/ops/webhooks').send({ url: `${base}/hook`, events: ['case.created', 'application.created'] }), 201);
    const secret = created.body.secret as string;
    expect(secret).toMatch(/^whsec_/);
    const hook = created.body.webhook;
    expect(hook).toMatchObject({ url: `${base}/hook`, events: ['case.created', 'application.created'], active: true, companyId: null });
    const list = expectStatus(await admin.agent.get('/api/admin/ops/webhooks'), 200);
    expect(JSON.stringify(list.body)).not.toContain(secret);
    expect(list.body.events).toContain('interview.scheduled');

    // Ping goes out immediately with the three headers and a valid signature.
    const ping = expectStatus(await admin.agent.post(`/api/admin/ops/webhooks/${hook.id}/test`), 200);
    expect(ping.body.ok).toBe(true);
    expect(ping.body.delivery.status).toBe('DELIVERED');
    expect(ping.body.delivery.responseCode).toBe(200);
    expect(received).toHaveLength(1);
    const r = received[0];
    expect(r.headers['x-tv-event']).toBe('ping');
    expect(r.headers['x-tv-delivery']).toBe(ping.body.delivery.id);
    expect(r.headers['content-type']).toBe('application/json');
    expect(verifySignature(secret, r.body, r.headers['x-tv-signature'] as string)).toBe(true);
    expect(verifySignature('wrong', r.body, r.headers['x-tv-signature'] as string)).toBe(false);
    expect(JSON.parse(r.body).event).toBe('ping');

    const deliveries = expectStatus(await admin.agent.get(`/api/admin/ops/webhooks/${hook.id}/deliveries`), 200).body.deliveries;
    expect(deliveries).toHaveLength(1);

    // Rotating the secret changes signatures; deactivating stops deliveries.
    const rotated = expectStatus(await admin.agent.post(`/api/admin/ops/webhooks/${hook.id}/rotate-secret`), 200);
    expect(rotated.body.secret).not.toBe(secret);
    expectStatus(await admin.agent.patch(`/api/admin/ops/webhooks/${hook.id}`).send({ active: false, events: ['case.decided'] }), 200);
    expect((await prisma.webhook.findUniqueOrThrow({ where: { id: hook.id } })).active).toBe(false);
    expectStatus(await admin.agent.delete(`/api/admin/ops/webhooks/${hook.id}`), 200);
    expect(await prisma.webhook.findUnique({ where: { id: hook.id } })).toBeNull();
  });

  it('the delivery job posts due deliveries with signature, retries with back-off and gives up after 6 attempts', async () => {
    const admin = await asAdmin();
    const created = expectStatus(await admin.agent.post('/api/admin/ops/webhooks').send({ url: `${base}/deliver`, events: ['vacancy.published'] }), 201);
    const secret = created.body.secret as string;
    const hookId = created.body.webhook.id as string;
    // Not subscribed to this event → no delivery.
    await emitWebhook('case.created', { id: 'c1' });
    expect(await prisma.webhookDelivery.count()).toBe(0);
    await emitWebhook('vacancy.published', { id: 'v1', slug: 'lkw' });
    const pending = await prisma.webhookDelivery.findFirstOrThrow({ where: { webhookId: hookId } });
    expect(pending.status).toBe('PENDING');

    const now = new Date();
    expect(await runWebhookDeliveries(now)).toMatchObject({ picked: 1, delivered: 1, failed: 0, retried: 0 });
    const done = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: pending.id } });
    expect(done.status).toBe('DELIVERED');
    expect(done.attempts).toBe(1);
    expect(done.responseCode).toBe(200);
    expect(done.deliveredAt).not.toBeNull();
    expect(received).toHaveLength(1);
    expect(received[0].headers['x-tv-event']).toBe('vacancy.published');
    expect(received[0].headers['x-tv-delivery']).toBe(pending.id);
    expect(verifySignature(secret, received[0].body, received[0].headers['x-tv-signature'] as string)).toBe(true);
    expect(JSON.parse(received[0].body)).toMatchObject({ event: 'vacancy.published', data: { id: 'v1', slug: 'lkw' } });
    // Nothing left to do.
    expect((await runWebhookDeliveries(now)).picked).toBe(0);

    // Receiver fails → retry in 1 min, then 5 min…
    answer = 500;
    await emitWebhook('vacancy.published', { id: 'v2' });
    const d2 = await prisma.webhookDelivery.findFirstOrThrow({ where: { webhookId: hookId, status: 'PENDING' } });
    const t1 = new Date(Date.now() + 1000);
    expect(await runWebhookDeliveries(t1)).toMatchObject({ picked: 1, retried: 1 });
    let row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: d2.id } });
    expect(row).toMatchObject({ status: 'PENDING', attempts: 1, responseCode: 500, lastError: 'HTTP 500' });
    expect(row.nextAttemptAt!.getTime() - t1.getTime()).toBe(60_000);
    // Not due yet.
    expect((await runWebhookDeliveries(new Date(t1.getTime() + 30_000))).picked).toBe(0);
    const t2 = new Date(t1.getTime() + 60_000);
    expect(await runWebhookDeliveries(t2)).toMatchObject({ picked: 1, retried: 1 });
    row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: d2.id } });
    expect(row.attempts).toBe(2);
    expect(row.nextAttemptAt!.getTime() - t2.getTime()).toBe(5 * 60_000);

    // Sixth failure is final.
    await prisma.webhookDelivery.update({ where: { id: d2.id }, data: { attempts: 5, nextAttemptAt: t2 } });
    expect(await runWebhookDeliveries(new Date(t2.getTime() + 1000))).toMatchObject({ picked: 1, failed: 1 });
    row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: d2.id } });
    expect(row.status).toBe('FAILED');
    expect(row.attempts).toBe(6);

    // Manual retry puts it back in the queue and succeeds once the receiver is healthy.
    answer = 200;
    expectStatus(await admin.agent.post(`/api/admin/ops/webhooks/deliveries/${d2.id}/retry`), 200);
    expect(await runWebhookDeliveries(new Date())).toMatchObject({ picked: 1, delivered: 1 });
    expect((await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: d2.id } })).status).toBe('DELIVERED');
    expect((await admin.agent.post(`/api/admin/ops/webhooks/deliveries/${d2.id}/retry`)).status).toBe(409);

    // Unreachable host → network error recorded, still retried.
    await prisma.webhook.update({ where: { id: hookId }, data: { url: 'http://127.0.0.1:9/nope' } });
    await emitWebhook('vacancy.published', { id: 'v3' });
    expect(await runWebhookDeliveries(new Date())).toMatchObject({ picked: 1, retried: 1 });
    const d3 = await prisma.webhookDelivery.findFirstOrThrow({ where: { webhookId: hookId, status: 'PENDING' } });
    expect(d3.lastError).toBeTruthy();
    expect(d3.responseCode).toBeNull();

    // Inactive webhook: its pending deliveries are failed, not posted.
    await prisma.webhook.update({ where: { id: hookId }, data: { active: false, url: `${base}/deliver` } });
    await prisma.webhookDelivery.update({ where: { id: d3.id }, data: { nextAttemptAt: new Date() } });
    received.length = 0;
    expect(await runWebhookDeliveries(new Date())).toMatchObject({ picked: 1, failed: 1 });
    expect(received).toHaveLength(0);
  });

  it('application.created and vacancy.published are emitted by the public / admin vacancy routes', async () => {
    const admin = await asAdmin();
    const company = await asCompany();
    const hook = await prisma.webhook.create({ data: { url: `${base}/x`, secret: 's', events: ['application.created', 'vacancy.published'], companyId: company.company.id } });
    const vacancy = await createVacancy({ companyId: company.company.id, status: 'PENDING', publishedAt: null });
    expectStatus(await admin.agent.post(`/api/admin/vacancies/${vacancy.id}/approve`), 200);
    const cand = await asCandidate();
    expectStatus(await cand.agent.post(`/api/vacancies/${vacancy.slug}/apply`).send({ message: 'Hi' }), 201);
    const events = (await prisma.webhookDelivery.findMany({ where: { webhookId: hook.id }, orderBy: { createdAt: 'asc' } })).map((d) => d.event);
    expect(events).toEqual(['vacancy.published', 'application.created']);
  });
});
