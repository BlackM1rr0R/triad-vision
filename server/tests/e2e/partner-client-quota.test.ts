import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';

const newCase = async (firstName: string, lastName: string) => {
  const client = await asClient({ firstName, lastName });
  const res = await client.agent.post('/api/cases').send({ visaType: 'WORK', profession: 'Aşpaz' });
  expect(res.status).toBe(201);
  return { ...(res.body.case as { id: string; number: string }), clientId: client.user.id as string };
};

describe('partner client quota ("needed clients")', () => {
  it('is set on create, edited, validated, and shown with progress in the list, profile and stats', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();

    const created = await admin.agent.post('/api/admin/partners').send({ name: 'Quota Partner', clientQuota: 3 });
    expect(created.status).toBe(201);
    expect(created.body.partner.clientQuota).toBe(3);
    const id = created.body.partner.id as string;

    // Invalid values are refused.
    for (const v of [0, -1, 2.5, 100_001, '3']) expect((await admin.agent.patch(`/api/admin/partners/${id}`).send({ clientQuota: v })).status).toBe(400);

    const other = (await admin.agent.post('/api/admin/partners').send({ name: 'No Target' })).body.partner;
    expect(other.clientQuota).toBeNull();

    // Two clients via cases + one owned client without a case = 3 assigned.
    const a = await newCase('Aysel', 'Quota');
    const b = await newCase('Bəxtiyar', 'Quota');
    expect((await staff.agent.patch('/api/admin/partners/assign').send({ caseIds: [a.id], partnerId: id })).status).toBe(200);

    let list = await staff.agent.get('/api/admin/partners?search=Quota Partner');
    expect(list.body.items[0].quota).toEqual({ needed: 3, assigned: 1, remaining: 2, percent: 33, filled: false });

    // Filters: open (not reached), none (no target), filled.
    const ids = (r: { body: { items: { id: string }[] } }) => r.body.items.map((i) => i.id);
    expect(ids(await staff.agent.get('/api/admin/partners?quota=open'))).toContain(id);
    expect(ids(await staff.agent.get('/api/admin/partners?quota=open'))).not.toContain(other.id);
    expect(ids(await staff.agent.get('/api/admin/partners?quota=none'))).toContain(other.id);
    expect(ids(await staff.agent.get('/api/admin/partners?quota=filled'))).not.toContain(id);
    expect((await staff.agent.get('/api/admin/partners?quota=bogus')).status).toBe(400);

    await staff.agent.patch('/api/admin/partners/assign').send({ caseIds: [b.id], partnerId: id });
    const owned = await asClient({ firstName: 'Cəmilə', lastName: 'Quota' });
    await prisma.user.update({ where: { id: owned.user.id }, data: { ownerPartnerId: id, ownerPartnerAt: new Date() } });

    list = await staff.agent.get('/api/admin/partners?quota=filled');
    const row = list.body.items.find((i: { id: string }) => i.id === id);
    expect(row.quota).toEqual({ needed: 3, assigned: 3, remaining: 0, percent: 100, filled: true });

    const detail = await staff.agent.get(`/api/admin/partners/${id}`);
    expect(detail.body.partner.quota).toMatchObject({ needed: 3, assigned: 3, filled: true });
    const stats = await staff.agent.get(`/api/admin/partners/${id}/stats`);
    expect(stats.body.stats.quota).toMatchObject({ needed: 3, assigned: stats.body.stats.clients.total, filled: true });

    // Sort by clients still missing; clearing the target.
    expect((await staff.agent.get('/api/admin/partners?sort=quota&dir=desc')).status).toBe(200);
    const cleared = await staff.agent.patch(`/api/admin/partners/${id}`).send({ clientQuota: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.partner.clientQuota).toBeNull();
    expect((await staff.agent.get(`/api/admin/partners/${id}`)).body.partner.quota).toMatchObject({ needed: null, assigned: 3, filled: false });
    const audit = await prisma.auditLog.findFirst({ where: { action: 'PARTNER_UPDATED', target: id }, orderBy: { createdAt: 'desc' } });
    expect(JSON.stringify(audit?.details)).toContain('clientQuota');
  });

  it('the "add clients" picker hides applications already linked to the partner', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const p = (await admin.agent.post('/api/admin/partners').send({ name: 'Picker Partner', clientQuota: 5 })).body.partner;
    const q = (await admin.agent.post('/api/admin/partners').send({ name: 'Other Picker' })).body.partner;
    const linked = await newCase('Linked', 'Pickertest');
    const free = await newCase('Free', 'Pickertest');
    const elsewhere = await newCase('Elsewhere', 'Pickertest');
    await staff.agent.patch('/api/admin/partners/assign').send({ caseIds: [linked.id], partnerId: p.id });
    await staff.agent.patch('/api/admin/partners/assign').send({ caseIds: [elsewhere.id], partnerId: q.id });

    const res = await staff.agent.get(`/api/admin/partners/${p.id}/assignable-cases?search=Pickertest`);
    expect(res.status).toBe(200);
    const got = res.body.items.map((c: { id: string }) => c.id);
    expect(got).not.toContain(linked.id);
    expect(got).toContain(free.id);
    // A case of another partner stays listed (moving it is a deliberate choice) and names that partner.
    expect(res.body.items.find((c: { id: string }) => c.id === elsewhere.id).partner).toMatchObject({ id: q.id, name: 'Other Picker' });
    expect(res.body).toMatchObject({ total: 2, linkedCases: 1, quota: { needed: 5, assigned: 1, remaining: 4 } });

    // After adding "free", it disappears from the picker as well.
    await staff.agent.patch('/api/admin/partners/assign').send({ caseIds: [free.id], partnerId: p.id });
    const again = await staff.agent.get(`/api/admin/partners/${p.id}/assignable-cases?search=Pickertest`);
    expect(again.body.items.map((c: { id: string }) => c.id)).toEqual([elsewhere.id]);
    expect(again.body).toMatchObject({ linkedCases: 2, quota: { assigned: 2 } });

    // Search by application number; unknown partner; clients may not use it.
    expect((await staff.agent.get(`/api/admin/partners/${p.id}/assignable-cases?search=${elsewhere.number}`)).body.items).toHaveLength(1);
    expect((await staff.agent.get('/api/admin/partners/nope/assignable-cases')).status).toBe(404);
    expect((await (await asClient()).agent.get(`/api/admin/partners/${p.id}/assignable-cases`)).status).toBe(403);
  });
});
