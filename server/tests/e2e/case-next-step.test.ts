import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { driveCaseTo, expectStatus, uploadDoc, clientCase } from '../helpers/workflow';
import { setAiTransport, setKeyInfoFetcher, setModelsFetcher, type ChatRequest, type StreamChunk } from '../../src/lib/ai/openrouter.js';
import { clearAiSettingsCache } from '../../src/lib/ai/settings.js';
import { clearCaseAiSettingsCache } from '../../src/lib/ai/features/caseAi/config.js';
import { clearNextStepAiCache } from '../../src/lib/caseNext/ai.js';

const KEY = 'sk-or-test-not-a-real-key';
const fake = { requests: [] as ChatRequest[], answer: '{}', fail: false };

beforeEach(() => {
  fake.requests = [];
  fake.fail = false;
  fake.answer = JSON.stringify({
    explanation: 'Alle Unterlagen liegen vor; jetzt muss die Prüfung abgeschlossen werden.',
    risk: 'Der Termin rückt näher.',
    clientMessage: 'Guten Tag Elvin,\n\nwir prüfen gerade Ihre Unterlagen.\n\nMit freundlichen Grüßen\nTriad Vision',
  });
  process.env.OPENROUTER_API_KEY = KEY;
  clearAiSettingsCache();
  clearCaseAiSettingsCache();
  clearNextStepAiCache();
  setKeyInfoFetcher(async () => null);
  setModelsFetcher(async () => []);
  setAiTransport(async function* (req): AsyncGenerator<StreamChunk> {
    fake.requests.push(JSON.parse(JSON.stringify(req)) as ChatRequest);
    if (fake.fail) throw new Error('upstream down');
    yield { choices: [{ delta: { content: fake.answer }, finish_reason: 'stop' }], usage: { prompt_tokens: 300, completion_tokens: 120, cost: 0.0008 } };
  });
});

afterAll(() => {
  setAiTransport(null);
  setKeyInfoFetcher(null);
  setModelsFetcher(null);
});

type Action = { id: string; kind: string; request?: { method: 'POST'; path: string; body: Record<string, unknown> }; documentIds?: string[]; draft?: string; locale?: string };
type Step = { code: string; tone: string; params: Record<string, unknown>; actions: Action[] };

const nextStep = async (agent: Agent, caseId: string) =>
  expectStatus(await agent.get(`/api/admin/cases/${caseId}/next-step`), 200).body.nextStep as { steps: Step[]; total: number; clientLocale: string; status: string };

/** Runs an action exactly as the admin UI does: its request against the existing endpoint. */
const run = (agent: Agent, a: Action, body?: Record<string, unknown>) => agent.post(`/api${a.request!.path}`).send(body ?? a.request!.body);

const setupClient = async (locale: 'de' | 'ru' | 'az' = 'de') => {
  const client = await asClient({ firstName: 'Elvin', lastName: 'Mammadov', locale });
  const admin = await asAdmin();
  return { client, admin };
};

