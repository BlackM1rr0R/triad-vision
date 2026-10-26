import { afterAll, afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { Role } from '@prisma/client';
import { asAdmin, asStaff, asSuperAdmin, sessionAgent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createClient, createUser } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';
import { setAiTransport, setKeyInfoFetcher, setModelsFetcher, type ChatRequest, type StreamChunk } from '../../src/lib/ai/openrouter.js';
import { clearAiSettingsCache, privacyRouting } from '../../src/lib/ai/settings.js';
import { aiComplete } from '../../src/lib/ai/complete.js';
import { lastFullWeek, weekStartOf } from '../../src/lib/aiMgmt/week.js';
import { buildReportData } from '../../src/lib/aiMgmt/reportData.js';
import { generateReport, renderReportEmail, reportDue, runWeeklyReportJob } from '../../src/lib/aiMgmt/report.js';
import { REPORT_TEXTS } from '../../src/lib/aiMgmt/reportTexts.js';
import { saveReportSettings, saveSecuritySettings } from '../../src/lib/aiMgmt/settings.js';
import { flushSecurityRealtime, runSecurityScan, setSecurityRealtime } from '../../src/lib/aiMgmt/security/alerts.js';
import { hoursLabel, ipPrefix } from '../../src/lib/aiMgmt/security/rules.js';

process.env.OPENROUTER_API_KEY = 'sk-or-test-not-a-real-key';

// ─── Fake OpenRouter ────────────────────────────────────────────────────

const fake = { requests: [] as ChatRequest[], fail: false };
const sys = (req: ChatRequest) => String(req.messages.find((m) => m.role === 'system')?.content ?? '');
const userMsg = (req: ChatRequest) => String(req.messages.find((m) => m.role === 'user')?.content ?? '');
const localesIn = (s: string) => [...s.matchAll(/"(az|de|en|ru)" \(/g)].map((m) => m[1]);

const answer = (req: ChatRequest) => {
  const s = sys(req);
  if (s.includes('weekly management report'))
    return JSON.stringify(
      Object.fromEntries(
        localesIn(s).map((l) => [
          l,
          {
            headline: `${l}: Approvals up, one case stuck.`,
            highlights: ['One approval this week.', 'Three new inquiries.'],
            problems: ['One case has been idle for weeks.'],
            recommendations: [
              { text: 'Call the client of the stuck case.', metric: 'stuckCases' },
              { text: 'Something vague.', metric: 'not-a-metric' },
              { text: 'Clear the overdue tasks.', metric: 'overdueTasks' },
              { text: 'Follow up the no-shows.', metric: 'bookingsNoShow' },
            ],
          },
        ]),
      ),
    );
  if (s.includes('explain one security alert'))
    return JSON.stringify(Object.fromEntries(localesIn(s).map((l) => [l, { summary: `${l}: Someone tried many passwords.`, actions: ['Revoke the sessions.', 'Reset 2FA.'] }])));
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
    yield { choices: [{ delta: { content: answer(req) }, finish_reason: 'stop' }], usage: { prompt_tokens: 300, completion_tokens: 120, cost: 0.0004 } };
  });
});

afterEach(() => {
  setSecurityRealtime(false);
});

afterAll(() => {
  setAiTransport(null);
  setKeyInfoFetcher(null);
  setModelsFetcher(null);
});

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
/** A Baku wall-clock time ("2026-10-14T10:00") as a UTC instant. */
const baku = (s: string) => new Date(Date.parse(`${s}:00Z`) - 4 * 60 * MIN);

// ─── 0. DSGVO privacy routing ─────────────────────────────────────────────

describe('ai privacy mode', () => {
  it('adds provider.data_collection=deny to every request by default, can add zdr, and can be switched off', async () => {
    const admin = await asSuperAdmin();
    expect(expectStatus(await admin.agent.get('/api/ai/settings'), 200).body.settings).toMatchObject({ privacyMode: true, zeroDataRetention: false });

    expect((await aiComplete({ scope: 'ADMIN', purpose: 'test', system: 'Say ok', input: 'hi' })).ok).toBe(true);
    expect(fake.requests[0].provider).toEqual({ data_collection: 'deny' });

    expectStatus(await admin.agent.put('/api/ai/settings').send({ zeroDataRetention: true }), 200);
    await aiComplete({ scope: 'ADMIN', purpose: 'test', system: 'Say ok', input: 'hi' });
    expect(fake.requests[1].provider).toEqual({ data_collection: 'deny', zdr: true });

    // The chat assistant (service.ts) carries it too.
    const conv = expectStatus(await admin.agent.post('/api/ai/conversations').send({ scope: 'ADMIN' }), 201).body.conversation.id as string;
    await admin.agent.post(`/api/ai/conversations/${conv}/messages`).send({ content: 'Hallo' });
    expect(fake.requests).toHaveLength(3);
    expect(fake.requests[2].provider).toEqual({ data_collection: 'deny', zdr: true });

    const off = expectStatus(await admin.agent.put('/api/ai/settings').send({ privacyMode: false, zeroDataRetention: false }), 200).body.settings;
    expect(off).toMatchObject({ privacyMode: false, zeroDataRetention: false });
    fake.requests = [];
    await aiComplete({ scope: 'ADMIN', purpose: 'test', system: 'Say ok', input: 'hi' });
    expect(fake.requests[0]).not.toHaveProperty('provider');

    // Rows saved before the field existed read as "on".
    expect(privacyRouting({ privacyMode: true, zeroDataRetention: false })).toEqual({ provider: { data_collection: 'deny' } });
    await prisma.setting.update({ where: { key: 'ai.assistant' }, data: { value: { monthlyBudgetUsd: 4 } } });
    clearAiSettingsCache();
    expect(expectStatus(await admin.agent.get('/api/ai/settings'), 200).body.settings.privacyMode).toBe(true);
  });

  it('only the super admin may change it', async () => {
    const admin = await asAdmin();
    expectStatus(await admin.agent.put('/api/ai/settings').send({ privacyMode: false }), 403);
  });
});

