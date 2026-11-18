import type { CaseStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { caseContractTurn, type ContractTurn } from './flow.js';

/**
 * Whose turn the case contract is for several cases (one query): only cases in CONTRACT_SENT get an entry.
 * Used by the ball in court, the client's next action, the staff next step and the contract reminders so that
 * nobody tells the client to sign while Triad Vision still has to sign first (or a new version is needed).
 */
export const loadContractTurns = async (
  cases: { id: string; status: CaseStatus; contract: { signedAt: Date | null; signatureRequestId: string | null } | null }[],
  now = new Date(),
): Promise<Map<string, ContractTurn | null>> => {
  const open = cases.filter((c) => c.status === 'CONTRACT_SENT');
  const ids = [...new Set(open.map((c) => c.contract?.signatureRequestId).filter((x): x is string => !!x))];
  const requests = ids.length
    ? await prisma.signatureRequest.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true, order: true, expiresAt: true, signers: { select: { role: true, status: true, order: true } } },
      })
    : [];
  const byId = new Map(requests.map((r) => [r.id, r]));
  return new Map(open.map((c) => [c.id, caseContractTurn(c.contract, c.contract?.signatureRequestId ? (byId.get(c.contract.signatureRequestId) ?? null) : null, now)]));
};
