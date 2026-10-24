import { describe, expect, it } from 'vitest';
import { collectActions, choosePrimary, pickNextStep, type NextStepFacts } from '../../src/lib/account/nextStep.js';

const NOW = new Date('2026-10-20T09:00:00Z');
const DAY = 24 * 3600 * 1000;
const inDays = (d: number) => new Date(NOW.getTime() + d * DAY);
const t = (s: string) => ({ az: `${s} az`, de: `${s} de`, en: `${s} en`, ru: `${s} ru` });

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

const ballItem = (reason: string, over: Record<string, unknown> = {}) => ({ side: 'CLIENT' as const, reason: reason as never, count: 1, dueAt: null, overdue: false, ...over });

describe('account next step: collectActions / pickNextStep', () => {
  it('a fresh case: "Upload: Passport" with a deep link to the open upload step', () => {
    const r = pickNextStep(facts({ ball: { side: 'CLIENT', eta: null, items: [ballItem('UPLOAD_DOCS', { count: 3 })] }, firstMissingDoc: t('Passport') }));
    expect(r.primary).toMatchObject({ kind: 'UPLOAD_DOCS', to: '/account/cases/c1?tab=docs#docs-initial', count: 3, detail: t('Passport') });
    expect(r.secondary).toEqual([]);
    expect(r.waiting).toBeNull();
    expect(r.actionCount).toBe(1);
  });

  it('pending legal acceptance always comes first', () => {
    const r = pickNextStep(
      facts({
        pendingLegal: 2,
        ball: { side: 'CLIENT', eta: null, items: [ballItem('SIGN_CONTRACT', { overdue: true, dueAt: inDays(-3).toISOString() })] },
      }),
    );
    expect(r.primary?.kind).toBe('ACCEPT_LEGAL');
    expect(r.primary?.to).toBe('/account/privacy#legal');
    expect(r.secondary[0]).toMatchObject({ kind: 'SIGN_CONTRACT', to: '/account/cases/c1?tab=docs#contract', overdue: true });
  });

  it('an overdue task jumps ahead of a regular document step; at most two secondary actions', () => {
    const r = pickNextStep(
      facts({
        ball: { side: 'CLIENT', eta: null, items: [ballItem('UPLOAD_DOCS', { count: 2 }), ballItem('CLIENT_TASKS'), ballItem('SIGN_DOCUMENTS')] },
        tasks: [{ id: 't1', caseId: 'c1', title: 'Police certificate', dueAt: inDays(-1) }],
        forms: [{ id: 'f1', caseId: 'c1', title: t('Questionnaire'), dueAt: inDays(5) }],
        signatures: [{ signerId: 's1', title: 'Power of attorney', expiresAt: inDays(10) }],
        confirmation: { fields: 4 },
      }),
    );
    expect(r.primary).toMatchObject({ kind: 'CLIENT_TASK', overdue: true, detail: 'Police certificate', to: '/account/cases/c1#client-tasks' });
    expect(r.secondary.map((a) => a.kind)).toEqual(['UPLOAD_DOCS', 'SIGN_DOCUMENTS']);
    // Ball SIGN_DOCUMENTS / CLIENT_TASKS are not duplicated: the concrete items replace them.
    expect(collectActions(facts({ ball: { side: 'CLIENT', eta: null, items: [ballItem('SIGN_DOCUMENTS'), ballItem('CLIENT_TASKS')] } }))).toEqual([]);
    expect(r.actionCount).toBe(5);
  });

  it('one signature links straight to it, several to the list', () => {
    const one = collectActions(facts({ signatures: [{ signerId: 's1', title: 'Contract', expiresAt: null }] }))[0];
    expect(one).toMatchObject({ kind: 'SIGN_DOCUMENTS', to: '/account/signatures/s1', detail: 'Contract', count: 1 });
    const two = collectActions(facts({ signatures: [{ signerId: 's1', title: 'A', expiresAt: null }, { signerId: 's2', title: 'B', expiresAt: inDays(2) }] }))[0];
    expect(two).toMatchObject({ to: '/account/signatures', detail: null, count: 2, dueAt: inDays(2).toISOString() });
  });

  it('nothing for the client: the waiting state with the expected date', () => {
    const r = pickNextStep(
      facts({ primary: { id: 'c1', status: 'DECISION_PENDING', appointmentAt: null, appointmentPlace: null }, ball: { side: 'EMBASSY', items: [], eta: { expectedBy: '2026-11-30T00:00:00.000Z' } as never } }),
    );
    expect(r.primary).toBeNull();
    expect(r.waiting).toEqual({ side: 'EMBASSY', expectedBy: '2026-11-30T00:00:00.000Z' });
  });

  it('a soft nudge (profile) is shown but does not hide the waiting state or count as an action', () => {
    const r = pickNextStep(facts({ profilePercent: 60, ball: { side: 'TEAM', items: [], eta: null } }));
    expect(r.primary).toMatchObject({ kind: 'COMPLETE_PROFILE', count: 60 });
    expect(r.waiting).toEqual({ side: 'TEAM', expectedBy: null });
    expect(r.actionCount).toBe(0);
  });

  it('no case yet: start one (no profile nag before the first case)', () => {
    const r = pickNextStep(facts({ hasCases: false, primary: null, profilePercent: 0 }));
    expect(r.primary).toMatchObject({ kind: 'START_CASE', to: '/account#start' });
    expect(r.secondary).toEqual([]);
  });

  it('approved, not travelled: plan the arrival; onboarding items only when due soon', () => {
    const r = pickNextStep(
      facts({
        primary: null,
        hasApproved: true,
        arrival: { caseId: 'c1', planStatus: null },
        onboarding: { open: [{ title: t('Anmeldung'), dueAt: inDays(30) }, { title: t('Bank account'), dueAt: inDays(7) }] },
      }),
    );
    expect(r.primary).toMatchObject({ kind: 'ARRIVAL_PLAN', to: '/account/arrival' });
    expect(r.secondary).toEqual([expect.objectContaining({ kind: 'ONBOARDING', count: 1, detail: t('Bank account') })]);
    // A submitted plan is done; nothing to start any more.
    expect(collectActions(facts({ primary: null, hasApproved: true, arrival: { caseId: 'c1', planStatus: 'SUBMITTED' } }))).toEqual([]);
  });

  it('in Germany: check-in first, then the residence renewal, then every open onboarding item', () => {
    const r = pickNextStep(
      facts({
        primary: null,
        hasApproved: true,
        arrived: true,
        arrival: { caseId: 'c1', planStatus: 'COMPLETED' },
        checkIns: [{ id: 'ci2', dueAt: inDays(-1) }, { id: 'ci1', dueAt: inDays(-20) }],
        residence: { caseId: 'c1', expiresAt: inDays(60), leadDays: 90, renewalOpened: false },
        onboarding: { open: [{ title: t('Anmeldung'), dueAt: inDays(40) }, { title: t('Tax ID'), dueAt: null }] },
      }),
    );
    expect(r.primary).toMatchObject({ kind: 'ANSWER_CHECKIN', to: '/check-in/ci1', count: 2 });
    expect(r.secondary.map((a) => a.kind)).toEqual(['RENEW_RESIDENCE', 'ONBOARDING']);
    expect(r.secondary[0]).toMatchObject({ to: '/account/cases/c1?tab=messages', dueAt: inDays(60).toISOString() });
    expect(r.secondary[1]).toMatchObject({ count: 2, detail: t('Anmeldung') });
  });

  it('residence renewal: not before the lead time, not once the renewal case exists', () => {
    const base = { primary: null, hasApproved: true, arrived: true };
    expect(collectActions(facts({ ...base, residence: { caseId: 'c1', expiresAt: inDays(120), leadDays: 90, renewalOpened: false } }))).toEqual([]);
    expect(collectActions(facts({ ...base, residence: { caseId: 'c1', expiresAt: inDays(30), leadDays: 90, renewalOpened: true } }))).toEqual([]);
  });

  it('the appointment is never "overdue" and carries the place', () => {
    const at = inDays(4);
    const [a] = collectActions(
      facts({
        primary: { id: 'c1', status: 'APPOINTMENT_SCHEDULED', appointmentAt: at, appointmentPlace: 'Baku, embassy' },
        ball: { side: 'CLIENT', eta: null, items: [ballItem('ATTEND_APPOINTMENT', { overdue: true })] },
      }),
    );
    expect(a).toMatchObject({ kind: 'ATTEND_APPOINTMENT', overdue: false, dueAt: at.toISOString(), detail: 'Baku, embassy', to: '/account/cases/c1#appointment' });
  });

  it('passport expiring within 6 months is a gentle reminder at the end', () => {
    const r = collectActions(facts({ passportExpiry: inDays(100), confirmation: { fields: 2 } }));
    expect(r.map((a) => a.kind)).toEqual(['CONFIRM_DATA', 'PASSPORT_EXPIRY']);
    expect(collectActions(facts({ passportExpiry: inDays(400) }))).toEqual([]);
  });

  it('choosePrimary: open main case, then open member case, then the approval', () => {
    const rows = [
      { id: 'm', status: 'DOCUMENTS_PENDING' as const, parentCaseId: 'a' },
      { id: 'a', status: 'APPROVED' as const, parentCaseId: null },
      { id: 'o', status: 'EMBASSY_REVIEW' as const, parentCaseId: null },
    ];
    expect(choosePrimary(rows)?.id).toBe('o');
    expect(choosePrimary(rows.slice(0, 2))?.id).toBe('m');
    expect(choosePrimary([rows[1], { id: 'r', status: 'REJECTED' as const, parentCaseId: null }])?.id).toBe('a');
    expect(choosePrimary([])).toBeNull();
  });
});
