import { Prisma } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, asAdmin, asClient, asStaff, asSuperAdmin, ORIGIN } from '../helpers/api';
import { prisma, settle } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { createCaseVia } from '../helpers/workflow';
import { asCompany } from './vacancies.fixtures';
import { flushImpersonationLogs } from '../../src/lib/privacy/impersonation.js';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head';

/** Admin browser with both cookies: the admin's own session and the impersonation token. */
const viewing = (adminToken: string, imp: string) => {
  const call = (method: Method) => (url: string) =>
    request(app)[method](url).set('Cookie', `tv_session=${adminToken}; tv_imp=${imp}`).set('Origin', ORIGIN);
  return { get: call('get'), post: call('post'), put: call('put'), patch: call('patch'), delete: call('delete'), head: call('head') };
};

/**
 * Row count and latest updatedAt of every table, except the ones a view may write: its own bookkeeping
 * (ImpersonationSession / ImpersonationLog), the audit trail (checked separately: never the client as actor)
 * and Session (the admin's own lastSeenAt touch; the client's session is asserted untouched elsewhere).
 * CityCost and Setting are process-wide shared caches (city-cost seed, CBAR rate, real-salary snapshot…) that the
 * first visitor of an empty test database fills via outsideImpersonation — never data of the viewed client.
 */
const MAY_CHANGE = new Set(['ImpersonationSession', 'ImpersonationLog', 'AuditLog', 'Session', 'CityCost', 'Setting']);
const dbSnapshot = async () => {
  const out: Record<string, { count: number; updatedAt: number | null }> = {};
  for (const m of Prisma.dmmf.datamodel.models) {
    if (MAY_CHANGE.has(m.name)) continue;
    const delegate = (prisma as unknown as Record<string, { count: () => Promise<number>; aggregate: (a: unknown) => Promise<{ _max: Record<string, Date | null> }> }>)[m.name[0].toLowerCase() + m.name.slice(1)];
    const hasUpdatedAt = m.fields.some((f) => f.name === 'updatedAt' && f.type === 'DateTime');
    out[m.name] = {
      count: await delegate.count(),
      updatedAt: hasUpdatedAt ? ((await delegate.aggregate({ _max: { updatedAt: true } }))._max.updatedAt?.getTime() ?? null) : null,
    };
  }
  return out;
};

const impCookie = (res: request.Response) => {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('tv_imp='));
  return raw ? { value: raw.split(';')[0].slice('tv_imp='.length), raw } : null;
};

const start = async (admin: Awaited<ReturnType<typeof asAdmin>>, userId: string, body: Record<string, unknown> = { reason: 'SUPPORT_REQUEST' }) => {
  const res = await admin.agent.post(`/api/admin/impersonate/${userId}`).send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const c = impCookie(res);
  expect(c).not.toBeNull();
  return { res, imp: c!.value, as: viewing(admin.token, c!.value) };
};

