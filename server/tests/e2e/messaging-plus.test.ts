import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { anon, app, asAdmin, asClient, asStaff, ORIGIN } from '../helpers/api';
import { prisma, settle } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { createCaseVia } from '../helpers/workflow';
import { asCandidate, asCompany, cleanJobs, createVacancy } from './vacancies.fixtures';
import { setAiTransport, setKeyInfoFetcher, setModelsFetcher, type ChatRequest, type StreamChunk } from '../../src/lib/ai/openrouter.js';
import { clearAiSettingsCache } from '../../src/lib/ai/settings.js';
import { CHEAP_MODEL } from '../../src/lib/ai/complete.js';
import { detectLanguage, findContactDetails } from '../../src/lib/messagingPlus/language.js';
import { flushTranscriptions, setTranscriptionProvider, type TranscriptionProvider } from '../../src/lib/messagingPlus/voice.js';
import { TRANSLATE_PURPOSE } from '../../src/lib/messagingPlus/translate.js';

process.env.OPENROUTER_API_KEY = 'sk-or-test-not-a-real-key';

// ─── Fake OpenRouter ───────────────────────────────────────────────────
// Translation: {"m1": "...", …} → {"m1": "<LANG>: ..."}; preview: {"de": "DE: text"}; audio: the fake transcript.

const fake = { requests: [] as ChatRequest[], transcript: 'Salam, mən hazıram', transcriptLang: 'az', mode: 'ok' as 'ok' | 'error' };

const userText = (req: ChatRequest) => {
  const c = req.messages.find((m) => m.role === 'user')?.content as unknown;
  return typeof c === 'string' ? c : JSON.stringify(c);
};

const answer = (req: ChatRequest): string => {
  const system = String(req.messages[0].content);
  const content = req.messages.find((m) => m.role === 'user')?.content as unknown;
  if (Array.isArray(content) && content.some((p) => (p as { type?: string }).type === 'input_audio')) {
    return JSON.stringify({ text: fake.transcript, lang: fake.transcriptLang });
  }
  const input = JSON.parse(userText(req)) as Record<string, unknown>;
  if ('into' in input) {
    const langs = (input.into as string[]).map((s) => s.slice(0, 2));
    return JSON.stringify(Object.fromEntries(langs.map((l) => [l, `${l.toUpperCase()}: ${String(input.text)}`])));
  }
  const target = /into (\w+)/.exec(system)?.[1] ?? 'X';
  return JSON.stringify(Object.fromEntries(Object.entries(input).map(([k, v]) => [k, `${target.slice(0, 2).toUpperCase()}: ${String(v)}`])));
};

beforeEach(async () => {
  await cleanJobs();
  fake.requests = [];
  fake.mode = 'ok';
  fake.transcript = 'Salam, mən hazıram';
  fake.transcriptLang = 'az';
  clearAiSettingsCache();
  process.env.OPENROUTER_API_KEY = 'sk-or-test-not-a-real-key';
  delete process.env.AI_TRANSCRIBE_MODEL;
  setTranscriptionProvider(null);
  setKeyInfoFetcher(async () => null);
  setModelsFetcher(async () => []);
  setAiTransport(async function* (req): AsyncGenerator<StreamChunk> {
    fake.requests.push(JSON.parse(JSON.stringify(req)) as ChatRequest);
    if (fake.mode === 'error') throw new Error('upstream down');
    yield { choices: [{ delta: { content: answer(req) }, finish_reason: 'stop' }], usage: { prompt_tokens: 200, completion_tokens: 50, cost: 0.0003 } };
  });
});

afterAll(() => {
  setAiTransport(null);
  setKeyInfoFetcher(null);
  setModelsFetcher(null);
  setTranscriptionProvider(null);
});

// ─── Audio samples ─────────────────────────────────────────────────────

const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84]), Buffer.from('webm'), Buffer.alloc(400, 7)]);
const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(300, 1)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A '), Buffer.alloc(300, 2)]);

