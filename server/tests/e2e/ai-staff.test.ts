import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { User } from '@prisma/client';
import { asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';
import { setAiTransport, setKeyInfoFetcher, setModelsFetcher, type ChatRequest, type StreamChunk } from '../../src/lib/ai/openrouter.js';
import { clearAiSettingsCache } from '../../src/lib/ai/settings.js';
import { CHEAP_MODEL, STRONG_MODEL } from '../../src/lib/ai/complete.js';
import { TRANSLATE_MODEL } from '../../src/lib/ai/translate.js';
import { createCase } from '../../src/lib/caseFlow.js';
import { adminTools, adminPrompt } from '../../src/lib/ai/admin/index.js';
import type { AiToolContext, AnyAiTool } from '../../src/lib/ai/types.js';
import { buildBriefingData, renderBriefing, runBriefingJob, sendBriefing } from '../../src/lib/aiStaff/briefing.js';
import { listBeneficiaries } from '../../src/lib/settlement/service.js';

process.env.OPENROUTER_API_KEY = 'sk-or-test-not-a-real-key';

// ─── Fake OpenRouter, answering by the kind of task (system prompt) ─────────────

const fake = { requests: [] as ChatRequest[], fail: false, summaryN: 0 };
const sys = (req: ChatRequest) => String(req.messages.find((m) => m.role === 'system')?.content ?? '');
const user = (req: ChatRequest) => String(req.messages.find((m) => m.role === 'user')?.content ?? '');

const answer = (req: ChatRequest): string => {
  const s = sys(req);
  const u = user(req);
  if (s.includes('summarising one case')) {
    fake.summaryN++;
    return JSON.stringify({ status: `Status line ${fake.summaryN}`, missing: 'Pasport çatışmır.', contact: 'Müştəri cavab gözləyir.', risks: 'Risk yoxdur.', next: 'Sənədləri yoxlayın.' });
  }
  if (s.includes('draft replies')) {
    const lang = /Guten Tag/.test(u) ? 'de' : (u.match(/Client's account language: (\w\w)/)?.[1] ?? 'az');
    return JSON.stringify({ reply: lang === 'de' ? 'Guten Tag Aysel, es fehlt noch die Passkopie.' : 'Salam!', lang });
  }
  if (s.includes('daily morning briefing')) return 'Bu gün iki görüş var. Əvvəlcə yoxlama gözləyən sənədlərə baxın.';
  if (s.includes('You write blog posts'))
    return JSON.stringify({
      title: 'Ausbildung in Deutschland: alle Unterlagen, Schritte und Fristen im Überblick für Bewerber',
      excerpt: 'Welche Unterlagen Sie für die Ausbildung in Deutschland brauchen und wie der Visumprozess Schritt für Schritt abläuft.',
      body: 'Erster Absatz über die Ausbildung.\n\nZweiter Absatz über das Visum.',
      slug: 'Ausbildung in Deutschland!',
    });
  if (s.startsWith('You translate short texts')) {
    const json = JSON.parse(u.slice(u.indexOf('{'))) as Record<string, { source: string; into: string[] }>;
    return JSON.stringify(Object.fromEntries(Object.entries(json).map(([field, v]) => [field, Object.fromEntries(v.into.map((l) => [l, `${l.toUpperCase()}: ${v.source}`]))])));
  }
  return 'ok';
};

beforeEach(() => {
  fake.requests = [];
  fake.fail = false;
  clearAiSettingsCache();
  process.env.OPENROUTER_API_KEY = 'sk-or-test-not-a-real-key';
  setKeyInfoFetcher(async () => null);
  setModelsFetcher(async () => []);
  setAiTransport(async function* (req): AsyncGenerator<StreamChunk> {
    fake.requests.push(JSON.parse(JSON.stringify(req)) as ChatRequest);
    if (fake.fail) throw new Error('upstream down');
    const out = answer(req);
    yield { choices: [{ delta: { content: out }, finish_reason: 'stop' }], usage: { prompt_tokens: 200, completion_tokens: 50, cost: 0.0003 } };
  });
});

afterAll(() => {
  setAiTransport(null);
  setKeyInfoFetcher(null);
  setModelsFetcher(null);
});

const DAY = 24 * 60 * 60 * 1000;

const newCase = async (opts: { locale?: 'az' | 'de' | 'en' | 'ru'; firstName?: string } = {}) => {
  const { user: client } = await createClient({ locale: opts.locale ?? 'az', firstName: opts.firstName ?? 'Aysel', lastName: 'Məmmədova' });
  const c = await createCase(client.id, { profession: 'Pflegefachkraft', visaType: 'WORK' });
  return { client, c };
};

// ─── 1. Case summary ─────────────────────────────────────────────────

describe('ai-staff: case summary', () => {
  it('is generated on demand, cached by an input hash and regenerated only when the case changed or on refresh', async () => {
    const staff = await asStaff({ locale: 'az' });
    const { client, c } = await newCase();
    const url = `/api/admin/ai-staff/cases/${c.id}/summary`;

    // Page load: nothing cached, no model call.
    const empty = expectStatus(await staff.agent.get(url), 200).body;
    expect(empty).toMatchObject({ summary: null, fresh: false, generated: false });
    expect(fake.requests).toHaveLength(0);

    const first = expectStatus(await staff.agent.post(url).send({ locale: 'az' }), 200).body;
    expect(first).toMatchObject({ fresh: true, generated: true });
    expect(first.summary.lines).toMatchObject({ status: 'Status line 1', next: 'Sənədləri yoxlayın.' });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0].model).toBe(CHEAP_MODEL);
    expect(sys(fake.requests[0])).toContain('Azerbaijani');
    const facts = JSON.parse(user(fake.requests[0]));
    expect(facts.case.number).toBe(c.number);
    expect(facts.client.name).toBe('Aysel Məmmədova');

    // Same inputs → cached, no new call.
    const again = expectStatus(await staff.agent.post(url).send({ locale: 'az' }), 200).body;
    expect(again).toMatchObject({ generated: false, fresh: true });
    expect(again.summary.lines.status).toBe('Status line 1');
    expect(fake.requests).toHaveLength(1);
    expect(await prisma.setting.count({ where: { key: { startsWith: `aiStaff:summary:${c.id}` } } })).toBe(1);

    // The client writes → the inputs change → stale until regenerated.
    await prisma.caseMessage.create({ data: { caseId: c.id, authorId: client.id, body: 'Salam, nə vaxt cavab olacaq?' } });
    expect(expectStatus(await staff.agent.get(url), 200).body).toMatchObject({ fresh: false, generated: false });
    const second = expectStatus(await staff.agent.post(url).send({ locale: 'az' }), 200).body;
    expect(second).toMatchObject({ generated: true, fresh: true });
    expect(second.summary.lines.status).toBe('Status line 2');
    expect(JSON.parse(user(fake.requests[1])).clientWaitingForReply).toBe(true);

    // "Yenilə" forces a new call; another UI language has its own cache entry.
    expect(expectStatus(await staff.agent.post(url).send({ locale: 'az', refresh: true }), 200).body.summary.lines.status).toBe('Status line 3');
    expectStatus(await staff.agent.post(url).send({ locale: 'de' }), 200);
    expect(sys(fake.requests[3])).toContain('German');
    expect(fake.requests).toHaveLength(4);

    // Cost booked on the staff member's ADMIN usage.
    const conv = await prisma.aiConversation.findFirstOrThrow({ where: { userId: staff.user.id, title: 'AI · case-summary' } });
    expect(conv).toMatchObject({ scope: 'ADMIN', archived: true });
  });

  it('reports an AI failure without breaking and keeps the old summary', async () => {
    const staff = await asStaff();
    const { c } = await newCase();
    const url = `/api/admin/ai-staff/cases/${c.id}/summary`;
    fake.fail = true;
    expect(expectStatus(await staff.agent.post(url).send({}), 200).body).toMatchObject({ summary: null, reason: 'UPSTREAM' });
  });
});

// ─── 2. Reply drafts ────────────────────────────────────────────────

describe('ai-staff: reply draft', () => {
  it("drafts in the language of the client's message (fallback: account language) and never sends anything", async () => {
    const staff = await asStaff({ firstName: 'Leyla', lastName: 'Həsənova' });
    const { client, c } = await newCase({ locale: 'ru' });
    await prisma.caseMessage.create({ data: { caseId: c.id, authorId: staff.user.id, body: 'Здравствуйте! Загрузите паспорт.', createdAt: new Date(Date.now() - 60_000) } });
    await prisma.caseMessage.create({ data: { caseId: c.id, authorId: client.id, body: 'Guten Tag, welche Dokumente fehlen noch?' } });
    const before = await prisma.caseMessage.count({ where: { caseId: c.id } });

    const res = expectStatus(await staff.agent.post(`/api/admin/ai-staff/cases/${c.id}/reply-draft`).send({ instructions: 'Passkopie erwähnen' }), 200).body;
    expect(res.draft).toMatchObject({ lang: 'de', draft: 'Guten Tag Aysel, es fehlt noch die Passkopie.' });
    const req = fake.requests[0];
    expect(req.model).toBe(STRONG_MODEL);
    expect(sys(req)).toContain('Russian'); // fallback language = the client's account language
    expect(sys(req)).toContain('Leyla Həsənova');
    expect(sys(req)).toMatch(/NEVER promise/);
    expect(user(req)).toContain('Guten Tag, welche Dokumente fehlen noch?');
    expect(user(req)).toContain('Passkopie erwähnen');
    expect(await prisma.caseMessage.count({ where: { caseId: c.id } })).toBe(before);

    // Cached for the same inputs; refresh asks again.
    expectStatus(await staff.agent.post(`/api/admin/ai-staff/cases/${c.id}/reply-draft`).send({ instructions: 'Passkopie erwähnen' }), 200);
    expect(fake.requests).toHaveLength(1);
    expectStatus(await staff.agent.post(`/api/admin/ai-staff/cases/${c.id}/reply-draft`).send({ instructions: 'Passkopie erwähnen', refresh: true }), 200);
    expect(fake.requests).toHaveLength(2);

    // A client writing in their own language (ru) gets the account language back.
    const other = await newCase({ locale: 'ru', firstName: 'Murad' });
    await prisma.caseMessage.create({ data: { caseId: other.c.id, authorId: other.client.id, body: 'Когда будет запись?' } });
    const ru = expectStatus(await staff.agent.post(`/api/admin/ai-staff/cases/${other.c.id}/reply-draft`).send({}), 200).body;
    expect(ru.draft.lang).toBe('ru');
  });
});

// ─── Permissions ─────────────────────────────────────────────────────

describe('ai-staff: permissions', () => {
  it('staff may use case features and see risks; clients may not; post drafts and briefing need ADMIN; test briefing needs SUPER_ADMIN', async () => {
    const staff = await asStaff();
    const client = await asClient();
    const admin = await asAdmin();
    const { c } = await newCase();

    expectStatus(await staff.agent.get(`/api/admin/ai-staff/cases/${c.id}/summary`), 200);
    expectStatus(await staff.agent.get('/api/admin/ai-staff/risks'), 200);
    expectStatus(await client.agent.get(`/api/admin/ai-staff/cases/${c.id}/summary`), 403);
    expectStatus(await client.agent.post(`/api/admin/ai-staff/cases/${c.id}/summary`).send({}), 403);
    expectStatus(await client.agent.post(`/api/admin/ai-staff/cases/${c.id}/reply-draft`).send({}), 403);
    expectStatus(await client.agent.get('/api/admin/ai-staff/risks'), 403);
    expectStatus(await staff.agent.post(`/api/admin/ai-staff/cases/nope/summary`).send({}), 404);

    expectStatus(await staff.agent.post('/api/admin/ai-staff/content/post-draft').send({ topic: 'Ausbildung' }), 403);
    expectStatus(await staff.agent.get('/api/admin/ai-staff/briefing'), 403);
    expect(expectStatus(await admin.agent.get('/api/admin/ai-staff/briefing'), 200).body).toEqual({ enabled: false, canTest: false });
    expectStatus(await admin.agent.post('/api/admin/ai-staff/briefing/test'), 403);
    expect(fake.requests).toHaveLength(0);
  });
});

// ─── 3. Daily briefing ───────────────────────────────────────────────

describe('ai-staff: daily briefing', () => {
  // 2026-10-20 09:00 in Baku (UTC+4).
  const at9 = new Date('2026-10-20T05:00:00Z');

  it('is skipped on an empty day and before 08:00, sent once per day to opted-in admins with numbers and the AI intro', async () => {
    const admin = await asAdmin({ locale: 'az' });
    const optedOut = await asAdmin();
    expect(expectStatus(await admin.agent.put('/api/admin/ai-staff/briefing').send({ enabled: true }), 200).body).toEqual({ enabled: true });

    // Nothing happened → no e-mail (and the day is marked handled, so later runs cost nothing).
    expect(await runBriefingJob(at9)).toBe(0);
    expect(await prisma.emailLog.count({ where: { subject: { contains: 'brifinq' } } })).toBe(0);
    expect(fake.requests).toHaveLength(0);

    // Next day: a new case, a document waiting for review, an appointment tomorrow, an overdue task.
    const next = new Date(at9.getTime() + DAY);
    const { client, c } = await newCase();
    await prisma.case.update({ where: { id: c.id }, data: { createdAt: new Date(next.getTime() - 3600_000), status: 'APPOINTMENT_SCHEDULED', appointmentAt: new Date(next.getTime() + DAY), appointmentPlace: 'Botschaft Baku' } });
    await prisma.document.create({ data: { caseId: c.id, stage: 'INITIAL', originalName: 'pass.pdf', storedName: `pass-${c.id}.pdf`, mimeType: 'application/pdf', size: 10, uploadedById: client.id } });
    await prisma.task.create({ data: { number: 1, title: 'Zəng et', dueAt: new Date(next.getTime() - 2 * DAY) } });

    expect(await runBriefingJob(new Date(next.getTime() - 2 * 3600_000))).toBe(0); // 07:00 Baku
    expect(await runBriefingJob(next)).toBe(1);
    const mails = await prisma.emailLog.findMany({ where: { subject: { contains: 'Gündəlik brifinq' } } });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: admin.user.email, subject: 'Triad Vision · Gündəlik brifinq · 2026-10-21' });
    expect(await prisma.emailLog.count({ where: { to: optedOut.user.email } })).toBe(0);
    const introCalls = fake.requests.filter((r) => sys(r).includes('daily morning briefing'));
    expect(introCalls).toHaveLength(1);
    expect(introCalls[0].model).toBe(CHEAP_MODEL);
    expect(user(introCalls[0])).not.toContain('Məmmədova'); // the intro gets numbers, not client names

    // Idempotent: a second run the same day sends nothing and asks the model nothing.
    expect(await runBriefingJob(new Date(next.getTime() + 3600_000))).toBe(0);
    expect(await prisma.emailLog.count({ where: { subject: { contains: 'Gündəlik brifinq' } } })).toBe(1);
    expect(fake.requests.filter((r) => sys(r).includes('daily morning briefing'))).toHaveLength(1);

    // Content: built from DB numbers.
    const data = await buildBriefingData(next, 'az');
    expect(data.newCases.count).toBe(1);
    expect(data.docsWaiting).toEqual({ docs: 1, cases: 1 });
    expect(data.appointments).toEqual([expect.objectContaining({ number: c.number, when: 'tomorrow', place: 'Botschaft Baku' })]);
    expect(data.overdueTasks.count).toBe(1);
    const mail = renderBriefing(data, 'az', 'Intro mətni.');
    expect(mail.body).toContain('Bu gün nə vacibdir\nIntro mətni.');
    expect(mail.body).toContain(`${c.number} · Aysel Məmmədova`);
    expect(mail.body).toContain('Yoxlama gözləyən sənədlər: 1 (1 müraciət)');
    expect(mail.body).toContain('Gecikmiş tapşırıqlar: 1');
    expect(mail.body).toContain('Bu ay AI xərci');
  });

  it('is sent without the intro when the AI fails; the super admin can send a test briefing now', async () => {
    const sup = await asSuperAdmin({ locale: 'en' });
    await newCase();
    fake.fail = true;
    const r = await sendBriefing({ id: sup.user.id, email: sup.user.email, locale: 'en' });
    expect(r).toEqual({ sent: true, intro: false });
    expect(await prisma.emailLog.count({ where: { to: sup.user.email, subject: { contains: 'Daily briefing' } } })).toBe(1);
    const data = await buildBriefingData(new Date(), 'en');
    expect(renderBriefing(data, 'en', null).body).not.toContain('What matters today');

    fake.fail = false;
    const test = expectStatus(await sup.agent.post('/api/admin/ai-staff/briefing/test'), 200).body;
    expect(test).toEqual({ sent: true, intro: true });
    expect(await prisma.emailLog.count({ where: { to: sup.user.email, subject: { contains: 'Daily briefing' } } })).toBe(2);
    expect(expectStatus(await sup.agent.get('/api/admin/ai-staff/briefing'), 200).body).toEqual({ enabled: false, canTest: true });
  });
});

