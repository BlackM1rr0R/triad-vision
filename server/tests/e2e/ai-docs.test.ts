import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asClient, asStaff, asSuperAdmin, sessionAgent, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createUser, uniq } from '../helpers/factories';
import { makePdf, PNG_BUFFER } from '../helpers/files';
import { clientCase, createCaseVia, expectStatus, uploadDoc } from '../helpers/workflow';
import { setAiTransport, setKeyInfoFetcher, setModelsFetcher, type ChatRequest, type StreamChunk } from '../../src/lib/ai/openrouter.js';
import { clearAiSettingsCache, saveAiSettings } from '../../src/lib/ai/settings.js';
import { CHEAP_MODEL, STRONG_MODEL } from '../../src/lib/ai/complete.js';
import { aiDocCheckDeps, nameMatches, waitForAiDocChecks } from '../../src/lib/aiDocs/docCheck.js';
import { DRAFT_HEADER, TRANSLATIONS_FOLDER } from '../../src/lib/aiDocs/translateDraft.js';
import { readDocSource } from '../../src/lib/docCreate/pdf.js';
import { readNodeBuffer, storeBuffer } from '../../src/lib/drive/files.js';
import { ensureSharedRoot } from '../../src/lib/drive/roots.js';

process.env.OPENROUTER_API_KEY = 'sk-or-test-not-a-real-key';

// ─── Fake OpenRouter ────────────────────────────────────────────────────

type Round = StreamChunk[] | 'fail';
const fake = { requests: [] as ChatRequest[], script: [] as Round[] };
const jsonRound = (obj: unknown, cost = 0.0004): StreamChunk[] => {
  const text = JSON.stringify(obj);
  return [
    { choices: [{ delta: { content: text.slice(0, 10) } }] },
    { choices: [{ delta: { content: text.slice(10) } }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1500, completion_tokens: 200, cost } },
  ];
};

const msg = (code: string, text: string) => ({ code, message_az: `${text} az`, message_de: `${text} de`, message_en: `${text} en`, message_ru: `${text} ru` });

const CHECK_WARN = {
  verdict: 'warn',
  documentType: 'Diploma',
  language: 'Azerbaijani',
  issues: [msg('APOSTILLE_MISSING', 'Diplomunuzda apostil möhürü görünmür')],
  fields: { name: 'MAMMADOV ALI', documentNumber: 'AB123', issueDate: '2015-06-30', bogus: 'x' },
  apostille: 'missing',
  translationNeeded: true,
};

const LETTER = {
  sender: { name: 'Ausländerbehörde Berlin', kind: 'authority' },
  subject: 'Termin für Aufenthaltstitel',
  letterDate: '2026-10-10',
  reference: 'AZ 123/45',
  summary: 'Siz yaşayış icazəsi üçün görüşə dəvət olunursunuz.',
  deadlines: [{ date: '2026-11-05', what: 'Görüş' }, { date: 'not a date', what: 'x' }],
  steps: ['Pasportu götürün', 'Vaxtında gəlin'],
  documents: ['Pasport', 'Biometrik foto'],
  consequences: 'Gəlməsəniz, icazə gecikə bilər.',
  glossary: [{ term: 'Aufenthaltstitel', meaning: 'Yaşayış icazəsi' }],
  urgency: 'high',
  language: 'German',
};

const DRAFT = {
  title: 'Diplom',
  sourceLanguage: 'Aserbaidschanisch',
  blocks: [
    { type: 'h2', text: 'Republik Aserbaidschan' },
    { type: 'table', rows: [['Name', 'Ali Mammadov'], ['Fachrichtung', 'Informatik']] },
    { type: 'note', text: '[Rundstempel: Staatliche Universität Baku]' },
    { type: 'p', text: '[Unterschrift]' },
  ],
};

beforeEach(() => {
  fake.requests = [];
  fake.script = [];
  clearAiSettingsCache();
  aiDocCheckDeps.autoEnabled = () => true;
  setKeyInfoFetcher(async () => null);
  setModelsFetcher(async () => []);
  setAiTransport(async function* (req) {
    fake.requests.push(JSON.parse(JSON.stringify(req)) as ChatRequest);
    const round = fake.script.shift() ?? jsonRound(CHECK_WARN);
    if (round === 'fail') throw new Error('upstream down');
    for (const chunk of round) yield chunk;
  });
});

afterEach(async () => {
  await waitForAiDocChecks();
});