// ─── 1. Weekly management report ──────────────────────────────────────────

const NOW = new Date('2026-10-19T05:00:00Z'); // Monday 09:00 Baku

const seedWeek = async () => {
  const s1 = await createUser({ role: 'STAFF', firstName: 'Leyla', lastName: 'Quliyeva' });
  const s2 = await createUser({ role: 'STAFF', firstName: 'Orxan', lastName: 'Əliyev' });
  const old = new Date('2026-09-01T08:00:00Z');
  const client = async (createdAt: Date) => {
    const { user } = await createClient({ firstName: 'Aysel', lastName: 'Məmmədova' });
    await prisma.user.update({ where: { id: user.id }, data: { createdAt } });
    return user;
  };
  const [ca, cb, cc, cd] = [await client(old), await client(old), await client(old), await client(old)];
  await client(baku('2026-10-13T11:00'));
  await client(baku('2026-10-17T09:00'));

  const mk = (number: string, clientId: string, data: Record<string, unknown>) =>
    prisma.case.create({ data: { number, clientId, profession: 'Pflegefachkraft', ...data } as never });
  const A = await mk('TV-T-0001', ca.id, { createdAt: baku('2026-10-13T00:00'), updatedAt: baku('2026-10-16T12:00'), status: 'DOCUMENTS_REVIEW', assignedStaffId: s1.user.id });
  const B = await mk('TV-T-0002', cb.id, { createdAt: baku('2026-10-08T00:00'), updatedAt: baku('2026-10-15T00:00'), status: 'APPROVED', decisionAt: baku('2026-10-15T00:00'), assignedStaffId: s2.user.id });
  await mk('TV-T-0003', cc.id, { createdAt: old, updatedAt: baku('2026-10-08T00:00'), status: 'REJECTED', decisionAt: baku('2026-10-08T00:00') });
  const D = await mk('TV-T-0004', cd.id, { createdAt: old, updatedAt: new Date('2026-09-20T08:00:00Z'), status: 'CONTRACT_SENT', assignedStaffId: s1.user.id });
  await prisma.case.update({ where: { id: D.id }, data: { updatedAt: new Date('2026-09-20T08:00:00Z') } });

  await prisma.caseEvent.createMany({
    data: [
      { caseId: A.id, type: 'CASE_CREATED', toStatus: 'DOCUMENTS_PENDING', createdAt: baku('2026-10-13T00:00') },
      { caseId: A.id, type: 'STATUS_CHANGED', fromStatus: 'DOCUMENTS_PENDING', toStatus: 'DOCUMENTS_REVIEW', actorId: s1.user.id, createdAt: baku('2026-10-15T00:00') },
      { caseId: B.id, type: 'STATUS_CHANGED', fromStatus: 'DECISION_PENDING', toStatus: 'APPROVED', actorId: s1.user.id, createdAt: baku('2026-10-15T00:00') },
      { caseId: D.id, type: 'STATUS_CHANGED', fromStatus: 'CONTRACT_SIGNED', toStatus: 'CONTRACT_SENT', actorId: s1.user.id, createdAt: new Date('2026-09-20T08:00:00Z') },
    ],
  });
  // Response time: 6 h for the first message, the second one stays unanswered.
  await prisma.caseMessage.createMany({
    data: [
      { caseId: A.id, authorId: ca.id, body: 'Salam', createdAt: baku('2026-10-14T10:00') },
      { caseId: A.id, authorId: s1.user.id, body: 'Salam, baxıram', createdAt: baku('2026-10-14T16:00') },
      { caseId: A.id, authorId: ca.id, body: 'Nə oldu?', createdAt: baku('2026-10-16T12:00') },
    ],
  });

  await prisma.inquiry.createMany({
    data: [
      { kind: 'company', contactName: 'A', email: 'a@x.test', message: 'm', locale: 'de', createdAt: baku('2026-10-12T09:00') },
      { kind: 'company', contactName: 'B', email: 'b@x.test', message: 'm', locale: 'de', createdAt: baku('2026-10-14T09:00') },
      { kind: 'contact', contactName: 'C', email: 'c@x.test', message: 'm', locale: 'az', createdAt: baku('2026-10-18T23:00') },
      { kind: 'contact', contactName: 'D', email: 'd@x.test', message: 'm', locale: 'az', createdAt: baku('2026-10-07T09:00') },
      { kind: 'contact', contactName: 'E', email: 'e@x.test', message: 'm', locale: 'az', createdAt: baku('2026-10-19T00:30') }, // this week: not counted
    ],
  });

  let slotN = 0;
  const booking = async (startsAt: Date, status: 'BOOKED' | 'DONE' | 'NO_SHOW' | 'CANCELLED') => {
    slotN++;
    const slot = await prisma.consultationSlot.create({ data: { staffId: s2.user.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * MIN) } });
    await prisma.booking.create({ data: { slotId: slot.id, name: `B${slotN}`, email: `b${slotN}@x.test`, meetingUrl: 'https://meet.test/x', manageToken: `tok-${slotN}-${Math.random()}`, status } });
  };
  await booking(baku('2026-10-13T10:00'), 'DONE');
  await booking(baku('2026-10-16T10:00'), 'BOOKED');
  await booking(baku('2026-10-14T10:00'), 'NO_SHOW');
  await booking(baku('2026-10-15T10:00'), 'CANCELLED');
  await booking(baku('2026-10-07T10:00'), 'DONE');

  const company = await prisma.company.create({ data: { name: 'Pflege GmbH' } });
  const inv = (number: string, data: Record<string, unknown>) =>
    prisma.invoice.create({ data: { number, companyId: company.id, issueDate: old, dueDate: old, items: [], netCents: 0, vatCents: 0, grossCents: 0, ...data } as never });
  await inv('TV-RE-1', { status: 'SENT', sentAt: baku('2026-10-13T10:00'), dueDate: new Date('2026-10-27T00:00:00Z'), grossCents: 11_900 });
  await inv('TV-RE-2', { status: 'PAID', sentAt: baku('2026-10-01T10:00'), paidAt: baku('2026-10-14T10:00'), grossCents: 5_000 });
  await inv('TV-RE-3', { status: 'OVERDUE', sentAt: new Date('2026-09-20T08:00:00Z'), dueDate: new Date('2026-10-05T00:00:00Z'), grossCents: 2_000 });

  await prisma.analyticsDaily.createMany({
    data: [
      { day: new Date('2026-10-13'), metric: 'inquiry', source: 'google', count: 2 },
      { day: new Date('2026-10-13'), metric: 'register', source: 'google', count: 1 },
      { day: new Date('2026-10-14'), metric: 'inquiry', source: 'instagram', count: 1 },
      { day: new Date('2026-10-06'), metric: 'inquiry', source: 'google', count: 4 },
    ],
  });

  let taskN = 0;
  const task = async (dueAt: Date, assignee: string | null, status: 'TODO' | 'DONE' = 'TODO') => {
    const t = await prisma.task.create({ data: { number: ++taskN, title: `Task ${taskN}`, dueAt, status } });
    if (assignee) await prisma.taskAssignee.create({ data: { taskId: t.id, userId: assignee } });
  };
  await task(baku('2026-10-10T10:00'), s1.user.id);
  await task(baku('2026-10-15T10:00'), s1.user.id);
  await task(baku('2026-10-18T10:00'), s1.user.id);
  await task(baku('2026-10-01T10:00'), null);
  await task(baku('2026-10-10T10:00'), s2.user.id, 'DONE');
  await task(baku('2026-10-25T10:00'), s2.user.id);

  const sa = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  const owner = sa ?? (await createUser({ role: 'SUPER_ADMIN' })).user;
  const conv = await prisma.aiConversation.create({ data: { userId: owner.id, scope: 'ADMIN', archived: true, title: 'seed' } });
  await prisma.aiMessage.createMany({
    data: [
      { conversationId: conv.id, role: 'tool', costMicros: 1_500_000, createdAt: baku('2026-10-14T10:00') },
      { conversationId: conv.id, role: 'tool', costMicros: 250_000, createdAt: baku('2026-10-07T10:00') },
    ],
  });
  return { s1, s2, A, B, D };
};

