import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { anon, app, asAdmin, asClient, asStaff, ORIGIN } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createClient, createStaff, uniq } from '../helpers/factories';
import { bakuDayWindow } from '../../src/lib/tvDisplay/mask.js';
import { act, createCaseVia, expectStatus } from '../helpers/workflow';
import { subscriberCount } from '../../src/lib/messaging/realtime.js';
import { TV_CHANNEL } from '../../src/lib/tvDisplay/events.js';

// Office TV mode (lib/tvDisplay, /api/tv, /api/admin/tv-display): display token scope and revoke, data
// minimisation of the payload, realtime "visa approved" event.

const newToken = async (admin: Awaited<ReturnType<typeof asAdmin>>, name = 'Ofis TV') => {
  const res = expectStatus(await admin.agent.post('/api/admin/tv-display/tokens').send({ name }), 201);
  return res.body as { token: string; url: string; display: { id: string; name: string; tokenPrefix: string; active: boolean } };
};

const tv = (token: string) => ({
  get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
  post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`).set('Origin', ORIGIN),
});

describe('TV display tokens (ADMIN+)', () => {
  it('admin creates a token, gets the TV URL once, the list never shows the secret', async () => {
    const admin = await asAdmin();
    const created = await newToken(admin, 'Qəbul otağı TV');
    expect(created.token).toMatch(/^tvd_[A-Za-z0-9_-]{43}$/);
    expect(created.url).toBe(`http://localhost:5173/admin/tv#token=${created.token}`);
    expect(created.display).toMatchObject({ name: 'Qəbul otağı TV', active: true, tokenPrefix: created.token.slice(0, 10) });

    const row = await prisma.tvDisplayToken.findUniqueOrThrow({ where: { id: created.display.id } });
    expect(row.tokenHash).not.toContain(created.token);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    const list = expectStatus(await admin.agent.get('/api/admin/tv-display'), 200).body;
    expect(JSON.stringify(list)).not.toContain(created.token);
    expect(list.tokens[0]).toMatchObject({ id: created.display.id, lastSeenAt: null, active: true });
    expect(list.settings).toEqual({ panels: ['agenda', 'inquiries', 'waiting', 'approved', 'arrivals'], rotationSeconds: 20, celebration: true, sound: false });

    const audit = await prisma.auditLog.findFirst({ where: { action: 'TV_DISPLAY_TOKEN_CREATED' } });
    expect(audit).toBeTruthy();
  });

  it('staff cannot manage tokens or settings (but may preview the minimised data)', async () => {
    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/tv-display')).status).toBe(403);
    expect((await staff.agent.post('/api/admin/tv-display/tokens').send({ name: 'x' })).status).toBe(403);
    expect((await staff.agent.put('/api/admin/tv-display/settings').send({ sound: true })).status).toBe(403);
    expect((await staff.agent.get('/api/admin/tv-display/data')).status).toBe(200);
    expect((await anon().get('/api/admin/tv-display/data')).status).toBe(401);
  });

  it('settings: panels, rotation, celebration, sound (validated); the payload carries only the chosen panels', async () => {
    const admin = await asAdmin();
    expect((await admin.agent.put('/api/admin/tv-display/settings').send({ rotationSeconds: 2 })).status).toBe(400);
    expect((await admin.agent.put('/api/admin/tv-display/settings').send({ panels: ['ranking'] })).status).toBe(400);
    const saved = expectStatus(await admin.agent.put('/api/admin/tv-display/settings').send({ panels: ['approved', 'agenda'], rotationSeconds: 45, celebration: false, sound: true }), 200).body.settings;
    expect(saved).toEqual({ panels: ['approved', 'agenda'], rotationSeconds: 45, celebration: false, sound: true });

    const { token } = await newToken(admin);
    const data = expectStatus(await tv(token).get('/api/tv/data'), 200).body;
    expect(Object.keys(data.panels).sort()).toEqual(['agenda', 'approved']);
    expect(data.settings).toEqual(saved);
    expect(data.timezone).toBe('Asia/Baku');
  });
});

