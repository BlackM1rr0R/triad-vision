import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../db.js';
import { hasMinRole, requireMinRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http.js';
import { notifyUser } from '../lib/notifications.js';
import { publish } from '../lib/messaging/realtime.js';
import {
  LEAVE_STATUSES,
  LEAVE_TYPES,
  adminIds,
  fullName,
  leaveBalance,
  leaveSelect,
  overlapWhere,
  parseLeaveDate,
  presenceList,
  staffIds,
  toLeave,
  type LeaveOut,
} from '../lib/workspace/team.js';
import { closeExpiredPolls, isOpen, loadPoll, pollInclude, toPoll } from '../lib/workspace/polls.js';
import { excerptOf, formatLeaveDay, workspaceTexts } from '../lib/workspace/texts.js';
import { promptHandoverNotes } from '../lib/shifts/handoverNotes.js'; // "write a handover note" after approval

/**
 * Team workspace (/api/workspace): presence and status, leave requests, announcements, personal
 * notes, polls and the home aggregate. Realtime events: presence.updated, announcement.new,
 * leave.updated (to the requester), poll.updated (to staff).
 */
export const workspaceRouter = Router();
workspaceRouter.use(requireMinRole('STAFF'));

type Actor = { id: string; role: Role };
const actorOf = (req: Request): Actor => ({ id: req.user!.id, role: req.user!.role });
const isAdmin = (req: Request) => hasMinRole(req.user!.role, 'ADMIN');

const id = z.string().trim().min(1).max(40);
const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s));

const safely = async (what: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (err) {
    console.error(`[workspace] ${what} failed`, err);
  }
};

// ─── Presence & status ─────────────────────────────────────────────────

/** GET /api/workspace/presence → { people: [...], now } for every active staff member. */
workspaceRouter.get('/presence', async (_req, res) => {
  const now = new Date();
  res.json({ people: await presenceList(now), now });
});

const statusSchema = z.object({
  statusText: z.string().max(120).nullable().optional(),
  statusEmoji: z.string().max(16).nullable().optional(),
  statusUntil: isoDate.nullable().optional(),
});

/** PUT /api/workspace/status → my status line; publishes presence.updated to all staff. */
workspaceRouter.put('/status', async (req, res) => {
  const b = parse(statusSchema, req.body);
  const statusText = b.statusText === undefined ? undefined : b.statusText?.trim() || null;
  const statusEmoji = b.statusEmoji === undefined ? undefined : b.statusEmoji?.trim() || null;
  const data: Prisma.UserUpdateInput = {};
  if (statusText !== undefined) data.statusText = statusText;
  if (statusEmoji !== undefined) data.statusEmoji = statusEmoji;
  if (b.statusUntil !== undefined) data.statusUntil = b.statusUntil;
  const u = await prisma.user.update({ where: { id: req.user!.id }, data, select: { id: true, statusText: true, statusEmoji: true, statusUntil: true } });
  // A cleared status needs no expiry.
  if (!u.statusText && !u.statusEmoji && u.statusUntil) {
    await prisma.user.update({ where: { id: u.id }, data: { statusUntil: null } });
    u.statusUntil = null;
  }
  const payload = { userId: u.id, statusText: u.statusText, statusEmoji: u.statusEmoji, statusUntil: u.statusUntil?.toISOString() ?? null };
  publish(await staffIds(), 'presence.updated', payload);
  res.json({ status: payload });
});

// ─── Leave requests ────────────────────────────────────────────────────

const leaveDate = (end: boolean) =>
  z
    .string()
    .trim()
    .min(10)
    .max(40)
    .transform((s, ctx) => {
      const d = parseLeaveDate(s, end);
      if (!d) {
        ctx.addIssue({ code: 'custom', message: 'INVALID_DATE' });
        return z.NEVER;
      }
      return d;
    });

const leaveBody = z.object({
  type: z.enum(LEAVE_TYPES),
  startsAt: leaveDate(false),
  endsAt: leaveDate(true),
  note: z.string().max(500).nullable().optional(),
});