afterAll(() => {
  setAiTransport(null);
  setKeyInfoFetcher(null);
  setModelsFetcher(null);
  aiDocCheckDeps.autoEnabled = () => false;
  delete process.env.OPENROUTER_API_KEY;
});

// ─── Helpers ────────────────────────────────────────────────────────────

const setupCase = async (opts: { firstName?: string; lastName?: string } = {}) => {
  const client = await asClient({ firstName: opts.firstName ?? 'Əli', lastName: opts.lastName ?? 'Məmmədov' });
  const c = await createCaseVia(client.agent);
  const reqs = (await clientCase(client.agent, c.id)).requirements as unknown as { id: string; key: string | null }[];
  const diploma = reqs.find((r) => r.key === 'DIPLOMA') ?? reqs[0];
  return { client, c, diploma };
};

const uploadAndWait = async (client: Agent, caseId: string, requirementId: string) => {
  const res = expectStatus(await uploadDoc(client, caseId, requirementId, 'diplom.pdf'), 201);
  await waitForAiDocChecks();
  return prisma.document.findUniqueOrThrow({ where: { id: res.body.document.id } });
};

const aiOfDoc = (checks: unknown) => (checks as { ai?: Record<string, any> } | null)?.ai;

const userContent = (req: ChatRequest) => req.messages[1]?.content as unknown as { type: string }[];

const postLetter = (agent: Agent, files: { data: Buffer; name: string; type: string }[]) => {
  const r = agent.post('/api/ai-docs/letters');
  for (const f of files) r.attach('files', f.data, { filename: f.name, contentType: f.type });
  return r;
};
const png = { data: PNG_BUFFER, name: 'brief.png', type: 'image/png' };

// ─── 1. Automatic check ─────────────────────────────────────────────────