describe('TV token scope', () => {
  it('opens /api/tv/data and records last seen', async () => {
    const admin = await asAdmin();
    const { token, display } = await newToken(admin);
    const res = expectStatus(await tv(token).get('/api/tv/data'), 200);
    expect(res.body.panels).toHaveProperty('agenda');
    // also accepted in the X-TV-Token header
    expectStatus(await request(app).get('/api/tv/data').set('X-TV-Token', token), 200);
    const row = await prisma.tvDisplayToken.findUniqueOrThrow({ where: { id: display.id } });
    expect(row.lastSeenAt).toBeInstanceOf(Date);
    const list = expectStatus(await admin.agent.get('/api/admin/tv-display'), 200).body;
    expect(list.tokens[0].lastSeenAt).toBeTruthy();
  });

  it('cannot access any other endpoint', async () => {
    const admin = await asAdmin();
    const { token } = await newToken(admin);
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    // the session endpoint answers anonymously: the token is no session
    const me = await tv(token).get('/api/auth/me');
    expect(me.body.user).toBeNull();
    const protectedGets = [
      '/api/admin/tv-display',
      '/api/admin/tv-display/data',
      '/api/admin/tv-display/stream',
      '/api/admin/cases',
      `/api/admin/cases/${c.id}`,
      '/api/admin/kpi/team',
      '/api/admin/inquiries',
      '/api/admin/users',
      '/api/admin/ops-calendar?from=2026-11-01T00:00:00Z&to=2026-11-30T00:00:00Z',
      '/api/cases',
      `/api/cases/${c.id}`,
      '/api/account/profile',
      '/api/notifications',
      '/api/messaging/events',
      '/api/events/summary',
      '/api/files/anything',
      '/api/vault',
      '/api/drive',
      '/api/company/workers',
    ];
    for (const url of protectedGets) {
      for (const send of [
        () => request(app).get(url).set('Authorization', `Bearer ${token}`),
        () => request(app).get(url).set('X-TV-Token', token),
      ]) {
        const res = await send();
        expect([401, 403, 404], `${url} → ${res.status}`).toContain(res.status);
        expect(res.status, url).not.toBe(200);
      }
    }
    // writes are refused too
    for (const url of ['/api/admin/tv-display/tokens', '/api/cases', `/api/admin/cases/${c.id}/actions`, '/api/admin/tv-display/settings']) {
      const res = await tv(token).post(url).send({ name: 'x', profession: 'x', action: 'CANCEL', reason: 'x' });
      expect([401, 403, 404], `${url} → ${res.status}`).toContain(res.status);
    }
    expect(await prisma.tvDisplayToken.count()).toBe(1);
  });

  it('a staff session is not a TV token; garbage and missing tokens are rejected', async () => {
    const staff = await asStaff();
    expect((await staff.agent.get('/api/tv/data')).status).toBe(401);
    expect((await request(app).get('/api/tv/data').set('Cookie', `tv_session=${staff.token}`)).status).toBe(401);
    expect((await request(app).get('/api/tv/data').set('Authorization', `Bearer ${staff.token}`)).status).toBe(401);
    expect((await anon().get('/api/tv/data')).body.error).toBe('TV_TOKEN_INVALID');
    expect((await tv('tvd_' + 'a'.repeat(43)).get('/api/tv/data')).body.error).toBe('TV_TOKEN_INVALID');
    expect((await tv('nonsense').get('/api/tv/data')).status).toBe(401);
    // never from the URL (it would land in access logs)
    const admin = await asAdmin();
    const { token } = await newToken(admin);
    expect((await anon().get(`/api/tv/data?token=${token}`)).status).toBe(401);
  });

  it('a revoked token is rejected', async () => {
    const admin = await asAdmin();
    const { token, display } = await newToken(admin);
    expectStatus(await tv(token).get('/api/tv/data'), 200);
    const revoked = expectStatus(await admin.agent.delete(`/api/admin/tv-display/tokens/${display.id}`), 200).body;
    expect(revoked.display).toMatchObject({ active: false });
    const res = await tv(token).get('/api/tv/data');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TV_TOKEN_REVOKED');
    expect((await tv(token).get('/api/tv/stream')).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: 'TV_DISPLAY_TOKEN_REVOKED' } })).toBe(1);
    expect((await admin.agent.delete('/api/admin/tv-display/tokens/nope')).status).toBe(404);
  });
});

