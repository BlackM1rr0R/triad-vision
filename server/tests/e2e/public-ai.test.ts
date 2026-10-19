import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { anon, asClient, asSuperAdmin, ORIGIN } from '../helpers/api';
import { prisma } from '../helpers/db';
import { contentPayload, createVisaCategory, l10n, uniq } from '../helpers/factories';
import { setAiTransport, setKeyInfoFetcher, setModelsFetcher, type ChatRequest, type StreamChunk } from '../../src/lib/ai/openrouter.js';
import { clearAiSettingsCache, saveAiSettings } from '../../src/lib/ai/settings.js';
import { resetPublicAiGuards } from '../../src/lib/publicAi/guard.js';
import { clearKnowledgeCache } from '../../src/lib/publicAi/knowledge.js';
import { flushPublicUsage, publicUsageToday, PUBLIC_USAGE_KEY, utcDay } from '../../src/lib/publicAi/usage.js';

process.env.OPENROUTER_API_KEY = 'sk-or-test-not-a-real-key';

const createFaq = (over: Record<string, unknown>) => prisma.faq.create({ data: contentPayload.faqs(over) as never });

const fake = { requests: [] as ChatRequest[], replies: [] as (string | Error)[] };

const round = (text: string, cost = 0.0005): StreamChunk[] => [
  { choices: [{ delta: { content: text } }] },
  { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 500, completion_tokens: 80, cost } },
];

beforeEach(() => {
  fake.requests = [];
  fake.replies = [];
  clearAiSettingsCache();
  clearKnowledgeCache();
  resetPublicAiGuards();
  setKeyInfoFetcher(async () => null);
  setModelsFetcher(async () => []);
  setAiTransport(async function* (req) {
    fake.requests.push(JSON.parse(JSON.stringify(req)) as ChatRequest);
    const next = fake.replies.shift() ?? 'Salam! Sizə necə kömək edə bilərəm?';
    if (next instanceof Error) throw next;
    for (const c of round(next)) yield c;
  });
});

afterAll(() => {
  setAiTransport(null);
  setKeyInfoFetcher(null);
  setModelsFetcher(null);
});

const chat = (body: Record<string, unknown>) => anon().post('/api/public-ai/chat').set('Origin', ORIGIN).send({ sessionId: 'sess-12345678', lang: 'az', ...body });
const systemOf = (r: ChatRequest) => String((r.messages[0] as { content: unknown }).content);
const userOf = (r: ChatRequest) => String((r.messages[1] as { content: unknown }).content);

