import { describe, expect, it, vi } from 'vitest';
import type { CaseStatus } from '@prisma/client';
import { caseContractTurn, sendBlockReason, type ContractRequestLite, type StepState } from '../../src/lib/caseContracts/flow.js';

vi.mock('../../src/db.js', () => ({ prisma: {} }));

const { computeBall } = await import('../../src/lib/clientProcess/ballInCourt.js');
const { DEFAULT_ETA } = await import('../../src/lib/clientProcess/settings.js');
const { computeSteps, TYPICAL_DAYS } = await import('../../src/lib/caseNext/nextStep.js');
const { DEFAULT_CHECKLISTS } = await import('../../src/lib/ai/features/caseAi/config.js');

const NOW = new Date('2026-11-20T09:00:00Z');
const DAY = 86_400_000;

const request = (over: Partial<ContractRequestLite> = {}): ContractRequestLite => ({
  status: 'SENT',
  order: 'SEQUENTIAL',
  expiresAt: new Date(NOW.getTime() + 10 * DAY),
  signers: [
    { role: 'STAFF', status: 'PENDING', order: 1 },
    { role: 'CANDIDATE', status: 'PENDING', order: 2 },
  ],
  ...over,
});
const esign = { signedAt: null, signatureRequestId: 'r1' };

describe('case contract: whose turn (C-CON-1)', () => {
  it('two-step contract: Triad Vision first, then the client', () => {
    expect(caseContractTurn(esign, request(), NOW)).toBe('TRIAD');
    expect(caseContractTurn(esign, request({ signers: [{ role: 'STAFF', status: 'SIGNED', order: 1 }, { role: 'CANDIDATE', status: 'VIEWED', order: 2 }] }), NOW)).toBe('CLIENT');
    // Generic contract (client first, Triad Vision countersigns): after the client signed it is Triad Vision's turn.
    expect(caseContractTurn(esign, request({ signers: [{ role: 'CANDIDATE', status: 'SIGNED', order: 1 }, { role: 'STAFF', status: 'PENDING', order: 2 }] }), NOW)).toBe('TRIAD');
    expect(caseContractTurn(esign, request({ order: 'PARALLEL' }), NOW)).toBe('CLIENT');
  });

  it('expired / declined / voided / missing request: staff must send a new version', () => {
    expect(caseContractTurn(esign, request({ expiresAt: new Date(NOW.getTime() - DAY) }), NOW)).toBe('STAFF');
    for (const status of ['EXPIRED', 'DECLINED', 'CANCELLED', 'COMPLETED']) expect(caseContractTurn(esign, request({ status }), NOW)).toBe('STAFF');
    expect(caseContractTurn(esign, null, NOW)).toBe('STAFF');
  });

  it('legacy upload contract: the client signs; a signed or missing contract has no turn', () => {
    expect(caseContractTurn({ signedAt: null, signatureRequestId: null }, null, NOW)).toBe('CLIENT');
    expect(caseContractTurn({ signedAt: NOW, signatureRequestId: 'r1' }, request(), NOW)).toBeNull();
    expect(caseContractTurn(null, null, NOW)).toBeNull();
  });
});

describe('ball in court while Triad Vision signs (C-CON-1)', () => {
  const settings = { eta: DEFAULT_ETA, useCategoryProcessing: true };
  const facts = (contractTurn?: 'CLIENT' | 'TRIAD' | 'STAFF' | null) => ({
    id: 'c1',
    status: 'CONTRACT_SENT' as CaseStatus,
    createdAt: new Date(NOW.getTime() - 10 * DAY),
    appointmentAt: null,
    processing: { min: null, max: null },
    contract: { signedAt: null, signatureRequestId: 'r1' },
    ...(contractTurn !== undefined ? { contractTurn } : {}),
    uploadReqs: [],
    pendingDocs: 0,
    tasks: [],
    pendingSignatures: 0,
    lastClientMsg: null,
    lastStaffMsg: null,
    statusEvents: [],
  });

  it('TRIAD: the team holds the ball, the client is not told to sign', () => {
    const b = computeBall(facts('TRIAD'), settings, NOW);
    expect(b).toMatchObject({ side: 'TEAM', reason: 'TRIAD_SIGN_CONTRACT', eta: null });
    expect(b.items.some((i) => i.reason === 'SIGN_CONTRACT')).toBe(false);
  });

  it('STAFF: a new version is due; CLIENT (and legacy facts) keep SIGN_CONTRACT', () => {
    expect(computeBall(facts('STAFF'), settings, NOW)).toMatchObject({ side: 'TEAM', reason: 'RESEND_CONTRACT' });
    expect(computeBall(facts('CLIENT'), settings, NOW)).toMatchObject({ side: 'CLIENT', reason: 'SIGN_CONTRACT' });
    expect(computeBall(facts(), settings, NOW)).toMatchObject({ side: 'CLIENT', reason: 'SIGN_CONTRACT' });
  });
});

