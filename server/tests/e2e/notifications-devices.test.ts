import { describe, expect, it } from 'vitest';
import { anon, asClient, sessionAgent } from '../helpers/api';
import { prisma } from '../helpers/db';

const notify = (userId: string, title: string, createdAt: Date, readAt: Date | null = null) =>
  prisma.notification.create({ data: { userId, type: 'NEW_MESSAGE', title, body: 'b', createdAt, readAt } });

describe('/api/notifications', () => {
  it('requires a session', async () => {
    expect((await anon().get('/api/notifications')).status).toBe(401);
    expect((await anon().post('/api/notifications/read').send({})).status).toBe(401);
  });

  it('lists only own notifications, newest first, with the unread count', async () => {
    const me = await asClient();
    const other = await asClient();
    expect((await me.agent.get('/api/notifications')).body).toEqual({ items: [], unread: 0 });

    await notify(me.user.id, 'old', new Date('2026-01-01'));
    await notify(me.user.id, 'new', new Date('2026-03-01'));
    await notify(me.user.id, 'read', new Date('2026-02-01'), new Date());
    await notify(other.user.id, 'foreign', new Date('2026-04-01'));

    const res = await me.agent.get('/api/notifications');
    expect(res.status).toBe(200);
    expect(res.body.items.map((n: { title: string }) => n.title)).toEqual(['new', 'read', 'old']);
    expect(res.body.unread).toBe(2);
  });

  it('returns at most 50 items but counts all unread', async () => {
    const me = await asClient();
    await prisma.notification.createMany({
      data: Array.from({ length: 55 }, (_, i) => ({ userId: me.user.id, type: 'X', title: `n${i}`, body: 'b' })),
    });
    const res = await me.agent.get('/api/notifications');
    expect(res.body.items).toHaveLength(50);
    expect(res.body.unread).toBe(55);
  });

  it('marks selected ids as read, never touching other users’ notifications', async () => {
    const me = await asClient();
    const other = await asClient();
    const a = await notify(me.user.id, 'a', new Date());
    const b = await notify(me.user.id, 'b', new Date());
    const foreign = await notify(other.user.id, 'x', new Date());

    const res = await me.agent.post('/api/notifications/read').send({ ids: [a.id, foreign.id] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: a.id } })).readAt).not.toBeNull();
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: b.id } })).readAt).toBeNull();
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: foreign.id } })).readAt).toBeNull();
    expect((await me.agent.get('/api/notifications')).body.unread).toBe(1);
  });

  it('marks all as read without ids and keeps the first read time', async () => {
    const me = await asClient();
    const other = await asClient();
    const firstRead = new Date('2026-01-01T00:00:00Z');
    const already = await notify(me.user.id, 'already', new Date(), firstRead);
    await notify(me.user.id, 'b', new Date());
    await notify(other.user.id, 'x', new Date());

    expect((await me.agent.post('/api/notifications/read').send({})).status).toBe(200);
    expect((await me.agent.get('/api/notifications')).body.unread).toBe(0);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: already.id } })).readAt).toEqual(firstRead);
    expect((await other.agent.get('/api/notifications')).body.unread).toBe(1);
  });

  it('validates ids', async () => {
    const me = await asClient();
    const res = await me.agent.post('/api/notifications/read').send({ ids: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });
});

describe('/api/devices', () => {
  const TOKEN = 'ExponentPushToken[abcdefghijklmnop]';

  it('requires a session', async () => {
    expect((await anon().post('/api/devices').send({ token: TOKEN, platform: 'ios' })).status).toBe(401);
    expect((await anon().delete('/api/devices').send({ token: TOKEN })).status).toBe(401);
  });

  it('registers a device (Bearer auth as used by the app)', async () => {
    const me = await asClient();
    const res = await sessionAgent(me.token, 'bearer').post('/api/devices').send({ token: TOKEN, platform: 'ios' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ device: { id: expect.any(String), platform: 'ios' } });
    expect(await prisma.pushDevice.findUniqueOrThrow({ where: { token: TOKEN } })).toMatchObject({ userId: me.user.id, platform: 'ios' });
  });

  it.each([
    [{ token: 'not-a-token', platform: 'ios' }],
    [{ token: 'ExponentPushToken[]', platform: 'android' }],
    [{ token: TOKEN, platform: 'windows' }],
    [{ platform: 'ios' }],
  ])('rejects %j', async (body) => {
    const me = await asClient();
    const res = await me.agent.post('/api/devices').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
    expect(await prisma.pushDevice.count()).toBe(0);
  });

  it('re-registering is idempotent and moves the phone to whoever logs in', async () => {
    const a = await asClient();
    const b = await asClient();
    await a.agent.post('/api/devices').send({ token: TOKEN, platform: 'ios' });
    await a.agent.post('/api/devices').send({ token: TOKEN, platform: 'ios' });
    expect(await prisma.pushDevice.count()).toBe(1);

    const res = await b.agent.post('/api/devices').send({ token: TOKEN, platform: 'android' });
    expect(res.status).toBe(201);
    expect(await prisma.pushDevice.count()).toBe(1);
    expect(await prisma.pushDevice.findUniqueOrThrow({ where: { token: TOKEN } })).toMatchObject({ userId: b.user.id, platform: 'android' });
  });

  it('deletes only the caller’s own device', async () => {
    const a = await asClient();
    const b = await asClient();
    await a.agent.post('/api/devices').send({ token: TOKEN, platform: 'ios' });

    const foreign = await b.agent.delete('/api/devices').send({ token: TOKEN });
    expect(foreign.status).toBe(200);
    expect(await prisma.pushDevice.count()).toBe(1);

    const own = await a.agent.delete('/api/devices').send({ token: TOKEN });
    expect(own.status).toBe(200);
    expect(own.body).toEqual({ ok: true });
    expect(await prisma.pushDevice.count()).toBe(0);

    expect((await a.agent.delete('/api/devices').send({})).status).toBe(400);
  });
});
