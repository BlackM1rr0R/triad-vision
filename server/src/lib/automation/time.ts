import type { CaseStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

/**
 * Time-based trigger state: the client's last activity on a case (event they caused, message they wrote,
 * document they uploaded; else the case creation) and since when a case is in its current status.
 * One SQL query per scan, so the 15-minute job stays cheap.
 */

const toDate = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));

export const clientActivity = async (opts: { caseIds?: string[]; statuses?: CaseStatus[] } = {}) => {
  if (opts.caseIds && !opts.caseIds.length) return new Map<string, Date>();
  const rows = await prisma.$queryRaw<{ id: string; lastAt: Date | string }[]>`
    SELECT c.id,
      GREATEST(c.createdAt,
        COALESCE((SELECT MAX(e.createdAt) FROM CaseEvent e WHERE e.caseId = c.id AND e.actorId = c.clientId), c.createdAt),
        COALESCE((SELECT MAX(m.createdAt) FROM CaseMessage m WHERE m.caseId = c.id AND m.authorId = c.clientId), c.createdAt),
        COALESCE((SELECT MAX(d.createdAt) FROM Document d WHERE d.caseId = c.id AND d.uploadedById = c.clientId), c.createdAt)
      ) AS lastAt
    FROM \`Case\` c
    WHERE c.status NOT IN ('APPROVED', 'REJECTED', 'CANCELLED')
    ${opts.caseIds ? Prisma.sql`AND c.id IN (${Prisma.join(opts.caseIds)})` : Prisma.empty}
    ${opts.statuses?.length ? Prisma.sql`AND c.status IN (${Prisma.join(opts.statuses)})` : Prisma.empty}`;
  return new Map(rows.map((r) => [r.id, toDate(r.lastAt)]));
};

export const statusSince = async (opts: { caseIds?: string[]; status?: CaseStatus } = {}) => {
  if (opts.caseIds && !opts.caseIds.length) return new Map<string, Date>();
  const rows = await prisma.$queryRaw<{ id: string; since: Date | string }[]>`
    SELECT c.id,
      COALESCE((SELECT MAX(e.createdAt) FROM CaseEvent e
                WHERE e.caseId = c.id AND e.toStatus = c.status AND (e.fromStatus IS NULL OR e.fromStatus <> c.status)), c.createdAt) AS since
    FROM \`Case\` c
    WHERE 1 = 1
    ${opts.caseIds ? Prisma.sql`AND c.id IN (${Prisma.join(opts.caseIds)})` : Prisma.empty}
    ${opts.status ? Prisma.sql`AND c.status = ${opts.status}` : Prisma.empty}`;
  return new Map(rows.map((r) => [r.id, toDate(r.since)]));
};
