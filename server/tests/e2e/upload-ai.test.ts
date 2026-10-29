import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { asAdmin, asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { expectStatus, clientCase, createCaseVia } from '../helpers/workflow';
import { pagePng } from '../helpers/syntheticImages';
import { buildMrz, monthsFromNow } from './passport-scan.fixtures';
import { setAiTransport, setKeyInfoFetcher, setModelsFetcher, type ChatRequest, type StreamChunk } from '../../src/lib/ai/openrouter.js';
import { clearAiSettingsCache } from '../../src/lib/ai/settings.js';
import { CHEAP_MODEL } from '../../src/lib/ai/complete.js';
import { aiDocCheckDeps, waitForAiDocChecks } from '../../src/lib/aiDocs/docCheck.js';
import { subscribe, type RealtimeEvent } from '../../src/lib/messaging/realtime.js';
import { clearUploadAiSettingsCache, saveUploadAiSettings, uploadAiDeps, waitForUploadAi } from '../../src/lib/uploadAi/index.js';
import { qualityDeps } from '../../src/lib/uploadAi/quality.js';
import { stopDecoder } from '../../src/lib/uploadAi/decoder.js';
import { docFilePath } from '../../src/lib/drive/cases.js';
import fs from 'node:fs/promises';

process.env.OPENROUTER_API_KEY = 'sk-or-test-not-a-real-key';

// ─── Fake OpenRouter ────────────────────────────────────────────────────

type Round = StreamChunk[] | 'fail';
const fake = { requests: [] as ChatRequest[], script: [] as Round[] };
const jsonRound = (obj: unknown, cost = 0.0003): StreamChunk[] => {
  const text = JSON.stringify(obj);
  return [
    { choices: [{ delta: { content: text.slice(0, 7) } }] },
    { choices: [{ delta: { content: text.slice(7) } }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1200, completion_tokens: 80, cost } },
  ];
};
const DIPLOMA_ANSWER = { docType: 'DIPLOMA', confidence: 0.9, holderName: 'ALI MAMMADOV', firstName: 'Ali', lastName: 'Mammadov', issueDate: '2015-06-30', issuingCountry: 'AZE', language: 'az', bogus: 'x' };

const realDecode = qualityDeps.decode;

beforeEach(() => {
  fake.requests = [];
  fake.script = [];
  clearAiSettingsCache();
  clearUploadAiSettingsCache();
  uploadAiDeps.autoEnabled = () => true;
  aiDocCheckDeps.autoEnabled = () => false;
  qualityDeps.decode = realDecode;
  setKeyInfoFetcher(async () => null);
  setModelsFetcher(async () => []);
  setAiTransport(async function* (req) {
    fake.requests.push(JSON.parse(JSON.stringify(req)) as ChatRequest);
    const round = fake.script.shift() ?? jsonRound(DIPLOMA_ANSWER);
    if (round === 'fail') throw new Error('upstream down');
    for (const chunk of round) yield chunk;
  });
});

afterEach(async () => {
  await waitForAiDocChecks();
  await waitForUploadAi();
});

afterAll(() => {
  setAiTransport(null);
  setKeyInfoFetcher(null);
  setModelsFetcher(null);
  uploadAiDeps.autoEnabled = () => false;
  qualityDeps.decode = realDecode;
  delete process.env.OPENROUTER_API_KEY;
  stopDecoder();
});

// ─── Fixtures ───────────────────────────────────────────────────────────

const EXPIRY = monthsFromNow(4); // inside the 6-month window → EXPIRES_SOON
const passportPdf = async (opts: { surname?: string; given?: string; expiry?: string } = {}) => {
  const [l1, l2] = buildMrz({ surname: opts.surname ?? 'MAMMADOV', given: opts.given ?? 'ALI', docNo: 'C01234567', birth: '1990-01-15', expiry: opts.expiry ?? EXPIRY });
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Courier);
  const page = doc.addPage([595, 842]);
  page.drawText('REPUBLIC OF AZERBAIJAN', { x: 40, y: 700, size: 14, font });
  page.drawText(l1, { x: 20, y: 120, size: 12, font });
  page.drawText(l2, { x: 20, y: 100, size: 12, font });
  return Buffer.from(await doc.save());
};

