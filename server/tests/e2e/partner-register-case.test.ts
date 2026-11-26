import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, sessionAgent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createUser, uniq } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';

// A referral partner registers a client for a vacancy (POST /partner/clients/:id/cases and vacancyId on POST /partner/clients).

const text = { az: 'x', de: 'x', en: 'x', ru: 'x' };
const vacancy = (over: Record<string, unknown> = {}) =>
  prisma.vacancy.create({ data: { slug: uniq('job-'), title: text, description: text, city: 'Berlin', status: 'OPEN', positions: 5, publishedAt: new Date(), ...over } });

const partnerWithLogin = async (admin: Awaited<ReturnType<typeof asAdmin>>, name: string, data: Record<string, unknown> = {}) => {
  const created = expectStatus(await admin.agent.post('/api/admin/partners').send({ name, commissionCents: 10000, ...data }), 201).body.partner;
  const login = await createUser({ role: 'AGENT', firstName: name, lastName: 'Partner', locale: 'en' });
  await prisma.referralPartner.update({ where: { id: created.id }, data: { userId: login.user.id } });
  return { partner: created as { id: string }, agent: sessionAgent(login.token) };
};

let n = 0;
const newClient = (agent: ReturnType<typeof sessionAgent>, extra: Record<string, unknown> = {}) => {
  n++;
  return agent.post('/api/partner/clients').send({
    firstName: 'Nigar',
    lastName: `Əliyeva${n}`,
    email: `reg${Date.now()}${n}@test.local`,
    phone: `+994 50 ${String(400 + n).padStart(3, '0')} 44 55`,
    clientAgreed: true,
    ...extra,
  });
};

describe('partner registers a client for a vacancy', () => {
  it('creates the case for an own client (unverified e-mail is fine), staff are notified, one active application only', async () => {
    const admin = await asAdmin();
    const p = await partnerWithLogin(admin, 'Referrer One', { isReferrer: true });
    const v = await vacancy();
    const client = expectStatus(await newClient(p.agent), 201).body.client as { id: string };

    const res = expectStatus(await p.agent.post(`/api/partner/clients/${client.id}/cases`).send({ vacancyId: v.id }), 201).body.case;
    const row = await prisma.case.findUniqueOrThrow({ where: { id: res.id } });
    expect(row).toMatchObject({ clientId: client.id, partnerId: p.partner.id, vacancyId: v.id });
    expect(await prisma.auditLog.findFirst({ where: { action: 'PARTNER_CASE_REGISTERED', target: `case:${res.id}` } })).not.toBeNull();
    await waitFor(() => prisma.notification.findFirst({ where: { link: `/admin/cases/${res.id}` } }));

    // The second active application is refused.
    const again = await p.agent.post(`/api/partner/clients/${client.id}/cases`).send({ vacancyId: (await vacancy()).id });
    expect(expectStatus(again, 409).body.error).toBe('ACTIVE_CASE_EXISTS');
  });

  it('creates user and case in one go with vacancyId; a closed vacancy is refused before the account exists', async () => {
    const admin = await asAdmin();
    const p = await partnerWithLogin(admin, 'Referrer Two', { isReferrer: true });
    const open = await vacancy();
    const ok = expectStatus(await newClient(p.agent, { vacancyId: open.id }), 201).body;
    expect(ok.caseId).toBeTruthy();
    expect(ok.caseError).toBeNull();

    const closed = await vacancy({ status: 'CLOSED' });
    const email = `closed${Date.now()}@test.local`;
    const res = await newClient(p.agent, { vacancyId: closed.id, email });
    expect(expectStatus(res, 409).body.error).toBe('VACANCY_CLOSED');
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it('refuses an inactive vacancy and a full one for an existing client', async () => {
    const admin = await asAdmin();
    const p = await partnerWithLogin(admin, 'Referrer Three');
    const client = expectStatus(await newClient(p.agent), 201).body.client as { id: string };
    const closed = await vacancy({ status: 'CLOSED' });
    expect(expectStatus(await p.agent.post(`/api/partner/clients/${client.id}/cases`).send({ vacancyId: closed.id }), 409).body.error).toBe('VACANCY_CLOSED');
    const full = await vacancy({ positions: 1, filledAdjustment: 1 });
    expect(expectStatus(await p.agent.post(`/api/partner/clients/${client.id}/cases`).send({ vacancyId: full.id }), 409).body.error).toBe('VACANCY_FULL');
    expect(await prisma.case.count({ where: { clientId: client.id } })).toBe(0);
  });

  it('another partner client is 404; a client role cannot call it; without addClients it is 403', async () => {
    const admin = await asAdmin();
    const a = await partnerWithLogin(admin, 'Referrer A');
    const b = await partnerWithLogin(admin, 'Referrer B');
    const v = await vacancy();
    const client = expectStatus(await newClient(a.agent), 201).body.client as { id: string };

    expect(expectStatus(await b.agent.post(`/api/partner/clients/${client.id}/cases`).send({ vacancyId: v.id }), 404).body.error).toBe('CLIENT_NOT_FOUND');
    expect(await prisma.case.count({ where: { clientId: client.id } })).toBe(0);

    const c = await asClient();
    expect((await c.agent.post(`/api/partner/clients/${client.id}/cases`).send({ vacancyId: v.id })).status).toBe(403);

    const perms = { clientList: 'masked', caseStage: true, documents: 'none', payments: true, addClients: false, messaging: false, vacancies: true, drive: 'none' };
    await prisma.partnerAccess.upsert({
      where: { partnerId: a.partner.id },
      create: { partnerId: a.partner.id, template: 'CUSTOM', perms },
      update: { template: 'CUSTOM', perms },
    });
    expect(expectStatus(await a.agent.post(`/api/partner/clients/${client.id}/cases`).send({ vacancyId: v.id }), 403).body.error).toBe('PARTNER_PERMISSION_DENIED');
  });

  it('shows invoiced / paid / outstanding per client in the portal list and the admin partner detail', async () => {
    const admin = await asAdmin();
    const p = await partnerWithLogin(admin, 'Referrer Pay');
    const client = expectStatus(await newClient(p.agent), 201).body.client as { id: string };
    await prisma.clientInvoice.create({
      data: { clientId: client.id, number: uniq('INV-').slice(0, 32), status: 'SENT', issueDate: new Date(), dueDate: new Date(Date.now() + 864e5), items: [], netCents: 100000, vatCents: 0, grossCents: 100000, paidCents: 40000 },
    });
    const row = expectStatus(await p.agent.get('/api/partner/clients'), 200).body.items.find((i: { id: string }) => i.id === client.id);
    expect(row.payment).toMatchObject({ totalCents: 100000, paidCents: 40000, outstandingCents: 60000 });
    const detail = expectStatus(await admin.agent.get(`/api/admin/partners/${p.partner.id}`), 200).body;
    expect(detail.clientPayments[client.id]).toMatchObject({ invoicedCents: 100000, paidCents: 40000, outstandingCents: 60000 });
  });
});