describe('TV payload data minimisation', () => {
  it('shows first name + initial only; no last names, contacts, ids or case numbers', async () => {
    const now = new Date();
    // Baku midday today: inside today's window whatever time the test runs
    const inOneHour = new Date(bakuDayWindow(now).start.getTime() + 12 * 60 * 60 * 1000);
    const SECRET_LAST = ['Zzappointova', 'Zzinterviewov', 'Zzwaitingova', 'Zzapprovedov', 'Zzarrivalova', 'Zzstaffov', 'Zzinquirova'];
    const mk = (first: string, last: string, i: number) =>
      createClient({ firstName: first, lastName: last, email: `${uniq('mail')}-${i}@secret.example`, phone: `+99450${String(1000000 + i)}` });
    const [a, b, w, ap, ar] = await Promise.all([
      mk('Aysel', SECRET_LAST[0], 1),
      mk('Bəhruz', SECRET_LAST[1], 2),
      mk('Vüsal', SECRET_LAST[2], 3),
      mk('Səbinə', SECRET_LAST[3], 4),
      mk('Rauf', SECRET_LAST[4], 5),
    ]);
    const staff = await createStaff({ firstName: 'Leyla', lastName: SECRET_LAST[5] });
    const company = await prisma.company.create({ data: { name: 'Geheim Logistik GmbH', city: 'Hamburg', email: 'hr@geheim.example', phone: '+49 40 1234567' } });
    const caseOf = (clientId: string, data: Record<string, unknown>) =>
      prisma.case.create({ data: { clientId, number: uniq('TV-SECRET-'), profession: 'LKW sürücüsü', assignedStaffId: staff.user.id, ...data } });
    const appt = await caseOf(a.user.id, { status: 'APPOINTMENT_SCHEDULED', appointmentAt: inOneHour, appointmentPlace: 'Bakı, Nizami küç. 15, mənzil 7' });
    await prisma.interview.create({ data: { candidateId: b.user.id, staffId: staff.user.id, companyId: company.id, startsAt: inOneHour, endsAt: new Date(inOneHour.getTime() + 30 * 60 * 1000), status: 'CONFIRMED', meetingUrl: 'https://meet.example/secret-room' } });
    const waiting = await caseOf(w.user.id, { status: 'EMBASSY_REVIEW' });
    await prisma.caseEvent.create({ data: { caseId: waiting.id, type: 'DOCUMENTS_SUBMITTED', fromStatus: 'EMBASSY_DOCUMENTS', toStatus: 'EMBASSY_REVIEW', createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) } });
    const approved = await caseOf(ap.user.id, { status: 'APPROVED', decisionAt: now, closedAt: now, companyId: company.id, profession: 'Aşpaz' });
    const arrCase = await caseOf(ar.user.id, { status: 'APPROVED', decisionAt: new Date('2026-01-10T10:00:00Z'), closedAt: new Date('2026-01-10T10:00:00Z') });
    await prisma.arrivalPlan.create({ data: { caseId: arrCase.id, clientId: ar.user.id, status: 'CONFIRMED', arrivalTime: now, flightNumber: 'J2-SECRET', housingCity: 'Bremen', housingDetails: 'Hauptstr. 1, 28195 Bremen', pickupDetails: 'Fahrer +49 170 999999' } });
    await prisma.inquiry.create({ data: { kind: 'contact', contactName: `Lalə ${SECRET_LAST[6]}`, email: 'lale@secret.example', phone: '+994551112233', message: 'Gizli mesaj mətni', locale: 'az' } });

    const admin = await asAdmin();
    const { token } = await newToken(admin);
    const body = expectStatus(await tv(token).get('/api/tv/data'), 200).body;
    const json = JSON.stringify(body);

    // what the TV shows
    expect(body.panels.agenda.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'embassy', client: 'Aysel Z.', owner: 'Leyla Z.' }),
        expect.objectContaining({ kind: 'interview', client: 'Bəhruz Z.', owner: 'Leyla Z.' }),
      ]),
    );
    expect(body.panels.waiting).toMatchObject({ count: 1, oldestDays: 3, oldest: [{ client: 'Vüsal Z.', owner: 'Leyla Z.', status: 'EMBASSY_REVIEW', days: 3 }] });
    expect(body.panels.approved).toMatchObject({ count: 1, items: [{ client: 'Səbinə Z.', profession: 'Aşpaz', city: 'Hamburg' }] });
    expect(body.panels.arrivals.items).toEqual([expect.objectContaining({ client: 'Rauf Z.', city: 'Bremen' })]);
    expect(body.panels.inquiries).toMatchObject({ today: 1, people: 1, companies: 0, recent: [{ name: 'Lalə Z.', kind: 'person' }] });

    // what it never shows
    for (const last of SECRET_LAST) expect(json).not.toContain(last.slice(1));
    for (const u of [a, b, w, ap, ar]) {
      expect(json).not.toContain(u.user.email);
      expect(json).not.toContain(u.user.id);
      expect(json).not.toContain(u.user.phone!);
    }
    for (const leak of ['secret.example', 'geheim', 'Geheim', '+994', '+49', 'TV-SECRET-', 'Nizami', 'secret-room', 'J2-SECRET', 'Hauptstr', 'Fahrer', 'Gizli', staff.user.id, appt.id, approved.id, company.id]) {
      expect(json, leak).not.toContain(leak);
    }
    expect(json).not.toMatch(/"(email|phone|lastName|number|caseId|clientId|id|passport\w*|documents?)"\s*:/);

    // the staff preview is the same minimised payload
    const preview = JSON.stringify(expectStatus(await admin.agent.get('/api/admin/tv-display/data'), 200).body);
    for (const last of SECRET_LAST) expect(preview).not.toContain(last.slice(1));
  });
});

