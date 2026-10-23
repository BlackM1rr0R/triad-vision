import crypto from 'node:crypto';
import type { CallsSettings } from '../settings.js';
import { webhookBase } from '../settings.js';
import { CallProviderError, callsFetch, xmlEscape, type CallEvent, type CallState } from './types.js';
import type { CallProvider } from './types.js';

/**
 * sipgate (REST API v2 + sipgate.io Push API), plain fetch:
 *   POST https://api.sipgate.com/v2/sessions/calls  { deviceId, caller, callee, callerId }  → { sessionId }
 *     Auth: personal access token, HTTP Basic tokenId:token (scope sessions:calls:write).
 *     `caller` = the staff member's phone number (sipgate rings it first), `deviceId` is then required
 *     (e.g. "e0" / "p0"), `callerId` = the number shown to the client.
 *   PUT  https://api.sipgate.com/v2/calls/{callId}/recording  { value: true, announcement: true }  (scope rtcm:write)
 *     sipgate itself plays the recording announcement to all parties; recordings stay in the sipgate account.
 *   Push API (configured in the sipgate app: incoming + outgoing webhook URL): form-encoded POSTs
 *     event=newCall (from, to, direction in|out, callId, user[]), answer, hangup (cause normalClearing|busy|
 *     cancel|noAnswer|congestion|notFound|forwarded). answer/hangup are only sent when the newCall answer is
 *     <Response onAnswer="…" onHangup="…"/> (Content-Type application/xml).
 * Webhook authenticity: the Push API documents no signature, so the URL carries a long random secret
 * (?token=…, compared in constant time) and an optional source-IP allowlist (settings.sipgate.allowedIps).
 * Docs: api.sipgate.com/v2/doc (swagger), sipgate.io/push-api/api-references
 */

const apiBase = () => process.env.SIPGATE_API_URL || 'https://api.sipgate.com/v2';
const auth = (s: CallsSettings) => `Basic ${Buffer.from(`${s.sipgate.tokenId}:${s.sipgate.token}`).toString('base64')}`;

export const sipgateProvider: CallProvider = {
  name: 'sipgate',
  async clickToCall(input, s) {
    const res = await callsFetch(`${apiBase()}/sessions/calls`, {
      method: 'POST',
      headers: { authorization: auth(s), 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ deviceId: s.sipgate.deviceId, caller: input.staffNumber, callee: input.clientNumber, ...(input.callerId ? { callerId: input.callerId } : {}) }),
    });
    const data = (await res.json().catch(() => ({}))) as { sessionId?: string; message?: string };
    if (!res.ok || !data.sessionId) throw new CallProviderError(`sipgate ${res.status}: ${data.message ?? 'request failed'}`, res.status);
    return { providerCallId: data.sessionId };
  },
};

/** Starts recording of a running call (with sipgate's own announcement). */
export const sipgateStartRecording = async (s: CallsSettings, callId: string) => {
  const res = await callsFetch(`${apiBase()}/calls/${encodeURIComponent(callId)}/recording`, {
    method: 'PUT',
    headers: { authorization: auth(s), 'content-type': 'application/json' },
    body: JSON.stringify({ value: true, announcement: true }),
  });
  return res.ok;
};

export const verifySipgate = (s: CallsSettings, token: unknown, ip: string | undefined) => {
  const expected = s.sipgate.webhookToken;
  if (!expected || typeof token !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  if (s.sipgate.allowedIps.length && !s.sipgate.allowedIps.includes((ip ?? '').replace(/^::ffff:/, ''))) return false;
  return true;
};

export const sipgateFollowUpXml = (s: CallsSettings) => {
  const url = `${webhookBase(s)}/api/calls/webhooks/sipgate?token=${encodeURIComponent(s.sipgate.webhookToken)}`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response onAnswer="${xmlEscape(url)}" onHangup="${xmlEscape(url)}"/>`;
};

const HANGUP: Record<string, CallState> = { normalclearing: 'completed', busy: 'busy', cancel: 'canceled', noanswer: 'no-answer', congestion: 'failed', notfound: 'failed', forwarded: 'completed' };

/** answer / hangup → event of the client leg (sipgate reports the bridged call as one call). */
export const parseSipgateEvent = (p: Record<string, string>): CallEvent | null => {
  if (p.event === 'answer') return { leg: 'client', state: 'answered', providerLegId: p.callId };
  if (p.event === 'hangup') return { leg: 'client', state: HANGUP[(p.cause ?? '').toLowerCase()] ?? 'failed', providerLegId: p.callId };
  return null;
};
