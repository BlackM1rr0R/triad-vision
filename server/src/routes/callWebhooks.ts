import express, { Router, type Request, type Response } from 'express';
import { prisma } from '../db.js';
import { forbidden, limiter } from '../lib/http.js';
import { config } from '../config.js';
import { getCallsSettings, webhookBase } from '../lib/calls/settings.js';
import { applyEvent, findByProviderId, logInbound, normPhone } from '../lib/calls/service.js';
import { callTexts } from '../lib/calls/texts.js';
import { inboundTwiml, parseTwilioStatus, sayTwiml, twilioUrls, verifyTwilio } from '../lib/calls/providers/twilio.js';
import { parseSipgateEvent, sipgateFollowUpXml, sipgateStartRecording, verifySipgate } from '../lib/calls/providers/sipgate.js';
import { verifyFake } from '../lib/calls/providers/fake.js';
import type { CallLeg, CallState } from '../lib/calls/providers/types.js';

/**
 * Provider webhooks (/api/calls/webhooks) — mounted in app.ts before the session / CSRF middleware: the
 * providers have no session. Every request is verified first:
 *   Twilio  X-Twilio-Signature (HMAC-SHA1 with the auth token over the public URL + sorted form params)
 *   sipgate long random ?token= secret (+ optional source-IP allowlist) — the Push API has no signature
 *   fake    X-Fake-Signature (HMAC-SHA256 over the raw JSON body; tests / local demo only)
 * Answers are TwiML / sipgate XML where the provider expects instructions, otherwise empty 200s.
 */
export const callWebhooksRouter = Router();
callWebhooksRouter.use(limiter({ windowMs: 60 * 1000, limit: 600, skip: () => config.isTest }));
callWebhooksRouter.use(express.urlencoded({ extended: false, limit: '200kb' }));

type RawRequest = Request & { rawBody?: Buffer };
type Params = Record<string, string>;

const xml = (res: Response, body: string) => {
  res.status(200).type('application/xml').send(body);
};
const flat = (body: unknown): Params => {
  const out: Params = {};
  if (body && typeof body === 'object') for (const [k, v] of Object.entries(body as Record<string, unknown>)) out[k] = Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '');
  return out;
};
const callIdOf = (req: Request) => (typeof req.query.callId === 'string' && req.query.callId.length <= 40 ? req.query.callId : '');

// ─── Twilio ────────────────────────────────────────────────────────────

const twilioGuard = async (req: Request) => {
  const s = await getCallsSettings();
  const url = `${webhookBase(s)}${req.originalUrl}`;
  const params = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, string | string[]>;
  if (!verifyTwilio(s.twilio.authToken, url, params, req.get('x-twilio-signature'))) throw forbidden('WEBHOOK_SIGNATURE_INVALID');
  return s;
};

callWebhooksRouter.post('/twilio/status', async (req, res) => {
  await twilioGuard(req);
  const leg: CallLeg = req.query.leg === 'client' ? 'client' : 'staff';
  const p = flat(req.body);
  const ev = parseTwilioStatus(leg, p);
  const id = callIdOf(req) || (p.ParentCallSid || p.CallSid ? (await findByProviderId('twilio', p.ParentCallSid || p.CallSid))?.id : '');
  if (ev && id) await applyEvent(id, ev);
  xml(res, '<?xml version="1.0" encoding="UTF-8"?><Response/>');
});

callWebhooksRouter.post('/twilio/recording', async (req, res) => {
  await twilioGuard(req);
  const p = flat(req.body);
  const id = callIdOf(req) || (p.CallSid ? (await findByProviderId('twilio', p.CallSid))?.id : '');
  if (id && p.RecordingSid && (!p.RecordingStatus || p.RecordingStatus === 'completed')) {
    await prisma.call.updateMany({ where: { id }, data: { recordingKey: p.RecordingSid.slice(0, 200), recorded: true } });
  }
  xml(res, '<?xml version="1.0" encoding="UTF-8"?><Response/>');
});

/** Played to the client before the bridge when recording is on (the legal notice). */
callWebhooksRouter.post('/twilio/whisper', async (req, res) => {
  const s = await twilioGuard(req);
  const call = await prisma.call.findUnique({ where: { id: callIdOf(req) } });
  let locale = 'az';
  if (call?.clientId) locale = (await prisma.user.findUnique({ where: { id: call.clientId }, select: { locale: true } }))?.locale ?? 'az';
  xml(res, sayTwiml(s.recording ? s.recordingNotice[locale as 'az'] : '', locale));
});