const setupCase = async () => {
  const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov' });
  const c = await createCaseVia(client.agent);
  const reqs = (await clientCase(client.agent, c.id)).requirements as unknown as { id: string; key: string | null; stage: string }[];
  const req = (key: string) => reqs.find((r) => r.key === key)!;
  return { client, c, req };
};

const upload = (agent: Agent, caseId: string, requirementId: string, data: Buffer, filename: string, contentType: string) =>
  agent.post(`/api/cases/${caseId}/documents`).field('requirementId', requirementId).attach('file', data, { filename, contentType });

const insightOfDoc = (documentId: string) => prisma.documentInsight.findUniqueOrThrow({ where: { documentId } });

const capture = (userId: string) => {
  const events: RealtimeEvent[] = [];
  const off = subscribe(userId, (ev) => {
    if (ev.type === 'upload-ai.ready') events.push(ev);
  });
  return { events, off };
};

// ─── 1. Recognition without AI ─────────────────────────────────────────

describe('recognition after a client upload', () => {
  it('reads a passport from the MRZ without any AI call, proposes name + expiry and pushes a realtime event', async () => {
    const { client, c, req } = await setupCase();
    const rt = capture(client.user.id);
    const res = expectStatus(await upload(client.agent, c.id, req('PASSPORT').id, await passportPdf(), 'scan.pdf', 'application/pdf'), 201);
    expect(res.body.quality).toMatchObject({ level: 'OK', kind: 'pdf' });
    await waitForUploadAi();
    rt.off();

    const i = await insightOfDoc(res.body.document.id);
    expect(i).toMatchObject({ docType: 'PASSPORT', source: 'MRZ', status: 'PROPOSED', costMicros: 0 });
    expect(i.confidence).toBeGreaterThan(0.9);
    expect(i.fields).toMatchObject({ lastName: 'Mammadov', firstName: 'Ali', documentNumber: 'C01234567', expiryDate: EXPIRY, issuingCountry: 'AZE' });
    expect(i.proposedName).toBe(`Mammadov_Ali_Reisepass_${EXPIRY}.pdf`);
    expect(i.expiryDate?.toISOString().slice(0, 10)).toBe(EXPIRY);
    expect(i.flags).toEqual(['EXPIRES_SOON']); // name matches "Əli Məmmədov"
    expect((i.proposals as { actions: string[] }).actions.sort()).toEqual(['expiry', 'rename']);
    expect(fake.requests).toHaveLength(0);
    expect(rt.events.map((e) => e.payload)).toEqual([expect.objectContaining({ documentId: res.body.document.id, docType: 'PASSPORT', status: 'PROPOSED', caseId: c.id })]);

    // The client sees "Recognised as: Passport (valid until …)".
    const mine = expectStatus(await client.agent.get(`/api/upload-ai/cases/${c.id}`), 200).body.insights;
    expect(mine).toEqual([expect.objectContaining({ documentId: res.body.document.id, ready: true, docType: 'PASSPORT', expiryDate: EXPIRY, expectedType: 'PASSPORT', flags: ['EXPIRES_SOON'] })]);
    expect(mine[0]).not.toHaveProperty('fields'); // no internal data for the client
  });

  it('accepting renames the document and sets the expiry date (feeds /admin/expiring); audited', async () => {
    const { client, c, req } = await setupCase();
    const staff = await asStaff();
    const res = expectStatus(await upload(client.agent, c.id, req('PASSPORT').id, await passportPdf(), 'scan.pdf', 'application/pdf'), 201);
    await waitForUploadAi();
    const i = await insightOfDoc(res.body.document.id);

    const list = expectStatus(await staff.agent.get(`/api/upload-ai/cases/${c.id}`), 200).body;
    expect(list.open).toBe(1);
    const acc = expectStatus(await staff.agent.post(`/api/upload-ai/insights/${i.id}/accept`).send({}), 200).body;
    expect(acc.insight.status).toBe('ACCEPTED');
    expect(acc.changes.map((ch: { action: string }) => ch.action).sort()).toEqual(['expiry', 'rename']);

    const doc = await prisma.document.findUniqueOrThrow({ where: { id: res.body.document.id } });
    expect(doc.originalName).toBe(`Mammadov_Ali_Reisepass_${EXPIRY}.pdf`);
    expect(doc.expiresAt?.toISOString().slice(0, 10)).toBe(EXPIRY);
    const expiring = expectStatus(await staff.agent.get('/api/admin/expiring?days=180'), 200).body.items as { documentId?: string; id?: string }[];
    expect(JSON.stringify(expiring)).toContain(doc.id);
    expect(await prisma.auditLog.count({ where: { action: 'UPLOAD_AI_ACCEPTED', target: `insight:${i.id}`, actorId: staff.user.id } })).toBe(1);

    // A decided insight cannot be accepted twice.
    expectStatus(await staff.agent.post(`/api/upload-ai/insights/${i.id}/accept`).send({}), 409);
  });
});

