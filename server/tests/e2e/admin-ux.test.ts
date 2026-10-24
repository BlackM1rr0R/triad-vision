import { afterEach, describe, expect, it } from 'vitest';
import { anon, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { resetPresence } from '../../src/lib/presence/viewers.js';

describe('GET/PUT /api/admin/me/dashboard', () => {
  it('needs a staff session; null until saved', async () => {
    expect((await anon().get('/api/admin/me/dashboard')).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get('/api/admin/me/dashboard')).status).toBe(403);
    const staff = await asStaff();
    expect(expectStatus(await staff.agent.get('/api/admin/me/dashboard'), 200).body).toEqual({ layout: null });
  });

  it('saves order, sizes and hidden widgets; duplicates dropped; invalid shapes rejected; null resets', async () => {
    const staff = await asStaff();
    const layout = {
      v: 1,
      items: [
        { id: 'kpis', size: 'L' },
        { id: 'waiting', size: 'S', hidden: false },
        { id: 'recent', size: 'M', hidden: true },
        { id: 'kpis', size: 'S' },
      ],
    };
    const saved = expectStatus(await staff.agent.put('/api/admin/me/dashboard').send({ layout }), 200).body.layout;
    expect(saved).toEqual({
      v: 1,
      items: [
        { id: 'kpis', size: 'L' },
        { id: 'waiting', size: 'S' },
        { id: 'recent', size: 'M', hidden: true },
      ],
    });
    expect(expectStatus(await staff.agent.get('/api/admin/me/dashboard'), 200).body.layout).toEqual(saved);
    // Desk / pins in the same preferences row stay untouched.
    expect(expectStatus(await staff.agent.get('/api/admin/me/nav'), 200).body.pins).toEqual([]);

    expect((await staff.agent.put('/api/admin/me/dashboard').send({ layout: { v: 1, items: [{ id: 'x', size: 'XL' }] } })).status).toBe(400);
    expect((await staff.agent.put('/api/admin/me/dashboard').send({ layout: { v: 1, items: [{ id: '../etc', size: 'S' }] } })).status).toBe(400);
    expect((await staff.agent.put('/api/admin/me/dashboard').send({ layout: { v: 2, items: [] } })).status).toBe(400);
    const many = Array.from({ length: 41 }, (_, i) => ({ id: `w${i}`, size: 'S' }));
    expect((await staff.agent.put('/api/admin/me/dashboard').send({ layout: { v: 1, items: many } })).status).toBe(400);

    expect(expectStatus(await staff.agent.put('/api/admin/me/dashboard').send({ layout: null }), 200).body.layout).toBeNull();
    expect(expectStatus(await staff.agent.get('/api/admin/me/dashboard'), 200).body.layout).toBeNull();
    // Other staff members have their own layout.
    const other = await asStaff();
    expect(expectStatus(await other.agent.get('/api/admin/me/dashboard'), 200).body.layout).toBeNull();
  });
});

describe('presence /api/admin/presence/:kind/:id', () => {
  afterEach(() => resetPresence());

  it('join, heartbeat with editing, list and leave on a case', async () => {
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    expect((await client.agent.post(`/api/admin/presence/case/${c.id}`).send({})).status).toBe(403);

    const a = await asStaff({ firstName: 'Aysel' });
    const b = await asStaff({ firstName: 'Murad' });
    expect(expectStatus(await a.agent.post(`/api/admin/presence/case/${c.id}`).send({}), 200).body.viewers).toEqual([
      expect.objectContaining({ userId: a.user.id, firstName: 'Aysel', editing: null }),
    ]);
    const both = expectStatus(await b.agent.post(`/api/admin/presence/case/${c.id}`).send({ editing: 'details' }), 200).body.viewers;
    expect(both.map((v: { userId: string }) => v.userId)).toEqual([a.user.id, b.user.id]);
    expect(both[1]).toMatchObject({ firstName: 'Murad', editing: 'details' });

    expect(expectStatus(await a.agent.get(`/api/admin/presence/case/${c.id}`), 200).body.viewers).toHaveLength(2);
    expect((await a.agent.post(`/api/admin/presence/case/${c.id}`).send({ editing: '<script>' })).status).toBe(400);

    expect(expectStatus(await b.agent.delete(`/api/admin/presence/case/${c.id}`), 200).body.viewers.map((v: { userId: string }) => v.userId)).toEqual([a.user.id]);
  });

  it('unknown records and kinds are rejected', async () => {
    const staff = await asStaff();
    expect((await staff.agent.post('/api/admin/presence/case/nope').send({})).status).toBe(404);
    expect((await staff.agent.post('/api/admin/presence/user/nope').send({})).status).toBe(400);
    const inq = await prisma.inquiry.create({ data: { kind: 'contact', contactName: 'P', email: 'p@test.local', message: 'hello', locale: 'az' } });
    expect(expectStatus(await staff.agent.post(`/api/admin/presence/inquiry/${inq.id}`).send({}), 200).body.viewers).toHaveLength(1);
  });
});
