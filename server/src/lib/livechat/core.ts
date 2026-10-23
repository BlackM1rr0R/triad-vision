import crypto from 'node:crypto';
import type { LiveChat, LiveChatMessage } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { publish, subscriberCount } from '../messaging/realtime.js';
import { STAFF_ROLES } from '../workspace/team.js';
import { getOfficeHours, isOpen } from '../calls/hours.js';
import { callTexts } from '../calls/texts.js';

/**
 * AI advisor → human live chat. Visitors are anonymous: they hold a signed visitor token (HMAC of the chat id
 * with the server secret) and listen on the realtime hub under the pseudo user `livechat:<id>`. Staff count as
 * online while they have an open realtime stream (same presence as the workspace team page) and are not on
 * leave. A chat nobody accepts within ACCEPT_TIMEOUT_MS becomes MISSED and the visitor gets the contact form.
 */

export const ACCEPT_TIMEOUT_MS = 2 * 60 * 1000;

export const visitorChannel = (chatId: string) => `livechat:${chatId}`;

const sig = (chatId: string) => crypto.createHmac('sha256', config.jwtSecret).update(`livechat-visitor:${chatId}`).digest('base64url').slice(0, 43);
export const visitorToken = (chatId: string) => `${chatId}.${sig(chatId)}`;

/** Chat id of a valid token for `chatId`, else null. */
export const verifyVisitorToken = (chatId: string, token: unknown) => {
  if (typeof token !== 'string' || token.length > 120) return false;
  const expected = Buffer.from(visitorToken(chatId));
  const got = Buffer.from(token);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
};

/** Active staff with a live realtime stream who are not on approved leave right now. */
export const onlineStaffIds = async (now = new Date()) => {
  const staff = await prisma.user.findMany({ where: { role: { in: STAFF_ROLES }, isActive: true }, select: { id: true } });
  const live = staff.map((s) => s.id).filter((id) => subscriberCount(id) > 0);
  if (!live.length) return [];
  const away = await prisma.leaveRequest.findMany({ where: { userId: { in: live }, status: 'APPROVED', startsAt: { lte: now }, endsAt: { gte: now } }, select: { userId: true } });
  const off = new Set(away.map((a) => a.userId));
  return live.filter((id) => !off.has(id));
};

export const allStaffIds = async () => (await prisma.user.findMany({ where: { role: { in: STAFF_ROLES }, isActive: true }, select: { id: true } })).map((u) => u.id);

export const availability = async (now = new Date()) => {
  const hours = await getOfficeHours();
  const open = isOpen(hours, now);
  const online = open ? (await onlineStaffIds(now)).length : 0;
  return { available: open && online > 0, officeOpen: open, staffOnline: online };
};

export type ChatWithMessages = LiveChat & { messages: LiveChatMessage[] };

export const messageDto = (m: LiveChatMessage, staffNames: Map<string, string>) => ({
  id: m.id,
  author: m.author,
  staffName: m.staffId ? (staffNames.get(m.staffId) ?? null) : null,
  body: m.body,
  createdAt: m.createdAt,
});

const names = async (ids: (string | null)[]) => {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  const rows = list.length ? await prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, firstName: true, lastName: true } }) : [];
  return new Map(rows.map((r) => [r.id, `${r.firstName} ${r.lastName}`.trim()]));
};

/** Visitor view: staff are shown by first name only. */
export const visitorView = async (chat: ChatWithMessages) => {
  const n = await names([chat.staffId, ...chat.messages.map((m) => m.staffId)]);
  const first = new Map([...n].map(([k, v]) => [k, v.split(' ')[0]]));
  return {
    id: chat.id,
    status: chat.status,
    staffName: chat.staffId ? (first.get(chat.staffId) ?? null) : null,
    acceptDeadline: new Date(chat.createdAt.getTime() + ACCEPT_TIMEOUT_MS).toISOString(),
    messages: chat.messages.map((m) => messageDto(m, first)),
  };
};

export const staffView = async (chat: ChatWithMessages) => {
  const n = await names([chat.staffId, ...chat.messages.map((m) => m.staffId)]);
  let client: { id: string; firstName: string; lastName: string; email: string; phone: string | null } | null = null;
  if (chat.clientId) client = await prisma.user.findUnique({ where: { id: chat.clientId }, select: { id: true, firstName: true, lastName: true, email: true, phone: true } });
  return {
    id: chat.id,
    status: chat.status,
    locale: chat.locale,
    visitorName: chat.visitorName,
    visitorEmail: chat.visitorEmail,
    visitorPhone: chat.visitorPhone,
    pageUrl: chat.pageUrl,
    reason: chat.reason,
    transcript: (chat.transcript as { role: string; content: string }[] | null) ?? [],
    staff: chat.staffId ? { id: chat.staffId, name: n.get(chat.staffId) ?? '' } : null,
    client,
    inquiryId: chat.inquiryId,
    callbackId: chat.callbackId,
    createdAt: chat.createdAt,
    acceptedAt: chat.acceptedAt,
    closedAt: chat.closedAt,
    acceptDeadline: new Date(chat.createdAt.getTime() + ACCEPT_TIMEOUT_MS).toISOString(),
    messages: chat.messages.map((m) => messageDto(m, n)),
  };
};

export const loadChat = (id: string) => prisma.liveChat.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: 'asc' }, take: 500 } } });

export const addMessage = async (chat: LiveChat, author: 'VISITOR' | 'STAFF' | 'SYSTEM', body: string, staffId: string | null = null) => {
  const m = await prisma.liveChatMessage.create({ data: { chatId: chat.id, author, body: body.slice(0, 2000), staffId } });
  await prisma.liveChat.update({ where: { id: chat.id }, data: author === 'VISITOR' ? { lastVisitorAt: m.createdAt } : {} });
  const n = await names([staffId]);
  const dto = messageDto(m, n);
  publish(visitorChannel(chat.id), 'livechat.message', { chatId: chat.id, message: { ...dto, staffName: dto.staffName?.split(' ')[0] ?? null } });
  const staffTargets = chat.staffId ? [chat.staffId] : await allStaffIds();
  publish(staffTargets, 'livechat.message', { chatId: chat.id, message: dto });
  return dto;
};

/** Tells every staff member that the queue changed (badge, sound + toast for a new chat). */
export const publishQueue = async (chatId: string, change: 'new' | 'accepted' | 'closed' | 'missed', extra: Record<string, unknown> = {}) => {
  publish(await allStaffIds(), 'livechat.queue', { chatId, change, ...extra });
};

/** WAITING chats past the accept timeout → MISSED (visitor gets the contact form). Returns the expired ids. */
export const expireWaiting = async (now = new Date()) => {
  const stale = await prisma.liveChat.findMany({ where: { status: 'WAITING', createdAt: { lt: new Date(now.getTime() - ACCEPT_TIMEOUT_MS) } }, select: { id: true, locale: true }, take: 200 });
  const out: string[] = [];
  for (const c of stale) {
    const r = await prisma.liveChat.updateMany({ where: { id: c.id, status: 'WAITING' }, data: { status: 'MISSED', closedAt: now } });
    if (!r.count) continue;
    out.push(c.id);
    const chat = await prisma.liveChat.findUniqueOrThrow({ where: { id: c.id } });
    await addMessage(chat, 'SYSTEM', callTexts(c.locale).chatMissed);
    publish(visitorChannel(c.id), 'livechat.status', { chatId: c.id, status: 'MISSED' });
    await publishQueue(c.id, 'missed');
  }
  return out;
};