describe('POST /api/public-ai/chat', () => {
  it('answers with site knowledge in the visitor language, books aggregated usage and stores no conversation', async () => {
    await createVisaCategory({ visaLabel: '§18b', title: l10n('Fachkräfte'), germanLevel: 'B1', processingMin: 8, processingMax: 16 });
    await createFaq({ question: { az: 'Ailə birləşməsi üçün almanca lazımdırmı?', de: 'Braucht man Deutsch für den Familiennachzug?', en: 'q', ru: 'q' }, answer: { az: 'Bəli, adətən A1 səviyyəsi tələb olunur.', de: 'Ja, meist A1.', en: 'a', ru: 'a' } });
    fake.replies.push('Ailə birləşməsi üçün adətən A1 almanca tələb olunur.');
    const res = await chat({ message: 'Ailə birləşməsi üçün almanca lazımdır?' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reply: 'Ailə birləşməsi üçün adətən A1 almanca tələb olunur.', lang: 'az', offerLead: false, turnsLeft: 11 });

    const req = fake.requests[0];
    expect(req.model).toBe('anthropic/claude-haiku-5.5');
    expect(systemOf(req)).toContain('Answer in Azerbaijani');
    expect(systemOf(req)).toContain('A1 səviyyəsi');
    expect(systemOf(req)).toContain('§18b');
    expect(systemOf(req)).toMatch(/Never guarantee a visa/);
    expect(userOf(req)).toContain('Visitor: Ailə birləşməsi');

    await flushPublicUsage();
    expect(await publicUsageToday()).toMatchObject({ usd: 0.0005, messages: 1 });
    expect(await prisma.aiConversation.count()).toBe(0);
    expect(await prisma.aiMessage.count()).toBe(0);
  });

  it('detects Russian and German, offers the lead on intent and after three answers', async () => {
    fake.replies.push('Конечно! [[LEAD]]');
    const ru = await chat({ message: 'Хочу записаться на консультацию' });
    expect(ru.body).toMatchObject({ lang: 'ru', reply: 'Конечно!', offerLead: true });
    expect(systemOf(fake.requests[0])).toContain('Russian');

    const de = await chat({ sessionId: 'sess-de-0001', message: 'Wie lange dauert das Visum für eine Ausbildung?' });
    expect(de.body.lang).toBe('de');
    expect(de.body.offerLead).toBe(false);

    const history = [
      { role: 'user', content: 'Salam' },
      { role: 'assistant', content: 'Salam!' },
      { role: 'user', content: 'Ausbildung nədir?' },
      { role: 'assistant', content: 'Peşə təhsili.' },
    ];
    const third = await chat({ sessionId: 'sess-hist-001', message: 'Neçə ay çəkir?', history });
    expect(third.body.offerLead).toBe(true);
    expect(userOf(fake.requests[2])).toContain('Advisor: Peşə təhsili.');
  });

  it('limits a session to 12 turns and an IP to 15 messages per hour', async () => {
    for (let i = 0; i < 12; i++) expect((await chat({ message: `sual ${i}` })).status).toBe(200);
    const sess = await chat({ message: 'daha bir' });
    expect(sess.status).toBe(429);
    expect(sess.body).toMatchObject({ error: 'TOO_MANY_REQUESTS', scope: 'session' });
    // Sending a long history in a fresh session does not bypass the turn limit either.
    const history = Array.from({ length: 12 }, (_, i) => ({ role: 'user', content: `q${i}` }));
    expect((await chat({ sessionId: 'sess-other-01', message: 'x', history })).body.scope).toBe('session');

    for (let i = 0; i < 3; i++) expect((await chat({ sessionId: 'sess-second-1', message: `s ${i}` })).status).toBe(200);
    const ip = await chat({ sessionId: 'sess-third-01', message: 'one more' });
    expect(ip.status).toBe(429);
    expect(ip.body.scope).toBe('hour');
    expect(fake.requests).toHaveLength(15);
  });

  it('respects the on/off switch and the global daily public cap', async () => {
    await saveAiSettings({ publicAdvisorEnabled: false });
    const off = await chat({ message: 'salam' });
    expect(off.status).toBe(403);
    expect(off.body.error).toBe('PUBLIC_AI_DISABLED');
    expect((await anon().get('/api/public-ai/status')).body).toEqual({ enabled: false, maxTurns: 12 });

    await saveAiSettings({ publicAdvisorEnabled: true, publicDailyUsd: 0.001 });
    await prisma.setting.create({ data: { key: PUBLIC_USAGE_KEY, value: { days: { [utcDay()]: { usd: 0.001, messages: 2, quiz: 0, leads: 0 } } } } });
    const capped = await chat({ message: 'salam' });
    expect(capped.status).toBe(503);
    expect(capped.body).toMatchObject({ error: 'PUBLIC_AI_BUSY', reason: 'DAILY_CAP' });

    await saveAiSettings({ publicDailyUsd: 1, monthlyBudgetUsd: 0.001 });
    expect((await chat({ message: 'salam' })).body.reason).toBe('MONTHLY_BUDGET');
    expect(fake.requests).toHaveLength(0);
  });

  it('silently ignores bots that fill the honeypot and validates input', async () => {
    const bot = await chat({ message: 'buy now', website: 'http://spam.example' });
    expect(bot.status).toBe(200);
    expect(fake.requests).toHaveLength(0);
    expect((await chat({ message: 'x'.repeat(601) })).status).toBe(400);
    expect((await chat({ sessionId: 'bad id!', message: 'salam' })).status).toBe(400);
  });

  it('reports an upstream failure as 503', async () => {
    fake.replies.push(new Error('down'));
    const res = await chat({ message: 'salam' });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('AI_UNAVAILABLE');
  });
});

describe('POST /api/public-ai/eligibility', () => {
  const answers = { age: '26_35', profession: 'driver', experience: '5p', education: 'school', german: 'A1', licence: 'CE', family: 'single', goal: 'work' };

  it('returns deterministic paths with durations and a linked visa category, without AI by default', async () => {
    await createVisaCategory({ visaLabel: '§19c', slug: uniq('drivers-') });
    const res = await anon().post('/api/public-ai/eligibility').set('Origin', ORIGIN).send({ answers, lang: 'az' });
    expect(res.status).toBe(200);
    expect(res.body.explanation).toBeNull();
    const top = res.body.paths[0];
    expect(top).toMatchObject({ key: 'drivers_19c', visaType: 'WORK', minWeeks: 8, maxWeeks: 21 });
    expect(top.visa.label).toBe('§19c');
    expect(fake.requests).toHaveLength(0);
  });

  it('adds a short AI explanation when asked (and falls back to none when switched off)', async () => {
    fake.replies.push('Sizə ən uyğun yol §19c sürücü vizasıdır.');
    const res = await anon().post('/api/public-ai/eligibility').set('Origin', ORIGIN).send({ answers, lang: 'az', explain: true });
    expect(res.body.explanation).toBe('Sizə ən uyğun yol §19c sürücü vizasıdır.');
    expect(userOf(fake.requests[0])).toContain('drivers_19c');
    await flushPublicUsage();
    expect((await publicUsageToday()).quiz).toBe(1);

    await saveAiSettings({ publicAdvisorEnabled: false });
    const off = await anon().post('/api/public-ai/eligibility').set('Origin', ORIGIN).send({ answers, lang: 'az', explain: true });
    expect(off.status).toBe(200);
    expect(off.body.explanation).toBeNull();
    expect(fake.requests).toHaveLength(1);
  });

  it('rejects invalid answers', async () => {
    expect((await anon().post('/api/public-ai/eligibility').set('Origin', ORIGIN).send({ answers: { ...answers, german: 'C2' } })).status).toBe(400);
  });
});

