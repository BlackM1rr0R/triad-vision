import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { anon, app, asAdmin, asClient, asStaff, ORIGIN, type Actor } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { subscribe, type RealtimeEvent } from '../../src/lib/messaging/realtime.js';
import { fakeCalls, fakeSign, resetFakeCalls } from '../../src/lib/calls/providers/fake.js';
import { setCallsFetch } from '../../src/lib/calls/providers/types.js';
import { twilioSignature } from '../../src/lib/calls/providers/twilio.js';
import { callbackWindows, parseHoursText } from '../../src/lib/calls/hours.js';
import { runCallbackReminders } from '../../src/lib/calls/callbacks.js';
import { expireWaiting } from '../../src/lib/livechat/core.js';
import { resetPublicAiGuards } from '../../src/lib/publicAi/guard.js';
import { setAiTransport, setKeyInfoFetcher, setModelsFetcher, type StreamChunk } from '../../src/lib/ai/openrouter.js';
import { clearAiSettingsCache } from '../../src/lib/ai/settings.js';
import { registeredJobs } from '../../src/lib/scheduler.js';
import '../../src/jobs/calls.js';

/**
 * Calls (click-to-call through a FAKE provider + the Twilio / sipgate adapters with a fake fetch — no real API is
 * ever called), callback requests with task + reminder, and the AI → human live chat over SSE.
 */

process.env.OPENROUTER_API_KEY = 'sk-or-test-not-a-real-key';

const ALL_DAY = { days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '24:00' };
const NOTICE = { az: 'Zəng yazılır.', de: 'Das Gespräch wird aufgezeichnet.', en: 'This call is recorded.', ru: 'Звонок записывается.' };
const TWILIO_TOKEN = 'twilio-auth-token-test';
const BASE = 'https://api.example.test';

const baseSettings = (over: Record<string, unknown> = {}) => ({
  provider: 'fake',
  callerId: '+4930123456',
  recording: false,
  recordingNotice: NOTICE,
  webhookBaseUrl: BASE,
  inboundForwardTo: '',
  officeHours: ALL_DAY,
  twilio: { accountSid: '' },
  sipgate: { tokenId: '', deviceId: '', allowedIps: [] },
  ...over,
});

const configure = async (admin: Actor, over: Record<string, unknown> = {}) => expectStatus(await admin.agent.put('/api/calls/settings').send(baseSettings(over)), 200).body.settings;

const collect = (userId: string) => {
  const events: RealtimeEvent[] = [];
  const off = subscribe(userId, (ev) => events.push(ev));
  return { events, off };
};

const fakeHook = (payload: Record<string, unknown>, signature?: string) => {
  const raw = JSON.stringify(payload);
  return anon()
    .post('/api/calls/webhooks/fake')
    .set('content-type', 'application/json')
    .set('x-fake-signature', signature ?? fakeSign(raw))
    .send(raw);
};

beforeEach(() => {
  resetFakeCalls();
  resetPublicAiGuards();
  setCallsFetch(null);
});

afterAll(() => {
  setCallsFetch(null);
  setAiTransport(null);
  setKeyInfoFetcher(null);
  setModelsFetcher(null);
});

// ─── No provider ───────────────────────────────────────────────────────

describe('without a provider', () => {
  it('reports "not configured", refuses click-to-call and still logs a manual call with outcome', async () => {
    const staff = await asStaff({ phone: '+994 50 111 22 33' });
    const client = await asClient({ phone: '050 222 33 44' });
    const st = expectStatus(await staff.agent.get('/api/calls/status'), 200);
    expect(st.body).toMatchObject({ configured: false, provider: 'none', recording: false, canConfigure: false });

    const r = await staff.agent.post('/api/calls').send({ clientId: client.user.id });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('PROVIDER_NOT_CONFIGURED');
    expect(await prisma.call.count()).toBe(0);

    const log = expectStatus(await staff.agent.post('/api/calls/log').send({ target: { clientId: client.user.id }, outcome: 'NO_ANSWER', note: 'Telefonu açmadı' }), 201);
    expect(log.body.call).toMatchObject({ provider: 'manual', status: 'NO_ANSWER', outcome: 'NO_ANSWER', to: '+994502223344', note: 'Telefonu açmadı', staff: { id: staff.user.id } });

    const list = expectStatus(await staff.agent.get(`/api/calls?clientId=${client.user.id}`), 200);
    expect(list.body.calls).toHaveLength(1);

    expect((await client.agent.get('/api/calls')).status).toBe(403);
    expect((await staff.agent.get('/api/calls/settings')).status).toBe(403);
  });
});

// ─── Fake provider: click-to-call + webhooks ───────────────────────────

