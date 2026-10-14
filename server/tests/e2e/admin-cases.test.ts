import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, type Agent } from '../helpers/api';
import { prisma, settle } from '../helpers/db';
import { createClient, createVisaCategory, l10n } from '../helpers/factories';
import { makePdf, PDF } from '../helpers/files';
import { expectClientNotified } from '../helpers/notify';
import { TEST_UPLOADS_DIR } from '../helpers/testEnv';
import { adminCase, clientCase, createCaseVia, driveCaseTo, expectStatus, sendContract, uploadDoc, uploadRequired } from '../helpers/workflow';

const privateDir = path.join(TEST_UPLOADS_DIR, 'private');
const fileCount = () => fs.readdirSync(privateDir).length;

const setup = async (clientOpts = {}) => {
  const client = await asClient(clientOpts);
  const admin = await asAdmin();
  const c = await createCaseVia(client.agent);
  return { client, admin, c };
};

const staffUpload = async (admin: Agent, caseId: string, fields: Record<string, string>, file?: { name: string; type: string; data?: Buffer }) => {
  let t = admin.post(`/api/admin/cases/${caseId}/documents`);
  for (const [k, v] of Object.entries(fields)) t = t.field(k, v);
  if (file) t = t.attach('file', file.data ?? (await makePdf()), { filename: file.name, contentType: file.type });
  return t;
};

describe('GET /api/admin/cases', () => {
  const seed = async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const people = [
      { firstName: 'Əli', lastName: 'Məmmədov', email: 'ali@test.local', profession: 'LKW sürücüsü' },
      { firstName: 'Şəhla', lastName: 'Quliyeva', email: 'shahla@test.local', profession: 'Tibb bacısı' },
      { firstName: 'Hans', lastName: 'Müller', email: 'hans@test.local', profession: 'Koch' },
    ];
    const cases = [];
    for (const p of people) {
      const u = await asClient({ firstName: p.firstName, lastName: p.lastName, email: p.email });
      cases.push(expectStatus(await u.agent.post('/api/cases').send({ profession: p.profession }), 201).body.case);
    }
    await prisma.case.update({ where: { id: cases[1].id }, data: { status: 'DOCUMENTS_REVIEW', assignedStaffId: staff.user.id } });
    return { admin, staff, cases };
  };

  const ids = (res: { body: { items: { id: string }[] } }) => res.body.items.map((i) => i.id).sort();

  it('lists all cases with client, staff and status counts', async () => {
    const { admin, cases } = await seed();
    const res = await admin.agent.get('/api/admin/cases');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.pageSize).toBe(25);
    expect(res.body.counts).toEqual({ DOCUMENTS_PENDING: 2, DOCUMENTS_REVIEW: 1 });
    expect(ids(res)).toEqual(cases.map((c) => c.id).sort());
    const item = res.body.items.find((i: { id: string }) => i.id === cases[1].id);
    expect(item.client).toMatchObject({ firstName: 'Şəhla', email: 'shahla@test.local' });
    expect(item.assignedStaff).toEqual({ firstName: 'Staff', lastName: 'User' });
    expect(item.client.passwordHash).toBeUndefined();
  });

  it('filters by status', async () => {
    const { admin, cases } = await seed();
    const res = await admin.agent.get('/api/admin/cases?status=DOCUMENTS_REVIEW');
    expect(ids(res)).toEqual([cases[1].id]);
    expect(res.body.total).toBe(1);
    // counts stay global so the status tabs keep their numbers
    expect(res.body.counts).toEqual({ DOCUMENTS_PENDING: 2, DOCUMENTS_REVIEW: 1 });
    expect((await admin.agent.get('/api/admin/cases?status=NOPE')).status).toBe(400);
  });

  it.each([
    ['əli', 0],
    ['ƏLİ', 0],
    ['MƏMMƏDOV', 0],
    ['şəhla', 1],
    ['QULIYEVA', 1],
    ['müller', 2],
    ['HANS@TEST', 2],
    ['sürücü', 0],
    ['TİBB', 1],
  ])('searches case-insensitively, including Azerbaijani letters: %s', async (term, index) => {
    const { admin, cases } = await seed();
    const res = await admin.agent.get(`/api/admin/cases?search=${encodeURIComponent(term)}`);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([cases[index].id]);
  });

  it('searches by case number', async () => {
    const { admin, cases } = await seed();
    const res = await admin.agent.get(`/api/admin/cases?search=${cases[2].number.toLowerCase()}`);
    expect(ids(res)).toEqual([cases[2].id]);
    expect((await admin.agent.get('/api/admin/cases?search=zzz-no-match')).body.total).toBe(0);
  });

  it('mine=true shows only cases assigned to me, mine=false shows all', async () => {
    const { staff, cases } = await seed();
    expect(ids(await staff.agent.get('/api/admin/cases?mine=true'))).toEqual([cases[1].id]);
    expect((await staff.agent.get('/api/admin/cases?mine=false')).body.total).toBe(3);
    expect((await staff.agent.get('/api/admin/cases?mine=yes')).status).toBe(400);
  });

  it('paginates 25 per page, most recently updated first', async () => {
    const admin = await asAdmin();
    const clients = await Promise.all(Array.from({ length: 27 }, () => createClient()));
    for (let i = 0; i < clients.length; i++) {
      await prisma.case.create({
        data: {
          clientId: clients[i].user.id,
          number: `TV-2000-${String(i + 1).padStart(4, '0')}`,
          profession: 'Driver',
          updatedAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
        },
      });
    }
    const p1 = await admin.agent.get('/api/admin/cases?page=1');
    const p2 = await admin.agent.get('/api/admin/cases?page=2');
    expect(p1.body.items).toHaveLength(25);
    expect(p2.body.items).toHaveLength(2);
    expect(p1.body.total).toBe(27);
    expect(p1.body.items[0].number).toBe('TV-2000-0027');
    expect(p2.body.items.map((c: { number: string }) => c.number)).toEqual(['TV-2000-0002', 'TV-2000-0001']);
    expect((await admin.agent.get('/api/admin/cases?page=3')).body.items).toEqual([]);
    expect((await admin.agent.get('/api/admin/cases?page=0')).status).toBe(400);
  });
});

