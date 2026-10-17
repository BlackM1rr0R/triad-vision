import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anon, asClient, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser, makePdf, PDF, PNG_BUFFER, SAMPLE } from '../helpers/files';
import { TEST_UPLOADS_DIR } from '../helpers/testEnv';
import { clientCase, createCaseVia, expectStatus } from '../helpers/workflow';
import { docCheckDeps, finishPendingChecks } from '../../src/lib/docCheck/index.js';
import { runVaultExpiryReminders } from '../../src/jobs/vault.js';

const privateDir = path.join(TEST_UPLOADS_DIR, 'private');
const vaultDir = path.join(privateDir, 'vault');
const inVault = (key: string) => fs.existsSync(path.join(vaultDir, key));
const inPrivate = (name: string) => fs.existsSync(path.join(privateDir, name));
const original = { ...docCheckDeps };
afterEach(() => Object.assign(docCheckDeps, original));

const upload = async (agent: Agent, fields: Record<string, string>, file: Buffer = Buffer.alloc(0), name = 'doc.pdf', contentType = 'application/pdf') => {
  const req = agent.post('/api/vault');
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  return req.attach('file', file.length ? file : await makePdf('vault'), { filename: name, contentType });
};

/** PNG with a real IHDR of the given size (enough for header-based checks). */
const pngOf = (w: number, h: number) => {
  const b = Buffer.from(PNG_BUFFER);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

const reqByKey = async (agent: Agent, caseId: string, key: string) =>
  (await clientCase(agent, caseId)).requirements.find((r) => (r as unknown as { key: string }).key === key)!;

describe('auth', () => {
  it('every /api/vault route needs a session', async () => {
    for (const [method, url] of [
      ['get', '/api/vault'],
      ['post', '/api/vault'],
      ['get', '/api/vault/suggestions?caseId=x'],
      ['post', '/api/vault/from-document'],
      ['patch', '/api/vault/x'],
      ['delete', '/api/vault/x'],
      ['get', '/api/vault/x/file'],
      ['post', '/api/vault/x/use'],
    ] as const) {
      expect((await anon()[method](url)).status, `${method} ${url}`).toBe(401);
    }
  });
});

describe('vault CRUD', () => {
  it('uploads, lists grouped by kind, serves the file, edits and deletes', async () => {
    const { agent, user } = await asClient();
    const res = expectStatus(await upload(agent, { kind: 'DIPLOMA', title: 'Bachelor', expiresAt: '' }), 201);
    expect(res.body.document).toMatchObject({ kind: 'DIPLOMA', title: 'Bachelor', mimeType: 'application/pdf', expiry: { status: 'none' } });
    expect(res.body.document.storageKey).toBeUndefined();
    expect(res.body.checks).toMatchObject({ level: 'ok', issues: [] });
    const row = await prisma.vaultDocument.findUniqueOrThrow({ where: { id: res.body.document.id } });
    expect(row.userId).toBe(user.id);
    expect(inVault(row.storageKey)).toBe(true);

    const soon = new Date(Date.now() + 20 * 86400_000).toISOString().slice(0, 10);
    expectStatus(await upload(agent, { kind: 'PASSPORT', title: 'Pass', ownerName: 'Ali Aliyev', expiresAt: soon }), 201);

    const list = expectStatus(await agent.get('/api/vault'), 200).body;
    expect(list.documents).toHaveLength(2);
    expect(Object.keys(list.groups).sort()).toEqual(['DIPLOMA', 'PASSPORT']);
    expect(list.groups.PASSPORT[0]).toMatchObject({ ownerName: 'Ali Aliyev', expiry: { status: 'soon' } });
    expect(list.groups.PASSPORT[0].expiry.daysLeft).toBeGreaterThanOrEqual(19);

    const file = await agent.get(`/api/vault/${row.id}/file`).buffer(true).parse(binaryParser);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['content-disposition']).toMatch(/^inline/);
    expect((file.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const patched = expectStatus(await agent.patch(`/api/vault/${row.id}`).send({ title: 'Master', expiresAt: '2020-01-01', ownerName: null }), 200).body.document;
    expect(patched).toMatchObject({ title: 'Master', ownerName: null, expiry: { status: 'expired' } });

    expectStatus(await agent.delete(`/api/vault/${row.id}`), 200);
    expect(await prisma.vaultDocument.count({ where: { id: row.id } })).toBe(0);
    expect(inVault(row.storageKey)).toBe(false);
  });

  it('rejects bad files and invalid metadata without leaving files behind', async () => {
    const { agent } = await asClient();
    const before = fs.readdirSync(vaultDir).length;
    expect((await upload(agent, { kind: 'OTHER', title: 'x' }, Buffer.from('MZ binary'), 'a.exe', 'application/octet-stream')).body.error).toBe('UNSUPPORTED_FILE_TYPE');
    const fake = await upload(agent, { kind: 'OTHER', title: 'x' }, Buffer.from('not really a pdf'), 'a.pdf');
    expect(fake.status).toBe(400);
    const badKind = await upload(agent, { kind: 'NOPE', title: 'x' });
    expect(badKind.status).toBe(400);
    expect((await agent.post('/api/vault').field('kind', 'OTHER').field('title', 'x')).body.error).toBe('FILE_REQUIRED');
    expect(fs.readdirSync(vaultDir).length).toBe(before);
  });

  it('isolates documents between users', async () => {
    const a = await asClient();
    const b = await asClient();
    const id = expectStatus(await upload(a.agent, { kind: 'CV', title: 'CV' }), 201).body.document.id;
    expect((await b.agent.get('/api/vault')).body.documents).toEqual([]);
    for (const res of [
      await b.agent.get(`/api/vault/${id}/file`),
      await b.agent.patch(`/api/vault/${id}`).send({ title: 'mine' }),
      await b.agent.delete(`/api/vault/${id}`),
      await b.agent.post(`/api/vault/${id}/use`).send({ caseId: 'x', requirementId: 'y' }),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('VAULT_DOCUMENT_NOT_FOUND');
    }
    expect((await prisma.vaultDocument.findUniqueOrThrow({ where: { id } })).title).toBe('CV');
  });

  it('PASSPORT uploads prefill expiry and holder from the MRZ, and store the checks', async () => {
    const { agent } = await asClient();
    docCheckDeps.ocrAvailable = () => true;
    docCheckDeps.scan = vi.fn().mockResolvedValue({
      ok: true,
      fields: { firstName: 'Leyla', lastName: 'Huseynova', birthDate: '1995-03-02', passportNumber: 'C07654321', nationality: 'AZE', sex: 'F', expiryDate: '2027-01-15' },
      checks: { valid: true, documentNumber: true, birthDate: true, expiryDate: true, composite: true },
      warnings: [],
    });
    const res = expectStatus(await upload(agent, { kind: 'PASSPORT', title: 'Pass' }, pngOf(1800, 1200), 'pass.png', 'image/png'), 201);
    expect(res.body.prefilled).toBe(true);
    expect(res.body.document).toMatchObject({ ownerName: 'Leyla Huseynova', expiresAt: '2027-01-15T00:00:00.000Z' });
    expect(res.body.checks.issues).toEqual([expect.objectContaining({ code: 'PASSPORT_EXPIRES_SOON', level: 'error' })]);
    const row = await prisma.vaultDocument.findUniqueOrThrow({ where: { id: res.body.document.id } });
    expect(row.checks).toMatchObject({ level: 'error' });
    expect(row.ocr).toMatchObject({ fields: { passportNumber: 'C07654321' } });

    // Explicit values win over the MRZ.
    const own = expectStatus(await upload(agent, { kind: 'PASSPORT', title: 'Pass 2', ownerName: 'Child', expiresAt: '2031-05-05' }, pngOf(1800, 1200), 'p.png', 'image/png'), 201);
    expect(own.body.document).toMatchObject({ ownerName: 'Child', expiresAt: '2031-05-05T00:00:00.000Z' });
  });
});

describe('use in case', () => {
  it('copies the file into the case as a pending document linked to the vault entry', async () => {
    const { agent, user } = await asClient();
    const c = await createCaseVia(agent);
    const passportReq = await reqByKey(agent, c.id, 'PASSPORT');
    const v = expectStatus(await upload(agent, { kind: 'PASSPORT', title: 'Pass' }), 201).body.document;

    const res = expectStatus(await agent.post(`/api/vault/${v.id}/use`).send({ caseId: c.id, requirementId: passportReq.id }), 201);
    expect(res.body.document).toMatchObject({ caseId: c.id, requirementId: passportReq.id, stage: 'INITIAL', status: 'PENDING', vaultDocumentId: v.id, uploadedById: user.id });
    expect(res.body.checks).toMatchObject({ level: 'ok' });
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: res.body.document.id } });
    const vaultRow = await prisma.vaultDocument.findUniqueOrThrow({ where: { id: v.id } });
    expect(doc.storedName).not.toBe(vaultRow.storageKey);
    expect(inPrivate(doc.storedName)).toBe(true);
    expect(fs.readFileSync(path.join(privateDir, doc.storedName)).equals(fs.readFileSync(path.join(vaultDir, vaultRow.storageKey)))).toBe(true);
    expect(doc.checks).toMatchObject({ level: 'ok' });
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'DOCUMENT_UPLOADED' } })).toBe(1);

    // Deleting the vault entry keeps the case copy.
    expectStatus(await agent.delete(`/api/vault/${v.id}`), 200);
    expect(inPrivate(doc.storedName)).toBe(true);
  });

  it('runs the requirement checks on the copy (a PDF for the photo requirement)', async () => {
    const { agent } = await asClient();
    const c = await createCaseVia(agent);
    const photoReq = await reqByKey(agent, c.id, 'PHOTO');
    const v = expectStatus(await upload(agent, { kind: 'PHOTO', title: 'Photo as PDF' }), 201).body.document;
    const res = expectStatus(await agent.post(`/api/vault/${v.id}/use`).send({ caseId: c.id, requirementId: photoReq.id }), 201);
    expect(res.body.checks.issues).toEqual([{ code: 'PHOTO_NOT_IMAGE', level: 'error' }]);
  });

  it('enforces ownership and the upload stage rules', async () => {
    const { agent } = await asClient();
    const other = await asClient();
    const c = await createCaseVia(agent);
    const otherCase = await createCaseVia(other.agent);
    const v = expectStatus(await upload(agent, { kind: 'CV', title: 'CV' }), 201).body.document;
    const cvReq = await reqByKey(agent, c.id, 'CV');
    const embassyReq = await prisma.documentRequirement.create({ data: { caseId: c.id, stage: 'EMBASSY', key: 'VIDEX', title: { az: 'V', de: 'V', en: 'V', ru: 'V' }, required: true, sortOrder: 0 } });
    const otherReq = (await clientCase(other.agent, otherCase.id)).requirements[0];

    expect((await agent.post(`/api/vault/${v.id}/use`).send({ caseId: otherCase.id, requirementId: otherReq.id })).body.error).toBe('CASE_NOT_FOUND');
    expect((await agent.post(`/api/vault/${v.id}/use`).send({ caseId: c.id, requirementId: otherReq.id })).body.error).toBe('INVALID_REQUIREMENT');
    expect((await agent.post(`/api/vault/${v.id}/use`).send({ caseId: c.id, requirementId: embassyReq.id })).body.error).toBe('INVALID_REQUIREMENT');

    await prisma.case.update({ where: { id: c.id }, data: { status: 'DOCUMENTS_REVIEW' } });
    const closed = await agent.post(`/api/vault/${v.id}/use`).send({ caseId: c.id, requirementId: cvReq.id });
    expect(closed.status).toBe(409);
    expect(closed.body.error).toBe('UPLOAD_NOT_ALLOWED');
    expect(await prisma.document.count({ where: { caseId: c.id } })).toBe(0);
  });
});

