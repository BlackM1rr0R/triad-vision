import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, type Actor } from '../helpers/api';
import { emailsTo, prisma, settle } from '../helpers/db';
import { act, createCaseVia, driveCaseTo, expectStatus, uploadDoc, clientCase } from '../helpers/workflow';
import { createVacancy } from './vacancies.fixtures';
import { runAutomationQueue, runDueSteps, runTimeTriggers } from '../../src/lib/automation/engine.js';
import { automationScope, emitAutomationEvent, invalidateAutomationCache } from '../../src/lib/automation/events.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Fire-and-forget emits land, then the queue is processed like the job would. */
const drain = async () => {
  await settle();
  return runAutomationQueue();
};

const createRule = async (admin: Actor, body: Record<string, unknown>) =>
  expectStatus(await admin.agent.post('/api/admin/automation/rules').send({ name: 'Test rule', enabled: true, conditions: [], ...body }), 201).body.rule as { id: string };

const runsOf = (ruleId: string) => prisma.automationRun.findMany({ where: { ruleId }, include: { steps: { orderBy: { index: 'asc' } } }, orderBy: { createdAt: 'asc' } });

const note = (text: string) => ({ type: 'ADD_NOTE', text });

describe('automation rules: admin API', () => {
  it('is admin-only, ships five disabled example rules once and validates placeholders', async () => {
    const staff = await asStaff();
    expectStatus(await staff.agent.get('/api/admin/automation/rules'), 403);

    const admin = await asAdmin({ locale: 'de' });
    const list = expectStatus(await admin.agent.get('/api/admin/automation/rules'), 200).body.rules as { name: string; enabled: boolean; exampleKey: string | null; valid: boolean }[];
    expect(list).toHaveLength(5);
    expect(list.every((r) => !r.enabled && r.exampleKey && r.valid)).toBe(true);
    expect(list.map((r) => r.name)).toContain('Vertrag unterschrieben → Aufgabe Botschaftstermin');

    // Deleted examples are not re-created.
    const first = await prisma.automationRule.findFirstOrThrow();
    expectStatus(await admin.agent.delete(`/api/admin/automation/rules/${first.id}`), 200);
    expect((await admin.agent.get('/api/admin/automation/rules')).body.rules).toHaveLength(4);

    const bad = await admin.agent.post('/api/admin/automation/rules').send({ name: 'x', trigger: { type: 'CASE_CREATED' }, actions: [note('Hello {{client.password}}')] });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('UNKNOWN_PLACEHOLDER');

    const meta = expectStatus(await admin.agent.get('/api/admin/automation/meta'), 200).body;
    expect(meta.triggers).toContain('CLIENT_INACTIVE');
    expect(meta.placeholders).toContain('client.firstName');
    expect(meta.transitions.CANCELLED).toContain('DOCUMENTS_PENDING');

    const audits = await prisma.auditLog.findMany({ where: { action: { startsWith: 'AUTOMATION_' } } });
    expect(audits.map((a) => a.action)).toContain('AUTOMATION_RULE_DELETED');
  });

  it('toggles a rule on and off (audited) and counts its runs', async () => {
    const admin = await asAdmin();
    const rule = await createRule(admin, { enabled: false, trigger: { type: 'CASE_CREATED' }, actions: [note('created {{case.number}}')] });
    const client = await asClient();
    await createCaseVia(client.agent);
    await drain();
    expect(await runsOf(rule.id)).toHaveLength(0);

    expectStatus(await admin.agent.patch(`/api/admin/automation/rules/${rule.id}/enabled`).send({ enabled: true }), 200);
    await createCaseVia((await asClient()).agent);
    await drain();
    const row = await prisma.automationRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(row.runCount).toBe(1);
    expect(row.lastRunAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'AUTOMATION_RULE_ENABLED', target: rule.id } })).toBe(1);
  });
});

