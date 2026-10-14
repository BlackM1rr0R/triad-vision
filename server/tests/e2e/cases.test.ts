import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createVisaCategory, l10n } from '../helpers/factories';
import { makePdf, PDF, SIGNATURE_DATA_URL } from '../helpers/files';
import { staffNotifications } from '../helpers/notify';
import { TEST_UPLOADS_DIR } from '../helpers/testEnv';
import {
  act,
  clientCase,
  createCaseVia,
  driveCaseTo,
  expectStatus,
  signContract,
  uploadDoc,
  uploadRequired,
} from '../helpers/workflow';

const privateDir = path.join(TEST_UPLOADS_DIR, 'private');
const stored = (name: string) => fs.existsSync(path.join(privateDir, name));
const fileCount = () => fs.readdirSync(privateDir).length;
const year = new Date().getFullYear();

const setup = async () => {
  const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov' });
  const admin = await asAdmin();
  return { client, admin };
};

const firstRequired = async (agent: Agent, caseId: string, stage = 'INITIAL') =>
  (await clientCase(agent, caseId)).requirements.find((r) => r.stage === stage && r.required)!;

describe('auth', () => {
  it('every /api/cases route needs a session', async () => {
    for (const [method, url] of [
      ['get', '/api/cases'],
      ['post', '/api/cases'],
      ['get', '/api/cases/x'],
      ['post', '/api/cases/x/documents'],
      ['delete', '/api/cases/x/documents/y'],
      ['post', '/api/cases/x/submit'],
      ['post', '/api/cases/x/contract/sign'],
      ['post', '/api/cases/x/messages'],
    ] as const) {
      const res = await anon()[method](url);
      expect(res.status, `${method} ${url}`).toBe(401);
      expect(res.body.error).toBe('UNAUTHENTICATED');
    }
  });
});

describe('GET/POST /api/cases', () => {
  it('creates a case with 7 default requirements and lists only own cases', async () => {
    const { client } = await setup();
    const other = await asClient();
    expect((await client.agent.get('/api/cases')).body).toEqual({ cases: [] });

    const visa = await createVisaCategory({ slug: 'lkw', title: l10n('LKW') });
    const res = await client.agent.post('/api/cases').send({ profession: '  LKW sürücüsü ', visaCategoryId: visa.id });
    expect(res.status).toBe(201);
    expect(res.body.case).toMatchObject({
      number: `TV-${year}-0001`,
      status: 'DOCUMENTS_PENDING',
      profession: 'LKW sürücüsü',
      visaCategoryId: visa.id,
      clientId: client.user.id,
    });
    await createCaseVia(other.agent);

    const list = await client.agent.get('/api/cases');
    expect(list.body.cases).toHaveLength(1);
    expect(list.body.cases[0].visaCategory).toEqual({ title: l10n('LKW'), visaLabel: '§18b' });

    const detail = await clientCase(client.agent, res.body.case.id);
    const initial = detail.requirements.filter((r) => r.stage === 'INITIAL');
    expect(initial).toHaveLength(7);
    expect(initial.filter((r) => r.required)).toHaveLength(4);
  });

  it('numbers cases sequentially per year', async () => {
    const a = await asClient();
    const b = await asClient();
    expect((await createCaseVia(a.agent)).number).toBe(`TV-${year}-0001`);
    expect((await createCaseVia(b.agent)).number).toBe(`TV-${year}-0002`);
  });

  it('keeps counting past 9999 (numeric, not text, ordering)', async () => {
    const old = await asClient();
    await prisma.case.create({ data: { number: `TV-${year}-9999`, clientId: old.user.id, profession: 'x', status: 'APPROVED' } });
    const a = await asClient();
    const b = await asClient();
    expect((await createCaseVia(a.agent)).number).toBe(`TV-${year}-10000`);
    expect((await createCaseVia(b.agent)).number).toBe(`TV-${year}-10001`);
  });

  it('works without a visa category', async () => {
    const { client } = await setup();
    const res = await client.agent.post('/api/cases').send({ profession: 'Aşpaz', visaCategoryId: null });
    expect(res.status).toBe(201);
    expect(res.body.case.visaCategoryId).toBeNull();
  });

  it.each([[{}], [{ profession: 'x' }], [{ profession: 'a'.repeat(121) }]])('validates %j', async (body) => {
    const { client } = await setup();
    const res = await client.agent.post('/api/cases').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });

  it('rejects an unknown visa category', async () => {
    const { client } = await setup();
    const res = await client.agent.post('/api/cases').send({ profession: 'Driver', visaCategoryId: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_VISA_CATEGORY');
    expect(await prisma.case.count()).toBe(0);
  });

  it('allows only one active case; a new one is possible after cancellation', async () => {
    const { client, admin } = await setup();
    const first = await createCaseVia(client.agent);
    const second = await client.agent.post('/api/cases').send({ profession: 'Another job' });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('ACTIVE_CASE_EXISTS');

    expectStatus(await act(admin.agent, first.id, { action: 'CANCEL', reason: 'Client withdrew' }), 200);
    expect((await client.agent.post('/api/cases').send({ profession: 'Another job' })).status).toBe(201);
  });

  it('notifies the client and the admins when a case is created', async () => {
    const { client, admin } = await setup();
    const c = await createCaseVia(client.agent);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: client.user.id } });
    expect(n).toMatchObject({ type: 'CASE_CREATED', caseId: c.id, title: `Müraciətiniz yaradıldı (${c.number})` });
    const [staff] = await staffNotifications(admin.user.id);
    expect(staff.title).toBe(`Yeni müraciət: ${c.number}`);
  });
});