// ─── 2. AI path ─────────────────────────────────────────────────────────

describe('AI recognition (fake transport)', () => {
  it('a diploma uploaded as the passport: one cheap vision call, WRONG_REQUIREMENT, link proposal, client warning', async () => {
    const { client, c, req } = await setupCase();
    const res = expectStatus(await upload(client.agent, c.id, req('PASSPORT').id, pagePng({ width: 1400, height: 1800 }), 'scan.png', 'image/png'), 201);
    expect(res.body.quality).toMatchObject({ level: 'OK', kind: 'image' });
    await waitForUploadAi();

    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0].model).toBe(CHEAP_MODEL);
    const content = fake.requests[0].messages[1].content as unknown as { type: string; text?: string; image_url?: { url: string } }[];
    expect(content.map((p) => p.type)).toEqual(['text', 'image_url']);
    expect(content[1].image_url!.url.startsWith('data:image/jpeg;base64,')).toBe(true); // downscaled JPEG
    expect(content[0].text).toContain('untrusted_document_text'); // the file name is data
    expect(fake.requests[0].provider).toMatchObject({ data_collection: 'deny' }); // privacy mode respected

    const i = await insightOfDoc(res.body.document.id);
    expect(i).toMatchObject({ docType: 'DIPLOMA', source: 'AI', model: CHEAP_MODEL, status: 'PROPOSED', proposedRequirementId: req('DIPLOMA').id });
    expect(i.costMicros).toBe(300);
    expect(i.fields).toEqual({ holderName: 'ALI MAMMADOV', firstName: 'Ali', lastName: 'Mammadov', issueDate: '2015-06-30', issuingCountry: 'AZE', language: 'az' });
    expect(i.flags).toEqual(['WRONG_REQUIREMENT']);
    expect(i.proposedName).toBe('Mammadov_Ali_Diplom_2015-06-30.png');
    // Cost booked on the client (CLIENT scope).
    expect(await prisma.aiMessage.count({ where: { toolName: 'upload-recognition', conversation: { userId: client.user.id, scope: 'CLIENT' } } })).toBe(1);

    const mine = expectStatus(await client.agent.get(`/api/upload-ai/cases/${c.id}`), 200).body.insights[0];
    expect(mine).toMatchObject({ docType: 'DIPLOMA', expectedType: 'PASSPORT', flags: ['WRONG_REQUIREMENT'], acknowledged: false });
    // "Upload anyway"
    expect(expectStatus(await client.agent.post(`/api/upload-ai/documents/${res.body.document.id}/ack`), 200).body.insight.acknowledged).toBe(true);

    // Staff link it to the diploma requirement (one action only).
    const staff = await asStaff();
    const acc = expectStatus(await staff.agent.post(`/api/upload-ai/insights/${i.id}/accept`).send({ actions: ['link'] }), 200).body;
    expect(acc.insight.status).toBe('PROPOSED'); // rename still open
    expect(acc.insight.proposals.actions).toEqual(['rename']);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: res.body.document.id } })).requirementId).toBe(req('DIPLOMA').id);
  });

  it('"Change type" rebuilds the proposals without AI; "Reject" closes the card (audited)', async () => {
    const { client, c, req } = await setupCase();
    const staff = await asStaff();
    const res = expectStatus(await upload(client.agent, c.id, req('PASSPORT').id, pagePng(), 'scan.png', 'image/png'), 201);
    await waitForUploadAi();
    const i = await insightOfDoc(res.body.document.id);
    const changed = expectStatus(await staff.agent.post(`/api/upload-ai/insights/${i.id}/type`).send({ docType: 'PASSPORT' }), 200).body.insight;
    expect(changed).toMatchObject({ docType: 'PASSPORT', source: 'STAFF', confidence: 1, proposedRequirementId: null });
    expect(changed.flags).not.toContain('WRONG_REQUIREMENT');
    expect(fake.requests).toHaveLength(1);
    expectStatus(await staff.agent.post(`/api/upload-ai/insights/${i.id}/type`).send({ docType: 'NOPE' }), 400);

    const rej = expectStatus(await staff.agent.post(`/api/upload-ai/insights/${i.id}/reject`), 200).body.insight;
    expect(rej.status).toBe('REJECTED');
    expect(rej.proposals.actions).toEqual([]);
    expect(await prisma.auditLog.count({ where: { action: 'UPLOAD_AI_REJECTED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'UPLOAD_AI_TYPE_CHANGED' } })).toBe(1);
  });

  it('caches by sha256: the same file again costs no second call', async () => {
    const { client, c, req } = await setupCase();
    const png = pagePng({ seed: 11 });
    expectStatus(await upload(client.agent, c.id, req('DIPLOMA').id, png, 'a.png', 'image/png'), 201);
    await waitForUploadAi();
    const res = expectStatus(await upload(client.agent, c.id, req('DIPLOMA').id, png, 'b.png', 'image/png'), 201);
    await waitForUploadAi();
    expect(fake.requests).toHaveLength(1);
    expect(await insightOfDoc(res.body.document.id)).toMatchObject({ docType: 'DIPLOMA', source: 'CACHE', costMicros: 0 });
  });

  it('reuses the AI document check of a client upload instead of a second call', async () => {
    aiDocCheckDeps.autoEnabled = () => true;
    const { client, c, req } = await setupCase();
    fake.script.push(
      jsonRound({ verdict: 'ok', documentType: 'Bachelor diploma', language: 'Azerbaijani', issues: [], fields: { name: 'MAMMADOV ALI', issueDate: '2014-07-01' }, apostille: 'present', translationNeeded: true }),
    );
    const res = expectStatus(await upload(client.agent, c.id, req('DIPLOMA').id, pagePng({ seed: 3 }), 'scan.png', 'image/png'), 201);
    await waitForAiDocChecks();
    await waitForUploadAi();
    expect(fake.requests).toHaveLength(1); // only the doc check
    expect(await insightOfDoc(res.body.document.id)).toMatchObject({ docType: 'DIPLOMA', source: 'DOC_CHECK', flags: [] });
  });

  it('AI failures and switched-off AI leave a proposal-less insight, never a failed upload', async () => {
    const { client, c, req } = await setupCase();
    fake.script.push('fail');
    const res = expectStatus(await upload(client.agent, c.id, req('CV').id, pagePng({ seed: 5 }), 'scan.png', 'image/png'), 201);
    await waitForUploadAi();
    expect(await insightOfDoc(res.body.document.id)).toMatchObject({ docType: 'OTHER', source: 'NONE', status: 'PROPOSED', error: 'UPSTREAM' });

    const admin = await asSuperAdmin();
    expectStatus(await admin.agent.put('/api/upload-ai/settings').send({ aiEnabled: false }), 200);
    const res2 = expectStatus(await upload(client.agent, c.id, req('CV').id, pagePng({ seed: 6 }), 'Lebenslauf.png', 'image/png'), 201);
    await waitForUploadAi();
    expect(fake.requests).toHaveLength(1);
    expect(await insightOfDoc(res2.body.document.id)).toMatchObject({ docType: 'CV', source: 'FILENAME' });
  });
});

// ─── 3. Auto-apply ──────────────────────────────────────────────────────

describe('auto-apply (super admin setting)', () => {
  it('applies the allowed actions above the threshold, audited as UPLOAD_AI_AUTO_APPLIED; below it nothing changes', async () => {
    await saveUploadAiSettings({ autoApply: { enabled: true, threshold: 0.95, rename: true, expiry: true, link: false, move: false } });
    const { client, c, req } = await setupCase();
    const res = expectStatus(await upload(client.agent, c.id, req('PASSPORT').id, await passportPdf(), 'scan.pdf', 'application/pdf'), 201);
    await waitForUploadAi();
    const i = await insightOfDoc(res.body.document.id);
    expect(i.status).toBe('AUTO_APPLIED');
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: res.body.document.id } });
    expect(doc.originalName).toBe(`Mammadov_Ali_Reisepass_${EXPIRY}.pdf`);
    expect(doc.expiresAt?.toISOString().slice(0, 10)).toBe(EXPIRY);
    expect(await prisma.auditLog.count({ where: { action: 'UPLOAD_AI_AUTO_APPLIED', target: `insight:${i.id}`, actorId: null } })).toBe(1);

    // AI confidence 0.9 < 0.95: proposals only.
    const res2 = expectStatus(await upload(client.agent, c.id, req('PASSPORT').id, pagePng({ seed: 9 }), 'scan.png', 'image/png'), 201);
    await waitForUploadAi();
    const i2 = await insightOfDoc(res2.body.document.id);
    expect(i2.status).toBe('PROPOSED');
    expect((await prisma.document.findUniqueOrThrow({ where: { id: res2.body.document.id } })).originalName).toBe('scan.png');
  });

  it('is off by default (propose only)', async () => {
    const { client, c, req } = await setupCase();
    const res = expectStatus(await upload(client.agent, c.id, req('PASSPORT').id, await passportPdf(), 'scan.pdf', 'application/pdf'), 201);
    await waitForUploadAi();
    expect((await insightOfDoc(res.body.document.id)).status).toBe('PROPOSED');
    expect((await prisma.document.findUniqueOrThrow({ where: { id: res.body.document.id } })).originalName).toBe('scan.pdf');
  });
});