const notifyLeaveRequested = (req: Request, l: LeaveOut) =>
  safely('leave requested', async () => {
    const admins = await prisma.user.findMany({ where: { id: { in: await adminIds(req.user!.id) } }, select: { id: true, locale: true } });
    for (const a of admins) {
      const tx = workspaceTexts(a.locale);
      const msg = tx.leaveRequested({
        actor: fullName(l.user),
        type: tx.leaveType[l.type],
        from: formatLeaveDay(l.startsAt, a.locale),
        to: formatLeaveDay(l.endsAt, a.locale),
        note: l.note,
      });
      await notifyUser(a.id, { type: 'LEAVE_REQUESTED', ...msg, link: '/workspace/team?tab=leave', ctaLabel: tx.cta.leave });
    }
  });

const notifyLeaveDecided = (req: Request, l: LeaveOut) =>
  safely('leave decided', async () => {
    if (l.status === 'APPROVED') await promptHandoverNotes(l).catch((e) => console.error('[workspace] handover prompt failed', e));
    const u = await prisma.user.findUnique({ where: { id: l.userId }, select: { id: true, locale: true } });
    if (!u || u.id === req.user!.id) return;
    const tx = workspaceTexts(u.locale);
    const p = {
      actor: fullName(req.user!),
      type: tx.leaveType[l.type],
      from: formatLeaveDay(l.startsAt, u.locale),
      to: formatLeaveDay(l.endsAt, u.locale),
      note: l.decisionNote,
    };
    const msg = l.status === 'APPROVED' ? tx.leaveApproved(p) : tx.leaveRejected(p);
    await notifyUser(u.id, { type: l.status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED', ...msg, link: '/workspace/team?tab=leave', ctaLabel: tx.cta.leave });
    publish(u.id, 'leave.updated', { id: l.id, status: l.status });
  });

const loadLeave = async (req: Request, leaveId: string) => {
  const l = await prisma.leaveRequest.findUnique({ where: { id: leaveId }, select: leaveSelect });
  if (!l) throw notFound('LEAVE_NOT_FOUND');
  if (l.userId !== req.user!.id && !isAdmin(req)) throw notFound('LEAVE_NOT_FOUND');
  return l;
};

const rangeSchema = z.object({ from: leaveDate(false).optional(), to: leaveDate(true).optional() });

/** GET /api/workspace/leave/calendar?from=&to= → approved leave of everyone in the range (team strip). */
workspaceRouter.get('/leave/calendar', async (req, res) => {
  const q = parse(rangeSchema, req.query);
  const now = new Date();
  const from = q.from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = q.to ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const rows = await prisma.leaveRequest.findMany({
    where: { status: 'APPROVED', startsAt: { lte: to }, endsAt: { gte: from } },
    select: leaveSelect,
    orderBy: [{ startsAt: 'asc' }],
  });
  res.json({ items: rows.map(toLeave), from, to });
});

/** GET /api/workspace/leave/balance → weekdays used (approved) and pending this year, per type. */
workspaceRouter.get('/leave/balance', async (req, res) => {
  const { userId } = parse(z.object({ userId: id.optional() }), req.query);
  const target = userId && isAdmin(req) ? userId : req.user!.id;
  res.json(await leaveBalance(target));
});

/** GET /api/workspace/leave?status=&userId=&from=&to= → my requests, or everyone's for ADMIN+. */
workspaceRouter.get('/leave', async (req, res) => {
  const q = parse(rangeSchema.extend({ status: z.enum(LEAVE_STATUSES).optional(), userId: id.optional() }), req.query);
  const where: Prisma.LeaveRequestWhereInput = {};
  if (isAdmin(req)) {
    if (q.userId) where.userId = q.userId;
  } else where.userId = req.user!.id;
  if (q.status) where.status = q.status;
  if (q.to) where.startsAt = { lte: q.to };
  if (q.from) where.endsAt = { gte: q.from };
  const rows = await prisma.leaveRequest.findMany({ where, select: leaveSelect, orderBy: [{ startsAt: 'desc' }], take: 500 });
  res.json({ items: rows.map(toLeave) });
});

/** POST /api/workspace/leave → new request (409 LEAVE_OVERLAP when it overlaps one of mine); notifies ADMIN+. */
workspaceRouter.post('/leave', async (req, res) => {
  const b = parse(leaveBody, req.body);
  if (b.endsAt.getTime() < b.startsAt.getTime()) throw badRequest('END_BEFORE_START');
  const clash = await prisma.leaveRequest.findFirst({ where: overlapWhere(req.user!.id, b.startsAt, b.endsAt), select: { id: true } });
  if (clash) throw conflict('LEAVE_OVERLAP', clash.id);
  const row = await prisma.leaveRequest.create({
    data: { userId: req.user!.id, type: b.type, startsAt: b.startsAt, endsAt: b.endsAt, note: b.note?.trim() || null },
    select: leaveSelect,
  });
  const leave = toLeave(row);
  await audit(req, 'LEAVE_REQUESTED', row.id, { type: b.type, startsAt: b.startsAt, endsAt: b.endsAt });
  await notifyLeaveRequested(req, leave);
  res.status(201).json({ leave });
});

/** PATCH /api/workspace/leave/:id → edit my request while it is PENDING. */
workspaceRouter.patch('/leave/:id', async (req, res) => {
  const l = await loadLeave(req, req.params.id);
  if (l.userId !== req.user!.id) throw forbidden();
  if (l.status !== 'PENDING') throw conflict('LEAVE_NOT_PENDING');
  const b = parse(leaveBody.partial(), req.body);
  const startsAt = b.startsAt ?? l.startsAt;
  const endsAt = b.endsAt ?? l.endsAt;
  if (endsAt.getTime() < startsAt.getTime()) throw badRequest('END_BEFORE_START');
  const clash = await prisma.leaveRequest.findFirst({ where: overlapWhere(req.user!.id, startsAt, endsAt, l.id), select: { id: true } });
  if (clash) throw conflict('LEAVE_OVERLAP', clash.id);
  const row = await prisma.leaveRequest.update({
    where: { id: l.id },
    data: { type: b.type ?? l.type, startsAt, endsAt, ...(b.note !== undefined ? { note: b.note?.trim() || null } : {}) },
    select: leaveSelect,
  });
  res.json({ leave: toLeave(row) });
});

workspaceRouter.post('/leave/:id/cancel', async (req, res) => {
  const l = await loadLeave(req, req.params.id);
  if (l.userId !== req.user!.id) throw forbidden();
  if (l.status === 'CANCELLED' || l.status === 'REJECTED') throw conflict('LEAVE_NOT_CANCELLABLE');
  const row = await prisma.leaveRequest.update({ where: { id: l.id }, data: { status: 'CANCELLED' }, select: leaveSelect });
  await audit(req, 'LEAVE_CANCELLED', l.id);
  res.json({ leave: toLeave(row) });
});

const decide = (status: 'APPROVED' | 'REJECTED') => async (req: Request, res: import('express').Response) => {
  if (!isAdmin(req)) throw forbidden();
  const { decisionNote } = parse(z.object({ decisionNote: z.string().max(500).nullable().optional() }), req.body ?? {});
  const l = await loadLeave(req, String(req.params.id));
  if (l.status !== 'PENDING') throw conflict('LEAVE_NOT_PENDING');
  const row = await prisma.leaveRequest.update({
    where: { id: l.id },
    data: { status, decidedById: req.user!.id, decidedAt: new Date(), decisionNote: decisionNote?.trim() || null },
    select: leaveSelect,
  });
  const leave = toLeave(row);
  await audit(req, status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED', l.id, { userId: l.userId });
  await notifyLeaveDecided(req, leave);
  if (status === 'APPROVED') publish(await staffIds(), 'presence.updated', { userId: l.userId, leave: { type: l.type, startsAt: l.startsAt, endsAt: l.endsAt } });
  res.json({ leave });
};
workspaceRouter.post('/leave/:id/approve', decide('APPROVED'));
workspaceRouter.post('/leave/:id/reject', decide('REJECTED'));

// ─── Announcements ─────────────────────────────────────────────────────

const announcementSelect = {
  id: true,
  title: true,
  body: true,
  pinned: true,
  publishedAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { reads: true } },
} satisfies Prisma.AnnouncementSelect;

type AnnouncementRow = Prisma.AnnouncementGetPayload<{ select: typeof announcementSelect }>;

const toAnnouncement = (a: AnnouncementRow, readIds: Set<string>, admin: boolean, now = new Date()) => {
  const { _count, ...rest } = a;
  return {
    ...rest,
    read: readIds.has(a.id),
    expired: !!a.expiresAt && a.expiresAt.getTime() <= now.getTime(),
    readCount: admin ? _count.reads : undefined,
    canEdit: admin,
  };
};

const activeAnnouncementsWhere = (now: Date): Prisma.AnnouncementWhereInput => ({ publishedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });
const announcementOrder: Prisma.AnnouncementOrderByWithRelationInput[] = [{ pinned: 'desc' }, { publishedAt: 'desc' }];

const listAnnouncements = async (req: Request, all: boolean, take?: number) => {
  const now = new Date();
  const admin = isAdmin(req);
  const where = all && admin ? {} : activeAnnouncementsWhere(now);
  const [rows, reads] = await Promise.all([
    prisma.announcement.findMany({ where, select: announcementSelect, orderBy: announcementOrder, ...(take ? { take } : {}) }),
    prisma.announcementRead.findMany({ where: { userId: req.user!.id }, select: { announcementId: true } }),
  ]);
  const readIds = new Set(reads.map((r) => r.announcementId));
  return rows.map((a) => toAnnouncement(a, readIds, admin, now));
};

const announcementBody = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20_000).transform((s) => s.replace(/\r\n/g, '\n').trim()),
  pinned: z.boolean().optional(),
  expiresAt: isoDate.nullable().optional(),
  publishedAt: isoDate.optional(),
});

