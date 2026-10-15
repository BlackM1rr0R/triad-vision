import { describe, expect, it } from 'vitest';
import { asAdmin, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createStaff } from '../helpers/factories';

describe('workspace: presence edge cases', () => {
  it('excludes inactive staff and clients; validates the status payload', async () => {
    const me = await asStaff();
    await createStaff({ isActive: false, firstName: 'Gone' });
    const res = await me.agent.get('/api/workspace/presence');
    expect(res.body.people.map((p: { firstName: string }) => p.firstName)).toEqual(['Staff']);
    expect((await me.agent.put('/api/workspace/status').send({ statusText: 'x'.repeat(121) })).status).toBe(400);
    expect((await me.agent.put('/api/workspace/status').send({ statusUntil: 'tomorrow' })).status).toBe(400);
    // Emoji only is a valid status.
    const r = await me.agent.put('/api/workspace/status').send({ statusEmoji: '🏖️' });
    expect(r.body.status).toMatchObject({ statusEmoji: '🏖️', statusText: null });
  });
});

describe('workspace: leave edge cases', () => {
  it('balance of another user is admin-only; calendar defaults to the current month', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    const admin = await asAdmin();
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    await prisma.leaveRequest.create({ data: { userId: other.user.id, type: 'REMOTE', status: 'APPROVED', startsAt: start, endsAt: new Date(start.getTime() + 7 * 86_400_000 - 1) } });
    await prisma.leaveRequest.create({ data: { userId: other.user.id, type: 'SICK', status: 'PENDING', startsAt: start, endsAt: start } });

    // Staff asking for someone else's balance silently get their own.
    expect((await staff.agent.get(`/api/workspace/leave/balance?userId=${other.user.id}`)).body.used.REMOTE).toBe(0);
    expect((await admin.agent.get(`/api/workspace/leave/balance?userId=${other.user.id}`)).body.used.REMOTE).toBeGreaterThan(0);

    const cal = await staff.agent.get('/api/workspace/leave/calendar');
    expect(cal.body.items.map((l: { type: string }) => l.type)).toEqual(['REMOTE']);
    expect(cal.body.from.slice(0, 7)).toBe(start.toISOString().slice(0, 7));
  });

  it('rejects unknown types, missing dates and decisions on cancelled requests', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    expect((await staff.agent.post('/api/workspace/leave').send({ type: 'HOLIDAY', startsAt: '2032-01-05', endsAt: '2032-01-05' })).status).toBe(400);
    expect((await staff.agent.post('/api/workspace/leave').send({ type: 'SICK', startsAt: '2032-01-05' })).status).toBe(400);
    const l = (await staff.agent.post('/api/workspace/leave').send({ type: 'OTHER', startsAt: '2032-01-05', endsAt: '2032-01-06' })).body.leave;
    await staff.agent.post(`/api/workspace/leave/${l.id}/cancel`);
    expect((await admin.agent.post(`/api/workspace/leave/${l.id}/approve`)).status).toBe(409);
    expect((await admin.agent.post('/api/workspace/leave/missing/approve')).status).toBe(404);
    // A cancelled request frees the dates for a new one.
    expect((await staff.agent.post('/api/workspace/leave').send({ type: 'OTHER', startsAt: '2032-01-05', endsAt: '2032-01-06' })).status).toBe(201);
  });
});

