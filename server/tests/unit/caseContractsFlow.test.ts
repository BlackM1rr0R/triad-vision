import { describe, expect, it } from 'vitest';
import {
  canApprove,
  DRIVE_FOLDER,
  isCaseContractFor,
  latestOf,
  sendBlockReason,
  signedFileName,
  stepOfKind,
  stepState,
  triadFirstSigners,
  type RequestLite,
  type StepState,
} from '../../src/lib/caseContracts/flow.js';

const at = (iso: string) => new Date(iso);
const req = (over: Partial<RequestLite> = {}): RequestLite => ({
  status: 'SENT',
  createdAt: at('2026-11-01T10:00:00Z'),
  approvedAt: null,
  expiresAt: null,
  signers: [
    { role: 'STAFF', status: 'PENDING', order: 1 },
    { role: 'CANDIDATE', status: 'PENDING', order: 2 },
  ],
  ...over,
});

describe('two-step case contracts: rules', () => {
  it('signer order: Triad Vision first, the client second, nobody else (no employer)', () => {
    const s = triadFirstSigners({ name: 'Anar Admin', email: 'a@tv.test', userId: 'u1' }, { name: 'Rauf Həsənov', email: 'r@test.local', userId: 'c1', locale: 'az' });
    expect(s.map((x) => [x.role, x.order])).toEqual([
      ['STAFF', 1],
      ['CANDIDATE', 2],
    ]);
    expect(s.some((x) => (x.role as string) === 'COMPANY')).toBe(false);
  });

  it('state follows the signatures: Triad Vision → client → signed → approved', () => {
    expect(stepState(null)).toBe('NOT_SENT');
    expect(stepState(req())).toBe('TRIAD_TO_SIGN');
    expect(stepState(req({ signers: [{ role: 'STAFF', status: 'SIGNED', order: 1 }, { role: 'CANDIDATE', status: 'VIEWED', order: 2 }] }))).toBe('CLIENT_TO_SIGN');
    expect(stepState(req({ status: 'COMPLETED' }))).toBe('SIGNED');
    expect(stepState(req({ status: 'COMPLETED', approvedAt: at('2026-11-03T00:00:00Z') }))).toBe('APPROVED');
    expect(stepState(req({ status: 'DECLINED' }))).toBe('DECLINED');
    expect(stepState(req({ status: 'CANCELLED' }))).toBe('CANCELLED');
    expect(stepState(req({ expiresAt: at('2026-11-02T00:00:00Z') }), at('2026-11-05T00:00:00Z'))).toBe('EXPIRED');
  });

  it('the latest request describes the step (superseded versions and drafts are skipped)', () => {
    const old = req({ status: 'COMPLETED', createdAt: at('2026-10-01T00:00:00Z') });
    const cancelled = req({ status: 'CANCELLED', createdAt: at('2026-11-02T00:00:00Z') });
    const draft = req({ status: 'DRAFT', createdAt: at('2026-11-03T00:00:00Z') });
    expect(latestOf([old, cancelled, draft])).toBe(old);
    expect(latestOf([cancelled, draft])).toBe(cancelled);
    expect(latestOf([draft])).toBeNull();
    expect(latestOf([])).toBeNull();
  });

  it('İş müqaviləsi is blocked until the Əmək müqaviləsi is approved', () => {
    const states = (labour: StepState, work: StepState = 'NOT_SENT') => ({ LABOUR: labour, WORK: work });
    for (const s of ['NOT_SENT', 'TRIAD_TO_SIGN', 'CLIENT_TO_SIGN', 'SIGNED', 'DECLINED', 'EXPIRED', 'CANCELLED'] as StepState[]) {
      expect(sendBlockReason('WORK', states(s), 'EMBASSY_DOCUMENTS')).toBe('LABOUR_NOT_APPROVED');
    }
    expect(sendBlockReason('WORK', states('APPROVED'), 'EMBASSY_DOCUMENTS')).toBeNull();
    expect(sendBlockReason('WORK', states('APPROVED', 'APPROVED'), 'EMBASSY_DOCUMENTS')).toBe('ALREADY_APPROVED');
    expect(sendBlockReason('LABOUR', states('NOT_SENT'), 'DOCUMENTS_REVIEW')).toBeNull();
    expect(sendBlockReason('LABOUR', states('SIGNED'), 'CONTRACT_SIGNED')).toBeNull(); // a corrected version may replace it before approval
    expect(sendBlockReason('LABOUR', states('APPROVED'), 'EMBASSY_DOCUMENTS')).toBe('ALREADY_APPROVED');
    expect(sendBlockReason('LABOUR', states('NOT_SENT'), 'CANCELLED')).toBe('CASE_CLOSED');
  });

  it('only a fully signed step can be approved', () => {
    expect(canApprove('SIGNED')).toBe(true);
    for (const s of ['NOT_SENT', 'TRIAD_TO_SIGN', 'CLIENT_TO_SIGN', 'APPROVED', 'DECLINED', 'EXPIRED', 'CANCELLED'] as StepState[]) expect(canApprove(s)).toBe(false);
  });

  it('step 1 is the case contract only in the contract step; step 2 never', () => {
    expect(isCaseContractFor('LABOUR', 'DOCUMENTS_REVIEW')).toBe(true);
    expect(isCaseContractFor('LABOUR', 'CONTRACT_SIGNED')).toBe(true);
    expect(isCaseContractFor('LABOUR', 'EMBASSY_DOCUMENTS')).toBe(false);
    expect(isCaseContractFor('WORK', 'CONTRACT_SENT')).toBe(false);
  });

  it('kinds, drive folders and file names', () => {
    expect(stepOfKind('LABOUR')).toBe('LABOUR');
    expect(stepOfKind('WORK')).toBe('WORK');
    expect(stepOfKind('AUSBILDUNG')).toBe('WORK');
    expect(stepOfKind('SERVICE')).toBeNull();
    expect(stepOfKind(null)).toBeNull();
    expect(DRIVE_FOLDER).toEqual({ LABOUR: 'Əmək müqaviləsi', WORK: 'İş müqaviləsi' });
    expect(signedFileName('LABOUR', 'TV-2026-0012')).toBe('Əmək müqaviləsi – TV-2026-0012 (imzalanmış).pdf');
  });
});