// ─── 4. Risks (DB facts) ─────────────────────────────────────────────

describe('ai-staff: risky cases', () => {
  it('lists a stale review case for its staff member, filters by staff and feeds the risky_cases tool', async () => {
    const staff = await asStaff({ locale: 'en' });
    const other = await asStaff();
    const { client, c } = await newCase();
    const old = new Date(Date.now() - 6 * DAY);
    await prisma.case.update({ where: { id: c.id }, data: { status: 'DOCUMENTS_REVIEW', assignedStaffId: staff.user.id, createdAt: old } });
    await prisma.caseEvent.create({ data: { caseId: c.id, type: 'DOCUMENTS_SUBMITTED', fromStatus: 'DOCUMENTS_PENDING', toStatus: 'DOCUMENTS_REVIEW', actorId: client.id, createdAt: old } });
    await prisma.caseEvent.updateMany({ where: { caseId: c.id, type: 'CASE_CREATED' }, data: { createdAt: old } });
    await prisma.document.create({ data: { caseId: c.id, stage: 'INITIAL', originalName: 'p.pdf', storedName: `p-${c.id}.pdf`, mimeType: 'application/pdf', size: 1, uploadedById: client.id, createdAt: old } });

    const mine = expectStatus(await staff.agent.get('/api/admin/ai-staff/risks'), 200).body;
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]).toMatchObject({ number: c.number, severity: 'medium' });
    expect(mine.items[0].risks[0]).toMatchObject({ code: 'REVIEW_WAITING', days: 6, title: 'Documents waiting for review for 6 days' });
    expect(expectStatus(await other.agent.get('/api/admin/ai-staff/risks'), 200).body.items).toHaveLength(0);
    expect(expectStatus(await other.agent.get('/api/admin/ai-staff/risks?staffId=all'), 200).body.items).toHaveLength(1);

    const sup = await asSuperAdmin();
    const ctx = ctxOf(sup.user);
    const out = await run('risky_cases', { minSeverity: 'low' }, ctx);
    expect(out.items.map((i: { case: string }) => i.case)).toContain(c.number);
  });
});