/** GET /api/workspace/announcements?all=1 → active (pinned first) with my read flag; all=1 (ADMIN+) includes expired ones. */
workspaceRouter.get('/announcements', async (req, res) => {
  const { all } = parse(z.object({ all: z.enum(['1', 'true']).optional() }), req.query);
  res.json({ items: await listAnnouncements(req, !!all) });
});

const notifyAnnouncement = (req: Request, a: { id: string; title: string; body: string }) =>
  safely('announcement', async () => {
    const ids = await staffIds(req.user!.id);
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, locale: true } });
    const excerpt = excerptOf(a.body);
    for (const u of users) {
      const tx = workspaceTexts(u.locale);
      const msg = tx.announcement({ actor: fullName(req.user!), title: a.title, excerpt });
      await notifyUser(u.id, { type: 'ANNOUNCEMENT', ...msg, link: `/workspace/home?announcement=${a.id}`, ctaLabel: tx.cta.home, email: false });
    }
    publish(ids, 'announcement.new', { id: a.id, title: a.title });
  });

workspaceRouter.post('/announcements', async (req, res) => {
  if (!isAdmin(req)) throw forbidden();
  const b = parse(announcementBody, req.body);
  if (!b.body) throw badRequest('EMPTY_BODY');
  const row = await prisma.announcement.create({
    data: { authorId: req.user!.id, title: b.title, body: b.body, pinned: b.pinned ?? false, expiresAt: b.expiresAt ?? null, ...(b.publishedAt ? { publishedAt: b.publishedAt } : {}) },
    select: announcementSelect,
  });
  // The author has obviously read it.
  await prisma.announcementRead.create({ data: { announcementId: row.id, userId: req.user!.id } });
  await audit(req, 'ANNOUNCEMENT_CREATED', row.id, { title: b.title });
  await notifyAnnouncement(req, row);
  res.status(201).json({ announcement: toAnnouncement({ ...row, _count: { reads: 1 } }, new Set([row.id]), true) });
});

