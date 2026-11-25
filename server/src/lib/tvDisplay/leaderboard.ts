import { prisma } from '../../db.js';
import { maskName } from './mask.js';

/**
 * Staff leaderboard for the office TV: counts of what each team member did in a window, from CaseEvent rows
 * (documents reviewed = DOCUMENT_ACCEPTED/REJECTED, cases moved forward = events with a status change,
 * approvals = events that moved a case to APPROVED). Only the FIRST NAME of staff is shown (no surname, no ids).
 * Opt-in panel: not part of the default panel list.
 */
export interface LeaderEvent {
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorId: string | null;
}
export interface LeaderEntry {
  name: string;
  reviewed: number;
  moved: number;
  approvals: number;
  score: number;
}

const BACKWARD_TYPES = new Set(['REOPENED', 'SIGNATURE_REJECTED']);

/** Pure: per-actor counts, sorted by score (reviews + moves + 3 x approvals), ties by name. */
export const aggregateLeaderboard = (events: LeaderEvent[], names: Map<string, string>, limit = 5): LeaderEntry[] => {
  const acc = new Map<string, Omit<LeaderEntry, 'name' | 'score'>>();
  for (const e of events) {
    if (!e.actorId || !names.has(e.actorId)) continue;
    const row = acc.get(e.actorId) ?? { reviewed: 0, moved: 0, approvals: 0 };
    if (e.type === 'DOCUMENT_ACCEPTED' || e.type === 'DOCUMENT_REJECTED') row.reviewed += 1;
    else if (e.toStatus && e.fromStatus && e.toStatus !== e.fromStatus && !BACKWARD_TYPES.has(e.type) && e.toStatus !== 'CANCELLED') {
      row.moved += 1;
      if (e.toStatus === 'APPROVED') row.approvals += 1;
    }
    acc.set(e.actorId, row);
  }
  return [...acc.entries()]
    .map(([id, r]) => ({ name: names.get(id)!, ...r, score: r.reviewed + r.moved + 3 * r.approvals }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
};

const firstName = (full: string) => (maskName(full, '') || '').replace(/\.$/, '');

const forWindow = async (start: Date, end: Date) => {
  const events = await prisma.caseEvent.findMany({
    where: { createdAt: { gte: start, lt: end }, actorId: { not: null }, OR: [{ type: { in: ['DOCUMENT_ACCEPTED', 'DOCUMENT_REJECTED'] } }, { toStatus: { not: null }, fromStatus: { not: null } }] },
    select: { type: true, fromStatus: true, toStatus: true, actorId: true },
    take: 20000,
  });
  const ids = [...new Set(events.map((e) => e.actorId!))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids }, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, firstName: true } }) : [];
  const names = new Map(users.map((u) => [u.id, firstName(u.firstName)]).filter(([, n]) => n) as [string, string][]);
  return aggregateLeaderboard(events, names);
};

export const buildLeaderboard = async (week: { start: Date; end: Date }, month: { start: Date; end: Date }) => {
  const [w, m] = await Promise.all([forWindow(week.start, week.end), forWindow(month.start, month.end)]);
  return { week: w, month: m };
};
