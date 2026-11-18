import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, uniq } from '../helpers/factories';
import { clientCase, createCaseVia, expectStatus, uploadDoc } from '../helpers/workflow';

/**
 * Regression tests of the staff QA findings (Drive, partner assignment, bulk, cases list, inquiries, reveal, reset
 * password): B-2, B-4, B-5, B-6, C-2, C-5 and the reset-password refusal of deactivated accounts.
 */

const restrict = (sup: Agent, userId: string, caseScope: 'ASSIGNED' | 'ALL') => sup.put(`/api/admin/access/scope/users/${userId}`).send({ caseScope });

/** A client with a case and one uploaded document; optionally assigned to a staff member. */
const clientWithCase = async (lastName: string, assignedStaffId?: string) => {
  const client = await asClient({ lastName });
  const c = await createCaseVia(client.agent);
  const req = (await clientCase(client.agent, c.id)).requirements[0];
  const doc = expectStatus(await uploadDoc(client.agent, c.id, req.id), 201).body.document as { id: string };
  if (assignedStaffId) await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId } });
  return { client, c, doc };
};

describe('B-4: PATCH /admin/partners/assign keeps the same history as the drive client folders', () => {
  it('writes PARTNER_CHANGED, moves the client owner, notifies the partner and refuses an inactive partner', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const p = expectStatus(await admin.agent.post('/api/admin/partners').send({ name: uniq('Assign ') }), 201).body.partner as { id: string };
    const login = await createClient({ firstName: 'Partner', lastName: 'Login' });
    await prisma.user.update({ where: { id: login.user.id }, data: { role: 'AGENT' } });
    await prisma.referralPartner.update({ where: { id: p.id }, data: { userId: login.user.id } });
    const { c, client } = await clientWithCase('Assignhistory');

    const res = expectStatus(await staff.agent.patch('/api/admin/partners/assign').send({ caseIds: [c.id], partnerId: p.id }), 200).body;
    expect(res).toMatchObject({ ok: true, updated: 1 });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).partnerId).toBe(p.id);
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'PARTNER_CHANGED' } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).ownerPartnerId).toBe(p.id);
    expect(await prisma.partnerClientChange.count({ where: { userId: client.user.id, toPartnerId: p.id, source: 'ADMIN' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: login.user.id, type: 'PARTNER_NEW_CASE' } })).toBe(1);

    // the same partner again: nothing changes, no second history row
    expect(expectStatus(await staff.agent.patch('/api/admin/partners/assign').send({ caseIds: [c.id], partnerId: p.id }), 200).body.updated).toBe(0);
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'PARTNER_CHANGED' } })).toBe(1);

    // unassign: owner follows back to nobody
    expect(expectStatus(await staff.agent.patch('/api/admin/partners/assign').send({ caseIds: [c.id], partnerId: null }), 200).body.updated).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).ownerPartnerId).toBeNull();

    // an inactive partner cannot get new cases; nothing is changed
    await prisma.referralPartner.update({ where: { id: p.id }, data: { active: false } });
    const refused = expectStatus(await staff.agent.patch('/api/admin/partners/assign').send({ caseIds: [c.id], partnerId: p.id }), 400);
    expect(refused.body.error).toBe('PARTNER_INACTIVE');
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).partnerId).toBeNull();
    // the partner's own login is never its client
    await prisma.referralPartner.update({ where: { id: p.id }, data: { active: true } });
    const own = await prisma.case.create({ data: { number: uniq('TV-'), clientId: login.user.id, profession: 'Sürücü', status: 'DOCUMENTS_PENDING', visaType: 'WORK' } });
    expect(expectStatus(await staff.agent.patch('/api/admin/partners/assign').send({ caseIds: [own.id], partnerId: p.id }), 400).body.error).toBe('PARTNER_OWN_LOGIN');
  });
});

describe('B-2: bulk "Schon geschrieben" without a next admin keeps the current assignee', () => {
  it('adds the note and keeps processingAssigneeId of a case already in WRITTEN', async () => {
    const staff = await asStaff();
    const colleague = await asStaff();
    const { c } = await clientWithCase('Bulkkeep');
    await prisma.case.update({ where: { id: c.id }, data: { processingStage: 'WRITTEN', processingAssigneeId: colleague.user.id } });
    const res = expectStatus(await staff.agent.post('/api/admin/client-folders/processing').send({ cases: [c.id], stage: 'WRITTEN', note: 'Zəng edildi' }), 200).body;
    expect(res.summary).toMatchObject({ succeeded: 1, failed: 0 });
    expect(await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ processingStage: 'WRITTEN', processingAssigneeId: colleague.user.id });
  });
});