workspaceRouter.patch('/announcements/:id', async (req, res) => {
  if (!isAdmin(req)) throw forbidden();
  const b = parse(announcementBody.partial(), req.body);
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!existing) throw notFound('ANNOUNCEMENT_NOT_FOUND');
  if (b.body !== undefined && !b.body) throw badRequest('EMPTY_BODY');
  const row = await prisma.announcement.update({
    where: { id: existing.id },
    data: {
      ...(b.title !== undefined ? { title: b.title } : {}),
      ...(b.body !== undefined ? { body: b.body } : {}),
      ...(b.pinned !== undefined ? { pinned: b.pinned } : {}),
      ...(b.expiresAt !== undefined ? { expiresAt: b.expiresAt } : {}),
      ...(b.publishedAt !== undefined ? { publishedAt: b.publishedAt } : {}),
    },
    select: announcementSelect,
  });
  const reads = await prisma.announcementRead.findMany({ where: { userId: req.user!.id, announcementId: row.id } });
  await audit(req, 'ANNOUNCEMENT_UPDATED', row.id);
  res.json({ announcement: toAnnouncement(row, new Set(reads.map((r) => r.announcementId)), true) });
});

workspaceRouter.delete('/announcements/:id', async (req, res) => {
  if (!isAdmin(req)) throw forbidden();
  const r = await prisma.announcement.deleteMany({ where: { id: req.params.id } });
  if (!r.count) throw notFound('ANNOUNCEMENT_NOT_FOUND');
  await audit(req, 'ANNOUNCEMENT_DELETED', req.params.id);
  res.json({ ok: true });
});

