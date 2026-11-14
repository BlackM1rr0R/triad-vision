import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';

type Admin = Awaited<ReturnType<typeof asAdmin>>;

const newCase = async (firstName: string, lastName = 'Panelova') => {
  const client = await asClient({ firstName, lastName });
  const c = await createCaseVia(client.agent);
  return { ...c, clientId: client.user.id as string };
};

const assign = async (admin: Admin, caseIds: string[], partnerId: string) =>
  expectStatus(await admin.agent.patch('/api/admin/partners/assign').send({ caseIds, partnerId }), 200);

describe('GET /api/admin/partners/:id/dashboard', () => {
  it('needs a staff session; 404 for an unknown partner', async () => {
    expect((await anon().get('/api/admin/partners/x/dashboard')).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get('/api/admin/partners/x/dashboard')).status).toBe(403);
    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/partners/does-not-exist/dashboard')).status).toBe(404);
  });

  it('cases by status, refusal rate, new clients and commissions per month, quota and activity; revenue for ADMIN+ only', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const partner = expectStatus(await admin.agent.post('/api/admin/partners').send({ name: 'Panel Partner', commissionCents: 10000, clientQuota: 4 }), 201).body.partner as { id: string };

    const a = await newCase('Approved');
    const b = await newCase('Refused');
    const c = await newCase('Running');
    await assign(admin, [a.id, b.id, c.id], partner.id);
    await prisma.case.update({ where: { id: a.id }, data: { status: 'APPROVED' } });
    await prisma.case.update({ where: { id: b.id }, data: { status: 'REJECTED' } });
    await prisma.caseEvent.create({ data: { caseId: a.id, type: 'STATUS_CHANGED', fromStatus: 'DECISION_PENDING', toStatus: 'APPROVED' } });
    // An owned client without a case counts as a client too.
    const owned = await asClient({ firstName: 'Owned', lastName: 'Panelova' });
    await prisma.user.update({ where: { id: owned.user.id }, data: { ownerPartnerId: partner.id, ownerPartnerAt: new Date() } });
    await prisma.partnerActivity.create({ data: { referralPartnerId: partner.id, kind: 'CALL', body: 'Zəng: yeni namizədlər barədə' } });
    await prisma.clientPayment.create({ data: { clientId: a.clientId, caseId: a.id, amountCents: 50000, currency: 'EUR', method: 'BANK', paidAt: new Date() } });
    // A payment of a client with another partner is not counted.
    const foreign = await newCase('Foreign');
    await prisma.clientPayment.create({ data: { clientId: foreign.clientId, caseId: foreign.id, amountCents: 99900, currency: 'EUR', method: 'BANK', paidAt: new Date() } });

    const s = expectStatus(await staff.agent.get(`/api/admin/partners/${partner.id}/dashboard`), 200).body.dashboard;
    expect(s.months).toHaveLength(12);
    expect(s.cases).toEqual({ total: 3, byStatus: { APPROVED: 1, REJECTED: 1, DOCUMENTS_PENDING: 1 } });
    expect(s.refusal).toEqual({ refused: 1, approved: 1, decided: 2, rate: 50 });
    expect(s.clients.total).toBe(4);
    expect(s.clients.newPerMonth[11]).toBe(4);
    expect(s.quota).toEqual({ needed: 4, assigned: 4, remaining: 0, percent: 100, filled: true });
    // Automatic commissions on assign (3 × 100 €) in the current month.
    expect(s.commissions).toMatchObject({ currency: 'EUR', totalCents: 30000 });
    expect(s.commissions.cents[11]).toBe(30000);
    // STAFF do not see client payments.
    expect(s.revenue).toBeNull();
    const kinds = (s.activity as { kind: string }[]).map((x) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(['case', 'status', 'note', 'commission']));
    expect(s.activity.length).toBeLessThanOrEqual(12);

    const full = expectStatus(await admin.agent.get(`/api/admin/partners/${partner.id}/dashboard`), 200).body.dashboard;
    expect(full.revenue).toMatchObject({ currency: 'EUR', totalCents: 50000 });
    expect(full.revenue.cents[11]).toBe(50000);
  });

  it('an empty partner: zeros, no refusal rate, no target', async () => {
    const admin = await asAdmin();
    const p = expectStatus(await admin.agent.post('/api/admin/partners').send({ name: 'Empty Panel' }), 201).body.partner as { id: string };
    const s = expectStatus(await admin.agent.get(`/api/admin/partners/${p.id}/dashboard`), 200).body.dashboard;
    expect(s.cases.total).toBe(0);
    expect(s.refusal.rate).toBeNull();
    expect(s.clients.newPerMonth).toEqual(Array(12).fill(0));
    expect(s.quota.needed).toBeNull();
    expect(s.revenue).toMatchObject({ totalCents: 0 });
    expect(s.activity).toEqual([]);
  });
});