describe('TV realtime: visa approved', () => {
  let server: http.Server;
  let base: string;
  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  const open = async (token: string) => {
    const ac = new AbortController();
    const res = await fetch(`${base}/api/tv/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: ac.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;
    const readUntil = async (needle: string) => {
      for (let i = 0; i < 80 && !buffer.includes(needle) && !done; i++) {
        const chunk = await reader.read();
        if (chunk.done) done = true;
        else buffer += decoder.decode(chunk.value, { stream: true });
      }
      return buffer;
    };
    return { res, ac, readUntil, isDone: () => done };
  };

  it('streams tv.approved (minimised) when a case becomes APPROVED', async () => {
    const admin = await asAdmin();
    const { token } = await newToken(admin);
    const client = await asClient({ firstName: 'Nərmin', lastName: 'Zzcelebratova', phone: '+994709998877' });
    const company = await prisma.company.create({ data: { name: 'Pflege Plus', city: 'München' } });
    const c = await createCaseVia(client.agent, 'Tibb bacısı');
    await prisma.case.update({ where: { id: c.id }, data: { status: 'DECISION_PENDING', companyId: company.id } });

    const before = subscriberCount(TV_CHANNEL);
    const s = await open(token);
    expect(s.res.status).toBe(200);
    expect(s.res.headers.get('content-type')).toContain('text/event-stream');
    await s.readUntil('retry: 5000');
    await waitFor(async () => subscriberCount(TV_CHANNEL) > before);

    expectStatus(await act(admin.agent, c.id, { action: 'DECIDE', decision: 'APPROVED' }), 200);
    const out = await s.readUntil('event: tv.approved');
    expect(out).toContain('event: tv.approved\n');
    const data = JSON.parse(out.split('event: tv.approved\n')[1].split('\n')[0].replace(/^data: /, ''));
    expect(data).toMatchObject({ client: 'Nərmin Z.', profession: 'Tibb bacısı', city: 'München' });
    expect(typeof data.key).toBe('string');
    expect(out).not.toContain('celebratova');
    expect(out).not.toContain('+994');
    expect(out).not.toContain(c.id);
    expect(out).not.toContain(c.number);

    s.ac.abort();
    await waitFor(async () => subscriberCount(TV_CHANNEL) === before);
  });

  it('streams tv.application (first name + initial) when a case is created', async () => {
    const admin = await asAdmin();
    const { token } = await newToken(admin);
    const before = subscriberCount(TV_CHANNEL);
    const s = await open(token);
    await s.readUntil('retry: 5000');
    await waitFor(async () => subscriberCount(TV_CHANNEL) > before);
    const client = await asClient({ firstName: 'Günel', lastName: 'Zzyenimüraciətova', phone: '+994701112233' });
    const c = await createCaseVia(client.agent, 'Aşpaz');
    const out = await s.readUntil('event: tv.application');
    const data = JSON.parse(out.split('event: tv.application\n')[1].split('\n')[0].replace(/^data: /, ''));
    expect(data).toMatchObject({ client: 'Günel Z.', profession: 'Aşpaz' });
    expect(out).not.toContain('yenimüraciətova');
    expect(out).not.toContain('+994');
    expect(out).not.toContain(c.id);
    s.ac.abort();
    await waitFor(async () => subscriberCount(TV_CHANNEL) === before);
  });

  it('a rejection does not celebrate; revoking the token cuts the open stream', async () => {
    const admin = await asAdmin();
    const { token, display } = await newToken(admin);
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    await prisma.case.update({ where: { id: c.id }, data: { status: 'DECISION_PENDING' } });
    const s = await open(token);
    await s.readUntil('retry: 5000');
    await waitFor(async () => subscriberCount(TV_CHANNEL) > 0);
    expectStatus(await act(admin.agent, c.id, { action: 'DECIDE', decision: 'REJECTED', reason: 'Test' }), 200);

    expectStatus(await admin.agent.delete(`/api/admin/tv-display/tokens/${display.id}`), 200);
    const out = await s.readUntil('__never__');
    expect(s.isDone()).toBe(true);
    expect(out).not.toContain('tv.approved');
    await waitFor(async () => subscriberCount(TV_CHANNEL) === 0);
  });
});

describe('TV leaderboard panel (opt-in, staff first names only)', () => {
  it('counts reviews / moves / approvals of staff this week; not in the default panels', async () => {
    const admin = await asAdmin();
    const staff = await createStaff({ firstName: 'Nigar', lastName: 'Zzleaderova' });
    const client = await createClient();
    const kase = await prisma.case.create({ data: { clientId: client.user.id, number: uniq('TV-LB-'), profession: 'X', status: 'APPROVED' } });
    const mk = (type: string, from: string | null, to: string | null) =>
      prisma.caseEvent.create({ data: { caseId: kase.id, type, fromStatus: from as never, toStatus: to as never, actorId: staff.user.id } });
    await mk('DOCUMENT_ACCEPTED', null, null);
    await mk('DOCUMENT_REJECTED', null, null);
    await mk('STATUS_CHANGED', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT');
    await mk('DECISION', 'DECISION_PENDING', 'APPROVED');

    expectStatus(await admin.agent.put('/api/admin/tv-display/settings').send({ panels: ['leaderboard'] }), 200);
    const { token } = await newToken(admin);
    const body = expectStatus(await tv(token).get('/api/tv/data'), 200).body;
    expect(body.panels.leaderboard.week).toEqual([expect.objectContaining({ name: 'Nigar', reviewed: 2, moved: 2, approvals: 1 })]);
    expect(JSON.stringify(body)).not.toContain('leaderova');
    expect(JSON.stringify(body)).not.toContain(staff.user.id);
  });
});
