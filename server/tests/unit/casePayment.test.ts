import { describe, expect, it } from 'vitest';
import type { CaseStatus } from '@prisma/client';
import { paymentDue, type CasePayment } from '../../src/lib/casePayment/index.js';
import { computeBall } from '../../src/lib/clientProcess/ballInCourt.js';
import { DEFAULT_ETA } from '../../src/lib/clientProcess/settings.js';
import { computeSteps, TYPICAL_DAYS, type CaseFacts } from '../../src/lib/caseNext/nextStep.js';
import { DEFAULT_CHECKLISTS } from '../../src/lib/ai/features/caseAi/config.js';
import { buildStatusLine, type StatusFacts } from '../../src/lib/account/statusLine.js';
import { collectActions, type NextStepFacts } from '../../src/lib/account/nextStep.js';

/** Payment step after the Əmək müqaviləsi (CONTRACT_SIGNED, single-contract flow): the client pays in the office first. */

const NOW = new Date('2026-11-22T09:00:00Z');
const DAY = 86_400_000;
const pay = (over: Partial<CasePayment> = {}): CasePayment => ({ paid: false, paidAt: null, openCents: 0, currency: 'EUR', invoiceNumber: null, visit: null, ...over });

describe('paymentDue (pure)', () => {
  const base = { status: 'CONTRACT_SIGNED' as CaseStatus, contractTurn: 'STAFF' as const, work: 'NOT_SENT' as const, paid: false };
  it('due only after the Əmək müqaviləsi, with nothing sent after it, while unpaid', () => {
    expect(paymentDue(base)).toBe(true);
    expect(paymentDue({ ...base, paid: true })).toBe(false);
    expect(paymentDue({ ...base, paid: null })).toBe(false); // unknown (facts without payment)
    expect(paymentDue({ ...base, work: 'CLIENT_TO_SIGN' })).toBe(false); // old cases that already have an İş müqaviləsi
    expect(paymentDue({ ...base, work: 'SIGNED' })).toBe(false);
    expect(paymentDue({ ...base, contractTurn: 'CLIENT' })).toBe(false);
    expect(paymentDue({ ...base, status: 'CONTRACT_SENT' })).toBe(false);
    expect(paymentDue({ ...base, status: 'EMBASSY_DOCUMENTS' })).toBe(false);
  });
});

describe('ball in court: the client pays first', () => {
  const settings = { eta: DEFAULT_ETA, useCategoryProcessing: true };
  const f = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    status: 'CONTRACT_SIGNED' as CaseStatus,
    createdAt: new Date(NOW.getTime() - 10 * DAY),
    appointmentAt: null,
    processing: { min: null, max: null },
    contract: { signedAt: NOW, signatureRequestId: 'r1' },
    contractTurn: 'STAFF' as const,
    workContract: 'NOT_SENT' as const,
    uploadReqs: [],
    pendingDocs: 0,
    tasks: [],
    pendingSignatures: 0,
    lastClientMsg: null,
    lastStaffMsg: null,
    statusEvents: [],
    ...over,
  });
  it('unpaid → CLIENT / PAY_OFFICE (no team item); paid → the team prepares the German documents', () => {
    const due = computeBall(f({ paymentDue: true }), settings, NOW);
    expect(due).toMatchObject({ side: 'CLIENT', reason: 'PAY_OFFICE' });
    expect(due.items.some((i) => i.side === 'TEAM')).toBe(false);
    expect(computeBall(f({ paymentDue: false }), settings, NOW)).toMatchObject({ side: 'TEAM', reason: 'SEND_WORK_CONTRACT' });
    expect(computeBall(f(), settings, NOW)).toMatchObject({ side: 'TEAM', reason: 'SEND_WORK_CONTRACT' });
  });
});

