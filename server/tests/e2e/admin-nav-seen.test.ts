import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';

describe('sidebar badges "new since last opened" (users, cases)', () => {
  it('needs a staff session', async () => {
    expect((await anon().get('/api/admin/users/new-count')).status).toBe(401);
    expect((await anon().post('/api/admin/users/seen')).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get('/api/admin/users/new-count')).status).toBe(403);
    expect((await client.agent.post('/api/admin/cases/seen')).status).toBe(403);
  });

  it('counts new client registrations until the users page is opened (POST /seen), never from a GET', async () => {
    const admin = await asAdmin();
    await asClient();
    await asClient();
    const before = expectStatus(await admin.agent.get('/api/admin/users/new-count'), 200).body.count as number;
    expect(before).toBeGreaterThanOrEqual(2);
    // GET does not mark anything
    expect(expectStatus(await admin.agent.get('/api/admin/users/new-count'), 200).body.count).toBe(before);
    expectStatus(await admin.agent.post('/api/admin/users/seen'), 200);
    expect(expectStatus(await admin.agent.get('/api/admin/users/new-count'), 200).body.count).toBe(0);
    await asClient();
    expect(expectStatus(await admin.agent.get('/api/admin/users/new-count'), 200).body.count).toBe(1);
    // The mark is per staff member
    const other = await asAdmin();
    expect(expectStatus(await other.agent.get('/api/admin/users/new-count'), 200).body.count).toBeGreaterThanOrEqual(1);
  });

  it('counts a brand-new case on the Müraciətlər badge until the cases list is opened; no double count with "waits for staff"', async () => {
    const admin = await asAdmin();
    expectStatus(await admin.agent.post('/api/admin/cases/seen'), 200);
    expect(expectStatus(await admin.agent.get('/api/admin/cases/attention-count'), 200).body.count).toBe(0);

    const client = await asClient();
    const c = await createCaseVia(client.agent);
    expect(expectStatus(await admin.agent.get('/api/admin/cases/attention-count'), 200).body.count).toBe(1);
    // Waiting for staff action as well: still one case
    await prisma.case.update({ where: { id: c.id }, data: { status: 'DOCUMENTS_REVIEW' } });
    await prisma.document.updateMany({ where: { caseId: c.id }, data: { status: 'PENDING' } });
    expect(expectStatus(await admin.agent.get('/api/admin/cases/attention-count'), 200).body.count).toBeLessThanOrEqual(1);

    expectStatus(await admin.agent.post('/api/admin/cases/seen'), 200);
    expect(expectStatus(await admin.agent.get('/api/admin/cases/attention-count'), 200).body.count).toBeLessThanOrEqual(1);
    await prisma.case.update({ where: { id: c.id }, data: { status: 'DOCUMENTS_PENDING' } });
    expect(expectStatus(await admin.agent.get('/api/admin/cases/attention-count'), 200).body.count).toBe(0);
  });
});