describe('GET /api/admin/cases/:id', () => {
  it('returns the full detail including internal events and signer metadata', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await driveCaseTo('CONTRACT_SIGNED', { client: client.agent, admin: admin.agent });
    const detail = await adminCase(admin.agent, c.id);
    expect(detail.client).toMatchObject({ id: client.user.id, email: client.user.email, locale: 'az' });
    expect((detail.events as { type: string }[]).map((e) => e.type)).toContain('DOCUMENT_UPLOADED');
    expect(detail.contract).toMatchObject({ signerIp: expect.any(String), signerUserAgent: expect.any(String) });
    expect(detail.requirements.filter((r) => r.stage === 'INITIAL')).toHaveLength(7);
  });

  it('404 for an unknown case', async () => {
    const { agent } = await asStaff();
    const res = await agent.get('/api/admin/cases/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('CASE_NOT_FOUND');
  });
});

describe('PATCH /api/admin/cases/:id', () => {
  it('assigns and unassigns staff, edits profession and visa category, logs an internal event', async () => {
    const { client, admin, c } = await setup();
    const staff = await asStaff();
    const visa = await createVisaCategory();

    const res = await admin.agent
      .patch(`/api/admin/cases/${c.id}`)
      .send({ assignedStaffId: staff.user.id, profession: 'Aşpaz', visaCategoryId: visa.id });
    expect(res.status).toBe(200);
    expect(res.body.case).toMatchObject({ assignedStaffId: staff.user.id, profession: 'Aşpaz', visaCategoryId: visa.id });
    expect((await staff.agent.get('/api/admin/cases?mine=true')).body.total).toBe(1);

    const unassigned = await admin.agent.patch(`/api/admin/cases/${c.id}`).send({ assignedStaffId: null });
    expect(unassigned.body.case.assignedStaffId).toBeNull();

    const events = await prisma.caseEvent.findMany({ where: { caseId: c.id, type: 'CASE_UPDATED' } });
    expect(events).toHaveLength(2);
    expect(events.every((e) => !e.visibleToClient)).toBe(true);
    expect((await clientCase(client.agent, c.id)).events).not.toContainEqual(expect.objectContaining({ type: 'CASE_UPDATED' }));
  });

  it('assigning a case notifies the assigned staff member about later client activity', async () => {
    const { client, admin, c } = await setup();
    const staff = await asStaff();
    await admin.agent.patch(`/api/admin/cases/${c.id}`).send({ assignedStaffId: staff.user.id });
    await client.agent.post(`/api/cases/${c.id}/messages`).send({ body: 'Salam' });
    expect(await prisma.notification.count({ where: { userId: staff.user.id, type: 'STAFF' } })).toBe(1);
  });

  it('refuses a client or unknown user as staff', async () => {
    const { client, admin, c } = await setup();
    for (const id of [client.user.id, 'nope']) {
      const res = await admin.agent.patch(`/api/admin/cases/${c.id}`).send({ assignedStaffId: id });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_STAFF');
    }
  });

  it('refuses an unknown visa category with 400', async () => {
    const { admin, c } = await setup();
    const res = await admin.agent.patch(`/api/admin/cases/${c.id}`).send({ visaCategoryId: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_VISA_CATEGORY');
  });

  it('validates input and 404s unknown cases', async () => {
    const { admin, c } = await setup();
    expect((await admin.agent.patch(`/api/admin/cases/${c.id}`).send({ profession: 'x' })).status).toBe(400);
    expect((await admin.agent.patch('/api/admin/cases/nope').send({ profession: 'Driver' })).status).toBe(404);
  });
});

describe('requirements', () => {
  it('adds a requirement at the end of its stage, edits and deletes it', async () => {
    const { client, admin, c } = await setup();
    const res = await admin.agent
      .post(`/api/admin/cases/${c.id}/requirements`)
      .send({ stage: 'INITIAL', title: l10n('Military ID'), required: false });
    expect(res.status).toBe(201);
    expect(res.body.requirement).toMatchObject({ caseId: c.id, stage: 'INITIAL', sortOrder: 7, required: false, title: l10n('Military ID') });
    const id = res.body.requirement.id;

    const first = await admin.agent.post(`/api/admin/cases/${c.id}/requirements`).send({ stage: 'EMBASSY', title: l10n('Embassy') });
    expect(first.body.requirement).toMatchObject({ sortOrder: 0, required: true });

    const patched = await admin.agent
      .patch(`/api/admin/cases/${c.id}/requirements/${id}`)
      .send({ required: true, title: l10n('Military ID card'), description: l10n('Both sides') });
    expect(patched.status).toBe(200);
    expect(patched.body.requirement).toMatchObject({ required: true, title: l10n('Military ID card'), description: l10n('Both sides') });
    expect((await clientCase(client.agent, c.id)).requirements.some((r) => r.id === id)).toBe(true);

    // description: null leaves the description unchanged
    const nulled = await admin.agent.patch(`/api/admin/cases/${c.id}/requirements/${id}`).send({ description: null });
    expect(nulled.body.requirement.description).toEqual(l10n('Both sides'));

    const del = await admin.agent.delete(`/api/admin/cases/${c.id}/requirements/${id}`);
    expect(del.status).toBe(200);
    expect(await prisma.documentRequirement.findUnique({ where: { id } })).toBeNull();
  });

  it('refuses to delete a requirement that has documents', async () => {
    const { client, admin, c } = await setup();
    const req = (await clientCase(client.agent, c.id)).requirements[0];
    await uploadDoc(client.agent, c.id, req.id);
    const res = await admin.agent.delete(`/api/admin/cases/${c.id}/requirements/${req.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('REQUIREMENT_HAS_DOCUMENTS');
  });

  it('validates input and checks the requirement belongs to the case', async () => {
    const { admin, c } = await setup();
    const other = await createCaseVia((await asClient()).agent);
    const otherReq = (await adminCase(admin.agent, other.id)).requirements[0];

    for (const body of [{ stage: 'CONTRACT', title: l10n('x') }, { stage: 'INITIAL', title: { az: 'only az' } }, { stage: 'INITIAL' }]) {
      expect((await admin.agent.post(`/api/admin/cases/${c.id}/requirements`).send(body)).status).toBe(400);
    }
    expect((await admin.agent.post('/api/admin/cases/nope/requirements').send({ stage: 'INITIAL', title: l10n('x') })).status).toBe(404);
    expect((await admin.agent.patch(`/api/admin/cases/${c.id}/requirements/${otherReq.id}`).send({ required: false })).status).toBe(404);
    expect((await admin.agent.delete(`/api/admin/cases/${c.id}/requirements/${otherReq.id}`)).status).toBe(404);
    expect((await admin.agent.delete(`/api/admin/cases/${c.id}/requirements/nope`)).status).toBe(404);
  });
});

describe('document review', () => {
  const uploaded = async (clientOpts = {}) => {
    const s = await setup(clientOpts);
    const req = (await clientCase(s.client.agent, s.c.id)).requirements[0];
    const doc = (await uploadDoc(s.client.agent, s.c.id, req.id, 'pasport.pdf')).body.document;
    return { ...s, req, doc };
  };

  it('ACCEPTED notifies the client in-app only, in their language', async () => {
    const { client, admin, c, doc } = await uploaded({ locale: 'en' });
    const res = await admin.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'ACCEPTED' });
    expect(res.status).toBe(200);
    expect(res.body.document).toMatchObject({ id: doc.id, status: 'ACCEPTED', reviewNote: null });
    const n = await expectClientNotified(client.user, 'DOCUMENT_ACCEPTED', 'Document accepted', { email: false });
    expect(n.body).toBe('The document "Passport (all pages)" was accepted.');
    await settle();
    expect(await prisma.emailLog.count({ where: { to: client.user.email, subject: { contains: 'Document accepted' } } })).toBe(0);
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'DOCUMENT_ACCEPTED' } })).toBe(1);
  });

  it('REJECTED needs a note, stores it and tells the client why', async () => {
    const { client, admin, c, doc } = await uploaded({ locale: 'ru' });
    const noNote = await admin.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'REJECTED' });
    expect(noNote.status).toBe(400);
    expect(noNote.body.error).toBe('NOTE_REQUIRED');
    expect((await admin.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'REJECTED', note: '   ' })).body.error).toBe('NOTE_REQUIRED');

    const res = await admin.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'REJECTED', note: 'Фото размыто' });
    expect(res.status).toBe(200);
    expect(res.body.document).toMatchObject({ status: 'REJECTED', reviewNote: 'Фото размыто' });
    await expectClientNotified(client.user, 'DOCUMENT_REJECTED', 'Документ не принят', { email: false, bodyContains: 'Фото размыто' });
    const event = await prisma.caseEvent.findFirstOrThrow({ where: { caseId: c.id, type: 'DOCUMENT_REJECTED' } });
    expect(event.note).toBe('pasport.pdf: Фото размыто');
  });

  it('PENDING resets the review without notifying', async () => {
    const { client, admin, c, doc } = await uploaded();
    await admin.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'REJECTED', note: 'Blurry' });
    const before = await prisma.notification.count({ where: { userId: client.user.id } });
    const res = await admin.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'PENDING' });
    expect(res.body.document).toMatchObject({ status: 'PENDING', reviewNote: null });
    expect(await prisma.notification.count({ where: { userId: client.user.id } })).toBe(before);
  });

  it('a document without a requirement is named by its file name', async () => {
    const { client, admin, c } = await setup({ locale: 'en' });
    const doc = (await staffUpload(admin.agent, c.id, { stage: 'OTHER' }, { name: 'Arbeitszeugnis.pdf', type: 'application/pdf' })).body.document;
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'REJECTED', note: 'Unsigned' }), 200);
    const n = await expectClientNotified(client.user, 'DOCUMENT_REJECTED', 'Document not accepted', { email: false });
    expect(n.body).toContain('"Arbeitszeugnis.pdf"');
  });

  it('validates status and checks the document belongs to the case', async () => {
    const { admin, c, doc } = await uploaded();
    const other = await createCaseVia((await asClient()).agent);
    expect((await admin.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'MAYBE' })).status).toBe(400);
    const res = await admin.agent.post(`/api/admin/cases/${other.id}/documents/${doc.id}/review`).send({ status: 'ACCEPTED' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('DOCUMENT_NOT_FOUND');
    expect((await admin.agent.post(`/api/admin/cases/${c.id}/documents/nope/review`).send({ status: 'ACCEPTED' })).status).toBe(404);
  });
});

describe('staff uploads', () => {
  it('INITIAL/EMBASSY need a matching requirement and are auto-accepted', async () => {
    const { client, admin, c } = await setup();
    const reqs = (await clientCase(client.agent, c.id)).requirements;

    const missing = await staffUpload(admin.agent, c.id, { stage: 'INITIAL' }, { name: 'a.pdf', type: 'application/pdf' });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('REQUIREMENT_REQUIRED');
    const missingEmbassy = await staffUpload(admin.agent, c.id, { stage: 'EMBASSY' }, { name: 'a.pdf', type: 'application/pdf' });
    expect(missingEmbassy.body.error).toBe('REQUIREMENT_REQUIRED');

    const wrongStage = await staffUpload(admin.agent, c.id, { stage: 'EMBASSY', requirementId: reqs[0].id }, { name: 'a.pdf', type: 'application/pdf' });
    expect(wrongStage.status).toBe(400);
    expect(wrongStage.body.error).toBe('INVALID_REQUIREMENT');

    const ok = await staffUpload(admin.agent, c.id, { stage: 'INITIAL', requirementId: reqs[0].id }, { name: 'skan – şəkil.pdf', type: 'application/pdf' });
    expect(ok.status).toBe(201);
    expect(ok.body.document).toMatchObject({ stage: 'INITIAL', status: 'ACCEPTED', requirementId: reqs[0].id, originalName: 'skan – şəkil.pdf' });
    const event = await prisma.caseEvent.findFirstOrThrow({ where: { caseId: c.id, type: 'STAFF_DOCUMENT_UPLOADED' } });
    expect(event.visibleToClient).toBe(false);
  });

  it.each(['VISA', 'OTHER'])('%s files are attached for the client to see', async (stage) => {
    const { client, admin, c } = await setup();
    const res = await staffUpload(admin.agent, c.id, { stage }, { name: 'visa.png', type: 'image/png', data: Buffer.from('png') });
    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({ stage, status: 'ACCEPTED', requirementId: null });
    const detail = await clientCase(client.agent, c.id);
    expect((detail.otherDocuments as { id: string }[]).map((d) => d.id)).toEqual([res.body.document.id]);
    expect((detail.events as { type: string }[]).map((e) => e.type)).toContain('STAFF_DOCUMENT_UPLOADED');
    expect((await client.agent.get(`/api/files/${res.body.document.id}`)).status).toBe(200);
  });

  it('CONTRACT must be a PDF', async () => {
    const { admin, c } = await setup();
    const before = fileCount();
    const res = await staffUpload(admin.agent, c.id, { stage: 'CONTRACT' }, {
      name: 'contract.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      data: Buffer.from('docx'),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CONTRACT_MUST_BE_PDF');
    expect(fileCount()).toBe(before);
  });

  it('CONTRACT outside the review step is refused and leaves nothing behind', async () => {
    const { admin, c } = await setup();
    const before = fileCount();
    const res = await sendContract(admin.agent, c.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('INVALID_TRANSITION');
    expect(await prisma.document.count({ where: { caseId: c.id } })).toBe(0);
    expect(fileCount()).toBe(before);
  });

  it('CONTRACT is blocked until required documents are accepted, then sends the contract', async () => {
    const { client, admin, c } = await setup({ locale: 'de' });
    await uploadRequired(client.agent, c.id, 'INITIAL');
    expectStatus(await client.agent.post(`/api/cases/${c.id}/submit`), 200);

    const blocked = await sendContract(admin.agent, c.id);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toBe('REQUIRED_DOCUMENTS_NOT_ACCEPTED');
    expect(await prisma.document.count({ where: { caseId: c.id, stage: 'CONTRACT' } })).toBe(0);

    for (const r of (await adminCase(admin.agent, c.id)).requirements) {
      for (const d of r.documents) await admin.agent.post(`/api/admin/cases/${c.id}/documents/${d.id}/review`).send({ status: 'ACCEPTED' });
    }
    const sent = await sendContract(admin.agent, c.id);
    expect(sent.status).toBe(201);
    expect(sent.body.document).toMatchObject({ stage: 'CONTRACT', status: 'PENDING', mimeType: 'application/pdf' });
    const detail = await clientCase(client.agent, c.id);
    expect(detail.status).toBe('CONTRACT_SENT');
    expect(detail.contract).toMatchObject({ version: 1, file: { id: sent.body.document.id } });
    await expectClientNotified(client.user, 'CONTRACT_SENT', 'Vertrag zur Unterschrift bereit');
  });

  it('re-sending a contract after signing bumps the version and discards the signature', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await driveCaseTo('CONTRACT_SIGNED', { client: client.agent, admin: admin.agent });
    const res = await sendContract(admin.agent, c.id);
    expect(res.status).toBe(201);
    const detail = await clientCase(client.agent, c.id);
    expect(detail.status).toBe('CONTRACT_SENT');
    expect(detail.contract).toMatchObject({ version: 2, signedAt: null, signedFile: null, file: { id: res.body.document.id } });
  });

  it('validates stage, file and case', async () => {
    const { admin, c } = await setup();
    expect((await staffUpload(admin.agent, c.id, { stage: 'CONTRACT_SIGNED' }, { name: 'a.pdf', type: 'application/pdf' })).status).toBe(400);
    expect((await staffUpload(admin.agent, c.id, { stage: 'VISA' })).body.error).toBe('FILE_REQUIRED');
    expect((await staffUpload(admin.agent, c.id, { stage: 'VISA' }, { name: 'x.exe', type: 'application/x-msdownload', data: Buffer.from('MZ') })).body.error).toBe(
      'UNSUPPORTED_FILE_TYPE',
    );
    expect((await staffUpload(admin.agent, 'nope', { stage: 'VISA' }, { name: 'a.pdf', type: 'application/pdf' })).status).toBe(404);
  });
});

describe('messages and internal notes', () => {
  it('staff messages reach the client by notification and email', async () => {
    const { client, admin, c } = await setup({ locale: 'en' });
    const res = await admin.agent.post(`/api/admin/cases/${c.id}/messages`).send({ body: 'Please bring your passport.' });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatchObject({ caseId: c.id, authorId: admin.user.id, body: 'Please bring your passport.' });
    await expectClientNotified(client.user, 'NEW_MESSAGE', 'New message');
    const detail = await clientCase(client.agent, c.id);
    expect((detail.messages as { body: string; author: { role: string } }[])[0]).toMatchObject({ author: { role: 'ADMIN' } });
  });

  it('internal notes are visible to staff only', async () => {
    const { client, admin, c } = await setup();
    const staff = await asStaff();
    const res = await staff.agent.post(`/api/admin/cases/${c.id}/notes`).send({ note: 'Client prefers WhatsApp' });
    expect(res.status).toBe(201);
    expect(res.body.event).toMatchObject({ type: 'INTERNAL_NOTE', visibleToClient: false, note: 'Client prefers WhatsApp' });
    const staffView = await adminCase(admin.agent, c.id);
    expect((staffView.events as { type: string; note: string }[]).some((e) => e.type === 'INTERNAL_NOTE' && e.note === 'Client prefers WhatsApp')).toBe(true);
    const clientView = await clientCase(client.agent, c.id);
    expect(JSON.stringify(clientView)).not.toContain('Client prefers WhatsApp');
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: { not: 'CASE_CREATED' } } })).toBe(0);
  });

  it('validates bodies and 404s unknown cases', async () => {
    const { admin, c } = await setup();
    expect((await admin.agent.post(`/api/admin/cases/${c.id}/messages`).send({ body: '' })).status).toBe(400);
    expect((await admin.agent.post(`/api/admin/cases/${c.id}/notes`).send({ note: '  ' })).status).toBe(400);
    expect((await admin.agent.post('/api/admin/cases/nope/messages').send({ body: 'hi' })).status).toBe(404);
    const note = await admin.agent.post('/api/admin/cases/nope/notes').send({ note: 'hi' });
    expect(note.status).toBe(404);
    expect(note.body.error).toBe('CASE_NOT_FOUND');
  });
});
