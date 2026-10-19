import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { anon, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { setAiTransport, setKeyInfoFetcher, setModelsFetcher, type ChatRequest, type StreamChunk } from '../../src/lib/ai/openrouter.js';
import { clearAiSettingsCache, saveAiSettings } from '../../src/lib/ai/settings.js';
import { clearRecommendationCache } from '../../src/lib/aiWriting/recommendations.js';
import { asCandidate, createVacancy } from './vacancies.fixtures';

process.env.OPENROUTER_API_KEY = 'sk-or-test-not-a-real-key';

// ─── Fake OpenRouter ────────────────────────────────────────────────────

const fake = { requests: [] as ChatRequest[], replies: [] as (string | Error)[] };

const textRound = (text: string, cost = 0.0004): StreamChunk[] => [
  { choices: [{ delta: { content: text.slice(0, 5) } }] },
  { choices: [{ delta: { content: text.slice(5) } }] },
  { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 300, completion_tokens: 200, cost } },
];

beforeEach(() => {
  fake.requests = [];
  fake.replies = [];
  clearAiSettingsCache();
  clearRecommendationCache();
  setKeyInfoFetcher(async () => null);
  setModelsFetcher(async () => []);
  setAiTransport(async function* (req) {
    fake.requests.push(JSON.parse(JSON.stringify(req)) as ChatRequest);
    const next = fake.replies.shift() ?? '{}';
    if (next instanceof Error) throw next;
    for (const c of textRound(next)) yield c;
  });
});

afterAll(() => {
  setAiTransport(null);
  setKeyInfoFetcher(null);
  setModelsFetcher(null);
});

const systemOf = (r: ChatRequest) => String((r.messages[0] as { content: unknown }).content);
const userOf = (r: ChatRequest) => String((r.messages[1] as { content: unknown }).content);

const CV_JSON = JSON.stringify({
  headline: 'Berufskraftfahrer (LKW, Klasse CE)',
  summary: 'Erfahrener Berufskraftfahrer mit fünf Jahren Praxis im internationalen Fernverkehr.',
  experience: [
    { title: 'Berufskraftfahrer', employer: 'Azər Trans MMC', city: 'Baku', country: 'Aserbaidschan', from: '2019', to: null, tasks: ['Transport von Waren im Fernverkehr', 'Tägliche Fahrzeugkontrolle'] },
    { title: 'Fahrer', employer: 'Kargo', city: 'Gəncə', country: 'Aserbaidschan', from: '03.2015', to: '2018-12', tasks: ['Auslieferung'] },
    { title: '', employer: 'broken', from: 'yesterday', tasks: [] },
  ],
  education: [{ degree: 'Berufsschule', institution: 'Berufsschule Nr. 5', city: 'Gəncə', country: 'Aserbaidschan', from: '2010', to: '2012', field: 'Kfz' }],
  languages: [{ language: 'Aserbaidschanisch', level: 'Muttersprache' }, { language: 'Deutsch', level: 'b1' }],
  skills: ['Ladungssicherung', 'Tachograph', 'Ladungssicherung'],
  drivingLicences: ['ce', 'C'],
});

const letterJson = (words = 260) =>
  JSON.stringify({
    title: 'Bewerbung als LKW-Fahrer',
    body: `Sehr geehrte Damen und Herren,\n\n${'Ich bewerbe mich gern als Fahrer bei Ihnen. '.repeat(Math.ceil(words / 8))}\n\nMit freundlichen Grüßen\n\nAli Məmmədov`,
    explanation: 'Bu məktubda siz LKW sürücüsü vəzifəsinə müraciət edirsiniz.',
  });