describe('from-document and suggestions', () => {
  it('saves an own case document to the vault; others cannot', async () => {
    const { agent } = await asClient();
    const other = await asClient();
    const c = await createCaseVia(agent);
    const req = await reqByKey(agent, c.id, 'DIPLOMA');
    const doc = expectStatus(await agent.post(`/api/cases/${c.id}/documents`).field('requirementId', req.id).attach('file', await makePdf('dip'), { filename: 'diploma.pdf', ...PDF }), 201).body.document;

    expect((await other.agent.post('/api/vault/from-document').send({ documentId: doc.id, kind: 'DIPLOMA', title: 'x' })).status).toBe(404);
    const res = expectStatus(await agent.post('/api/vault/from-document').send({ documentId: doc.id, kind: 'DIPLOMA', title: 'My diploma' }), 201);
    expect(res.body.document).toMatchObject({ kind: 'DIPLOMA', title: 'My diploma', filename: 'diploma.pdf', mimeType: 'application/pdf' });
    const row = await prisma.vaultDocument.findUniqueOrThrow({ where: { id: res.body.document.id } });
    expect(inVault(row.storageKey)).toBe(true);
    const caseDoc = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(inPrivate(caseDoc.storedName)).toBe(true);
  });

  it('suggests vault documents per open requirement by kind', async () => {
    const { agent } = await asClient();
    const other = await asClient();
    const c = await createCaseVia(agent);
    await upload(agent, { kind: 'PASSPORT', title: 'Pass' });
    await upload(agent, { kind: 'TRANSCRIPT', title: 'Transcript' });
    await upload(agent, { kind: 'DIPLOMA', title: 'Diploma' });
    await upload(agent, { kind: 'OTHER', title: 'Misc' });
    await upload(other.agent, { kind: 'PASSPORT', title: 'Foreign pass' });

    const res = expectStatus(await agent.get(`/api/vault/suggestions?caseId=${c.id}`), 200).body;
    expect(res.stage).toBe('INITIAL');
    const byKey = Object.fromEntries(res.suggestions.map((s: { key: string; documents: { title: string }[] }) => [s.key, s.documents.map((d) => d.title)]));
    expect(byKey.PASSPORT).toEqual(['Pass']);
    expect(byKey.DIPLOMA).toEqual(['Diploma', 'Transcript']);
    expect(byKey.PHOTO).toEqual([]);
    expect(res.suggestions.every((s: { title: unknown }) => !!s.title)).toBe(true);

    expect((await other.agent.get(`/api/vault/suggestions?caseId=${c.id}`)).status).toBe(404);
    await prisma.case.update({ where: { id: c.id }, data: { status: 'DOCUMENTS_REVIEW' } });
    expect((await agent.get(`/api/vault/suggestions?caseId=${c.id}`)).body).toEqual({ stage: null, suggestions: [] });
  });
});

