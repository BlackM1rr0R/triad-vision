import crypto from 'node:crypto';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { notifyStaff } from '../notifications.js';
import { createCaseMessage } from './caseMessages.js';
import { normalizePhone } from './providers.js';

/**
 * Inbound WhatsApp (Meta Cloud API webhook). A text from a known client lands in the chat of their
 * active case (channel "whatsapp", de-duplicated by the provider message id); anything else becomes
 * a contact Inquiry so nothing is lost.
 */

const env = (name: string) => (process.env[name] ?? '').trim();

export const verifyToken = () => env('WHATSAPP_VERIFY_TOKEN');
export const appSecret = () => env('WHATSAPP_APP_SECRET');
export const webhookSecret = () => env('WHATSAPP_WEBHOOK_SECRET');

/** True when the webhook needs some verification (app secret or URL secret configured). */
export const webhookProtected = () => !!(appSecret() || webhookSecret());

/** Constant-time compare of two strings (false for different lengths). */
const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/** X-Hub-Signature-256: "sha256=" + HMAC-SHA256(app secret, raw body). */
export const validSignature = (rawBody: Buffer | undefined, header: string | undefined) => {
  const secret = appSecret();
  if (!secret || !rawBody || !header) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return safeEqual(expected, header.trim());
};

export const validUrlSecret = (token: unknown) => {
  const secret = webhookSecret();
  return !!secret && typeof token === 'string' && safeEqual(secret, token);
};

// ─── Payload shape (only what we read) ─────────────────────────────────

interface WaMessage {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: { body: string };
  button?: { text: string };
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
  image?: { caption?: string };
  document?: { caption?: string; filename?: string };
}
interface WaChange {
  field?: string;
  value?: { messages?: WaMessage[]; contacts?: { wa_id: string; profile?: { name?: string } }[] };
}
export interface WaWebhookBody {
  object?: string;
  entry?: { changes?: WaChange[] }[];
}

/** Readable text of an inbound message (captions for media, labels for button replies). */
const textOf = (m: WaMessage): string | null => {
  switch (m.type) {
    case 'text':
      return m.text?.body ?? null;
    case 'button':
      return m.button?.text ?? null;
    case 'interactive':
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
    case 'image':
      return m.image?.caption ? `[image] ${m.image.caption}` : '[image]';
    case 'document':
      return `[document] ${m.document?.filename ?? ''}${m.document?.caption ? ` — ${m.document.caption}` : ''}`.trim();
    case 'audio':
    case 'video':
    case 'sticker':
    case 'location':
      return `[${m.type}]`;
    default:
      return null;
  }
};

/** Candidate spellings of a number as users type them into their profile. */
const spellings = (e164: string, defaultCountry: string) => {
  const digits = e164.slice(1);
  const out = new Set<string>([e164, digits, `00${digits}`]);
  if (digits.startsWith(defaultCountry)) {
    const local = digits.slice(defaultCountry.length);
    out.add(local);
    out.add(`0${local}`);
  }
  return Array.from(out);
};

/** Finds the client whose profile phone matches the WhatsApp number (exact spellings first, then a normalised scan). */
export const findUserByPhone = async (e164: string) => {
  const defaultCountry = env('SMS_DEFAULT_COUNTRY_CODE') || '994';
  const exact = await prisma.user.findFirst({
    where: { phone: { in: spellings(e164, defaultCountry) }, isActive: true },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });
  if (exact) return exact;
  // Profiles hold numbers as people type them ("050 123 45 67"): compare normalised, newest clients first.
  const candidates = await prisma.user.findMany({
    where: { isActive: true, phone: { not: null }, role: { in: ['CLIENT', 'COMPANY'] } },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  return candidates.find((u) => normalizePhone(u.phone) === e164) ?? null;
};

export interface InboundResult {
  messages: number;
  inquiries: number;
  duplicates: number;
  ignored: number;
}

/** Processes one webhook body. Never throws for a single bad message: the next one is still handled. */
export const handleWhatsAppWebhook = async (body: WaWebhookBody): Promise<InboundResult> => {
  const result: InboundResult = { messages: 0, inquiries: 0, duplicates: 0, ignored: 0 };
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length) continue;
      const names = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? '']));
      for (const m of value.messages) {
        try {
          const text = textOf(m);
          if (!text || !m.from || !m.id) {
            result.ignored++;
            continue;
          }
          const e164 = normalizePhone(`+${m.from.replace(/^\+/, '')}`);
          if (!e164) {
            result.ignored++;
            continue;
          }
          const outcome = await storeInbound({ externalId: m.id, from: e164, text: text.slice(0, 4000), name: names.get(m.from) ?? '' });
          result[outcome]++;
        } catch (err) {
          console.error('[whatsapp] inbound message failed', err);
          result.ignored++;
        }
      }
    }
  }
  return result;
};

/**
 * Routes one inbound text: known client with an open case → CaseMessage; otherwise an Inquiry.
 * Returns which bucket it went to.
 */
export const storeInbound = async (m: { externalId: string; from: string; text: string; name: string }): Promise<'messages' | 'inquiries' | 'duplicates'> => {
  if (await prisma.caseMessage.count({ where: { externalId: m.externalId } })) return 'duplicates';
  const user = await findUserByPhone(m.from);
  const activeCase = user
    ? await prisma.case.findFirst({ where: { clientId: user.id, status: { notIn: FINAL_STATUSES } }, orderBy: { updatedAt: 'desc' }, select: { id: true } })
    : null;
  if (user && activeCase) {
    const created = await createCaseMessage({ caseId: activeCase.id, authorId: user.id, body: m.text, side: 'client', channel: 'whatsapp', externalId: m.externalId });
    return created ? 'messages' : 'duplicates';
  }
  // Unknown number (or no open case): keep it as a contact inquiry; the dedupe key lives in the message text.
  const marker = `[whatsapp:${m.externalId}]`;
  if (await prisma.inquiry.count({ where: { message: { contains: marker } } })) return 'duplicates';
  const contactName = user ? `${user.firstName} ${user.lastName}`.trim() : m.name || m.from;
  await prisma.inquiry.create({
    data: {
      kind: 'contact',
      contactName: contactName.slice(0, 120),
      email: user?.email ?? '',
      phone: m.from,
      message: `${m.text}\n\n${marker}`,
      locale: user?.locale ?? 'az',
    },
  });
  await notifyStaff(`WhatsApp: ${contactName}`, m.text, { link: '/admin/inquiries', type: 'INQUIRY' });
  return 'inquiries';
};