describe('view as client (impersonation)', () => {
  it('starts a read-only view: the portal sees the client, the admin is recorded as actor', async () => {
    const admin = await asAdmin({ firstName: 'Aysel', lastName: 'Admin' });
    const client = await asClient({ firstName: 'Ruslan', lastName: 'Client' });
    const c = await createCaseVia(client.agent);

    const { res, as } = await start(admin, client.user.id, { reason: 'BUG_CHECK', note: 'Upload button', returnTo: `/admin/users/${client.user.id}` });
    expect(res.body).toMatchObject({ ok: true, landing: '/account', impersonation: { reason: 'BUG_CHECK', target: { id: client.user.id } } });
    expect(impCookie(res)!.raw).toMatch(/HttpOnly/i);
    const ttl = new Date(res.body.impersonation.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(29 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(30 * 60 * 1000);

    const me = await as.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.headers['x-impersonating']).toBe('1');
    expect(me.body.user).toMatchObject({ id: client.user.id, role: 'CLIENT', firstName: 'Ruslan' });
    expect(me.body.impersonation).toMatchObject({ reason: 'BUG_CHECK', returnTo: `/admin/users/${client.user.id}`, admin: { id: admin.user.id, firstName: 'Aysel' } });

    // The client's own data, exactly as the client sees it.
    const cases = await as.get('/api/cases');
    expect(cases.status).toBe(200);
    expect(cases.body.cases.map((x: { id: string }) => x.id)).toEqual([c.id]);
    expect((await as.get(`/api/cases/${c.id}`)).status).toBe(200);

    const started = await prisma.auditLog.findFirst({ where: { action: 'IMPERSONATION_STARTED' } });
    expect(started).toMatchObject({ actorId: admin.user.id, target: `user:${client.user.id}` });
    expect(started!.details).toMatchObject({ reason: 'BUG_CHECK', note: 'Upload button', targetRole: 'CLIENT' });

    // The admin's own session is untouched: without the extra cookie the admin is the admin.
    expect((await admin.agent.get('/api/admin/dashboard')).status).toBe(200);
  });

  it('only ADMIN+ may start, only CLIENT / COMPANY users can be viewed, a reason is required', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const superAdmin = await asSuperAdmin();
    const client = await asClient();
    const otherStaff = await asStaff();

    expect((await staff.agent.post(`/api/admin/impersonate/${client.user.id}`).send({ reason: 'SUPPORT_REQUEST' })).status).toBe(403);
    expect((await client.agent.post(`/api/admin/impersonate/${client.user.id}`).send({ reason: 'SUPPORT_REQUEST' })).status).toBe(403);
    expect((await request(app).post(`/api/admin/impersonate/${client.user.id}`).set('Origin', ORIGIN).send({ reason: 'SUPPORT_REQUEST' })).status).toBe(401);

    const toStaff = await admin.agent.post(`/api/admin/impersonate/${otherStaff.user.id}`).send({ reason: 'SUPPORT_REQUEST' });
    expect(toStaff.status).toBe(400);
    expect(toStaff.body.error).toBe('NOT_IMPERSONATABLE');
    const toAdmin = await superAdmin.agent.post(`/api/admin/impersonate/${admin.user.id}`).send({ reason: 'SUPPORT_REQUEST' });
    expect(toAdmin.body.error).toBe('NOT_IMPERSONATABLE');

    expect((await admin.agent.post(`/api/admin/impersonate/${client.user.id}`).send({})).status).toBe(400);
    expect((await admin.agent.post(`/api/admin/impersonate/${client.user.id}`).send({ reason: 'OTHER' })).status).toBe(400);
    expect((await admin.agent.post(`/api/admin/impersonate/${client.user.id}`).send({ reason: 'SUPPORT_REQUEST', returnTo: 'https://evil.example' })).status).toBe(400);
    expect((await admin.agent.post('/api/admin/impersonate/nope').send({ reason: 'SUPPORT_REQUEST' })).status).toBe(404);

    const inactive = await createUser({ role: 'CLIENT', isActive: false });
    expect((await admin.agent.post(`/api/admin/impersonate/${inactive.user.id}`).send({ reason: 'SUPPORT_REQUEST' })).body.error).toBe('USER_INACTIVE');

    // Bearer (mobile) sessions cannot start a cookie-bound view.
    const mobile = await createUser({ role: 'ADMIN', client: 'mobile' });
    const viaBearer = await request(app).post(`/api/admin/impersonate/${client.user.id}`).set('Authorization', `Bearer ${mobile.token}`).send({ reason: 'SUPPORT_REQUEST' });
    expect(viaBearer.body.error).toBe('WEB_SESSION_REQUIRED');

    await start(superAdmin, client.user.id, { reason: 'OTHER', note: 'Phone call from client' });
  });

  it('rejects every mutating method with 403 IMPERSONATION_READ_ONLY and changes nothing', async () => {
    const admin = await asAdmin();
    const client = await asClient({ firstName: 'Original' });
    const c = await createCaseVia(client.agent);
    const n = await prisma.notification.create({ data: { userId: client.user.id, type: 'INFO', title: 't', body: 'b' } });
    const { as } = await start(admin, client.user.id);

    const calls: [Method, string, object?][] = [
      ['patch', '/api/auth/me', { firstName: 'Changed' }],
      ['post', '/api/cases', { profession: 'Aşpaz' }],
      ['post', `/api/cases/${c.id}/messages`, { body: 'hello from the admin' }],
      ['post', `/api/cases/${c.id}/messages/read`, {}],
      ['post', `/api/cases/${c.id}/typing`, {}],
      ['put', '/api/privacy/consents', { MARKETING_EMAIL: true }],
      ['post', '/api/privacy/requests', { type: 'OBJECTION', message: 'please stop' }],
      ['post', `/api/notifications/${n.id}/read`, {}],
      ['post', '/api/notifications/read-all', {}],
      ['delete', `/api/notifications/${n.id}`],
      ['post', '/api/account/delete-request', {}],
      ['put', '/api/cv', {}],
      ['patch', '/api/account/passport', { passportExpiry: '2030-01-01' }],
      ['post', '/api/admin/impersonate/someone', { reason: 'SUPPORT_REQUEST' }],
      ['post', '/api/auth/2fa/setup', {}],
      ['post', '/api/devices', { token: 'ExponentPushToken[abc]', platform: 'ios' }],
    ];
    for (const [method, url, body] of calls) {
      const res = await (body ? as[method](url).send(body) : as[method](url));
      expect(res.status, `${method.toUpperCase()} ${url}`).toBe(403);
      expect(res.body.error, `${method.toUpperCase()} ${url}`).toBe('IMPERSONATION_READ_ONLY');
    }

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } });
    expect(fresh.firstName).toBe('Original');
    expect(await prisma.case.count({ where: { clientId: client.user.id } })).toBe(1);
    expect(await prisma.caseMessage.count({ where: { caseId: c.id } })).toBe(0);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt).toBeNull();
    expect(await prisma.privacyRequest.count()).toBe(0);
    expect(await prisma.pushDevice.count()).toBe(0);
  });

  it('blocks GETs with side effects and never notifies, mails or touches read receipts / lastSeen', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const staff = await asStaff();
    // A staff message the client has not read yet, and a phone of the client.
    const msg = await prisma.caseMessage.create({ data: { caseId: c.id, authorId: staff.user.id, body: 'Please upload your passport' } });
    const device = await prisma.pushDevice.create({ data: { userId: client.user.id, token: 'ExponentPushToken[imp-test]', platform: 'ios', lastSeenAt: new Date('2026-01-01T00:00:00Z') } });
    const clientSession = await prisma.session.findFirstOrThrow({ where: { userId: client.user.id } });
    await prisma.session.update({ where: { id: clientSession.id }, data: { lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) } });
    const before = await prisma.session.findUniqueOrThrow({ where: { id: clientSession.id } });
    await settle();
    const counts = async () => ({
      notifications: await prisma.notification.count(),
      emails: await prisma.emailLog.count(),
      outbound: await prisma.outboundMessage.count(),
      privacy: await prisma.privacyRequest.count(),
      documents: await prisma.document.count(),
    });
    const base = await counts();

    const { as } = await start(admin, client.user.id);

    const exp = await as.get('/api/privacy/export');
    expect(exp.status).toBe(403);
    expect(exp.body.error).toBe('IMPERSONATION_READ_ONLY');
    expect((await as.get(`/api/documents/cases/${c.id}/packet?store=1`)).status).toBe(403);
    expect((await as.get('/api/share/whatever')).status).toBe(403);

    // Read-only pages keep working.
    for (const url of ['/api/auth/me', '/api/cases', `/api/cases/${c.id}`, `/api/cases/${c.id}/messages`, '/api/notifications', '/api/account/overview', '/api/account/export', '/api/privacy', '/api/account/passport']) {
      const res = await as.get(url);
      expect(res.status, url).toBe(200);
    }
    expect((await as.head('/api/cases')).status).toBe(200);
    await settle();

    expect(await counts()).toEqual(base);
    expect((await prisma.caseMessage.findUniqueOrThrow({ where: { id: msg.id } })).readAt).toBeNull();
    expect((await prisma.pushDevice.findUniqueOrThrow({ where: { id: device.id } })).lastSeenAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    // The client's own session clock is not touched by the admin's view.
    expect((await prisma.session.findUniqueOrThrow({ where: { id: clientSession.id } })).lastSeenAt.getTime()).toBe(before.lastSeenAt.getTime());
    // No LOGIN-like trace for the client.
    expect(await prisma.auditLog.count({ where: { actorId: client.user.id } })).toBe(0);
  });

  it('keeps signature "viewed" markers untouched (markViewed is a no-op)', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const req = await prisma.signatureRequest.create({
      data: { title: 'Contract', status: 'SENT', originalName: 'x.pdf', originalKey: `imp-${Date.now()}.pdf`, originalSha256: 'a'.repeat(64), originalSize: 10, originalPages: 1, createdById: admin.user.id },
    });
    const signer = await prisma.signatureSigner.create({ data: { requestId: req.id, role: 'CANDIDATE', userId: client.user.id, name: 'C', email: client.user.email, order: 1 } });
    const { as } = await start(admin, client.user.id);
    await as.get(`/api/signatures/my/${signer.id}`);
    const fresh = await prisma.signatureSigner.findUniqueOrThrow({ where: { id: signer.id } });
    expect(fresh.status).toBe('PENDING');
    expect(fresh.viewedAt).toBeNull();
  });

  it('renders the whole client and employer portal read-only (no lazy writes on GET)', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const { as } = await start(admin, client.user.id);
    const urls = [
      '/api/cv',
      '/api/cv/letters',
      '/api/vault',
      '/api/vault/suggestions',
      '/api/journey/onboarding',
      '/api/journey/german/status',
      `/api/journey/cases/${c.id}/forecast`,
      `/api/journey/cases/${c.id}/family`,
      '/api/arrival',
      '/api/interview-prep',
      '/api/signatures/my',
      '/api/messaging/preferences',
      `/api/documents/cases/${c.id}/intel`,
      '/api/privacy',
      '/api/notifications',
      '/api/account/overview',
    ];
    const bad: string[] = [];
    for (const url of urls) {
      const res = await as.get(url);
      if (res.status >= 500 || res.body?.error === 'IMPERSONATION_READ_ONLY') bad.push(`${url} → ${res.status} ${res.body?.error ?? ''}`);
    }
    expect(bad).toEqual([]);

    const employer = await asCompany();
    const emp = await start(admin, employer.user.id);
    const empBad: string[] = [];
    const empBefore = await dbSnapshot();
    for (const url of ['/api/company/me', '/api/company/dashboard', '/api/company/vacancies', '/api/company/candidates', '/api/company/workers', '/api/company/requests', '/api/company/invoices', '/api/company/quotes', '/api/company/pool', '/api/company/avv', '/api/company/forms', '/api/company/access/me', '/api/company/team', '/api/company/reports', '/api/company/pipeline']) {
      const res = await emp.as.get(url);
      if (res.status >= 500 || res.body?.error === 'IMPERSONATION_READ_ONLY') empBad.push(`${url} → ${res.status} ${res.body?.error ?? ''}`);
    }
    expect(empBad).toEqual([]);
    await settle();
    expect(await dbSnapshot()).toEqual(empBefore);
  });

  it('every client portal GET answers while viewing and the database stays exactly as it was (write guard on)', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const staff = await asStaff();
    await prisma.caseMessage.create({ data: { caseId: c.id, authorId: staff.user.id, body: 'Unread staff message' } });
    await prisma.notification.create({ data: { userId: client.user.id, type: 'INFO', title: 't', body: 'b' } });
    const { as } = await start(admin, client.user.id);
    await settle();

    const before = await dbSnapshot();
    const id = c.id;
    // What the client portal (/account/*) calls: layout, home cards, case page, tools (client/src/pages/account/**).
    const urls = [
      '/api/auth/me', '/api/auth/sessions', '/api/auth/email-change', '/api/auth/2fa/status',
      `/api/account/overview`, `/api/account/overview?case=${id}`, `/api/account/next-step`, `/api/account/next-step?case=${id}`, '/api/account/passport',
      '/api/account/permits', '/api/account/readiness', '/api/account/ready', '/api/account/ready/summary', '/api/account/future-letter',
      '/api/account/success-share', '/api/account/rule-changes', '/api/account/candidate-pool', '/api/account/arrival-certificate', `/api/account/billing?case=${id}`,
      `/api/account/plus/family`, `/api/account/plus/countdowns?case=${id}`, `/api/account/plus/doc-checklist?case=${id}`, `/api/account/plus/arrival-prep?case=${id}`, '/api/account/plus/offline-pack',
      `/api/account/germany/day?case=${id}`, '/api/account/germany/badges', `/api/account/germany/arrival-card?case=${id}`,
      `/api/account/case-contracts/cases/${id}`, `/api/account/recognition/cases/${id}`, `/api/account/authorities/cases/${id}`, `/api/account/visa-story/${id}`,
      '/api/cases', `/api/cases/${id}`, `/api/cases/${id}/messages`, `/api/doc-progress/cases/${id}`, `/api/family/cases/${id}`,
      `/api/journey/cases/${id}/family`, `/api/journey/cases/${id}/forecast`, '/api/journey/onboarding', '/api/journey/german/status', '/api/journey/german/courses', '/api/journey/german/test',
      `/api/documents/cases/${id}/intel`, `/api/upload-ai/cases/${id}`, `/api/originals/my/cases/${id}`,
      `/api/client-data/cases/${id}/tasks`, `/api/client-data/cases/${id}/confirmation`, '/api/client-data/guides?keys=PASSPORT',
      `/api/client-process/tasks?caseId=${id}`, '/api/client-process/office/slots', `/api/client-process/office/visits?caseId=${id}`,
      '/api/notifications', '/api/notifications/summary', '/api/notifications?limit=20&unread=1', `/api/signatures/my?caseId=${id}`, '/api/signatures/my',
      '/api/course', '/api/tours', '/api/legal/me/pending', '/api/external-applications', '/api/partner-sharing', '/api/waiting-room',
      '/api/german/me', '/api/german/vocab', '/api/interviews/mine', '/api/interview-calendar/invites', '/api/interview-prep', '/api/calendar/token',
      '/api/cv', '/api/cv/lebenslauf', '/api/cv/letters', '/api/cv/letters/options', '/api/vault', `/api/vault/suggestions?caseId=${id}`,
      '/api/arrival', '/api/housing', '/api/growth/referral', '/api/growth/referral/share', '/api/rate-alerts/mine', '/api/budget/me', '/api/budget/config',
      '/api/germany-jobs/alerts/mine', '/api/germany-jobs/saved', '/api/job-alerts/mine', '/api/job-alerts/waitlist/mine', '/api/vacancies/my/applications', '/api/vacancies/policy', '/api/vacancies/options',
      '/api/intro-video', '/api/skill-videos', '/api/messaging/preferences', '/api/messaging-plus/preferences', '/api/messaging-plus/threads',
      '/api/privacy', '/api/privacy/access-log', '/api/ai/status', '/api/ai/conversations?scope=CLIENT', '/api/ai-writing/recommendations', '/api/ai-docs/letters',
      '/api/callback/slots', '/api/site/status/mine', '/api/account/export', '/api/public/content?fields=shell', '/api/legal/cookies',
    ];
    const bad: string[] = [];
    let ok = 0;
    for (const url of urls) {
      const res = await as.get(url);
      if (res.status >= 500 || res.body?.error === 'IMPERSONATION_READ_ONLY') bad.push(`${url} → ${res.status} ${res.body?.error ?? ''}`);
      if (res.status === 200) ok++;
    }
    expect(bad).toEqual([]);
    // Nearly everything is plain 200 (a few answer 403/404 by design for this fresh client, e.g. referral off).
    expect(ok).toBeGreaterThan(urls.length * 0.8);
    for (const url of ['/api/auth/me', '/api/account/overview', '/api/cases', `/api/cases/${id}`, `/api/doc-progress/cases/${id}`, `/api/family/cases/${id}`, '/api/account/candidate-pool', '/api/account/arrival-certificate', '/api/germany-jobs/saved', '/api/cv', '/api/housing', '/api/arrival']) {
      expect((await as.get(url)).status, url).toBe(200);
    }
    await settle();

    expect(await dbSnapshot()).toEqual(before);
    expect(await prisma.auditLog.count({ where: { actorId: client.user.id } })).toBe(0);
  });

  it('derives lazy state in memory instead of storing it (expired signature request stays SENT in the database)', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const req = await prisma.signatureRequest.create({
      data: { title: 'Old contract', status: 'SENT', originalName: 'x.pdf', originalKey: `imp-exp-${Date.now()}.pdf`, originalSha256: 'b'.repeat(64), originalSize: 10, originalPages: 1, createdById: admin.user.id, expiresAt: new Date(Date.now() - 60_000) },
    });
    const signer = await prisma.signatureSigner.create({ data: { requestId: req.id, role: 'CANDIDATE', userId: client.user.id, name: 'C', email: client.user.email, order: 1 } });
    const events = await prisma.signatureEvent.count({ where: { requestId: req.id } });
    const { as } = await start(admin, client.user.id);

    const view = await as.get(`/api/signatures/my/${signer.id}`);
    expect(view.status).toBe(200);
    expect(view.body.request.status).toBe('EXPIRED');
    expect(view.body.me.myTurn).toBe(false);
    await settle();
    expect((await prisma.signatureRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe('SENT');
    expect(await prisma.signatureEvent.count({ where: { requestId: req.id } })).toBe(events);

    // The client's own visit stores it as before.
    const own = await client.agent.get(`/api/signatures/my/${signer.id}`);
    expect(own.body.request.status).toBe('EXPIRED');
    expect((await prisma.signatureRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe('EXPIRED');
  });

  it('keeps staff-only routes closed while viewing', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const { as } = await start(admin, client.user.id);
    for (const url of ['/api/admin/dashboard', '/api/admin/users', '/api/admin/cases', '/api/admin/sensitive/reveals', '/api/drive/nodes', '/api/workspace/announcements', '/api/admin/impersonate/history?userId=x']) {
      const res = await as.get(url);
      expect([401, 403, 404], url).toContain(res.status);
      expect(res.status, url).not.toBe(200);
    }
    const reveal = await as.post('/api/admin/reveal').send({ entity: 'user', id: client.user.id, field: 'passportNumber', reason: 'just looking' });
    expect(reveal.status).toBe(403);
  });

  it('stop ends the view, returns to the admin page and records the viewed paths', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const { as, imp } = await start(admin, client.user.id, { reason: 'SUPPORT_REQUEST', returnTo: '/admin/cases' });
    await as.get('/api/cases').set('X-Page-Path', '/account/cases');
    await as.get(`/api/cases/${c.id}`).set('X-Page-Path', `/account/cases/${c.id}`);

    const stop = await as.post('/api/admin/impersonate/stop');
    expect(stop.status).toBe(200);
    expect(stop.body).toMatchObject({ ok: true, returnTo: '/admin/cases' });
    expect(([] as string[]).concat(stop.headers['set-cookie'] ?? []).some((x) => /^tv_imp=;/.test(x))).toBe(true);

    const row = await prisma.impersonationSession.findFirstOrThrow({ where: { adminId: admin.user.id } });
    expect(row).toMatchObject({ endReason: 'STOPPED', targetUserId: client.user.id });
    expect(row.endedAt).not.toBeNull();
    expect(row.requestCount).toBeGreaterThanOrEqual(2);
    const logs = await prisma.impersonationLog.findMany({ where: { sessionId: row.id } });
    const paths = logs.flatMap((l) => l.paths as string[]);
    expect(paths).toEqual(expect.arrayContaining(['GET /api/cases', `GET /api/cases/${c.id}`, 'PAGE /account/cases', `PAGE /account/cases/${c.id}`]));

    const stopped = await prisma.auditLog.findFirst({ where: { action: 'IMPERSONATION_STOPPED' } });
    expect(stopped).toMatchObject({ actorId: admin.user.id, target: `user:${client.user.id}` });
    expect(stopped!.details).toMatchObject({ reason: 'SUPPORT_REQUEST', endReason: 'STOPPED' });

    // The old token is dead: the same browser is the admin again.
    const after = await viewing(admin.token, imp).get('/api/auth/me');
    expect(after.body.user.id).toBe(admin.user.id);
    expect(after.body.impersonation).toBeUndefined();
    expect(after.headers['x-impersonation-ended']).toBe('INVALID');
    expect((await viewing(admin.token, imp).post('/api/admin/impersonate/stop')).status).toBe(200);
  });

  it('expires after 30 minutes and is never renewed', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const { as } = await start(admin, client.user.id);
    const row = await prisma.impersonationSession.findFirstOrThrow({ where: { adminId: admin.user.id } });
    const expiresAt = row.expiresAt.getTime();
    await as.get('/api/cases');
    expect((await prisma.impersonationSession.findUniqueOrThrow({ where: { id: row.id } })).expiresAt.getTime()).toBe(expiresAt);

    await prisma.impersonationSession.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const me = await as.get('/api/auth/me');
    expect(me.body.user.id).toBe(admin.user.id);
    expect(me.headers['x-impersonation-ended']).toBe('EXPIRED');
    expect((await prisma.impersonationSession.findUniqueOrThrow({ where: { id: row.id } })).endReason).toBe('EXPIRED');
    const stopped = await prisma.auditLog.findFirst({ where: { action: 'IMPERSONATION_STOPPED' } });
    expect(stopped!.details).toMatchObject({ endReason: 'EXPIRED' });
    // Writes work again for the admin (it is the admin's own session now).
    expect((await as.get('/api/admin/dashboard')).status).toBe(200);
  });

  it('is bound to the admin session that started it', async () => {
    const admin = await asAdmin();
    const otherAdmin = await asAdmin();
    const client = await asClient();
    const { imp } = await start(admin, client.user.id);
    const stolen = await viewing(otherAdmin.token, imp).get('/api/auth/me');
    expect(stolen.body.user.id).toBe(otherAdmin.user.id);
    expect(stolen.body.impersonation).toBeUndefined();

    // A second session of the same admin does not inherit the view either.
    const second = await prisma.session.create({ data: { userId: admin.user.id, client: 'web', expiresAt: new Date(Date.now() + 3600_000) } });
    const jwt = (await import('jsonwebtoken')).default;
    const { config } = await import('../../src/config.js');
    const token2 = jwt.sign({ sub: admin.user.id, sid: second.id }, config.jwtSecret, { algorithm: 'HS256', expiresIn: 3600 });
    expect((await viewing(token2, imp).get('/api/auth/me')).body.user.id).toBe(admin.user.id);
    // The original browser is still viewing.
    expect((await viewing(admin.token, imp).get('/api/auth/me')).body.user.id).toBe(client.user.id);
  });

  it('a new view replaces the running one; logout ends the view and the admin session', async () => {
    const admin = await asAdmin();
    const a = await asClient();
    const b = await asClient();
    await start(admin, a.user.id);
    const second = await start(admin, b.user.id);
    const rows = await prisma.impersonationSession.findMany({ where: { adminId: admin.user.id }, orderBy: { startedAt: 'asc' } });
    expect(rows.map((r) => r.endReason)).toEqual(['REPLACED', null]);

    const out = await second.as.post('/api/auth/logout');
    expect(out.status).toBe(200);
    expect((await prisma.impersonationSession.findUniqueOrThrow({ where: { id: rows[1].id } })).endReason).toBe('LOGOUT');
    expect((await admin.agent.get('/api/auth/me')).body.user).toBeNull();
  });

  it('works for employer (COMPANY) accounts', async () => {
    const admin = await asAdmin();
    const employer = await asCompany();
    const { res, as } = await start(admin, employer.user.id);
    expect(res.body.landing).toBe('/company');
    const me = await as.get('/api/company/me');
    expect(me.status).toBe(200);
    expect((await as.patch('/api/company/me').send({ name: 'Hacked GmbH' })).body.error).toBe('IMPERSONATION_READ_ONLY');
  });

  it('is transparent for the user: the DSGVO export lists support views; history for admins', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const { as } = await start(admin, client.user.id, { reason: 'BUG_CHECK' });
    await as.get('/api/cases');
    await as.post('/api/admin/impersonate/stop');
    await flushImpersonationLogs();

    const exp = await client.agent.get('/api/account/export');
    expect(exp.status).toBe(200);
    const data = JSON.parse(exp.text);
    expect(data.supportViews).toHaveLength(1);
    expect(data.supportViews[0]).toMatchObject({ reason: 'BUG_CHECK' });

    const hist = await admin.agent.get(`/api/admin/impersonate/history?userId=${client.user.id}`);
    expect(hist.status).toBe(200);
    expect(hist.body.items[0]).toMatchObject({ reason: 'BUG_CHECK', endReason: 'STOPPED', admin: expect.any(String) });
    expect(hist.body.items[0].views[0].paths).toContain('GET /api/cases');
    const staff = await asStaff();
    expect((await staff.agent.get(`/api/admin/impersonate/history?userId=${client.user.id}`)).status).toBe(403);
  });
});