describe('POST /api/ai-writing/cv-draft', () => {
  it('turns wizard answers into normalised German CV entries without saving them', async () => {
    const c = await asCandidate();
    fake.replies.push(CV_JSON);
    const res = await c.agent
      .post('/api/ai-writing/cv-draft')
      .set('X-Locale', 'az')
      .send({ target: 'LKW sürücüsü, §19c', jobs: '2019-dan Azər Trans-da TIR sürücüsü', education: 'Peşə məktəbi', languages: 'Azərbaycan dili, alman B1, CE', strengths: 'dəqiq' });
    expect(res.status).toBe(200);
    const d = res.body.draft;
    expect(d.headline).toBe('Berufskraftfahrer (LKW, Klasse CE)');
    expect(d.experience).toHaveLength(2);
    expect(d.experience[0]).toMatchObject({ from: '2019-01', to: null });
    expect(d.experience[1]).toMatchObject({ from: '2015-03', to: '2018-12' });
    expect(d.education[0]).toMatchObject({ from: '2010-01', to: '2012-01' });
    expect(d.languages).toEqual([
      { language: 'Aserbaidschanisch', level: 'native' },
      { language: 'Deutsch', level: 'B1' },
    ]);
    expect(d.skills).toEqual(['Ladungssicherung', 'Tachograph']);
    expect(d.drivingLicences).toEqual(['CE', 'C']);

    // Prompt carries the answers and profile, uses the cheap model and a small answer budget.
    const req = fake.requests[0];
    expect(req.model).toBe('anthropic/claude-haiku-5.5');
    expect(userOf(req)).toContain('2019-dan Azər Trans-da TIR sürücüsü');
    expect(userOf(req)).toContain('German level: B1');
    expect(systemOf(req)).toContain('Lebenslauf');

    // Nothing saved; the cost is booked on the client (CLIENT scope).
    expect(await prisma.candidateCv.findUnique({ where: { userId: c.user.id } })).toBeNull();
    const conv = await prisma.aiConversation.findFirst({ where: { userId: c.user.id, scope: 'CLIENT', title: 'AI · cv-draft' }, include: { messages: true } });
    expect(conv?.messages[0].costMicros).toBe(400);
  });

  it('answers 503 on unusable output and validates input', async () => {
    const c = await asCandidate();
    fake.replies.push('not json at all');
    expect((await c.agent.post('/api/ai-writing/cv-draft').send({ target: 'Fahrer' })).body.error).toBe('AI_UNAVAILABLE');
    fake.replies.push(new Error('boom'));
    expect((await c.agent.post('/api/ai-writing/cv-draft').send({ target: 'Fahrer' })).status).toBe(503);
    expect((await c.agent.post('/api/ai-writing/cv-draft').send({ target: 'x' })).status).toBe(400);
    expect((await c.agent.post('/api/ai-writing/cv-draft').send({ target: 'Fahrer', extra: 1 })).status).toBe(400);
  });

  it('stops at the client daily cost cap and when the assistant is switched off', async () => {
    const c = await asCandidate();
    await saveAiSettings({ clientDailyCostUsd: 0.0003 });
    fake.replies.push(CV_JSON, CV_JSON);
    expect((await c.agent.post('/api/ai-writing/cv-draft').send({ target: 'Fahrer' })).status).toBe(200);
    const res = await c.agent.post('/api/ai-writing/cv-draft').send({ target: 'Fahrer' });
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: 'AI_LIMIT', reason: 'DAILY_COST' });
    expect(res.body.message).toBeTruthy();
    expect(fake.requests).toHaveLength(1);

    await saveAiSettings({ clientDailyCostUsd: 1, clientEnabled: false });
    const off = await c.agent.post('/api/ai-writing/cv-draft').send({ target: 'Fahrer' });
    expect(off.status).toBe(403);
    expect(off.body.error).toBe('AI_DISABLED');
  });
});

describe('cover letters', () => {
  it('drafts a letter for a published vacancy with an explanation in the chosen language', async () => {
    const c = await asCandidate();
    const v = await createVacancy({ description: { az: 'az', de: 'Fernverkehr ab Hamburg', en: 'en', ru: 'ru' } });
    fake.replies.push(letterJson());
    const res = await c.agent.post('/api/ai-writing/letter-draft').send({ vacancyId: v.id, notes: 'Uzun yollarda təcrübəm var', explainLang: 'ru' });
    expect(res.status).toBe(200);
    expect(res.body.draft).toMatchObject({ title: 'Bewerbung als LKW-Fahrer', vacancyId: v.id, position: 'LKW-Fahrer de', city: 'Hamburg' });
    expect(res.body.draft.body).toMatch(/^Sehr geehrte Damen und Herren,/);
    expect(res.body.draft.words).toBeGreaterThan(200);
    expect(res.body.draft.explanation).toContain('LKW');
    const req = fake.requests[0];
    expect(userOf(req)).toContain('Fernverkehr ab Hamburg');
    expect(userOf(req)).toContain('Uzun yollarda');
    expect(systemOf(req)).toContain('Russian');
    expect(await prisma.motivationLetter.count()).toBe(0);
  });

  it('drafts from a typed company / position, rejects hidden vacancies and missing positions', async () => {
    const c = await asCandidate();
    fake.replies.push(letterJson());
    const ok = await c.agent.post('/api/ai-writing/letter-draft').send({ company: 'Spedition Müller', position: 'Berufskraftfahrer', city: 'Köln' });
    expect(ok.status).toBe(200);
    expect(userOf(fake.requests[0])).toContain('Company: Spedition Müller');
    const draft = await createVacancy({ status: 'DRAFT' });
    expect((await c.agent.post('/api/ai-writing/letter-draft').send({ vacancyId: draft.id })).status).toBe(404);
    expect((await c.agent.post('/api/ai-writing/letter-draft').send({ company: 'X' })).status).toBe(400);
    expect(fake.requests).toHaveLength(1);
  });

  it('rewrites a letter in a variant', async () => {
    const c = await asCandidate();
    fake.replies.push(letterJson(190));
    const res = await c.agent.post('/api/ai-writing/letter-rewrite').send({ title: 'Bewerbung', body: 'Sehr geehrte Damen und Herren, ich bewerbe mich hiermit als Fahrer.', variant: 'shorter' });
    expect(res.status).toBe(200);
    expect(res.body.draft.variant).toBe('shorter');
    expect(systemOf(fake.requests[0])).toContain('shorter');
    expect((await c.agent.post('/api/ai-writing/letter-rewrite').send({ title: 'B', body: 'Sehr geehrte Damen und Herren, …', variant: 'funny' })).status).toBe(400);
    fake.replies.push(JSON.stringify({ title: 'x', body: 'zu kurz' }));
    expect((await c.agent.post('/api/ai-writing/letter-rewrite').send({ title: 'B', body: 'Sehr geehrte Damen und Herren, ich bewerbe mich.', variant: 'formal' })).status).toBe(503);
  });
});