const voice = (agent: { post: (url: string) => request.Test }, url: string, opts: { buf?: Buffer; type?: string; name?: string; durationMs?: number } = {}) =>
  agent
    .post(url)
    .field('durationMs', String(opts.durationMs ?? 4200))
    .attach('file', opts.buf ?? WEBM, { filename: opts.name ?? 'voice.webm', contentType: opts.type ?? 'audio/webm;codecs=opus' });

// ─── Fixtures: candidate + employer + vacancy application ──────────────

const setupApplication = async (status: 'NEW' | 'PROPOSED' | 'INTERVIEW' = 'PROPOSED', showCompany = false) => {
  const employer = await asCompany('ACTIVE', { locale: 'de' });
  const vacancy = await createVacancy({ companyId: employer.company.id, showCompany });
  const candidate = await asCandidate();
  const app = await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: candidate.user.id, status } });
  const staff = await asStaff({ firstName: 'Leyla', lastName: 'Staff', locale: 'az' });
  return { employer, vacancy, candidate, app, staff };
};

const openThread = async (staff: { agent: { post: (u: string) => request.Test } }, applicationId: string) => {
  const res = await staff.agent.post('/api/messaging-plus/threads').send({ applicationId });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.thread.id as string;
};

// ─── Pure helpers ──────────────────────────────────────────────────────

describe('language and contact detection', () => {
  it('detects az / de / en / ru and falls back for clueless texts', () => {
    expect(detectLanguage('Salam, sənədləri sabah göndərəcəyəm')).toBe('az');
    expect(detectLanguage('Guten Tag, wann ist der Termin für das Gespräch?')).toBe('de');
    expect(detectLanguage('Hello, when is the start date?')).toBe('en');
    expect(detectLanguage('Здравствуйте, когда начало работы?')).toBe('ru');
    expect(detectLanguage('👍', 'de')).toBe('de');
  });

  it('finds e-mails, phones and messenger links but not dates, times or salary ranges', () => {
    expect(findContactDetails('yaz mənə ali@mail.az')).toEqual(['EMAIL']);
    expect(findContactDetails('Zəng edin: +994 50 111 22 33')).toEqual(['PHONE']);
    expect(findContactDetails('Meine Nummer 0151 2345678')).toEqual(['PHONE']);
    expect(findContactDetails('wa.me/994501112233')).toContain('MESSENGER');
    expect(findContactDetails('ali (at) mail (dot) az')).toEqual(['EMAIL']);
    expect(findContactDetails('Termin am 12.10.2026 10:30, Gehalt 2800-3400 EUR, PLZ 20095')).toEqual([]);
  });
});

// ─── Feature 1: translation of case messages ───────────────────────────

