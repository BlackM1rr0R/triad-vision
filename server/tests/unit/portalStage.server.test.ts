import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { derivePhase, EMPTY_CONTEXT, featuredTools, hasArrived, MAX_FEATURED, PHASE_TOOLS, PORTAL_TOOLS, portalStageOf, STAGE_OF_PHASE, type PortalPhase } from '../../src/lib/account/portalStage.js';
import { pickNextStep, type NextStepFacts } from '../../src/lib/account/nextStep.js';

/** Stage-based client portal (lib/account/portalStage): stage per case situation and the featured tools. */

const NOW = new Date('2026-11-20T09:00:00Z');
const DAY = 24 * 3600 * 1000;
const inDays = (d: number) => new Date(NOW.getTime() + d * DAY);

describe('portal stage: one stage per situation', () => {
  it('exploring: no case yet', () => {
    expect(portalStageOf([], false)).toMatchObject({ stage: 'EXPLORING', phase: 'LEAD' });
    // Even "arrived" without a case stays exploring (no case → nothing to be in Germany with).
    expect(portalStageOf([], true).stage).toBe('EXPLORING');
  });

  it('applying: an open case before the decision (documents and embassy phases)', () => {
    expect(portalStageOf([{ status: 'DOCUMENTS_PENDING' }], false)).toMatchObject({ stage: 'APPLYING', phase: 'PREPARING' });
    expect(portalStageOf([{ status: 'CONTRACT_SENT' }], false)).toMatchObject({ stage: 'APPLYING', phase: 'PREPARING' });
    expect(portalStageOf([{ status: 'APPOINTMENT_SCHEDULED' }], false)).toMatchObject({ stage: 'APPLYING', phase: 'AT_EMBASSY' });
    expect(portalStageOf([{ status: 'DECISION_PENDING' }], false)).toMatchObject({ stage: 'APPLYING', phase: 'AT_EMBASSY' });
    // A new open main application beats an older approval.
    expect(portalStageOf([{ status: 'EMBASSY_DOCUMENTS' }, { status: 'APPROVED' }], false).stage).toBe('APPLYING');
  });

  it('departure: visa approved, not arrived (open family-member cases do not pull it back)', () => {
    expect(portalStageOf([{ status: 'APPROVED' }], false)).toMatchObject({ stage: 'DEPARTURE', phase: 'TRAVEL' });
    expect(portalStageOf([{ status: 'APPROVED' }, { status: 'DOCUMENTS_PENDING', parentCaseId: 'c1' }], false).stage).toBe('DEPARTURE');
  });

  it('in Germany: arrived beats everything (renewal / family case open)', () => {
    expect(portalStageOf([{ status: 'APPROVED' }], true)).toMatchObject({ stage: 'IN_GERMANY', phase: 'IN_GERMANY' });
    expect(portalStageOf([{ status: 'DOCUMENTS_PENDING' }, { status: 'APPROVED' }], true).stage).toBe('IN_GERMANY');
  });

  it('closed: every case rejected or cancelled', () => {
    expect(portalStageOf([{ status: 'REJECTED' }, { status: 'CANCELLED' }], false)).toMatchObject({ stage: 'CLOSED', phase: 'CLOSED' });
  });

  it('an open family-member case alone: applying', () => {
    expect(derivePhase([{ status: 'REJECTED' }, { status: 'EMBASSY_REVIEW', parentCaseId: 'c1' }], false)).toBe('AT_EMBASSY');
  });

  it('arrived: a passed follow-up date or a completed arrival plan', () => {
    expect(hasArrived(inDays(-1), null, NOW)).toBe(true);
    expect(hasArrived(inDays(2), null, NOW)).toBe(false);
    expect(hasArrived(null, 'COMPLETED', NOW)).toBe(true);
    expect(hasArrived(null, 'SUBMITTED', NOW)).toBe(false);
  });
});

describe('portal stage: featured tools', () => {
  const phases = Object.keys(PHASE_TOOLS) as PortalPhase[];

  it('every phase features 4–7 known tools, no duplicates; every phase maps to a stage', () => {
    for (const p of phases) {
      const f = featuredTools(p);
      expect(f.length, p).toBeGreaterThanOrEqual(4);
      expect(f.length, p).toBeLessThanOrEqual(MAX_FEATURED);
      expect(new Set(f).size).toBe(f.length);
      for (const t of f) expect(PORTAL_TOOLS).toContain(t);
      expect(STAGE_OF_PHASE[p]).toBeTruthy();
    }
  });

  it('per stage: the most relevant tools', () => {
    expect(featuredTools('LEAD')).toEqual(expect.arrayContaining(['cv', 'german', 'savedJobs']));
    expect(featuredTools('PREPARING').slice(0, 2)).toEqual(['documents', 'checklist']);
    expect(featuredTools('PREPARING')).toEqual(expect.arrayContaining(['german', 'interviewPrep', 'cv', 'readiness']));
    expect(featuredTools('AT_EMBASSY')).toContain('interviewPrep');
    expect(featuredTools('TRAVEL')).toEqual(expect.arrayContaining(['arrivalPrep', 'futureLetter', 'pocketGuide', 'emergencyWallpaper', 'visaStory']));
    expect(featuredTools('IN_GERMANY')).toEqual(expect.arrayContaining(['onboarding', 'payslip', 'rateAlerts', 'germanyReady']));
    expect(featuredTools('IN_GERMANY')).not.toContain('documents');
    expect(featuredTools('CLOSED')).toContain('cases');
  });

  it('urgent extras go first and the list stays capped', () => {
    const f = featuredTools('PREPARING', { ...EMPTY_CONTEXT, pendingSignatures: 1, openInvoices: 2, interviewsAhead: true });
    expect(f.slice(0, 3)).toEqual(['signatures', 'payments', 'interviews']);
    expect(f).toHaveLength(MAX_FEATURED);
    expect(f).toContain('documents');
  });

  it('in Germany a still open case (renewal, family) brings its documents back', () => {
    expect(featuredTools('IN_GERMANY', { ...EMPTY_CONTEXT, hasOpenCase: true })[0]).toBe('documents');
    // Employer interviews are not pushed after the visa.
    expect(featuredTools('TRAVEL', { ...EMPTY_CONTEXT, interviewsAhead: true })).not.toContain('interviews');
  });
});

