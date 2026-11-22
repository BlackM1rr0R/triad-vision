import { describe, expect, it } from 'vitest';
import type { CaseStatus } from '@prisma/client';
import { buildStatusLine, type StatusFacts } from '../../src/lib/account/statusLine.js';
import type { NextAction, NextKind } from '../../src/lib/account/nextStep.js';

/** Plain status line of the client cabinet: the stage and whether / what the client has to do. */

const NOW = new Date('2026-11-22T09:00:00Z');
const action = (kind: NextKind, detail: NextAction['detail'] = null): NextAction => ({ kind, to: `/x/${kind}`, dueAt: null, overdue: false, count: 1, detail });
const facts = (status: CaseStatus | null, over: Partial<StatusFacts> = {}): StatusFacts => ({
  now: NOW,
  primary: status ? { id: 'c1', status, appointmentAt: null } : null,
  actions: [],
  pendingDocs: 0,
  hasEmployer: false,
  ...over,
});

describe('cabinet status line', () => {
  it('documents: upload / rejected / submit are required; review needs nothing', () => {
    expect(buildStatusLine(facts('DOCUMENTS_PENDING', { actions: [action('UPLOAD_DOCS', { az: 'Pasport' })] }))).toMatchObject({ stage: 'UPLOAD_DOCS', required: true, detail: { az: 'Pasport' } });
    expect(buildStatusLine(facts('DOCUMENTS_REVIEW', { actions: [action('FIX_DOCS', { az: 'Diplom' })] }))).toMatchObject({ stage: 'FIX_DOCS', required: true, detail: { az: 'Diplom' } });
    expect(buildStatusLine(facts('DOCUMENTS_PENDING', { actions: [action('SUBMIT_DOCS')] }))).toMatchObject({ stage: 'SUBMIT_DOCS', required: true });
    expect(buildStatusLine(facts('DOCUMENTS_REVIEW', { pendingDocs: 3 }))).toMatchObject({ stage: 'DOCS_REVIEW', required: false, action: null });
  });

  it('job search until an employer is linked, then the contract is prepared', () => {
    expect(buildStatusLine(facts('DOCUMENTS_REVIEW'))).toMatchObject({ stage: 'JOB_SEARCH', required: false });
    expect(buildStatusLine(facts('DOCUMENTS_REVIEW', { hasEmployer: true }))).toMatchObject({ stage: 'CONTRACT_PREP', required: false });
  });

  it('contracts follow whose turn it is', () => {
    expect(buildStatusLine(facts('CONTRACT_SENT', { contractTurn: 'CLIENT', actions: [action('SIGN_CONTRACT')] }))).toMatchObject({ stage: 'SIGN_LABOUR', required: true, to: '/x/SIGN_CONTRACT' });
    expect(buildStatusLine(facts('CONTRACT_SENT', { contractTurn: 'TRIAD' }))).toMatchObject({ stage: 'LABOUR_TRIAD', required: false });
    expect(buildStatusLine(facts('CONTRACT_SIGNED', { contractTurn: 'CLIENT' }))).toMatchObject({ stage: 'SIGN_WORK', required: true });
    expect(buildStatusLine(facts('CONTRACT_SIGNED', { contractTurn: 'STAFF', workSigned: true }))).toMatchObject({ stage: 'WORK_REVIEW', required: false });
    expect(buildStatusLine(facts('CONTRACT_SIGNED', { contractTurn: 'STAFF' }))).toMatchObject({ stage: 'WORK_PREP', required: false });
  });

  it('another open task is named when the stage itself needs nothing', () => {
    const s = buildStatusLine(facts('EMBASSY_REVIEW', { actions: [action('SIGN_DOCUMENTS', 'Vollmacht'), action('COMPLETE_PROFILE')] }));
    expect(s).toMatchObject({ stage: 'EMBASSY_REVIEW', required: false, action: { kind: 'SIGN_DOCUMENTS', detail: 'Vollmacht' }, to: '/x/SIGN_DOCUMENTS' });
    // nudges are never "required"
    expect(buildStatusLine(facts('DECISION_PENDING', { actions: [action('COMPLETE_PROFILE')] }))).toMatchObject({ stage: 'DECISION', action: null });
  });

  it('appointment ahead is required; past appointment / decision / final states need nothing', () => {
    const at = new Date(NOW.getTime() + 3 * 86_400_000);
    expect(buildStatusLine(facts('APPOINTMENT_SCHEDULED', { primary: { id: 'c1', status: 'APPOINTMENT_SCHEDULED', appointmentAt: at } }))).toMatchObject({ stage: 'APPOINTMENT', required: true, detail: at.toISOString() });
    expect(buildStatusLine(facts('APPOINTMENT_SCHEDULED', { primary: { id: 'c1', status: 'APPOINTMENT_SCHEDULED', appointmentAt: new Date(NOW.getTime() - 86_400_000) } }))).toMatchObject({ stage: 'DECISION', required: false });
    for (const st of ['APPROVED', 'REJECTED', 'CANCELLED'] as const) expect(buildStatusLine(facts(st)).stage).toBe(st);
    expect(buildStatusLine(facts(null))).toMatchObject({ stage: 'NO_CASE', to: '/jobs' });
  });
});
