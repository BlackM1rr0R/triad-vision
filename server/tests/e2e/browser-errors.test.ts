import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, ORIGIN } from '../helpers/api';
import { prisma } from '../helpers/db';
import { purgeOldErrors, runErrorDigest } from '../../src/lib/browserErrors/service.js';

/**
 * Browser error log: POST /api/site/client-errors (public, grouped by fingerprint, sanitised) and the admin list
 * /api/admin/browser-errors (ADMIN+: groups, status, nav badge), digest and 30-day retention.
 */
const report = (over: Record<string, unknown> = {}) =>
  anon()
    .post('/api/site/client-errors')
    .set('Origin', ORIGIN)
    .send({
      kind: 'error',
      message: 'Cannot read properties of undefined (reading "name") for max@example.com',
      stack: 'TypeError: x\n    at render (https://triad-vision.de/assets/index-AbC12xYz.js:1:100?token=SECRET)',
      route: 'https://triad-vision.de/cabinet/cases/ckabc123def456ghi789jkl0?token=SECRET&tab=docs#k=abc',
      release: 'index-AbC12xYz',
      ...over,
    });

describe('browser error log', () => {
  it('accepts reports from anyone, groups them by fingerprint and stores no personal data', async () => {
    await prisma.browserErrorGroup.deleteMany();
    await report().expect(202);
    await report().expect(202);
    const client = await asClient();
    await client.agent.post('/api/site/client-errors').send({ kind: 'error', message: 'Cannot read properties of undefined (reading "name") for max@example.com', stack: 'TypeError: x\n    at render (https://triad-vision.de/assets/index-ZzY98aBc.js:9:9)', route: '/cabinet' }).expect(202);

    const rows = await prisma.browserErrorGroup.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ count: 3, kind: 'error', status: 'NEW', role: 'CLIENT', userId: client.user.id });
    expect(JSON.stringify(rows[0])).not.toMatch(/max@example|SECRET|abc123def456/);
    expect(rows[0].route).toBe('/cabinet');
  });

  it('keeps the route without ids, hash and non-allowlisted query', async () => {
    await prisma.browserErrorGroup.deleteMany();
    await report({ message: 'Other failure' }).expect(202);
    expect((await prisma.browserErrorGroup.findFirstOrThrow()).route).toBe('/cabinet/cases/:id?tab=docs');
  });

  it('drops noise and validates the body', async () => {
    await prisma.browserErrorGroup.deleteMany();
    await report({ message: 'ResizeObserver loop completed with undelivered notifications.' }).expect(202);
    expect(await prisma.browserErrorGroup.count()).toBe(0);
    await report({ kind: 'nope' }).expect(400);
    await anon().post('/api/site/client-errors').set('Origin', ORIGIN).send({}).expect(400);
  });

  it('lists groups for admins only; status changes are saved and a regression reopens', async () => {
    await prisma.browserErrorGroup.deleteMany();
    await report({ message: 'Listed error' }).expect(202);
    const staff = await asStaff();
    await staff.agent.get('/api/admin/browser-errors').expect(403);
    const client = await asClient();
    await client.agent.get('/api/admin/browser-errors').expect(403);
    await anon().get('/api/admin/browser-errors').expect(401);

    const admin = await asAdmin();
    const list = (await admin.agent.get('/api/admin/browser-errors').expect(200)).body;
    expect(list.items).toHaveLength(1);
    expect(list.counts).toMatchObject({ NEW: 1, RESOLVED: 0, IGNORED: 0 });
    expect(list.newLast24h).toBe(1);
    expect((await admin.agent.get('/api/admin/browser-errors/summary').expect(200)).body).toEqual({ newLast24h: 1 });

    const id = list.items[0].id as string;
    await admin.agent.patch(`/api/admin/browser-errors/${id}`).send({ status: 'bogus' }).expect(400);
    const done = (await admin.agent.patch(`/api/admin/browser-errors/${id}`).send({ status: 'RESOLVED' }).expect(200)).body.item;
    expect(done.status).toBe('RESOLVED');
    expect((await admin.agent.get('/api/admin/browser-errors/summary').expect(200)).body.newLast24h).toBe(0);
    expect((await admin.agent.get('/api/admin/browser-errors?status=RESOLVED').expect(200)).body.items).toHaveLength(1);

    await report({ message: 'Listed error' }).expect(202);
    expect((await prisma.browserErrorGroup.findUniqueOrThrow({ where: { id } })).status).toBe('NEW');

    await admin.agent.patch(`/api/admin/browser-errors/${id}`).send({ status: 'IGNORED' }).expect(200);
    await report({ message: 'Listed error' }).expect(202);
    expect((await prisma.browserErrorGroup.findUniqueOrThrow({ where: { id } })).status).toBe('IGNORED');
  });

  it('announces new groups once and purges groups not seen for 30 days', async () => {
    await prisma.browserErrorGroup.deleteMany();
    await report({ message: 'Digest error' }).expect(202);
    expect(await runErrorDigest()).toBe(1);
    expect(await runErrorDigest()).toBe(0);

    const old = new Date(Date.now() - 31 * 86_400_000);
    await prisma.browserErrorGroup.updateMany({ data: { lastSeenAt: old, firstSeenAt: old } });
    expect(await purgeOldErrors()).toBe(1);
    expect(await prisma.browserErrorGroup.count()).toBe(0);
  });
});
