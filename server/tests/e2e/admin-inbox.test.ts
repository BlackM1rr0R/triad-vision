import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { createCaseVia, expectStatus } from '../helpers/workflow';

/**
 * Staff message inbox (GET /api/admin/inbox, the phone "Mesajlar" tab): threads awaiting the team's answer first,
 * scope like "my work" (STAFF: own cases, ADMIN+: own + unassigned, scope=all ADMIN+ only), unread client messages.
 */

interface InboxItem {
  caseId: string;
  number: string;
  awaitingReply: boolean;
  waitingCount: number;
  unread: number;
  since: string | null;
  lastMessage: { excerpt: string; fromClient: boolean };
}
interface InboxResponse {
  items: InboxItem[];
  counts: { awaiting: number; unread: number };
  scope: string;
}

const MIN = 60 * 1000;

describe('admin inbox', () => {
  it('lists own threads, awaiting ones first, with unread counts; scope=all for admins only', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    const admin = await asAdmin();
    const p = uniq('Inbox');
    const clientA = await asClient({ firstName: 'Aysel' });
    const clientB = await asClient({ firstName: 'Bəxtiyar' });
    const clientC = await asClient({ firstName: 'Cavid' });
    const a = await createCaseVia(clientA.agent, p);
    const b = await createCaseVia(clientB.agent, p);
    const c = await createCaseVia(clientC.agent, p);
    await prisma.case.update({ where: { id: a.id }, data: { assignedStaffId: staff.user.id } });
    await prisma.case.update({ where: { id: b.id }, data: { assignedStaffId: staff.user.id } });
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: other.user.id } });

    const now = Date.now();
    // a: client wrote twice, nobody answered → awaiting (2), unread 2
    await prisma.caseMessage.createMany({
      data: [
        { caseId: a.id, authorId: clientA.user.id, body: 'Salam, sualım var', createdAt: new Date(now - 60 * MIN) },
        { caseId: a.id, authorId: clientA.user.id, body: 'Cavab gözləyirəm', createdAt: new Date(now - 30 * MIN) },
      ],
    });
    // b: client wrote, staff answered → not awaiting; the client message was read
    await prisma.caseMessage.createMany({
      data: [
        { caseId: b.id, authorId: clientB.user.id, body: 'Sənəd yüklədim', createdAt: new Date(now - 50 * MIN), readAt: new Date(now - 45 * MIN) },
        { caseId: b.id, authorId: staff.user.id, body: 'Təşəkkürlər, yoxlayırıq', createdAt: new Date(now - 40 * MIN) },
      ],
    });
    // c: someone else's case, awaiting
    await prisma.caseMessage.create({ data: { caseId: c.id, authorId: clientC.user.id, body: 'Başqa işçinin müştərisi', createdAt: new Date(now - 20 * MIN) } });

    const mine = expectStatus(await staff.agent.get('/api/admin/inbox'), 200).body as InboxResponse;
    const ours = mine.items.filter((i) => [a.id, b.id, c.id].includes(i.caseId));
    expect(ours.map((i) => i.caseId)).toEqual([a.id, b.id]);
    expect(ours[0]).toMatchObject({ awaitingReply: true, waitingCount: 2, unread: 2, lastMessage: { excerpt: 'Cavab gözləyirəm', fromClient: true } });
    expect(ours[0].since).not.toBeNull();
    expect(ours[1]).toMatchObject({ awaitingReply: false, waitingCount: 0, unread: 0, since: null, lastMessage: { fromClient: false } });
    expect(mine.counts.awaiting).toBeGreaterThanOrEqual(1);

    const awaitingOnly = expectStatus(await staff.agent.get('/api/admin/inbox').query({ filter: 'awaiting' }), 200).body as InboxResponse;
    expect(awaitingOnly.items.map((i) => i.caseId)).toContain(a.id);
    expect(awaitingOnly.items.map((i) => i.caseId)).not.toContain(b.id);

    expect((await staff.agent.get('/api/admin/inbox').query({ scope: 'all' })).status).toBe(403);
    const team = expectStatus(await admin.agent.get('/api/admin/inbox').query({ scope: 'all' }), 200).body as InboxResponse;
    expect(team.items.map((i) => i.caseId)).toEqual(expect.arrayContaining([a.id, b.id, c.id]));
    // the admin's own view: assigned to them or unassigned — none of these three
    const adminMine = expectStatus(await admin.agent.get('/api/admin/inbox'), 200).body as InboxResponse;
    expect(adminMine.items.map((i) => i.caseId)).not.toContain(c.id);

    // staff answer → a leaves the awaiting group; marking read clears the unread count
    expectStatus(await staff.agent.post(`/api/admin/cases/${a.id}/messages`).send({ body: 'Buyurun, dinləyirəm' }), 201);
    expectStatus(await staff.agent.post(`/api/admin/cases/${a.id}/messages/read`), 200);
    const after = expectStatus(await staff.agent.get('/api/admin/inbox'), 200).body as InboxResponse;
    expect(after.items.find((i) => i.caseId === a.id)).toMatchObject({ awaitingReply: false, unread: 0, lastMessage: { fromClient: false } });

    // closed cases drop out
    await prisma.case.update({ where: { id: b.id }, data: { status: 'CANCELLED', closedAt: new Date() } });
    const closed = expectStatus(await staff.agent.get('/api/admin/inbox'), 200).body as InboxResponse;
    expect(closed.items.map((i) => i.caseId)).not.toContain(b.id);
  });

  it('is staff-only and validates the query', async () => {
    const client = await asClient();
    expect((await client.agent.get('/api/admin/inbox')).status).toBe(403);
    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/inbox').query({ filter: 'spam' })).status).toBe(400);
  });
});