describe('automatic translation (case chat)', () => {
  it('stores the detected language, translates on demand into the reader language with one cheap call per thread, and caches', async () => {
    const client = await asClient({ locale: 'az' });
    const other = await asClient({ locale: 'az' });
    const staff = await asStaff({ locale: 'de' });
    const caseId = (await createCaseVia(client.agent)).id as string;
    const otherCase = (await createCaseVia(other.agent)).id as string;
    await other.agent.post(`/api/cases/${otherCase}/messages`).send({ body: 'Başqa müraciətin gizli mesajı' });

    const sent = await client.agent.post(`/api/cases/${caseId}/messages`).send({ body: 'Salam, sənədləri sabah göndərəcəyəm' });
    expect(sent.status).toBe(201);
    expect(sent.body.message.lang).toBe('az');
    expect(fake.requests).toHaveLength(0); // sending never calls the AI

    const r = await staff.agent.post('/api/messaging-plus/translate').send({ scope: 'case', id: caseId });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.lang).toBe('de');
    expect(r.body.translations[sent.body.message.id]).toEqual({ text: 'GE: Salam, sənədləri sabah göndərəcəyəm', lang: 'de' });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0].model).toBe(CHEAP_MODEL);
    // Only this case's messages are in the prompt.
    expect(userText(fake.requests[0])).not.toContain('gizli');

    // Cached: the second load does not call the AI; the cost is on the reader's (staff → ADMIN) usage.
    const again = await staff.agent.post('/api/messaging-plus/translate').send({ scope: 'case', id: caseId });
    expect(again.body.translations[sent.body.message.id].text).toContain('Salam');
    expect(fake.requests).toHaveLength(1);
    expect(await prisma.messageTranslation.count()).toBe(1);
    const conv = await prisma.aiConversation.findFirstOrThrow({ where: { userId: staff.user.id, title: `AI · ${TRANSLATE_PURPOSE}` } });
    expect(conv.scope).toBe('ADMIN');

    // The client reads in az: their own message needs nothing.
    const mine = await client.agent.post('/api/messaging-plus/translate').send({ scope: 'case', id: caseId });
    expect(mine.body.translations).toEqual({});

    // Another client cannot use the endpoint for this case.
    expect((await other.agent.post('/api/messaging-plus/translate').send({ scope: 'case', id: caseId })).status).toBe(404);
  });

  it('shows originals with a reason when the AI is unavailable', async () => {
    const client = await asClient();
    const staff = await asStaff({ locale: 'en' });
    const caseId = (await createCaseVia(client.agent)).id as string;
    await client.agent.post(`/api/cases/${caseId}/messages`).send({ body: 'Salam, necəsiniz? Sənəd hazırdır' });
    delete process.env.OPENROUTER_API_KEY;
    clearAiSettingsCache();
    const r = await staff.agent.post('/api/messaging-plus/translate').send({ scope: 'case', id: caseId });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ translations: {}, unavailable: 'NO_API_KEY' });
    expect(r.body.pending).toHaveLength(1);
  });

  it('stores the "show originals" preference; the draft preview is for staff only', async () => {
    const client = await asClient();
    const staff = await asStaff();
    const p = await client.agent.patch('/api/messaging-plus/preferences').send({ showOriginals: true });
    expect(p.body.preferences.showOriginals).toBe(true);
    expect((await client.agent.get('/api/messaging-plus/preferences')).body.preferences.showOriginals).toBe(true);

    expect((await client.agent.post('/api/messaging-plus/translate/preview').send({ text: 'Salam', targets: ['de'] })).status).toBe(403);
    const prev = await staff.agent.post('/api/messaging-plus/translate/preview').send({ text: 'Müsahibə cümə günü saat 10:00-dadır', targets: ['de'] });
    expect(prev.status).toBe(200);
    expect(prev.body.translations.de).toBe('DE: Müsahibə cümə günü saat 10:00-dadır');
  });
});

// ─── Feature 2: three-party thread ─────────────────────────────────────

