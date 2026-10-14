import {
  ALL_STATUSES,
  CLIENT_ACTION,
  CLIENT_UPLOAD_STAGE,
  FINAL,
  STAFF_ACTION,
  STAFF_ACTIONS,
  STATUS_STEP,
  STEP_KEYS,
  missingRequirements,
  pickActiveCase,
  progressOf,
  stepStates,
} from '@/lib/caseStatus';
import type { CaseDocument, CaseStatus, CaseSummary, Requirement } from '@/types';

describe('status → step mapping', () => {
  it('has 6 visible steps', () => {
    expect(STEP_KEYS).toEqual(['documents', 'contract', 'embassyDocs', 'appointment', 'decision', 'result']);
  });

  it.each<[CaseStatus, number]>([
    ['DOCUMENTS_PENDING', 0],
    ['DOCUMENTS_REVIEW', 0],
    ['CONTRACT_SENT', 1],
    ['CONTRACT_SIGNED', 1],
    ['EMBASSY_DOCUMENTS', 2],
    ['EMBASSY_REVIEW', 2],
    ['APPOINTMENT_SCHEDULED', 3],
    ['DECISION_PENDING', 4],
    ['APPROVED', 5],
    ['REJECTED', 5],
    ['CANCELLED', -1],
  ])('%s is step %i', (status, step) => {
    expect(STATUS_STEP[status]).toBe(step);
  });

  it('covers all 11 server statuses', () => {
    expect(ALL_STATUSES).toHaveLength(11);
  });

  it('marks earlier steps done and the current one current', () => {
    expect(stepStates('EMBASSY_DOCUMENTS')).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(stepStates('DOCUMENTS_PENDING')[0]).toBe('current');
  });

  it('shows approval as all done and refusal as a failed last step', () => {
    expect(stepStates('APPROVED').every((s) => s === 'done')).toBe(true);
    expect(stepStates('REJECTED')).toEqual(['done', 'done', 'done', 'done', 'done', 'failed']);
    expect(stepStates('CANCELLED').every((s) => s === 'upcoming')).toBe(true);
  });

  it('computes monotonic progress', () => {
    const order: CaseStatus[] = ['DOCUMENTS_PENDING', 'CONTRACT_SENT', 'EMBASSY_DOCUMENTS', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED'];
    const values = order.map(progressOf);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    expect(progressOf('CANCELLED')).toBe(0);
    expect(progressOf('APPROVED')).toBe(1);
  });

  it('splits "whose move is it" without overlap', () => {
    const overlap = CLIENT_ACTION.filter((s) => STAFF_ACTION.includes(s) || FINAL.includes(s));
    expect(overlap).toEqual([]);
    expect(CLIENT_ACTION.length + STAFF_ACTION.length + FINAL.length).toBe(ALL_STATUSES.length);
  });

  it('only lets clients upload while their upload step is open', () => {
    expect(Object.keys(CLIENT_UPLOAD_STAGE).sort()).toEqual(['DOCUMENTS_PENDING', 'EMBASSY_DOCUMENTS']);
  });
});

describe('staff workflow actions (mirror of server/src/lib/caseFlow.ts)', () => {
  it('offers nothing after approval and only REOPEN after refusal/cancel', () => {
    expect(STAFF_ACTIONS.APPROVED).toEqual([]);
    expect(STAFF_ACTIONS.REJECTED).toEqual(['REOPEN']);
    expect(STAFF_ACTIONS.CANCELLED).toEqual(['REOPEN']);
  });

  it('allows cancel on every non-final status', () => {
    for (const s of ALL_STATUSES) {
      expect(STAFF_ACTIONS[s].includes('CANCEL')).toBe(!FINAL.includes(s));
    }
  });

  it('maps review statuses to their decisions', () => {
    expect(STAFF_ACTIONS.DOCUMENTS_REVIEW).toEqual(expect.arrayContaining(['SEND_CONTRACT', 'REQUEST_CHANGES']));
    expect(STAFF_ACTIONS.CONTRACT_SIGNED).toEqual(expect.arrayContaining(['CONFIRM_CONTRACT', 'REJECT_SIGNATURE', 'SEND_CONTRACT']));
    expect(STAFF_ACTIONS.EMBASSY_REVIEW).toEqual(expect.arrayContaining(['SCHEDULE', 'REQUEST_CHANGES']));
    expect(STAFF_ACTIONS.APPOINTMENT_SCHEDULED).toEqual(expect.arrayContaining(['MARK_LODGED', 'SCHEDULE']));
    expect(STAFF_ACTIONS.DECISION_PENDING).toContain('DECIDE');
  });

  it('lets staff resend the contract wherever the server allows it (staffSendContract)', () => {
    for (const s of ['DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED'] as const) expect(STAFF_ACTIONS[s]).toContain('SEND_CONTRACT');
    for (const s of ALL_STATUSES.filter((x) => !['DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED'].includes(x))) expect(STAFF_ACTIONS[s]).not.toContain('SEND_CONTRACT');
  });
});

const doc = (status: CaseDocument['status'], createdAt = '2026-01-01T00:00:00Z'): CaseDocument => ({
  id: Math.random().toString(36),
  caseId: 'c',
  requirementId: 'r',
  stage: 'INITIAL',
  originalName: 'a.pdf',
  mimeType: 'application/pdf',
  size: 1,
  status,
  reviewNote: null,
  uploadedById: 'u',
  createdAt,
});

const req = (id: string, required: boolean, docs: CaseDocument[], stage: Requirement['stage'] = 'INITIAL'): Requirement => ({
  id,
  stage,
  title: { az: id, de: id, en: id, ru: id },
  description: null,
  required,
  sortOrder: 0,
  documents: docs,
});

describe('missingRequirements', () => {
  const reqs = [
    req('passport', true, [doc('PENDING')]),
    req('photo', true, [doc('REJECTED')]),
    req('cv', true, []),
    req('licence', false, []),
    req('insurance', true, [], 'EMBASSY'),
  ];

  it('in upload mode, rejected or missing uploads count as missing; optional ones never do', () => {
    expect(missingRequirements(reqs, 'INITIAL', 'uploaded').map((r) => r.id)).toEqual(['photo', 'cv']);
  });

  it('in accepted mode, only accepted uploads satisfy a requirement', () => {
    expect(missingRequirements(reqs, 'INITIAL', 'accepted').map((r) => r.id)).toEqual(['passport', 'photo', 'cv']);
  });

  it('filters by stage', () => {
    expect(missingRequirements(reqs, 'EMBASSY', 'uploaded').map((r) => r.id)).toEqual(['insurance']);
  });
});

describe('pickActiveCase', () => {
  const c = (id: string, status: CaseStatus, createdAt: string): CaseSummary => ({
    id,
    number: id,
    profession: 'x',
    status,
    createdAt,
    updatedAt: createdAt,
    visaCategory: null,
  });

  it('prefers the newest open case', () => {
    const cases = [c('old', 'REJECTED', '2026-01-01'), c('open', 'CONTRACT_SENT', '2026-02-01'), c('newer-final', 'CANCELLED', '2026-03-01')];
    expect(pickActiveCase(cases)?.id).toBe('open');
  });

  it('falls back to the newest case when all are final', () => {
    expect(pickActiveCase([c('a', 'REJECTED', '2026-01-01'), c('b', 'APPROVED', '2026-05-01')])?.id).toBe('b');
  });

  it('returns undefined for no cases', () => {
    expect(pickActiveCase([])).toBeUndefined();
  });
});
