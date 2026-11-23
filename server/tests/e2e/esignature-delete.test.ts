import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { makePdf, PDF } from '../helpers/files';
import { driveCaseTo, expectStatus } from '../helpers/workflow';

const createRequest = async (agent: Agent, payload: Record<string, unknown>) =>
  agent
    .post('/api/admin/signatures')
    .field('payload', JSON.stringify({ title: 'Arbeitsvertrag', send: false, ...payload }))
    .attach('file', await makePdf('LOESCHEN', 1), { filename: 'vertrag.pdf', ...PDF });

describe('deleting signature requests', () => {
  it('lets ADMIN delete a request (PDF key row gone, audit entry) and refuses STAFF', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const r = expectStatus(await createRequest(staff.agent, { signers: [{ role: 'OTHER', name: 'Some One', email: 'someone@test.local' }] }), 201).body.request;

    expect((await staff.agent.delete(`/api/admin/signatures/${r.id}`)).status).toBe(403);
    expect((await staff.agent.post('/api/admin/signatures/delete-many').send({ ids: [r.id] })).status).toBe(403);
    expect(await prisma.signatureRequest.count({ where: { id: r.id } })).toBe(1);

    expectStatus(await admin.agent.delete(`/api/admin/signatures/${r.id}`), 200);
    expect(await prisma.signatureRequest.count({ where: { id: r.id } })).toBe(0);
    expect(await prisma.signatureSigner.count({ where: { requestId: r.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'signature.delete', target: r.id } })).toBe(1);
    expect((await admin.agent.delete(`/api/admin/signatures/${r.id}`)).status).toBe(404);
  });

  it('bulk delete removes free requests and reports the protected one', async () => {
    const admin = await asAdmin();
    const a = expectStatus(await createRequest(admin.agent, { signers: [{ role: 'OTHER', name: 'A One', email: 'a1@test.local' }] }), 201).body.request;
    const b = expectStatus(await createRequest(admin.agent, { signers: [{ role: 'OTHER', name: 'B One', email: 'b1@test.local' }] }), 201).body.request;
    const res = expectStatus(await admin.agent.post('/api/admin/signatures/delete-many').send({ ids: [a.id, b.id] }), 200).body;
    expect(res.removed).toBe(2);
    expect(res.blocked).toEqual([]);
  });

  it('refuses a request linked to a live case contract (409) until the case is closed', async () => {
    const cand = await asClient();
    const admin = await asAdmin();
    const created = await driveCaseTo('CONTRACT_SENT', { client: cand.agent, admin: admin.agent });
    const req = await prisma.signatureRequest.findFirstOrThrow({ where: { caseId: created.id } });
    const res = await admin.agent.delete(`/api/admin/signatures/${req.id}`);
    expect(res.status).toBe(409);
    expect(await prisma.signatureRequest.count({ where: { id: req.id } })).toBe(1);

    await prisma.case.update({ where: { id: created.id }, data: { status: 'CANCELLED' } });
    expectStatus(await admin.agent.delete(`/api/admin/signatures/${req.id}`), 200);
  });

  it('cleans up requests left behind by deleted accounts and keeps unrelated ones', async () => {
    const admin = await asAdmin();
    const keep = expectStatus(await createRequest(admin.agent, { title: 'Extern', signers: [{ role: 'CANDIDATE', name: 'Ext Ern', email: 'extern@test.local' }] }), 201).body.request;
    const orphan = expectStatus(await createRequest(admin.agent, { title: 'Əmək müqaviləsi · TV-2026-0015', signers: [{ role: 'CANDIDATE', name: 'Gone User', email: 'gone@test.local' }] }), 201).body.request;
    // A case contract whose case was deleted with the account (Case → SetNull).
    const contract = expectStatus(await createRequest(admin.agent, { title: 'Müraciətin əmək müqaviləsi', signers: [{ role: 'OTHER', name: 'Other One', email: 'o1@test.local' }] }), 201).body.request;
    await prisma.signatureRequest.update({ where: { id: contract.id }, data: { isCaseContract: true } });
    const alive = await createUser({ role: 'CLIENT' });
    const linked = expectStatus(await createRequest(admin.agent, { title: 'Lebendig TV-2026-0001', signers: [{ role: 'CANDIDATE', name: 'Alive', email: alive.user.email }] }), 201).body.request;

    expect(expectStatus(await admin.agent.get('/api/admin/signatures/orphans'), 200).body.count).toBe(2);
    const staff = await asStaff();
    expect((await staff.agent.post('/api/admin/signatures/cleanup-orphans').send({})).status).toBe(403);
    const res = expectStatus(await admin.agent.post('/api/admin/signatures/cleanup-orphans').send({}), 200).body;
    expect(res.removed).toBe(2);
    const left = (await prisma.signatureRequest.findMany({ select: { id: true } })).map((r) => r.id).sort();
    expect(left).toEqual([keep.id, linked.id].sort());
    expect(orphan.id).toBeTruthy();
  });
});