describe('weekly report: numbers', () => {
  it('computes the Baku week boundaries', () => {
    expect(weekStartOf(NOW).toISOString()).toBe('2026-10-18T20:00:00.000Z');
    expect(lastFullWeek(NOW)).toEqual({ start: new Date('2026-10-11T20:00:00Z'), end: new Date('2026-10-18T20:00:00Z') });
    expect(reportDue(new Date('2026-10-19T03:59:00Z'))).toBe(false); // Monday 07:59 Baku
    expect(reportDue(new Date('2026-10-19T04:00:00Z'))).toBe(true);
    expect(reportDue(new Date('2026-10-20T01:00:00Z'))).toBe(true); // Tuesday: a missed Monday still sends
    expect(ipPrefix('203.0.113.7')).toBe('203.0');
    expect(ipPrefix('::ffff:10.1.2.3')).toBe('10.1');
    expect(hoursLabel([8, 9, 10, 14, 9])).toBe('08–10, 14');
  });

  it('gathers this week vs the week before from seeded data', async () => {
    await asSuperAdmin();
    const { s1, s2, A, D } = await seedWeek();
    const { start, end } = lastFullWeek(NOW);
    const d = await buildReportData({ start, end, now: NOW, stuckDays: 14 });

    expect(d.metrics).toMatchObject({
      inquiries: { cur: 3, prev: 1 },
      registrations: { cur: 2, prev: 0 },
      casesCreated: { cur: 1, prev: 1 },
      approvals: { cur: 1, prev: 0 },
      rejections: { cur: 0, prev: 1 },
      bookingsHeld: { cur: 2, prev: 1 },
      bookingsNoShow: { cur: 1, prev: 0 },
      bookingsCancelled: { cur: 1, prev: 0 },
      invoicesSent: { cur: 1, prev: 0 },
      invoicesPaid: { cur: 1, prev: 0 },
      aiSpendUsd: { cur: 1.5, prev: 0.25 },
    });
    expect(d.money).toEqual({ invoicesSent: { cur: { EUR: 11_900 }, prev: {} }, invoicesPaid: { cur: { EUR: 5_000 }, prev: {} }, overdue: { count: 1, amount: { EUR: 2_000 } } });
    expect(d.leadsBySource[0]).toEqual({ source: 'google', inquiries: 2, registrations: 1, bookings: 0, total: 3, prevTotal: 4 });
    expect(d.leadsBySource[1]).toMatchObject({ source: 'instagram', total: 1, prevTotal: 0 });
    expect(d.inquiriesByKind).toEqual({ company: { cur: 2, prev: 0 }, contact: { cur: 1, prev: 1 } });
    expect(d.casesByStatus).toEqual({ DOCUMENTS_REVIEW: 1, CONTRACT_SENT: 1 });
    expect(d.stepDurations).toEqual([
      { status: 'DECISION_PENDING', avgDays: 7, transitions: 1 },
      { status: 'DOCUMENTS_PENDING', avgDays: 2, transitions: 1 },
    ]);
    expect(d.stuck).toMatchObject({ days: 14, count: 1, items: [{ id: D.id, number: 'TV-T-0004', status: 'CONTRACT_SENT', staff: 'Leyla Quliyeva' }] });
    expect(d.stuck.items.some((c) => c.id === A.id)).toBe(false);
    expect(d.overdueTasks.total).toBe(4);
    expect(d.overdueTasks.perStaff).toEqual([
      { staffId: s1.user.id, name: 'Leyla Quliyeva', count: 3 },
      { staffId: null, name: '', count: 1 },
    ]);

    const leyla = d.staff.find((s) => s.id === s1.user.id)!;
    expect(leyla).toMatchObject({ openCases: 2, casesHandled: 2, decisions: 1, messagesSent: 1, avgResponseHours: 6, responses: 1, unanswered: 1, overdueTasks: 3, stuckCases: 1, needsSupport: true, reasons: ['overdueTasks'] });
    expect(d.staff.find((s) => s.id === s2.user.id)).toMatchObject({ overdueTasks: 0, needsSupport: false, reasons: [] });
    expect(d.mailTriage === null || typeof d.mailTriage.cur === 'number').toBe(true);
  });
});

