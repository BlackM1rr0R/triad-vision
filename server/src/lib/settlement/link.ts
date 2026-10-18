import { prisma } from '../../db.js';
import { notFound } from '../http.js';
import { parseMemberInfo, FAMILY_EVENT } from '../journey/family.js';
import { nameScore } from './parse.js';
import { syncCommission, syncEntriesWithCases } from './service.js';

/**
 * Linking a ledger row to a case: suggestions by client name (Azerbaijani / Latin transliterations,
 * order-insensitive), and the link itself (the row then follows the case: stage, TLS / visa dates, partner).
 */

export interface CaseSuggestion {
  caseId: string;
  number: string;
  status: string;
  clientName: string;
  partnerId: string | null;
  score: number;
}

export const suggestCases = async (clientName: string, limit = 6): Promise<CaseSuggestion[]> => {
  const cases = await prisma.case.findMany({
    select: {
      id: true,
      number: true,
      status: true,
      partnerId: true,
      parentCaseId: true,
      client: { select: { firstName: true, lastName: true } },
      events: { where: { type: FAMILY_EVENT }, select: { note: true }, take: 1, orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  const out: CaseSuggestion[] = [];
  for (const c of cases) {
    const member = c.parentCaseId ? parseMemberInfo(c.events[0]?.note) : null;
    const name = member ? `${member.firstName} ${member.lastName ?? ''}`.trim() : `${c.client.firstName} ${c.client.lastName}`.trim();
    const score = nameScore(clientName, name);
    if (score >= 0.5) out.push({ caseId: c.id, number: c.number, status: c.status, clientName: name, partnerId: c.partnerId, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
};

/** Links (or with null unlinks) a row; a linked row follows its case right away. */
export const linkCase = async (entryId: string, caseId: string | null) => {
  if (caseId && !(await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } }))) throw notFound('CASE_NOT_FOUND');
  const e = await prisma.settlementEntry.update({ where: { id: entryId }, data: { caseId, ...(caseId ? { stageAuto: true } : {}) } });
  await syncEntriesWithCases([e]);
  await syncCommission(entryId);
  return e;
};
