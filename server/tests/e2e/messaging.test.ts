import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { anon, app, asAdmin, asClient, asStaff, asSuperAdmin, ORIGIN } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createClient, uniq } from '../helpers/factories';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { publish, subscribe, subscriberCount, type RealtimeEvent } from '../../src/lib/messaging/realtime.js';
import { resetTypingLimiter } from '../../src/lib/messaging/caseMessages.js';
import { invalidateTemplateCache, renderTemplate } from '../../src/lib/messaging/templates.js';
import { normalizePhone } from '../../src/lib/messaging/providers.js';
import { runAppointmentReminders } from '../../src/jobs/reminders.js';
import { runOutboundMaintenance } from '../../src/jobs/messaging.js';
import { registeredJobs } from '../../src/lib/scheduler.js';

const WA_ENV = ['WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_WEBHOOK_SECRET', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'SMS_PROVIDER'] as const;

beforeEach(async () => {
  await prisma.outboundMessage.deleteMany();
  await prisma.notificationTemplate.deleteMany();
  invalidateTemplateCache();
  resetTypingLimiter();
  for (const k of WA_ENV) delete process.env[k];
});

/** Collects the events a user receives on the bus while `fn` runs. */
const collect = async (userId: string, fn: () => Promise<unknown>) => {
  const events: RealtimeEvent[] = [];
  const off = subscribe(userId, (ev) => events.push(ev));
  try {
    await fn();
  } finally {
    off();
  }
  return events;
};

// ─── SSE ───────────────────────────────────────────────────────────────