describe('automatic AI check after a client upload', () => {
  it('stores checks.ai next to the upload checks and notifies the client on warn', async () => {
    const { client, c, diploma } = await setupCase();
    const doc = await uploadAndWait(client.agent, c.id, diploma.id);

    const checks = doc.checks as Record<string, any>;
    expect(checks.level).toBe('ok'); // the upload checks stay
    const ai = aiOfDoc(checks)!;
    expect(ai).toMatchObject({ verdict: 'warn', apostille: 'missing', translationNeeded: true, by: 'auto', model: CHEAP_MODEL, documentType: 'Diploma' });
    expect(ai.issues[0]).toMatchObject({ code: 'APOSTILLE_MISSING', message_az: 'Diplomunuzda apostil möhürü görünmür az' });
    expect(ai.fields).toEqual({ name: 'MAMMADOV ALI', documentNumber: 'AB123', issueDate: '2015-06-30' }); // name matches the profile
    expect(ai.issues.map((i: { code: string }) => i.code)).not.toContain('NAME_MISMATCH');

    // One call, the PDF went along with the requirement text.
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0].model).toBe(CHEAP_MODEL);
    const content = userContent(fake.requests[0]);
    expect(content.map((p) => p.type)).toEqual(['text', 'file']);
    expect(JSON.stringify(content[0])).toContain('DIPLOMA');

    const n = await prisma.notification.findFirst({ where: { userId: client.user.id, type: 'DOCUMENT_CHECK' } });
    expect(n?.body).toContain('Diplomunuzda apostil möhürü görünmür az');
    expect(n?.link).toBe(`/account/cases/${c.id}`);

    // Cost booked on the client (CLIENT scope).
    const usage = await prisma.aiMessage.findFirst({ where: { toolName: 'doc-check', conversation: { userId: client.user.id, scope: 'CLIENT' } } });
    expect(usage?.costMicros).toBe(400);

    // The client reads the result.
    const res = expectStatus(await client.agent.get(`/api/ai-docs/documents/${doc.id}/check`), 200);
    expect(res.body).toMatchObject({ enabled: true, ai: { verdict: 'warn' } });
  });

  it('adds the expiry and name rules, ok stays silent', async () => {
    const { client, c, diploma } = await setupCase();
    const soon = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    fake.script.push(jsonRound({ ...CHECK_WARN, verdict: 'ok', issues: [], fields: { name: 'IVANOV PETR', expiryDate: soon } }));
    const doc = await uploadAndWait(client.agent, c.id, diploma.id);
    const ai = aiOfDoc(doc.checks)!;
    expect(ai.verdict).toBe('warn');
    expect(ai.issues.map((i: { code: string }) => i.code).sort()).toEqual(['EXPIRES_SOON', 'NAME_MISMATCH']);

    fake.script.push(jsonRound({ ...CHECK_WARN, verdict: 'ok', issues: [], fields: { name: 'Mamedov Ali' } }));
    const okDoc = await uploadAndWait(client.agent, c.id, diploma.id);
    expect(aiOfDoc(okDoc.checks)).toMatchObject({ verdict: 'ok', issues: [] });
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: 'DOCUMENT_CHECK' } })).toBe(1);
  });

  it('tolerant name comparison', () => {
    const p = { firstName: 'Əli', lastName: 'Məmmədov' };
    for (const n of ['MAMMADOV ALI', 'Mamedov Ali', 'Мамедов Али', 'Ali Mammadov oglu']) expect(nameMatches(n, p)).toBe(true);
    expect(nameMatches('Ivanov Petr', p)).toBe(false);
    expect(nameMatches('Khalilov Rashad', { firstName: 'Rəşad', lastName: 'Xəlilov' })).toBe(true);
    expect(nameMatches('Джафаров', { firstName: 'X', lastName: 'Cəfərov' })).toBe(true);
  });

  it('stores skipped when the call fails or the budget is used up, never rejects', async () => {
    const { client, c, diploma } = await setupCase();
    fake.script.push('fail');
    const failed = await uploadAndWait(client.agent, c.id, diploma.id);
    expect(aiOfDoc(failed.checks)).toMatchObject({ verdict: 'skipped', reason: 'UPSTREAM' });
    expect(failed.status).toBe('PENDING');

    await saveAiSettings({ monthlyBudgetUsd: 0 });
    const budget = await uploadAndWait(client.agent, c.id, diploma.id);
    expect(aiOfDoc(budget.checks)).toMatchObject({ verdict: 'skipped', reason: 'MONTHLY_BUDGET' });
    expect(fake.requests).toHaveLength(1); // no call over the budget
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: 'DOCUMENT_CHECK' } })).toBe(0);
  });

  it('does nothing when switched off in the AI settings', async () => {
    const { client, c, diploma } = await setupCase();
    await saveAiSettings({ docCheckEnabled: false });
    const doc = await uploadAndWait(client.agent, c.id, diploma.id);
    expect(aiOfDoc(doc.checks)).toBeUndefined();
    expect(fake.requests).toHaveLength(0);
    expect((await client.agent.get(`/api/ai-docs/documents/${doc.id}/check`)).body).toMatchObject({ enabled: false, ai: null });
  });

  it('also checks client scans', async () => {
    const { client, c, diploma } = await setupCase();
    const res = expectStatus(
      await client.agent.post(`/api/cases/${c.id}/documents/scan`).field('requirementId', diploma.id).attach('pages', PNG_BUFFER, { filename: 'p1.png', contentType: 'image/png' }),
      201,
    );
    await waitForAiDocChecks();
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: res.body.document.id } });
    expect(aiOfDoc(doc.checks)?.verdict).toBe('warn');
  });
});

// ─── 2. Re-check ────────────────────────────────────────────────────────

describe('staff re-check', () => {
  it('staff (2FA) re-run the check on their own cost; clients and others cannot', async () => {
    const { client, c, diploma } = await setupCase();
    await saveAiSettings({ docCheckEnabled: false });
    const doc = await uploadAndWait(client.agent, c.id, diploma.id);

    expect((await client.agent.post(`/api/ai-docs/documents/${doc.id}/check`)).status).toBe(403);
    const no2fa = await createUser({ role: 'STAFF', twoFactor: false });
    expect((await sessionAgent(no2fa.token).post(`/api/ai-docs/documents/${doc.id}/check`)).status).toBe(403);
    const other = await asClient();
    expect((await other.agent.get(`/api/ai-docs/documents/${doc.id}/check`)).status).toBe(404);

    const staff = await asStaff();
    const res = expectStatus(await staff.agent.post(`/api/ai-docs/documents/${doc.id}/check`), 200);
    expect(res.body.ai).toMatchObject({ verdict: 'warn', by: 'staff' });
    expect(aiOfDoc((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).checks)?.by).toBe('staff');
    expect(await prisma.aiMessage.count({ where: { toolName: 'doc-check', conversation: { userId: staff.user.id, scope: 'ADMIN' } } })).toBe(1);
    // A staff re-check does not notify the client.
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: 'DOCUMENT_CHECK' } })).toBe(0);
    expect((await staff.agent.get(`/api/ai-docs/documents/${doc.id}/check`)).status).toBe(200);
  });

  it('answers 429 with a message when the staff cap is reached', async () => {
    const { client, c, diploma } = await setupCase();
    await saveAiSettings({ docCheckEnabled: false, adminDailyCostUsd: 0 });
    const doc = await uploadAndWait(client.agent, c.id, diploma.id);
    const staff = await asStaff();
    const res = await staff.agent.post(`/api/ai-docs/documents/${doc.id}/check`);
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: 'AI_LIMIT', reason: 'DAILY_COST', ai: { verdict: 'skipped' } });
  });
});