describe('GET /api/cases/:id', () => {
  it('is visible to the owner only', async () => {
    const { client, admin } = await setup();
    const other = await asClient();
    const c = await createCaseVia(client.agent);
    expect((await client.agent.get(`/api/cases/${c.id}`)).status).toBe(200);
    const res = await other.agent.get(`/api/cases/${c.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('CASE_NOT_FOUND');
    // staff use the admin API, not the client one
    expect((await admin.agent.get(`/api/cases/${c.id}`)).status).toBe(404);
    expect((await client.agent.get('/api/cases/does-not-exist')).status).toBe(404);
  });

  it('hides internal events and staff-only contract fields from the client', async () => {
    const { client, admin } = await setup();
    const c = await createCaseVia(client.agent);
    const req = await firstRequired(client.agent, c.id);
    expectStatus(await uploadDoc(client.agent, c.id, req.id), 201);
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/notes`).send({ note: 'Secret staff note' }), 201);

    const detail = await clientCase(client.agent, c.id);
    const types = (detail.events as { type: string; visibleToClient: boolean }[]).map((e) => e.type);
    expect(types).toContain('CASE_CREATED');
    expect(types).not.toContain('DOCUMENT_UPLOADED');
    expect(types).not.toContain('INTERNAL_NOTE');
    expect((detail.events as { visibleToClient: boolean }[]).every((e) => e.visibleToClient)).toBe(true);
    expect(detail.documents).toBeUndefined();
    expect(detail.otherDocuments).toEqual([]);
  });
});