describe('GET /api/ai-writing/recommendations', () => {
  it('returns the best matches with AI lines and caches them for the day', async () => {
    const c = await asCandidate({ profession: 'LKW-Fahrer', germanLevel: 'A2' });
    const good = await createVacancy({ title: { az: 'TIR sürücüsü', de: 'LKW-Fahrer', en: 'Truck driver', ru: 'Водитель' } });
    const ok = await createVacancy({ germanLevel: 'B2', salaryMin: 3600 });
    await createVacancy({ profession: 'Programmierer', germanLevel: 'C1', drivingLicence: null, minExperience: 8 });
    await createVacancy({ status: 'DRAFT' });
    fake.replies.push(JSON.stringify({ why: { [good.id]: 'Peşəniz və CE vəsiqəniz tam uyğundur.' }, tip: 'B2 almanca ilə maaş 15% artır' }));
    const res = await c.agent.get('/api/ai-writing/recommendations').set('X-Locale', 'az');
    expect(res.status).toBe(200);
    expect(res.body.ai).toBe(true);
    expect(res.body.tip).toBe('B2 almanca ilə maaş 15% artır');
    const ids = res.body.items.map((i: { vacancy: { id: string } }) => i.vacancy.id);
    expect(ids[0]).toBe(good.id);
    expect(ids).toContain(ok.id);
    expect(ids).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({ score: 100, why: 'Peşəniz və CE vəsiqəniz tam uyğundur.', vacancy: { title: 'TIR sürücüsü', slug: good.slug } });
    expect(res.body.items[0].met).toEqual(expect.arrayContaining(['PROFESSION', 'GERMAN', 'EXPERIENCE', 'LICENCE']));
    expect(res.body.items[1].gaps).toContainEqual({ code: 'GERMAN', required: 'B2', actual: 'A2' });

    // Cached: no second model call.
    const again = await c.agent.get('/api/ai-writing/recommendations').set('X-Locale', 'az');
    expect(again.body.generatedAt).toBe(res.body.generatedAt);
    expect(fake.requests).toHaveLength(1);

    // A profile change recomputes.
    await prisma.user.update({ where: { id: c.user.id }, data: { germanLevel: 'B2' } });
    fake.replies.push(JSON.stringify({ why: {}, tip: 'Yaxşı' }));
    await c.agent.get('/api/ai-writing/recommendations').set('X-Locale', 'az');
    expect(fake.requests).toHaveLength(2);
  });

  it('falls back to deterministic reasons when the AI is over its limit or fails', async () => {
    const c = await asCandidate({ profession: 'LKW-Fahrer' });
    await createVacancy();
    await saveAiSettings({ clientDailyCostUsd: 0 });
    const res = await c.agent.get('/api/ai-writing/recommendations');
    expect(res.status).toBe(200);
    expect(res.body.ai).toBe(false);
    expect(res.body.tip).toBeNull();
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].why).toBeNull();
    expect(res.body.items[0].met.length).toBeGreaterThan(0);
    expect(fake.requests).toHaveLength(0);

    clearRecommendationCache();
    await saveAiSettings({ clientDailyCostUsd: 1 });
    fake.replies.push(new Error('down'));
    const failed = await c.agent.get('/api/ai-writing/recommendations');
    expect(failed.body.ai).toBe(false);
    expect(failed.body.items).toHaveLength(1);
  });

  it('returns an empty list without calling the AI when nothing matches', async () => {
    const c = await asCandidate({ profession: 'Programmierer', germanLevel: 'none', drivingLicence: null, experienceYears: 0 });
    await createVacancy({ minExperience: 10, germanLevel: 'C1' });
    const res = await c.agent.get('/api/ai-writing/recommendations');
    expect(res.body.items).toEqual([]);
    expect(fake.requests).toHaveLength(0);
  });
});

describe('access', () => {
  it('is for clients only', async () => {
    expect((await anon().post('/api/ai-writing/cv-draft').send({ target: 'Fahrer' })).status).toBe(401);
    const staff = await asStaff();
    expect((await staff.agent.post('/api/ai-writing/cv-draft').send({ target: 'Fahrer' })).status).toBe(403);
    expect((await staff.agent.get('/api/ai-writing/recommendations')).status).toBe(403);
    expect(fake.requests).toHaveLength(0);
  });
});