workspaceRouter.post('/announcements/:id/read', async (req, res) => {
  const a = await prisma.announcement.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!a) throw notFound('ANNOUNCEMENT_NOT_FOUND');
  await prisma.announcementRead.upsert({
    where: { announcementId_userId: { announcementId: a.id, userId: req.user!.id } },
    create: { announcementId: a.id, userId: req.user!.id },
    update: {},
  });
  res.json({ ok: true });
});

// ─── Notes ─────────────────────────────────────────────────────────────

export const NOTE_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const;

const noteSelect = { id: true, title: true, body: true, color: true, pinned: true, sortOrder: true, createdAt: true, updatedAt: true } satisfies Prisma.NoteSelect;
const noteOrder: Prisma.NoteOrderByWithRelationInput[] = [{ pinned: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }];

const noteBody = z.object({
  title: z.string().max(120).nullable().optional().transform((s) => (s === undefined ? undefined : s?.trim() || null)),
  body: z.string().max(10_000).transform((s) => s.replace(/\r\n/g, '\n')).optional(),
  color: z.enum(NOTE_COLORS).nullable().optional(),
  pinned: z.boolean().optional(),
});

const myNotes = (userId: string) => prisma.note.findMany({ where: { userId }, select: noteSelect, orderBy: noteOrder });

workspaceRouter.get('/notes', async (req, res) => {
  res.json({ items: await myNotes(req.user!.id) });
});

workspaceRouter.post('/notes', async (req, res) => {
  const b = parse(noteBody, req.body);
  const min = await prisma.note.aggregate({ where: { userId: req.user!.id }, _min: { sortOrder: true } });
  const row = await prisma.note.create({
    data: { userId: req.user!.id, title: b.title ?? null, body: b.body ?? '', color: b.color ?? 'yellow', pinned: b.pinned ?? false, sortOrder: (min._min.sortOrder ?? 1) - 1 },
    select: noteSelect,
  });
  res.status(201).json({ note: row });
});

/** POST /api/workspace/notes/reorder { ids } → sortOrder by position (ids not mine are ignored). */
workspaceRouter.post('/notes/reorder', async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(id).max(500) }), req.body);
  const mine = new Set((await prisma.note.findMany({ where: { userId: req.user!.id }, select: { id: true } })).map((n) => n.id));
  const ordered = ids.filter((x) => mine.has(x));
  await prisma.$transaction(ordered.map((noteId, i) => prisma.note.update({ where: { id: noteId }, data: { sortOrder: i } })));
  res.json({ items: await myNotes(req.user!.id) });
});

