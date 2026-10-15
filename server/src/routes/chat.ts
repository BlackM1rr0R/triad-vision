import fs from 'node:fs/promises';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { hasMinRole, requireMinRole } from '../middleware/auth.js';
import { decodeOriginalName, verifyUploadedFile } from '../middleware/upload.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { INLINE_MIME } from '../lib/fileCheck.js';
import { publish } from '../lib/messaging/realtime.js';
import { registerJob } from '../lib/scheduler.js';
import { DriveAccessCtx, requireNode } from '../lib/drive/access.js';
import { storagePath as driveStoragePath } from '../lib/drive/storage.js';
import {
  CHANNEL_NAME_RE,
  EDIT_WINDOW_MS,
  MESSAGE_MAX,
  STAFF_ROLES,
  activeStaff,
  channelInclude,
  decodeEmoji,
  encodeEmoji,
  ensureGeneral,
  fullName,
  groupReactions,
  loadChannel,
  loadMessage,
  memberIds,
  messageInclude,
  normaliseChannelName,
  notifyMessage,
  publishToChannel,
  toChannel,
  toMessage,
  type Actor,
  type ChannelRow,
  type MessagePreview,
} from '../lib/chat/core.js';
import { excerpt, mentionedUserIds, mentionsAll } from '../lib/chat/mentions.js';
import { addPendingDriveLink, adoptChatUpload, chatFilePath, chatUpload, consumePending, purgePendingChatUploads, readPending, type PendingAttachment } from '../lib/chat/storage.js';

/**
 * Team chat (/api/chat): public / private channels, direct messages, threads, reactions, pins,
 * attachments (uploads or links to team-drive files), search and read markers. Staff only.
 * Realtime events to channel members: chat.message, chat.reaction, chat.read, chat.typing, chat.channel.
 */
export const chatRouter = Router();
chatRouter.use(requireMinRole('STAFF'));

registerJob({ name: 'chat-pending-uploads', everyMs: 60 * 60 * 1000, run: async () => void (await purgePendingChatUploads()) });

const actorOf = (req: Request): Actor => ({ id: req.user!.id, role: req.user!.role, firstName: req.user!.firstName, lastName: req.user!.lastName });
const idParam = (req: Request, key = 'id') => {
  const id = String(req.params[key] ?? '');
  if (!id || id.length > 60) throw notFound('NOT_FOUND');
  return id;
};
const id = z.string().trim().min(1).max(60);
const idList = z.array(id).max(200);
const bodyText = z
  .string()
  .max(MESSAGE_MAX)
  .transform((s) => s.replace(/\r\n/g, '\n').trim());
const emoji = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .refine((s) => !/\s/.test(s), 'EMOJI');
const channelName = z
  .string()
  .max(100)
  .transform(normaliseChannelName)
  .refine((s) => CHANNEL_NAME_RE.test(s), 'INVALID_CHANNEL_NAME');
const topic = z
  .string()
  .max(250)
  .transform((s) => s.trim())
  .nullable();

// ─── Unread counters ───────────────────────────────────────────────────

/** Unread top-level messages (and how many mention me) since my read marker, per channel. */
const unreadFor = async (channelId: string, userId: string, lastReadAt: Date | null) => {
  const rows = await prisma.chatMessage.findMany({
    where: { channelId, parentId: null, deletedAt: null, authorId: { not: userId }, ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}) },
    select: { mentions: true },
    take: 1000,
  });
  let mentions = 0;
  for (const r of rows) if (Array.isArray(r.mentions) && (r.mentions as unknown[]).includes(userId)) mentions++;
  return { unread: rows.length, mentions };
};

const lastMessageOf = async (channelId: string): Promise<MessagePreview | null> => {
  const m = await prisma.chatMessage.findFirst({
    where: { channelId, parentId: null, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, authorId: true, body: true, createdAt: true, author: { select: { firstName: true, lastName: true } }, attachments: { select: { filename: true }, take: 1 } },
  });
  if (!m) return null;
  return { id: m.id, authorId: m.authorId, authorName: fullName(m.author), body: excerpt(m.body || (m.attachments[0] ? `📎 ${m.attachments[0].filename}` : ''), 120), createdAt: m.createdAt };
};

/** GET /api/chat/summary → { unread, mentions } for the workspace rail badge (muted channels excluded from unread). */
chatRouter.get('/summary', async (req, res) => {
  const me = req.user!.id;
  await ensureGeneral(me);
  const memberships = await prisma.chatMember.findMany({ where: { userId: me, channel: { archivedAt: null } }, select: { channelId: true, lastReadAt: true, muted: true } });
  const counts = await Promise.all(memberships.map((m) => unreadFor(m.channelId, me, m.lastReadAt)));
  let unread = 0;
  let mentions = 0;
  memberships.forEach((m, i) => {
    if (!m.muted) unread += counts[i].unread;
    mentions += counts[i].mentions;
  });
  res.json({ unread, mentions });
});

