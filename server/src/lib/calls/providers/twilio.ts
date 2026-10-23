import crypto from 'node:crypto';
import type { CallsSettings } from '../settings.js';
import { webhookBase } from '../settings.js';
import { CallProviderError, callsFetch, xmlEscape, type CallEvent, type CallLeg, type CallProvider, type CallState } from './types.js';

/**
 * Twilio Programmable Voice, plain REST (no SDK):
 *   POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Calls.json  (Basic auth AccountSid:AuthToken)
 *     To = staff phone, From = caller ID, Twiml = <Dial> bridge to the client,
 *     StatusCallback (+ StatusCallbackEvent initiated/ringing/answered/completed) for the staff leg.
 *   The <Number> inside <Dial> has its own statusCallback (client leg) and, when recording, `url` = a TwiML
 *   "whisper" that plays the recording notice to the client before connecting; <Dial record=
 *   "record-from-answer-dual" recordingStatusCallback=…> reports RecordingSid / RecordingUrl.
 * Webhook authenticity: X-Twilio-Signature = Base64(HMAC-SHA1(AuthToken, fullUrl + Σ sorted(name+value)))
 * over the exact public URL Twilio called (webhookBaseUrl + original path/query).
 * Docs: twilio.com/docs/voice/api/call-resource, /docs/voice/twiml/dial, /docs/usage/webhooks/webhooks-security
 */

const apiBase = () => process.env.TWILIO_API_URL || 'https://api.twilio.com';

const auth = (s: CallsSettings) => `Basic ${Buffer.from(`${s.twilio.accountSid}:${s.twilio.authToken}`).toString('base64')}`;

const LANG: Record<string, string> = { az: 'tr-TR', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }; // Twilio <Say> has no Azerbaijani voice

export const twilioUrls = (s: CallsSettings, callId: string) => {
  const base = `${webhookBase(s)}/api/calls/webhooks/twilio`;
  const q = `callId=${encodeURIComponent(callId)}`;
  return {
    staffStatus: `${base}/status?${q}&leg=staff`,
    clientStatus: `${base}/status?${q}&leg=client`,
    recording: `${base}/recording?${q}`,
    whisper: `${base}/whisper?${q}`,
  };
};

/** TwiML run on the staff leg once the staff member picks up: bridge to the client. */
export const bridgeTwiml = (o: { clientNumber: string; callerId: string; record: boolean; urls: ReturnType<typeof twilioUrls> }) => {
  const rec = o.record ? ` record="record-from-answer-dual" recordingStatusCallback="${xmlEscape(o.urls.recording)}" recordingStatusCallbackEvent="completed"` : '';
  const whisper = o.record ? ` url="${xmlEscape(o.urls.whisper)}"` : '';
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${xmlEscape(o.callerId)}" answerOnBridge="true"${rec}>` +
    `<Number statusCallback="${xmlEscape(o.urls.clientStatus)}" statusCallbackEvent="initiated ringing answered completed" statusCallbackMethod="POST"${whisper}>${xmlEscape(o.clientNumber)}</Number>` +
    `</Dial></Response>`
  );
};

export const sayTwiml = (text: string, locale: string, then = '') =>
  `<?xml version="1.0" encoding="UTF-8"?><Response>${text ? `<Say language="${LANG[locale] ?? 'en-GB'}">${xmlEscape(text)}</Say>` : ''}${then}</Response>`;

/** Inbound call to the Twilio number: optional notice, then forward to the office line (or a short message). */
export const inboundTwiml = (o: { forwardTo: string; callerId: string; notice: string | null; locale: string; clientStatusUrl: string; recordingUrl: string; closedText: string }) => {
  if (!o.forwardTo) return sayTwiml(o.closedText, o.locale, '<Hangup/>');
  const rec = o.notice ? ` record="record-from-answer-dual" recordingStatusCallback="${xmlEscape(o.recordingUrl)}" recordingStatusCallbackEvent="completed"` : '';
  const say = o.notice ? `<Say language="${LANG[o.locale] ?? 'en-GB'}">${xmlEscape(o.notice)}</Say>` : '';
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>${say}<Dial${rec}>` +
    `<Number statusCallback="${xmlEscape(o.clientStatusUrl)}" statusCallbackEvent="initiated ringing answered completed" statusCallbackMethod="POST">${xmlEscape(o.forwardTo)}</Number>` +
    `</Dial></Response>`
  );
};

/** Expected X-Twilio-Signature for a form POST. */
export const twilioSignature = (authToken: string, url: string, params: Record<string, string | string[]>) => {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => {
      const v = params[k];
      return acc + (Array.isArray(v) ? [...v].sort().map((x) => k + x).join('') : k + v);
    }, url);
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
};

export const verifyTwilio = (authToken: string, url: string, params: Record<string, string | string[]>, header: string | undefined) => {
  if (!authToken || !header) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const got = Buffer.from(header);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
};

const STATE: Record<string, CallState | null> = {
  queued: null,
  initiated: null,
  ringing: 'ringing',
  'in-progress': 'answered',
  answered: 'answered',
  completed: 'completed',
  busy: 'busy',
  'no-answer': 'no-answer',
  failed: 'failed',
  canceled: 'canceled',
};

/** Status callback params → CallEvent (null for events we do not track). */
export const parseTwilioStatus = (leg: CallLeg, p: Record<string, string>): CallEvent | null => {
  const state = STATE[(p.CallStatus ?? '').toLowerCase()] ?? null;
  if (!state) return null;
  const d = Number(p.CallDuration);
  return { leg, state, ...(Number.isFinite(d) && p.CallDuration ? { durationSec: d } : {}), ...(p.CallSid ? { providerLegId: p.CallSid } : {}) };
};

export const twilioProvider: CallProvider = {
  name: 'twilio',
  async clickToCall(input, s) {
    const urls = twilioUrls(s, input.callId);
    const body = new URLSearchParams();
    body.set('To', input.staffNumber);
    body.set('From', input.callerId);
    body.set('Twiml', bridgeTwiml({ clientNumber: input.clientNumber, callerId: input.callerId, record: input.record, urls }));
    body.set('StatusCallback', urls.staffStatus);
    body.set('StatusCallbackMethod', 'POST');
    for (const e of ['initiated', 'ringing', 'answered', 'completed']) body.append('StatusCallbackEvent', e);
    const res = await callsFetch(`${apiBase()}/2010-04-01/Accounts/${encodeURIComponent(s.twilio.accountSid)}/Calls.json`, {
      method: 'POST',
      headers: { authorization: auth(s), 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok || !data.sid) throw new CallProviderError(`Twilio ${res.status}: ${data.message ?? 'request failed'}`, res.status);
    return { providerCallId: data.sid };
  },
  async fetchRecording(key, s) {
    if (!/^RE[0-9a-f]{32}$/i.test(key)) return null;
    const res = await callsFetch(`${apiBase()}/2010-04-01/Accounts/${encodeURIComponent(s.twilio.accountSid)}/Recordings/${key}.mp3`, { method: 'GET', headers: { authorization: auth(s) } });
    return res.ok ? res : null;
  },
};
