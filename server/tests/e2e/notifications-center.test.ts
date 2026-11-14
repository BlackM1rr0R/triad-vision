import { describe, expect, it } from 'vitest';
import { anon, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';

/**
 * Notification center (routes/notifications.ts): keyset paging, category / unread filters, the per-category
 * summary, "mark all read" of one category and mark-unread — always limited to the caller's own rows.
 */

const at = (min: number) => new Date(Date.UTC(2026, 10, 14, 8, min));
const make = (userId: string, type: string, title: string, minute: number, read = false) =>
  prisma.notification.create({ data: { userId, type, title, body: 'b', createdAt: at(minute), readAt: read ? at(minute + 1) : null } });

describe('notification center', () => {
  it('pages newest first with a cursor and tags every item with its category', async () => {
    const me = await asStaff();
    for (let i = 0; i < 5; i++) await make(me.user.id, i % 2 ? 'TASK_ASSIGNED' : 'DOCUMENT_REJECTED', `n${i}`, i);

    const p1 = await me.agent.get('/api/notifications').query({ limit: 2 });
    expect(p1.status).toBe(200);
    expect(p1.body.items.map((n: { title: string }) => n.title)).toEqual(['n4', 'n3']);
    expect(p1.body.items.map((n: { category: string }) => n.category)).toEqual(['document', 'task']);
    expect(p1.body.unread).toBe(5);
    expect(p1.body.nextCursor).toBe(p1.body.items[1].id);

    const p2 = await me.agent.get('/api/notifications').query({ limit: 2, cursor: p1.body.nextCursor });
    expect(p2.body.items.map((n: { title: string }) => n.title)).toEqual(['n2', 'n1']);
    const p3 = await me.agent.get('/api/notifications').query({ limit: 2, cursor: p2.body.nextCursor });
    expect(p3.body.items.map((n: { title: string }) => n.title)).toEqual(['n0']);
    expect(p3.body.nextCursor).toBeNull();
  });

  it('keeps the order stable for notifications created at the same moment', async () => {
    const me = await asClient();
    for (let i = 0; i < 4; i++) await make(me.user.id, 'NEW_MESSAGE', `same${i}`, 30);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await me.agent.get('/api/notifications').query({ limit: 1, ...(cursor ? { cursor } : {}) });
      seen.push(...res.body.items.map((n: { id: string }) => n.id));
      cursor = res.body.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(4);
  });

  it('filters by category and unread, and rejects a foreign cursor', async () => {
    const me = await asStaff();
    const other = await asStaff();
    await make(me.user.id, 'NEW_MESSAGE', 'msg', 1);
    await make(me.user.id, 'STAFF_MESSAGE', 'msg-read', 2, true);
    await make(me.user.id, 'APPROVED', 'case', 3);
    await make(me.user.id, 'SECURITY_ALERT', 'sys', 4);
    await make(me.user.id, 'PARTNER_COMMISSION_PAID', 'money', 5);
    const foreign = await make(other.user.id, 'NEW_MESSAGE', 'foreign', 6);

    const titles = async (query: Record<string, string>) => (await me.agent.get('/api/notifications').query(query)).body.items.map((n: { title: string }) => n.title);
    expect(await titles({ category: 'message' })).toEqual(['msg-read', 'msg']);
    expect(await titles({ category: 'message', unread: '1' })).toEqual(['msg']);
    expect(await titles({ category: 'case' })).toEqual(['case']);
    expect(await titles({ category: 'finance' })).toEqual(['money']);
    expect(await titles({ category: 'system' })).toEqual(['sys']);
    expect(await titles({ unread: 'true' })).toEqual(['money', 'sys', 'case', 'msg']);

    expect((await me.agent.get('/api/notifications').query({ cursor: foreign.id })).status).toBe(400);
    expect((await me.agent.get('/api/notifications').query({ category: 'nope' })).status).toBe(400);
    expect((await me.agent.get('/api/notifications').query({ limit: 500 })).status).toBe(400);
  });

  it('summarises totals and unread per category', async () => {
    const me = await asClient();
    await make(me.user.id, 'DOCUMENT_ACCEPTED', 'a', 1);
    await make(me.user.id, 'DOCUMENT_REJECTED', 'b', 2, true);
    await make(me.user.id, 'NEW_MESSAGE', 'c', 3);
    await make(me.user.id, 'CAMPAIGN', 'd', 4);
    const res = await me.agent.get('/api/notifications/summary');
    expect(res.status).toBe(200);
    expect(res.body.unread).toBe(3);
    expect(res.body.total).toBe(4);
    const byKey = Object.fromEntries(res.body.categories.map((c: { key: string; total: number; unread: number }) => [c.key, [c.total, c.unread]]));
    expect(byKey).toEqual({ case: [0, 0], document: [2, 1], message: [1, 1], task: [0, 0], finance: [0, 0], system: [1, 1] });
  });

  it('marks one category read, and single items unread again (own rows only)', async () => {
    const me = await asStaff();
    const other = await asStaff();
    const doc = await make(me.user.id, 'DOCUMENT_REJECTED', 'doc', 1);
    const msg = await make(me.user.id, 'NEW_MESSAGE', 'msg', 2);
    const foreign = await make(other.user.id, 'DOCUMENT_REJECTED', 'x', 3, true);

    expect((await me.agent.post('/api/notifications/read').send({ category: 'document' })).status).toBe(200);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: doc.id } })).readAt).not.toBeNull();
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: msg.id } })).readAt).toBeNull();

    expect((await me.agent.post('/api/notifications/unread').send({ ids: [doc.id, foreign.id] })).status).toBe(200);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: doc.id } })).readAt).toBeNull();
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: foreign.id } })).readAt).not.toBeNull();
    expect((await me.agent.get('/api/notifications/summary')).body.unread).toBe(2);

    expect((await me.agent.post('/api/notifications/unread').send({ ids: [] })).status).toBe(400);
    expect((await anon().post('/api/notifications/unread').send({ ids: [doc.id] })).status).toBe(401);
    expect((await anon().get('/api/notifications/summary')).status).toBe(401);
  });
});