// ─── 4. Scan quality ────────────────────────────────────────────────────

describe('scan quality check', () => {
  it('OK for a sharp scan, BAD for a blurred or cut-off one — returned in the upload response', async () => {
    uploadAiDeps.autoEnabled = () => false; // quality only
    const { client, c, req } = await setupCase();
    const ok = expectStatus(await upload(client.agent, c.id, req('DIPLOMA').id, pagePng({ width: 1400, height: 1800 }), 'ok.png', 'image/png'), 201);
    expect(ok.body.quality).toMatchObject({ level: 'OK', reasons: [] });
    const blurred = expectStatus(await upload(client.agent, c.id, req('DIPLOMA').id, pagePng({ width: 1400, height: 1800, blur: 3 }), 'blur.png', 'image/png'), 201);
    expect(blurred.body.quality.level).toBe('BAD');
    expect(blurred.body.quality.reasons).toEqual([expect.objectContaining({ code: 'BLURRY', level: 'BAD' })]);
    const cut = expectStatus(await upload(client.agent, c.id, req('DIPLOMA').id, pagePng({ width: 1400, height: 1800, cut: true }), 'cut.png', 'image/png'), 201);
    expect(cut.body.quality).toMatchObject({ level: 'BAD', reasons: [expect.objectContaining({ code: 'CUT_OFF' })] });
    const small = expectStatus(await upload(client.agent, c.id, req('DIPLOMA').id, pagePng({ width: 400, height: 500 }), 'small.png', 'image/png'), 201);
    expect(small.body.quality.reasons.map((r: { code: string }) => r.code)).toContain('LOW_RESOLUTION');
    // Stored for the staff "Low quality" badge.
    expect((await insightOfDoc(blurred.body.document.id)).qualityLevel).toBe('BAD');
  });

  it('"Ask client to re-upload" rejects with a localized reason and notifies the client', async () => {
    uploadAiDeps.autoEnabled = () => false;
    const client = await asClient({ firstName: 'Anna', lastName: 'Petrova', locale: 'ru' });
    const c = await createCaseVia(client.agent);
    const reqs = (await clientCase(client.agent, c.id)).requirements as unknown as { id: string; key: string | null }[];
    const res = expectStatus(await upload(client.agent, c.id, reqs.find((r) => r.key === 'DIPLOMA')!.id, pagePng({ width: 1400, height: 1800, blur: 3 }), 'blur.png', 'image/png'), 201);
    const staff = await asStaff();
    const r = expectStatus(await staff.agent.post(`/api/upload-ai/documents/${res.body.document.id}/request-reupload`), 200).body;
    expect(r.note).toContain('Фото размыто');
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: res.body.document.id } });
    expect(doc).toMatchObject({ status: 'REJECTED', reviewNote: r.note });
    const n = await prisma.notification.findFirst({ where: { userId: client.user.id, type: 'DOCUMENT_REJECTED' } });
    expect(n?.body).toContain('Фото размыто');
    expect(await prisma.auditLog.count({ where: { action: 'UPLOAD_AI_REUPLOAD_REQUESTED', target: doc.id } })).toBe(1);
    expectStatus(await staff.agent.post(`/api/upload-ai/documents/${res.body.document.id}/request-reupload`), 409);
  });

  it('the upload never fails when the analysis does', async () => {
    const { client, c, req } = await setupCase();
    // No image library / the decoder throws: header-only quality, still 201.
    qualityDeps.decode = async () => null;
    const a = expectStatus(await upload(client.agent, c.id, req('DIPLOMA').id, pagePng({ width: 1400, height: 1800, seed: 21 }), 'a.png', 'image/png'), 201);
    expect(a.body.quality).toMatchObject({ level: 'OK' });
    qualityDeps.decode = async () => {
      throw new Error('decoder exploded');
    };
    expectStatus(await upload(client.agent, c.id, req('DIPLOMA').id, pagePng({ seed: 23 }), 'c.png', 'image/png'), 201);
    qualityDeps.decode = realDecode;
    // Corrupt images (a PNG signature only; a JPEG header with garbage) crash Skia — only in the decoder
    // child: the API answers, the file is marked UNREADABLE, and the next image decodes again.
    const junk = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
    const j = expectStatus(await upload(client.agent, c.id, req('DIPLOMA').id, junk, 'junk.png', 'image/png'), 201);
    expect(j.body.quality).toMatchObject({ level: 'BAD', reasons: [{ code: 'UNREADABLE', level: 'BAD' }] });
    const jpgJunk = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]), Buffer.alloc(64)]);
    expectStatus(await upload(client.agent, c.id, req('DIPLOMA').id, jpgJunk, 'junk.jpg', 'image/jpeg'), 201);
    const after = expectStatus(await upload(client.agent, c.id, req('DIPLOMA').id, pagePng({ width: 1400, height: 1800, blur: 3 }), 'blur.png', 'image/png'), 201);
    expect(after.body.quality.reasons[0].code).toBe('BLURRY');
    // The file vanishes before the background step: the insight is marked FAILED, nothing else happens.
    uploadAiDeps.autoEnabled = () => false;
    const b = expectStatus(await upload(client.agent, c.id, req('DIPLOMA').id, pagePng({ seed: 22 }), 'b.png', 'image/png'), 201);
    await fs.unlink(docFilePath((await prisma.document.findUniqueOrThrow({ where: { id: b.body.document.id } })).storedName));
    const { analyzeInsight } = await import('../../src/lib/uploadAi/index.js');
    expect(await analyzeInsight({ documentId: b.body.document.id })).toBeNull();
    expect(await insightOfDoc(b.body.document.id)).toMatchObject({ status: 'FAILED' });
  });
});