workspaceRouter.patch('/notes/:id', async (req, res) => {
  const b = parse(noteBody, req.body);
  const n = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { id: true } });
  if (!n) throw notFound('NOTE_NOT_FOUND');
  const row = await prisma.note.update({
    where: { id: n.id },
    data: {
      ...(b.title !== undefined ? { title: b.title } : {}),
      ...(b.body !== undefined ? { body: b.body } : {}),
      ...(b.color !== undefined ? { color: b.color ?? 'yellow' } : {}),
      ...(b.pinned !== undefined ? { pinned: b.pinned } : {}),
    },
    select: noteSelect,
  });
  res.json({ note: row });
});

workspaceRouter.delete('/notes/:id', async (req, res) => {
  const r = await prisma.note.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
  if (!r.count) throw notFound('NOTE_NOT_FOUND');
  res.json({ ok: true });
});

// ─── Polls ─────────────────────────────────────────────────────────────

const pollBody = z.object({
  question: z.string().trim().min(1).max(300),
  options: z.array(z.string().trim().min(1).max(200)).min(2).max(12),
  multiple: z.boolean().optional(),
  anonymous: z.boolean().optional(),
  closesAt: isoDate.nullable().optional(),
  channelId: id.nullable().optional(),
});

/** GET /api/workspace/polls?channelId=&open=1 → workspace-wide polls (channelId=none) or a channel's polls. */
workspaceRouter.get('/polls', async (req, res) => {
  const q = parse(z.object({ channelId: z.string().max(40).optional(), open: z.enum(['1', 'true']).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }), req.query);
  const now = new Date();
  const where: Prisma.PollWhereInput = {};
  if (q.channelId && q.channelId !== 'none') where.channelId = q.channelId;
  else if (!q.channelId || q.channelId === 'none') where.channelId = null;
  if (q.open) Object.assign(where, { closedAt: null, OR: [{ closesAt: null }, { closesAt: { gt: now } }] });
  const rows = await prisma.poll.findMany({ where, include: pollInclude, orderBy: { createdAt: 'desc' }, take: q.limit ?? 50 });
  res.json({ items: rows.map((p) => toPoll(p, actorOf(req), now)) });
});

workspaceRouter.post('/polls', async (req, res) => {
  const b = parse(pollBody, req.body);
  if (b.closesAt && b.closesAt.getTime() <= Date.now()) throw badRequest('CLOSES_IN_PAST');
  if (b.channelId) {
    const member = await prisma.chatMember.findFirst({ where: { channelId: b.channelId, userId: req.user!.id }, select: { channelId: true } });
    if (!member) throw badRequest('INVALID_CHANNEL');
  }
  const unique = [...new Set(b.options.map((o) => o.trim()))];
  if (unique.length < 2) throw badRequest('DUPLICATE_OPTIONS');
  const row = await prisma.poll.create({
    data: {
      authorId: req.user!.id,
      channelId: b.channelId ?? null,
      question: b.question,
      multiple: b.multiple ?? false,
      anonymous: b.anonymous ?? false,
      closesAt: b.closesAt ?? null,
      options: { create: unique.map((text, i) => ({ text, sortOrder: i })) },
    },
    include: pollInclude,
  });
  const poll = toPoll(row, actorOf(req));
  if (!row.channelId) publish(await staffIds(req.user!.id), 'poll.updated', { id: row.id, question: row.question, kind: 'new' });
  res.status(201).json({ poll });
});

workspaceRouter.get('/polls/:id', async (req, res) => {
  res.json({ poll: toPoll(await loadPoll(req.params.id), actorOf(req)) });
});

/**
 * POST /api/workspace/polls/:id/vote { optionIds } — toggle semantics: an option I already voted for
 * is removed, a new one added; single-choice polls replace the previous vote. Answers { poll }.
 */
