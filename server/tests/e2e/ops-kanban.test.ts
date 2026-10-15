import { beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { cleanOps } from './ops.fixtures';

beforeEach(cleanOps);

describe('GET /api/admin/ops/kanban', () => {
  it('groups open cases by status with the board figures and supports mine / staff filters', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    const c1 = await asClient({ firstName: 'Ayan', lastName: 'Quliyeva' });
    const c2 = await asClient();
    const mine = await createCaseVia(c1.agent, 'Qaynaqçı');
    const theirs = await createCaseVia(c2.agent);
    await prisma.case.update({ where: { id: mine.id }, data: { assignedStaffId: staff.user.id } });
    await prisma.case.update({ where: { id: theirs.id }, data: { assignedStaffId: other.user.id } });
    // The client wrote last → the ball is with us.
    await prisma.caseMessage.create({ data: { caseId: mine.id, authorId: c1.user.id, body: 'Salam, sənədləri yüklədim' } });

    const res = expectStatus(await staff.agent.get('/api/admin/ops/kanban'), 200);
    expect(res.body.columns.map((c: { status: string }) => c.status)).toContain('DOCUMENTS_PENDING');
    const col = res.body.columns.find((c: { status: string }) => c.status === 'DOCUMENTS_PENDING');
    expect(col.count).toBe(2);
    const card = col.cards.find((c: { id: string }) => c.id === mine.id);
    expect(card).toMatchObject({
      number: mine.number,
      clientName: 'Ayan Quliyeva',
      profession: 'Qaynaqçı',
      assignedStaff: { id: staff.user.id },
      daysInStatus: 0,
      unansweredClientMessage: true,
      waitingFor: 'client',
    });
    expect(typeof card.pendingDocs).toBe('number');
    expect(res.body.staff.map((s: { id: string }) => s.id)).toEqual(expect.arrayContaining([staff.user.id, other.user.id]));
    expect(res.body.total).toBe(2);

    const onlyMine = expectStatus(await staff.agent.get('/api/admin/ops/kanban?mine=true'), 200);
    expect(onlyMine.body.total).toBe(1);
    expect(onlyMine.body.columns.find((c: { status: string }) => c.status === 'DOCUMENTS_PENDING').cards[0].id).toBe(mine.id);

    const byStaff = expectStatus(await staff.agent.get(`/api/admin/ops/kanban?staff=${other.user.id}`), 200);
    expect(byStaff.body.total).toBe(1);
    expect(byStaff.body.columns.find((c: { status: string }) => c.status === 'DOCUMENTS_PENDING').cards[0].id).toBe(theirs.id);
  });

  it('is staff-only', async () => {
    const client = await asClient();
    expect((await client.agent.get('/api/admin/ops/kanban')).status).toBe(403);
  });
});

describe('POST /api/admin/ops/kanban/assign', () => {
  it('reassigns a case, records an event and refuses non-staff targets', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    const client = await asClient();
    const c = await createCaseVia(client.agent);

    expectStatus(await staff.agent.post('/api/admin/ops/kanban/assign').send({ caseId: c.id, staffId: other.user.id }), 200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).assignedStaffId).toBe(other.user.id);
    const ev = await prisma.caseEvent.findFirst({ where: { caseId: c.id, type: 'CASE_UPDATED' }, orderBy: { createdAt: 'desc' } });
    expect(ev?.visibleToClient).toBe(false);

    const bad = await staff.agent.post('/api/admin/ops/kanban/assign').send({ caseId: c.id, staffId: client.user.id });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('INVALID_STAFF');

    expectStatus(await staff.agent.post('/api/admin/ops/kanban/assign').send({ caseId: c.id, staffId: null }), 200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).assignedStaffId).toBeNull();

    expect((await staff.agent.post('/api/admin/ops/kanban/assign').send({ caseId: 'nope', staffId: null })).status).toBe(404);
  });
});

describe('workload and auto-assignment', () => {
  it('GET /workload counts open cases per staff member', async () => {
    const staff = await asStaff();
    const client = await asClient();
    const a = await createCaseVia(client.agent);
    await prisma.case.update({ where: { id: a.id }, data: { assignedStaffId: staff.user.id } });
    const res = expectStatus(await staff.agent.get('/api/admin/ops/workload'), 200);
    const row = res.body.staff.find((s: { id: string }) => s.id === staff.user.id);
    expect(row.open).toBe(1);
    expect(row.waitingForStaff).toBe(0);
    expect(res.body.unassigned).toBe(0);
  });

  it('roundRobin spreads new cases evenly over the configured pool', async () => {
    const admin = await asAdmin();
    const s1 = await asStaff();
    const s2 = await asStaff();
    await asStaff(); // not in the pool
    expectStatus(await admin.agent.put('/api/admin/settings/autoAssign').send({ value: { mode: 'roundRobin', staffIds: [s1.user.id, s2.user.id] } }), 200);

    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const client = await asClient();
      ids.push((await createCaseVia(client.agent)).id);
    }
    const rows = await prisma.case.findMany({ where: { id: { in: ids } }, select: { assignedStaffId: true } });
    const count = (id: string) => rows.filter((r) => r.assignedStaffId === id).length;
    expect(count(s1.user.id)).toBe(2);
    expect(count(s2.user.id)).toBe(2);
  });

  it('leastLoaded picks the staff member with the fewest open cases', async () => {
    const admin = await asAdmin();
    const s1 = await asStaff();
    const s2 = await asStaff();
    expectStatus(await admin.agent.put('/api/admin/settings/autoAssign').send({ value: { mode: 'leastLoaded', staffIds: [s1.user.id, s2.user.id] } }), 200);
    // s1 already carries two open cases.
    for (let i = 0; i < 2; i++) {
      const c = await createCaseVia((await asClient()).agent);
      await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: s1.user.id } });
    }
    const fresh: string[] = [];
    for (let i = 0; i < 2; i++) fresh.push((await createCaseVia((await asClient()).agent)).id);
    const rows = await prisma.case.findMany({ where: { id: { in: fresh } }, select: { assignedStaffId: true } });
    expect(rows.every((r) => r.assignedStaffId === s2.user.id)).toBe(true);

    // Now balanced (2:2) → the next one goes to whoever sorts first with equal load; both are acceptable.
    const next = await createCaseVia((await asClient()).agent);
    const row = await prisma.case.findUniqueOrThrow({ where: { id: next.id } });
    expect([s1.user.id, s2.user.id]).toContain(row.assignedStaffId);
  });

  it('mode off leaves new cases unassigned', async () => {
    const admin = await asAdmin();
    await asStaff();
    expectStatus(await admin.agent.put('/api/admin/settings/autoAssign').send({ value: { mode: 'off' } }), 200);
    const c = await createCaseVia((await asClient()).agent);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).assignedStaffId).toBeNull();
  });
});