// ─── 5. Drive uploads into a client folder ─────────────────────────────

describe('staff uploads into the client folder (drive)', () => {
  const folderOf = (caseId: string) =>
    waitFor(async () => (await prisma.case.findUnique({ where: { id: caseId }, select: { driveFolderId: true } }))?.driveFolderId ?? null);

  it('proposes move to the folder of the type, attach to the requirement, rename and expiry; "Accept all" applies them', async () => {
    const { c, req } = await setupCase();
    const staff = await asStaff();
    const folderId = await folderOf(c.id);
    const up = expectStatus(await staff.agent.post(`/api/drive/nodes/${folderId}/files`).attach('file', await passportPdf(), { filename: 'scan.pdf', contentType: 'application/pdf' }), 201);
    expect(up.body.quality).toMatchObject({ level: 'OK' });
    await waitForUploadAi();
    const nodeId = up.body.item.id as string;
    const i = await prisma.documentInsight.findUniqueOrThrow({ where: { driveNodeId: nodeId } });
    expect(i).toMatchObject({ caseId: c.id, folderId, docType: 'PASSPORT', proposedRequirementId: req('PASSPORT').id, status: 'PROPOSED' });
    expect((i.proposals as { actions: string[]; folder: { name: string } }).actions.sort()).toEqual(['expiry', 'link', 'move', 'rename']);
    expect((i.proposals as { folder: { name: string } }).folder.name).toBe('Reisepass');

    // The drive row carries the AI chip.
    const kids = expectStatus(await staff.agent.get(`/api/drive/nodes/${folderId}/children`), 200).body;
    const row = (kids.items ?? kids.children ?? []).find((x: { id: string }) => x.id === nodeId);
    expect(row.uploadAi).toMatchObject({ docType: 'PASSPORT', open: 4 });

    const folder = expectStatus(await staff.agent.get(`/api/upload-ai/folders/${folderId}`), 200).body;
    expect(folder.open).toBe(1);
    const all = expectStatus(await staff.agent.post(`/api/upload-ai/folders/${folderId}/accept-all`), 200).body;
    expect(all.accepted).toBe(1);

    const node = await prisma.driveNode.findUniqueOrThrow({ where: { id: nodeId }, include: { parent: true } });
    expect(node.name).toBe(`Mammadov_Ali_Reisepass_${EXPIRY}.pdf`);
    expect(node.parent).toMatchObject({ name: 'Reisepass', parentId: folderId });
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: node.documentId! } });
    expect(doc).toMatchObject({ caseId: c.id, requirementId: req('PASSPORT').id, stage: 'INITIAL', status: 'ACCEPTED', uploadedById: staff.user.id });
    expect(doc.expiresAt?.toISOString().slice(0, 10)).toBe(EXPIRY);
    expect((await prisma.documentInsight.findUniqueOrThrow({ where: { id: i.id } })).status).toBe('ACCEPTED');
  });

  it('files outside client folders are not analysed', async () => {
    const staff = await asStaff();
    const roots = expectStatus(await staff.agent.get('/api/drive/roots'), 200).body;
    const shared = roots.shared?.id ?? roots.roots?.[0]?.id ?? roots.sharedRoot?.id;
    expect(shared).toBeTruthy();
    const up = expectStatus(await staff.agent.post(`/api/drive/nodes/${shared}/files`).attach('file', await passportPdf(), { filename: 'x.pdf', contentType: 'application/pdf' }), 201);
    expect(up.body.quality).toBeNull();
    await waitForUploadAi();
    expect(await prisma.documentInsight.count()).toBe(0);
  });

  it('case "Accept all" applies every open proposal of the case', async () => {
    const { client, c, req } = await setupCase();
    const staff = await asStaff();
    expectStatus(await upload(client.agent, c.id, req('PASSPORT').id, await passportPdf(), 'scan.pdf', 'application/pdf'), 201);
    expectStatus(await upload(client.agent, c.id, req('DIPLOMA').id, pagePng({ seed: 31 }), 'scan.png', 'image/png'), 201);
    await waitForUploadAi();
    expect(expectStatus(await staff.agent.get(`/api/upload-ai/cases/${c.id}`), 200).body.open).toBe(2);
    expect(expectStatus(await staff.agent.post(`/api/upload-ai/cases/${c.id}/accept-all`), 200).body.accepted).toBe(2);
    expect(expectStatus(await staff.agent.get(`/api/upload-ai/cases/${c.id}`), 200).body.open).toBe(0);
  });
});

