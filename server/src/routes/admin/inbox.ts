import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../../lib/caseFlow.js';
import { forbidden, parse } from '../../lib/http.js';
import { hasMinRole } from '../../middleware/auth.js';
import { unansweredThreads } from '../../lib/myWork.js';

/**
 * Staff message inbox (mounted at /api/admin/inbox, STAFF+): the case conversations of the last INBOX_WINDOW_DAYS,
 * threads waiting for the team's answer first (oldest wait first), then the rest by their latest message. Built for
 * the phone "Mesajlar" tab (pages/admin/Inbox.tsx); replies and "read" use the existing case endpoints
 * (POST /admin/cases/:id/messages, POST /admin/cases/:id/messages/read).
 *
 *   GET /inbox?scope=mine|all&filter=all|awaiting
 *       { items: [{ caseId, number, status, client, assignedStaff, lastMessage: { excerpt, at, fromClient, voice },
 *                   awaitingReply, since, waitingCount, unread }], counts: { awaiting, unread }, scope }
 *
 * Scope follows "my work": STAFF see their own cases, ADMIN+ their own plus unassigned ones; scope=all (every case)
 * is ADMIN+ only. Open cases only. "Awaiting" = the latest message is from the client (lib/myWork unansweredThreads).
 */
export const adminInboxRouter = Router();

export const INBOX_WINDOW_DAYS = 30;
export const INBOX_MAX_THREADS = 100;
const SCAN = 3000;
const DAY = 24 * 60 * 60 * 1000;

const excerpt = (s: string) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 160 ? `${t.slice(0, 159)}…` : t;
};

adminInboxRouter.get('/', async (req, res) => {
  const q = parse(z.object({ scope: z.enum(['mine', 'all']).default('mine'), filter: z.enum(['all', 'awaiting']).default('all') }), req.query);
  const me = req.user!;
  const isAdmin = hasMinRole(me.role, 'ADMIN');
  if (q.scope === 'all' && !isAdmin) throw forbidden('TEAM_SCOPE_FORBIDDEN');
  const mine: Prisma.CaseWhereInput = q.scope === 'all' ? {} : isAdmin ? { OR: [{ assignedStaffId: me.id }, { assignedStaffId: null }] } : { assignedStaffId: me.id };

  const rows = await prisma.caseMessage.findMany({
    where: { createdAt: { gte: new Date(Date.now() - INBOX_WINDOW_DAYS * DAY) }, case: { status: { notIn: FINAL_STATUSES }, ...mine } },
    select: { caseId: true, createdAt: true, authorId: true, body: true, readAt: true, voiceId: true, case: { select: { clientId: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: SCAN,
  });
  const fromClient = (m: (typeof rows)[number]) => m.authorId === m.case.clientId;
  const open = unansweredThreads(rows.map((m) => ({ caseId: m.caseId, createdAt: m.createdAt, fromClient: fromClient(m) })));
  const latest = new Map<string, (typeof rows)[number]>();
  const unread = new Map<string, number>();
  for (const m of rows) {
    if (!latest.has(m.caseId)) latest.set(m.caseId, m);
    if (fromClient(m) && !m.readAt) unread.set(m.caseId, (unread.get(m.caseId) ?? 0) + 1);
  }
  const awaiting = [...open.entries()].sort((a, b) => a[1].since.getTime() - b[1].since.getTime()).map(([id]) => id);
  const rest = q.filter === 'awaiting' ? [] : [...latest.keys()].filter((id) => !open.has(id)); // already newest first
  const ids = [...awaiting, ...rest].slice(0, INBOX_MAX_THREADS);
  const cases = ids.length
    ? await prisma.case.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          number: true,
          status: true,
          client: { select: { id: true, firstName: true, lastName: true, phone: true } },
          assignedStaff: { select: { id: true, firstName: true, lastName: true } },
        },
      })
    : [];
  const byId = new Map(cases.map((c) => [c.id, c]));
  res.json({
    scope: q.scope,
    counts: { awaiting: awaiting.length, unread: [...unread.values()].reduce((a, b) => a + b, 0) },
    items: ids
      .map((id) => byId.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => {
        const m = latest.get(c.id)!;
        const wait = open.get(c.id);
        return {
          caseId: c.id,
          number: c.number,
          status: c.status,
          client: c.client,
          assignedStaff: c.assignedStaff,
          lastMessage: { excerpt: excerpt(m.body), at: m.createdAt, fromClient: fromClient(m), voice: !!m.voiceId },
          awaitingReply: !!wait,
          since: wait?.since ?? null,
          waitingCount: wait?.count ?? 0,
          unread: unread.get(c.id) ?? 0,
        };
      }),
  });
});
