import type { OutboundChannel, OutboundMessage, User } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { normalizePhone, sms, smsConfigured, whatsapp, whatsappConfigured } from './providers.js';

/**
 * Outbound WhatsApp / SMS. Every attempt is written to OutboundMessage (QUEUED → SENT | FAILED |
 * CONSOLE) and nothing here ever throws: the in-app notification is the source of truth, phone
 * channels are a convenience on top.
 *
 * WhatsApp note: Meta only delivers free-form text inside the 24-hour "customer service window"
 * that opens when the client last wrote to the business number. Outside it, only pre-approved
 * templates are delivered (whatsapp.sendTemplate). Set WHATSAPP_TEMPLATE_<TYPE>=template_name to
 * send a template for a notification type; otherwise plain text is sent and Meta answers with an
 * error (recorded as FAILED) when the window is closed.
 */

type Target = { userId?: string | null; caseId?: string | null; to?: string | null; templateKey?: string | null };
type UserPrefs = Pick<User, 'id' | 'phone' | 'whatsappOptIn' | 'smsNotifications' | 'isActive' | 'locale'>;

const record = (data: { channel: OutboundChannel; to: string; userId?: string | null; caseId?: string | null; templateKey?: string | null; body: string }) =>
  prisma.outboundMessage.create({ data });

const finish = (id: string, patch: { status: 'SENT' | 'FAILED' | 'CONSOLE'; providerId?: string; error?: string }) =>
  prisma.outboundMessage.update({ where: { id }, data: { ...patch, sentAt: patch.status === 'SENT' ? new Date() : null } }).catch((err) => {
    console.error('[messaging] could not update OutboundMessage', err);
    return null;
  });

const consoleLog = (channel: OutboundChannel, to: string, body: string) => {
  if (!config.isTest) console.log(`\n[${channel.toLowerCase()}:console] to=${to}\n  ${body.replace(/\n/g, '\n  ')}\n`);
};

const loadUser = async (userId: string | null | undefined): Promise<UserPrefs | null> =>
  userId
    ? prisma.user.findUnique({ where: { id: userId }, select: { id: true, phone: true, whatsappOptIn: true, smsNotifications: true, isActive: true, locale: true } })
    : null;

/** Delivers `body` through the given channel to a normalised number; the row is created first so failures are visible. */
export const deliver = async (
  channel: OutboundChannel,
  to: string,
  body: string,
  meta: { userId?: string | null; caseId?: string | null; templateKey?: string | null } = {},
): Promise<OutboundMessage | null> => {
  let row: OutboundMessage;
  try {
    row = await record({ channel, to, body, userId: meta.userId ?? null, caseId: meta.caseId ?? null, templateKey: meta.templateKey ?? null });
  } catch (err) {
    console.error('[messaging] could not write OutboundMessage', err);
    return null;
  }
  return sendRow(row);
};

/** Sends (or re-sends) an existing row. */
export const sendRow = async (row: OutboundMessage): Promise<OutboundMessage | null> => {
  try {
    const configured = row.channel === 'WHATSAPP' ? whatsappConfigured() : smsConfigured();
    if (!configured) {
      consoleLog(row.channel, row.to, row.body);
      return finish(row.id, { status: 'CONSOLE' });
    }
    try {
      const template = row.channel === 'WHATSAPP' && row.templateKey ? (process.env[`WHATSAPP_TEMPLATE_${row.templateKey}`] ?? '').trim() : '';
      const res =
        row.channel === 'WHATSAPP'
          ? template
            ? await whatsapp.sendTemplate(row.to, template, templateLang(row), [row.body])
            : await whatsapp.sendText(row.to, row.body)
          : await sms.send(row.to, row.body);
      return finish(row.id, { status: 'SENT', providerId: res.id || undefined });
    } catch (err) {
      console.error(`[messaging] ${row.channel} send failed`, err);
      return finish(row.id, { status: 'FAILED', error: String((err as Error).message ?? err).slice(0, 2000) });
    }
  } catch (err) {
    console.error('[messaging] unexpected', err);
    return null;
  }
};

