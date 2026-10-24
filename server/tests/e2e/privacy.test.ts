import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { emailsTo, prisma, waitFor } from '../helpers/db';
import { ADMIN_INBOX } from '../helpers/testEnv';
import { createCaseVia, expectStatus, uploadRequired } from '../helpers/workflow';
import { runPrivacyDeadlines } from '../../src/jobs/privacy.js';

const DAY = 24 * 60 * 60 * 1000;

describe('GET /api/privacy', () => {
  it('requires a session', async () => {
    expect((await anon().get('/api/privacy')).status).toBe(401);
  });

  it('returns consents, history, requests, overview, policy version and retention', async () => {
    const c = await asClient();
    const res = expectStatus(await c.agent.get('/api/privacy'), 200);
    expect(res.body.policyVersion).toBeTruthy();
    expect(res.body.retention).toEqual({ months: 12, includeMessages: false });
    expect(res.body.consents.WHATSAPP.granted).toBe(true);
    expect(res.body.consents.SMS.granted).toBe(true);
    expect(res.body.consents.MARKETING_EMAIL.granted).toBe(false);
    expect(res.body.consents.PASSPORT_OCR.granted).toBeNull();
    expect(res.body.history).toEqual([]);
    expect(res.body.requests).toEqual([]);
    expect(res.body.overview).toMatchObject({ cases: 0, documents: 0, messages: 0, translationOrders: 0, devices: 0 });
    expect(res.body.overview.sessions).toBeGreaterThanOrEqual(1);
  });
});

describe('PUT /api/privacy/consents', () => {
  it('logs only changed values and keeps the user fields in sync', async () => {
    const c = await asClient();
    const res = expectStatus(await c.agent.put('/api/privacy/consents').send({ WHATSAPP: false, SMS: true, MARKETING_EMAIL: true }), 200);
    expect(res.body.changed).toBe(2); // SMS was already on
    const u = await prisma.user.findUniqueOrThrow({ where: { id: c.user.id } });
    expect(u.whatsappOptIn).toBe(false);
    expect(u.smsNotifications).toBe(true);
    expect(u.emailNotifications).toBe(true); // MARKETING_EMAIL is consent-only
    const rows = await prisma.consentRecord.findMany({ where: { userId: c.user.id }, orderBy: { type: 'asc' } });
    expect(rows.map((r) => [r.type, r.granted, r.source])).toEqual([
      ['MARKETING_EMAIL', true, 'PRIVACY_CENTER'],
      ['WHATSAPP', false, 'PRIVACY_CENTER'],
    ]);
    expect(res.body.consents.MARKETING_EMAIL).toMatchObject({ granted: true, source: 'PRIVACY_CENTER' });
    expect(res.body.consents.MARKETING_EMAIL.at).toBeTruthy();

    // Same values again: nothing new in the log.
    expect(expectStatus(await c.agent.put('/api/privacy/consents').send({ WHATSAPP: false, MARKETING_EMAIL: true }), 200).body.changed).toBe(0);
    // Withdrawal is logged too (append-only).
    expectStatus(await c.agent.put('/api/privacy/consents').send({ MARKETING_EMAIL: false, EMPLOYER_SHARING: true }), 200);
    expect(await prisma.consentRecord.count({ where: { userId: c.user.id } })).toBe(4);
    const state = expectStatus(await c.agent.get('/api/privacy'), 200).body;
    expect(state.history).toHaveLength(4);
    expect(state.consents.MARKETING_EMAIL.granted).toBe(false);
    expect(state.consents.EMPLOYER_SHARING.granted).toBe(true);
  });

  it('rejects unknown consent types', async () => {
    const c = await asClient();
    expectStatus(await c.agent.put('/api/privacy/consents').send({ PRIVACY_POLICY: false }), 400);
  });
});

