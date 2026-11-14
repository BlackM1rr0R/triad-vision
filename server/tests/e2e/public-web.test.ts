import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asStaff, ORIGIN, type Actor } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createVisaCategory, l10n, uniq } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';
import { subscribe, type RealtimeEvent } from '../../src/lib/messaging/realtime.js';
import { setAiTransport, setKeyInfoFetcher, setModelsFetcher, type ChatRequest, type StreamChunk } from '../../src/lib/ai/openrouter.js';
import { clearAiSettingsCache } from '../../src/lib/ai/settings.js';
import { resetPublicAiGuards } from '../../src/lib/publicAi/guard.js';
import { clearKnowledgeCache } from '../../src/lib/publicAi/knowledge.js';
import { expireWaiting } from '../../src/lib/livechat/core.js';
import { quickNetMonthly } from '../../src/lib/budget/salary.js';

/**
 * Public website extras: the "which path fits me" wizard (GET /api/public-ai/path-finder) and the offline live
 * chat (POST /api/livechat with offline: true → queued for staff, the AI advisor answers until someone accepts).
 */

process.env.OPENROUTER_API_KEY = 'sk-or-test-not-a-real-key';

const fake = { requests: [] as ChatRequest[], replies: [] as string[] };

beforeEach(() => {
  fake.requests = [];
  fake.replies = [];
  clearAiSettingsCache();
  clearKnowledgeCache();
  resetPublicAiGuards();
  setKeyInfoFetcher(async () => null);
  setModelsFetcher(async () => []);
  setAiTransport(async function* (req): AsyncGenerator<StreamChunk> {
    fake.requests.push(JSON.parse(JSON.stringify(req)) as ChatRequest);
    yield { choices: [{ delta: { content: fake.replies.shift() ?? 'Salam!' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0.0001 } };
  });
});

afterAll(() => {
  setAiTransport(null);
  setKeyInfoFetcher(null);
  setModelsFetcher(null);
});

// ─── Path finder ───────────────────────────────────────────────────────

const vacancy = (over: Record<string, unknown>) =>
  prisma.vacancy.create({ data: { slug: uniq('job-'), title: l10n('Job'), description: l10n('Text'), status: 'OPEN', ...over } as never });

const finder = (q: Record<string, string>) => anon().get('/api/public-ai/path-finder').query(q);

describe('GET /api/public-ai/path-finder', () => {
  const driver = { profession: 'driver', education: 'school', german: 'A2', experience: '2_5', age: '26_35', lang: 'de' };

  it('returns the paths with reasons, duration, the salary from live vacancies and the matching package', async () => {
    await createVisaCategory({ slug: 'lkw', visaLabel: '§19c', title: l10n('Berufskraftfahrer'), processingMin: 8, processingMax: 16 });
    await vacancy({ profession: 'LKW-Fahrer', salaryMin: 2900, salaryMax: 3300 });
    await vacancy({ profession: 'Berufskraftfahrer', salaryMin: 3100, salaryMax: 3500 });
    await vacancy({ profession: 'Koch', salaryMin: 2400, salaryMax: 2500 });
    await vacancy({ profession: 'LKW-Fahrer', salaryMin: 9000, salaryMax: 9900, status: 'CLOSED' });
    await prisma.servicePackage.create({ data: { slug: 'start', tier: 'BASIC', title: l10n('Start'), summary: l10n('s'), features: { az: [], de: [], en: [], ru: [] }, priceCents: 49000, published: true } });
    await prisma.servicePackage.create({ data: { slug: 'work-plus', tier: 'STANDARD', visaTypes: ['WORK'], title: l10n('Arbeit Plus'), summary: l10n('s'), features: { az: [], de: [], en: [], ru: [] }, priceCents: 99000, published: true, highlight: true } });
    await prisma.servicePackage.create({ data: { slug: 'draft', tier: 'PREMIUM', visaTypes: ['WORK'], title: l10n('Draft'), summary: l10n('s'), features: { az: [], de: [], en: [], ru: [] }, priceCents: 1, published: false } });

    const res = expectStatus(await finder(driver), 200);
    expect(res.body.answers).toEqual({ profession: 'driver', education: 'school', german: 'A2', experience: '2_5', age: '26_35' });
    const best = res.body.paths[0];
    expect(best).toMatchObject({ key: 'drivers_19c', visaType: 'WORK', fit: 'high', visa: { slug: 'lkw', label: '§19c', title: 'Berufskraftfahrer de' } });
    expect(best.reasons).toContain('LICENCE_OK');
    expect(best.minWeeks).toBeGreaterThan(0);
    expect(best.maxWeeks).toBeGreaterThanOrEqual(best.minWeeks);
    expect(best.salary).toMatchObject({ kind: 'job', source: 'vacancies', vacancies: 2 });
    expect(best.salary.grossMin).toBeGreaterThanOrEqual(2900);
    expect(best.salary.grossMax).toBeLessThanOrEqual(3500); // the closed 9,000 € vacancy does not count
    expect(best.salary.netMax).toBe(quickNetMonthly(best.salary.grossMax));
    expect(best.package).toEqual({ slug: 'work-plus', tier: 'STANDARD', title: 'Arbeit Plus de', priceCents: 99000, currency: 'EUR' });
    expect(res.body.jobs).toEqual({ count: 2, sector: 'logistics' });
    expect(res.body.paths.every((p: { key: string }) => p.key !== 'family')).toBe(true);
  });

  it('uses the reference salaries without vacancies and the training allowance for Ausbildung', async () => {
    const res = expectStatus(await finder({ profession: 'none', education: 'school', german: 'B1', experience: 'none', age: '18_25' }), 200);
    const aus = res.body.paths.find((p: { key: string }) => p.key === 'ausbildung_16a');
    expect(aus.salary).toMatchObject({ kind: 'ausbildung', source: 'reference' });
    expect(aus.package).toBeNull();
    expect(res.body.jobs).toEqual({ count: 0, sector: null });
  });

  it('rejects unknown answers and missing questions', async () => {
    expect((await finder({ ...driver, german: 'C3' })).status).toBe(400);
    expect((await finder({ profession: 'driver' })).status).toBe(400);
  });
});

// ─── Offline live chat ─────────────────────────────────────────────────

const closedHours = { days: [], from: '09:00', to: '18:00' };
const configure = async (admin: Actor, officeHours: unknown) =>
  expectStatus(
    await admin.agent.put('/api/calls/settings').send({
      provider: 'fake',
      callerId: '+4930123456',
      recording: false,
      recordingNotice: { az: 'a', de: 'd', en: 'e', ru: 'r' },
      webhookBaseUrl: 'https://api.example.test',
      inboundForwardTo: '',
      officeHours,
      twilio: { accountSid: '' },
      sipgate: { tokenId: '', deviceId: '', allowedIps: [] },
    }),
    200,
  );

const collect = (userId: string) => {
  const events: RealtimeEvent[] = [];
  const off = subscribe(userId, (ev) => events.push(ev));
  return { events, off };
};

describe('offline live chat', () => {
  const start = (body: Record<string, unknown> = {}) =>
    anon()
      .post('/api/livechat')
      .set('Origin', ORIGIN)
      .send({ lang: 'az', name: 'Leyla', transcript: [{ role: 'user', content: 'Mavi Kart nədir?' }, { role: 'assistant', content: 'Ali təhsilli mütəxəssislər üçün.' }], reason: 'button', ...body });

  it('outside office hours: queued for staff with a stored notice, the AI answers (scrubbed), staff accept later', async () => {
    const admin = await asAdmin();
    await configure(admin, closedHours);
    expect(expectStatus(await anon().get('/api/livechat/availability'), 200).body).toMatchObject({ available: false, officeOpen: false, nextOpen: null });

    // Without offline: unchanged 409.
    expect((await start()).status).toBe(409);

    fake.replies.push('Adətən 4–8 həftə çəkir. Əməkdaşlarımız qayıdan kimi cavab verəcək. [[HUMAN]]');
    const res = expectStatus(await start({ offline: true, message: 'Pasportum C12345678, viza nə qədər çəkir?' }), 201);
    const { token, chat } = res.body as { token: string; chat: { id: string; status: string; offline: boolean; acceptDeadline: string | null } };
    expect(chat).toMatchObject({ status: 'WAITING', offline: true, acceptDeadline: null });
    expect((await prisma.liveChat.findUniqueOrThrow({ where: { id: chat.id } })).reason).toBe('offline');

    // Admins get a stored notification linking to the queue.
    const note = await waitFor(() => prisma.notification.findFirst({ where: { userId: admin.user.id, title: { contains: 'Oflayn canlı söhbət' } } }));
    expect(note.body).toContain('viza nə qədər çəkir');

    // The AI answers inside the chat: advisor rules + offline note, identifiers masked.
    const ai = await waitFor(async () => (await prisma.liveChatMessage.findFirst({ where: { chatId: chat.id, author: 'AI' } })) ?? null);
    expect(ai.body).toBe('Adətən 4–8 həftə çəkir. Əməkdaşlarımız qayıdan kimi cavab verəcək.');
    const req = fake.requests[0];
    const system = String((req.messages[0] as { content: unknown }).content);
    const input = String((req.messages[1] as { content: unknown }).content);
    expect(system).toMatch(/Never guarantee a visa/);
    expect(system).toContain('colleagues are offline');
    expect(input).toContain('Mavi Kart nədir?');
    expect(input).not.toContain('C12345678');
    expect(input).toContain('••••');

    // Not expired after the 2-minute accept timeout.
    await prisma.liveChat.update({ where: { id: chat.id }, data: { createdAt: new Date(Date.now() - 30 * 60_000) } });
    expect(await expireWaiting()).toEqual([]);

    // The visitor writes again → another AI answer.
    fake.replies.push('Bəli, B1 kifayətdir.');
    expectStatus(await anon().post(`/api/livechat/${chat.id}/messages`).set('x-livechat-token', token).send({ body: 'B1 kifayətdir?' }), 201);
    await waitFor(async () => (await prisma.liveChatMessage.count({ where: { chatId: chat.id, author: 'AI' } })) === 2);

    // A colleague comes online and accepts: the AI stops answering, the visitor sees the staff typing.
    await configure(admin, { days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '24:00' });
    const staff = await asStaff({ firstName: 'Kamran' });
    const bus = collect(staff.user.id);
    const queue = expectStatus(await staff.agent.get('/api/livechat/staff/queue'), 200);
    expect(queue.body.chats.find((c: { id: string }) => c.id === chat.id)).toMatchObject({ status: 'WAITING' });
    const acc = expectStatus(await staff.agent.post(`/api/livechat/staff/${chat.id}/accept`), 200);
    expect(acc.body.chat.messages.filter((m: { author: string }) => m.author === 'AI')).toHaveLength(2);

    const visitorBus = collect(`livechat:${chat.id}`);
    expect((await staff.agent.post(`/api/livechat/staff/${chat.id}/typing`)).status).toBe(204);
    expect(visitorBus.events.find((e) => e.type === 'livechat.typing')?.payload).toMatchObject({ who: 'STAFF', name: 'Kamran', on: true });
    expect((await anon().post(`/api/livechat/${chat.id}/typing`).set('x-livechat-token', token).send({})).status).toBe(204);
    expect(bus.events.find((e) => e.type === 'livechat.typing')?.payload).toMatchObject({ chatId: chat.id, who: 'VISITOR' });

    const n = fake.requests.length;
    expectStatus(await anon().post(`/api/livechat/${chat.id}/messages`).set('x-livechat-token', token).send({ body: 'Salam Kamran' }), 201);
    await new Promise((r) => setTimeout(r, 150));
    expect(fake.requests.length).toBe(n);
    bus.off();
    visitorBus.off();
  });

  it('expires an unaccepted offline chat after 72 hours and rejects a bad token on typing', async () => {
    const admin = await asAdmin();
    await configure(admin, closedHours);
    const { token, chat } = expectStatus(await start({ offline: true }), 201).body as { token: string; chat: { id: string } };
    expect(fake.requests).toHaveLength(0); // no message yet → no AI call
    expect((await anon().post(`/api/livechat/${chat.id}/typing`).set('x-livechat-token', `${chat.id}.nope`).send({})).status).toBe(403);
    // Contact details on an offline chat: an inquiry for staff, the chat stays in the queue.
    const c = expectStatus(await anon().post(`/api/livechat/${chat.id}/contact`).send({ token, name: 'Leyla', email: 'leyla@example.az', consent: true }), 201);
    expect(c.body.kind).toBe('inquiry');
    expect(await prisma.liveChat.findUniqueOrThrow({ where: { id: chat.id } })).toMatchObject({ status: 'WAITING', visitorEmail: 'leyla@example.az', inquiryId: c.body.id });
    await prisma.liveChat.update({ where: { id: chat.id }, data: { createdAt: new Date(Date.now() - 73 * 60 * 60_000) } });
    expect(await expireWaiting()).toEqual([chat.id]);
    const view = expectStatus(await anon().get(`/api/livechat/${chat.id}`).set('x-livechat-token', token), 200);
    expect(view.body.chat.status).toBe('MISSED');
  });
});