/**
 * SMS that carries a secret (one-time codes): the provider gets `text`, the outbound log only
 * `logged` (the code masked), so nobody can read codes in the admin message log. Not retried from
 * the log (a resend would deliver the masked text). Returns the log row or null.
 */
export const sendSecretSms = async (rawTo: string, text: string, logged: string, templateKey = 'OTP'): Promise<OutboundMessage | null> => {
  const to = normalizePhone(rawTo);
  if (!to || !smsConfigured()) return null;
  let row: OutboundMessage;
  try {
    row = await record({ channel: 'SMS', to, body: logged, templateKey });
  } catch (err) {
    console.error('[messaging] could not write OutboundMessage', err);
    return null;
  }
  try {
    const res = await sms.send(to, text);
    return finish(row.id, { status: 'SENT', providerId: res.id || undefined });
  } catch (err) {
    console.error('[messaging] secret SMS failed', err);
    return finish(row.id, { status: 'FAILED', error: String((err as Error).message ?? err).slice(0, 2000) });
  }
};

const templateLang = (row: OutboundMessage) => (process.env[`WHATSAPP_TEMPLATE_LANG_${row.templateKey ?? ''}`] ?? process.env.WHATSAPP_TEMPLATE_LANG ?? 'en').trim() || 'en';

/**
 * WhatsApp message to a user (or a raw number). Respects `whatsappOptIn` and needs a phone number;
 * resolves silently to null when the message cannot go out.
 */
export const sendWhatsApp = async (target: Target, text: string): Promise<OutboundMessage | null> => {
  try {
    const user = await loadUser(target.userId);
    if (target.userId && (!user || !user.isActive || user.whatsappOptIn === false)) return null;
    const to = normalizePhone(target.to ?? user?.phone);
    if (!to) return null;
    return deliver('WHATSAPP', to, text, { userId: user?.id ?? null, caseId: target.caseId, templateKey: target.templateKey });
  } catch (err) {
    console.error('[messaging] sendWhatsApp', err);
    return null;
  }
};

/** SMS to a user (or a raw number). Respects `smsNotifications`. */
export const sendSms = async (target: Target, text: string): Promise<OutboundMessage | null> => {
  try {
    const user = await loadUser(target.userId);
    if (target.userId && (!user || !user.isActive || user.smsNotifications === false)) return null;
    const to = normalizePhone(target.to ?? user?.phone);
    if (!to) return null;
    return deliver('SMS', to, text, { userId: user?.id ?? null, caseId: target.caseId, templateKey: target.templateKey });
  } catch (err) {
    console.error('[messaging] sendSms', err);
    return null;
  }
};

/**
 * Which phone channel a reminder should use for this user: WhatsApp when opted in (preferred,
 * especially when its provider is configured), otherwise SMS when opted in. Null → no phone channel.
 */
export const preferredChannel = (user: Pick<User, 'phone' | 'whatsappOptIn' | 'smsNotifications'>): OutboundChannel | null => {
  if (!normalizePhone(user.phone)) return null;
  const wa = user.whatsappOptIn !== false;
  const sm = user.smsNotifications !== false;
  if (wa && whatsappConfigured()) return 'WHATSAPP';
  if (sm && smsConfigured()) return 'SMS';
  if (wa) return 'WHATSAPP';
  if (sm) return 'SMS';
  return null;
};

/** Re-sends a FAILED (or stuck QUEUED) row in place. */
export const resendOutbound = async (id: string) => {
  const row = await prisma.outboundMessage.findUnique({ where: { id } });
  if (!row) return null;
  const reset = await prisma.outboundMessage.update({ where: { id }, data: { status: 'QUEUED', error: null, providerId: null, sentAt: null } });
  return sendRow(reset);
};