// ─── 3. Letters ─────────────────────────────────────────────────────────

describe('explain my German letter', () => {
  it('explains, stores in the vault, lists only own letters', async () => {
    const client = await asClient();
    fake.script.push(jsonRound(LETTER));
    const res = expectStatus(await postLetter(client.agent, [png]), 201);
    const item = res.body.item;
    expect(item.letter.explanation).toMatchObject({
      sender: { name: 'Ausländerbehörde Berlin', kind: 'authority' },
      urgency: 'high',
      deadlines: [{ date: '2026-11-05', what: 'Görüş' }],
      glossary: [{ term: 'Aufenthaltstitel', meaning: 'Yaşayış icazəsi' }],
    });
    expect(item.title).toBe('Məktub: Termin für Aufenthaltstitel · Ausländerbehörde Berlin');
    expect(fake.requests[0].messages[0].content).toContain('Azerbaijani');
    expect(userContent(fake.requests[0]).map((p) => p.type)).toEqual(['text', 'image_url']);

    const v = await prisma.vaultDocument.findUniqueOrThrow({ where: { id: item.id } });
    expect(v).toMatchObject({ userId: client.user.id, kind: 'OTHER', mimeType: 'image/png' });
    expect((await client.agent.get(item.fileUrl)).status).toBe(200);

    const list = expectStatus(await client.agent.get('/api/ai-docs/letters'), 200);
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([item.id]);
    const other = await asClient();
    expect((await other.agent.get('/api/ai-docs/letters')).body.items).toEqual([]);
    expect((await other.agent.post(`/api/ai-docs/letters/${item.id}/send`)).status).toBe(404);
    expect((await other.agent.delete(`/api/ai-docs/letters/${item.id}`)).status).toBe(404);

    // Two images become one stored PDF.
    fake.script.push(jsonRound(LETTER));
    const two = expectStatus(await postLetter(client.agent, [png, { ...png, name: 'b2.png' }]), 201);
    expect(two.body.item.mimeType).toBe('application/pdf');
    expect(userContent(fake.requests[1]).filter((p) => p.type === 'image_url')).toHaveLength(2);

    expectStatus(await client.agent.delete(`/api/ai-docs/letters/${item.id}`), 200);
    expect((await client.agent.get('/api/ai-docs/letters')).body.items).toHaveLength(1);
  });

  it('is for clients only and validates the files', async () => {
    const staff = await asStaff();
    expect((await postLetter(staff.agent, [png])).status).toBe(403);
    expect((await staff.agent.get('/api/ai-docs/letters')).status).toBe(403);

    const client = await asClient();
    const pdf = { data: await makePdf('Brief', 5), name: 'brief.pdf', type: 'application/pdf' };
    expect((await postLetter(client.agent, [pdf, pdf])).body.error).toBe('ONE_PDF_ONLY');
    expect((await postLetter(client.agent, [{ data: Buffer.from('nope'), name: 'a.txt', type: 'text/plain' }])).status).toBe(400);
    expect((await postLetter(client.agent, [png, png, png, png])).status).toBe(400);
    expect(fake.requests).toHaveLength(0);

    // A long PDF: only the first 3 pages go to the model.
    fake.script.push(jsonRound(LETTER));
    expectStatus(await postLetter(client.agent, [pdf]), 201);
    expect(userContent(fake.requests[0]).map((p) => p.type)).toEqual(['text', 'file']);
  });

  it('shows a friendly limit message and stores nothing', async () => {
    const client = await asClient({ locale: 'de' });
    await saveAiSettings({ clientDailyCostUsd: 0 });
    const res = await postLetter(client.agent, [png]);
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: 'AI_LIMIT', reason: 'DAILY_COST' });
    expect(res.body.message).toContain('KI-Nutzungslimit');
    expect(await prisma.vaultDocument.count({ where: { userId: client.user.id } })).toBe(0);
  });

  it('sends the letter and the explanation to the case manager', async () => {
    const { client, c } = await setupCase();
    fake.script.push(jsonRound(LETTER));
    const item = expectStatus(await postLetter(client.agent, [png]), 201).body.item;

    const res = expectStatus(await client.agent.post(`/api/ai-docs/letters/${item.id}/send`).send({ note: 'Kömək edin' }), 201);
    expect(res.body.caseId).toBe(c.id);
    const message = await prisma.caseMessage.findFirstOrThrow({ where: { caseId: c.id } });
    expect(message.authorId).toBe(client.user.id);
    expect(message.body).toContain('Ausländerbehörde Berlin');
    expect(message.body).toContain('Kömək edin');
    expect(message.body).toContain('2026-11-05');
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: res.body.documentId } });
    expect(doc).toMatchObject({ caseId: c.id, stage: 'OTHER', vaultDocumentId: item.id, uploadedById: client.user.id });
    expect(res.body.item.letter.sentCaseId).toBe(c.id);

    expect((await client.agent.post(`/api/ai-docs/letters/${item.id}/send`)).body.error).toBe('ALREADY_SENT');

    const lonely = await asClient();
    fake.script.push(jsonRound(LETTER));
    const l2 = expectStatus(await postLetter(lonely.agent, [png]), 201).body.item;
    expect((await lonely.agent.post(`/api/ai-docs/letters/${l2.id}/send`)).body.error).toBe('NO_CASE');
    expect((await lonely.agent.post(`/api/ai-docs/letters/${l2.id}/send`).send({ caseId: c.id })).status).toBe(404);
  });
});