describe('POST /api/public-ai/lead', () => {
  it('creates an inquiry marked "AI advisor" with the chat summary and notifies staff', async () => {
    const admin = await asSuperAdmin();
    const res = await anon()
      .post('/api/public-ai/lead')
      .set('Origin', ORIGIN)
      .send({
        name: 'Leyla Həsənova',
        phone: '+994 50 123 45 67',
        consent: true,
        source: 'advisor',
        lang: 'az',
        transcript: [
          { role: 'user', content: 'Ausbildung üçün nə lazımdır?' },
          { role: 'assistant', content: 'B1 almanca…' },
          { role: 'user', content: 'Mən 22 yaşındayam' },
        ],
      });
    expect(res.status).toBe(201);
    const inq = await prisma.inquiry.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(inq).toMatchObject({ kind: 'contact', contactName: 'Leyla Həsənova', email: '', phone: '+994 50 123 45 67', sector: 'AI advisor', locale: 'az', status: 'NEW' });
    expect(inq.message).toContain('[AI advisor');
    expect(inq.message).toContain('• Ausbildung üçün nə lazımdır?');
    expect(inq.message).toContain('• Mən 22 yaşındayam');
    expect(inq.message).not.toContain('B1 almanca');
    const n = await prisma.notification.findFirst({ where: { userId: admin.user.id }, orderBy: { createdAt: 'desc' } });
    expect(n?.title).toContain('Leyla Həsənova');
    await flushPublicUsage();
    expect((await publicUsageToday()).leads).toBe(1);
  });

  it('includes quiz answers for quiz leads', async () => {
    const res = await anon()
      .post('/api/public-ai/lead')
      .set('Origin', ORIGIN)
      .send({ name: 'Orxan', email: 'orxan@example.com', consent: true, source: 'quiz', lang: 'ru', answers: { age: '18_25', profession: 'other', experience: 'none', education: 'school', german: 'A2', licence: 'none', family: 'single', goal: 'ausbildung' } });
    expect(res.status).toBe(201);
    const inq = await prisma.inquiry.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(inq.email).toBe('orxan@example.com');
    expect(inq.message).toContain('ausbildung_16a');
  });

  it('requires consent and a contact, ignores bots and limits leads per IP', async () => {
    const base = { name: 'Test Visitor', email: 'v@example.com', source: 'advisor', lang: 'az' };
    expect((await anon().post('/api/public-ai/lead').set('Origin', ORIGIN).send(base)).status).toBe(400);
    expect((await anon().post('/api/public-ai/lead').set('Origin', ORIGIN).send({ ...base, consent: false })).status).toBe(400);
    expect((await anon().post('/api/public-ai/lead').set('Origin', ORIGIN).send({ ...base, email: undefined, consent: true })).status).toBe(400);
    expect((await anon().post('/api/public-ai/lead').set('Origin', ORIGIN).send({ ...base, consent: true, website: 'x' })).status).toBe(201);
    expect(await prisma.inquiry.count()).toBe(0);
    for (let i = 0; i < 5; i++) expect((await anon().post('/api/public-ai/lead').set('Origin', ORIGIN).send({ ...base, consent: true })).status).toBe(201);
    expect((await anon().post('/api/public-ai/lead').set('Origin', ORIGIN).send({ ...base, consent: true })).status).toBe(429);
    expect(await prisma.inquiry.count()).toBe(5);
  });
});

describe('GET /api/public-ai/usage', () => {
  it('is for the super admin and shows today / month totals', async () => {
    await prisma.setting.create({ data: { key: PUBLIC_USAGE_KEY, value: { days: { [utcDay()]: { usd: 0.02, messages: 7, quiz: 2, leads: 1 } } } } });
    const sa = await asSuperAdmin();
    const res = await sa.agent.get('/api/public-ai/usage');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ today: { usd: 0.02, messages: 7, quiz: 2, leads: 1 }, month: { messages: 7 }, dailyCapUsd: 0.5, enabled: true });
    const client = await asClient();
    expect((await client.agent.get('/api/public-ai/usage')).status).toBe(403);
    expect((await sa.agent.put('/api/ai/settings').send({ publicDailyUsd: 0.25, publicAdvisorEnabled: false })).body.settings).toMatchObject({ publicDailyUsd: 0.25, publicAdvisorEnabled: false });
  });
});