describe('three-party thread', () => {
  it('opens only from PROPOSED on, once, and notifies candidate and employer in their language', async () => {
    const s = await setupApplication('NEW');
    expect((await s.staff.agent.post('/api/messaging-plus/threads').send({ applicationId: s.app.id })).status).toBe(409);
    await prisma.vacancyApplication.update({ where: { id: s.app.id }, data: { status: 'PROPOSED' } });
    const id = await openThread(s.staff, s.app.id);
    const again = await s.staff.agent.post('/api/messaging-plus/threads').send({ applicationId: s.app.id });
    expect(again.status).toBe(200);
    expect(again.body.thread.id).toBe(id);
    expect(await prisma.auditLog.count({ where: { action: 'PARTY_THREAD_OPENED' } })).toBe(1);

    const forEmployer = await prisma.notification.findFirstOrThrow({ where: { userId: s.employer.user.id, type: 'PARTY_OPENED' } });
    expect(forEmployer.title).toMatch(/^Neues Gespräch: Ali M\./);
    expect(forEmployer.link).toBe(`/company/candidates?thread=${id}`);
    const forCandidate = await prisma.notification.findFirstOrThrow({ where: { userId: s.candidate.user.id, type: 'PARTY_OPENED' } });
    expect(forCandidate.title).toContain('Yeni söhbət');
    expect(forCandidate.title).not.toContain(s.employer.company.name); // showCompany is off
    expect(forCandidate.link).toBe(`/account/applications?thread=${id}`);

    // Only staff can open threads.
    expect((await s.candidate.agent.post('/api/messaging-plus/threads').send({ applicationId: s.app.id })).status).toBe(403);
    expect((await s.employer.agent.post('/api/messaging-plus/threads').send({ applicationId: s.app.id })).status).toBe(403);
  });

  it('keeps the candidate anonymous for the employer and the employer hidden from the candidate unless allowed', async () => {
    const s = await setupApplication();
    const id = await openThread(s.staff, s.app.id);
    await s.candidate.agent.post(`/api/messaging-plus/threads/${id}/messages`).send({ body: 'Salam, mən iş üçün hazıram' });
    await s.employer.agent.post(`/api/messaging-plus/threads/${id}/messages`).send({ body: 'Guten Tag, wann können Sie anfangen?' });

    const emp = await s.employer.agent.get(`/api/messaging-plus/threads/${id}`);
    expect(emp.status).toBe(200);
    expect(emp.body.side).toBe('COMPANY');
    expect(emp.body.thread.candidateName).toBe('Ali M.');
    const json = JSON.stringify(emp.body);
    expect(json).not.toContain('Məmmədov');
    expect(json).not.toContain(s.candidate.user.email);
    expect(json).not.toContain(s.candidate.user.phone!);
    expect(json).not.toContain('Nizami'); // address
    expect(json).not.toContain(s.candidate.user.id);
    expect(emp.body.messages.find((m: { side: string }) => m.side === 'CANDIDATE').authorName).toBe('Ali M.');

    const cand = await s.candidate.agent.get(`/api/messaging-plus/threads/${id}`);
    expect(cand.body.thread.companyName).toBeNull();
    expect(JSON.stringify(cand.body)).not.toContain(s.employer.company.name);
    expect(JSON.stringify(cand.body)).not.toContain('Becker'); // employer user's name
    expect(cand.body.messages.find((m: { side: string }) => m.side === 'COMPANY').authorName).toBeNull();

    // Staff allow the company name.
    expect((await s.staff.agent.patch(`/api/messaging-plus/threads/${id}`).send({ showCompany: true })).status).toBe(200);
    const cand2 = await s.candidate.agent.get(`/api/messaging-plus/threads/${id}`);
    expect(cand2.body.thread.companyName).toBe(s.employer.company.name);

    // Staff see everybody by name.
    const st = await s.staff.agent.get(`/api/messaging-plus/threads/${id}`);
    expect(st.body.thread.candidateName).toBe('Ali Məmmədov');
  });

  it('holds contact details typed by the candidate or employer for staff review; staff messages pass', async () => {
    const s = await setupApplication();
    const id = await openThread(s.staff, s.app.id);
    const held = await s.candidate.agent.post(`/api/messaging-plus/threads/${id}/messages`).send({ body: 'Mənə yazın: ali.m@mail.az, +994 50 111 22 33' });
    expect(held.status).toBe(201);
    expect(held.body).toMatchObject({ held: true, message: { status: 'HELD', holdReason: 'CONTACT_DETAILS' } });

    // The employer does not see it; the author sees it marked; staff see it and get a notification.
    const emp = await s.employer.agent.get(`/api/messaging-plus/threads/${id}`);
    expect(JSON.stringify(emp.body)).not.toContain('ali.m@mail.az');
    expect(emp.body.messages).toHaveLength(0);
    const own = await s.candidate.agent.get(`/api/messaging-plus/threads/${id}`);
    expect(own.body.messages[0]).toMatchObject({ status: 'HELD', mine: true });
    const st = await s.staff.agent.get(`/api/messaging-plus/threads/${id}`);
    expect(st.body.heldCount).toBe(1);
    expect(await prisma.notification.count({ where: { userId: s.staff.user.id, type: 'PARTY_HELD' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: s.employer.user.id, type: 'PARTY_NEW_MESSAGE' } })).toBe(0);

    // Translation for the employer never includes the held message.
    await s.employer.agent.post(`/api/messaging-plus/translate`).send({ scope: 'party', id });
    expect(fake.requests.map(userText).join(' ')).not.toContain('ali.m@mail.az');

    // Staff approve → delivered and the employer is notified (in German).
    const msgId = held.body.message.id;
    expect((await s.staff.agent.post(`/api/messaging-plus/threads/${id}/messages/${msgId}/moderate`).send({ action: 'APPROVE' })).status).toBe(200);
    const emp2 = await s.employer.agent.get(`/api/messaging-plus/threads/${id}`);
    expect(emp2.body.messages[0].body).toContain('ali.m@mail.az');
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: s.employer.user.id, type: 'PARTY_NEW_MESSAGE' } });
    expect(n.title).toMatch(/^Neue Nachricht/);
    expect(await prisma.auditLog.count({ where: { action: 'PARTY_MESSAGE_APPROVE' } })).toBe(1);

    // Employer contact details are held too; reject tells the author.
    const empHeld = await s.employer.agent.post(`/api/messaging-plus/threads/${id}/messages`).send({ body: 'Rufen Sie mich an: 0151 2345678' });
    expect(empHeld.body.held).toBe(true);
    await s.staff.agent.post(`/api/messaging-plus/threads/${id}/messages/${empHeld.body.message.id}/moderate`).send({ action: 'REJECT' });
    expect(await prisma.notification.count({ where: { userId: s.employer.user.id, type: 'PARTY_REJECTED' } })).toBe(1);
    const cand = await s.candidate.agent.get(`/api/messaging-plus/threads/${id}`);
    expect(JSON.stringify(cand.body)).not.toContain('2345678');

    // Staff may send contact details.
    const staffMsg = await s.staff.agent.post(`/api/messaging-plus/threads/${id}/messages`).send({ body: 'Ofis: info@triad.az' });
    expect(staffMsg.body).toMatchObject({ held: false, message: { status: 'VISIBLE' } });
  });

  it('lets staff hide, delete, pin and close; participants only; employer translations in German', async () => {
    const s = await setupApplication();
    const id = await openThread(s.staff, s.app.id);
    const m = await s.candidate.agent.post(`/api/messaging-plus/threads/${id}/messages`).send({ body: 'Salam, mənzil məsələsi necə olacaq?' });

    // Employer reads in German: one AI call with only this thread's visible message.
    const tr = await s.employer.agent.post('/api/messaging-plus/translate').send({ scope: 'party', id });
    expect(tr.body.lang).toBe('de');
    expect(tr.body.translations[m.body.message.id].text).toBe('GE: Salam, mənzil məsələsi necə olacaq?');
    const view = await s.employer.agent.get(`/api/messaging-plus/threads/${id}`);
    expect(view.body.translations[m.body.message.id]).toBeDefined();

    // Hide → gone for the others, kept for staff.
    await s.staff.agent.post(`/api/messaging-plus/threads/${id}/messages/${m.body.message.id}/moderate`).send({ action: 'HIDE' });
    expect((await s.employer.agent.get(`/api/messaging-plus/threads/${id}`)).body.messages).toHaveLength(0);
    expect((await s.staff.agent.get(`/api/messaging-plus/threads/${id}`)).body.messages[0].status).toBe('HIDDEN');
    // Delete → content removed for everyone (translations too).
    await s.staff.agent.post(`/api/messaging-plus/threads/${id}/messages/${m.body.message.id}/moderate`).send({ action: 'DELETE' });
    const row = await prisma.partyThreadMessage.findUniqueOrThrow({ where: { id: m.body.message.id } });
    expect(row).toMatchObject({ status: 'DELETED', body: '' });
    expect(await prisma.messageTranslation.count({ where: { partyMessageId: row.id } })).toBe(0);
    // Moderation is staff-only.
    expect((await s.employer.agent.post(`/api/messaging-plus/threads/${id}/messages/${row.id}/moderate`).send({ action: 'APPROVE' })).status).toBe(403);

    // Pins
    const pin = await s.staff.agent.post(`/api/messaging-plus/threads/${id}/pins`).send({ topic: 'INTERVIEW_TIME', text: '12.11.2026 10:00 (Zoom)' });
    expect(pin.status).toBe(201);
    expect((await s.candidate.agent.get(`/api/messaging-plus/threads/${id}`)).body.thread.pins[0]).toMatchObject({ topic: 'INTERVIEW_TIME', text: '12.11.2026 10:00 (Zoom)' });
    expect((await s.candidate.agent.post(`/api/messaging-plus/threads/${id}/pins`).send({ topic: 'OTHER', text: 'x' })).status).toBe(403);
    expect((await s.staff.agent.delete(`/api/messaging-plus/threads/${id}/pins/${pin.body.pin.id}`)).status).toBe(200);

    // Outsiders: another employer, another candidate, staff without 2FA.
    const otherEmployer = await asCompany();
    const otherClient = await asClient();
    const noTwoFactor = await asStaff({ twoFactor: false });
    expect((await otherEmployer.agent.get(`/api/messaging-plus/threads/${id}`)).status).toBe(404);
    expect((await otherClient.agent.get(`/api/messaging-plus/threads/${id}`)).status).toBe(404);
    expect((await otherClient.agent.post(`/api/messaging-plus/threads/${id}/messages`).send({ body: 'hi' })).status).toBe(404);
    expect((await noTwoFactor.agent.get(`/api/messaging-plus/threads/${id}`)).status).toBe(403);
    expect((await otherEmployer.agent.get('/api/messaging-plus/threads')).body.items).toHaveLength(0);
    expect((await s.employer.agent.get('/api/messaging-plus/threads')).body.items).toHaveLength(1);
    expect((await s.candidate.agent.get('/api/messaging-plus/threads')).body.items[0]).toMatchObject({ id, companyName: null });

    // Close → nobody can write; the parties are told.
    await s.staff.agent.patch(`/api/messaging-plus/threads/${id}`).send({ status: 'CLOSED' });
    expect((await s.candidate.agent.post(`/api/messaging-plus/threads/${id}/messages`).send({ body: 'Salam' })).status).toBe(409);
    expect(await prisma.notification.count({ where: { userId: s.candidate.user.id, type: 'PARTY_CLOSED' } })).toBe(1);
  });

  it('opens per case placed with a company; the impersonating admin may read but not write', async () => {
    const employer = await asCompany();
    const client = await asClient({ firstName: 'Nigar', lastName: 'Həsənova' });
    const admin = await asAdmin();
    const caseId = (await createCaseVia(client.agent)).id as string;
    expect((await admin.agent.post('/api/messaging-plus/threads').send({ caseId })).status).toBe(409); // no company yet
    await prisma.case.update({ where: { id: caseId }, data: { companyId: employer.company.id } });
    const res = await admin.agent.post('/api/messaging-plus/threads').send({ caseId });
    expect(res.status).toBe(201);
    const id = res.body.thread.id;
    const lookup = await admin.agent.get(`/api/messaging-plus/threads/lookup?caseId=${caseId}`);
    expect(lookup.body.thread.id).toBe(id);
    expect((await employer.agent.get(`/api/messaging-plus/threads/${id}`)).body.thread.candidateName).toBe('Nigar H.');

    const start = await admin.agent.post(`/api/admin/impersonate/${client.user.id}`).send({ reason: 'SUPPORT_REQUEST' });
    expect(start.status).toBe(201);
    const imp = ([] as string[]).concat(start.headers['set-cookie'] ?? []).find((c) => c.startsWith('tv_imp='))!.split(';')[0];
    const viewing = (method: 'get' | 'post', url: string) => request(app)[method](url).set('Cookie', `tv_session=${admin.token}; ${imp}`).set('Origin', ORIGIN);
    expect((await viewing('get', `/api/messaging-plus/threads/${id}`)).status).toBe(200);
    expect((await viewing('post', `/api/messaging-plus/threads/${id}/messages`).send({ body: 'test' })).status).toBe(403);
  });
});