describe('case upload returns checks', () => {
  it('stores and returns the checks of a case document', async () => {
    const { agent } = await asClient();
    const c = await createCaseVia(agent);
    const photo = await reqByKey(agent, c.id, 'PHOTO');
    const pdf = expectStatus(await agent.post(`/api/cases/${c.id}/documents`).field('requirementId', photo.id).attach('file', await makePdf('x'), { filename: 'photo.pdf', ...PDF }), 201);
    expect(pdf.body.checks).toMatchObject({ level: 'error', issues: [{ code: 'PHOTO_NOT_IMAGE' }] });
    expect(pdf.body.document.checks).toEqual(pdf.body.checks);

    const tiny = expectStatus(await agent.post(`/api/cases/${c.id}/documents`).field('requirementId', photo.id).attach('file', SAMPLE.png, { filename: 'p.png', contentType: 'image/png' }), 201);
    expect(tiny.body.checks).toMatchObject({ level: 'warn', issues: [{ code: 'LOW_RESOLUTION', params: { width: 1, height: 1 } }] });
    const row = await prisma.document.findUniqueOrThrow({ where: { id: tiny.body.document.id } });
    expect(row.checks).toMatchObject({ level: 'warn' });
    expect(row.checkedAt).not.toBeNull();

    // The client sees them in the case detail (and staff in the admin list, same loader).
    const detail = await clientCase(agent, c.id);
    const docs = detail.requirements.find((r) => r.id === photo.id)!.documents as unknown as { checks: { level: string } }[];
    expect(docs.map((d) => d.checks.level).sort()).toEqual(['error', 'warn']);
  });

  it('a passport OCR timeout stays pending until the OCR job result arrives, then notifies the client', async () => {
    const { agent, user } = await asClient();
    const c = await createCaseVia(agent);
    const pass = await reqByKey(agent, c.id, 'PASSPORT');
    docCheckDeps.ocrAvailable = () => true;
    docCheckDeps.scan = vi.fn().mockResolvedValue({ ok: false, error: 'OCR_TIMEOUT' });
    const res = expectStatus(await agent.post(`/api/cases/${c.id}/documents`).field('requirementId', pass.id).attach('file', pngOf(2000, 1400), { filename: 'pass.png', contentType: 'image/png' }), 201);
    expect(res.body.checks).toMatchObject({ level: 'ok', pending: true });
    const id = res.body.document.id;
    expect((await prisma.document.findUniqueOrThrow({ where: { id } })).checkedAt).toBeNull();

    // Nothing to do before the OCR job ran.
    expect(await finishPendingChecks()).toBe(0);
    await prisma.document.update({ where: { id }, data: { ocrAt: new Date(), ocr: { mrz: null, raw: 'xx', confidence: 10, at: new Date().toISOString(), error: 'MRZ_NOT_FOUND' } } });
    expect(await finishPendingChecks()).toBe(1);
    const row = await prisma.document.findUniqueOrThrow({ where: { id } });
    expect(row.checks).toMatchObject({ level: 'warn', issues: [{ code: 'WRONG_TYPE_SUSPECTED' }] });
    expect((row.checks as { pending?: boolean }).pending).toBeUndefined();
    expect(row.checkedAt).not.toBeNull();
    const n = await prisma.notification.findFirst({ where: { userId: user.id, type: 'DOCUMENT_CHECK' } });
    expect(n).toMatchObject({ caseId: c.id, link: `/account/cases/${c.id}` });
    expect(await finishPendingChecks()).toBe(0);
  });
});