// ─── 4. Draft translations ──────────────────────────────────────────────

const draftOf = async (nodeId: string) => readDocSource((await readNodeBuffer(nodeId)).buf);

describe('AI draft translation', () => {
  it('case document → PDF in the client folder "Übersetzungen" with the ENTWURF header', async () => {
    const { client, c, diploma } = await setupCase();
    await saveAiSettings({ docCheckEnabled: false });
    const doc = await uploadAndWait(client.agent, c.id, diploma.id);
    const staff = await asStaff();
    fake.script.push(jsonRound(DRAFT));
    const res = expectStatus(await staff.agent.post('/api/ai-docs/translate-draft').send({ documentId: doc.id }), 201);
    expect(res.body).toMatchObject({ location: 'case', model: CHEAP_MODEL, name: 'diplom – Arbeitsübersetzung DE (Entwurf).pdf' });

    const folder = await prisma.driveNode.findUniqueOrThrow({ where: { id: res.body.parentId } });
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: c.id } });
    expect(folder).toMatchObject({ name: TRANSLATIONS_FOLDER, parentId: kase.driveFolderId, kind: 'FOLDER' });
    const node = await prisma.driveNode.findUniqueOrThrow({ where: { id: res.body.nodeId } });
    expect(node.mimeType).toBe('application/pdf');
    const source = await draftOf(node.id);
    expect(source?.title).toBe(DRAFT_HEADER);
    expect(JSON.stringify(source?.blocks)).toContain('[Rundstempel: Staatliche Universität Baku]');
    expect(source?.blocks.some((b) => b.type === 'table')).toBe(true);
    expect(await prisma.aiMessage.count({ where: { toolName: 'translate-draft', conversation: { userId: staff.user.id, scope: 'ADMIN' } } })).toBe(1);

    // "yüksək keyfiyyət" uses the strong model; a second draft lands in the same folder.
    fake.script.push(jsonRound(DRAFT));
    const high = expectStatus(await staff.agent.post('/api/ai-docs/translate-draft').send({ documentId: doc.id, quality: 'high' }), 201);
    expect(fake.requests.at(-1)!.model).toBe(STRONG_MODEL);
    expect(high.body.parentId).toBe(res.body.parentId);
  });

  it('drive file → next to the file; translation order → case folder or staff folder + internal event', async () => {
    const superAdmin = await asSuperAdmin();
    const root = await ensureSharedRoot();
    // A restricted folder (no inherited permissions, no grants): only the super admin sees it.
    const folder = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: uniq('Ordner'), parentId: root, inheritPermissions: false } });
    const pdf = await makePdf('Diplom');
    const file = await prisma.driveNode.create({
      data: { space: 'SHARED', kind: 'FILE', name: 'diplom.pdf', parentId: folder.id, storageKey: await storeBuffer(pdf), mimeType: 'application/pdf', size: pdf.length },
    });
    fake.script.push(jsonRound(DRAFT));
    const res = expectStatus(await superAdmin.agent.post('/api/ai-docs/translate-draft').send({ nodeId: file.id }), 201);
    expect(res.body).toMatchObject({ location: 'drive', parentId: folder.id });
    expect((await draftOf(res.body.nodeId))?.title).toBe(DRAFT_HEADER);

    // A staff member without access to the file gets 404.
    const staff = await asStaff();
    expect((await staff.agent.post('/api/ai-docs/translate-draft').send({ nodeId: file.id })).status).toBe(404);

    // Translation order with a case: the case folder; the order gets an internal event.
    const { client, c, diploma } = await setupCase();
    await saveAiSettings({ docCheckEnabled: false });
    const doc = await uploadAndWait(client.agent, c.id, diploma.id);
    const order = await prisma.translationOrder.create({
      data: {
        number: Math.floor(Math.random() * 1e9),
        clientId: client.user.id,
        caseId: c.id,
        service: 'TRANSLATION',
        sourceLang: 'az',
        targetLang: 'de',
        files: { create: { kind: 'SOURCE', documentId: doc.id, filename: 'diplom.pdf', mimeType: 'application/pdf', size: doc.size } },
      },
    });
    fake.script.push(jsonRound(DRAFT));
    const fromOrder = expectStatus(await staff.agent.post('/api/ai-docs/translate-draft').send({ translationOrderId: order.id }), 201);
    expect(fromOrder.body.location).toBe('case');
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: fromOrder.body.parentId } })).name).toBe(TRANSLATIONS_FOLDER);
    const ev = await prisma.translationOrderEvent.findFirstOrThrow({ where: { orderId: order.id } });
    expect(ev).toMatchObject({ visibleToClient: false });
    expect(ev.note).toContain('AI-Entwurf');
    // Nothing was added to the order's files (the client never sees the draft).
    expect(await prisma.translationOrderFile.count({ where: { orderId: order.id } })).toBe(1);

    // Without a case: the staff member's own folder.
    const loose = await prisma.translationOrder.create({
      data: {
        number: Math.floor(Math.random() * 1e9),
        clientId: client.user.id,
        service: 'TRANSLATION',
        sourceLang: 'az',
        targetLang: 'de',
        files: { create: { kind: 'SOURCE', documentId: doc.id, filename: 'diplom.pdf', mimeType: 'application/pdf', size: doc.size } },
      },
    });
    fake.script.push(jsonRound(DRAFT));
    const staffRes = expectStatus(await staff.agent.post('/api/ai-docs/translate-draft').send({ translationOrderId: loose.id }), 201);
    expect(staffRes.body.location).toBe('staff');
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: staffRes.body.parentId } })).name).toBe('Staff User');
  });

  it('access: staff with 2FA only, exactly one source, AI failures', async () => {
    const { client, c, diploma } = await setupCase();
    await saveAiSettings({ docCheckEnabled: false });
    const doc = await uploadAndWait(client.agent, c.id, diploma.id);
    expect((await client.agent.post('/api/ai-docs/translate-draft').send({ documentId: doc.id })).status).toBe(403);
    const no2fa = await createUser({ role: 'STAFF', twoFactor: false });
    expect((await sessionAgent(no2fa.token).post('/api/ai-docs/translate-draft').send({ documentId: doc.id })).status).toBe(403);
    const staff = await asStaff();
    expect((await staff.agent.post('/api/ai-docs/translate-draft').send({})).status).toBe(400);
    expect((await staff.agent.post('/api/ai-docs/translate-draft').send({ documentId: doc.id, nodeId: 'x' })).status).toBe(400);
    expect((await staff.agent.post('/api/ai-docs/translate-draft').send({ documentId: 'nope' })).status).toBe(404);

    fake.script.push(jsonRound({ title: 'x', blocks: [] }));
    expect((await staff.agent.post('/api/ai-docs/translate-draft').send({ documentId: doc.id })).body).toMatchObject({ error: 'AI_FAILED', reason: 'BAD_OUTPUT' });
    await saveAiSettings({ adminDailyCostUsd: 0 });
    const limited = await staff.agent.post('/api/ai-docs/translate-draft').send({ documentId: doc.id });
    expect(limited.status).toBe(429);
    expect(await prisma.driveNode.count({ where: { name: { contains: 'Arbeitsübersetzung' } } })).toBe(0);
  });
});