describe('weekly report: narrative, e-mail and job', () => {
  it('writes the narrative with ONE AI call in every recipient language (no client or staff names sent)', async () => {
    const sa = await asSuperAdmin({ locale: 'de' });
    await seedWeek();
    const { report } = await generateReport({ now: NOW, locales: ['de', 'az'], userId: sa.user.id });
    expect(fake.requests).toHaveLength(1);
    const input = userMsg(fake.requests[0]);
    expect(input).not.toContain('Leyla');
    expect(input).not.toContain('Məmmədova');
    expect(sys(fake.requests[0])).toContain('"de" (German)');
    expect(sys(fake.requests[0])).toContain('"az" (Azerbaijani)');
    const n = report.narrative as Record<string, { recommendations: { metric: string }[]; headline: string }>;
    expect(Object.keys(n).sort()).toEqual(['az', 'de']);
    // Invalid metric dropped, at most 3 kept.
    expect(n.de.recommendations.map((r) => r.metric)).toEqual(['stuckCases', 'overdueTasks', 'bookingsNoShow']);
    expect(report.costMicros).toBe(400);

    const mail = renderReportEmail(report, 'de', { includeStaff: true });
    expect(mail.subject).toContain('Wöchentlicher Management-Bericht');
    expect(mail.html).toContain('de: Approvals up');
    expect(mail.html).toContain('Leyla Quliyeva');
    expect(mail.html).toContain(REPORT_TEXTS.de.needsSupport);
    expect(mail.html).toContain('/admin/cases/');
    const noStaff = renderReportEmail(report, 'de', { includeStaff: false });
    expect(noStaff.html).not.toContain(REPORT_TEXTS.de.staffTitle);
  });

  it('Monday job: not before 08:00 Baku, then once per week to the super admins (idempotent)', async () => {
    const sa = await asSuperAdmin();
    const admin = await asAdmin();
    await seedWeek();

    expect(await runWeeklyReportJob(new Date('2026-10-19T03:00:00Z'))).toMatchObject({ sent: 0, skipped: 'NOT_DUE' });
    expect(await prisma.managementReport.count()).toBe(0);

    const first = await runWeeklyReportJob(NOW);
    expect(first).toMatchObject({ sent: 1, skipped: null });
    expect(await runWeeklyReportJob(new Date(NOW.getTime() + 3 * 60 * MIN))).toMatchObject({ sent: 0, skipped: 'ALREADY_SENT' });
    expect(await prisma.managementReport.count()).toBe(1);
    expect(await prisma.managementReport.findFirstOrThrow()).toMatchObject({ sentTo: 1, weekStart: new Date('2026-10-11T20:00:00Z') });
    expect(await prisma.reminderLog.count({ where: { key: 'mgmt-weekly-report:2026-10-12' } })).toBe(1);
    const mails = await prisma.emailLog.findMany({ where: { to: sa.user.email } });
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toContain('Həftəlik idarəetmə hesabatı');
    expect(await prisma.emailLog.count({ where: { to: admin.user.email } })).toBe(0);
    expect(fake.requests).toHaveLength(1);

    // With "include admins" the next week also goes to ADMIN users.
    await saveReportSettings({ includeAdmins: true });
    expect(await runWeeklyReportJob(new Date(NOW.getTime() + 7 * DAY))).toMatchObject({ sent: 2 });
    expect(await prisma.emailLog.count({ where: { to: admin.user.email } })).toBe(1);
    expect(await prisma.managementReport.count()).toBe(2);

    // Switched off: nothing.
    await saveReportSettings({ enabled: false });
    expect(await runWeeklyReportJob(new Date(NOW.getTime() + 14 * DAY))).toMatchObject({ sent: 0, skipped: 'NOT_DUE' });
  });

  it('sends the numbers-only report when AI is unavailable', async () => {
    const sa = await asSuperAdmin({ locale: 'en' });
    await seedWeek();
    process.env.OPENROUTER_API_KEY = '';
    clearAiSettingsCache();
    expect(await runWeeklyReportJob(NOW)).toMatchObject({ sent: 1 });
    expect(fake.requests).toHaveLength(0);
    const report = await prisma.managementReport.findFirstOrThrow();
    expect(report.narrative).toBeNull();
    expect((report.data as { metrics: { inquiries: { cur: number } } }).metrics.inquiries.cur).toBe(3);
    expect(await prisma.emailLog.count({ where: { to: sa.user.email } })).toBe(1);
    expect(renderReportEmail(report, 'en', { includeStaff: true }).html).toContain(REPORT_TEXTS.en.aiUnavailable);
  });

  it('admin page API: list, detail, generate now, narrative in my language, e-mail me; super admin only', async () => {
    // "Generate now" reports the last full week before the real clock: pin the clock to the seeded week.
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    onTestFinished(() => vi.useRealTimers());
    const sa = await asSuperAdmin({ locale: 'en' });
    await seedWeek();
    fake.fail = true;
    const gen = expectStatus(await sa.agent.post('/api/admin/mgmt/reports/generate?locale=en').send({}), 200).body;
    expect(gen.reason).toBe('UPSTREAM');
    expect(gen.report.narrative).toBeNull();
    expect(gen.report.data.metrics).toBeTruthy();

    fake.fail = false;
    const withText = expectStatus(await sa.agent.post(`/api/admin/mgmt/reports/${gen.report.id}/narrative?locale=ru`).send({}), 200).body;
    expect(withText.report.narrative.headline).toContain('ru:');
    expect(withText.report.narrativeLocales).toEqual(['ru']);

    const list = expectStatus(await sa.agent.get('/api/admin/mgmt/reports?locale=ru'), 200).body;
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ hasNarrative: true, key: { inquiries: { cur: 3, prev: 1 } } });
    expect(list.settings).toMatchObject({ enabled: true, includeAdmins: false, stuckDays: 14 });

    expectStatus(await sa.agent.post(`/api/admin/mgmt/reports/${gen.report.id}/email`).send({}), 200);
    expect(await prisma.emailLog.count({ where: { to: sa.user.email } })).toBe(1);

    expect(expectStatus(await sa.agent.put('/api/admin/mgmt/reports-settings').send({ stuckDays: 30, includeAdmins: true }), 200).body.settings).toMatchObject({ stuckDays: 30, includeAdmins: true });
    expectStatus(await sa.agent.put('/api/admin/mgmt/reports-settings').send({ stuckDays: 1 }), 400);

    const admin = await asAdmin();
    const staff = await asStaff();
    expectStatus(await admin.agent.get('/api/admin/mgmt/reports'), 403);
    expectStatus(await staff.agent.post('/api/admin/mgmt/reports/generate').send({}), 403);
    expectStatus(await admin.agent.get('/api/admin/mgmt/security/alerts'), 403);
  });
});