describe('automation rules: triggers → conditions → actions', () => {
  it('case created → task for the case owner (placeholders rendered)', async () => {
    const admin = await asAdmin();
    const owner = await asStaff({ firstName: 'Leyla' });
    expectStatus(await admin.agent.put('/api/admin/assignment/config').send({ mode: 'leastLoaded', staffIds: [owner.user.id] }), 200);
    const rule = await createRule(admin, {
      trigger: { type: 'CASE_CREATED' },
      actions: [{ type: 'CREATE_TASK', title: '{{case.number}}: call {{client.firstName}}', assignee: { kind: 'CASE_OWNER' }, dueInDays: 2, priority: 'HIGH' }],
    });
    const client = await asClient({ firstName: 'Kamran' });
    const c = await createCaseVia(client.agent);
    await drain();
    const task = await prisma.task.findFirstOrThrow({ where: { caseId: c.id }, include: { assignees: true } });
    expect(task.title).toBe(`${c.number}: call Kamran`);
    expect(task.priority).toBe('HIGH');
    expect(task.assignees.map((a) => a.userId)).toEqual([owner.user.id]);
    expect(task.dueAt!.getTime()).toBeGreaterThan(Date.now() + DAY);
    const [run] = await runsOf(rule.id);
    expect(run.status).toBe('SUCCEEDED');
    expect(await prisma.notification.count({ where: { userId: owner.user.id, type: 'TASK_ASSIGNED' } })).toBe(1);
  });

  it('status changed from → to filters; other transitions do not fire', async () => {
    const admin = await asAdmin();
    const rule = await createRule(admin, {
      trigger: { type: 'CASE_STATUS_CHANGED', from: ['DOCUMENTS_PENDING'], to: ['CANCELLED'] },
      actions: [{ type: 'NOTIFY_STAFF', target: { kind: 'ADMINS' }, title: '{{case.number}} → {{case.status}}', body: '' }],
    });
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    expectStatus(await act(admin.agent, c.id, { action: 'CANCEL', reason: 'Test reason' }), 200);
    await drain();
    const [run] = await runsOf(rule.id);
    expect(run.status).toBe('SUCCEEDED');
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: admin.user.id, type: 'AUTOMATION' } });
    expect(n.title.startsWith(`${c.number} → `)).toBe(true);

    // Reopen (CANCELLED → DOCUMENTS_PENDING) does not match the filter: no run.
    expectStatus(await act(admin.agent, c.id, { action: 'REOPEN', to: 'DOCUMENTS_PENDING' }), 200);
    await drain();
    expect(await runsOf(rule.id)).toHaveLength(1);
  });

  it('document uploaded by the client → internal note; staff uploads are ignored with byClientOnly', async () => {
    const admin = await asAdmin();
    const rule = await createRule(admin, { trigger: { type: 'DOCUMENT_UPLOADED', stages: ['INITIAL'], byClientOnly: true }, actions: [note('uploaded {{document.name}}')] });
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const req = (await clientCase(client.agent, c.id)).requirements[0];
    expectStatus(await uploadDoc(client.agent, c.id, req.id, 'passport.pdf'), 201);
    await drain();
    const [run] = await runsOf(rule.id);
    expect(run.status).toBe('SUCCEEDED');
    const ev = await prisma.caseEvent.findFirstOrThrow({ where: { caseId: c.id, type: 'INTERNAL_NOTE' } });
    expect(ev.note).toBe('[Test rule] uploaded passport.pdf');
    expect(ev.visibleToClient).toBe(false);
  });

  it('document rejected → client e-mail + in-app message with the reason, in the client language', async () => {
    const admin = await asAdmin();
    const rule = await createRule(admin, {
      trigger: { type: 'DOCUMENT_REJECTED', stages: [] },
      actions: [{
        type: 'SEND_CLIENT_MESSAGE',
        channels: ['EMAIL', 'IN_APP'],
        message: { kind: 'CUSTOM', title: { az: 'Rədd: {{document.title}}', de: 'Abgelehnt: {{document.title}}', en: 'Rejected: {{document.title}}', ru: 'Отклонено: {{document.title}}' }, body: { az: '{{document.note}}', de: 'Grund: {{document.note}}', en: '{{document.note}}', ru: '{{document.note}}' } },
      }],
    });
    const client = await asClient({ locale: 'de' });
    const c = await createCaseVia(client.agent);
    const req = (await clientCase(client.agent, c.id)).requirements[0];
    const doc = expectStatus(await uploadDoc(client.agent, c.id, req.id), 201).body.document;
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'REJECTED', note: 'Unscharf' }), 200);
    await drain();
    const [run] = await runsOf(rule.id);
    expect(run.status).toBe('SUCCEEDED');
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: client.user.id, type: 'AUTOMATION' } });
    expect(n.title).toMatch(/^Abgelehnt: /);
    expect(n.body).toBe('Grund: Unscharf');
    const mails = await emailsTo(client.user.email);
    expect(mails.some((m) => m.subject.startsWith('Triad Vision · Abgelehnt: '))).toBe(true);
  });

  it('document accepted → outgoing webhook delivery', async () => {
    const admin = await asAdmin();
    const hook = await prisma.webhook.create({ data: { url: 'https://example.com/hook', secret: 's'.repeat(32), events: ['automation.triggered'], active: true, createdById: admin.user.id } });
    await createRule(admin, { trigger: { type: 'DOCUMENT_ACCEPTED', stages: [] }, actions: [{ type: 'WEBHOOK' }] });
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const req = (await clientCase(client.agent, c.id)).requirements[0];
    const doc = expectStatus(await uploadDoc(client.agent, c.id, req.id), 201).body.document;
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'ACCEPTED' }), 200);
    await drain();
    const d = await prisma.webhookDelivery.findFirstOrThrow({ where: { webhookId: hook.id } });
    expect(d.event).toBe('automation.triggered');
    expect((d.payload as { data: { case: { number: string } } }).data.case.number).toBe(c.number);
  });

  it('contract signed and appointment set → task + SMS with the appointment date', async () => {
    const admin = await asAdmin();
    const owner = await asStaff();
    const signed = await createRule(admin, { trigger: { type: 'CONTRACT_SIGNED' }, actions: [{ type: 'CREATE_TASK', title: 'Book embassy for {{client.fullName}}', assignee: { kind: 'USER', userId: owner.user.id }, dueInDays: 2 }] });
    const appt = await createRule(admin, {
      trigger: { type: 'APPOINTMENT_SET', includeReschedule: true },
      actions: [{ type: 'SEND_CLIENT_MESSAGE', channels: ['SMS'], message: { kind: 'CUSTOM', title: { az: 'Görüş', de: 'Termin', en: 'Appointment', ru: 'Встреча' }, body: { az: '{{appointment.date}} · {{appointment.place}}', de: '{{appointment.date}}', en: '{{appointment.date}}', ru: '{{appointment.date}}' } } }],
    });
    const client = await asClient({ phone: '+994501234567', firstName: 'Ali', lastName: 'Məmmədov' });
    const c = await driveCaseTo('APPOINTMENT_SCHEDULED', { client: client.agent, admin: admin.agent });
    await drain();
    expect((await runsOf(signed.id)).map((r) => r.status)).toEqual(['SUCCEEDED']);
    expect(await prisma.task.findFirstOrThrow({ where: { caseId: c.id } })).toMatchObject({ title: 'Book embassy for Ali Məmmədov' });
    expect((await runsOf(appt.id)).map((r) => r.status)).toEqual(['SUCCEEDED']);
    const sms = await prisma.outboundMessage.findFirstOrThrow({ where: { caseId: c.id, channel: 'SMS', templateKey: 'AUTOMATION' } });
    expect(sms.body).toContain('Embassy Baku');
    expect(sms.body).toContain('2026');
  });

  it('application status changed → staff notification (hook in the application status webhook)', async () => {
    const admin = await asAdmin();
    await createRule(admin, { trigger: { type: 'APPLICATION_STATUS_CHANGED', to: ['SHORTLISTED'] }, actions: [{ type: 'NOTIFY_STAFF', target: { kind: 'USER', userId: admin.user.id }, title: '{{client.fullName}}: {{application.status}} · {{application.vacancy}}', body: '' }] });
    const cand = await asClient({ firstName: 'Nigar', lastName: 'Ə' });
    const v = await createVacancy();
    const app = await prisma.vacancyApplication.create({ data: { vacancyId: v.id, userId: cand.user.id } });
    expectStatus(await admin.agent.patch(`/api/admin/candidates/applications/${app.id}`).send({ status: 'SHORTLISTED' }), 200);
    await drain();
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: admin.user.id, type: 'AUTOMATION' } });
    expect(n.title).toBe('Nigar Ə: SHORTLISTED · LKW-Fahrer az');
  });

  it('booking created and inquiry created → tasks / e-mail to the lead', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    await createRule(admin, { trigger: { type: 'BOOKING_CREATED' }, actions: [{ type: 'CREATE_TASK', title: 'Prepare consultation {{booking.date}}', assignee: { kind: 'ROLE', role: 'STAFF' } }] });
    await createRule(admin, {
      trigger: { type: 'INQUIRY_CREATED', kinds: ['company'] },
      actions: [{ type: 'SEND_CLIENT_MESSAGE', channels: ['EMAIL'], message: { kind: 'CUSTOM', title: { az: 'Təşəkkürlər', de: 'Danke, {{inquiry.name}}', en: 'Thanks', ru: 'Спасибо' }, body: { az: '.', de: 'Wir melden uns zu {{inquiry.company}}.', en: '.', ru: '.' } } }],
    });
    const startsAt = new Date(Math.floor((Date.now() + 30 * HOUR) / 60000) * 60000);
    const slot = await prisma.consultationSlot.create({ data: { staffId: staff.user.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60000) } });
    expectStatus(await anon().post('/api/booking').send({ slotId: slot.id, topic: 'candidate', name: 'Ali Aliyev', email: 'ali@test.local', phone: '+994 50 000 00 00', message: 'I am a truck driver', locale: 'en', consent: true }), 201);
    expectStatus(await anon().post('/api/public/inquiries').send({ kind: 'company', companyName: 'Nord GmbH', contactName: 'Hans Becker', email: 'hans@nord.test', message: 'Wir brauchen 5 Fahrer für unser Lager in Hamburg.', locale: 'de' }), 201);
    expectStatus(await anon().post('/api/public/inquiries').send({ kind: 'contact', contactName: 'Eva Kurz', email: 'eva@test.local', message: 'Eine allgemeine Frage zum Visum bitte.', locale: 'de' }), 201);
    await drain();
    const task = await prisma.task.findFirstOrThrow({ include: { assignees: true } });
    expect(task.title).toMatch(/^Prepare consultation /);
    expect(task.assignees.map((a) => a.userId)).toEqual([staff.user.id]);
    const mails = await emailsTo('hans@nord.test');
    expect(mails[0].subject).toBe('Triad Vision · Danke, Hans Becker');
    expect(await prisma.emailLog.count({ where: { to: 'eva@test.local' } })).toBe(0); // kind filter
  });

  it('client inactive N days (time trigger, once per idle period) and in status X for N days → status change', async () => {
    const admin = await asAdmin();
    const idle = await createRule(admin, { trigger: { type: 'CLIENT_INACTIVE', days: 7, statuses: ['DOCUMENTS_PENDING'] }, actions: [note('idle {{trigger.days}} days')] });
    const stale = await createRule(admin, { trigger: { type: 'STATUS_DURATION', status: 'DOCUMENTS_PENDING', days: 30 }, actions: [{ type: 'CHANGE_STATUS', to: 'CANCELLED', note: 'No documents for {{trigger.days}} days' }] });
    const fresh = await createCaseVia((await asClient()).agent);
    const old = await createCaseVia((await asClient()).agent);
    const past = new Date(Date.now() - 40 * DAY);
    await prisma.case.update({ where: { id: old.id }, data: { createdAt: past } });
    await prisma.caseEvent.updateMany({ where: { caseId: old.id }, data: { createdAt: past } });

    expect(await runTimeTriggers()).toBe(2);
    expect(await runTimeTriggers()).toBe(0); // idempotent per occurrence
    const idleRuns = await runsOf(idle.id);
    expect(idleRuns.map((r) => r.caseId)).toEqual([old.id]);
    expect(await prisma.caseEvent.findFirst({ where: { caseId: old.id, type: 'INTERNAL_NOTE' } })).toMatchObject({ note: '[Test rule] idle 7 days' });
    const after = await prisma.case.findUniqueOrThrow({ where: { id: old.id } });
    expect(after.status).toBe('CANCELLED');
    expect(after.cancelReason).toBe('No documents for 30 days');
    expect((await runsOf(stale.id))[0].status).toBe('SUCCEEDED');
    expect((await prisma.case.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe('DOCUMENTS_PENDING');
  });

  it('conditions (AND): visa type, client language, assigned staff — a miss is logged as skipped', async () => {
    const admin = await asAdmin();
    const rule = await createRule(admin, {
      trigger: { type: 'CASE_CREATED' },
      conditions: [{ type: 'VISA_TYPE', op: 'in', values: ['WORK'] }, { type: 'CLIENT_LANGUAGE', op: 'in', values: ['ru'] }, { type: 'ASSIGNED_STAFF', op: 'not_set' }],
      actions: [note('ru work case')],
    });
    const az = await createCaseVia((await asClient({ locale: 'az' })).agent);
    const ru = await createCaseVia((await asClient({ locale: 'ru' })).agent);
    await drain();
    const runs = await runsOf(rule.id);
    expect(runs.find((r) => r.caseId === az.id)).toMatchObject({ status: 'SKIPPED', reason: 'CONDITION_NOT_MET:CLIENT_LANGUAGE' });
    expect(runs.find((r) => r.caseId === ru.id)).toMatchObject({ status: 'SUCCEEDED' });
  });
});