describe('click-to-call (fake provider)', () => {
  it('rings the staff phone then the client; signed webhooks move the status; outcome and note are saved', async () => {
    const admin = await asAdmin();
    const settings = await configure(admin);
    expect(settings).toMatchObject({ provider: 'fake', ready: true, recording: false });

    const noPhone = await asStaff();
    const client = await asClient({ phone: '+994 55 444 55 66', firstName: 'Rauf' });
    const c = await createCaseVia(client.agent);
    const r0 = await noPhone.agent.post('/api/calls').send({ caseId: c.id });
    expect(r0.status).toBe(400);
    expect(r0.body.error).toBe('STAFF_PHONE_MISSING');

    const staff = await asStaff({ phone: '0501112233' });
    const bus = collect(staff.user.id);
    const res = expectStatus(await staff.agent.post('/api/calls').send({ caseId: c.id }), 201);
    const call = res.body.call;
    expect(call).toMatchObject({ provider: 'fake', direction: 'OUTBOUND', status: 'RINGING_STAFF', to: '+994554445566', from: '+4930123456', client: { id: client.user.id }, case: { id: c.id } });
    expect(fakeCalls).toHaveLength(1);
    expect(fakeCalls[0]).toMatchObject({ staffNumber: '+994501112233', clientNumber: '+994554445566', callerId: '+4930123456', record: false, announcement: '' });
    const row = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });

    // Bad signature → rejected, nothing changes.
    const bad = await fakeHook({ providerCallId: row.providerCallId, leg: 'staff', state: 'answered' }, 'deadbeef');
    expect(bad.status).toBe(403);

    expectStatus(await fakeHook({ providerCallId: row.providerCallId, leg: 'staff', state: 'answered' }), 200);
    expect((await prisma.call.findUniqueOrThrow({ where: { id: call.id } })).status).toBe('RINGING');
    expectStatus(await fakeHook({ providerCallId: row.providerCallId, leg: 'client', state: 'answered' }), 200);
    const live = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(live.status).toBe('IN_PROGRESS');
    expect(live.answeredAt).not.toBeNull();
    expectStatus(await fakeHook({ providerCallId: row.providerCallId, leg: 'client', state: 'completed', durationSec: 75 }), 200);
    // A late staff-leg "completed" does not overwrite the final state.
    expectStatus(await fakeHook({ providerCallId: row.providerCallId, leg: 'staff', state: 'completed' }), 200);
    const done = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(done).toMatchObject({ status: 'COMPLETED', durationSec: 75 });
    bus.off();
    expect(bus.events.filter((e) => e.type === 'call.updated').map((e) => (e.payload.call as { status: string }).status)).toEqual(['RINGING_STAFF', 'RINGING', 'IN_PROGRESS', 'COMPLETED']);

    // Outcome popup; another staff member may not edit someone else's call.
    const other = await asStaff();
    expect((await other.agent.patch(`/api/calls/${call.id}`).send({ outcome: 'REACHED' })).status).toBe(403);
    const patched = expectStatus(await staff.agent.patch(`/api/calls/${call.id}`).send({ outcome: 'REACHED', note: 'Sənədləri sabah göndərəcək' }), 200);
    expect(patched.body.call).toMatchObject({ outcome: 'REACHED', note: 'Sənədləri sabah göndərəcək' });

    // Appears in the case call log; the audit has the call start.
    const list = expectStatus(await staff.agent.get(`/api/calls?caseId=${c.id}`), 200);
    expect(list.body.calls.map((x: { id: string }) => x.id)).toEqual([call.id]);
    expect(await prisma.auditLog.count({ where: { action: 'CALL_STARTED', target: `call:${call.id}` } })).toBe(1);
  });

  it('staff leg not answered → NO_ANSWER; provider failure → FAILED call + 502', async () => {
    const admin = await asAdmin();
    await configure(admin);
    const staff = await asStaff({ phone: '+994501112299' });
    const res = expectStatus(await staff.agent.post('/api/calls').send({ phone: '+49 151 2345 6789' }), 201);
    const row = await prisma.call.findUniqueOrThrow({ where: { id: res.body.call.id } });
    expectStatus(await fakeHook({ providerCallId: row.providerCallId, leg: 'staff', state: 'no-answer' }), 200);
    expect((await prisma.call.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('NO_ANSWER');

    const { failNextFakeCall } = await import('../../src/lib/calls/providers/fake.js');
    failNextFakeCall();
    const r = await staff.agent.post('/api/calls').send({ phone: '+49 151 2345 6789' });
    expect(r.status).toBe(502);
    expect(await prisma.call.count({ where: { status: 'FAILED' } })).toBe(1);
  });

  it('logs inbound calls and matches the caller to a client by normalised phone', async () => {
    const admin = await asAdmin();
    await configure(admin);
    const client = await asClient({ phone: '+994 (50) 765-43-21', firstName: 'Leyla' });
    const c = await createCaseVia(client.agent);
    const staff = await asStaff();
    const bus = collect(staff.user.id);
    const r = expectStatus(await fakeHook({ inbound: { providerCallId: 'IN-1', from: '00994507654321', to: '+4930123456' } }), 200);
    bus.off();
    const call = await prisma.call.findUniqueOrThrow({ where: { id: r.body.callId } });
    expect(call).toMatchObject({ direction: 'INBOUND', fromNumber: '+994507654321', clientId: client.user.id, caseId: c.id, status: 'RINGING' });
    const ev = bus.events.find((e) => e.type === 'call.inbound');
    expect(ev?.payload.label).toContain('Leyla');
    // The same provider id is not logged twice.
    expectStatus(await fakeHook({ inbound: { providerCallId: 'IN-1', from: '00994507654321', to: '+4930123456' } }), 200);
    expect(await prisma.call.count()).toBe(1);

    // Unknown number → matched to an earlier inquiry instead.
    const q = await prisma.inquiry.create({ data: { kind: 'contact', contactName: 'Nigar', email: 'n@x.az', phone: '+994 70 999 88 77', message: 'x', locale: 'az' } });
    const r2 = expectStatus(await fakeHook({ inbound: { providerCallId: 'IN-2', from: '0709998877', to: '+4930123456' } }), 200);
    expect((await prisma.call.findUniqueOrThrow({ where: { id: r2.body.callId } })).inquiryId).toBe(q.id);
  });

  it('keeps provider secrets out of the admin view', async () => {
    const admin = await asAdmin();
    const s = await configure(admin, { provider: 'twilio', twilio: { accountSid: `AC${'a'.repeat(32)}`, authToken: TWILIO_TOKEN } });
    expect(JSON.stringify(s)).not.toContain(TWILIO_TOKEN);
    expect(s.twilio).toEqual({ accountSid: `AC${'a'.repeat(32)}`, hasAuthToken: true });
    expect(s.webhooks.twilioVoice).toBe(`${BASE}/api/calls/webhooks/twilio/voice`);
    const stored = await prisma.setting.findUniqueOrThrow({ where: { key: 'calls' } });
    expect(JSON.stringify(stored.value)).not.toContain(TWILIO_TOKEN);
    // Saving without a token keeps the stored one.
    const again = await configure(admin, { provider: 'twilio', twilio: { accountSid: `AC${'a'.repeat(32)}` } });
    expect(again.twilio.hasAuthToken).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'CALLS_SETTINGS_UPDATED' } })).toBe(2);
  });
});

