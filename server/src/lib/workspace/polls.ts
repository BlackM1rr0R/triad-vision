import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole } from '../../middleware/auth.js';
import { notFound } from '../http.js';

/**
 * Polls (workspace-wide or inside a chat channel). The chat module renders a poll card from
 * `GET /api/workspace/polls/:id` and votes through `POST /api/workspace/polls/:id/vote`, so the
 * shape below is the contract:
 *
 *   { id, question, multiple, anonymous, closesAt, closedAt, open, createdAt, channelId,
 *     author: { id, firstName, lastName },
 *     options: [{ id, text, count, mine, voters: [{ id, firstName, lastName }] | null }],
 *     totalVotes, voterCount, myVotes: [optionId], canClose }
 *
 * `voters` is null for anonymous polls. `mine` says whether I voted for that option.
 */

export const pollInclude = {
  author: { select: { id: true, firstName: true, lastName: true } },
  options: { orderBy: { sortOrder: 'asc' }, include: { votes: { select: { userId: true, user: { select: { id: true, firstName: true, lastName: true } } } } } },
} satisfies Prisma.PollInclude;

export type PollRow = Prisma.PollGetPayload<{ include: typeof pollInclude }>;

export const isOpen = (p: { closedAt: Date | null; closesAt: Date | null }, now = new Date()) =>
  !p.closedAt && (!p.closesAt || p.closesAt.getTime() > now.getTime());

export const toPoll = (p: PollRow, actor: { id: string; role: Role }, now = new Date()) => {
  const voters = new Set<string>();
  let totalVotes = 0;
  const myVotes: string[] = [];
  const options = p.options.map((o) => {
    totalVotes += o.votes.length;
    for (const v of o.votes) voters.add(v.userId);
    const mine = o.votes.some((v) => v.userId === actor.id);
    if (mine) myVotes.push(o.id);
    return {
      id: o.id,
      text: o.text,
      count: o.votes.length,
      mine,
      voters: p.anonymous ? null : o.votes.map((v) => v.user),
    };
  });
  return {
    id: p.id,
    question: p.question,
    multiple: p.multiple,
    anonymous: p.anonymous,
    closesAt: p.closesAt,
    closedAt: p.closedAt,
    open: isOpen(p, now),
    createdAt: p.createdAt,
    channelId: p.channelId,
    author: p.author,
    options,
    totalVotes,
    voterCount: voters.size,
    myVotes,
    canClose: isOpen(p, now) && (p.authorId === actor.id || hasMinRole(actor.role, 'ADMIN')),
    canDelete: p.authorId === actor.id || hasMinRole(actor.role, 'ADMIN'),
  };
};

export type PollOut = ReturnType<typeof toPoll>;

export const loadPoll = async (id: string) => {
  const p = await prisma.poll.findUnique({ where: { id }, include: pollInclude });
  if (!p) throw notFound('POLL_NOT_FOUND');
  return p;
};

/** Polls past `closesAt` get a `closedAt` stamp (run by jobs/workspace.ts every 5 minutes). */
export const closeExpiredPolls = async (now = new Date()) => {
  const r = await prisma.poll.updateMany({ where: { closedAt: null, closesAt: { lte: now } }, data: { closedAt: now } });
  return r.count;
};
