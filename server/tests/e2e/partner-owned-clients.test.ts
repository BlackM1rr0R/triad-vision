import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asStaff, ORIGIN, sessionAgent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { driveCaseTo, expectStatus } from '../helpers/workflow';
import { issueSession } from '../../src/middleware/auth.js';
import { createCase } from '../../src/lib/caseFlow.js';

// Partner-owned clients (lib/partners/owned.ts): a referral partner's sign-up code makes the client the
// partner's for good — every case gets the partner, the commission follows, the partner sees the client.

let seq = 0;
const register = (code: string, extra: Record<string, unknown> = {}) => {
  seq++;
  return anon()
    .post('/api/auth/register')
    .set('Origin', ORIGIN)
    .send({
      email: `po${Date.now()}${seq}@test.local`,
      password: 'Password123',
      firstName: `Nigar${seq}`,
      lastName: 'Əliyeva',
      phone: `+994 50 ${String(300 + seq).padStart(3, '0')} 44 ${String(10 + seq).slice(-2)}`,
      birthDate: '1993-03-02',
      passportNumber: `C${String(30000000 + seq * 7919)}`,
      ref: code,
      ...extra,
    });
};

/** A partner created through the admin API (gets a code) with a portal login (AGENT user). */
const partnerWithLogin = async (admin: Awaited<ReturnType<typeof asAdmin>>, name: string, data: Record<string, unknown> = {}) => {
  const created = expectStatus(await admin.agent.post('/api/admin/partners').send({ name, commissionCents: 15000, ...data }), 201).body.partner;
  const login = await createUser({ role: 'AGENT', firstName: name, lastName: 'Partner', locale: 'en' });
  await prisma.referralPartner.update({ where: { id: created.id }, data: { userId: login.user.id } });
  return { partner: created as { id: string; code: string }, user: login.user, agent: sessionAgent(login.token) };
};

const clientAgent = async (userId: string) => sessionAgent((await issueSession(userId, { client: 'web' })).token);

