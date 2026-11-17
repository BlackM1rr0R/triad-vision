import { describe, expect, it } from 'vitest';
import { asAdmin, asClient } from '../helpers/api';
import { prisma } from '../helpers/db';
import { staffNotifications } from '../helpers/notify';
import { act, clientCase, driveCaseTo, expectStatus, uploadDoc } from '../helpers/workflow';

/**
 * Owner report: staff reject a document ("not accepted, upload again") after the client handed the documents in,
 * and the client could not upload a new one (409 UPLOAD_NOT_ALLOWED; the portal showed the stage as locked).
 * A rejected document can now be replaced from the same place while the case is open (lib/clientUploadTarget.ts).
 */

const setup = async () => {
  const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov' });
  const admin = await asAdmin();
  return { client, admin };
};

const reject = async (admin: Awaited<ReturnType<typeof asAdmin>>, caseId: string, docId: string, note = 'Surət oxunmur, yenidən yükləyin') =>
  expectStatus(await admin.agent.post(`/api/admin/cases/${caseId}/documents/${docId}/review`).send({ status: 'REJECTED', note }), 200);

describe('replacing a rejected document after hand-in', () => {
  it('staff reject in DOCUMENTS_REVIEW → client re-uploads → 201, PENDING, old file kept, staff notified', async () => {
    const { client, admin } = await setup();
    const c = await driveCaseTo('DOCUMENTS_REVIEW', { client: client.agent, admin: admin.agent });
    const req = (await clientCase(client.agent, c.id)).requirements.find((r) => r.stage === 'INITIAL' && r.required)!;
    const oldId = req.documents[0].id;
    await reject(admin, c.id, oldId);

    // The client is told and the link opens the documents tab.
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: client.user.id, type: 'DOCUMENT_REJECTED' } });
    expect(n.link).toBe(`/account/cases/${c.id}?tab=docs`);

    const res = await uploadDoc(client.agent, c.id, req.id, 'pasport-yeni.pdf');
    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({ status: 'PENDING', stage: 'INITIAL', requirementId: req.id, originalName: 'pasport-yeni.pdf' });

    // The case stays in review; the rejected file stays in the history with its reason (visible to the client).
    const after = await clientCase(client.agent, c.id);
    expect(after.status).toBe('DOCUMENTS_REVIEW');
    const docs = after.requirements.find((r) => r.id === req.id)!.documents as { id: string; status: string; reviewNote?: string | null }[];
    expect(docs).toHaveLength(2);
    expect(docs.find((d) => d.id === oldId)).toMatchObject({ status: 'REJECTED', reviewNote: 'Surət oxunmur, yenidən yükləyin' });
    expect(docs.find((d) => d.id !== oldId)?.status).toBe('PENDING');

    // Staff (admins + assignee) learn that a new file waits for review.
    const staff = await staffNotifications(admin.user.id);
    expect(staff.map((s) => s.title)).toContain(`${c.number}: rədd edilmiş sənəd yenidən yükləndi`);
    expect(staff.find((s) => s.title.includes('yenidən yükləndi'))?.link).toBe(`/admin/cases/${c.id}`);

    // Replaced once: the requirement is in review again, a further upload is refused.
    const again = await uploadDoc(client.agent, c.id, req.id);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('UPLOAD_NOT_ALLOWED');

    // The team accepts the new file: the requirement is done.
    const newId = docs.find((d) => d.id !== oldId)!.id;
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/documents/${newId}/review`).send({ status: 'ACCEPTED' }), 200);
    expect(await prisma.document.count({ where: { requirementId: req.id } })).toBe(2);
  });

  it('only rejected requirements of an open case can be replaced', async () => {
    const { client, admin } = await setup();
    const c = await driveCaseTo('DOCUMENTS_REVIEW', { client: client.agent, admin: admin.agent });
    const reqs = (await clientCase(client.agent, c.id)).requirements.filter((r) => r.stage === 'INITIAL' && r.required);

    // A requirement that was not rejected stays closed after hand-in.
    const pending = await uploadDoc(client.agent, c.id, reqs[1].id);
    expect(pending.status).toBe(409);
    expect(pending.body.error).toBe('UPLOAD_NOT_ALLOWED');

    // A closed case refuses even a rejected one.
    await reject(admin, c.id, reqs[0].documents[0].id);
    expectStatus(await act(admin.agent, c.id, { action: 'CANCEL', reason: 'Client withdrew' }), 200);
    const closed = await uploadDoc(client.agent, c.id, reqs[0].id);
    expect(closed.status).toBe(409);
    expect(closed.body.error).toBe('UPLOAD_NOT_ALLOWED');
  });

  it('works in the embassy review too', async () => {
    const { client, admin } = await setup();
    const c = await driveCaseTo('EMBASSY_REVIEW', { client: client.agent, admin: admin.agent });
    const req = (await clientCase(client.agent, c.id)).requirements.find((r) => r.stage === 'EMBASSY' && r.required)!;
    await reject(admin, c.id, req.documents[0].id);
    const res = await uploadDoc(client.agent, c.id, req.id, 'yeni.pdf');
    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({ status: 'PENDING', stage: 'EMBASSY' });
    expect((await clientCase(client.agent, c.id)).status).toBe('EMBASSY_REVIEW');
  });

  it('in the open upload step nothing changes: no extra staff notice', async () => {
    const { client, admin } = await setup();
    const c = await driveCaseTo('DOCUMENTS_REVIEW', { client: client.agent, admin: admin.agent });
    const req = (await clientCase(client.agent, c.id)).requirements.find((r) => r.stage === 'INITIAL' && r.required)!;
    await reject(admin, c.id, req.documents[0].id);
    expectStatus(await act(admin.agent, c.id, { action: 'REQUEST_CHANGES', note: 'Pasportu yenidən yükləyin' }), 200);
    expectStatus(await uploadDoc(client.agent, c.id, req.id), 201);
    const staff = await staffNotifications(admin.user.id);
    expect(staff.some((s) => s.title.includes('yenidən yükləndi'))).toBe(false);
  });
});

describe('portal home after a rejection in review', () => {
  it('next step: FIX_DOCS big card linking to the documents tab; stage: documents featured first; gone after re-upload', async () => {
    const { client, admin } = await setup();
    const c = await driveCaseTo('EMBASSY_REVIEW', { client: client.agent, admin: admin.agent });
    const before = expectStatus(await client.agent.get('/api/account/next-step'), 200).body;
    expect(before.primary?.kind ?? null).not.toBe('FIX_DOCS');

    const req = (await clientCase(client.agent, c.id)).requirements.find((r) => r.stage === 'EMBASSY' && r.required)!;
    await reject(admin, c.id, req.documents[0].id);

    const ns = expectStatus(await client.agent.get('/api/account/next-step'), 200).body;
    expect(ns.primary).toMatchObject({ kind: 'FIX_DOCS', to: `/account/cases/${c.id}?tab=docs#docs-embassy`, count: 1 });
    expect(ns.waiting).toBeNull();
    expect(ns.portal.featured[0]).toBe('documents');
    const stage = expectStatus(await client.agent.get('/api/account/stage'), 200).body;
    expect(stage.featured[0]).toBe('documents');

    expectStatus(await uploadDoc(client.agent, c.id, req.id, 'yeni.pdf'), 201);
    const after = expectStatus(await client.agent.get('/api/account/next-step'), 200).body;
    expect([after.primary, ...after.secondary].some((a: { kind: string } | null) => a?.kind === 'FIX_DOCS')).toBe(false);
    expect(expectStatus(await client.agent.get('/api/account/stage'), 200).body.featured[0]).not.toBe('documents');
  });
});
