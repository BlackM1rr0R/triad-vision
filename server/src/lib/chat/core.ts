import type { ChatChannelKind, Prisma, Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole } from '../../middleware/auth.js';
import { forbidden, notFound } from '../http.js';
import { publish, subscriberCount } from '../messaging/realtime.js';
import { notifyUser } from '../notifications.js';
import { excerpt } from './mentions.js';
import { chatTexts } from './texts.js';

/** Shared rules and response shapes for the team chat (/api/chat). */

export const STAFF_ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];
export const GENERAL_NAME = 'general';
export const MESSAGE_MAX = 4000;
/** Authors may edit their own message this long after posting (admins always). */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export interface Actor {
  id: string;
  role: Role;
  firstName: string;
  lastName: string;
}

export const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');

export const personSelect = { id: true, firstName: true, lastName: true, role: true } satisfies Prisma.UserSelect;

/** Channel names: lower-case slug ("visa-team", "müştəri_xidməti"), 1–80 characters. */
export const normaliseChannelName = (raw: string) => raw.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');
export const CHANNEL_NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,79}$/u;

// ─── Loading channels with the caller's rights ─────────────────────────

export const channelInclude = {
  members: { select: { userId: true, role: true, lastReadAt: true, muted: true, pinned: true, joinedAt: true, user: { select: personSelect } } },
  case: { select: { id: true, number: true } },
} satisfies Prisma.ChatChannelInclude;

export type ChannelRow = Prisma.ChatChannelGetPayload<{ include: typeof channelInclude }>;

export interface ChannelAccess {
  channel: ChannelRow;
  member: ChannelRow['members'][number] | null;
  /** may read messages: member, or a public channel (preview) */
  read: boolean;
  /** owner of the channel or ADMIN+ */
  manage: boolean;
}

export const channelAccess = (channel: ChannelRow, actor: Pick<Actor, 'id' | 'role'>): ChannelAccess => {
  const member = channel.members.find((m) => m.userId === actor.id) ?? null;
  const read = !!member || (channel.kind === 'PUBLIC' && !channel.archivedAt);
  const manage = hasMinRole(actor.role, 'ADMIN') || member?.role === 'OWNER';
  return { channel, member, read, manage };
};

/**
 * Loads a channel for the caller. `need`: 'read' (member or public), 'member' (must have joined),
 * 'manage' (owner / admin). Private channels the caller is not in answer 404, never 403.
 */
export const loadChannel = async (id: string, actor: Pick<Actor, 'id' | 'role'>, need: 'read' | 'member' | 'manage' = 'read') => {
  const channel = await prisma.chatChannel.findUnique({ where: { id }, include: channelInclude });
  if (!channel) throw notFound('CHANNEL_NOT_FOUND');
  const access = channelAccess(channel, actor);
  if (!access.read && !hasMinRole(actor.role, 'ADMIN')) throw notFound('CHANNEL_NOT_FOUND');
  if (need === 'member' && !access.member) throw forbidden('NOT_A_MEMBER');
  if (need === 'manage' && !access.manage) throw forbidden('CHAT_FORBIDDEN');
  return access;
};

export const memberIds = (channel: { members: { userId: string }[] }) => channel.members.map((m) => m.userId);

// ─── Response shapes ───────────────────────────────────────────────────

export const toChannel = (
  c: ChannelRow,
  actorId: string,
  extra: { unread?: number; mentions?: number; lastMessage?: MessagePreview | null } = {},
) => {
  const me = c.members.find((m) => m.userId === actorId) ?? null;
  const others = c.members.filter((m) => m.userId !== actorId).map((m) => m.user);
  return {
    id: c.id,
    kind: c.kind,
    /** DM channels carry the other person's name instead of a stored name. */
    name: c.kind === 'DM' ? fullName(others[0] ?? me?.user) : c.name,
    topic: c.topic,
    caseId: c.caseId,
    case: c.case,
    createdById: c.createdById,
    archivedAt: c.archivedAt,
    createdAt: c.createdAt,
    memberCount: c.members.length,
    members: c.members.map((m) => ({ ...m.user, role: m.role, memberRole: m.role, joinedAt: m.joinedAt })),
    /** for DMs: the other participant (or myself for a self-DM) */
    peer: c.kind === 'DM' ? (others[0] ?? me?.user ?? null) : null,
    isMember: !!me,
    myRole: me?.role ?? null,
    muted: me?.muted ?? false,
    pinned: me?.pinned ?? false,
    lastReadAt: me?.lastReadAt ?? null,
    unread: extra.unread ?? 0,
    mentions: extra.mentions ?? 0,
    lastMessage: extra.lastMessage ?? null,
  };
};

export type ChannelDto = ReturnType<typeof toChannel>;

export interface MessagePreview {
  id: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: Date;
}

export const messageInclude = {
  author: { select: personSelect },
  attachments: { select: { id: true, filename: true, mimeType: true, size: true, driveNodeId: true } },
  reactions: { select: { emoji: true, userId: true } },
} satisfies Prisma.ChatMessageInclude;

export type MessageRow = Prisma.ChatMessageGetPayload<{ include: typeof messageInclude }>;

/**
 * Reactions are stored as hex code points ("1f44d", "1f44d-1f3fd"): MySQL's utf8mb4 unicode collations
 * rank many emoji as equal, which would make 👍 and 🎉 collide in the (message, user, emoji) key.
 */
export const encodeEmoji = (e: string) => [...e].map((c) => c.codePointAt(0)!.toString(16)).join('-');
export const decodeEmoji = (s: string) => {
  if (!/^[0-9a-f]{1,6}(-[0-9a-f]{1,6})*$/.test(s)) return s; // not encoded: pass through
  try {
    return String.fromCodePoint(...s.split('-').map((h) => parseInt(h, 16)));
  } catch {
    return s;
  }
};