// ─── Twilio adapter (fake fetch) ───────────────────────────────────────

describe('Twilio adapter', () => {
  it('creates the call over REST with a TwiML bridge and verifies X-Twilio-Signature on callbacks', async () => {
    const admin = await asAdmin();
    const sid = `AC${'b'.repeat(32)}`;
    await configure(admin, { provider: 'twilio', recording: true, twilio: { accountSid: sid, authToken: TWILIO_TOKEN } });
    const requests: { url: string; init: RequestInit }[] = [];
    setCallsFetch(async (url, init) => {
      requests.push({ url, init });
      if (url.endsWith('.mp3')) return new Response(Buffer.from('ID3fake'), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
      return new Response(JSON.stringify({ sid: `CA${'1'.repeat(32)}` }), { status: 201, headers: { 'content-type': 'application/json' } });
    });
    const staff = await asStaff({ phone: '+994501110000' });
    const client = await asClient({ phone: '+4915112345678', locale: 'de' });
    const res = expectStatus(await staff.agent.post('/api/calls').send({ clientId: client.user.id }), 201);
    const callId = res.body.call.id;

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`);
    expect((requests[0].init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from(`${sid}:${TWILIO_TOKEN}`).toString('base64')}`);
    const form = new URLSearchParams(String(requests[0].init.body));
    expect(form.get('To')).toBe('+994501110000');
    expect(form.get('From')).toBe('+4930123456');
    expect(form.getAll('StatusCallbackEvent')).toEqual(['initiated', 'ringing', 'answered', 'completed']);
    expect(form.get('StatusCallback')).toBe(`${BASE}/api/calls/webhooks/twilio/status?callId=${callId}&leg=staff`);
    const twiml = form.get('Twiml')!;
    expect(twiml).toContain('>+4915112345678</Number>');
    expect(twiml).toContain('record="record-from-answer-dual"');
    expect(twiml).toContain(`/whisper?callId=${callId}`);

    const path = `/api/calls/webhooks/twilio/status?callId=${callId}&leg=client`;
    const params = { CallSid: `CA${'2'.repeat(32)}`, ParentCallSid: `CA${'1'.repeat(32)}`, CallStatus: 'in-progress', AccountSid: sid };
    const unsigned = await anon().post(path).type('form').send(params);
    expect(unsigned.status).toBe(403);
    const forged = await anon().post(path).type('form').set('x-twilio-signature', twilioSignature('wrong-token', `${BASE}${path}`, params)).send(params);
    expect(forged.status).toBe(403);
    const ok = await anon().post(path).type('form').set('x-twilio-signature', twilioSignature(TWILIO_TOKEN, `${BASE}${path}`, params)).send(params);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toContain('xml');
    expect(await prisma.call.findUniqueOrThrow({ where: { id: callId } })).toMatchObject({ status: 'IN_PROGRESS', providerLegId: params.CallSid });

    // Whisper: the legal notice in the client's language.
    const wPath = `/api/calls/webhooks/twilio/whisper?callId=${callId}`;
    const w = await anon().post(wPath).type('form').set('x-twilio-signature', twilioSignature(TWILIO_TOKEN, `${BASE}${wPath}`, {})).send({});
    expect(w.status).toBe(200);
    expect(w.text).toContain('<Say language="de-DE">Das Gespräch wird aufgezeichnet.</Say>');

    const done = { ...params, CallStatus: 'completed', CallDuration: '42' };
    expectStatus(await anon().post(path).type('form').set('x-twilio-signature', twilioSignature(TWILIO_TOKEN, `${BASE}${path}`, done)).send(done), 200);
    const recPath = `/api/calls/webhooks/twilio/recording?callId=${callId}`;
    const rec = { RecordingSid: `RE${'c'.repeat(32)}`, RecordingStatus: 'completed', RecordingUrl: 'https://api.twilio.com/x', CallSid: params.CallSid };
    expectStatus(await anon().post(recPath).type('form').set('x-twilio-signature', twilioSignature(TWILIO_TOKEN, `${BASE}${recPath}`, rec)).send(rec), 200);
    expect(await prisma.call.findUniqueOrThrow({ where: { id: callId } })).toMatchObject({ status: 'COMPLETED', durationSec: 42, recordingKey: rec.RecordingSid, recorded: true });

    // Recording playback: own call only (or ADMIN+), audited.
    const other = await asStaff();
    expect((await other.agent.get(`/api/calls/${callId}/recording`)).status).toBe(403);
    const audio = await staff.agent.get(`/api/calls/${callId}/recording`).buffer(true);
    expect(audio.status).toBe(200);
    expect(audio.headers['content-type']).toContain('audio/mpeg');
    expect(await prisma.auditLog.count({ where: { action: 'CALL_RECORDING_PLAYED' } })).toBe(1);
  });

  it('answers inbound calls with TwiML (notice + forward) and logs them', async () => {
    const admin = await asAdmin();
    await configure(admin, { provider: 'twilio', recording: true, inboundForwardTo: '+994124445566', twilio: { accountSid: `AC${'d'.repeat(32)}`, authToken: TWILIO_TOKEN } });
    const path = '/api/calls/webhooks/twilio/voice';
    const params = { CallSid: `CA${'9'.repeat(32)}`, From: '+994501234567', To: '+4930123456', Direction: 'inbound' };
    const res = await anon().post(path).type('form').set('x-twilio-signature', twilioSignature(TWILIO_TOKEN, `${BASE}${path}`, params)).send(params);
    expect(res.status).toBe(200);
    expect(res.text).toContain('<Say');
    expect(res.text).toContain('>+994124445566</Number>');
    expect(await prisma.call.findFirstOrThrow({ where: { providerCallId: params.CallSid } })).toMatchObject({ direction: 'INBOUND', provider: 'twilio', recorded: true });
  });
});