describe('Privacy requests (client)', () => {
  it('creates a request with a 30-day deadline, notifies admins and confirms to the user', async () => {
    const admin = await asAdmin();
    const c = await asClient({ locale: 'de' });
    const res = expectStatus(await c.agent.post('/api/privacy/requests').send({ type: 'RESTRICTION', message: 'Bitte nicht für Werbung nutzen' }), 201);
    const r = await prisma.privacyRequest.findUniqueOrThrow({ where: { id: res.body.item.id } });
    expect(r).toMatchObject({ userId: c.user.id, email: c.user.email, type: 'RESTRICTION', status: 'OPEN' });
    expect(Math.round((r.dueAt.getTime() - r.createdAt.getTime()) / DAY)).toBe(30);
    expect(await prisma.notification.count({ where: { userId: admin.user.id, link: `/admin/privacy-requests/${r.id}` } })).toBe(1);
    await emailsTo(ADMIN_INBOX);
    const mails = await emailsTo(c.user.email);
    expect(mails[0].subject).toContain('Datenschutzanfrage');
  });

  it('allows only one open request per type', async () => {
    const c = await asClient();
    expectStatus(await c.agent.post('/api/privacy/requests').send({ type: 'OBJECTION' }), 201);
    expect(expectStatus(await c.agent.post('/api/privacy/requests').send({ type: 'OBJECTION' }), 409).body.error).toBe('REQUEST_ALREADY_OPEN');
    expectStatus(await c.agent.post('/api/privacy/requests').send({ type: 'RESTRICTION' }), 201);
  });

  it('rectification needs a message; deletion needs the current password', async () => {
    const c = await asClient();
    expect(expectStatus(await c.agent.post('/api/privacy/requests').send({ type: 'RECTIFICATION' }), 400).body.error).toBe('MESSAGE_REQUIRED');
    expect(expectStatus(await c.agent.post('/api/privacy/requests').send({ type: 'DELETION' }), 400).body.error).toBe('PASSWORD_REQUIRED');
    expect(expectStatus(await c.agent.post('/api/privacy/requests').send({ type: 'DELETION', currentPassword: 'wrong-pass1' }), 400).body.error).toBe('WRONG_PASSWORD');
    expectStatus(await c.agent.post('/api/privacy/requests').send({ type: 'DELETION', currentPassword: c.password }), 201);
    expectStatus(await c.agent.post('/api/privacy/requests').send({ type: 'EXPORT' }), 400);
  });

  it('cancels own OPEN requests only', async () => {
    const c = await asClient();
    const other = await asClient();
    const id = expectStatus(await c.agent.post('/api/privacy/requests').send({ type: 'OBJECTION' }), 201).body.item.id;
    expectStatus(await other.agent.post(`/api/privacy/requests/${id}/cancel`), 404);
    expect(expectStatus(await c.agent.post(`/api/privacy/requests/${id}/cancel`), 200).body.item.status).toBe('CANCELLED');
    expect(expectStatus(await c.agent.post(`/api/privacy/requests/${id}/cancel`), 409).body.error).toBe('REQUEST_NOT_CANCELLABLE');
    // A new one of the same type is allowed after cancelling.
    expectStatus(await c.agent.post('/api/privacy/requests').send({ type: 'OBJECTION' }), 201);
  });
});

describe('GET /api/privacy/export', () => {
  it('downloads the export, records a completed EXPORT request and includes the new sections', async () => {
    const c = await asClient();
    await c.agent.put('/api/privacy/consents').send({ MARKETING_EMAIL: true });
    const created = await createCaseVia(c.agent);
    await uploadRequired(c.agent, created.id, 'INITIAL');

    const res = expectStatus(await c.agent.get('/api/privacy/export'), 200);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="triad-vision-my-data-\d{4}-\d{2}-\d{2}\.json"$/);
    const data = typeof res.body === 'object' && Object.keys(res.body).length ? res.body : JSON.parse(res.text);
    expect(data.profile.id).toBe(c.user.id);
    expect(data.cases).toHaveLength(1);
    expect(data.consents.map((x: { type: string }) => x.type)).toEqual(['MARKETING_EMAIL']);
    expect(data.privacyRequests).toEqual([expect.objectContaining({ type: 'EXPORT', status: 'COMPLETED' })]);
    expect(data.translationOrders).toEqual([]);
    expect(data.interviews).toEqual([]);
    expect(data.vacancyApplications).toEqual([]);
    expect(res.text).not.toContain('passwordHash');

    const reqs = await prisma.privacyRequest.findMany({ where: { userId: c.user.id } });
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ type: 'EXPORT', status: 'COMPLETED' });
    expect(reqs[0].completedAt).not.toBeNull();

    // The account export shares the builder: same new sections.
    const acc = expectStatus(await c.agent.get('/api/account/export'), 200);
    const accData = typeof acc.body === 'object' && Object.keys(acc.body).length ? acc.body : JSON.parse(acc.text);
    expect(accData.consents).toHaveLength(1);
    expect(accData.privacyRequests).toHaveLength(1);
  });
});