// ─── Channels ──────────────────────────────────────────────────────────

/** GET /api/chat/channels → my channels (with unread counts and previews) plus public ones I could join. */
chatRouter.get('/channels', async (req, res) => {
  const actor = actorOf(req);
  await ensureGeneral(actor.id);
  const rows = await prisma.chatChannel.findMany({
    where: { OR: [{ members: { some: { userId: actor.id } } }, { kind: 'PUBLIC', archivedAt: null }] },
    include: channelInclude,
    orderBy: { updatedAt: 'desc' },
    take: 500,
  });
  const channels = await Promise.all(
    rows.map(async (c) => {
      const me = c.members.find((m) => m.userId === actor.id);
      if (!me) return toChannel(c, actor.id);
      const [counts, lastMessage] = await Promise.all([unreadFor(c.id, actor.id, me.lastReadAt), lastMessageOf(c.id)]);
      return toChannel(c, actor.id, { ...counts, lastMessage });
    }),
  );
  res.json({ channels });
});

const createBody = z.object({
  kind: z.enum(['PUBLIC', 'PRIVATE']),
  name: channelName,
  topic: topic.optional(),
  memberIds: idList.optional(),
  caseId: id.nullable().optional(),
});

const assertNameFree = async (name: string, exceptId?: string) => {
  const clash = await prisma.chatChannel.findFirst({ where: { name, archivedAt: null, kind: { not: 'DM' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (clash) throw conflict('CHANNEL_NAME_TAKEN');
};

/** POST /api/chat/channels → new public or private channel; the creator is its owner. */
chatRouter.post('/channels', async (req, res) => {
  const actor = actorOf(req);
  const body = parse(createBody, req.body);
  await assertNameFree(body.name);
  if (body.caseId && !(await prisma.case.findUnique({ where: { id: body.caseId }, select: { id: true } }))) throw badRequest('INVALID_CASE');
  const members = (await activeStaff((body.memberIds ?? []).filter((x) => x !== actor.id))).map((u) => u.id);
  const created = await prisma.chatChannel.create({
    data: {
      kind: body.kind,
      name: body.name,
      topic: body.topic ?? null,
      caseId: body.caseId ?? null,
      createdById: actor.id,
      members: { create: [{ userId: actor.id, role: 'OWNER' }, ...members.map((userId) => ({ userId, role: 'MEMBER' as const }))] },
    },
    include: channelInclude,
  });
  await audit(req, 'CHAT_CHANNEL_CREATED', `chat:${created.id}`, { name: created.name, kind: created.kind, members: members.length + 1 });
  const dto = toChannel(created, actor.id);
  publishToChannel(created, 'chat.channel', { action: 'created', channel: dto });
  res.status(201).json({ channel: dto });
});

/** POST /api/chat/dm { userId } → the direct-message channel with that person (created on first use). */
chatRouter.post('/dm', async (req, res) => {
  const actor = actorOf(req);
  const { userId } = parse(z.object({ userId: id }), req.body);
  const [peer] = await activeStaff([userId]);
  if (!peer) throw badRequest('INVALID_USER');
  const self = peer.id === actor.id;
  const candidates = await prisma.chatChannel.findMany({
    where: { kind: 'DM', AND: [{ members: { some: { userId: actor.id } } }, { members: { some: { userId: peer.id } } }] },
    include: channelInclude,
  });
  let channel = candidates.find((c) => c.members.length === (self ? 1 : 2));
  let created = false;
  if (!channel) {
    channel = await prisma.chatChannel.create({
      data: { kind: 'DM', createdById: actor.id, members: { create: self ? [{ userId: actor.id }] : [{ userId: actor.id }, { userId: peer.id }] } },
      include: channelInclude,
    });
    created = true;
    publishToChannel(channel, 'chat.channel', { action: 'created', channel: toChannel(channel, actor.id) });
  }
  res.status(created ? 201 : 200).json({ channel: toChannel(channel, actor.id) });
});

/** POST /api/chat/channels/for-case/:caseId → private channel of a case (named after its number), assigned staff auto-added. */
chatRouter.post('/channels/for-case/:caseId', async (req, res) => {
  const actor = actorOf(req);
  const caseId = idParam(req, 'caseId');
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, number: true, assignedStaffId: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  let channel = await prisma.chatChannel.findFirst({ where: { caseId, kind: 'PRIVATE', archivedAt: null }, include: channelInclude });
  let created = false;
  if (channel) {
    if (!channel.members.some((m) => m.userId === actor.id)) {
      await prisma.chatMember.create({ data: { channelId: channel.id, userId: actor.id } });
      channel = (await prisma.chatChannel.findUnique({ where: { id: channel.id }, include: channelInclude }))!;
      publishToChannel(channel, 'chat.channel', { action: 'membership', channel: toChannel(channel, actor.id) });
    }
  } else {
    const base = normaliseChannelName(c.number) || `case-${c.id.slice(-6)}`;
    let name = base;
    for (let n = 2; await prisma.chatChannel.findFirst({ where: { name, archivedAt: null }, select: { id: true } }); n++) name = `${base}-${n}`;
    const staffIds = (await activeStaff([actor.id, c.assignedStaffId ?? ''].filter(Boolean))).map((u) => u.id);
    channel = await prisma.chatChannel.create({
      data: {
        kind: 'PRIVATE',
        name,
        caseId,
        createdById: actor.id,
        members: { create: [{ userId: actor.id, role: 'OWNER' as const }, ...staffIds.filter((x) => x !== actor.id).map((userId) => ({ userId, role: 'MEMBER' as const }))] },
      },
      include: channelInclude,
    });
    created = true;
    await audit(req, 'CHAT_CHANNEL_CREATED', `chat:${channel.id}`, { name, caseId });
    publishToChannel(channel, 'chat.channel', { action: 'created', channel: toChannel(channel, actor.id) });
  }
  res.status(created ? 201 : 200).json({ channel: toChannel(channel, actor.id) });
});

/** GET /api/chat/channels/:id → one channel with members. */
chatRouter.get('/channels/:id', async (req, res) => {
  const actor = actorOf(req);
  const { channel, member } = await loadChannel(idParam(req), actor);
  const counts = member ? await unreadFor(channel.id, actor.id, member.lastReadAt) : {};
  res.json({ channel: toChannel(channel, actor.id, counts) });
});

const refreshed = async (channelId: string) => (await prisma.chatChannel.findUniqueOrThrow({ where: { id: channelId }, include: channelInclude })) as ChannelRow;

const respondChannel = (res: Response, channel: ChannelRow, actorId: string, action: string, status = 200) => {
  const dto = toChannel(channel, actorId);
  publishToChannel(channel, 'chat.channel', { action, channel: dto });
  res.status(status).json({ channel: dto });
};

/** PATCH /api/chat/channels/:id { name?, topic? } (owner or admin). */
chatRouter.patch('/channels/:id', async (req, res) => {
  const actor = actorOf(req);
  const { channel } = await loadChannel(idParam(req), actor, 'manage');
  if (channel.kind === 'DM') throw badRequest('DM_CHANNEL');
  const body = parse(z.object({ name: channelName.optional(), topic: topic.optional() }), req.body);
  if (body.name && body.name !== channel.name) await assertNameFree(body.name, channel.id);
  await prisma.chatChannel.update({ where: { id: channel.id }, data: { ...(body.name ? { name: body.name } : {}), ...(body.topic !== undefined ? { topic: body.topic || null } : {}) } });
  await audit(req, 'CHAT_CHANNEL_UPDATED', `chat:${channel.id}`, body);
  respondChannel(res, await refreshed(channel.id), actor.id, 'updated');
});

/** POST /api/chat/channels/:id/archive (owner or admin). */
chatRouter.post('/channels/:id/archive', async (req, res) => {
  const actor = actorOf(req);
  const { channel } = await loadChannel(idParam(req), actor, 'manage');
  if (channel.kind === 'DM') throw badRequest('DM_CHANNEL');
  if (channel.name === 'general' && channel.kind === 'PUBLIC') throw badRequest('GENERAL_CHANNEL');
  await prisma.chatChannel.update({ where: { id: channel.id }, data: { archivedAt: channel.archivedAt ?? new Date() } });
  await audit(req, 'CHAT_CHANNEL_ARCHIVED', `chat:${channel.id}`, { name: channel.name });
  respondChannel(res, await refreshed(channel.id), actor.id, 'archived');
});

/** POST /api/chat/channels/:id/join (public channels only). */
chatRouter.post('/channels/:id/join', async (req, res) => {
  const actor = actorOf(req);
  const { channel, member } = await loadChannel(idParam(req), actor);
  if (channel.kind !== 'PUBLIC') throw forbidden('PRIVATE_CHANNEL');
  if (channel.archivedAt) throw badRequest('CHANNEL_ARCHIVED');
  if (!member) await prisma.chatMember.create({ data: { channelId: channel.id, userId: actor.id } });
  respondChannel(res, await refreshed(channel.id), actor.id, 'membership');
});

/** POST /api/chat/channels/:id/leave */
chatRouter.post('/channels/:id/leave', async (req, res) => {
  const actor = actorOf(req);
  const { channel } = await loadChannel(idParam(req), actor, 'member');
  if (channel.kind === 'DM') throw badRequest('DM_CHANNEL');
  if (channel.name === 'general' && channel.kind === 'PUBLIC') throw badRequest('GENERAL_CHANNEL');
  await prisma.chatMember.delete({ where: { channelId_userId: { channelId: channel.id, userId: actor.id } } });
  const after = await refreshed(channel.id);
  // Tell the people still inside, and the leaver's other tabs.
  publish(actor.id, 'chat.channel', { channelId: channel.id, action: 'left' });
  respondChannel(res, after, actor.id, 'membership');
});

/** POST /api/chat/channels/:id/members { add[], remove[] } — any member may add to a public channel; private channels need the owner/admin. */
chatRouter.post('/channels/:id/members', async (req, res) => {
  const actor = actorOf(req);
  const access = await loadChannel(idParam(req), actor, 'member');
  const { channel } = access;
  if (channel.kind === 'DM') throw badRequest('DM_CHANNEL');
  const body = parse(z.object({ add: idList.optional(), remove: idList.optional() }), req.body);
  const removing = (body.remove ?? []).filter((x) => x !== actor.id);
  if ((channel.kind === 'PRIVATE' || removing.length) && !access.manage) throw forbidden('CHAT_FORBIDDEN');
  const add = (await activeStaff(body.add ?? [])).map((u) => u.id).filter((x) => !channel.members.some((m) => m.userId === x));
  await prisma.$transaction([
    prisma.chatMember.createMany({ data: add.map((userId) => ({ channelId: channel.id, userId })), skipDuplicates: true }),
    prisma.chatMember.deleteMany({ where: { channelId: channel.id, userId: { in: body.remove ?? [] } } }),
  ]);
  await audit(req, 'CHAT_MEMBERS_CHANGED', `chat:${channel.id}`, { add, remove: body.remove ?? [] });
  const after = await refreshed(channel.id);
  const dto = toChannel(after, actor.id);
  // Members who were removed must hear about it too.
  publish([...memberIds(after), ...(body.remove ?? [])], 'chat.channel', { channelId: channel.id, action: 'membership', channel: dto, removed: body.remove ?? [] });
  res.json({ channel: dto });
});

/** POST /api/chat/channels/:id/read → marks everything read now. */
chatRouter.post('/channels/:id/read', async (req, res) => {
  const actor = actorOf(req);
  const { channel } = await loadChannel(idParam(req), actor, 'member');
  const lastReadAt = new Date();
  await prisma.chatMember.update({ where: { channelId_userId: { channelId: channel.id, userId: actor.id } }, data: { lastReadAt } });
  publishToChannel(channel, 'chat.read', { userId: actor.id, lastReadAt: lastReadAt.toISOString() });
  res.json({ lastReadAt });
});

const toggleFlag = (flag: 'muted' | 'pinned') => async (req: Request, res: Response) => {
  const actor = actorOf(req);
  const { channel, member } = await loadChannel(idParam(req), actor, 'member');
  const body = parse(z.object({ value: z.boolean().optional() }), req.body ?? {});
  const value = body.value ?? !member![flag];
  await prisma.chatMember.update({ where: { channelId_userId: { channelId: channel.id, userId: actor.id } }, data: { [flag]: value } });
  publish(actor.id, 'chat.channel', { channelId: channel.id, action: 'updated', channel: toChannel(await refreshed(channel.id), actor.id) });
  res.json({ [flag]: value });
};
chatRouter.post('/channels/:id/mute', toggleFlag('muted'));
chatRouter.post('/channels/:id/pin', toggleFlag('pinned'));

// ─── Typing (rate-limited, in memory) ──────────────────────────────────

const TYPING_INTERVAL_MS = 2000;
const lastTyping = new Map<string, number>();

chatRouter.post('/channels/:id/typing', async (req, res) => {
  const actor = actorOf(req);
  const { channel } = await loadChannel(idParam(req), actor, 'member');
  const key = `${channel.id}:${actor.id}`;
  const now = Date.now();
  if (now - (lastTyping.get(key) ?? 0) < TYPING_INTERVAL_MS) {
    res.status(429).json({ error: 'TOO_MANY_REQUESTS' });
    return;
  }
  lastTyping.set(key, now);
  if (lastTyping.size > 5000) for (const [k, t] of lastTyping) if (now - t > 60_000) lastTyping.delete(k);
  publish(
    memberIds(channel).filter((x) => x !== actor.id),
    'chat.typing',
    { channelId: channel.id, userId: actor.id, name: fullName(actor) },
  );
  res.status(202).json({ ok: true });
});

// ─── Messages ──────────────────────────────────────────────────────────

/** Latest reply time per thread root (for "last reply" in the list). */
const lastReplies = async (ids: string[]) => {
  if (!ids.length) return new Map<string, Date>();
  const rows = await prisma.chatMessage.groupBy({ by: ['parentId'], where: { parentId: { in: ids }, deletedAt: null }, _max: { createdAt: true } });
  return new Map(rows.map((r) => [r.parentId!, r._max.createdAt!]));
};

/** GET /api/chat/channels/:id/messages?before=<ISO>&limit=50 → newest first. */
chatRouter.get('/channels/:id/messages', async (req, res) => {
  const actor = actorOf(req);
  const { channel } = await loadChannel(idParam(req), actor);
  const q = parse(z.object({ before: z.string().datetime({ offset: true }).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }), req.query);
  const rows = await prisma.chatMessage.findMany({
    where: { channelId: channel.id, parentId: null, deletedAt: null, ...(q.before ? { createdAt: { lt: new Date(q.before) } } : {}) },
    include: messageInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
  });
  const hasMore = rows.length > q.limit;
  const page = rows.slice(0, q.limit);
  const replies = await lastReplies(page.filter((m) => m.replyCount > 0).map((m) => m.id));
  res.json({ messages: page.map((m) => toMessage(m, actor, { lastReplyAt: replies.get(m.id) ?? null })), hasMore });
});

/** GET /api/chat/channels/:id/pinned */
chatRouter.get('/channels/:id/pinned', async (req, res) => {
  const actor = actorOf(req);
  const { channel } = await loadChannel(idParam(req), actor);
  const rows = await prisma.chatMessage.findMany({ where: { channelId: channel.id, deletedAt: null, pinnedAt: { not: null } }, include: messageInclude, orderBy: { pinnedAt: 'desc' }, take: 100 });
  res.json({ messages: rows.map((m) => toMessage(m, actor)) });
});

/** GET /api/chat/channels/:id/files → attachments shared in the channel, newest first. */
chatRouter.get('/channels/:id/files', async (req, res) => {
  const actor = actorOf(req);
  const { channel } = await loadChannel(idParam(req), actor);
  const rows = await prisma.chatAttachment.findMany({
    where: { message: { channelId: channel.id, deletedAt: null } },
    select: { id: true, filename: true, mimeType: true, size: true, driveNodeId: true, messageId: true, message: { select: { createdAt: true, author: { select: { id: true, firstName: true, lastName: true } } } } },
    orderBy: { message: { createdAt: 'desc' } },
    take: 200,
  });
  res.json({ files: rows.map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size, driveNodeId: a.driveNodeId, messageId: a.messageId, createdAt: a.message.createdAt, author: a.message.author })) });
});

/** Resolves mentions: ids the composer sent + names found in the text, restricted to channel members; "@all" → everyone. */
const resolveMentions = (channel: ChannelRow, body: string, sent: string[], actorId: string) => {
  const members = channel.members.map((m) => m.user);
  if (mentionsAll(body)) return members.map((m) => m.id).filter((x) => x !== actorId);
  const ids = new Set<string>([...sent, ...mentionedUserIds(body, members)]);
  return [...ids].filter((x) => x !== actorId && members.some((m) => m.id === x));
};

const postBody = z.object({
  body: bodyText.default(''),
  parentId: id.nullable().optional(),
  attachmentIds: z.array(z.string().regex(/^[a-f0-9]{32}$/)).max(10).optional(),
  mentions: idList.optional(),
});

/** POST /api/chat/channels/:id/messages { body, parentId?, attachmentIds?, mentions? } */
chatRouter.post('/channels/:id/messages', async (req, res) => {
  const actor = actorOf(req);
  const { channel } = await loadChannel(idParam(req), actor, 'member');
  if (channel.archivedAt) throw badRequest('CHANNEL_ARCHIVED');
  const body = parse(postBody, req.body);
  const pending: PendingAttachment[] = [];
  for (const key of [...new Set(body.attachmentIds ?? [])]) {
    const p = await readPending(key);
    if (!p || p.userId !== actor.id) throw badRequest('INVALID_ATTACHMENT');
    pending.push(p);
  }
  if (!body.body && !pending.length) throw badRequest('EMPTY_MESSAGE');
  let parentId: string | null = null;
  if (body.parentId) {
    const parent = await prisma.chatMessage.findUnique({ where: { id: body.parentId }, select: { id: true, channelId: true, parentId: true, deletedAt: true } });
    if (!parent || parent.channelId !== channel.id || parent.deletedAt) throw badRequest('INVALID_PARENT');
    parentId = parent.parentId ?? parent.id; // replies to a reply stay in the root's thread
  }
  const mentions = resolveMentions(channel, body.body, body.mentions ?? [], actor.id);
  const created = await prisma.$transaction(async (tx) => {
    const m = await tx.chatMessage.create({
      data: {
        channelId: channel.id,
        authorId: actor.id,
        body: body.body,
        parentId,
        mentions,
        attachments: {
          create: pending.map((p) => ({
            filename: p.filename,
            mimeType: p.mimeType,
            size: p.size,
            storageKey: p.key,
            driveNodeId: p.driveNodeId ?? null,
          })),
        },
      },
      include: messageInclude,
    });
    if (parentId) await tx.chatMessage.update({ where: { id: parentId }, data: { replyCount: { increment: 1 } } });
    await tx.chatChannel.update({ where: { id: channel.id }, data: { updatedAt: new Date() } });
    // Posting counts as having read the channel up to now.
    await tx.chatMember.update({ where: { channelId_userId: { channelId: channel.id, userId: actor.id } }, data: { lastReadAt: m.createdAt } });
    return m;
  });
  for (const p of pending) await consumePending(p.key);
  const dto = toMessage(created, actor);
  publishToChannel(channel, 'chat.message', { action: 'created', message: { ...dto, canEdit: false, canDelete: false }, authorId: actor.id, parentId });
  void notifyMessage(channel, { id: created.id, body: created.body, mentions }, actor);
  res.status(201).json({ message: dto });
});

/** PATCH /api/chat/messages/:id { body } — author only, within 15 minutes unless admin. */
chatRouter.patch('/messages/:id', async (req, res) => {
  const actor = actorOf(req);
  const m = await loadMessage(idParam(req));
  const { channel } = await loadChannel(m.channelId, actor, 'member');
  if (m.deletedAt) throw notFound('MESSAGE_NOT_FOUND');
  if (m.authorId !== actor.id) throw forbidden('NOT_AUTHOR');
  if (!hasMinRole(actor.role, 'ADMIN') && Date.now() - m.createdAt.getTime() > EDIT_WINDOW_MS) throw forbidden('EDIT_WINDOW_CLOSED');
  const body = parse(z.object({ body: bodyText, mentions: idList.optional() }), req.body);
  if (!body.body && !m.attachments.length) throw badRequest('EMPTY_MESSAGE');
  const mentions = resolveMentions(channel, body.body, body.mentions ?? [], actor.id);
  const updated = await prisma.chatMessage.update({ where: { id: m.id }, data: { body: body.body, mentions, editedAt: new Date() }, include: messageInclude });
  const dto = toMessage(updated, actor);
  publishToChannel(channel, 'chat.message', { action: 'updated', message: { ...dto, canEdit: false, canDelete: false }, authorId: actor.id, parentId: m.parentId });
  const newly = mentions.filter((x) => !(Array.isArray(m.mentions) && (m.mentions as string[]).includes(x)));
  if (newly.length) void notifyMessage(channel, { id: m.id, body: body.body, mentions: newly }, actor);
  res.json({ message: dto });
});

/** DELETE /api/chat/messages/:id — soft delete (author or admin). */
chatRouter.delete('/messages/:id', async (req, res) => {
  const actor = actorOf(req);
  const m = await loadMessage(idParam(req));
  const { channel } = await loadChannel(m.channelId, actor, 'member');
  if (m.deletedAt) throw notFound('MESSAGE_NOT_FOUND');
  if (m.authorId !== actor.id && !hasMinRole(actor.role, 'ADMIN')) throw forbidden('CHAT_FORBIDDEN');
  await prisma.$transaction(async (tx) => {
    await tx.chatMessage.update({ where: { id: m.id }, data: { deletedAt: new Date(), body: '', pinnedAt: null, mentions: [] } });
    if (m.parentId) await tx.chatMessage.update({ where: { id: m.parentId }, data: { replyCount: { decrement: 1 } } });
  });
  await audit(req, 'CHAT_MESSAGE_DELETED', `chat:${channel.id}`, { messageId: m.id, authorId: m.authorId });
  publishToChannel(channel, 'chat.message', { action: 'deleted', messageId: m.id, parentId: m.parentId, authorId: m.authorId });
  res.json({ ok: true });
});

const setPinned = (pinned: boolean) => async (req: Request, res: Response) => {
  const actor = actorOf(req);
  const m = await loadMessage(idParam(req));
  const { channel } = await loadChannel(m.channelId, actor, 'manage');
  if (m.deletedAt) throw notFound('MESSAGE_NOT_FOUND');
  const updated = await prisma.chatMessage.update({ where: { id: m.id }, data: { pinnedAt: pinned ? new Date() : null }, include: messageInclude });
  const dto = toMessage(updated, actor);
  publishToChannel(channel, 'chat.message', { action: 'updated', message: { ...dto, canEdit: false, canDelete: false }, parentId: m.parentId });
  res.json({ message: dto });
};
chatRouter.post('/messages/:id/pin', setPinned(true));
chatRouter.post('/messages/:id/unpin', setPinned(false));

/** POST /api/chat/messages/:id/reactions { emoji } → toggles my reaction. */
chatRouter.post('/messages/:id/reactions', async (req, res) => {
  const actor = actorOf(req);
  const m = await loadMessage(idParam(req));
  const { channel } = await loadChannel(m.channelId, actor, 'member');
  if (m.deletedAt) throw notFound('MESSAGE_NOT_FOUND');
  const e = encodeEmoji(parse(z.object({ emoji }), req.body).emoji);
  if (e.length > 16) throw badRequest('EMOJI_TOO_LONG');
  const where = { messageId_userId_emoji: { messageId: m.id, userId: actor.id, emoji: e } };
  const existing = await prisma.chatReaction.findUnique({ where });
  if (existing) await prisma.chatReaction.delete({ where });
  else await prisma.chatReaction.create({ data: { messageId: m.id, userId: actor.id, emoji: e } });
  const rows = await prisma.chatReaction.findMany({ where: { messageId: m.id }, select: { emoji: true, userId: true } });
  publishToChannel(channel, 'chat.reaction', { messageId: m.id, parentId: m.parentId, reactions: rows.map((r) => ({ ...r, emoji: decodeEmoji(r.emoji) })) });
  res.json({ reactions: groupReactions(rows, actor.id), added: !existing });
});

/** GET /api/chat/messages/:id/thread → the root message and its replies, oldest first. */
chatRouter.get('/messages/:id/thread', async (req, res) => {
  const actor = actorOf(req);
  const m = await loadMessage(idParam(req));
  await loadChannel(m.channelId, actor);
  const root = m.parentId ? await loadMessage(m.parentId) : m;
  const replies = await prisma.chatMessage.findMany({ where: { parentId: root.id, deletedAt: null }, include: messageInclude, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 500 });
  res.json({ root: toMessage(root, actor), replies: replies.map((r) => toMessage(r, actor)) });
});

/** GET /api/chat/messages/:id → one message (deep links). */
chatRouter.get('/messages/:id', async (req, res) => {
  const actor = actorOf(req);
  const m = await loadMessage(idParam(req));
  await loadChannel(m.channelId, actor);
  res.json({ message: toMessage(m, actor) });
});

// ─── Search ────────────────────────────────────────────────────────────

/** GET /api/chat/search?q=&channelId= → messages in channels I can read (fulltext, LIKE fallback). */
chatRouter.get('/search', async (req, res) => {
  const actor = actorOf(req);
  const q = parse(z.object({ q: z.string().trim().min(1).max(120), channelId: id.optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }), req.query);
  const readable = await prisma.chatChannel.findMany({
    where: { OR: [{ members: { some: { userId: actor.id } } }, { kind: 'PUBLIC', archivedAt: null }], ...(q.channelId ? { id: q.channelId } : {}) },
    select: { id: true, name: true, kind: true, members: { select: { user: { select: { id: true, firstName: true, lastName: true } } } } },
  });
  const channelIds = readable.map((c) => c.id);
  if (!channelIds.length) {
    res.json({ messages: [], mode: 'like' });
    return;
  }
  let ids: string[] = [];
  let mode: 'fulltext' | 'like' = 'fulltext';
  const words = q.q.split(/\s+/).filter(Boolean);
  if (words.every((w) => w.length >= 3)) {
    try {
      const boolean = words.map((w) => `+${w.replace(/[+\-<>()~*"@]/g, '')}*`).join(' ');
      const rows = await prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM ChatMessage WHERE deletedAt IS NULL AND channelId IN (${Prisma.join(channelIds)}) AND MATCH(body) AGAINST (${boolean} IN BOOLEAN MODE) ORDER BY createdAt DESC LIMIT ${q.limit}`,
      );
      ids = rows.map((r) => r.id);
    } catch (err) {
      console.error('[chat] fulltext search failed, falling back to LIKE', (err as Error).message);
      mode = 'like';
    }
  } else mode = 'like';
  // No fulltext hits (short words, index not ready, or genuinely nothing): the LIKE path answers.
  if (!ids.length) mode = 'like';
  const rows =
    mode === 'fulltext'
      ? await prisma.chatMessage.findMany({ where: { id: { in: ids } }, include: messageInclude })
      : await prisma.chatMessage.findMany({
          where: { channelId: { in: channelIds }, deletedAt: null, AND: words.map((w) => ({ body: { contains: w } })) },
          include: messageInclude,
          orderBy: { createdAt: 'desc' },
          take: q.limit,
        });
  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const byChannel = new Map(readable.map((c) => [c.id, c]));
  res.json({
    mode,
    messages: rows.map((m) => {
      const c = byChannel.get(m.channelId)!;
      const peer = c.members.map((x) => x.user).find((u) => u.id !== actor.id) ?? c.members[0]?.user;
      return { ...toMessage(m, actor), channel: { id: c.id, kind: c.kind, name: c.kind === 'DM' ? fullName(peer) : c.name } };
    }),
  });
});

// ─── Attachments ───────────────────────────────────────────────────────

/** POST /api/chat/attachments (multipart "file", ≤ 25 MB) → pending attachment to reference on send. */
chatRouter.post('/attachments', chatUpload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('FILE_REQUIRED');
  try {
    await verifyUploadedFile(file);
    const filename = decodeOriginalName(file.originalname).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 255) || 'file';
    const p = await adoptChatUpload(file.path, { userId: req.user!.id, filename, mimeType: file.mimetype, size: file.size });
    res.status(201).json({ attachment: { id: p.key, filename: p.filename, mimeType: p.mimeType, size: p.size, driveNodeId: null } });
  } catch (err) {
    await fs.unlink(file.path).catch(() => undefined);
    throw err;
  }
});

/** POST /api/chat/attachments/from-drive { driveNodeId } → pending link to a drive file the caller may view. */
chatRouter.post('/attachments/from-drive', async (req, res) => {
  const { driveNodeId } = parse(z.object({ driveNodeId: z.string().min(1).max(120) }), req.body);
  const ctx = new DriveAccessCtx({ id: req.user!.id, role: req.user!.role });
  const { node } = await requireNode(ctx, driveNodeId, 'VIEW');
  if (node.kind !== 'FILE') throw badRequest('NOT_A_FILE');
  const row = await prisma.driveNode.findUniqueOrThrow({ where: { id: driveNodeId }, select: { name: true, mimeType: true, size: true } });
  const p = await addPendingDriveLink({ userId: req.user!.id, filename: row.name, mimeType: row.mimeType ?? 'application/octet-stream', size: row.size ?? 0, driveNodeId });
  res.status(201).json({ attachment: { id: p.key, filename: p.filename, mimeType: p.mimeType, size: p.size, driveNodeId } });
});

/** GET /api/chat/attachments/:id[?download=1] — channel readers only. */
chatRouter.get('/attachments/:id', async (req, res) => {
  const actor = actorOf(req);
  const a = await prisma.chatAttachment.findUnique({ where: { id: idParam(req) }, include: { message: { select: { channelId: true, deletedAt: true } } } });
  if (!a || a.message.deletedAt) throw notFound('ATTACHMENT_NOT_FOUND');
  await loadChannel(a.message.channelId, actor);
  let absPath: string;
  let mime = a.mimeType;
  if (a.driveNodeId) {
    const node = await prisma.driveNode.findUnique({ where: { id: a.driveNodeId }, select: { storageKey: true, mimeType: true, deletedAt: true } });
    if (!node || node.deletedAt || !node.storageKey) throw notFound('FILE_MISSING');
    absPath = driveStoragePath(node.storageKey);
    mime = node.mimeType ?? mime;
  } else absPath = chatFilePath(a.storageKey);
  const download = req.query.download === '1' || req.query.download === 'true';
  const inline = !download && INLINE_MIME.has(mime);
  res.setHeader('Content-Type', mime.startsWith('text/') ? `${mime}; charset=utf-8` : mime);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(absPath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'FILE_MISSING_ON_DISK' });
  });
});

/** GET /api/chat/people → active staff (mention / DM pickers). */
chatRouter.get('/people', async (_req, res) => {
  const people = await prisma.user.findMany({
    where: { isActive: true, role: { in: STAFF_ROLES } },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, role: true, email: true },
    take: 500,
  });
  res.json({ people });
});