// ─── 5. Admin tools: report_query, settlement_anomalies ──────────────

const ctxOf = (u: User): AiToolContext => ({ user: { id: u.id, role: u.role, firstName: u.firstName, lastName: u.lastName, email: u.email, locale: 'az' }, scope: 'ADMIN', conversationId: 'test', context: null });
const tool = (name: string): AnyAiTool => {
  const t = adminTools.find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = async (name: string, args: unknown, ctx: AiToolContext): Promise<any> => {
  const t = tool(name);
  return t.run(t.schema.parse(args), ctx);
};

describe('ai-staff: report tools', () => {
  it('report_query answers counts and unpaid money per partner on seeded data; the prompt knows the tools', async () => {
    const sup = await asSuperAdmin();
    const ctx = ctxOf(sup.user);
    const ilqar = await prisma.referralPartner.create({ data: { name: 'İlqar' } });
    const envar = await prisma.referralPartner.create({ data: { name: 'Ənvər' } });
    const now = new Date();
    const mk = async (partnerId: string | null, status: 'APPROVED' | 'REJECTED' | 'DOCUMENTS_PENDING', name: string) => {
      const { user: cl } = await createClient({ firstName: name, lastName: 'Test' });
      const k = await createCase(cl.id, { profession: 'Fahrer', visaType: 'WORK' });
      await prisma.case.update({ where: { id: k.id }, data: { partnerId, status, decisionAt: status === 'DOCUMENTS_PENDING' ? null : now } });
      return k;
    };
    await mk(ilqar.id, 'APPROVED', 'A1');
    await mk(ilqar.id, 'APPROVED', 'A2');
    await mk(ilqar.id, 'REJECTED', 'A3');
    await mk(envar.id, 'APPROVED', 'B1');
    await mk(null, 'DOCUMENTS_PENDING', 'C1');

    const from = `${now.toISOString().slice(0, 7)}-01`;
    const appr = await run('report_query', { metric: 'approvals', partner: 'Ilqar', from, groupBy: 'none' }, ctx);
    expect(appr.totals.count).toBe(2);
    expect(appr.filters.partner).toBe('İlqar');
    const byPartner = await run('report_query', { metric: 'decisions', groupBy: 'partner' }, ctx);
    expect(byPartner.rows).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'İlqar', count: 3, approved: 2, refused: 1, approvalRatePct: 67 }), expect.objectContaining({ key: 'Ənvər', count: 1 })]));
    const cases = await run('report_query', { metric: 'cases', groupBy: 'status' }, ctx);
    expect(cases.totals.count).toBe(5);
    expect(cases.rows.find((r: { key: string }) => r.key === 'APPROVED').count).toBe(3);

    // Settlement ledger: 3000 AZN → Xalid 1000 / Tofig 900 / Abdulla 900 / Team 200 (all unpaid); a paid Xalid share on a second row.
    const bens = await listBeneficiaries();
    const xalid = bens.find((b) => b.name === 'Xalid')!;
    await prisma.settlementEntry.create({ data: { clientName: 'A1 Test', partnerId: ilqar.id, amountCents: 300000, currency: 'AZN', stage: 'VISA', visaDate: now } });
    await prisma.settlementEntry.create({ data: { clientName: 'A2 Test', partnerId: ilqar.id, amountCents: 300000, currency: 'AZN', stage: 'VISA', visaDate: now, shares: { [xalid.id]: { status: 'PAID', cents: 100000, currency: 'AZN' } } } });
    await prisma.settlementEntry.create({ data: { clientName: 'B1 Test', partnerId: envar.id, amountCents: 600000, currency: 'AZN', stage: 'VISA', visaDate: now } });
    const unpaid = await run('report_query', { metric: 'settlements', groupBy: 'beneficiary', partner: 'İlqar', paid: 'unpaid' }, ctx);
    const row = (k: string) => unpaid.rows.find((r: { key: string }) => r.key === k);
    expect(row('Xalid').unpaid).toEqual({ AZN: 1000 });
    expect(row('Tofig').unpaid).toEqual({ AZN: 1800 });
    expect(row('Team').unpaid).toEqual({ AZN: 400 });
    expect(row('Xalid').paid).toBeUndefined();
    expect(unpaid.totals).toMatchObject({ clients: 2, visa: 2, agreed: { AZN: 6000 } });
    const perPartner = await run('report_query', { metric: 'settlements', groupBy: 'partner' }, ctx);
    expect(perPartner.rows.find((r: { key: string }) => r.key === 'Ənvər')).toMatchObject({ count: 1, agreed: { AZN: 6000 } });

    await expect(run('report_query', { metric: 'invoices', groupBy: 'partner' }, ctx)).rejects.toMatchObject({ status: 400 });
    expect((await run('report_query', { metric: 'ai_spend' }, ctx)).totals).toMatchObject({ usd: 0 });
    expect(adminPrompt).toContain('report_query');
    expect(adminPrompt).toContain('settlement_anomalies');
    expect(adminPrompt).toContain('risky_cases');
  });

  it('settlement_anomalies finds the seeded bad rows and leaves the good one alone', async () => {
    const sup = await asSuperAdmin();
    const ctx = ctxOf(sup.user);
    const bens = await listBeneficiaries();
    const id = (n: string) => bens.find((b) => b.name === n)!.id;
    const good = await prisma.settlementEntry.create({ data: { project: 'Proyekt 2', clientName: 'Nicat Good', amountCents: 300000, currency: 'AZN' } });
    const over = await prisma.settlementEntry.create({
      data: {
        project: 'Proyekt 2',
        clientName: 'Orxan Over',
        amountCents: 100000,
        currency: 'AZN',
        shares: { [id('Xalid')]: { cents: 90000, currency: 'AZN', manual: true }, [id('Tofig')]: { cents: 50000, currency: 'AZN', manual: true }, [id('Abdulla')]: { cents: 50000, currency: 'AZN', manual: true } },
      },
    });
    const noPay = await prisma.settlementEntry.create({ data: { project: 'Proyekt 2', clientName: 'Pərvin Nopay', shares: { [id('Xalid')]: { cents: 30000, currency: 'AZN', manual: true } } } });
    const refused = await prisma.settlementEntry.create({ data: { project: 'Proyekt 2', clientName: 'Rəşad Refused', amountCents: 300000, currency: 'AZN', stage: 'REFUSED', stageAuto: false, shares: { [id('Xalid')]: { status: 'PAID', cents: 100000, currency: 'AZN' } } } });
    const dup1 = await prisma.settlementEntry.create({ data: { project: 'Proyekt 2', clientName: 'Murad Əliyev', amountCents: 300000, currency: 'AZN' } });
    const dup2 = await prisma.settlementEntry.create({ data: { project: 'Privat', clientName: 'Aliyev Murad', amountCents: 300000, currency: 'AZN' } });
    const { c } = await newCase();
    await prisma.case.update({ where: { id: c.id }, data: { status: 'APPROVED', decisionAt: new Date() } });
    const stage = await prisma.settlementEntry.create({ data: { project: 'Privat', clientName: 'Stage Mismatch', caseId: c.id, amountCents: 300000, currency: 'AZN', stage: 'NEW', stageAuto: false } });

    const r = await run('settlement_anomalies', {}, ctx);
    const types = (entryId: string) => r.items.filter((a: { id: string }) => a.id === entryId).map((a: { type: string }) => a.type).sort();
    expect(types(good.id)).toEqual([]);
    expect(types(over.id)).toEqual(['OVER_ALLOCATED', 'RULE_MISMATCH']);
    expect(types(noPay.id)).toEqual(['SHARES_WITHOUT_PAYMENT']);
    expect(types(refused.id)).toEqual(['REFUSED_BUT_PAID']);
    expect(types(dup1.id)).toEqual(['DUPLICATE_CLIENT']);
    expect(types(dup2.id)).toEqual(['DUPLICATE_CLIENT']);
    expect(types(stage.id)).toEqual(['CASE_STAGE_MISMATCH']);
    expect(r.byType).toMatchObject({ OVER_ALLOCATED: 1, SHARES_WITHOUT_PAYMENT: 1, REFUSED_BUT_PAID: 1, DUPLICATE_CLIENT: 2, CASE_STAGE_MISMATCH: 1 });
    const filtered = await run('settlement_anomalies', { types: ['DUPLICATE_CLIENT'] }, ctx);
    expect(filtered.count).toBe(2);
    expect(fake.requests).toHaveLength(0);
  });
});

