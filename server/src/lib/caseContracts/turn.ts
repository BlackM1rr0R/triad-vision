import type { CaseStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { activeWorkSet, caseContractTurn, FLOW_V2, latestOf, stepOfKind, workContractTurn, workSetState, type ContractTurn, type StepState } from './flow.js';

/**
 * Detail of the case contract for the staff next step / ball in court:
 *   turn  whose turn (see loadContractTurns)
 *   v2    the Əmək müqaviləsi follows the V2 flow (client first, Triad Vision second; then the İş müqaviləsi set)
 *   work  CONTRACT_SIGNED + V2 only: state of the İş müqaviləsi set (NOT_SENT / CLIENT_TO_SIGN / SIGNED / RETURNED …)
 */
export interface ContractInfo {
  turn: ContractTurn | null;
  v2: boolean;
  work: StepState | null;
}

type CaseLite = { id: string; status: CaseStatus; contract: { signedAt: Date | null; signatureRequestId: string | null } | null };

/**
 * Whose turn the case contract is for several cases (few queries):
 *   CONTRACT_SENT    the Əmək müqaviləsi request's current turn (old flow: Triad Vision first; V2: the client first)
 *   CONTRACT_SIGNED  only for V2 cases (Əmək müqaviləsi approved by Triad Vision's signature): whose turn the
 *                    İş müqaviləsi documents are (CLIENT signs / STAFF upload or review). Old-flow cases get no
 *                    entry (staff check the signature, as before).
 * Used by the ball in court, the client's next action, the staff next step, the partner portal and the contract
 * reminders so that nobody tells the client to sign while it is Triad Vision's turn (or a new version is needed).
 */
export const loadContractTurns = async (cases: CaseLite[], now = new Date()): Promise<Map<string, ContractTurn | null>> =>
  new Map([...(await loadContractInfo(cases, now))].map(([id, i]) => [id, i.turn]));

/** Same queries as loadContractTurns, with the flow and the İş müqaviləsi state (V2-aware staff texts). */
export const loadContractInfo = async (cases: CaseLite[], now = new Date()): Promise<Map<string, ContractInfo>> => {
  const open = cases.filter((c) => c.status === 'CONTRACT_SENT');
  const ids = [...new Set(open.map((c) => c.contract?.signatureRequestId).filter((x): x is string => !!x))];
  const signed = cases.filter((c) => c.status === 'CONTRACT_SIGNED').map((c) => c.id);
  const [requests, stepRows] = await Promise.all([
    ids.length
      ? prisma.signatureRequest.findMany({
          where: { id: { in: ids } },
          select: { id: true, status: true, order: true, expiresAt: true, contractFlow: true, signers: { select: { role: true, status: true, order: true } } },
        })
      : Promise.resolve([]),
    signed.length
      ? prisma.signatureRequest.findMany({
          where: { caseId: { in: signed }, contractKind: { not: null } },
          select: {
            caseId: true,
            contractKind: true,
            contractFlow: true,
            status: true,
            order: true,
            createdAt: true,
            approvedAt: true,
            expiresAt: true,
            returnedAt: true,
            supersededAt: true,
            signers: { select: { role: true, status: true, order: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const byId = new Map(requests.map((r) => [r.id, r]));
  const out = new Map<string, ContractInfo>(
    open.map((c) => {
      const r = c.contract?.signatureRequestId ? (byId.get(c.contract.signatureRequestId) ?? null) : null;
      return [c.id, { turn: caseContractTurn(c.contract, r, now), v2: r?.contractFlow === FLOW_V2, work: null }];
    }),
  );
  for (const caseId of signed) {
    const rows = stepRows.filter((r) => r.caseId === caseId);
    const labour = latestOf(rows.filter((r) => stepOfKind(r.contractKind) === 'LABOUR'));
    if (!labour || labour.contractFlow !== FLOW_V2 || !labour.approvedAt) continue;
    const set = activeWorkSet(rows.filter((r) => stepOfKind(r.contractKind) === 'WORK'));
    out.set(caseId, { turn: workContractTurn(set, now), v2: true, work: workSetState(set, now) });
  }
  return out;
};