export const groupReactions = (rows: { emoji: string; userId: string }[], actorId: string) => {
  const map = new Map<string, { emoji: string; count: number; me: boolean; userIds: string[] }>();
  for (const r of rows) {
    const g = map.get(r.emoji) ?? { emoji: decodeEmoji(r.emoji), count: 0, me: false, userIds: [] };
    g.count++;
    g.userIds.push(r.userId);
    if (r.userId === actorId) g.me = true;
    map.set(r.emoji, g);
  }
  return [...map.values()];
};

export const toMessage = (m: MessageRow, actor: Pick<Actor, 'id' | 'role'>, opts: { lastReplyAt?: Date | null } = {}) => {
  const isAdmin = hasMinRole(actor.role, 'ADMIN');
  const mine = m.authorId === actor.id;
  const deleted = !!m.deletedAt;
  return {
    id: m.id,
    channelId: m.channelId,
    authorId: m.authorId,
    author: m.author,
    body: deleted ? '' : m.body,
    parentId: m.parentId,
    replyCount: m.replyCount,
    lastReplyAt: opts.lastReplyAt ?? null,
    mentions: Array.isArray(m.mentions) ? (m.mentions as string[]) : [],
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
    pinnedAt: m.pinnedAt,
    createdAt: m.createdAt,
    attachments: deleted ? [] : m.attachments,
    reactions: groupReactions(m.reactions, actor.id),
    canEdit: !deleted && mine && (isAdmin || Date.now() - m.createdAt.getTime() <= EDIT_WINDOW_MS),
    canDelete: !deleted && (mine || isAdmin),
  };
};

export type MessageDto = ReturnType<typeof toMessage>;

export const loadMessage = async (id: string) => {
  const m = await prisma.chatMessage.findUnique({ where: { id }, include: messageInclude });
  if (!m) throw notFound('MESSAGE_NOT_FOUND');
  return m;
};

// ─── #general ──────────────────────────────────────────────────────────

let generalInflight: Promise<string> | null = null;

/** The team-wide public channel, created on first use; the caller (and every active staff member) is joined. */
export const ensureGeneral = async (actorId?: string) => {
  generalInflight ??= (async () => {
    const existing = await prisma.chatChannel.findFirst({ where: { kind: 'PUBLIC', name: GENERAL_NAME, archivedAt: null }, select: { id: true } });
    if (existing) return existing.id;
    const staff = await prisma.user.findMany({ where: { isActive: true, role: { in: STAFF_ROLES } }, select: { id: true } });
    const created = await prisma.chatChannel.create({
      data: {
        kind: 'PUBLIC',
        name: GENERAL_NAME,
        topic: chatTexts('az').generalTopic,
        members: { create: staff.map((u) => ({ userId: u.id, role: 'MEMBER' as const })) },
      },
      select: { id: true },
    });
    return created.id;
  })().finally(() => {
    generalInflight = null;
  });
  const id = await generalInflight;
  if (actorId) {
    await prisma.chatMember.upsert({
      where: { channelId_userId: { channelId: id, userId: actorId } },
      create: { channelId: id, userId: actorId },
      update: {},
    });
  }
  return id;
};

// ─── Realtime + notifications ──────────────────────────────────────────

export const publishToChannel = (channel: { id: string; members: { userId: string }[] }, type: string, payload: Record<string, unknown>) => {
  publish(memberIds(channel), type, { channelId: channel.id, ...payload });
};

export const activeStaff = (ids: string[]) =>
  ids.length
    ? prisma.user.findMany({ where: { id: { in: [...new Set(ids)] }, isActive: true, role: { in: STAFF_ROLES } }, select: { id: true, firstName: true, lastName: true, locale: true } })
    : Promise.resolve([]);

export const chatLink = (channelId: string, messageId?: string) => `/workspace/chat/${channelId}${messageId ? `?message=${messageId}` : ''}`;

/**
 * After a message was posted: mentioned members get a CHAT_MENTION, DM partners who are not
 * connected (no open realtime stream) get a CHAT_DM. The author never notifies themself; muted
 * channels suppress mention notifications. Emails are not sent for chat (push + in-app only).
 */
export const notifyMessage = async (channel: ChannelRow, message: { id: string; body: string; mentions: string[] }, actor: Actor) => {
  try {
    const recipients = new Map<string, 'mention' | 'dm'>();
    if (channel.kind === 'DM') {
      for (const m of channel.members) if (m.userId !== actor.id && subscriberCount(m.userId) === 0 && !m.muted) recipients.set(m.userId, 'dm');
    }
    for (const id of message.mentions) {
      const m = channel.members.find((x) => x.userId === id);
      if (id !== actor.id && m && !m.muted) recipients.set(id, 'mention');
    }
    if (!recipients.size) return;
    const users = await activeStaff([...recipients.keys()]);
    const text = excerpt(message.body);
    await Promise.all(
      users.map((u) => {
        const tx = chatTexts(u.locale);
        const kind = recipients.get(u.id)!;
        const msg = kind === 'dm' ? tx.dm({ actor: fullName(actor), excerpt: text }) : tx.mention({ actor: fullName(actor), channel: channel.name ?? 'dm', excerpt: text });
        return notifyUser(u.id, { type: kind === 'dm' ? 'CHAT_DM' : 'CHAT_MENTION', ...msg, link: chatLink(channel.id, message.id), email: false, ctaLabel: tx.cta });
      }),
    );
  } catch (err) {
    console.error('[chat] notification failed', err);
  }
};

export const kindOf = (k: string): ChatChannelKind | null => (k === 'PUBLIC' || k === 'PRIVATE' || k === 'DM' ? k : null);