// ─── 6. Blog post drafts ─────────────────────────────────────────────

describe('ai-staff: post draft', () => {
  it('writes the first language with the strong model, translates the rest with the cheap one and saves an unpublished draft with a short title', async () => {
    const admin = await asAdmin();
    const res = expectStatus(await admin.agent.post('/api/admin/ai-staff/content/post-draft').send({ topic: 'Ausbildung in Deutschland', audience: 'candidates', tone: 'friendly', length: 'short', lang: 'de' }), 201).body;
    expect(res.reason).toBeUndefined();
    expect(res.translated.sort()).toEqual(['az', 'en', 'ru']);
    const post = await prisma.post.findUniqueOrThrow({ where: { id: res.post.id } });
    expect(post.published).toBe(false);
    expect(post.slug).toBe('ausbildung-in-deutschland');
    const title = post.title as Record<string, string>;
    const excerpt = post.excerpt as Record<string, string>;
    const body = post.body as Record<string, string>;
    for (const l of ['az', 'de', 'en', 'ru']) {
      expect(title[l].length, `title ${l}`).toBeGreaterThan(5);
      expect(title[l].length, `title ${l}`).toBeLessThanOrEqual(45);
      expect(`${title[l]} | Triad Vision`.length).toBeLessThanOrEqual(60);
      expect(excerpt[l].length).toBeLessThanOrEqual(155);
      expect(body[l]).toContain('\n\n');
    }
    expect(title.de.startsWith('Ausbildung in Deutschland')).toBe(true);
    expect(body.en).toBe('EN: Erster Absatz über die Ausbildung.\n\nZweiter Absatz über das Visum.');

    expect(fake.requests[0].model).toBe(STRONG_MODEL);
    const translations = fake.requests.slice(1);
    expect(translations).toHaveLength(4); // title + excerpt in one call, the body once per language
    for (const r of translations) expect(r.model).toBe(TRANSLATE_MODEL);
    expect(TRANSLATE_MODEL).toBe(CHEAP_MODEL);

    // A second draft on the same topic gets a unique slug; the public site does not list drafts.
    const again = expectStatus(await admin.agent.post('/api/admin/ai-staff/content/post-draft').send({ topic: 'Ausbildung in Deutschland', lang: 'de' }), 201).body;
    expect(again.post.slug).toBe('ausbildung-in-deutschland-2');
  });
});