workspaceRouter.post('/polls/:id/vote', async (req, res) => {
  const { optionIds } = parse(z.object({ optionIds: z.array(id).min(1).max(12) }), req.body);
  const p = await loadPoll(req.params.id);
  if (!isOpen(p)) throw conflict('POLL_CLOSED');
  const valid = new Set(p.options.map((o) => o.id));
  const wanted = [...new Set(optionIds)];
  if (wanted.some((o) => !valid.has(o))) throw badRequest('INVALID_OPTION');
  const me = req.user!.id;
  const mine = new Set(p.options.filter((o) => o.votes.some((v) => v.userId === me)).map((o) => o.id));
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (p.multiple) {
    for (const o of wanted) {
      if (mine.has(o)) ops.push(prisma.pollVote.delete({ where: { optionId_userId: { optionId: o, userId: me } } }));
      else ops.push(prisma.pollVote.create({ data: { optionId: o, userId: me } }));
    }
  } else {
    const target = wanted[0];
    ops.push(prisma.pollVote.deleteMany({ where: { userId: me, option: { pollId: p.id } } }));
    if (!mine.has(target)) ops.push(prisma.pollVote.create({ data: { optionId: target, userId: me } }));
  }
  await prisma.$transaction(ops);
  const poll = toPoll(await loadPoll(p.id), actorOf(req));
  publish(await staffIds(me), 'poll.updated', { id: p.id, kind: 'vote' });
  res.json({ poll });
});

workspaceRouter.post('/polls/:id/close', async (req, res) => {
  const p = await loadPoll(req.params.id);
  if (p.authorId !== req.user!.id && !isAdmin(req)) throw forbidden();
  if (!isOpen(p)) throw conflict('POLL_CLOSED');
  const row = await prisma.poll.update({ where: { id: p.id }, data: { closedAt: new Date() }, include: pollInclude });
  publish(await staffIds(), 'poll.updated', { id: p.id, kind: 'closed' });
  res.json({ poll: toPoll(row, actorOf(req)) });
});

workspaceRouter.delete('/polls/:id', async (req, res) => {
  const p = await loadPoll(req.params.id);
  if (p.authorId !== req.user!.id && !isAdmin(req)) throw forbidden();
  await prisma.poll.delete({ where: { id: p.id } });
  publish(await staffIds(), 'poll.updated', { id: p.id, kind: 'deleted' });
  res.json({ ok: true });
});

// ─── Home aggregate ────────────────────────────────────────────────────

/**
 * GET /api/workspace/home → everything the dashboard owns in one call:
 * { announcements: { items, unread }, notes, polls, presence: { online, onLeave, total, people }, leave: { mine, pending } }
 */
workspaceRouter.get('/home', async (req, res) => {
  const now = new Date();
  const me = req.user!.id;
  const admin = isAdmin(req);
  // Opportunistic closing so an expired poll never shows as open between job runs.
  await closeExpiredPolls(now).catch(() => 0);
  const [announcements, notes, polls, people, mine, pending] = await Promise.all([
    listAnnouncements(req, false, 20),
    myNotes(me),
    prisma.poll.findMany({ where: { channelId: null, closedAt: null, OR: [{ closesAt: null }, { closesAt: { gt: now } }] }, include: pollInclude, orderBy: { createdAt: 'desc' }, take: 10 }),
    presenceList(now),
    prisma.leaveRequest.findMany({ where: { userId: me, status: { in: ['PENDING', 'APPROVED'] }, endsAt: { gte: now } }, select: leaveSelect, orderBy: { startsAt: 'asc' }, take: 5 }),
    admin ? prisma.leaveRequest.findMany({ where: { status: 'PENDING' }, select: leaveSelect, orderBy: { createdAt: 'asc' }, take: 20 }) : Promise.resolve([]),
  ]);
  res.json({
    now,
    announcements: { items: announcements, unread: announcements.filter((a) => !a.read).length },
    notes,
    polls: polls.map((p) => toPoll(p, actorOf(req), now)),
    presence: {
      total: people.length,
      online: people.filter((p) => p.online).length,
      onLeave: people.filter((p) => p.onLeave).length,
      people,
    },
    leave: { mine: mine.map(toLeave), pending: pending.map(toLeave) },
  });
});
