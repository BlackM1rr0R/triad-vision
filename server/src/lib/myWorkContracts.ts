import type { ContractKind } from '@prisma/client';
import { activeWorkSet, FLOW_V2, latestOf, stepOfKind, stepState, workSetState, type SignerLite, type Step } from './caseContracts/flow.js';

/**
 * Case contracts in the staff work queue (lib/myWork kinds contract_triad / contract_approve), pure:
 *   contract_triad    a contract document waits for the Triad Vision signature (V2: after the client signed;
 *                     old flow: before the client is invited)
 *   contract_approve  every party signed, staff still have to approve the step (Əmək müqaviləsi: the latest
 *                     request; V2 İş müqaviləsi: the whole active set)
 * Rows = every contract request (contractKind set) of the cases looked at.
 */

export interface ContractRow {
  id: string;
  caseId: string | null;
  title: string;
  contractKind: ContractKind | null;
  contractFlow: string | null;
  status: string;
  order: string;
  createdAt: Date;
  sentAt: Date | null;
  completedAt: Date | null;
  approvedAt: Date | null;
  expiresAt: Date | null;
  returnedAt: Date | null;
  supersededAt: Date | null;
  finalDocumentId: string | null;
  signers: (SignerLite & { signedAt: Date | null })[];
}

export interface ContractWork {
  kind: 'contract_triad' | 'contract_approve';
  caseId: string;
  step: Step;
  /** contract_triad / Əmək approval: the request; V2 İş approval: null (the set is approved at once). */
  requestId: string | null;
  title: string;
  /** Waiting since: the last signature, else when it was sent. */
  since: Date;
  finalDocumentId: string | null;
  documents: number;
}

const lastSigned = (r: ContractRow) => {
  const at = r.signers.map((s) => s.signedAt?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0);
  return at ? new Date(at) : null;
};
const sinceOf = (r: ContractRow) => r.completedAt ?? lastSigned(r) ?? r.sentAt ?? r.createdAt;

export const contractWork = (rows: ContractRow[], now = new Date()): ContractWork[] => {
  const out: ContractWork[] = [];
  const groups = new Map<string, ContractRow[]>();
  for (const r of rows) {
    const step = stepOfKind(r.contractKind);
    if (!r.caseId || !step) continue;
    const key = `${r.caseId}|${step}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const [key, list] of groups) {
    const [caseId, step] = key.split('|') as [string, Step];
    const v2Work = step === 'WORK' && list.some((r) => r.contractFlow === FLOW_V2);
    if (v2Work) {
      const set = activeWorkSet(list);
      for (const d of set) {
        if (stepState(d, now) === 'TRIAD_TO_SIGN') out.push({ kind: 'contract_triad', caseId, step, requestId: d.id, title: d.title, since: sinceOf(d), finalDocumentId: null, documents: 1 });
      }
      if (set.length && workSetState(set, now) === 'SIGNED') {
        const since = new Date(Math.max(...set.map((d) => sinceOf(d).getTime())));
        out.push({ kind: 'contract_approve', caseId, step, requestId: null, title: set[0].title, since, finalDocumentId: set.length === 1 ? set[0].finalDocumentId : null, documents: set.length });
      }
      continue;
    }
    const r = latestOf(list);
    if (!r) continue;
    const state = stepState(r, now);
    if (state === 'TRIAD_TO_SIGN') out.push({ kind: 'contract_triad', caseId, step, requestId: r.id, title: r.title, since: sinceOf(r), finalDocumentId: null, documents: 1 });
    else if (state === 'SIGNED') out.push({ kind: 'contract_approve', caseId, step, requestId: r.id, title: r.title, since: sinceOf(r), finalDocumentId: r.finalDocumentId, documents: 1 });
  }
  return out.sort((a, b) => a.since.getTime() - b.since.getTime());
};

/** Drops queue items that another kind already lists (refs.requestId), keeping the source totals right. */
export const withoutRequests = <S extends { items: { refs: Record<string, string | null> }[]; total: number }>(s: S, requestIds: Set<string>): S => {
  const items = s.items.filter((i) => !(i.refs.requestId && requestIds.has(i.refs.requestId)));
  return { ...s, items, total: Math.max(0, s.total - (s.items.length - items.length)) };
};