describe('expiry reminders', () => {
  it('notifies once per 90 / 30 day threshold', async () => {
    const { agent, user } = await asClient();
    const now = new Date('2026-10-17T08:00:00Z');
    const id = expectStatus(await upload(agent, { kind: 'PASSPORT', title: 'Pass', expiresAt: '2027-01-05' }), 201).body.document.id; // 80 days
    await upload(agent, { kind: 'DIPLOMA', title: 'No expiry' });
    await upload(agent, { kind: 'CV', title: 'Far', expiresAt: '2028-01-01' });

    expect(await runVaultExpiryReminders(now)).toBe(1);
    expect(await runVaultExpiryReminders(now)).toBe(0);
    expect(await runVaultExpiryReminders(new Date('2026-11-01T08:00:00Z'))).toBe(0); // still the 90-day window
    expect(await runVaultExpiryReminders(new Date('2026-12-10T08:00:00Z'))).toBe(1); // 26 days left
    expect(await runVaultExpiryReminders(new Date('2026-12-20T08:00:00Z'))).toBe(0);
    const notes = await prisma.notification.findMany({ where: { userId: user.id, type: 'VAULT_EXPIRY' } });
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ link: '/account/vault' });

    // A corrected expiry date starts fresh; expired documents are not reminded.
    await prisma.vaultDocument.update({ where: { id }, data: { expiresAt: new Date('2027-02-01T00:00:00Z') } });
    expect(await runVaultExpiryReminders(new Date('2026-12-20T08:00:00Z'))).toBe(1);
    expect(await runVaultExpiryReminders(new Date('2027-03-01T08:00:00Z'))).toBe(0);
  });
});
