/**
 * WhatsApp (Meta Cloud API) and SMS (Twilio-compatible or generic HTTP JSON gateway) providers.
 *
 * Configuration is read from process.env at call time (documented in server/.env.example, block
 * "Messaging"). When a provider is not configured the caller (outbound.ts) records the message with
 * status CONSOLE instead of sending it, exactly like the mailer does without SMTP.
 *
 *   WHATSAPP_TOKEN            permanent system-user access token (Meta Business)
 *   WHATSAPP_PHONE_NUMBER_ID  the sender phone number id from the WhatsApp Business app
 *   WHATSAPP_API_VERSION      Graph API version, default v20.0
 *   WHATSAPP_VERIFY_TOKEN     chosen by us; Meta echoes it on the webhook verification GET
 *   WHATSAPP_APP_SECRET       Meta app secret; signs webhook POSTs (X-Hub-Signature-256)
 *   WHATSAPP_WEBHOOK_SECRET   fallback: ?token=… on the webhook URL when the raw body is unavailable
 *   SMS_PROVIDER              twilio | http | (empty = not configured)
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM   (SMS_PROVIDER=twilio; TWILIO_API_URL optional)
 *   SMS_HTTP_URL, SMS_HTTP_AUTH                          (SMS_PROVIDER=http; POST {to, text})
 *   SMS_DEFAULT_COUNTRY_CODE  country code assumed for local numbers (default 994)
 */

const env = (name: string) => (process.env[name] ?? '').trim();

export class ProviderError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ProviderError';
  }
}

// ─── Phone numbers ─────────────────────────────────────────────────────

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Normalises a phone number to E.164 (+994501234567, +4915112345678). Accepts spaces, dashes and
 * parentheses, "00" international prefixes and local numbers with a leading 0 (assumed to belong
 * to SMS_DEFAULT_COUNTRY_CODE, Azerbaijan by default). Returns null when nothing sensible remains.
 */
export const normalizePhone = (raw: string | null | undefined, defaultCountry = env('SMS_DEFAULT_COUNTRY_CODE') || '994'): string | null => {
  if (!raw) return null;
  let s = raw.replace(/[\s\-().]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!s.startsWith('+')) {
    if (s.startsWith('0')) s = `+${defaultCountry}${s.slice(1)}`;
    else if (s.length <= 9) s = `+${defaultCountry}${s}`;
    else s = `+${s}`;
  }
  if (!/^\+\d+$/.test(s)) return null;
  return E164.test(s) ? s : null;
};

/** "+994501234567" → "+994 •• ••• 4567" for logs and the admin UI. */
export const maskPhone = (phone: string) => (phone.length > 6 ? `${phone.slice(0, 4)}${'•'.repeat(Math.max(0, phone.length - 8))}${phone.slice(-4)}` : phone);

const maskId = (id: string) => (id.length > 6 ? `${id.slice(0, 3)}…${id.slice(-3)}` : id ? '•••' : '');

// ─── WhatsApp (Meta Cloud API) ─────────────────────────────────────────

export const whatsappConfigured = () => !!(env('WHATSAPP_TOKEN') && env('WHATSAPP_PHONE_NUMBER_ID'));

const graphUrl = () => `https://graph.facebook.com/${env('WHATSAPP_API_VERSION') || 'v20.0'}/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`;

const graphPost = async (payload: Record<string, unknown>): Promise<{ id: string }> => {
  const res = await fetch(graphUrl(), {
    method: 'POST',
    headers: { authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
  });
  const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
  if (!res.ok) throw new ProviderError(`WhatsApp ${res.status}: ${data.error?.message ?? 'request failed'}`, res.status);
  return { id: data.messages?.[0]?.id ?? '' };
};

export const whatsapp = {
  /** Free-form text; only delivered inside the 24-hour customer service window (see outbound.ts). */
  sendText: (to: string, body: string) => graphPost({ to: to.replace(/^\+/, ''), type: 'text', text: { preview_url: false, body: body.slice(0, 4096) } }),
  /** Pre-approved template (business-initiated messages outside the 24-hour window). */
  sendTemplate: (to: string, templateName: string, lang: string, params: string[] = []) =>
    graphPost({
      to: to.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: lang },
        ...(params.length ? { components: [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) }] } : {}),
      },
    }),
};

// ─── SMS ───────────────────────────────────────────────────────────────

export type SmsProviderName = 'twilio' | 'http';

export const smsProvider = (): SmsProviderName | null => {
  const p = env('SMS_PROVIDER').toLowerCase();
  if (p === 'twilio' && env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_FROM')) return 'twilio';
  if (p === 'http' && env('SMS_HTTP_URL')) return 'http';
  return null;
};
export const smsConfigured = () => smsProvider() !== null;

const sendTwilio = async (to: string, text: string): Promise<{ id: string }> => {
  const sid = env('TWILIO_ACCOUNT_SID');
  const base = env('TWILIO_API_URL') || 'https://api.twilio.com';
  const res = await fetch(`${base}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${sid}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: env('TWILIO_FROM'), Body: text.slice(0, 1600) }).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) throw new ProviderError(`SMS ${res.status}: ${data.message ?? 'request failed'}`, res.status);
  return { id: data.sid ?? '' };
};

const sendHttpGateway = async (to: string, text: string): Promise<{ id: string }> => {
  const res = await fetch(env('SMS_HTTP_URL'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(env('SMS_HTTP_AUTH') ? { authorization: env('SMS_HTTP_AUTH') } : {}) },
    body: JSON.stringify({ to, text: text.slice(0, 1600) }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string; error?: string; message?: string };
  if (!res.ok) throw new ProviderError(`SMS ${res.status}: ${data.error ?? data.message ?? 'request failed'}`, res.status);
  return { id: String(data.id ?? data.messageId ?? '') };
};

export const sms = {
  send: (to: string, text: string) => {
    const p = smsProvider();
    if (p === 'twilio') return sendTwilio(to, text);
    if (p === 'http') return sendHttpGateway(to, text);
    return Promise.reject(new ProviderError('SMS provider not configured'));
  },
};

// ─── Status for the admin page ─────────────────────────────────────────

export const providerStatus = () => ({
  whatsapp: {
    configured: whatsappConfigured(),
    phoneNumberId: maskId(env('WHATSAPP_PHONE_NUMBER_ID')),
    apiVersion: env('WHATSAPP_API_VERSION') || 'v20.0',
    webhookVerify: !!env('WHATSAPP_VERIFY_TOKEN'),
    webhookSignature: !!env('WHATSAPP_APP_SECRET'),
    webhookSecret: !!env('WHATSAPP_WEBHOOK_SECRET'),
  },
  sms: {
    configured: smsConfigured(),
    provider: smsProvider() ?? (env('SMS_PROVIDER') ? `${env('SMS_PROVIDER')} (incomplete)` : null),
    from: smsProvider() === 'twilio' ? maskPhone(env('TWILIO_FROM')) : null,
    url: smsProvider() === 'http' ? env('SMS_HTTP_URL').replace(/^(https?:\/\/[^/]+).*$/, '$1/…') : null,
    accountSid: smsProvider() === 'twilio' ? maskId(env('TWILIO_ACCOUNT_SID')) : null,
  },
  defaultCountryCode: env('SMS_DEFAULT_COUNTRY_CODE') || '994',
});