describe('staff next step while Triad Vision signs (A-5)', () => {
  const facts = (contractTurn: 'CLIENT' | 'TRIAD' | 'STAFF', daysInStatus = 9) => ({
    id: 'case1',
    number: 'TV-2026-0001',
    status: 'CONTRACT_SENT' as CaseStatus,
    visaType: 'WORK' as const,
    createdAt: new Date(NOW.getTime() - 40 * DAY),
    statusSince: new Date(NOW.getTime() - daysInStatus * DAY),
    daysInStatus,
    typicalDays: TYPICAL_DAYS.CONTRACT_SENT,
    assignedStaffId: 'staff1',
    client: { id: 'client1', firstName: 'Elvin', lastName: 'Mammadov', locale: 'de' as const },
    passportExpiry: new Date(NOW.getTime() + 1000 * DAY),
    plannedEntry: new Date(NOW.getTime() + 60 * DAY),
    appointmentAt: null,
    appointmentPlace: null,
    contract: { sentAt: new Date(NOW.getTime() - daysInStatus * DAY), signedAt: null },
    contractTurn,
    requirements: [],
    lastClientActivityAt: new Date(NOW.getTime() - daysInStatus * DAY),
    lastClientMessageAt: null,
    lastStaffMessageAt: null,
    openTasks: 0,
    overdueTasks: 0,
    packageBuiltAt: null,
    translationOrdered: false,
    translationPresent: false,
    checklist: DEFAULT_CHECKLISTS.WORK,
    purged: false,
  });
  const codes = (f: ReturnType<typeof facts>) => computeSteps(f, { now: NOW }).map((s) => s.code);

  it('TRIAD: "Triad Vision must sign" (opens the contracts panel), never chase the client', () => {
    const steps = computeSteps(facts('TRIAD'), { now: NOW });
    expect(steps[0]).toMatchObject({ code: 'TRIAD_SIGN_CONTRACT', actions: [{ id: 'OPEN_CONTRACT', kind: 'scroll', target: 'case-contract' }] });
    expect(codes(facts('TRIAD'))).not.toContain('CONTRACT_NOT_SIGNED');
    expect(codes(facts('TRIAD'))).not.toContain('CLIENT_IDLE');
  });

  it('STAFF: send a new version; CLIENT: the old reminders stay', () => {
    expect(codes(facts('STAFF'))).toContain('RESEND_CONTRACT');
    expect(codes(facts('STAFF'))).not.toContain('CONTRACT_NOT_SIGNED');
    expect(codes(facts('CLIENT'))).toEqual(expect.arrayContaining(['CONTRACT_NOT_SIGNED', 'CLIENT_IDLE']));
    expect(codes(facts('CLIENT'))).not.toContain('TRIAD_SIGN_CONTRACT');
  });
});

describe('Əmək müqaviləsi send rules: never stuck (A-1, C-CON-2)', () => {
  const states = (labour: StepState, work: StepState = 'NOT_SENT') => ({ LABOUR: labour, WORK: work });

  it('not before the contract step: an early send could never become the case contract', () => {
    expect(sendBlockReason('LABOUR', states('NOT_SENT'), 'DOCUMENTS_PENDING')).toBe('NOT_CONTRACT_STEP');
  });

  it('an approval from outside the contract step does not block a new version while the case waits for its contract', () => {
    for (const s of ['DOCUMENTS_REVIEW', 'CONTRACT_SENT'] as CaseStatus[]) expect(sendBlockReason('LABOUR', states('APPROVED'), s)).toBeNull();
    for (const s of ['CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'DECISION_PENDING'] as CaseStatus[]) expect(sendBlockReason('LABOUR', states('APPROVED'), s)).toBe('ALREADY_APPROVED');
    expect(sendBlockReason('WORK', states('APPROVED', 'APPROVED'), 'DOCUMENTS_REVIEW')).toBe('ALREADY_APPROVED');
  });
});