describe('staff next step', () => {
  const facts = (over: Partial<CaseFacts> = {}): CaseFacts => ({
    id: 'case1',
    number: 'TV-2026-0001',
    status: 'CONTRACT_SIGNED',
    visaType: 'WORK',
    createdAt: new Date(NOW.getTime() - 40 * DAY),
    statusSince: NOW,
    daysInStatus: 0,
    typicalDays: TYPICAL_DAYS.CONTRACT_SIGNED,
    assignedStaffId: 'staff1',
    client: { id: 'client1', firstName: 'Elvin', lastName: 'Mammadov', locale: 'az' },
    passportExpiry: new Date(NOW.getTime() + 1000 * DAY),
    plannedEntry: new Date(NOW.getTime() + 60 * DAY),
    appointmentAt: null,
    appointmentPlace: null,
    contract: { sentAt: new Date(NOW.getTime() - 4 * DAY), signedAt: NOW },
    contractTurn: 'STAFF',
    contractV2: true,
    workContract: 'NOT_SENT',
    requirements: [],
    lastClientActivityAt: NOW,
    lastClientMessageAt: null,
    lastStaffMessageAt: null,
    openTasks: 0,
    overdueTasks: 0,
    packageBuiltAt: null,
    translationOrdered: false,
    translationPresent: false,
    checklist: DEFAULT_CHECKLISTS.WORK,
    purged: false,
    ...over,
  });
  const top = (f: CaseFacts) => computeSteps(f, { now: NOW })[0];

  it('unpaid: "waiting for the client\'s payment" with "Ödəniş alındı" (and the booked office visit)', () => {
    const visit = { id: 'b1', startsAt: new Date(NOW.getTime() + 2 * DAY), endsAt: new Date(NOW.getTime() + 2 * DAY + 1800_000), location: 'Bakı' };
    const step = top(facts({ payment: pay({ visit, openCents: 150_000 }) }));
    expect(step).toMatchObject({ code: 'AWAIT_PAYMENT', params: { visit: visit.startsAt.toISOString(), amount: 1500, currency: 'EUR' } });
    expect(step.actions.map((a) => a.id)).toEqual(['RECORD_PAYMENT', 'OPEN_DRIVE_WORKFLOW']);
    expect(step.actions[0]).toMatchObject({ kind: 'transition', confirm: true, request: { method: 'POST', path: '/admin/cases/case1/payment' } });
    expect(computeSteps(facts({ payment: pay() }), { now: NOW }).map((s) => s.code)).not.toContain('SEND_WORK_CONTRACT');
  });

  it('paid → the German documents are prepared in the İş axını (unchanged); no payment info → unchanged', () => {
    for (const payment of [pay({ paid: true, paidAt: NOW }), null, undefined]) {
      const step = top(facts({ payment }));
      expect(step.code).toBe('SEND_WORK_CONTRACT');
      expect(step.actions.map((a) => a.id)).toEqual(['OPEN_DRIVE_WORKFLOW', 'GO_EMBASSY_DOCS']);
    }
  });
});

describe('client cabinet', () => {
  const sf = (over: Partial<StatusFacts> = {}): StatusFacts => ({ now: NOW, primary: { id: 'c1', status: 'CONTRACT_SIGNED', appointmentAt: null }, actions: [], pendingDocs: 0, hasEmployer: false, contractTurn: 'STAFF', ...over });
  it('status line: payment due → required "PAY"; paid → "PAID_PREP"; nothing known → WORK_PREP', () => {
    const act = { kind: 'PAY_CASE' as const, to: '/account/cases/c1#payment', dueAt: null, overdue: false, count: 1, detail: null };
    expect(buildStatusLine(sf({ payment: 'DUE', actions: [act] }))).toMatchObject({ stage: 'PAY', required: true, to: '/account/cases/c1#payment' });
    expect(buildStatusLine(sf({ payment: 'PAID' }))).toMatchObject({ stage: 'PAID_PREP', required: false });
    expect(buildStatusLine(sf())).toMatchObject({ stage: 'WORK_PREP', required: false });
  });

  it('next-step card: a PAY_OFFICE ball item becomes the PAY_CASE action pointing to the payment card', () => {
    const facts = {
      now: NOW,
      pendingLegal: 0,
      hasCases: true,
      hasApproved: false,
      primary: { id: 'c1', status: 'CONTRACT_SIGNED' as CaseStatus, appointmentAt: null, appointmentPlace: null },
      ball: { side: 'CLIENT' as const, items: [{ side: 'CLIENT' as const, reason: 'PAY_OFFICE' as const, count: 1, dueAt: null, overdue: false }], eta: null },
      firstMissingDoc: null,
      firstRejectedDoc: null,
      confirmation: null,
      forms: [],
      signatures: [],
      tasks: [],
      checkIns: [],
      arrival: null,
      arrived: false,
      onboarding: null,
      residence: null,
      passportExpiry: null,
      profilePercent: 100,
    } satisfies NextStepFacts;
    expect(collectActions(facts)[0]).toMatchObject({ kind: 'PAY_CASE', to: '/account/cases/c1#payment' });
  });
});