describe('GET /api/messaging/events (SSE)', () => {
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

  it('needs a session', async () => {
    const res = await anon().get('/api/messaging/events');
    expect(res.status).toBe(401);
  });

  it('streams published events to the signed-in user with SSE headers and cleans up on close', async () => {
    const client = await asClient();
    const ac = new AbortController();
    const res = await fetch(`${base}/api/messaging/events?lastEventId=0`, { headers: { Cookie: `tv_session=${client.token}` }, signal: ac.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toContain('no-cache');
    expect(res.headers.get('x-accel-buffering')).toBe('no');

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const readUntil = async (needle: string) => {
      for (let i = 0; i < 50 && !buffer.includes(needle); i++) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
      }
      return buffer;
    };
    await readUntil('retry: 3000');
    await waitFor(async () => subscriberCount(client.user.id) > 0);
    const other = await asClient();
    publish(other.user.id, 'message.new', { caseId: 'not-for-me' });
    publish(client.user.id, 'message.new', { caseId: 'c1', message: { id: 'm1', body: 'Salam' } });
    const out = await readUntil('"id":"m1"');
    expect(out).toContain('event: message.new\n');
    expect(out).toContain('data: {"caseId":"c1","message":{"id":"m1","body":"Salam"}}\n\n');
    expect(out).toMatch(/^id: 1$/m);
    expect(out).not.toContain('not-for-me');

    ac.abort();
    await waitFor(async () => subscriberCount(client.user.id) === 0);
  });
});

// ─── Chat: messages, read receipts, typing ─────────────────────────────

describe('case chat realtime', () => {
  it('message payloads include channel and readAt; both sides receive message.new', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const staff = await asStaff();
    const c = await createCaseVia(client.agent);
    expectStatus(await admin.agent.patch(`/api/admin/cases/${c.id}`).send({ assignedStaffId: staff.user.id }), 200);

    const adminEvents = await collect(admin.user.id, async () => {
      const res = expectStatus(await client.agent.post(`/api/cases/${c.id}/messages`).send({ body: 'Salam' }), 201);
      expect(res.body.message).toMatchObject({ caseId: c.id, authorId: client.user.id, body: 'Salam', channel: 'app', readAt: null, author: { role: 'CLIENT' } });
    });
    expect(adminEvents.map((e) => e.type)).toEqual(expect.arrayContaining(['message.new', 'notification']));
    const newMsg = adminEvents.find((e) => e.type === 'message.new')!;
    expect(newMsg.payload).toMatchObject({ caseId: c.id, message: { body: 'Salam', author: { role: 'CLIENT' } } });

    const clientEvents = await collect(client.user.id, async () => {
      expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/messages`).send({ body: 'Xoş gəldiniz' }), 201);
    });
    expect(clientEvents.map((e) => e.type)).toEqual(expect.arrayContaining(['message.new', 'notification']));
    expect(clientEvents.find((e) => e.type === 'notification')!.payload).toMatchObject({ type: 'NEW_MESSAGE', caseId: c.id, link: `/account/cases/${c.id}` });

    const list = expectStatus(await client.agent.get(`/api/cases/${c.id}/messages`), 200).body.messages as { body: string; channel: string; readAt: null }[];
    expect(list.map((m) => m.body)).toEqual(['Salam', 'Xoş gəldiniz']);
    expect(list[1]).toMatchObject({ channel: 'app', readAt: null });
    const adminList = expectStatus(await admin.agent.get(`/api/admin/cases/${c.id}/messages`), 200).body.messages;
    expect(adminList).toHaveLength(2);
  });

  it('read receipts mark only the other side’s messages and publish message.read', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);
    const m1 = expectStatus(await client.agent.post(`/api/cases/${c.id}/messages`).send({ body: 'one' }), 201).body.message;
    const m2 = expectStatus(await client.agent.post(`/api/cases/${c.id}/messages`).send({ body: 'two' }), 201).body.message;
    const s1 = expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/messages`).send({ body: 'reply' }), 201).body.message;

    const clientEvents = await collect(client.user.id, async () => {
      const res = expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/messages/read`), 200);
      expect([...res.body.messageIds].sort()).toEqual([m1.id, m2.id].sort());
      expect(res.body.readAt).toBeTruthy();
    });
    const read = clientEvents.find((e) => e.type === 'message.read')!;
    expect(read.payload).toMatchObject({ caseId: c.id });
    expect([...(read.payload.messageIds as string[])].sort()).toEqual([m1.id, m2.id].sort());

    const rows = await prisma.caseMessage.findMany({ where: { caseId: c.id } });
    expect(rows.find((r) => r.id === m1.id)!.readAt).not.toBeNull();
    expect(rows.find((r) => r.id === s1.id)!.readAt).toBeNull();

    // Nothing left unread for staff: no event, empty ids.
    const again = expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/messages/read`), 200);
    expect(again.body).toEqual({ messageIds: [], readAt: null });

    // The client marks the staff reply.
    const adminEvents = await collect(admin.user.id, async () => {
      const res = expectStatus(await client.agent.post(`/api/cases/${c.id}/messages/read`), 200);
      expect(res.body.messageIds).toEqual([s1.id]);
    });
    expect(adminEvents.some((e) => e.type === 'message.read')).toBe(true);
    expect((await prisma.caseMessage.findUniqueOrThrow({ where: { id: s1.id } })).readAt).not.toBeNull();

    const other = await asClient();
    expect((await other.agent.post(`/api/cases/${c.id}/messages/read`)).status).toBe(404);
  });

  it('typing is forwarded to the other side and limited to one event per 2 s', async () => {
    const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov' });
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);

    const adminEvents = await collect(admin.user.id, async () => {
      expectStatus(await client.agent.post(`/api/cases/${c.id}/typing`), 200);
      const second = await client.agent.post(`/api/cases/${c.id}/typing`);
      expect(second.status).toBe(429);
      expect(second.body.error).toBe('TOO_MANY_REQUESTS');
    });
    const typing = adminEvents.filter((e) => e.type === 'typing');
    expect(typing).toHaveLength(1);
    expect(typing[0].payload).toMatchObject({ caseId: c.id, userId: client.user.id, name: 'Əli Məmmədov', side: 'client' });

    const clientEvents = await collect(client.user.id, async () => {
      expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/typing`), 200);
    });
    expect(clientEvents.filter((e) => e.type === 'typing')).toHaveLength(1);
    expect((await admin.agent.post('/api/admin/cases/nope/typing')).status).toBe(404);
  });
});

// ─── Phone preferences ─────────────────────────────────────────────────

describe('phone-channel preferences', () => {
  it('are readable and PATCH /auth/me accepts the two toggles', async () => {
    const client = await asClient({ phone: '+994 50 123 45 67' });
    const before = expectStatus(await client.agent.get('/api/messaging/preferences'), 200).body.preferences;
    expect(before).toEqual({ phone: '+994 50 123 45 67', whatsappOptIn: true, smsNotifications: true });
    expectStatus(await client.agent.patch('/api/auth/me').send({ whatsappOptIn: false, smsNotifications: false }), 200);
    const after = expectStatus(await client.agent.get('/api/messaging/preferences'), 200).body.preferences;
    expect(after).toMatchObject({ whatsappOptIn: false, smsNotifications: false });
  });

  it('normalises phone numbers to E.164', () => {
    expect(normalizePhone('+994 50 123 45 67')).toBe('+994501234567');
    expect(normalizePhone('050 123 45 67')).toBe('+994501234567');
    expect(normalizePhone('0049 151 1234 5678')).toBe('+4915112345678');
    expect(normalizePhone('+49 (151) 1234-5678')).toBe('+4915112345678');
    expect(normalizePhone('994501234567')).toBe('+994501234567');
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

// ─── Outbound (no provider configured → CONSOLE) ──────────────────────

describe('outbound WhatsApp / SMS', () => {
  it('staff messages are mirrored to WhatsApp as CONSOLE rows when no provider is configured', async () => {
    const client = await asClient({ phone: '050 123 45 67', locale: 'en' });
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);
    // Creating the case already mirrored CASE_CREATED to WhatsApp.
    const created = await waitFor(() => prisma.outboundMessage.findFirst({ where: { userId: client.user.id, templateKey: 'CASE_CREATED', status: { not: 'QUEUED' } } }));
    expect(created).toMatchObject({ channel: 'WHATSAPP', to: '+994501234567', status: 'CONSOLE', caseId: c.id });
    expect(created.body).toContain(c.number);

    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/messages`).send({ body: 'Please bring your passport.' }), 201);
    const row = await waitFor(() => prisma.outboundMessage.findFirst({ where: { userId: client.user.id, templateKey: 'NEW_MESSAGE', status: { not: 'QUEUED' } } }));
    expect(row).toMatchObject({ channel: 'WHATSAPP', to: '+994501234567', status: 'CONSOLE', caseId: c.id, providerId: null, error: null });
    expect(row.body).toContain('New message');
    expect(row.body).toContain('You have a new message from the Triad Vision team.');

    // Minor in-app-only types (document accepted/rejected) are not mirrored.
    const detail = expectStatus(await client.agent.get(`/api/cases/${c.id}`), 200).body.case;
    expect(detail).toBeTruthy();
    expect(await prisma.outboundMessage.count({ where: { userId: client.user.id } })).toBe(2);
  });

  it('respects the opt-out and skips users without a phone', async () => {
    const optOut = await asClient({ phone: '+994501111111' });
    await prisma.user.update({ where: { id: optOut.user.id }, data: { whatsappOptIn: false } });
    const noPhone = await asClient();
    const admin = await asAdmin();
    for (const u of [optOut, noPhone]) {
      const c = await createCaseVia(u.agent);
      expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/messages`).send({ body: 'hi' }), 201);
    }
    await waitFor(() => prisma.notification.count({ where: { type: 'NEW_MESSAGE' } }).then((n) => n === 2));
    expect(await prisma.outboundMessage.count()).toBe(0);
  });

  it('24-hour appointment reminders also go out by WhatsApp (or SMS) once per channel', async () => {
    const { user: client } = await createClient({ locale: 'de', phone: '+49 151 1234 5678' });
    const at = new Date('2030-03-12T06:00:00Z');
    const c = await prisma.case.create({ data: { number: uniq('TV-T-'), clientId: client.id, profession: 'Driver', status: 'APPOINTMENT_SCHEDULED', appointmentAt: at, appointmentPlace: 'VFS' } });
    const dayBefore = new Date('2030-03-11T10:00:00Z');
    await runAppointmentReminders(dayBefore);
    await runAppointmentReminders(dayBefore);
    const rows = await prisma.outboundMessage.findMany({ where: { userId: client.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: 'WHATSAPP', to: '+4915112345678', status: 'CONSOLE', caseId: c.id, templateKey: 'APPOINTMENT_REMINDER' });
    expect(rows[0].body).toContain('Botschaftstermin');
    expect(await prisma.reminderLog.count({ where: { key: `appt-24h-wa:${c.id}:${at.toISOString()}` } })).toBe(1);

    // SMS when WhatsApp is switched off.
    const { user: smsOnly } = await createClient({ locale: 'en', phone: '+994502222222' });
    await prisma.user.update({ where: { id: smsOnly.id }, data: { whatsappOptIn: false } });
    const c2 = await prisma.case.create({ data: { number: uniq('TV-T-'), clientId: smsOnly.id, profession: 'Driver', status: 'APPOINTMENT_SCHEDULED', appointmentAt: at, appointmentPlace: 'VFS' } });
    await runAppointmentReminders(dayBefore);
    const sms = await prisma.outboundMessage.findMany({ where: { userId: smsOnly.id } });
    expect(sms).toHaveLength(1);
    expect(sms[0]).toMatchObject({ channel: 'SMS', status: 'CONSOLE', caseId: c2.id });
  });

  it('the maintenance job is registered and retries stuck rows / prunes old ones', async () => {
    expect(registeredJobs()).toContain('messaging-outbound');
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    await prisma.outboundMessage.create({ data: { channel: 'SMS', to: '+994501234567', body: 'old', status: 'SENT', createdAt: old } });
    const stuck = await prisma.outboundMessage.create({ data: { channel: 'SMS', to: '+994501234567', body: 'stuck', status: 'QUEUED', createdAt: new Date(Date.now() - 10 * 60 * 1000) } });
    const result = await runOutboundMaintenance();
    expect(result).toMatchObject({ retriedStuck: 1, pruned: 1 });
    expect((await prisma.outboundMessage.findUniqueOrThrow({ where: { id: stuck.id } })).status).toBe('CONSOLE');
    expect(await prisma.outboundMessage.count()).toBe(1);
  });
});

// ─── WhatsApp webhooks ─────────────────────────────────────────────────

const waPayload = (messages: Record<string, unknown>[], contacts: { wa_id: string; profile: { name: string } }[] = []) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: '1', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', contacts, messages } }] }],
});
const textMsg = (from: string, body: string, id = `wamid.${uniq()}`) => ({ id, from, timestamp: '1700000000', type: 'text', text: { body } });
const sign = (secret: string, raw: string) => `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;

describe('WhatsApp webhooks', () => {
  it('GET verifies the subscription with the configured token', async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'verify-me';
    const ok = await anon().get('/api/messaging/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '12345' });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe('12345');
    const bad = await anon().get('/api/messaging/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '12345' });
    expect(bad.status).toBe(403);
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    expect((await anon().get('/api/messaging/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': 'x' })).status).toBe(403);
  });

  it('POST rejects unsigned, badly signed and unconfigured deliveries', async () => {
    const body = waPayload([textMsg('994501234567', 'hi')]);
    expect((await anon().post('/api/messaging/webhooks/whatsapp').send(body)).status).toBe(403);

    process.env.WHATSAPP_APP_SECRET = 'app-secret';
    const raw = JSON.stringify(body);
    const wrong = await anon().post('/api/messaging/webhooks/whatsapp').set('Content-Type', 'application/json').set('X-Hub-Signature-256', sign('other', raw)).send(raw);
    expect(wrong.status).toBe(403);
    expect(wrong.body.error).toBe('WEBHOOK_SIGNATURE_INVALID');
    const missing = await anon().post('/api/messaging/webhooks/whatsapp').send(body);
    expect(missing.status).toBe(403);
    expect((await anon().post('/api/messaging/webhooks/whatsapp?token=wrong').send(body)).status).toBe(403);
    expect(await prisma.caseMessage.count()).toBe(0);
    expect(await prisma.inquiry.count()).toBe(0);
  });

  it('accepts a valid X-Hub-Signature-256 over the raw body and stores the text in the client’s open case', async () => {
    process.env.WHATSAPP_APP_SECRET = 'app-secret';
    const client = await asClient({ phone: '050 123 45 67', firstName: 'Əli', lastName: 'Məmmədov' });
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);
    const body = waPayload([textMsg('994501234567', 'Salam, sənədləri göndərdim', 'wamid.ABC1')], [{ wa_id: '994501234567', profile: { name: 'Ali' } }]);
    const raw = JSON.stringify(body);

    const adminEvents = await collect(admin.user.id, async () => {
      const res = await anon().post('/api/messaging/webhooks/whatsapp').set('Content-Type', 'application/json').set('X-Hub-Signature-256', sign('app-secret', raw)).send(raw);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, messages: 1, inquiries: 0, duplicates: 0 });
    });
    expect(adminEvents.find((e) => e.type === 'message.new')!.payload).toMatchObject({ caseId: c.id, message: { body: 'Salam, sənədləri göndərdim', channel: 'whatsapp' } });

    const msgs = await prisma.caseMessage.findMany({ where: { caseId: c.id } });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ authorId: client.user.id, channel: 'whatsapp', externalId: 'wamid.ABC1' });
    const staff = await prisma.notification.findFirst({ where: { userId: admin.user.id, type: 'STAFF' }, orderBy: { createdAt: 'desc' } });
    expect(staff!.title).toBe(`${c.number}: müştəridən yeni mesaj (WhatsApp)`);

    // Meta retries deliveries: the same wamid is ignored.
    const again = await anon().post('/api/messaging/webhooks/whatsapp').set('Content-Type', 'application/json').set('X-Hub-Signature-256', sign('app-secret', raw)).send(raw);
    expect(again.body).toMatchObject({ ok: true, messages: 0, duplicates: 1 });
    expect(await prisma.caseMessage.count({ where: { caseId: c.id } })).toBe(1);
    expect(expectStatus(await client.agent.get(`/api/cases/${c.id}/messages`), 200).body.messages[0]).toMatchObject({ channel: 'whatsapp', author: { role: 'CLIENT' } });
  });

  it('falls back to the ?token= URL secret and stores unknown numbers as contact inquiries', async () => {
    process.env.WHATSAPP_WEBHOOK_SECRET = 'url-secret';
    const admin = await asAdmin();
    const body = waPayload([textMsg('4915112345678', 'Hallo, ich habe eine Frage', 'wamid.X1')], [{ wa_id: '4915112345678', profile: { name: 'Hans' } }]);
    const res = await anon().post('/api/messaging/webhooks/whatsapp?token=url-secret').send(body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, messages: 0, inquiries: 1 });
    const inq = await prisma.inquiry.findFirst();
    expect(inq).toMatchObject({ kind: 'contact', contactName: 'Hans', phone: '+4915112345678', status: 'NEW' });
    expect(inq!.message).toContain('Hallo, ich habe eine Frage');
    expect(await prisma.notification.count({ where: { userId: admin.user.id, type: 'STAFF' } })).toBe(1);

    // Redelivery → no second inquiry; a client without an open case also lands in the inbox.
    expect((await anon().post('/api/messaging/webhooks/whatsapp?token=url-secret').send(body)).body).toMatchObject({ duplicates: 1 });
    const closed = await asClient({ phone: '+994503333333', firstName: 'Nigar', lastName: 'Əliyeva' });
    const res2 = await anon().post('/api/messaging/webhooks/whatsapp?token=url-secret').send(waPayload([textMsg('994503333333', 'Yeni müraciət etmək istəyirəm')]));
    expect(res2.body).toMatchObject({ inquiries: 1 });
    expect(await prisma.inquiry.count()).toBe(2);
    expect(await prisma.inquiry.findFirst({ where: { email: closed.user.email } })).toMatchObject({ contactName: 'Nigar Əliyeva' });

    // Statuses / non-text events are ignored quietly.
    const statuses = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'x', status: 'delivered' }] } }] }] };
    expect((await anon().post('/api/messaging/webhooks/whatsapp?token=url-secret').send(statuses)).body).toMatchObject({ ok: true, messages: 0, inquiries: 0 });
  });
});

