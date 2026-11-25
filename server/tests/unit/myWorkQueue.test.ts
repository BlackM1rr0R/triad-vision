import { describe, expect, it } from 'vitest';
import { contractWork, withoutRequests, type ContractRow } from '../../src/lib/myWorkContracts.js';
import { compareItems, WORK_KINDS, type WorkItem } from '../../src/lib/myWork.js';

const NOW = new Date('2026-11-24T09:00:00Z');
const DAY = 24 * 3600 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

let seq = 0;
const row = (o: Partial<ContractRow> & Pick<ContractRow, 'caseId' | 'contractKind'>): ContractRow => ({
  id: `r${++seq}`,
  title: 'Əmək müqaviləsi',
  contractFlow: 'V2',
  status: 'SENT',
  order: 'SEQUENTIAL',
  createdAt: ago(5),
  sentAt: ago(5),
  completedAt: null,
  approvedAt: null,
  expiresAt: null,
  returnedAt: null,
  supersededAt: null,
  finalDocumentId: null,
  signers: [],
  ...o,
});
const client = (status: string, signedAt: Date | null = null) => ({ role: 'CANDIDATE', status, order: 1, signedAt });
const triad = (status: string, signedAt: Date | null = null) => ({ role: 'STAFF', status, order: 2, signedAt });

describe('contractWork (staff queue: Triad Vision signs / staff approve)', () => {
  it('V2 Əmək müqaviləsi: client signed → Triad Vision to sign, waiting since the client signature', () => {
    const r = row({ caseId: 'c1', contractKind: 'LABOUR', signers: [client('SIGNED', ago(2)), triad('PENDING')] });
    const out = contractWork([r], NOW);
    expect(out).toEqual([expect.objectContaining({ kind: 'contract_triad', caseId: 'c1', step: 'LABOUR', requestId: r.id })]);
    expect(out[0].since).toEqual(ago(2));
  });

  it('client still to sign → nothing for staff', () => {
    expect(contractWork([row({ caseId: 'c1', contractKind: 'LABOUR', signers: [client('PENDING'), triad('PENDING')] })], NOW)).toEqual([]);
  });

  it('completed and not approved → approve; approved → nothing', () => {
    const done = row({ caseId: 'c1', contractKind: 'LABOUR', status: 'COMPLETED', completedAt: ago(1), finalDocumentId: 'doc1', signers: [client('SIGNED', ago(3)), triad('SIGNED', ago(1))] });
    expect(contractWork([done], NOW)).toEqual([expect.objectContaining({ kind: 'contract_approve', step: 'LABOUR', requestId: done.id, finalDocumentId: 'doc1' })]);
    expect(contractWork([{ ...done, approvedAt: ago(0) }], NOW)).toEqual([]);
  });

  it('only the latest request of a step counts (an older completed one was replaced)', () => {
    const old = row({ caseId: 'c1', contractKind: 'LABOUR', status: 'COMPLETED', createdAt: ago(9), signers: [client('SIGNED', ago(8)), triad('SIGNED', ago(8))] });
    const fresh = row({ caseId: 'c1', contractKind: 'LABOUR', createdAt: ago(1), signers: [client('PENDING'), triad('PENDING')] });
    expect(contractWork([old, fresh], NOW)).toEqual([]);
  });

  it('V2 İş müqaviləsi set: Triad Vision turn per document, approval once the whole set is signed', () => {
    const a = row({ caseId: 'c2', contractKind: 'WORK', title: 'Arbeitsvertrag', createdAt: ago(4), signers: [client('SIGNED', ago(2)), triad('PENDING')] });
    const b = row({ caseId: 'c2', contractKind: 'WORK', title: 'Anlage', createdAt: ago(3), status: 'COMPLETED', signers: [client('SIGNED', ago(2)), triad('SIGNED', ago(1))] });
    expect(contractWork([a, b], NOW).map((w) => [w.kind, w.requestId])).toEqual([['contract_triad', a.id]]);
    const a2 = { ...a, status: 'COMPLETED', signers: [client('SIGNED', ago(2)), triad('SIGNED', ago(1))] };
    const out = contractWork([a2, b], NOW);
    expect(out).toEqual([expect.objectContaining({ kind: 'contract_approve', step: 'WORK', requestId: null, documents: 2 })]);
  });

  it('a returned V2 document blocks the approval', () => {
    const a = row({ caseId: 'c3', contractKind: 'WORK', status: 'COMPLETED', signers: [client('SIGNED', ago(2)), triad('SIGNED', ago(1))] });
    const back = row({ caseId: 'c3', contractKind: 'WORK', status: 'CANCELLED', returnedAt: ago(1), signers: [client('SIGNED', ago(2))] });
    expect(contractWork([a, back], NOW)).toEqual([]);
  });

  it('oldest first; rows without a case or a contract kind are ignored', () => {
    const late = row({ caseId: 'c4', contractKind: 'LABOUR', signers: [client('SIGNED', ago(1)), triad('PENDING')] });
    const early = row({ caseId: 'c5', contractKind: 'LABOUR', signers: [client('SIGNED', ago(4)), triad('PENDING')] });
    const noCase = row({ caseId: null, contractKind: 'LABOUR', signers: [client('SIGNED', ago(4)), triad('PENDING')] });
    const noKind = row({ caseId: 'c6', contractKind: null, signers: [client('SIGNED', ago(4)), triad('PENDING')] });
    expect(contractWork([late, early, noCase, noKind], NOW).map((w) => w.caseId)).toEqual(['c5', 'c4']);
  });
});

describe('withoutRequests (one entry per contract)', () => {
  it('drops items listed elsewhere and lowers the total', () => {
    const s = { kind: 'sign_mine', total: 5, items: [{ refs: { requestId: 'a' } }, { refs: { requestId: 'b' } }, { refs: { requestId: null } }] };
    const out = withoutRequests(s, new Set(['a']));
    expect(out.items.map((i) => i.refs.requestId)).toEqual(['b', null]);
    expect(out.total).toBe(4);
  });
});

describe('queue kinds + sorting', () => {
  it('has the new kinds', () => {
    for (const k of ['contract_triad', 'contract_approve', 'vacancy_request']) expect(WORK_KINDS).toContain(k);
    for (const k of ['external_help', 'external_ready']) expect(WORK_KINDS).not.toContain(k); // external apply retired
  });

  it('overdue first, then priority, then nearest deadline, then oldest', () => {
    const item = (id: string, o: Partial<WorkItem>): WorkItem =>
      ({ id, kind: 'task', category: 'tasks', title: id, subtitle: null, priority: 'NORMAL', dueAt: null, since: NOW.toISOString(), ageHours: 0, overdue: false, bucket: 'today', link: '/', refs: {}, assignee: null, actions: [], ...o }) as WorkItem;
    const list = [
      item('normal-old', { ageHours: 50 }),
      item('high-later', { priority: 'HIGH', dueAt: new Date(NOW.getTime() + 2 * DAY).toISOString() }),
      item('overdue', { overdue: true, dueAt: ago(1).toISOString() }),
      item('high-soon', { priority: 'HIGH', dueAt: new Date(NOW.getTime() + DAY).toISOString() }),
      item('urgent', { priority: 'URGENT' }),
      item('normal-new', { ageHours: 1 }),
    ];
    expect([...list].sort(compareItems).map((i) => i.id)).toEqual(['overdue', 'urgent', 'high-soon', 'high-later', 'normal-old', 'normal-new']);
  });
});