describe('Admin privacy API — permissions', () => {
  it('STAFF and clients get 403; ADMIN can list; only SUPER_ADMIN executes deletions', async () => {
    const staff = await asStaff();
    const client = await asClient();
    const admin = await asAdmin();
    expectStatus(await staff.agent.get('/api/admin/privacy/requests'), 403);
    expectStatus(await staff.agent.get('/api/admin/privacy/consents'), 403);
    expectStatus(await client.agent.get('/api/admin/privacy/requests'), 403);
    expectStatus(await admin.agent.get('/api/admin/privacy/requests'), 200);

    const id = expectStatus(await client.agent.post('/api/privacy/requests').send({ type: 'DELETION', currentPassword: client.password }), 201).body.item.id;
    expectStatus(await admin.agent.post(`/api/admin/privacy/requests/${id}/status`).send({ status: 'IN_PROGRESS' }), 200);
    expectStatus(await admin.agent.post(`/api/admin/privacy/requests/${id}/execute-deletion`).send({ confirmEmail: client.user.email }), 403);
    expect(await prisma.user.findUnique({ where: { id: client.user.id } })).not.toBeNull();
  });
});

describe('Admin privacy API — requests', () => {
  it('lists with counts and filters, shows the detail with overview and deletion preview', async () => {
    const admin = await asAdmin();
    const c = await asClient();
    await c.agent.post('/api/privacy/requests').send({ type: 'OBJECTION' });
    const delId = expectStatus(await c.agent.post('/api/privacy/requests').send({ type: 'DELETION', currentPassword: c.password }), 201).body.item.id;
    await prisma.privacyRequest.update({ where: { id: delId }, data: { dueAt: new Date(Date.now() - DAY) } });

    const list = expectStatus(await admin.agent.get('/api/admin/privacy/requests'), 200).body;
    expect(list.items).toHaveLength(2);
    expect(list.counts.byStatus.OPEN).toBe(2);
    expect(list.counts.overdue).toBe(1);
    expect(list.items[0]).toMatchObject({ id: delId, overdue: true });
    const overdue = expectStatus(await admin.agent.get('/api/admin/privacy/requests?overdue=1'), 200).body;
    expect(overdue.items.map((i: { id: string }) => i.id)).toEqual([delId]);
    expect(expectStatus(await admin.agent.get('/api/admin/privacy/requests?type=OBJECTION'), 200).body.items).toHaveLength(1);

    const detail = expectStatus(await admin.agent.get(`/api/admin/privacy/requests/${delId}`), 200).body;
    expect(detail.subject.id).toBe(c.user.id);
    expect(detail.overview).toMatchObject({ cases: 0 });
    expect(detail.deletionPreview.counts).toMatchObject({ cases: 0 });
  });

  it('status changes: rejection needs a note, closed requests are final, deletion completes only via execute', async () => {
    const admin = await asAdmin();
    const c = await asClient();
    const id = expectStatus(await c.agent.post('/api/privacy/requests').send({ type: 'OBJECTION' }), 201).body.item.id;
    expect(expectStatus(await admin.agent.post(`/api/admin/privacy/requests/${id}/status`).send({ status: 'REJECTED' }), 400).body.error).toBe('DECISION_NOTE_REQUIRED');
    const done = expectStatus(await admin.agent.post(`/api/admin/privacy/requests/${id}/status`).send({ status: 'COMPLETED', decisionNote: 'Erledigt' }), 200).body.item;
    expect(done).toMatchObject({ status: 'COMPLETED', decisionNote: 'Erledigt' });
    expect(expectStatus(await admin.agent.post(`/api/admin/privacy/requests/${id}/status`).send({ status: 'OPEN' }), 409).body.error).toBe('REQUEST_CLOSED');
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: c.user.email, subject: { contains: 'icra edildi' } } }));

    const delId = expectStatus(await c.agent.post('/api/privacy/requests').send({ type: 'DELETION', currentPassword: c.password }), 201).body.item.id;
    expect(expectStatus(await admin.agent.post(`/api/admin/privacy/requests/${delId}/status`).send({ status: 'COMPLETED' }), 409).body.error).toBe('USE_EXECUTE_DELETION');
  });

  it('execute-deletion deletes the account via deleteUserAccount and keeps the request as proof', async () => {
    const sa = await asSuperAdmin();
    const c = await asClient();
    const created = await createCaseVia(c.agent);
    await uploadRequired(c.agent, created.id, 'INITIAL');
    const id = expectStatus(await c.agent.post('/api/privacy/requests').send({ type: 'DELETION', currentPassword: c.password }), 201).body.item.id;

    // Must be IN_PROGRESS first, and the email must be confirmed.
    expect(expectStatus(await sa.agent.post(`/api/admin/privacy/requests/${id}/execute-deletion`).send({ confirmEmail: c.user.email }), 409).body.error).toBe('REQUEST_NOT_IN_PROGRESS');
    expectStatus(await sa.agent.post(`/api/admin/privacy/requests/${id}/status`).send({ status: 'IN_PROGRESS' }), 200);
    expect(expectStatus(await sa.agent.post(`/api/admin/privacy/requests/${id}/execute-deletion`).send({ confirmEmail: 'x@test.local' }), 400).body.error).toBe('CONFIRMATION_MISMATCH');

    const res = expectStatus(await sa.agent.post(`/api/admin/privacy/requests/${id}/execute-deletion`).send({ confirmEmail: c.user.email }), 200);
    expect(res.body.counts.cases).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: c.user.id } })).toBeNull();
    expect(await prisma.case.count({ where: { id: created.id } })).toBe(0);
    const r = await prisma.privacyRequest.findUniqueOrThrow({ where: { id } });
    expect(r).toMatchObject({ status: 'COMPLETED', userId: null, email: c.user.email, handledById: sa.user.id });
    expect(await prisma.auditLog.count({ where: { action: 'USER_DELETED', target: `user:${c.user.id}` } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'PRIVACY_DELETION_EXECUTED' } })).toBe(1);
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: c.user.email, subject: { contains: 'icra edildi' } } }));

    // Non-deletion requests cannot be executed.
    const c2 = await asClient();
    const objId = expectStatus(await c2.agent.post('/api/privacy/requests').send({ type: 'OBJECTION' }), 201).body.item.id;
    expect(expectStatus(await sa.agent.post(`/api/admin/privacy/requests/${objId}/execute-deletion`).send({ confirmEmail: c2.user.email }), 400).body.error).toBe('NOT_A_DELETION_REQUEST');
  });
});