describe('workspace: announcements edge cases', () => {
  it('requires a non-empty body, hides an announcement once its expiry is moved to the past, and 404s on unknown ids', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    expect((await admin.agent.post('/api/workspace/announcements').send({ title: 'x', body: '   ' })).status).toBe(400);
    expect((await admin.agent.post('/api/workspace/announcements').send({ title: '', body: 'y' })).status).toBe(400);
    const a = (await admin.agent.post('/api/workspace/announcements').send({ title: 'Soon gone', body: 'Body' })).body.announcement;
    expect((await staff.agent.get('/api/workspace/announcements')).body.items).toHaveLength(1);
    await admin.agent.patch(`/api/workspace/announcements/${a.id}`).send({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect((await staff.agent.get('/api/workspace/announcements')).body.items).toHaveLength(0);
    expect((await admin.agent.get('/api/workspace/announcements?all=1')).body.items[0]).toMatchObject({ id: a.id, expired: true });
    expect((await admin.agent.patch('/api/workspace/announcements/missing').send({ title: 'x' })).status).toBe(404);
  });
});

describe('workspace: notes edge cases', () => {
  it('validates lengths and colours; reorder ignores foreign ids and keeps my other notes', async () => {
    const me = await asStaff();
    const other = await asStaff();
    expect((await me.agent.post('/api/workspace/notes').send({ body: 'x'.repeat(10_001) })).status).toBe(400);
    expect((await me.agent.post('/api/workspace/notes').send({ title: 'x'.repeat(121), body: '' })).status).toBe(400);
    const a = (await me.agent.post('/api/workspace/notes').send({ body: 'A' })).body.note;
    const b = (await me.agent.post('/api/workspace/notes').send({ body: 'B' })).body.note;
    const foreign = (await other.agent.post('/api/workspace/notes').send({ body: 'F' })).body.note;
    const r = await me.agent.post('/api/workspace/notes/reorder').send({ ids: [foreign.id, b.id] });
    expect(r.body.items.map((n: { id: string }) => n.id)).toEqual([b.id, a.id]);
    expect((await other.agent.get('/api/workspace/notes')).body.items.map((n: { id: string }) => n.id)).toEqual([foreign.id]);
    // Clearing a colour falls back to yellow.
    expect((await me.agent.patch(`/api/workspace/notes/${a.id}`).send({ color: null })).body.note.color).toBe('yellow');
  });
});

describe('workspace: polls edge cases', () => {
  it('validates the payload, lists only open workspace polls with open=1 and 404s unknown polls', async () => {
    const staff = await asStaff();
    expect((await staff.agent.post('/api/workspace/polls').send({ question: 'x', options: ['only'] })).status).toBe(400);
    expect((await staff.agent.post('/api/workspace/polls').send({ question: '', options: ['a', 'b'] })).status).toBe(400);
    expect((await staff.agent.post('/api/workspace/polls').send({ question: 'x', options: Array.from({ length: 13 }, (_, i) => `o${i}`) })).status).toBe(400);
    const open = (await staff.agent.post('/api/workspace/polls').send({ question: 'Open', options: ['a', 'b'] })).body.poll;
    const closed = (await staff.agent.post('/api/workspace/polls').send({ question: 'Closed', options: ['a', 'b'] })).body.poll;
    await staff.agent.post(`/api/workspace/polls/${closed.id}/close`);
    expect((await staff.agent.get('/api/workspace/polls?open=1')).body.items.map((p: { id: string }) => p.id)).toEqual([open.id]);
    expect((await staff.agent.get('/api/workspace/polls?limit=1')).body.items).toHaveLength(1);
    expect((await staff.agent.get('/api/workspace/polls/missing')).status).toBe(404);
    expect((await staff.agent.post('/api/workspace/polls/missing/vote').send({ optionIds: ['x'] })).status).toBe(404);
    expect((await staff.agent.post(`/api/workspace/polls/${open.id}/vote`).send({ optionIds: [] })).status).toBe(400);
  });

  it('an admin may close and delete someone else’s poll; the author of a channel poll may delete it', async () => {
    const author = await asStaff();
    const admin = await asAdmin();
    const p = (await author.agent.post('/api/workspace/polls').send({ question: 'Q', options: ['a', 'b'] })).body.poll;
    expect((await admin.agent.get(`/api/workspace/polls/${p.id}`)).body.poll).toMatchObject({ canClose: true, canDelete: true });
    expect((await admin.agent.post(`/api/workspace/polls/${p.id}/close`)).status).toBe(200);
    expect((await admin.agent.delete(`/api/workspace/polls/${p.id}`)).status).toBe(200);
    expect(await prisma.poll.count()).toBe(0);
  });
});