// ─── Admin API ─────────────────────────────────────────────────────────

describe('admin messaging API', () => {
  it('is staff-only', async () => {
    const client = await asClient();
    expect((await client.agent.get('/api/admin/messaging/outbound')).status).toBe(403);
    expect((await anon().get('/api/admin/messaging/providers')).status).toBe(401);
  });

  it('lists the outbound log with filters, exposes provider status and resends failed rows', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const client = await asClient({ phone: '+994501234567' });
    const c = await createCaseVia(client.agent);
    await waitFor(() => prisma.outboundMessage.findFirst({ where: { templateKey: 'CASE_CREATED' } }));
    await prisma.outboundMessage.deleteMany();
    const failed = await prisma.outboundMessage.create({ data: { channel: 'SMS', to: '+994501234567', body: 'x', status: 'FAILED', error: 'SMS 500: boom', userId: client.user.id, caseId: c.id } });
    await prisma.outboundMessage.create({ data: { channel: 'WHATSAPP', to: '+994501234567', body: 'y', status: 'SENT', providerId: 'wamid.1', sentAt: new Date() } });

    const all = expectStatus(await staff.agent.get('/api/admin/messaging/outbound'), 200).body;
    expect(all.total).toBe(2);
    expect(all.counts).toEqual({ FAILED: 1, SENT: 1 });
    expect(all.items[0]).toMatchObject({ channel: 'WHATSAPP', status: 'SENT' });
    const onlyFailed = expectStatus(await staff.agent.get('/api/admin/messaging/outbound?status=FAILED&channel=SMS'), 200).body;
    expect(onlyFailed.items).toHaveLength(1);
    expect(onlyFailed.items[0]).toMatchObject({ id: failed.id, user: { email: client.user.email }, case: { id: c.id, number: c.number }, error: 'SMS 500: boom' });
    expect(expectStatus(await staff.agent.get(`/api/admin/messaging/outbound?search=${c.number}`), 200).body.total).toBe(1);

    const providers = expectStatus(await staff.agent.get('/api/admin/messaging/providers'), 200).body.providers;
    expect(providers).toMatchObject({ whatsapp: { configured: false }, sms: { configured: false, provider: null }, defaultCountryCode: '994' });
    process.env.WHATSAPP_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    const configured = expectStatus(await staff.agent.get('/api/admin/messaging/providers'), 200).body.providers;
    expect(configured.whatsapp).toMatchObject({ configured: true, phoneNumberId: '123…890' });
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;

    expect((await staff.agent.post(`/api/admin/messaging/outbound/${failed.id}/resend`)).status).toBe(403);
    const resent = expectStatus(await admin.agent.post(`/api/admin/messaging/outbound/${failed.id}/resend`), 200).body.item;
    expect(resent).toMatchObject({ id: failed.id, status: 'CONSOLE', error: null });
    expect((await admin.agent.post('/api/admin/messaging/outbound/nope/resend')).status).toBe(404);
  });

  it('test messages are SUPER_ADMIN only and validate the number', async () => {
    const admin = await asAdmin();
    const root = await asSuperAdmin();
    expect((await admin.agent.post('/api/admin/messaging/providers/test').send({ channel: 'SMS', to: '+994501234567' })).status).toBe(403);
    expect((await root.agent.post('/api/admin/messaging/providers/test').send({ channel: 'SMS', to: 'abc' })).status).toBe(400);
    const res = expectStatus(await root.agent.post('/api/admin/messaging/providers/test').send({ channel: 'WHATSAPP', to: '050 123 45 67', text: 'Test' }), 200);
    expect(res.body.item).toMatchObject({ channel: 'WHATSAPP', to: '+994501234567', status: 'CONSOLE', body: 'Test', userId: null });
  });
});