// ─── 2. Security alerts ──────────────────────────────────────────────────

const T = new Date('2026-10-19T10:00:00Z');
const ago = (min: number) => new Date(T.getTime() - min * MIN);
const auditRow = (data: { action: string; actorId?: string | null; target?: string | null; details?: object; ip?: string | null; createdAt: Date }) =>
  prisma.auditLog.create({ data: { actorId: data.actorId ?? null, action: data.action, target: data.target ?? null, details: data.details ?? undefined, ip: data.ip ?? null, createdAt: data.createdAt } });
const session = (userId: string, createdAt: Date, ip: string | null) =>
  prisma.session.create({ data: { userId, client: 'web', ip, createdAt, lastSeenAt: createdAt, expiresAt: new Date(createdAt.getTime() + 30 * DAY) } });
const alertsOf = (rule: string) => prisma.securityAlert.findMany({ where: { rule }, orderBy: { createdAt: 'asc' } });
const scan = () => runSecurityScan({ now: T });
const staffUser = (role: Role = 'STAFF') => createUser({ role, firstName: 'Kamran', lastName: 'Hüseynov' });

describe('security alerts: rules', () => {
  it('failed logins for one account: fires at the threshold, notifies the super admins, dedupes and merges', async () => {
    const sa = await asSuperAdmin();
    const victim = await staffUser();
    for (let i = 0; i < 4; i++) await auditRow({ action: 'LOGIN_FAILED', target: `user:${victim.user.id}`, details: { email: victim.user.email }, ip: '198.51.100.7', createdAt: ago(10 - i) });
    expect((await scan()).created).toHaveLength(0);
    await auditRow({ action: 'LOGIN_2FA_FAILED', target: `user:${victim.user.id}`, ip: '198.51.100.7', createdAt: ago(2) });

    const r = await scan();
    expect(r.created).toHaveLength(1);
    const [a] = await alertsOf('failedLoginsAccount');
    expect(a).toMatchObject({ severity: 'MEDIUM', status: 'OPEN', userId: victim.user.id, ip: '198.51.100.7', hits: 1 });
    expect(a.facts).toMatchObject({ attempts: 5, windowMinutes: 15, ips: 1, role: 'STAFF' });
    const notes = await prisma.notification.findMany({ where: { userId: sa.user.id, type: 'SECURITY_ALERT' } });
    expect(notes).toHaveLength(1);
    expect(notes[0].link).toBe(`/admin/security-alerts?id=${a.id}`);
    // MEDIUM: in-app + push, no e-mail.
    await new Promise((res) => setTimeout(res, 100));
    expect(await prisma.emailLog.count({ where: { to: sa.user.email } })).toBe(0);

    // AI explanation from the facts only (no e-mail address in the input).
    const explainReq = fake.requests.find((q) => sys(q).includes('explain one security alert'))!;
    expect(userMsg(explainReq)).not.toContain(victim.user.email);
    expect(userMsg(explainReq)).toContain('198.51.x.x');
    expect((await prisma.securityAlert.findUniqueOrThrow({ where: { id: a.id } })).explanation).toMatchObject({ az: { summary: 'az: Someone tried many passwords.' } });

    // Same events again: nothing new.
    expect(await scan()).toMatchObject({ created: [], merged: 0 });
    // One more failure: merged into the open alert, no second notification.
    await auditRow({ action: 'LOGIN_FAILED', target: `user:${victim.user.id}`, details: { email: victim.user.email }, ip: '198.51.100.8', createdAt: ago(1) });
    expect(await scan()).toMatchObject({ created: [], merged: 1 });
    expect(await alertsOf('failedLoginsAccount')).toMatchObject([{ hits: 2, facts: { attempts: 6, ips: 2 } }]);
    expect(await prisma.notification.count({ where: { userId: sa.user.id, type: 'SECURITY_ALERT' } })).toBe(1);
  });

  it('failed logins from one IP (HIGH): e-mails the super admin', async () => {
    const sa = await asSuperAdmin();
    for (let i = 0; i < 10; i++) await auditRow({ action: 'LOGIN_FAILED', details: { email: `nobody${i}@x.test` }, ip: '203.0.113.9', createdAt: ago(12 - i) });
    expect((await scan()).created).toHaveLength(1);
    expect(await alertsOf('failedLoginsIp')).toMatchObject([{ severity: 'HIGH', ip: '203.0.113.9', facts: { attempts: 10, accounts: 10 } }]);
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: sa.user.email } }));
  });

  it('staff login from a new network and at an unusual hour', async () => {
    await asSuperAdmin();
    const st = await staffUser();
    // 10 logins on earlier days around 13:00 Baku from 10.20.x.x
    for (let i = 1; i <= 10; i++) await session(st.user.id, new Date(Date.parse(`2026-10-${String(18 - i).padStart(2, '0')}T09:0${i % 10}:00Z`)), `10.20.${i}.1`);
    // a client with a new IP is ignored (staff only)
    const cl = await createClient();
    await session(cl.user.id, ago(5), '1.1.1.1');
    // new login at 13:40 Baku (09:40 UTC) — within the usual hours; from a new network → alert
    await session(st.user.id, ago(20), '77.88.1.1');
    let r = await scan();
    const net = await alertsOf('newIpLogin');
    expect(net).toMatchObject([{ userId: st.user.id, ip: '77.88.1.1', facts: { network: '77.88', priorLogins: 10, knownNetworks: 1 } }]);
    expect(await alertsOf('unusualHourLogin')).toHaveLength(0);
    expect(r.created).toHaveLength(1);

    // 03:30 Baku from the known network → unusual hour only
    await session(st.user.id, new Date('2026-10-18T23:30:00Z'), '10.20.99.1');
    r = await runSecurityScan({ now: new Date('2026-10-18T23:35:00Z') });
    expect(await alertsOf('unusualHourLogin')).toMatchObject([{ severity: 'LOW', facts: { hour: '03:30', usualHours: '13' } }]);
    // scanning again does not repeat either alert
    expect((await runSecurityScan({ now: new Date('2026-10-18T23:45:00Z') })).created).toHaveLength(0);
  });

  it('bulk downloads / exports and bulk deletions', async () => {
    await asSuperAdmin();
    const st = await staffUser();
    for (let i = 0; i < 30; i++) await auditRow({ action: 'FILE_DOWNLOADED', actorId: st.user.id, target: `document:${i}`, createdAt: ago(20) });
    expect((await scan()).created).toHaveLength(0);
    await auditRow({ action: 'DRIVE_EXPORTED', actorId: st.user.id, details: { files: 25 }, createdAt: ago(5) });
    await scan();
    expect(await alertsOf('bulkDownload')).toMatchObject([{ severity: 'HIGH', userId: st.user.id, facts: { files: 55, downloads: 30, zipExports: 1, datasetExports: 0 } }]);

    const other = await staffUser('ADMIN');
    for (let i = 0; i < 3; i++) await auditRow({ action: 'CLIENTS_EXPORTED', actorId: other.user.id, createdAt: ago(10 + i) });
    await scan();
    expect((await alertsOf('bulkDownload')).find((a) => a.userId === other.user.id)?.facts).toMatchObject({ datasetExports: 3 });

    await auditRow({ action: 'DRIVE_BULK_TRASHED', actorId: st.user.id, details: { requested: 70, deleted: 70, nodes: 70 }, createdAt: ago(30) });
    for (let i = 0; i < 3; i++) await auditRow({ action: 'USER_DELETED', actorId: other.user.id, target: `user:x${i}`, createdAt: ago(40) });
    await scan();
    const del = await alertsOf('bulkDelete');
    expect(del).toHaveLength(2);
    expect(del.find((a) => a.userId === st.user.id)?.facts).toMatchObject({ items: 70, accounts: 0 });
    expect(del.find((a) => a.userId === other.user.id)?.facts).toMatchObject({ accounts: 3, usersDeleted: 3 });
  });

  it('2FA removed on staff accounts, role escalation, new super admin, API key created', async () => {
    const sa = await asSuperAdmin();
    const st = await staffUser();
    const cl = await createClient();
    await auditRow({ action: 'TWO_FACTOR_DISABLED', actorId: st.user.id, target: `user:${st.user.id}`, createdAt: ago(3) });
    await auditRow({ action: 'EMAIL_OTP_DISABLED', actorId: cl.user.id, target: `user:${cl.user.id}`, createdAt: ago(3) });
    await auditRow({ action: 'USER_UPDATED', actorId: sa.user.id, target: `user:${cl.user.id}`, details: { role: 'ADMIN' }, createdAt: ago(2) });
    await auditRow({ action: 'USER_UPDATED', actorId: sa.user.id, target: `user:${st.user.id}`, details: { isActive: true }, createdAt: ago(2) });
    await auditRow({ action: 'API_KEY_CREATED', actorId: sa.user.id, target: 'apikey:k1', details: { name: 'ERP', scopes: ['vacancies:read'] }, createdAt: ago(1) });
    await scan();
    expect(await alertsOf('twoFactorDisabled')).toMatchObject([{ userId: st.user.id, severity: 'HIGH', facts: { action: 'TWO_FACTOR_DISABLED', self: true } }]);
    expect(await alertsOf('roleEscalation')).toMatchObject([{ userId: cl.user.id, facts: { action: 'ROLE_CHANGED', newRole: 'ADMIN' } }]);
    expect(await alertsOf('apiKeyCreated')).toMatchObject([{ severity: 'MEDIUM', facts: { keyName: 'ERP', keys: 1 } }]);

    // The first full scan remembered the super admins; one added directly in the DB is reported.
    const sneaky = await createUser({ role: 'SUPER_ADMIN', firstName: 'Ghost' });
    await scan();
    expect((await alertsOf('roleEscalation')).find((a) => a.userId === sneaky.user.id)?.facts).toMatchObject({ action: 'NEW_SUPER_ADMIN' });
    await scan();
    expect((await alertsOf('roleEscalation')).filter((a) => a.userId === sneaky.user.id)).toHaveLength(1);
  });

  it('thresholds and toggles come from the settings panel', async () => {
    await asSuperAdmin();
    const st = await staffUser();
    await saveSecuritySettings({ rules: { failedLoginsAccount: { threshold: 2 }, failedLoginsIp: { enabled: false } } });
    for (let i = 0; i < 2; i++) await auditRow({ action: 'LOGIN_FAILED', target: `user:${st.user.id}`, ip: '192.0.2.1', createdAt: ago(3) });
    await scan();
    expect(await alertsOf('failedLoginsAccount')).toHaveLength(1);
    await saveSecuritySettings({ rules: { failedLoginsAccount: { enabled: false } } });
    await auditRow({ action: 'LOGIN_FAILED', target: 'user:someone-else', ip: '192.0.2.1', createdAt: ago(2) });
    await auditRow({ action: 'LOGIN_FAILED', target: 'user:someone-else', ip: '192.0.2.1', createdAt: ago(1) });
    expect((await scan()).created).toHaveLength(0);
  });

  it('false positive suppresses the same pattern for 7 days; acknowledged alerts only return when new events cross the threshold', async () => {
    const sa = await asSuperAdmin();
    const st = await staffUser();
    const fail = (min: number, ip = '198.51.100.20') => auditRow({ action: 'LOGIN_FAILED', target: `user:${st.user.id}`, ip, createdAt: ago(min) });
    for (let i = 0; i < 5; i++) await fail(14 - i);
    await scan();
    const [a] = await alertsOf('failedLoginsAccount');
    expectStatus(await sa.agent.post(`/api/admin/mgmt/security/alerts/${a.id}/ack`).send({}), 200);

    // One more failure after the acknowledgement: below the threshold on its own → no new alert.
    await fail(1);
    await scan();
    expect(await alertsOf('failedLoginsAccount')).toHaveLength(1);
    // Five new ones → new alert.
    for (let i = 0; i < 5; i++) await fail(0.5);
    await scan();
    const two = await alertsOf('failedLoginsAccount');
    expect(two).toHaveLength(2);

    expectStatus(await sa.agent.post(`/api/admin/mgmt/security/alerts/${two[1].id}/false-positive`).send({}), 200);
    const later = new Date(T.getTime() + 60 * MIN);
    for (let i = 0; i < 6; i++) await auditRow({ action: 'LOGIN_FAILED', target: `user:${st.user.id}`, ip: '198.51.100.21', createdAt: new Date(later.getTime() - (i + 1) * MIN) });
    await runSecurityScan({ now: later });
    expect(await alertsOf('failedLoginsAccount')).toHaveLength(2);
  });
});