describe('POST /api/cases/:id/documents', () => {
  it('uploads to a requirement of the current stage, keeping a UTF-8 file name', async () => {
    const { client } = await setup();
    const c = await createCaseVia(client.agent);
    const req = await firstRequired(client.agent, c.id);
    const res = await uploadDoc(client.agent, c.id, req.id, 'pasport şəkli – Паспорт.pdf');
    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({
      caseId: c.id,
      requirementId: req.id,
      stage: 'INITIAL',
      status: 'PENDING',
      mimeType: 'application/pdf',
      originalName: 'pasport şəkli – Паспорт.pdf',
      uploadedById: client.user.id,
    });
    expect(res.body.document.storedName).toMatch(/^\d+-[0-9a-f]{24}\.pdf$/);
    expect(stored(res.body.document.storedName)).toBe(true);
    // the upload landed in the temp test dir, not in server/uploads
    expect(fs.existsSync(path.join(process.cwd(), 'uploads', 'private', res.body.document.storedName))).toBe(false);
  });

  it('accepts images and Word documents', async () => {
    const { client } = await setup();
    const c = await createCaseVia(client.agent);
    const req = await firstRequired(client.agent, c.id);
    for (const [filename, contentType] of [
      ['photo.png', 'image/png'],
      ['photo.jpg', 'image/jpeg'],
      ['cv.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ]) {
      const res = await client.agent
        .post(`/api/cases/${c.id}/documents`)
        .field('requirementId', req.id)
        .attach('file', Buffer.from('x'), { filename, contentType });
      expect(res.status, filename).toBe(201);
    }
  });

  it('rejects unsupported file types', async () => {
    const { client } = await setup();
    const c = await createCaseVia(client.agent);
    const req = await firstRequired(client.agent, c.id);
    const before = fileCount();
    const res = await client.agent
      .post(`/api/cases/${c.id}/documents`)
      .field('requirementId', req.id)
      .attach('file', Buffer.from('MZ'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('UNSUPPORTED_FILE_TYPE');
    expect(fileCount()).toBe(before);
  });

  it('rejects files over 15 MB with 413', async () => {
    const { client } = await setup();
    const c = await createCaseVia(client.agent);
    const req = await firstRequired(client.agent, c.id);
    const res = await client.agent
      .post(`/api/cases/${c.id}/documents`)
      .field('requirementId', req.id)
      .attach('file', Buffer.alloc(15 * 1024 * 1024 + 1, 1), { filename: 'big.pdf', ...PDF });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('FILE_TOO_LARGE');
    expect(await prisma.document.count()).toBe(0);
  });

  it('requires a file and a requirement id', async () => {
    const { client } = await setup();
    const c = await createCaseVia(client.agent);
    const req = await firstRequired(client.agent, c.id);
    const noFile = await client.agent.post(`/api/cases/${c.id}/documents`).field('requirementId', req.id);
    expect(noFile.status).toBe(400);
    expect(noFile.body.error).toBe('FILE_REQUIRED');

    const before = fileCount();
    const noReq = await client.agent.post(`/api/cases/${c.id}/documents`).attach('file', await makePdf(), { filename: 'a.pdf', ...PDF });
    expect(noReq.status).toBe(400);
    expect(noReq.body.error).toBe('VALIDATION');
    expect(fileCount()).toBe(before);
  });

  it('rejects requirements of another case or another stage', async () => {
    const { client, admin } = await setup();
    const other = await asClient();
    const c = await createCaseVia(client.agent);
    const otherCase = await createCaseVia(other.agent);
    const foreign = await firstRequired(other.agent, otherCase.id);
    const embassy = await admin.agent
      .post(`/api/admin/cases/${c.id}/requirements`)
      .send({ stage: 'EMBASSY', title: l10n('Embassy doc') });
    expect(embassy.status).toBe(201);

    for (const reqId of [foreign.id, embassy.body.requirement.id, 'nope']) {
      const res = await uploadDoc(client.agent, c.id, reqId);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_REQUIREMENT');
    }
    expect(await prisma.document.count()).toBe(0);
  });

  it('refuses uploads to another client’s case (404) and outside an upload stage (409)', async () => {
    const { client } = await setup();
    const other = await asClient();
    const c = await createCaseVia(client.agent);
    const req = await firstRequired(client.agent, c.id);

    const before = fileCount();
    expect((await uploadDoc(other.agent, c.id, req.id)).status).toBe(404);
    expect(fileCount()).toBe(before);

    await uploadRequired(client.agent, c.id, 'INITIAL');
    expectStatus(await client.agent.post(`/api/cases/${c.id}/submit`), 200);
    const during = await uploadDoc(client.agent, c.id, req.id);
    expect(during.status).toBe(409);
    expect(during.body.error).toBe('UPLOAD_NOT_ALLOWED');
    expect(fileCount()).toBe(before + 4);
  });

  it('allows EMBASSY uploads only in the embassy stage', async () => {
    const { client, admin } = await setup();
    const c = await driveCaseTo('EMBASSY_DOCUMENTS', { client: client.agent, admin: admin.agent });
    const initial = await firstRequired(client.agent, c.id, 'INITIAL');
    const embassy = await firstRequired(client.agent, c.id, 'EMBASSY');
    expect((await uploadDoc(client.agent, c.id, initial.id)).body.error).toBe('INVALID_REQUIREMENT');
    const ok = await uploadDoc(client.agent, c.id, embassy.id);
    expect(ok.status).toBe(201);
    expect(ok.body.document.stage).toBe('EMBASSY');
  });
});

describe('DELETE /api/cases/:id/documents/:docId', () => {
  it('lets the client remove a pending upload and deletes the file', async () => {
    const { client } = await setup();
    const c = await createCaseVia(client.agent);
    const req = await firstRequired(client.agent, c.id);
    const doc = (await uploadDoc(client.agent, c.id, req.id)).body.document;
    const res = await client.agent.delete(`/api/cases/${c.id}/documents/${doc.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(await prisma.document.count()).toBe(0);
    expect(stored(doc.storedName)).toBe(false);
  });

  it('refuses accepted documents, staff uploads and documents after submission', async () => {
    const { client, admin } = await setup();
    const c = await createCaseVia(client.agent);
    const reqs = (await clientCase(client.agent, c.id)).requirements.filter((r) => r.stage === 'INITIAL');

    const accepted = (await uploadDoc(client.agent, c.id, reqs[0].id)).body.document;
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/documents/${accepted.id}/review`).send({ status: 'ACCEPTED' }), 200);
    const byStaff = (
      await admin.agent
        .post(`/api/admin/cases/${c.id}/documents`)
        .field('stage', 'INITIAL')
        .field('requirementId', reqs[1].id)
        .attach('file', await makePdf(), { filename: 'staff.pdf', ...PDF })
    ).body.document;

    for (const doc of [accepted, byStaff]) {
      const res = await client.agent.delete(`/api/cases/${c.id}/documents/${doc.id}`);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('DELETE_NOT_ALLOWED');
    }

    // a rejected document can be removed while uploads are open
    const rejected = (await uploadDoc(client.agent, c.id, reqs[2].id)).body.document;
    await admin.agent.post(`/api/admin/cases/${c.id}/documents/${rejected.id}/review`).send({ status: 'REJECTED', note: 'Blurry' });
    expect((await client.agent.delete(`/api/cases/${c.id}/documents/${rejected.id}`)).status).toBe(200);

    const pending = (await uploadDoc(client.agent, c.id, reqs[3].id)).body.document;
    await uploadDoc(client.agent, c.id, reqs[2].id);
    expectStatus(await client.agent.post(`/api/cases/${c.id}/submit`), 200);
    const late = await client.agent.delete(`/api/cases/${c.id}/documents/${pending.id}`);
    expect(late.status).toBe(409);
    expect(late.body.error).toBe('DELETE_NOT_ALLOWED');
  });

  it('404 for unknown documents, documents of other cases and other clients', async () => {
    const { client } = await setup();
    const other = await asClient();
    const c = await createCaseVia(client.agent);
    const oc = await createCaseVia(other.agent);
    const otherDoc = (await uploadDoc(other.agent, oc.id, (await firstRequired(other.agent, oc.id)).id)).body.document;
    const ownDoc = (await uploadDoc(client.agent, c.id, (await firstRequired(client.agent, c.id)).id)).body.document;

    expect((await client.agent.delete(`/api/cases/${c.id}/documents/nope`)).body.error).toBe('DOCUMENT_NOT_FOUND');
    expect((await client.agent.delete(`/api/cases/${c.id}/documents/${otherDoc.id}`)).status).toBe(404);
    expect((await other.agent.delete(`/api/cases/${c.id}/documents/${ownDoc.id}`)).body.error).toBe('CASE_NOT_FOUND');
    expect(await prisma.document.count()).toBe(2);
  });
});

describe('POST /api/cases/:id/submit', () => {
  it('requires all required documents, then moves to DOCUMENTS_REVIEW and notifies staff', async () => {
    const { client, admin } = await setup();
    const c = await createCaseVia(client.agent);

    const early = await client.agent.post(`/api/cases/${c.id}/submit`);
    expect(early.status).toBe(400);
    expect(early.body.error).toBe('REQUIRED_DOCUMENTS_MISSING');

    await uploadRequired(client.agent, c.id, 'INITIAL');
    const res = await client.agent.post(`/api/cases/${c.id}/submit`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect((await clientCase(client.agent, c.id)).status).toBe('DOCUMENTS_REVIEW');
    expect((await staffNotifications(admin.user.id)).map((n) => n.title)).toContain(`${c.number}: sənədlər yoxlamaya göndərildi`);

    const again = await client.agent.post(`/api/cases/${c.id}/submit`);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('INVALID_TRANSITION');
  });

  it('optional requirements are not needed', async () => {
    const { client } = await setup();
    const c = await createCaseVia(client.agent);
    await uploadRequired(client.agent, c.id, 'INITIAL');
    expect(await prisma.document.count()).toBe(4);
    expect((await client.agent.post(`/api/cases/${c.id}/submit`)).status).toBe(200);
  });

  it('another client gets 404', async () => {
    const { client } = await setup();
    const other = await asClient();
    const c = await createCaseVia(client.agent);
    expect((await other.agent.post(`/api/cases/${c.id}/submit`)).status).toBe(404);
  });
});

describe('POST /api/cases/:id/contract/sign', () => {
  it('signs the contract and refuses a second signature', async () => {
    const { client, admin } = await setup();
    const c = await driveCaseTo('CONTRACT_SENT', { client: client.agent, admin: admin.agent });
    const res = await signContract(client.agent, c.id, 'Əli Məmmədov');
    expect(res.status).toBe(200);
    const detail = await clientCase(client.agent, c.id);
    expect(detail.status).toBe('CONTRACT_SIGNED');
    expect(detail.contract).toMatchObject({ signerName: 'Əli Məmmədov', signedAt: expect.any(String) });
    expect(detail.contract!.signedFile).toMatchObject({ stage: 'CONTRACT_SIGNED', mimeType: 'application/pdf' });
    // the client never sees the IP / user agent recorded for staff
    expect(detail.contract).not.toHaveProperty('signerIp');
    expect((await prisma.contract.findFirstOrThrow()).signerIp).toBeTruthy();
    expect((await staffNotifications(admin.user.id)).map((n) => n.title)).toContain(`${c.number}: müqavilə imzalandı`);

    const twice = await signContract(client.agent, c.id);
    expect(twice.status).toBe(409);
    expect(twice.body.error).toBe('INVALID_TRANSITION');
    expect(await prisma.document.count({ where: { stage: 'CONTRACT_SIGNED' } })).toBe(1);
  });

  it.each([
    ['agree false', { signerName: 'Əli Məmmədov', signature: SIGNATURE_DATA_URL, agree: false }],
    ['agree missing', { signerName: 'Əli Məmmədov', signature: SIGNATURE_DATA_URL }],
    ['short name', { signerName: 'Ə', signature: SIGNATURE_DATA_URL, agree: true }],
    ['not a data URL', { signerName: 'Əli Məmmədov', signature: 'https://evil.test/x.png', agree: true }],
    ['JPEG data URL', { signerName: 'Əli Məmmədov', signature: 'data:image/jpeg;base64,AAAA', agree: true }],
  ])('rejects %s with 400 VALIDATION', async (_label, body) => {
    const { client, admin } = await setup();
    const c = await driveCaseTo('CONTRACT_SENT', { client: client.agent, admin: admin.agent });
    const res = await client.agent.post(`/api/cases/${c.id}/contract/sign`).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
    expect((await clientCase(client.agent, c.id)).status).toBe('CONTRACT_SENT');
  });

  it('rejects signature data that is not a PNG image with 400', async () => {
    const { client, admin } = await setup();
    const c = await driveCaseTo('CONTRACT_SENT', { client: client.agent, admin: admin.agent });
    const res = await client.agent
      .post(`/api/cases/${c.id}/contract/sign`)
      .send({ signerName: 'Əli Məmmədov', signature: `data:image/png;base64,${Buffer.from('not a png').toString('base64')}`, agree: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_SIGNATURE');
    expect((await clientCase(client.agent, c.id)).status).toBe('CONTRACT_SENT');
    expect(await prisma.document.count({ where: { stage: 'CONTRACT_SIGNED' } })).toBe(0);
  });

  it('rejects a PNG with a valid header but corrupt image data with 400 (not 500)', async () => {
    const { client, admin } = await setup();
    const c = await driveCaseTo('CONTRACT_SENT', { client: client.agent, admin: admin.agent });
    const corrupt = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('garbage-after-png-magic')]);
    const res = await client.agent
      .post(`/api/cases/${c.id}/contract/sign`)
      .send({ signerName: 'Əli Məmmədov', signature: `data:image/png;base64,${corrupt.toString('base64')}`, agree: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_SIGNATURE');
    expect((await clientCase(client.agent, c.id)).status).toBe('CONTRACT_SENT');
  });

  it('409 when there is no contract to sign; 404 for another client', async () => {
    const { client, admin } = await setup();
    const other = await asClient();
    const c = await createCaseVia(client.agent);
    const res = await signContract(client.agent, c.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('INVALID_TRANSITION');

    const sent = await driveCaseTo('CONTRACT_SENT', { client: other.agent, admin: admin.agent });
    expect((await signContract(client.agent, sent.id)).status).toBe(404);
    expect((await clientCase(other.agent, sent.id)).status).toBe('CONTRACT_SENT');
  });

  it('can sign again after staff rejected the signature', async () => {
    const { client, admin } = await setup();
    const c = await driveCaseTo('CONTRACT_SIGNED', { client: client.agent, admin: admin.agent });
    expectStatus(await act(admin.agent, c.id, { action: 'REJECT_SIGNATURE', note: 'Signature does not match' }), 200);
    const detail = await clientCase(client.agent, c.id);
    expect(detail.status).toBe('CONTRACT_SENT');
    expect(detail.contract!.signedFile).toBeNull();
    expect(detail.staffNote).toBe('Signature does not match');
    expect((await signContract(client.agent, c.id)).status).toBe(200);
  });
});

describe('POST /api/cases/:id/messages', () => {
  it('posts a message visible in the case and notifies staff', async () => {
    const { client, admin } = await setup();
    const c = await createCaseVia(client.agent);
    const res = await client.agent.post(`/api/cases/${c.id}/messages`).send({ body: '  Salam, sualım var  ' });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatchObject({ caseId: c.id, authorId: client.user.id, body: 'Salam, sualım var' });
    const detail = await clientCase(client.agent, c.id);
    expect((detail.messages as { body: string; author: { role: string } }[])[0]).toMatchObject({
      body: 'Salam, sualım var',
      author: { role: 'CLIENT' },
    });
    const staff = await staffNotifications(admin.user.id);
    expect(staff.some((n) => n.title === `${c.number}: müştəridən yeni mesaj` && n.body === 'Salam, sualım var')).toBe(true);
  });

  it('validates the body and protects other clients’ cases', async () => {
    const { client } = await setup();
    const other = await asClient();
    const c = await createCaseVia(client.agent);
    expect((await client.agent.post(`/api/cases/${c.id}/messages`).send({ body: '   ' })).status).toBe(400);
    expect((await client.agent.post(`/api/cases/${c.id}/messages`).send({ body: 'x'.repeat(4001) })).status).toBe(400);
    expect((await other.agent.post(`/api/cases/${c.id}/messages`).send({ body: 'hi' })).status).toBe(404);
    expect(await prisma.caseMessage.count()).toBe(0);
  });
});

describe('review loop', () => {
  it('a rejected required document blocks resubmission until it is replaced', async () => {
    const { client, admin } = await setup();
    const c = await driveCaseTo('DOCUMENTS_REVIEW', { client: client.agent, admin: admin.agent });
    const req = await firstRequired(client.agent, c.id);
    const docId = (await clientCase(client.agent, c.id)).requirements.find((r) => r.id === req.id)!.documents[0].id;
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/documents/${docId}/review`).send({ status: 'REJECTED', note: 'Blurry' }), 200);
    expectStatus(await act(admin.agent, c.id, { action: 'REQUEST_CHANGES', note: 'Upload the passport again' }), 200);

    const blocked = await client.agent.post(`/api/cases/${c.id}/submit`);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toBe('REQUIRED_DOCUMENTS_MISSING');
    expect(blocked.body.message).toBe(req.id);

    expectStatus(await uploadDoc(client.agent, c.id, req.id, 'pasport-yeni.pdf'), 201);
    expect((await client.agent.post(`/api/cases/${c.id}/submit`)).status).toBe(200);
  });
});