// ─── Notification templates ───────────────────────────────────────────

describe('notification templates', () => {
  it('lists every type × locale with defaults, placeholders and overrides', async () => {
    const staff = await asStaff();
    const res = expectStatus(await staff.agent.get('/api/admin/messaging/templates'), 200).body;
    expect(res.types.length).toBe(15);
    const appt = res.types.find((t: { type: string }) => t.type === 'APPOINTMENT_SCHEDULED');
    expect(appt.placeholders).toEqual(['number', 'firstName', 'date', 'place', 'note']);
    expect(appt.locales.de.default.title).toBe('Botschaftstermin vereinbart');
    expect(appt.locales.de.override).toBeNull();
    expect(res.samples.az.number).toBe('TV-2026-0042');
  });

  it('an override changes the stored notification title and body; empty resets it', async () => {
    const client = await asClient({ locale: 'en', firstName: 'Ali' });
    const admin = await asAdmin();
    const staff = await asStaff();
    const c = await createCaseVia(client.agent);

    expect((await staff.agent.put('/api/admin/messaging/templates/NEW_MESSAGE/en').send({ title: 'x', body: 'y' })).status).toBe(403);
    expect((await admin.agent.put('/api/admin/messaging/templates/NOPE/en').send({ title: 'x', body: 'y' })).status).toBe(400);
    expect((await admin.agent.put('/api/admin/messaging/templates/NEW_MESSAGE/en').send({ title: 'x', body: '' })).status).toBe(400);
    const unknown = await admin.agent.put('/api/admin/messaging/templates/NEW_MESSAGE/en').send({ title: 'x', body: 'Hello {{surname}}' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toBe('UNKNOWN_PLACEHOLDER');

    const saved = expectStatus(
      await admin.agent.put('/api/admin/messaging/templates/NEW_MESSAGE/en').send({ title: 'Hi {{firstName}}, news on {{number}}', body: 'Your manager wrote to you about {{ number }}.' }),
      200,
    );
    expect(saved.body.override).toMatchObject({ title: 'Hi {{firstName}}, news on {{number}}' });

    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/messages`).send({ body: 'Please bring your passport.' }), 201);
    const n = await prisma.notification.findFirst({ where: { userId: client.user.id, type: 'NEW_MESSAGE' }, orderBy: { createdAt: 'desc' } });
    expect(n!.title).toBe(`Hi Ali, news on ${c.number}`);
    expect(n!.body).toBe(`Your manager wrote to you about ${c.number}.`);
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: client.user.email, subject: `Triad Vision · Hi Ali, news on ${c.number}` } }));

    const list = expectStatus(await admin.agent.get('/api/admin/messaging/templates'), 200).body;
    const nm = list.types.find((t: { type: string }) => t.type === 'NEW_MESSAGE');
    expect(nm.locales.en.override).toMatchObject({ title: 'Hi {{firstName}}, news on {{number}}', updatedBy: { firstName: 'Admin' } });
    expect(nm.locales.de.override).toBeNull();

    // Other locales are untouched.
    const de = await asClient({ locale: 'de' });
    const c2 = await createCaseVia(de.agent);
    expectStatus(await admin.agent.post(`/api/admin/cases/${c2.id}/messages`).send({ body: 'Hallo' }), 201);
    expect((await prisma.notification.findFirst({ where: { userId: de.user.id, type: 'NEW_MESSAGE' } }))!.title).toBe('Neue Nachricht');

    // Reset.
    expect(expectStatus(await admin.agent.put('/api/admin/messaging/templates/NEW_MESSAGE/en').send({ title: '', body: '  ' }), 200).body.override).toBeNull();
    expect(await prisma.notificationTemplate.count()).toBe(0);
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/messages`).send({ body: 'again' }), 201);
    const latest = await prisma.notification.findFirst({ where: { userId: client.user.id, type: 'NEW_MESSAGE' }, orderBy: { createdAt: 'desc' } });
    expect(latest!.title).toBe('New message');
  });

  it('previews a template with sample data and reports unknown placeholders', async () => {
    const staff = await asStaff();
    const res = expectStatus(
      await staff.agent.post('/api/admin/messaging/templates/APPOINTMENT_SCHEDULED/preview').send({ locale: 'az', title: 'Görüş: {{date}}', body: '{{firstName}}, yer: {{place}} {{oops}}' }),
      200,
    );
    expect(res.body).toEqual({ title: 'Görüş: 20 noyabr 2026, 09:30 (Bakı / GMT+4)', body: 'Əli, yer: Almaniya səfirliyi, Bakı ', unknown: ['oops'] });
    expect(renderTemplate('{{ a }}-{{b}}-{{c}}', { a: 1, b: 'x', c: { nested: true } })).toBe('1-x-');
  });

  it('the CSRF guard still applies to cookie sessions on admin writes', async () => {
    const admin = await asAdmin();
    const res = await anon().put('/api/admin/messaging/templates/NEW_MESSAGE/en').set('Cookie', `tv_session=${admin.token}`).set('Origin', 'https://evil.example').send({ title: 'x', body: 'y' });
    expect(res.status).toBe(403);
    expect(ORIGIN).toBe('http://localhost:5173');
  });
});