describe('B-5 / B-6: case scope of bulk restore-assign and the cases list counts', () => {
  it('restore-assign refuses cases outside the scope; list counts cover the scope only', async () => {
    const sup = await asSuperAdmin();
    const staff = await asStaff();
    const mine = await clientWithCase('Scopebulkmine', staff.user.id);
    const other = await clientWithCase('Scopebulkother');
    expectStatus(await restrict(sup.agent, staff.user.id, 'ASSIGNED'), 200);

    const r = expectStatus(
      await staff.agent.post('/api/admin/bulk/cases/restore-assign').send({ items: [{ id: mine.c.id, staffId: staff.user.id }, { id: other.c.id, staffId: staff.user.id }] }),
      200,
    ).body;
    expect(r.results).toEqual([
      { id: mine.c.id, ok: true },
      { id: other.c.id, ok: false, error: 'OUT_OF_SCOPE' },
    ]);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: other.c.id } })).assignedStaffId).toBeNull();

    const list = expectStatus(await staff.agent.get('/api/admin/cases'), 200).body;
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum(list.counts)).toBe(list.total);
    expect(list.items.map((i: { id: string }) => i.id)).not.toContain(other.c.id);
    expectStatus(await restrict(sup.agent, staff.user.id, 'ALL'), 200);
  });
});

describe('C-5: every reveal entity respects the case scope', () => {
  it('ASSIGNED staff reveal passport numbers and document data only inside their scope', async () => {
    const sup = await asSuperAdmin();
    const staff = await asStaff();
    const mine = await clientWithCase('Revealpassmine', staff.user.id);
    const other = await clientWithCase('Revealpassother');
    await prisma.user.update({ where: { id: mine.client.user.id }, data: { passportNumber: 'C11111111' } });
    await prisma.user.update({ where: { id: other.client.user.id }, data: { passportNumber: 'C22222222' } });
    const reveal = (entity: string, id: string, field: string) => staff.agent.post('/api/admin/reveal').send({ entity, id, field, reason: 'Viza anketi üçün lazımdır' });

    // scope ALL (default): as before
    expect(expectStatus(await reveal('user', other.client.user.id, 'passportNumber'), 200).body.value).toBe('C22222222');

    expectStatus(await restrict(sup.agent, staff.user.id, 'ASSIGNED'), 200);
    expect(expectStatus(await reveal('user', mine.client.user.id, 'passportNumber'), 200).body.value).toBe('C11111111');
    const denied = await reveal('user', other.client.user.id, 'passportNumber');
    expect(denied.status).toBe(404);
    expect(JSON.stringify(denied.body)).not.toContain('C22222222');
    expect((await reveal('document', mine.doc.id, 'passportNumber')).status).toBe(200);
    expect((await reveal('document', other.doc.id, 'passportNumber')).status).toBe(404);
    expectStatus(await restrict(sup.agent, staff.user.id, 'ALL'), 200);
  });
});

describe('C-2: waitlist and SaaS demo leads have their own source filter', () => {
  it('filters ?source=waitlist and ?source=saas and lists them as facets', async () => {
    const { agent } = await asStaff();
    const w = await prisma.inquiry.create({ data: { kind: 'contact', contactName: 'Wait', email: 'w@test.local', message: 'x', locale: 'az', source: 'waitlist:driver' } });
    const s = await prisma.inquiry.create({ data: { kind: 'contact', contactName: 'Saas', email: 's@test.local', message: 'x', locale: 'de', source: 'saas:demo' } });
    const wl = expectStatus(await agent.get('/api/admin/inquiries?source=waitlist'), 200).body;
    expect(wl.items.map((i: { id: string }) => i.id)).toEqual([w.id]);
    expect(expectStatus(await agent.get('/api/admin/inquiries?source=saas'), 200).body.items.map((i: { id: string }) => i.id)).toEqual([s.id]);
    const keys = (wl.facets.sources as { key: string }[]).map((x) => x.key);
    expect(keys).toEqual(expect.arrayContaining(['waitlist', 'saas']));
  });
});

describe('reset password of a deactivated account', () => {
  it('answers 403 ACCOUNT_INACTIVE and keeps the link unused', async () => {
    const { user } = await createClient({ email: `${uniq('off')}@test.local`, isActive: false });
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3_600_000) } });
    const res = await anon().post('/api/auth/reset-password').send({ token, password: 'BrandNew789' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ACCOUNT_INACTIVE');
    expect((await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } })).usedAt).toBeNull();
    // reactivated: the same link works
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
    expectStatus(await anon().post('/api/auth/reset-password').send({ token, password: 'BrandNew789' }), 200);
  });
});