describe('partner-owned clients: sign-up link → cases → portal → commission', () => {
  it('attributes the client for good, links every case, lets the partner follow and creates the commission', async () => {
    const admin = await asAdmin();
    const p = await partnerWithLogin(admin, 'Ilqar Mammadov');
    expect(p.partner.code).toBe('ILQAR-M');

    // The live check names the partner (for the data-sharing checkbox).
    const check = expectStatus(await anon().get('/api/auth/referral-code').query({ code: 'ilqar-m' }), 200).body;
    expect(check).toEqual({ code: 'ILQAR-M', valid: true, kind: 'PARTNER', partnerName: 'Ilqar Mammadov' });

    const res = expectStatus(await register(p.partner.code, { partnerConsent: true, refEntered: true }), 201);
    const userId = res.body.user.id as string;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.ownerPartnerId).toBe(p.partner.id);
    expect(user.referredByAgentId).toBeNull();
    // A partner code wins: no client-referral row either.
    expect(await prisma.clientReferral.count({ where: { referredId: userId } })).toBe(0);
    expect(await prisma.partnerClientChange.findFirst({ where: { userId } })).toMatchObject({ toPartnerId: p.partner.id, source: 'SIGNUP_LINK' });
    expect(await prisma.consentRecord.findFirst({ where: { userId, type: 'PARTNER_SHARING' } })).toMatchObject({ granted: true, source: 'REGISTER' });
    await waitFor(() => prisma.notification.findFirst({ where: { userId: p.user.id, type: 'PARTNER_NEW_CLIENT' } }));

    // The client's own case belongs to the partner; the default commission is created at once.
    const client = await clientAgent(userId);
    const c = expectStatus(await client.post('/api/cases').send({ visaType: 'WORK', profession: 'Aşpaz' }), 201).body.case;
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).partnerId).toBe(p.partner.id);
    expect(await prisma.partnerCommission.findFirst({ where: { partnerId: p.partner.id, caseId: c.id } })).toMatchObject({ status: 'PENDING', amountCents: 15000 });
    await waitFor(() => prisma.notification.findFirst({ where: { userId: p.user.id, type: 'PARTNER_NEW_CASE' } }));

    // A family member's case inherits the partner.
    const member = await createCase(userId, { profession: 'Familiennachzug', parentCaseId: c.id, relation: 'spouse', actorId: admin.user.id });
    expect(member.partnerId).toBe(p.partner.id);

    // The partner's client list: minimal by default (no contacts) …
    let list = expectStatus(await p.agent.get('/api/partner/clients'), 200).body;
    let row = list.items.find((x: { id: string }) => x.id === userId);
    expect(row).toMatchObject({ owned: true, consent: true, extended: false, contact: null, payment: { state: 'NONE' }, latestCase: { status: 'DOCUMENTS_PENDING', nextAction: 'UPLOAD_DOCUMENTS' } });
    expect(JSON.stringify(list)).not.toContain(user.email);
    // … extended once the admin allows it (the client consented at sign-up).
    expectStatus(await (await asStaff()).agent.patch(`/api/admin/partners/${p.partner.id}`).send({ visibility: 'EXTENDED' }), 403);
    expectStatus(await admin.agent.patch(`/api/admin/partners/${p.partner.id}`).send({ visibility: 'EXTENDED' }), 200);
    list = expectStatus(await p.agent.get('/api/partner/clients'), 200).body;
    row = list.items.find((x: { id: string }) => x.id === userId);
    expect(row).toMatchObject({ extended: true, contact: { email: user.email } });
    // Withdrawing the consent hides the contacts again.
    expect(expectStatus(await client.get('/api/partner-sharing'), 200).body).toEqual({ partner: { name: 'Ilqar Mammadov' }, granted: true });
    expectStatus(await client.post('/api/partner-sharing').send({ granted: false }), 200);
    row = expectStatus(await p.agent.get('/api/partner/clients'), 200).body.items.find((x: { id: string }) => x.id === userId);
    expect(row).toMatchObject({ extended: false, contact: null, consent: false });

    // Admin filter by partner.
    const users = expectStatus(await admin.agent.get('/api/admin/users').query({ role: 'CLIENT', ownerPartnerId: p.partner.id }), 200).body.users;
    expect(users.map((u: { id: string }) => u.id)).toEqual([userId]);
    expect(users[0].ownerPartner).toEqual({ id: p.partner.id, name: 'Ilqar Mammadov' });
  });

  it('lets the partner register a client (invitation e-mail) and only admins reassign, with history', async () => {
    const admin = await asAdmin();
    const p = await partnerWithLogin(admin, 'Envar Huseynov');
    const other = await partnerWithLogin(admin, 'Kamal Rzayev');
    const email = `pc${Date.now()}@test.local`;
    const body = { firstName: 'Orxan', lastName: 'Quliyev', email, phone: '+994 55 111 22 33', locale: 'en' };
    expectStatus(await p.agent.post('/api/partner/clients').send(body), 400); // clientAgreed is required
    const res = expectStatus(await p.agent.post('/api/partner/clients').send({ ...body, clientAgreed: true }), 201);
    const userId = res.body.client.id as string;
    expect(res.body.client).toMatchObject({ owned: true, activated: false, consent: null });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).ownerPartnerId).toBe(p.partner.id);
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: email, subject: 'Triad Vision · Your Triad Vision account was created' } }));
    expectStatus(await p.agent.post('/api/partner/clients').send({ ...body, clientAgreed: true }), 409);
    expectStatus(await p.agent.post(`/api/partner/clients/${userId}/invite`), 200);
    expectStatus(await other.agent.post(`/api/partner/clients/${userId}/invite`), 404);

    const c = await createCase(userId, { profession: 'Sürücü', actorId: admin.user.id });
    expect(c.partnerId).toBe(p.partner.id);

    expectStatus(await (await asStaff()).agent.patch(`/api/admin/partners/clients/${userId}/owner`).send({ partnerId: other.partner.id }), 403);
    expectStatus(await admin.agent.patch(`/api/admin/partners/clients/${userId}/owner`).send({ partnerId: other.partner.id, note: 'Müştəri xahiş etdi' }), 200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).partnerId).toBe(other.partner.id);
    // The old partner's pending commission is cancelled, the new one gets theirs.
    expect((await prisma.partnerCommission.findFirstOrThrow({ where: { partnerId: p.partner.id, caseId: c.id } })).status).toBe('CANCELLED');
    expect((await prisma.partnerCommission.findFirstOrThrow({ where: { partnerId: other.partner.id, caseId: c.id } })).status).toBe('PENDING');
    const owner = expectStatus(await admin.agent.get(`/api/admin/partners/clients/${userId}/owner`), 200).body;
    expect(owner.owner).toMatchObject({ id: other.partner.id });
    expect(owner.history.map((h: { source: string }) => h.source)).toEqual(['ADMIN', 'PARTNER_PORTAL']);
    expect(await prisma.auditLog.count({ where: { action: 'PARTNER_CLIENT_OWNER_CHANGED' } })).toBe(1);
    // The previous partner no longer lists the client.
    expect(expectStatus(await p.agent.get('/api/partner/clients'), 200).body.items).toEqual([]);
  });

  it('creates the commission only when the case reaches the partner’s trigger', async () => {
    const admin = await asAdmin();
    const p = await partnerWithLogin(admin, 'Rashad Valiyev', { commissionTrigger: 'VISA_APPROVED' });
    const res = expectStatus(await register(p.partner.code), 201);
    const userId = res.body.user.id as string;
    const client = await clientAgent(userId);
    const c = await driveCaseTo('DECISION_PENDING', { client, admin: admin.agent });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).partnerId).toBe(p.partner.id);
    expect(await prisma.partnerCommission.count({ where: { partnerId: p.partner.id } })).toBe(0);
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/actions`).send({ action: 'DECIDE', decision: 'APPROVED' }), 200);
    const row = await waitFor(() => prisma.partnerCommission.findFirst({ where: { partnerId: p.partner.id, caseId: c.id } }));
    expect(row).toMatchObject({ status: 'PENDING', amountCents: 15000 });
    await waitFor(() => prisma.notification.findFirst({ where: { userId: p.user.id, type: 'PARTNER_COMMISSION_EARNED' } }));
  });
});