describe('portal tools: server and client catalogue in sync', () => {
  let client: { PORTAL_TOOL_KEYS: readonly string[] };
  beforeAll(async () => {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/lib/portalTools.ts');
    client = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as typeof client;
  });

  it('same keys', () => {
    expect([...client.PORTAL_TOOL_KEYS].sort()).toEqual([...PORTAL_TOOLS].sort());
  });
});

describe('next step: new priority rules', () => {
  const facts = (over: Partial<NextStepFacts> = {}): NextStepFacts => ({
    now: NOW,
    pendingLegal: 0,
    hasCases: true,
    hasApproved: false,
    primary: { id: 'c1', status: 'DOCUMENTS_PENDING', appointmentAt: null, appointmentPlace: null },
    ball: null,
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
    ...over,
  });

  it('embassy appointment within three weeks: interview prep (a nudge, not counted)', () => {
    const r = pickNextStep(facts({ primary: { id: 'c1', status: 'APPOINTMENT_SCHEDULED', appointmentAt: inDays(10), appointmentPlace: 'Baku' } }));
    expect(r.primary).toMatchObject({ kind: 'PREP_INTERVIEW', to: '/account/interview-prep', overdue: false });
    expect(r.primary?.dueAt).toBe(inDays(10).toISOString());
    expect(r.actionCount).toBe(0);
  });

  it('no prep nudge for a far or past appointment', () => {
    expect(pickNextStep(facts({ primary: { id: 'c1', status: 'APPOINTMENT_SCHEDULED', appointmentAt: inDays(40), appointmentPlace: null } })).primary).toBeNull();
    expect(pickNextStep(facts({ primary: { id: 'c1', status: 'DECISION_PENDING', appointmentAt: inDays(-2), appointmentPlace: null } })).primary).toBeNull();
  });

  it('a confirmed employer interview: prep after the real tasks', () => {
    const r = pickNextStep(
      facts({
        ball: { side: 'CLIENT', eta: null, items: [{ side: 'CLIENT', reason: 'UPLOAD_DOCS' as never, count: 1, dueAt: null, overdue: false }] },
        interviews: { invites: 0, proposed: [], confirmed: [inDays(3)] },
      }),
    );
    expect(r.primary?.kind).toBe('UPLOAD_DOCS');
    expect(r.secondary[0]).toMatchObject({ kind: 'PREP_INTERVIEW', to: '/account/interview-prep' });
  });

  it('visa approved and the arrival plan sent: the arrival preparation', () => {
    const base = { primary: null, hasApproved: true };
    expect(pickNextStep(facts({ ...base, arrival: { caseId: 'c1', planStatus: null } })).primary?.kind).toBe('ARRIVAL_PLAN');
    const r = pickNextStep(facts({ ...base, arrival: { caseId: 'c1', planStatus: 'SUBMITTED' } }));
    expect(r.primary).toMatchObject({ kind: 'ARRIVAL_PREP', to: '/account/arrival-prep' });
    expect(r.actionCount).toBe(0);
    // Arrived: no more departure preparation.
    expect(pickNextStep(facts({ ...base, arrived: true, arrival: { caseId: 'c1', planStatus: 'COMPLETED' } })).primary).toBeNull();
  });

  it('missing document, unsigned contract and an invoice keep their order', () => {
    const r = pickNextStep(
      facts({
        ball: {
          side: 'CLIENT',
          eta: null,
          items: [
            { side: 'CLIENT', reason: 'SIGN_CONTRACT' as never, count: 1, dueAt: null, overdue: false },
            { side: 'CLIENT', reason: 'UPLOAD_DOCS' as never, count: 1, dueAt: null, overdue: false },
          ],
        },
        invoices: [{ id: 'i1', number: 'TV-1', openCents: 100, dueAt: inDays(5), overdue: false }],
      }),
    );
    expect([r.primary?.kind, ...r.secondary.map((a) => a.kind)]).toEqual(['PAY_INVOICE', 'UPLOAD_DOCS', 'SIGN_CONTRACT']);
  });
});
