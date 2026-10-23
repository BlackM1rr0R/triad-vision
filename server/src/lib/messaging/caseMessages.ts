import type { CaseMessage } from '@prisma/client';
import { prisma } from '../../db.js';
import { notifyClient, notifyStaff } from '../notifications.js';
import { publish } from './realtime.js';
import { isImpersonating } from '../privacy/impersonationContext.js';
import { detectLanguage } from '../messagingPlus/language.js';
import { serializeVoice, VOICE_SELECT } from '../messagingPlus/voice.js';

/**
 * Shared logic for the case chat (portal + admin + WhatsApp inbound): who receives realtime events,
 * creating a message, read receipts and typing notifications.
 */

export type MessageChannel = 'app' | 'whatsapp' | 'sms';

const AUTHOR = { select: { id: true, firstName: true, lastName: true, role: true } } as const;

/** Staff users who follow a case: assigned staff + every active admin / super admin. */
export const staffRecipientsFor = async (caseId: string) =>
  (
    await prisma.user.findMany({
      where: { OR: [{ role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, { assignedCases: { some: { id: caseId } } }], isActive: true },
      select: { id: true },
    })
  ).map((u) => u.id);

/** Realtime recipients of an event that happened on the *other* side of the conversation. */
export const otherSide = async (c: { id: string; clientId: string }, side: 'client' | 'staff') =>
  side === 'client' ? staffRecipientsFor(c.id) : [c.clientId];

type VoiceRow = Parameters<typeof serializeVoice>[0];

export const serializeMessage = (m: CaseMessage & { author: { id: string; firstName: string; lastName: string; role: string }; voice?: VoiceRow }) => ({
  id: m.id,
  caseId: m.caseId,
  authorId: m.authorId,
  body: m.body,
  channel: m.channel,
  readAt: m.readAt,
  createdAt: m.createdAt,
  author: m.author,
  // Messaging plus: detected language (automatic translation) and voice message (audio + transcript).
  lang: m.lang ?? detectLanguage(m.body),
  voice: serializeVoice(m.voice),
});

export type SerializedMessage = ReturnType<typeof serializeMessage>;

/** Messages of a case, oldest first, with channel and read receipts. */
export const listMessages = async (caseId: string) =>
  (await prisma.caseMessage.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' }, include: { author: AUTHOR, voice: { select: VOICE_SELECT } } })).map(serializeMessage);

/**
 * Stores a message, notifies the other side (in-app/email/push) and pushes `message.new` to
 * everyone on the other side in realtime. `externalId` de-duplicates provider webhooks (returns null
 * when the id was seen before).
 */
export const createCaseMessage = async (opts: {
  caseId: string;
  authorId: string;
  body: string;
  side: 'client' | 'staff';
  channel?: MessageChannel;
  externalId?: string | null;
  /** Voice message (VoiceClip uploaded by the author); the body may then be empty. */
  voiceId?: string | null;
}) => {
  const c = await prisma.case.findUniqueOrThrow({ where: { id: opts.caseId }, select: { id: true, number: true, clientId: true } });
  // Detected language (cheap heuristic, never an AI call); falls back to the author's UI language.
  const lang = opts.body.trim()
    ? detectLanguage(opts.body) ?? (await prisma.user.findUnique({ where: { id: opts.authorId }, select: { locale: true } }))?.locale ?? null
    : null;
  let created: CaseMessage & { author: { id: string; firstName: string; lastName: string; role: string }; voice: VoiceRow };
  try {
    created = await prisma.caseMessage.create({
      data: { caseId: c.id, authorId: opts.authorId, body: opts.body, lang, voiceId: opts.voiceId ?? null, channel: opts.channel ?? 'app', externalId: opts.externalId ?? null },
      include: { author: AUTHOR, voice: { select: VOICE_SELECT } },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002' && opts.externalId) return null; // duplicate webhook delivery
    throw err;
  }
  const message = serializeMessage(created);
  if (opts.side === 'client') {
    const via = opts.channel === 'whatsapp' ? ' (WhatsApp)' : '';
    await notifyStaff(`${c.number}: müştəridən yeni mesaj${via}`, opts.body || (opts.voiceId ? '🎤 Səsli mesaj' : ''), { caseId: c.id, link: `/admin/cases/${c.id}`, type: 'NEW_MESSAGE' });
  } else {
    await notifyClient(c.id, 'NEW_MESSAGE');
  }
  publish(await otherSide(c, opts.side), 'message.new', { caseId: c.id, message });
  return message;
};

/**
 * Marks every unread message written by the other side as read and tells the authors' side via
 * `message.read`. Returns the ids that were marked (empty when nothing was unread).
 */
export const markMessagesRead = async (c: { id: string; clientId: string }, readerSide: 'client' | 'staff') => {
  if (isImpersonating()) return { messageIds: [] as string[], readAt: null as Date | null }; // no read receipts while viewing as the client
  const where = { caseId: c.id, readAt: null, authorId: readerSide === 'client' ? { not: c.clientId } : c.clientId };
  const unread = await prisma.caseMessage.findMany({ where, select: { id: true } });
  if (!unread.length) return { messageIds: [] as string[], readAt: null as Date | null };
  const readAt = new Date();
  const ids = unread.map((m) => m.id);
  await prisma.caseMessage.updateMany({ where: { id: { in: ids }, readAt: null }, data: { readAt } });
  publish(await otherSide(c, readerSide), 'message.read', { caseId: c.id, messageIds: ids, readAt: readAt.toISOString() });
  return { messageIds: ids, readAt };
};

// ─── Typing (rate-limited, in memory) ──────────────────────────────────

export const TYPING_MIN_INTERVAL_MS = 2000;
const lastTyping = new Map<string, number>();

/** Publishes a typing event to the other side; false when the sender is throttled (max 1 per 2 s). */
export const publishTyping = async (c: { id: string; clientId: string }, user: { id: string; firstName: string; lastName: string }, side: 'client' | 'staff') => {
  const k = `${user.id}:${c.id}`;
  const now = Date.now();
  const last = lastTyping.get(k) ?? 0;
  if (now - last < TYPING_MIN_INTERVAL_MS) return false;
  lastTyping.set(k, now);
  if (lastTyping.size > 5000) {
    for (const [key, at] of lastTyping) if (now - at > 60_000) lastTyping.delete(key);
  }
  publish(await otherSide(c, side), 'typing', { caseId: c.id, userId: user.id, name: `${user.firstName} ${user.lastName}`.trim(), side });
  return true;
};

/** Test hook. */
export const resetTypingLimiter = () => lastTyping.clear();