describe('Admin consent log', () => {
  it('filters by email / type / date and exports CSV', async () => {
    const admin = await asAdmin();
    const a = await asClient({ email: 'ayla@test.local' });
    const b = await asClient();
    await a.agent.put('/api/privacy/consents').send({ MARKETING_EMAIL: true, WHATSAPP: false });
    await b.agent.put('/api/privacy/consents').send({ MARKETING_EMAIL: true });

    expect(expectStatus(await admin.agent.get('/api/admin/privacy/consents'), 200).body.total).toBe(3);
    expect(expectStatus(await admin.agent.get('/api/admin/privacy/consents?email=ayla'), 200).body.items).toHaveLength(2);
    expect(expectStatus(await admin.agent.get('/api/admin/privacy/consents?type=MARKETING_EMAIL'), 200).body.items).toHaveLength(2);
    expect(expectStatus(await admin.agent.get('/api/admin/privacy/consents?to=2000-01-01'), 200).body.items).toHaveLength(0);

    const csv = expectStatus(await admin.agent.get('/api/admin/privacy/consents?format=csv&email=ayla'), 200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
    // Consent register: anonymous cookie visitors and the accepted legal text version are part of the export.
    expect(lines[0]).toBe('createdAt,email,userId,visitorId,name,type,granted,version,legalDocumentId,documentKind,source,ip,userAgent');
    expect(lines).toHaveLength(3);
    expect(csv.text).toContain('"ayla@test.local"');
  });
});

describe('privacy-deadlines job', () => {
  it('reports due-soon and overdue open requests once per request per day', async () => {
    const admin = await asAdmin();
    const c = await asClient();
    const now = new Date();
    const mk = (type: 'OBJECTION' | 'RESTRICTION' | 'RECTIFICATION' | 'DELETION', dueAt: Date, status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' = 'OPEN') =>
      prisma.privacyRequest.create({ data: { userId: c.user.id, email: c.user.email, type, status, dueAt } });
    const overdue = await mk('OBJECTION', new Date(now.getTime() - 2 * DAY));
    const soon = await mk('RESTRICTION', new Date(now.getTime() + 3 * DAY), 'IN_PROGRESS');
    await mk('RECTIFICATION', new Date(now.getTime() + 20 * DAY));
    await mk('DELETION', new Date(now.getTime() - DAY), 'COMPLETED');

    expect(await runPrivacyDeadlines(now)).toBe(2);
    expect(await runPrivacyDeadlines(new Date(now.getTime() + 60 * 1000))).toBe(0);
    const links = (await prisma.notification.findMany({ where: { userId: admin.user.id, type: 'STAFF' } })).map((n) => n.link).sort();
    expect(links).toEqual([`/admin/privacy-requests/${overdue.id}`, `/admin/privacy-requests/${soon.id}`].sort());
    // Next day: reported again.
    expect(await runPrivacyDeadlines(new Date(now.getTime() + DAY))).toBe(2);
  });
});