describe('next step: rules on real cases and their actions', () => {
  it('documents waiting for review → review through the existing review endpoint → next: send the contract', async () => {
    const { client, admin } = await setupClient();
    const c = await driveCaseTo('DOCUMENTS_REVIEW', { client: client.agent, admin: admin.agent });
    const v = await nextStep(admin.agent, c.id);
    expect(v.status).toBe('DOCUMENTS_REVIEW');
    expect(v.steps[0].code).toBe('DOCS_TO_REVIEW');
    const review = v.steps[0].actions[0];
    expect(review.kind).toBe('review');
    for (const id of review.documentIds!) expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/documents/${id}/review`).send({ status: 'ACCEPTED' }), 200);
    expect((await nextStep(admin.agent, c.id)).steps[0].code).toBe('SEND_CONTRACT');
  });

  it('contract signed → confirm contract transition through /actions moves the case', async () => {
    const { client, admin } = await setupClient();
    const c = await driveCaseTo('CONTRACT_SIGNED', { client: client.agent, admin: admin.agent });
    const s = (await nextStep(admin.agent, c.id)).steps[0];
    expect(s).toMatchObject({ code: 'CONFIRM_CONTRACT', params: { days: 0 } });
    const a = s.actions.find((x) => x.kind === 'transition')!;
    expect(expectStatus(await run(admin.agent, a), 200).body.case.status).toBe('EMBASSY_DOCUMENTS');
    const after = await nextStep(admin.agent, c.id);
    expect(after.status).toBe('EMBASSY_DOCUMENTS');
    expect(after.steps.map((x) => x.code)).toContain('MISSING_DOCS');
  });

  it('missing documents: request (one notification), templated message and task go through existing endpoints', async () => {
    const { client, admin } = await setupClient('ru');
    const c = await driveCaseTo('EMBASSY_DOCUMENTS', { client: client.agent, admin: admin.agent });
    const v = await nextStep(admin.agent, c.id);
    expect(v.clientLocale).toBe('ru');
    const missing = v.steps.find((s) => s.code === 'MISSING_DOCS')!;
    const req = missing.actions.find((a) => a.kind === 'request')!;
    expect(req.request!.path).toBe(`/admin/cases/${c.id}/next-step/request-documents`);
    const before = await prisma.notification.count({ where: { userId: client.user.id, type: 'DOCUMENT_REQUESTED' } });
    const out = expectStatus(await run(admin.agent, req), 201).body;
    expect(out.requested.length).toBe((req.request!.body.items as unknown[]).length);
    expect(out.requested.every((r: { created: boolean }) => !r.created)).toBe(true); // existing requirements → reminder
    const notes = await prisma.notification.findMany({ where: { userId: client.user.id, type: 'DOCUMENT_REQUESTED' }, orderBy: { createdAt: 'desc' } });
    expect(notes.length).toBe(before + 1);
    expect(notes[0].title).toBe('Запрошены документы');

    const msg = missing.actions.find((a) => a.kind === 'message')!;
    expect(msg.locale).toBe('ru');
    expect(msg.draft).toMatch(/^Здравствуйте, Elvin!/);
    const edited = `${msg.draft}\n\nP.S.`;
    expectStatus(await run(admin.agent, msg, { body: edited }), 201);
    const last = await prisma.caseMessage.findFirstOrThrow({ where: { caseId: c.id }, orderBy: { createdAt: 'desc' } });
    expect(last.body).toBe(edited);

    const checklistGap = v.steps.find((s) => s.code === 'CHECKLIST_GAP');
    if (checklistGap) expect(checklistGap.actions[0].request!.path).toBe(`/admin/cases/${c.id}/next-step/request-documents`);
  });

  it('a task action creates a task linked to the case through /api/tasks', async () => {
    const { client, admin } = await setupClient();
    const c = await driveCaseTo('EMBASSY_REVIEW', { client: client.agent, admin: admin.agent });
    // review every embassy document → "book the appointment" with a task action
    const detail = expectStatus(await admin.agent.get(`/api/admin/cases/${c.id}`), 200).body.case;
    for (const r of detail.requirements) for (const d of r.documents) if (d.status === 'PENDING') expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/documents/${d.id}/review`).send({ status: 'ACCEPTED' }), 200);
    const s = (await nextStep(admin.agent, c.id)).steps.find((x) => x.code === 'BOOK_APPOINTMENT')!;
    const task = s.actions.find((a) => a.kind === 'task')!;
    expect(task.request!.path).toBe('/tasks');
    const created = expectStatus(await run(admin.agent, task), 201).body.task;
    expect(created.case?.id ?? created.caseId).toBe(c.id);
    expect(s.actions.map((a) => a.kind)).toContain('package');
  });

  it('appointment scheduled → build the embassy package; after building it, only a reminder remains', async () => {
    const { client, admin } = await setupClient();
    const c = await driveCaseTo('APPOINTMENT_SCHEDULED', { client: client.agent, admin: admin.agent });
    await prisma.case.update({ where: { id: c.id }, data: { appointmentAt: new Date(Date.now() + 2 * 24 * 3600 * 1000) } });
    const s = (await nextStep(admin.agent, c.id)).steps[0];
    expect(s).toMatchObject({ code: 'APPOINTMENT_PACKAGE', tone: 'urgent' });
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/embassy-package`).send({}), 201);
    expect((await nextStep(admin.agent, c.id)).steps.map((x) => x.code)).toEqual(['APPOINTMENT_REMIND']);
  });

  it('cases list returns a compact next step per row (rules only, no AI)', async () => {
    const { client, admin } = await setupClient();
    const c = await driveCaseTo('DOCUMENTS_REVIEW', { client: client.agent, admin: admin.agent });
    const client2 = await asClient();
    const c2 = await driveCaseTo('CANCELLED', { client: client2.agent, admin: admin.agent });
    const list = expectStatus(await admin.agent.get('/api/admin/cases'), 200).body;
    const row = list.items.find((i: { id: string }) => i.id === c.id);
    expect(row.nextStep).toMatchObject({ code: 'DOCS_TO_REVIEW', tone: expect.any(String), params: { count: expect.any(Number) } });
    expect(list.items.find((i: { id: string }) => i.id === c2.id).nextStep).toBeNull();
    expect(fake.requests).toHaveLength(0);
  });
});

describe('next step: AI explanation', () => {
  it('adds an explanation, risk and a client message draft (cheap model), cached per case state', async () => {
    const { client, admin } = await setupClient();
    const c = await driveCaseTo('DOCUMENTS_REVIEW', { client: client.agent, admin: admin.agent });
    const res = expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/next-step/ai`).send({}), 200).body;
    expect(res.ai).toMatchObject({ status: 'done' });
    expect(res.explanation).toContain('Alle Unterlagen');
    expect(res.risk).toBe('Der Termin rückt näher.');
    expect(res.draft).toMatchObject({ locale: 'de' });
    expect(res.draft.body).toContain('\n\nwir prüfen'); // line breaks kept
    expect(res.nextStep.steps[0].code).toBe('DOCS_TO_REVIEW');
    expect(fake.requests).toHaveLength(1);
    const sent = JSON.stringify(fake.requests[0].messages);
    expect(sent).toContain('DOCS_TO_REVIEW');
    expect(sent).not.toContain(client.user.email); // no contact data to the model
    expect(fake.requests[0].model).toContain('haiku');

    const again = expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/next-step/ai`).send({}), 200).body;
    expect(again.cached).toBe(true);
    expect(fake.requests).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: 'CASE_NEXT_STEP_AI', target: c.id } })).toBe(1);
  });

  it('AI unavailable → the deterministic card still works (200 with the reason)', async () => {
    process.env.OPENROUTER_API_KEY = '';
    clearAiSettingsCache();
    const { client, admin } = await setupClient();
    const c = await driveCaseTo('DOCUMENTS_REVIEW', { client: client.agent, admin: admin.agent });
    const res = expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/next-step/ai`).send({}), 200).body;
    expect(res).toMatchObject({ explanation: null, draft: null, ai: { status: 'skipped', reason: 'NO_API_KEY' } });
    expect(res.nextStep.steps[0].code).toBe('DOCS_TO_REVIEW');
    expect(fake.requests).toHaveLength(0);
  });

  it('AI upstream failure → skipped with a reason, steps unchanged', async () => {
    fake.fail = true;
    const { client, admin } = await setupClient();
    const c = await driveCaseTo('DOCUMENTS_REVIEW', { client: client.agent, admin: admin.agent });
    const res = expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/next-step/ai`).send({}), 200).body;
    expect(res.ai.status).toBe('skipped');
    expect(res.ai.reason).toBeTruthy();
    expect(res.nextStep.steps.length).toBeGreaterThan(0);
  });
});

describe('next step: authorization', () => {
  it('staff only', async () => {
    const { client, admin } = await setupClient();
    const c = await driveCaseTo('DOCUMENTS_PENDING', { client: client.agent, admin: admin.agent });
    // the client uploads one document: still the client's own case, but the admin API stays closed
    const reqId = (await clientCase(client.agent, c.id)).requirements[0].id;
    expectStatus(await uploadDoc(client.agent, c.id, reqId), 201);
    for (const [method, url] of [
      ['get', `/api/admin/cases/${c.id}/next-step`],
      ['post', `/api/admin/cases/${c.id}/next-step/ai`],
      ['post', `/api/admin/cases/${c.id}/next-step/request-documents`],
    ] as const) {
      expect((await anon()[method](url).send({})).status, url).toBe(401);
      expect((await client.agent[method](url).send({ items: [{ requirementId: reqId }] })).status, url).toBe(403);
    }
    const staff = await asStaff();
    expect((await staff.agent.get(`/api/admin/cases/${c.id}/next-step`)).status).toBe(200);
    expect((await staff.agent.get('/api/admin/cases/nope/next-step')).status).toBe(404);
  });
});