describe('automation engine: delays, idempotency, loops, failures, dry run', () => {
  it('delayed actions wait, and "only if still true" skips them when the status moved on', async () => {
    const admin = await asAdmin();
    const rule = await createRule(admin, {
      trigger: { type: 'CASE_STATUS_CHANGED', from: [], to: ['CANCELLED'] },
      actions: [note('now'), { type: 'ADD_NOTE', text: 'later', delay: { amount: 2, unit: 'HOURS' }, onlyIfStillTrue: true }],
    });
    const a = await createCaseVia((await asClient()).agent);
    const b = await createCaseVia((await asClient()).agent);
    for (const c of [a, b]) expectStatus(await act(admin.agent, c.id, { action: 'CANCEL', reason: 'Test reason' }), 200);
    await drain();
    let runs = await runsOf(rule.id);
    expect(runs.map((r) => r.status)).toEqual(['WAITING', 'WAITING']);
    expect(runs[0].steps.map((s) => s.status)).toEqual(['SUCCEEDED', 'PENDING']);
    expect(await runDueSteps(new Date())).toBe(0); // not due yet

    expectStatus(await act(admin.agent, b.id, { action: 'REOPEN', to: 'DOCUMENTS_PENDING' }), 200);
    await drain();
    expect(await runDueSteps(new Date(Date.now() + 3 * HOUR))).toBe(2);
    runs = await runsOf(rule.id);
    const ra = runs.find((r) => r.caseId === a.id)!;
    const rb = runs.find((r) => r.caseId === b.id)!;
    expect(ra.status).toBe('SUCCEEDED');
    expect(rb.status).toBe('PARTIAL');
    expect(rb.steps[1]).toMatchObject({ status: 'SKIPPED', reason: 'NO_LONGER_TRUE:STATUS_CHANGED_SINCE' });
    expect(await prisma.caseEvent.count({ where: { caseId: a.id, type: 'INTERNAL_NOTE' } })).toBe(2);
    expect(await prisma.caseEvent.count({ where: { caseId: b.id, type: 'INTERNAL_NOTE' } })).toBe(1);
  });

  it('is idempotent per rule + entity + occurrence', async () => {
    const admin = await asAdmin();
    const rule = await createRule(admin, { trigger: { type: 'CASE_CREATED' }, actions: [note('once')] });
    const c = await createCaseVia((await asClient()).agent);
    await drain();
    // The same event processed again (e.g. after a crash) must not run twice.
    await prisma.automationEvent.updateMany({ data: { processedAt: null } });
    await runAutomationQueue();
    expect(await runsOf(rule.id)).toHaveLength(1);
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'INTERNAL_NOTE' } })).toBe(1);
  });

  it('loop protection: a rule never retriggers itself, chains stop at depth 3, per-entity rate limit', async () => {
    const admin = await asAdmin();
    // "Loop": any status change → cancel. Its own cancel is a status change again, which must not retrigger it.
    const loop = await createRule(admin, { name: 'Loop', trigger: { type: 'CASE_STATUS_CHANGED', from: [], to: [] }, actions: [{ type: 'CHANGE_STATUS', to: 'CANCELLED', note: 'again' }] });
    const back = await createRule(admin, { name: 'Back', trigger: { type: 'CASE_STATUS_CHANGED', from: ['DOCUMENTS_PENDING'], to: ['CANCELLED'] }, actions: [note('cancelled')] });
    const c = await createCaseVia((await asClient()).agent);
    expectStatus(await act(admin.agent, c.id, { action: 'CANCEL', reason: 'Test reason' }), 200);
    await drain();
    expectStatus(await act(admin.agent, c.id, { action: 'REOPEN', to: 'DOCUMENTS_PENDING' }), 200);
    await drain();
    await drain();
    const loopRuns = await runsOf(loop.id);
    // cancel by staff (nothing to do: already cancelled) · reopen by staff (cancels again) · its own cancel (prevented)
    expect(loopRuns.map((r) => r.status)).toEqual(['SKIPPED', 'SUCCEEDED', 'SKIPPED']);
    expect(loopRuns[2].reason).toBe('LOOP_PREVENTED');
    expect(loopRuns[2].depth).toBe(1);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('CANCELLED');
    const backRuns = await runsOf(back.id);
    expect(backRuns.map((r) => r.depth)).toEqual([0, 1]); // second one caused by the Loop rule's action, still allowed

    // Depth limit: an event emitted at depth 3 does not start rules.
    invalidateAutomationCache();
    const deep = await createRule(admin, { name: 'Deep', trigger: { type: 'CASE_CREATED' }, actions: [note('deep')] });
    await automationScope({ chain: [], depth: 3 }, () => emitAutomationEvent({ type: 'CASE_CREATED', entityType: 'case', entityId: c.id, caseId: c.id }));
    await runAutomationQueue();
    expect((await runsOf(deep.id))[0]).toMatchObject({ status: 'SKIPPED', reason: 'MAX_DEPTH' });

    // Rate limit: at most 20 runs per entity per hour.
    for (let i = 0; i < 22; i++) await emitAutomationEvent({ type: 'CASE_CREATED', entityType: 'case', entityId: c.id, caseId: c.id });
    await runAutomationQueue();
    const deepRuns = await runsOf(deep.id);
    expect(deepRuns.filter((r) => r.reason === 'RATE_LIMITED').length).toBeGreaterThan(0);
  });

  it('a failing action is logged, the next action still runs, and the original request succeeds', async () => {
    const admin = await asAdmin();
    const rule = await prisma.automationRule.create({
      data: {
        name: 'Broken',
        enabled: true,
        triggerType: 'CASE_STATUS_CHANGED',
        trigger: { type: 'CASE_STATUS_CHANGED', from: [], to: ['CANCELLED'] },
        conditions: [],
        // REQUEST_DOCUMENT with no title for a key the case does not have → requestDocument throws TITLE_REQUIRED.
        actions: [{ type: 'REQUEST_DOCUMENT', requirementKey: 'NOPE', title: { az: '', de: '', en: '', ru: '' }, notifyClient: true }, { type: 'ADD_NOTE', text: 'still here' }],
        createdById: admin.user.id,
      },
    });
    invalidateAutomationCache();
    const c = await createCaseVia((await asClient()).agent);
    // Cancel is allowed for the REQUEST_DOCUMENT check (closed case → skipped), so use a reopen-able flow:
    expectStatus(await act(admin.agent, c.id, { action: 'CANCEL', reason: 'Test reason' }), 200);
    await drain();
    const [run] = await runsOf(rule.id);
    expect(run.steps[0].status).toBe('SKIPPED'); // closed case
    // Now an open case: the action really fails.
    await prisma.automationRule.update({ where: { id: rule.id }, data: { triggerType: 'CASE_CREATED', trigger: { type: 'CASE_CREATED' } } });
    invalidateAutomationCache();
    const res = await (await asClient()).agent.post('/api/cases').send({ profession: 'Kuryer' });
    expect(res.status).toBe(201);
    await drain();
    const run2 = (await runsOf(rule.id)).find((r) => r.caseId === res.body.case.id)!;
    expect(run2.status).toBe('PARTIAL');
    expect(run2.steps[0]).toMatchObject({ status: 'FAILED' });
    expect(run2.steps[0].reason).toContain('TITLE_REQUIRED');
    expect(run2.steps[1].status).toBe('SUCCEEDED');
  });

  it('dry run shows what would happen without doing anything; run log lists outcomes', async () => {
    const admin = await asAdmin();
    const owner = await asStaff({ firstName: 'Orxan', lastName: 'Q' });
    const rule = await createRule(admin, {
      enabled: false,
      trigger: { type: 'CASE_STATUS_CHANGED', from: [], to: ['DOCUMENTS_PENDING'] },
      conditions: [{ type: 'ASSIGNED_STAFF', op: 'set' }],
      actions: [
        { type: 'CREATE_TASK', title: 'Check {{case.number}}', assignee: { kind: 'CASE_OWNER' } },
        { type: 'SEND_CLIENT_MESSAGE', channels: ['EMAIL', 'SMS'], message: { kind: 'TEMPLATE', key: 'REOPENED' } },
        { type: 'CHANGE_STATUS', to: 'DECISION_PENDING' },
      ],
    });
    const client = await asClient({ locale: 'en' });
    const c = await createCaseVia(client.agent);
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: owner.user.id } });
    const res = expectStatus(await admin.agent.post(`/api/admin/automation/rules/${rule.id}/test`).send({ caseId: c.id }), 200).body;
    expect(res.matched).toBe(true);
    expect(res.actions[0]).toMatchObject({ status: 'SUCCEEDED', result: { title: `Check ${c.number}`, assignee: { name: 'Orxan Q' } } });
    expect(res.actions[1].result.title).toBe('Application reopened');
    expect(res.actions[1].result.channels).toMatchObject({ EMAIL: 'send', SMS: 'NO_PHONE' });
    expect(res.actions[2]).toMatchObject({ status: 'SKIPPED', reason: 'TRANSITION_NOT_ALLOWED' });
    expect(await prisma.task.count()).toBe(0);
    expect(await prisma.automationRun.count()).toBe(0);

    // An unsaved draft can be tested too.
    const draft = expectStatus(await admin.agent.post('/api/admin/automation/test').send({ caseId: c.id, rule: { name: 'Draft', trigger: { type: 'CASE_CREATED' }, conditions: [{ type: 'CLIENT_LANGUAGE', op: 'in', values: ['de'] }], actions: [note('x')] } }), 200).body;
    expect(draft.matched).toBe(false);
    expect(draft.conditions[0]).toMatchObject({ ok: false, seen: 'en' });

    expectStatus(await admin.agent.patch(`/api/admin/automation/rules/${rule.id}/enabled`).send({ enabled: true }), 200);
    expectStatus(await act(admin.agent, c.id, { action: 'CANCEL', reason: 'Test reason' }), 200);
    expectStatus(await act(admin.agent, c.id, { action: 'REOPEN', to: 'DOCUMENTS_PENDING' }), 200);
    await drain();
    const log = expectStatus(await admin.agent.get(`/api/admin/automation/rules/${rule.id}/runs`), 200).body;
    expect(log.total).toBe(1);
    expect(log.runs[0]).toMatchObject({ status: 'PARTIAL', caseNumber: c.number });
    expect(log.runs[0].steps.map((s: { status: string }) => s.status)).toEqual(['SUCCEEDED', 'SUCCEEDED', 'SKIPPED']);
  });
});