// ─── 6. Authorization ───────────────────────────────────────────────────

describe('authorization', () => {
  it('clients only see their own uploads and cannot decide; staff need 2FA; settings are super admin only', async () => {
    const { client, c, req } = await setupCase();
    const res = expectStatus(await upload(client.agent, c.id, req('PASSPORT').id, await passportPdf(), 'scan.pdf', 'application/pdf'), 201);
    await waitForUploadAi();
    const i = await insightOfDoc(res.body.document.id);

    const other = await asClient();
    expectStatus(await other.agent.get(`/api/upload-ai/cases/${c.id}`), 404);
    expectStatus(await other.agent.post(`/api/upload-ai/documents/${res.body.document.id}/ack`), 404);
    expectStatus(await client.agent.post(`/api/upload-ai/insights/${i.id}/accept`).send({}), 403);
    expectStatus(await client.agent.post(`/api/upload-ai/insights/${i.id}/reject`), 403);
    expectStatus(await client.agent.post(`/api/upload-ai/documents/${res.body.document.id}/request-reupload`), 403);
    expectStatus(await client.agent.get(`/api/upload-ai/documents/${res.body.document.id}`), 403);

    const no2fa = await asStaff({ twoFactor: false });
    expectStatus(await no2fa.agent.post(`/api/upload-ai/insights/${i.id}/accept`).send({}), 403);
    expectStatus(await no2fa.agent.get(`/api/upload-ai/cases/${c.id}`), 404); // falls back to the client view: not theirs

    const admin = await asAdmin();
    expectStatus(await admin.agent.put('/api/upload-ai/settings').send({ autoApply: { enabled: true } }), 403);
    expectStatus(await admin.agent.get('/api/upload-ai/settings'), 403);
    const sup = await asSuperAdmin();
    expectStatus(await sup.agent.put('/api/upload-ai/settings').send({ autoApply: { enabled: true, threshold: 0.3 } }), 400);
    const saved = expectStatus(await sup.agent.put('/api/upload-ai/settings').send({ autoApply: { enabled: true, threshold: 0.92, move: false } }), 200).body.settings;
    expect(saved.autoApply).toEqual({ enabled: true, threshold: 0.92, rename: true, link: true, move: false, expiry: true });
    expect(await prisma.auditLog.count({ where: { action: 'UPLOAD_AI_SETTINGS_SAVED' } })).toBe(1);
  });

  it('drive insights need drive access to the file', async () => {
    const { c } = await setupCase();
    const staff = await asStaff();
    const folderId = await waitFor(async () => (await prisma.case.findUnique({ where: { id: c.id }, select: { driveFolderId: true } }))?.driveFolderId ?? null);
    const up = expectStatus(await staff.agent.post(`/api/drive/nodes/${folderId}/files`).attach('file', await passportPdf(), { filename: 'scan.pdf', contentType: 'application/pdf' }), 201);
    await waitForUploadAi();
    const i = await prisma.documentInsight.findUniqueOrThrow({ where: { driveNodeId: up.body.item.id } });
    // Restrict the client folder: no inheritance, only the uploader keeps access.
    await prisma.driveNode.update({ where: { id: folderId }, data: { inheritPermissions: false, grants: { create: { userId: staff.user.id, access: 'MANAGE' } } } });
    const outsider = await asStaff();
    expectStatus(await outsider.agent.get(`/api/upload-ai/nodes/${up.body.item.id}`), 404);
    expectStatus(await outsider.agent.post(`/api/upload-ai/insights/${i.id}/accept`).send({}), 404);
    expect(expectStatus(await outsider.agent.get(`/api/upload-ai/cases/${c.id}`), 200).body.insights).toEqual([]);
    expectStatus(await staff.agent.get(`/api/upload-ai/nodes/${up.body.item.id}`), 200);
  });
});