/** Inbound call to the Twilio number (configure as the number's "A call comes in" webhook, HTTP POST). */
callWebhooksRouter.post('/twilio/voice', async (req, res) => {
  const s = await twilioGuard(req);
  const p = flat(req.body);
  if (!p.CallSid) {
    xml(res, sayTwiml('', 'en', '<Hangup/>'));
    return;
  }
  const call = await logInbound('twilio', { providerCallId: p.CallSid, from: p.From ?? '', to: p.To ?? '' });
  let locale = 'az';
  if (call.clientId) locale = (await prisma.user.findUnique({ where: { id: call.clientId }, select: { locale: true } }))?.locale ?? 'az';
  const urls = twilioUrls(s, call.id);
  if (s.recording) await prisma.call.update({ where: { id: call.id }, data: { recorded: true } });
  xml(
    res,
    inboundTwiml({
      forwardTo: normPhone(s.inboundForwardTo) ?? '',
      callerId: s.callerId,
      notice: s.recording ? s.recordingNotice[locale as 'az'] : null,
      locale,
      clientStatusUrl: urls.clientStatus,
      recordingUrl: urls.recording,
      closedText: callTexts(locale).closed,
    }),
  );
});

// ─── sipgate ───────────────────────────────────────────────────────────

callWebhooksRouter.post('/sipgate', async (req, res) => {
  const s = await getCallsSettings();
  if (!verifySipgate(s, req.query.token, req.ip)) throw forbidden('WEBHOOK_SIGNATURE_INVALID');
  const p = flat(req.body);
  if (p.event === 'newCall') {
    if (p.direction === 'in') {
      await logInbound('sipgate', { providerCallId: p.callId ?? '', from: p.from ?? '', to: p.to ?? '' });
    } else {
      // Our click-to-call session: the push callId differs from the sessionId, so match the newest open
      // outbound sipgate call to the same number.
      const to = normPhone(p.to);
      const open = await prisma.call.findMany({
        where: { provider: 'sipgate', direction: 'OUTBOUND', providerLegId: null, status: { in: ['QUEUED', 'RINGING_STAFF', 'RINGING'] }, startedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } },
        orderBy: { startedAt: 'desc' },
        take: 20,
      });
      const call = open.find((c) => !to || c.toNumber === to) ?? null;
      if (call && p.callId) {
        await prisma.call.update({ where: { id: call.id }, data: { providerLegId: p.callId.slice(0, 80) } });
        await applyEvent(call.id, { leg: 'client', state: 'ringing' });
      }
    }
    xml(res, sipgateFollowUpXml(s));
    return;
  }
  const ev = parseSipgateEvent(p);
  const call = p.callId ? await findByProviderId('sipgate', p.callId) : null;
  if (ev && call) {
    await applyEvent(call.id, ev);
    if (ev.state === 'answered' && s.recording && !call.recorded) {
      const ok = await sipgateStartRecording(s, p.callId).catch(() => false);
      if (ok) await prisma.call.update({ where: { id: call.id }, data: { recorded: true } });
    }
  }
  res.status(200).end();
});

// ─── Fake (tests / local demo) ─────────────────────────────────────────

callWebhooksRouter.post('/fake', async (req: RawRequest, res) => {
  if (config.isProd) throw forbidden('FAKE_PROVIDER_NOT_ALLOWED');
  if (!verifyFake(req.rawBody, req.get('x-fake-signature'))) throw forbidden('WEBHOOK_SIGNATURE_INVALID');
  const b = (req.body ?? {}) as {
    providerCallId?: string;
    leg?: CallLeg;
    state?: CallState;
    durationSec?: number;
    recordingKey?: string;
    transcript?: string;
    inbound?: { providerCallId: string; from: string; to: string };
  };
  if (b.inbound) {
    const call = await logInbound('fake', b.inbound);
    res.json({ ok: true, callId: call.id });
    return;
  }
  const call = b.providerCallId ? await findByProviderId('fake', String(b.providerCallId)) : null;
  if (!call) {
    res.json({ ok: true, ignored: true });
    return;
  }
  if (b.leg && b.state) await applyEvent(call.id, { leg: b.leg, state: b.state, ...(typeof b.durationSec === 'number' ? { durationSec: b.durationSec } : {}) });
  if (b.recordingKey || b.transcript) {
    await prisma.call.update({
      where: { id: call.id },
      data: { ...(b.recordingKey ? { recordingKey: String(b.recordingKey).slice(0, 200), recorded: true } : {}), ...(b.transcript ? { transcript: String(b.transcript).slice(0, 60_000) } : {}) },
    });
  }
  res.json({ ok: true, callId: call.id });
});