// ─── Feature 3: voice messages ─────────────────────────────────────────

describe('voice messages', () => {
  it('validates audio uploads (type, bytes, duration, size) and serves the file to the case participants only', async () => {
    const client = await asClient();
    const other = await asClient();
    const staff = await asStaff();
    const caseId = (await createCaseVia(client.agent)).id as string;
    const url = `/api/messaging-plus/cases/${caseId}/voice`;

    expect((await voice(client.agent, url, { buf: Buffer.from('hello world, not audio'), type: 'text/plain', name: 'a.txt' })).body.error).toBe('UNSUPPORTED_FILE_TYPE');
    expect((await voice(client.agent, url, { buf: Buffer.from('<html><script>alert(1)</script>') })).body.error).toBe('FILE_CONTENT_MISMATCH');
    expect((await voice(client.agent, url, { buf: OGG, type: 'audio/mp4', name: 'v.m4a' })).body.error).toBe('FILE_CONTENT_MISMATCH');
    expect((await voice(client.agent, url, { durationMs: 4 * 60 * 1000 })).body.error).toBe('VOICE_TOO_LONG');
    expect((await voice(client.agent, url, { buf: Buffer.concat([WEBM, Buffer.alloc(7 * 1024 * 1024)]) })).status).toBe(413);
    expect((await voice(other.agent, url)).status).toBe(404);
    expect(await prisma.voiceClip.count()).toBe(0);

    for (const [buf, type, name] of [[OGG, 'audio/ogg', 'v.ogg'], [MP4, 'audio/mp4', 'v.m4a']] as const) {
      expect((await voice(client.agent, url, { buf, type, name })).status).toBe(201);
    }
    const ok = await voice(client.agent, url);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    // No transcription configured: clear "not configured" state, the audio still works.
    expect(ok.body.message.voice).toMatchObject({ mimeType: 'audio/webm', durationMs: 4200, transcriptStatus: 'NOT_CONFIGURED', transcript: null });
    expect((await client.agent.get('/api/messaging-plus/status')).body.transcription).toEqual({ enabled: false, reason: 'NOT_CONFIGURED' });
    const clipId = ok.body.message.voice.id;

    const file = await client.agent.get(`/api/messaging-plus/voice/${clipId}`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('audio/webm');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect((await staff.agent.get(`/api/messaging-plus/voice/${clipId}`)).status).toBe(200);
    expect((await other.agent.get(`/api/messaging-plus/voice/${clipId}`)).status).toBe(404);
    expect((await anon().get(`/api/messaging-plus/voice/${clipId}`)).status).toBe(401);

    // Signed link for the mobile player: works without a session, not after tampering.
    const link = await client.agent.get(`/api/messaging-plus/voice/${clipId}/link`);
    expect((await anon().get(link.body.url)).status).toBe(200);
    expect((await anon().get(link.body.url.replace(/sig=../, 'sig=00'))).status).toBe(404);
    expect((await other.agent.get(`/api/messaging-plus/voice/${clipId}/link`)).status).toBe(404);

    // The case detail and list carry the voice message.
    const list = await staff.agent.get(`/api/admin/cases/${caseId}/messages`);
    expect(list.body.messages.at(-1).voice.id).toBe(clipId);
  });

  it('transcribes through the OpenRouter audio provider when configured and translates the transcript', async () => {
    process.env.AI_TRANSCRIBE_MODEL = 'google/gemini-test-audio';
    const client = await asClient();
    const staff = await asStaff({ locale: 'de' });
    const caseId = (await createCaseVia(client.agent)).id as string;
    const ok = await voice(client.agent, `/api/messaging-plus/cases/${caseId}/voice`);
    expect(ok.body.message.voice.transcriptStatus).toBe('PENDING');
    await flushTranscriptions();
    const audioReq = fake.requests.find((r) => r.model === 'google/gemini-test-audio')!;
    const parts = audioReq.messages[1].content as unknown as { type: string; input_audio?: { format: string; data: string } }[];
    expect(parts.find((p) => p.type === 'input_audio')!.input_audio).toMatchObject({ format: 'webm', data: WEBM.toString('base64') });

    const clip = await prisma.voiceClip.findUniqueOrThrow({ where: { id: ok.body.message.voice.id } });
    expect(clip).toMatchObject({ transcriptStatus: 'DONE', transcript: 'Salam, mən hazıram', transcriptLang: 'az' });
    const tr = await staff.agent.post('/api/messaging-plus/translate').send({ scope: 'case', id: caseId });
    expect(tr.body.translations[ok.body.message.id].text).toBe('GE: Salam, mən hazıram');
  });

  it('holds voice messages of the candidate in a three-party thread until the transcript is clean', async () => {
    const transcripts = ['Mən cümə günü gələ bilərəm', 'Nömrəm +994 50 111 22 33'];
    const provider: TranscriptionProvider = {
      id: 'fake',
      status: async () => ({ enabled: true }),
      transcribe: async () => ({ ok: true, text: transcripts.shift()!, lang: 'az' }),
    };
    setTranscriptionProvider(provider);
    const s = await setupApplication();
    const id = await openThread(s.staff, s.app.id);
    const clean = await voice(s.candidate.agent, `/api/messaging-plus/threads/${id}/voice`);
    expect(clean.body).toMatchObject({ held: true, message: { status: 'HELD', holdReason: 'VOICE_REVIEW' } });
    expect((await s.employer.agent.get(`/api/messaging-plus/threads/${id}`)).body.messages).toHaveLength(0);
    await flushTranscriptions();
    await settle();
    const emp = await s.employer.agent.get(`/api/messaging-plus/threads/${id}`);
    expect(emp.body.messages[0]).toMatchObject({ status: 'VISIBLE', voice: { transcript: 'Mən cümə günü gələ bilərəm' } });
    expect((await s.employer.agent.get(`/api/messaging-plus/voice/${emp.body.messages[0].voice.id}`)).status).toBe(200);

    const withPhone = await voice(s.candidate.agent, `/api/messaging-plus/threads/${id}/voice`);
    await flushTranscriptions();
    const row = await prisma.partyThreadMessage.findUniqueOrThrow({ where: { id: withPhone.body.message.id } });
    expect(row).toMatchObject({ status: 'HELD', holdReason: 'CONTACT_DETAILS' });
    // The employer can neither see nor fetch the held audio.
    expect((await s.employer.agent.get(`/api/messaging-plus/voice/${row.voiceId}`)).status).toBe(404);
    // Staff voice messages are never held.
    const staffVoice = await voice(s.staff.agent, `/api/messaging-plus/threads/${id}/voice`);
    expect(staffVoice.body.message.status).toBe('VISIBLE');
    await flushTranscriptions();
  });

  it('refuses voice messages for people outside the case', async () => {
    const owner = await createUser({ role: 'CLIENT' });
    const c = await prisma.case.create({ data: { number: `TV-${Date.now()}`, clientId: owner.user.id, profession: 'Sürücü' } });
    const intruder = await asClient();
    expect((await voice(intruder.agent, `/api/messaging-plus/cases/${c.id}/voice`)).status).toBe(404);
  });
});