describe('security alerts: realtime hook and actions', () => {
  it('a 2FA reset and a role change through the real API raise alerts immediately', async () => {
    setSecurityRealtime(true);
    const sa = await asSuperAdmin();
    const st = await staffUser();
    const cl = await createClient();
    expectStatus(await sa.agent.post(`/api/auth/2fa/users/${st.user.id}/reset`).send({}), 200);
    await flushSecurityRealtime();
    expect(await alertsOf('twoFactorDisabled')).toMatchObject([{ userId: st.user.id, facts: { action: 'TWO_FACTOR_RESET', self: false } }]);

    expectStatus(await sa.agent.patch(`/api/admin/users/${cl.user.id}`).send({ role: 'STAFF' }), 200);
    await flushSecurityRealtime();
    expect(await alertsOf('roleEscalation')).toMatchObject([{ userId: cl.user.id, facts: { newRole: 'STAFF' } }]);
    // The job later sees the same audit rows: no duplicates.
    await runSecurityScan();
    expect(await prisma.securityAlert.count()).toBe(2);
  });

  it('page actions: only the super admin; revoke sessions, disable user, reset 2FA via the existing endpoints and record them', async () => {
    const sa = await asSuperAdmin({ locale: 'de' });
    const admin = await asAdmin();
    const st = await staffUser();
    for (let i = 0; i < 5; i++) await auditRow({ action: 'LOGIN_FAILED', target: `user:${st.user.id}`, ip: '198.51.100.30', createdAt: ago(5) });
    await scan();
    const [a] = await alertsOf('failedLoginsAccount');

    // Listing (in the viewer's language) with the account's current state.
    const list = expectStatus(await sa.agent.get('/api/admin/mgmt/security/alerts?locale=de'), 200).body;
    expect(list.items[0]).toMatchObject({ id: a.id, title: 'Viele fehlgeschlagene Anmeldungen bei einem Konto', subject: { id: st.user.id, isActive: true, twoFactor: true, activeSessions: 1 } });
    expect(list.items[0].summary).toContain('5 Fehlversuche');
    expect(expectStatus(await sa.agent.get('/api/admin/mgmt/security/summary'), 200).body).toMatchObject({ open: 1, high: 0 });

    // Not allowed for ADMIN / STAFF.
    expectStatus(await admin.agent.post(`/api/admin/users/${st.user.id}/revoke-sessions`).send({}), 403);
    expectStatus(await admin.agent.post(`/api/auth/2fa/users/${st.user.id}/reset`).send({}), 403);
    expectStatus(await admin.agent.post(`/api/admin/mgmt/security/alerts/${a.id}/actions`).send({ action: 'REVOKE_SESSIONS' }), 403);
    expectStatus(await sessionAgent(st.token).post(`/api/admin/mgmt/security/alerts/${a.id}/ack`).send({}), 403);
    expectStatus(await admin.agent.get('/api/admin/mgmt/security/summary'), 403);

    // Super admin: revoke → record.
    expect(expectStatus(await sa.agent.post(`/api/admin/users/${st.user.id}/revoke-sessions`).send({}), 200).body.revoked).toBe(1);
    const rec = expectStatus(await sa.agent.post(`/api/admin/mgmt/security/alerts/${a.id}/actions`).send({ action: 'REVOKE_SESSIONS' }), 200).body.alert;
    expect(rec).toMatchObject({ status: 'ACKNOWLEDGED', actions: [{ action: 'REVOKE_SESSIONS', by: sa.user.id }] });
    expectStatus(await sa.agent.post(`/api/admin/mgmt/security/alerts/${a.id}/actions`).send({ action: 'DELETE_EVERYTHING' }), 400);

    expectStatus(await sa.agent.patch(`/api/admin/users/${st.user.id}`).send({ isActive: false }), 200);
    expectStatus(await sa.agent.post(`/api/admin/mgmt/security/alerts/${a.id}/actions`).send({ action: 'DISABLE_USER' }), 200);
    expectStatus(await sa.agent.post(`/api/auth/2fa/users/${st.user.id}/reset`).send({}), 200);
    const final = expectStatus(await sa.agent.post(`/api/admin/mgmt/security/alerts/${a.id}/actions`).send({ action: 'RESET_2FA' }), 200).body.alert;
    expect(final.actions.map((x: { action: string }) => x.action)).toEqual(['REVOKE_SESSIONS', 'DISABLE_USER', 'RESET_2FA']);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: st.user.id } });
    expect(u).toMatchObject({ isActive: false, totpEnabledAt: null });

    // Explanation in the viewer's language on demand; settings panel round trip.
    const ex = expectStatus(await sa.agent.post(`/api/admin/mgmt/security/alerts/${a.id}/explain?locale=de`).send({}), 200).body.alert;
    expect(ex.explanation).toMatchObject({ summary: 'de: Someone tried many passwords.' });
    const set = expectStatus(await sa.agent.put('/api/admin/mgmt/security/settings').send({ dedupeHours: 12, rules: { bulkDownload: { threshold: 80, severity: 'MEDIUM' } } }), 200).body.settings;
    expect(set).toMatchObject({ dedupeHours: 12, rules: { bulkDownload: { threshold: 80, severity: 'MEDIUM', exportThreshold: 3 } } });
    expectStatus(await sa.agent.put('/api/admin/mgmt/security/settings').send({ rules: { bulkDownload: { prompt: 'x' } } }), 400);
    expect(expectStatus(await sa.agent.get('/api/admin/mgmt/security/alerts?status=all'), 200).body.counts).toMatchObject({ ACKNOWLEDGED: 1 });
    expectStatus(await sa.agent.post('/api/admin/mgmt/security/scan').send({}), 200);
  });
});