// ─── sipgate adapter (fake fetch) ──────────────────────────────────────

describe('sipgate adapter', () => {
  it('starts a session call, links push events by the secret-token URL and starts recording on answer', async () => {
    const admin = await asAdmin();
    const s = await configure(admin, { provider: 'sipgate', recording: true, sipgate: { tokenId: 'token-PAT1', token: 'pat-secret', deviceId: 'e0', allowedIps: [] } });
    expect(s.sipgate).toEqual({ tokenId: 'token-PAT1', hasToken: true, deviceId: 'e0', allowedIps: [] });
    const hookUrl = new URL(s.webhooks.sipgate);
    const token = hookUrl.searchParams.get('token')!;
    expect(token.length).toBeGreaterThan(20);

    const requests: { url: string; init: RequestInit }[] = [];
    setCallsFetch(async (url, init) => {
      requests.push({ url, init });
      if (url.endsWith('/recording')) return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ sessionId: 'SESSION-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const staff = await asStaff({ phone: '+4917612345678' });
    const res = expectStatus(await staff.agent.post('/api/calls').send({ phone: '+994 51 333 22 11' }), 201);
    expect(requests[0].url).toBe('https://api.sipgate.com/v2/sessions/calls');
    expect(JSON.parse(String(requests[0].init.body))).toEqual({ deviceId: 'e0', caller: '+4917612345678', callee: '+994513332211', callerId: '+4930123456' });
    expect((requests[0].init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('token-PAT1:pat-secret').toString('base64')}`);

    const push = (body: Record<string, string>, t = token) => anon().post(`/api/calls/webhooks/sipgate?token=${encodeURIComponent(t)}`).type('form').send(body);
    expect((await push({ event: 'newCall', direction: 'out', callId: 'PUSH-1', from: '4930123456', to: '994513332211' }, 'wrong')).status).toBe(403);
    const nc = await push({ event: 'newCall', direction: 'out', callId: 'PUSH-1', from: '4930123456', to: '+994513332211' });
    expect(nc.status).toBe(200);
    expect(nc.text).toContain('onAnswer=');
    expect(nc.text).toContain('onHangup=');
    expect(await prisma.call.findUniqueOrThrow({ where: { id: res.body.call.id } })).toMatchObject({ providerLegId: 'PUSH-1', status: 'RINGING' });

    expectStatus(await push({ event: 'answer', callId: 'PUSH-1', direction: 'out' }), 200);
    expect(requests.at(-1)!.url).toBe('https://api.sipgate.com/v2/calls/PUSH-1/recording');
    expect(JSON.parse(String(requests.at(-1)!.init.body))).toEqual({ value: true, announcement: true });
    expectStatus(await push({ event: 'hangup', callId: 'PUSH-1', cause: 'normalClearing', direction: 'out' }), 200);
    const done = await prisma.call.findUniqueOrThrow({ where: { id: res.body.call.id } });
    expect(done).toMatchObject({ status: 'COMPLETED', recorded: true });
    expect(done.answeredAt).not.toBeNull();

    // Inbound newCall → logged.
    expectStatus(await push({ event: 'newCall', direction: 'in', callId: 'PUSH-IN', from: '994501010101', to: '4930123456' }), 200);
    expect(await prisma.call.count({ where: { direction: 'INBOUND', provider: 'sipgate' } })).toBe(1);
  });
});

// ─── AI summary + follow-up tasks ──────────────────────────────────────

describe('AI summary', () => {
  it('summarises a transcript with the cheap model and turns follow-ups into tasks', async () => {
    clearAiSettingsCache();
    setKeyInfoFetcher(async () => null);
    setModelsFetcher(async () => []);
    const seen: string[] = [];
    setAiTransport(async function* (req): AsyncGenerator<StreamChunk> {
      seen.push(String(req.model));
      yield {
        choices: [{ delta: { content: JSON.stringify({ summary: 'Müştəri pasport surətini sabah göndərəcək.', followUps: [{ title: 'Pasport surətini yoxla', dueInDays: 1 }, { title: '', dueInDays: 2 }] }) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 300, completion_tokens: 60, cost: 0.0003 },
      };
    });
    const staff = await asStaff({ phone: '+994501112233' });
    const client = await asClient({ phone: '+994502223344' });
    const c = await createCaseVia(client.agent);
    const call = expectStatus(await staff.agent.post('/api/calls/log').send({ target: { caseId: c.id }, outcome: 'REACHED' }), 201).body.call;

    const none = await staff.agent.post(`/api/calls/${call.id}/summarize`);
    expect(none.status).toBe(409);
    expect(none.body.error).toBe('NO_TRANSCRIPT');

    expectStatus(await staff.agent.patch(`/api/calls/${call.id}`).send({ transcript: 'Staff: Salam. Client: Pasportu sabah göndərərəm.' }), 200);
    const s = expectStatus(await staff.agent.post(`/api/calls/${call.id}/summarize`), 200);
    expect(seen).toEqual(['anthropic/claude-haiku-5.5']);
    expect(s.body.call.summary).toBe('Müştəri pasport surətini sabah göndərəcək.');
    expect(s.body.call.followUps).toEqual([{ title: 'Pasport surətini yoxla', dueInDays: 1 }]);

    const t = expectStatus(await staff.agent.post(`/api/calls/${call.id}/tasks`).send({ title: 'Pasport surətini yoxla', dueInDays: 1 }), 201);
    const task = await prisma.task.findUniqueOrThrow({ where: { id: t.body.task.id }, include: { assignees: true } });
    expect(task).toMatchObject({ title: 'Pasport surətini yoxla', caseId: c.id, createdById: staff.user.id });
    expect(task.assignees.map((a) => a.userId)).toEqual([staff.user.id]);
  });
});

// ─── Office hours ──────────────────────────────────────────────────────

describe('office hours', () => {
  it('parses the site contact hours and offers 1-hour windows in Baku time', () => {
    const h = parseHoursText('Mon – Fri, 09:00 – 18:00')!;
    expect(h).toMatchObject({ days: [1, 2, 3, 4, 5], from: 540, to: 1080 });
    expect(parseHoursText('Пн – Сб, 10:00 – 14:00')).toMatchObject({ days: [1, 2, 3, 4, 5, 6], from: 600, to: 840 });
    // Wednesday 2026-10-21 10:50 Baku (06:50 UTC): 11:00 is only 10 min ahead, so today's first window is 12:00.
    const days = callbackWindows(h, new Date('2026-10-21T06:50:00Z'));
    expect(days[0].label).toBe('today');
    expect(days[0].windows[0]).toEqual({ start: '2026-10-21T08:00:00.000Z', end: '2026-10-21T09:00:00.000Z' });
    expect(days[0].windows.at(-1)!.start).toBe('2026-10-21T13:00:00.000Z'); // 17:00 Baku
    expect(days[1].windows).toHaveLength(9);
    // Friday evening → Saturday closed.
    const fri = callbackWindows(h, new Date('2026-10-23T15:00:00Z'));
    expect(fri[0].windows).toHaveLength(0);
    expect(fri[1].windows).toHaveLength(0);
  });
});

// ─── Callback requests ─────────────────────────────────────────────────

describe('callback requests', () => {
  const post = (body: Record<string, unknown>) => anon().post('/api/callback').set('Origin', ORIGIN).send({ name: 'Kamran Əliyev', phone: '+994 50 555 66 77', lang: 'ru', consent: true, source: 'contact', ...body });

  it('public request → inquiry + task due at the window start for the inquiry handlers + reminder 10 minutes before', async () => {
    const admin = await asAdmin({ locale: 'az' });
    await configure(admin);
    const slots = expectStatus(await anon().get('/api/callback/slots'), 200).body;
    expect(slots).toMatchObject({ timezone: 'Asia/Baku', open: true });
    const win = slots.days[1].windows[3];

    const bad = await post({ window: '2026-01-01T10:17:00.000Z' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('INVALID_WINDOW');

    const res = expectStatus(await post({ window: win.start, topic: 'work', email: 'kamran@mail.az', message: 'İş vizası' }), 201);
    expect(res.body.confirmation).toMatch(/^Спасибо! Наш сотрудник позвонит вам/);
    const cb = await prisma.callbackRequest.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(cb).toMatchObject({ phone: '+994505556677', locale: 'ru', status: 'PENDING', topic: 'work', source: 'contact' });
    expect(cb.windowStart.toISOString()).toBe(win.start);
    expect(cb.assigneeIds).toEqual([admin.user.id]);
    const inquiry = await prisma.inquiry.findUniqueOrThrow({ where: { id: cb.inquiryId! } });
    expect(inquiry).toMatchObject({ sector: 'Callback', phone: '+994505556677', email: 'kamran@mail.az' });
    const task = await prisma.task.findUniqueOrThrow({ where: { id: cb.taskId! }, include: { assignees: true } });
    expect(task.dueAt!.toISOString()).toBe(win.start);
    expect(task.title).toMatch(/^Geri zəng: Kamran Əliyev/);
    expect(task.assignees.map((a) => a.userId)).toEqual([admin.user.id]);
    await waitFor(async () => (await prisma.emailLog.count({ where: { to: 'kamran@mail.az' } })) > 0);

    // Reminder: not yet 15 min before, once at 10 min before, never twice.
    const start = new Date(win.start).getTime();
    expect(await runCallbackReminders(new Date(start - 15 * 60_000))).toBe(0);
    expect(await runCallbackReminders(new Date(start - 9 * 60_000))).toBe(1);
    expect(await runCallbackReminders(new Date(start - 8 * 60_000))).toBe(0);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: admin.user.id, type: 'CALLBACK_REMINDER' } });
    expect(n.title).toBe('10 dəqiqəyə zəng: Kamran Əliyev');

    // After the call: outcome → call log entry + task done + request closed.
    const out = expectStatus(await admin.agent.patch(`/api/calls/callbacks/${cb.id}`).send({ outcome: 'REACHED', note: 'Konsultasiyaya yazıldı' }), 200);
    expect(out.body.callback).toMatchObject({ status: 'DONE', outcome: 'REACHED' });
    expect(out.body.call).toMatchObject({ provider: 'manual', outcome: 'REACHED', callbackId: cb.id, inquiry: { id: inquiry.id } });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: cb.taskId! } })).status).toBe('DONE');
    expect(registeredJobs()).toContain('calls');
  });

  it('honeypot stores nothing; rate limit per IP; consent required', async () => {
    const admin = await asAdmin();
    await configure(admin);
    expectStatus(await post({ window: 'asap', website: 'http://spam' }), 201);
    expect(await prisma.callbackRequest.count()).toBe(0);
    expect((await post({ window: 'asap', consent: false })).status).toBe(400);
    for (let i = 0; i < 5; i++) expectStatus(await post({ window: 'asap' }), 201);
    const r = await post({ window: 'asap' });
    expect(r.status).toBe(429);
    const cb = await prisma.callbackRequest.findFirstOrThrow();
    expect(cb.asap).toBe(true);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: cb.taskId! } })).priority).toBe('URGENT');
  });

  it('portal client → linked to the client and assigned to the case manager', async () => {
    const admin = await asAdmin();
    await configure(admin);
    const manager = await asStaff();
    const client = await asClient({ phone: '+994 50 123 00 11', locale: 'de' });
    const c = await createCaseVia(client.agent);
    expectStatus(await admin.agent.patch(`/api/admin/cases/${c.id}`).send({ assignedStaffId: manager.user.id }), 200);
    const res = expectStatus(await client.agent.post('/api/callback').send({ name: 'Test User', phone: '+994501230011', lang: 'de', window: 'asap', source: 'portal', consent: true }), 201);
    expect(res.body.confirmation).toMatch(/^Vielen Dank! Unser Mitarbeiter ruft Sie so bald wie möglich an\./);
    const cb = await prisma.callbackRequest.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(cb).toMatchObject({ clientId: client.user.id, inquiryId: null, assigneeIds: [manager.user.id], email: client.user.email });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: cb.taskId! } })).caseId).toBe(c.id);
    // The staff queue lists it with the assignee.
    const list = expectStatus(await manager.agent.get('/api/calls/callbacks?mine=1'), 200);
    expect(list.body.callbacks.map((x: { id: string }) => x.id)).toEqual([cb.id]);
    // Click-to-call from the request (fake provider) links the call; the outcome closes the request.
    await prisma.user.update({ where: { id: manager.user.id }, data: { phone: '+994509990000' } });
    const call = expectStatus(await manager.agent.post('/api/calls').send({ callbackId: cb.id }), 201).body.call;
    expect(call).toMatchObject({ callbackId: cb.id, client: { id: client.user.id }, to: '+994501230011' });
    expectStatus(await manager.agent.patch(`/api/calls/${call.id}`).send({ outcome: 'CALL_BACK', note: 'Sabah' }), 200);
    expect(await prisma.callbackRequest.findUniqueOrThrow({ where: { id: cb.id } })).toMatchObject({ status: 'DONE', outcome: 'CALL_BACK', callId: call.id });
  });
});

// ─── Live chat ─────────────────────────────────────────────────────────

describe('live chat handover', () => {
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

  const start = (body: Record<string, unknown> = {}) =>
    anon()
      .post('/api/livechat')
      .set('Origin', ORIGIN)
      .send({ lang: 'az', name: 'Səbinə', transcript: [{ role: 'user', content: 'Ausbildung üçün almanca lazımdır?' }, { role: 'assistant', content: 'Adətən B1.' }], reason: 'asked', ...body });

  it('offline (nobody online) → 409 so the visitor gets the contact form', async () => {
    const admin = await asAdmin();
    await configure(admin);
    await asStaff();
    expect(expectStatus(await anon().get('/api/livechat/availability'), 200).body).toMatchObject({ available: false, officeOpen: true, staffOnline: 0 });
    const r = await start();
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('LIVECHAT_OFFLINE');
    // Outside office hours even with staff online.
    await configure(admin, { officeHours: { days: [], from: '09:00', to: '18:00' } });
    const staff = await asStaff();
    const s = collect(staff.user.id);
    expect(expectStatus(await anon().get('/api/livechat/availability'), 200).body).toMatchObject({ available: false, officeOpen: false });
    s.off();
  });

  it('queue → accept → realtime messages both ways over SSE → lead with the AI transcript', async () => {
    const admin = await asAdmin();
    await configure(admin);
    const staff = await asStaff({ firstName: 'Aynur' });
    const bus = collect(staff.user.id); // an open realtime stream = online
    expect(expectStatus(await anon().get('/api/livechat/availability'), 200).body).toMatchObject({ available: true, staffOnline: 1 });

    const res = expectStatus(await start({ message: 'Əməkdaşla danışmaq istəyirəm' }), 201);
    const { token, chat } = res.body as { token: string; chat: { id: string; status: string } };
    expect(chat.status).toBe('WAITING');
    const queued = bus.events.find((e) => e.type === 'livechat.queue');
    expect(queued?.payload).toMatchObject({ chatId: chat.id, change: 'new', name: 'Səbinə' });

    // Bad token.
    expect((await anon().get(`/api/livechat/${chat.id}?token=${chat.id}.nope`)).status).toBe(403);

    // Visitor SSE stream.
    const ac = new AbortController();
    const sse = await fetch(`${base}/api/livechat/${chat.id}/events?token=${encodeURIComponent(token)}`, { signal: ac.signal });
    expect(sse.headers.get('content-type')).toContain('text/event-stream');
    const reader = sse.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const readUntil = async (needle: string) => {
      for (let i = 0; i < 50 && !buf.includes(needle); i++) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
      }
      return buf;
    };
    await readUntil('"status":"WAITING"');

    const queue = expectStatus(await staff.agent.get('/api/livechat/staff/queue'), 200);
    expect(queue.body.chats[0]).toMatchObject({ id: chat.id, status: 'WAITING', visitorName: 'Səbinə' });

    const acc = expectStatus(await staff.agent.post(`/api/livechat/staff/${chat.id}/accept`), 200);
    expect(acc.body.chat).toMatchObject({ status: 'ACTIVE', staff: { id: staff.user.id } });
    expect(acc.body.chat.transcript).toHaveLength(2);
    const other = await asStaff();
    const second = await other.agent.post(`/api/livechat/staff/${chat.id}/accept`);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('LIVECHAT_TAKEN');
    expect(await readUntil('"staffName":"Aynur"')).toContain('event: livechat.status');

    expectStatus(await staff.agent.post(`/api/livechat/staff/${chat.id}/messages`).send({ body: 'Salam! Necə kömək edə bilərəm?' }), 201);
    expect(await readUntil('Necə kömək edə bilərəm')).toContain('event: livechat.message');
    expect((await other.agent.post(`/api/livechat/staff/${chat.id}/messages`).send({ body: 'x' })).status).toBe(403);

    const before = bus.events.length;
    expectStatus(await anon().post(`/api/livechat/${chat.id}/messages`).set('x-livechat-token', token).send({ body: 'Ausbildung haqqında' }), 201);
    expect(bus.events.slice(before).some((e) => e.type === 'livechat.message' && (e.payload.message as { body: string }).body === 'Ausbildung haqqında')).toBe(true);

    const lead = expectStatus(await staff.agent.post(`/api/livechat/staff/${chat.id}/lead`).send({ phone: '+994 50 777 88 99' }), 201);
    const inquiry = await prisma.inquiry.findUniqueOrThrow({ where: { id: lead.body.inquiry.id } });
    expect(inquiry).toMatchObject({ contactName: 'Səbinə', sector: 'Live chat', phone: '+994507778899' });
    expect(inquiry.message).toContain('Ausbildung üçün almanca lazımdır?');
    expect(inquiry.message).toContain('Ausbildung haqqında');

    // Link to an existing client, then close.
    const client = await asClient();
    expectStatus(await staff.agent.post(`/api/livechat/staff/${chat.id}/link`).send({ clientId: client.user.id }), 200);
    expectStatus(await staff.agent.post(`/api/livechat/staff/${chat.id}/close`), 200);
    await readUntil('"status":"CLOSED"');
    expect((await anon().post(`/api/livechat/${chat.id}/messages`).set('x-livechat-token', token).send({ body: 'hələ burdayam' })).status).toBe(409);
    ac.abort();
    bus.off();
  });

  it('nobody accepts within 2 minutes → MISSED → the visitor leaves a callback request', async () => {
    const admin = await asAdmin();
    await configure(admin);
    const staff = await asStaff();
    const bus = collect(staff.user.id);
    const { token, chat } = expectStatus(await start({ lang: 'en' }), 201).body as { token: string; chat: { id: string } };
    await prisma.liveChat.update({ where: { id: chat.id }, data: { createdAt: new Date(Date.now() - 3 * 60_000) } });
    expect(await expireWaiting()).toEqual([chat.id]);
    bus.off();
    const view = expectStatus(await anon().get(`/api/livechat/${chat.id}?token=${encodeURIComponent(token)}`), 200);
    expect(view.body.chat.status).toBe('MISSED');
    expect(view.body.chat.messages.at(-1)).toMatchObject({ author: 'SYSTEM', body: expect.stringContaining('All our colleagues are busy') });
    expect((await staff.agent.post(`/api/livechat/staff/${chat.id}/accept`)).status).toBe(409);

    const c = expectStatus(await anon().post(`/api/livechat/${chat.id}/contact`).send({ token, name: 'Sabina', phone: '+994 50 444 33 22', window: 'asap', consent: true }), 201);
    expect(c.body).toMatchObject({ kind: 'callback', confirmation: expect.stringContaining('Thank you!') });
    const cb = await prisma.callbackRequest.findUniqueOrThrow({ where: { id: c.body.id } });
    expect(cb).toMatchObject({ source: 'livechat', phone: '+994504443322', locale: 'en' });
    expect(cb.message).toContain('Ausbildung üçün almanca lazımdır?');
    expect((await prisma.liveChat.findUniqueOrThrow({ where: { id: chat.id } })).callbackId).toBe(cb.id);
    expect((await anon().post(`/api/livechat/${chat.id}/contact`).send({ token, name: 'Sabina', email: 's@x.az', consent: true })).status).toBe(409);
  });

  it('the AI advisor offers the human handover when unsure or asked', async () => {
    clearAiSettingsCache();
    setKeyInfoFetcher(async () => null);
    setModelsFetcher(async () => []);
    const replies = ['Bunu dəqiq bilmirəm. [[HUMAN]]', 'Salam!'];
    setAiTransport(async function* (): AsyncGenerator<StreamChunk> {
      yield { choices: [{ delta: { content: replies.shift() ?? 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0.0001 } };
    });
    const ask = (message: string) => anon().post('/api/public-ai/chat').set('Origin', ORIGIN).send({ sessionId: 'sess-calls-1234', lang: 'az', message });
    const a = expectStatus(await ask('Mavi Kart üçün maaş həddi nədir?'), 200);
    expect(a.body).toMatchObject({ reply: 'Bunu dəqiq bilmirəm.', offerHuman: true });
    const b = expectStatus(await ask('Salam'), 200);
    expect(b.body.offerHuman).toBe(false);
    const c = expectStatus(await ask('Real operator ilə danışa bilərəm?'), 200);
    expect(c.body.offerHuman).toBe(true);
  });
});
