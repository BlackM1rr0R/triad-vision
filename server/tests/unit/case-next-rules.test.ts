import { describe, expect, it } from 'vitest';
import type { CaseStatus, DocStatus } from '@prisma/client';
import { computeSteps, nextStepView, TYPICAL_DAYS, type CaseFacts, type FactRequirement, type NextAction } from '../../src/lib/caseNext/nextStep.js';
import { DEFAULT_CHECKLISTS } from '../../src/lib/ai/features/caseAi/config.js';
import { contractProgress } from '../../src/lib/caseNext/ai.js';

const NOW = new Date('2026-10-20T09:00:00Z');
const DAY = 24 * 3600 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY);

const t = (s: string) => ({ az: `${s} az`, de: `${s} de`, en: `${s} en`, ru: `${s} ru` });
let n = 0;
const req = (key: string, stage: 'INITIAL' | 'EMBASSY', docs: DocStatus[] = [], extra: Partial<FactRequirement> = {}): FactRequirement => ({
  id: `req-${key}-${++n}`,
  key,
  stage,
  required: true,
  title: t(key),
  docs: docs.map((status, i) => ({ id: `doc-${key}-${n}-${i}`, name: `${key}.pdf`, status, stage, createdAt: ago(i + 1), byClient: true, reviewNote: status === 'REJECTED' ? 'zu unscharf' : null })),
  ...extra,
});

const facts = (over: Partial<CaseFacts> = {}): CaseFacts => {
  const status: CaseStatus = over.status ?? 'DOCUMENTS_PENDING';
  return {
    id: 'case1',
    number: 'TV-2026-0001',
    status,
    visaType: 'WORK',
    createdAt: ago(40),
    statusSince: ago(1),
    daysInStatus: 1,
    typicalDays: TYPICAL_DAYS[status],
    assignedStaffId: 'staff1',
    client: { id: 'client1', firstName: 'Elvin', lastName: 'Mammadov', locale: 'de' },
    passportExpiry: inDays(1000),
    plannedEntry: inDays(60),
    appointmentAt: null,
    appointmentPlace: null,
    contract: null,
    requirements: [],
    lastClientActivityAt: ago(1),
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
  };
};

const codes = (f: CaseFacts) => computeSteps(f, { now: NOW }).map((s) => s.code);
const top = (f: CaseFacts) => computeSteps(f, { now: NOW })[0];
const action = (a: NextAction[], id: string) => a.find((x) => x.id === id)!;

describe('next step rules', () => {
  it('documents waiting for review → Review now (with the document ids)', () => {
    const f = facts({ status: 'DOCUMENTS_REVIEW', requirements: [req('PASSPORT', 'INITIAL', ['PENDING']), req('CV', 'INITIAL', ['PENDING']), req('DIPLOMA', 'INITIAL', ['PENDING', 'REJECTED'])] });
    const s = top(f);
    expect(s).toMatchObject({ code: 'DOCS_TO_REVIEW', params: { count: 3 } });
    expect(s.actions[0]).toMatchObject({ id: 'REVIEW_NOW', kind: 'review' });
    expect((s.actions[0] as { documentIds: string[] }).documentIds).toHaveLength(3);
  });

  it('all initial documents accepted → send the contract; slow review raises the tone', () => {
    const reqs = [req('PASSPORT', 'INITIAL', ['ACCEPTED']), req('CV', 'INITIAL', ['ACCEPTED'])];
    expect(top(facts({ status: 'DOCUMENTS_REVIEW', requirements: reqs }))).toMatchObject({ code: 'SEND_CONTRACT', tone: 'action' });
    expect(top(facts({ status: 'DOCUMENTS_REVIEW', requirements: reqs, daysInStatus: 5 }))).toMatchObject({ code: 'SEND_CONTRACT', tone: 'urgent' });
  });

  it('only rejected documents (the client was told and can replace them) → wait for the client, no return', () => {
    const s = top(facts({ status: 'DOCUMENTS_REVIEW', requirements: [req('PASSPORT', 'INITIAL', ['ACCEPTED']), req('DIPLOMA', 'INITIAL', ['REJECTED'])] }));
    expect(s).toMatchObject({ code: 'AWAIT_CLIENT_FIX', tone: 'info', params: { count: 1 } });
    expect(s.actions.map((x) => x.kind)).not.toContain('transition');
  });

  it('a required document missing (plus a rejected one), nothing pending → return for changes with a note in the client language', () => {
    const f = facts({ status: 'DOCUMENTS_REVIEW', requirements: [req('PASSPORT', 'INITIAL', []), req('DIPLOMA', 'INITIAL', ['REJECTED'])] });
    const s = top(f);
    expect(s.code).toBe('RETURN_FOR_CHANGES');
    const a = s.actions[0] as Extract<NextAction, { kind: 'transition' }>;
    expect(a).toMatchObject({ kind: 'transition', confirm: true, request: { method: 'POST', path: '/admin/cases/case1/actions', body: { action: 'REQUEST_CHANGES' } } });
    expect(a.request.body.note).toContain('Bitte laden Sie diese Unterlagen erneut hoch');
    expect(a.request.body.note).toContain('DIPLOMA de: zu unscharf');
  });

  it('contract signed 2 days ago → confirm contract (status transition with confirmation)', () => {
    const s = top(facts({ status: 'CONTRACT_SIGNED', contract: { sentAt: ago(6), signedAt: ago(2) }, daysInStatus: 2 }));
    expect(s).toMatchObject({ code: 'CONFIRM_CONTRACT', params: { days: 2 } });
    expect(s.actions[0]).toMatchObject({ kind: 'transition', confirm: true, request: { body: { action: 'CONFIRM_CONTRACT' } } });
  });

  it('embassy documents all accepted → hand the embassy set to the client, record the appointment (scroll to the form, task, package)', () => {
    const s = top(facts({ status: 'EMBASSY_REVIEW', requirements: [req('VIDEX', 'EMBASSY', ['ACCEPTED'])] }));
    expect(s.code).toBe('BOOK_APPOINTMENT');
    expect(s.actions.map((a) => a.kind)).toEqual(['scroll', 'task', 'package']);
    expect(action(s.actions, 'CREATE_TASK')).toMatchObject({ request: { path: '/tasks', body: { caseId: 'case1', assigneeIds: ['staff1'], priority: 'HIGH' } } });
  });

  it('appointment in 3 days without a package → build the package; with a package → remind the client', () => {
    const base = { status: 'APPOINTMENT_SCHEDULED' as const, appointmentAt: inDays(3), appointmentPlace: 'Botschaft Baku', statusSince: ago(10) };
    const s = top(facts(base));
    expect(s).toMatchObject({ code: 'APPOINTMENT_PACKAGE', tone: 'urgent', params: { days: 3 } });
    expect(s.actions[0]).toMatchObject({ id: 'BUILD_PACKAGE', kind: 'package' });
    const remind = s.actions[1] as Extract<NextAction, { kind: 'message' }>;
    expect(remind.draft).toContain('Termin bei der Botschaft');
    expect(codes(facts({ ...base, packageBuiltAt: ago(1) }))).toEqual(['APPOINTMENT_REMIND']);
  });

  it('appointment passed → mark lodged', () => {
    const s = top(facts({ status: 'APPOINTMENT_SCHEDULED', appointmentAt: ago(2) }));
    expect(s).toMatchObject({ code: 'APPOINTMENT_PASSED', tone: 'urgent' });
    expect(s.actions[0]).toMatchObject({ kind: 'transition', request: { body: { action: 'MARK_LODGED' } } });
  });

  it('no client response for 8 days with missing documents → reminder in the client language + request', () => {
    const f = facts({ status: 'DOCUMENTS_PENDING', daysInStatus: 9, statusSince: ago(9), lastClientActivityAt: ago(8), requirements: [req('PASSPORT', 'INITIAL', ['ACCEPTED']), req('DIPLOMA', 'INITIAL'), req('CV', 'INITIAL', ['REJECTED'])], client: { id: 'c', firstName: 'Ольга', lastName: 'Петрова', locale: 'ru' } });
    const steps = computeSteps(f, { now: NOW });
    expect(steps.map((s) => s.code)).toEqual(['CLIENT_IDLE', 'MISSING_DOCS']);
    const msg = steps[0].actions[0] as Extract<NextAction, { kind: 'message' }>;
    expect(msg).toMatchObject({ kind: 'message', locale: 'ru', request: { path: '/admin/cases/case1/messages' } });
    expect(msg.draft).toMatch(/^Здравствуйте, Ольга!/);
    expect(msg.draft).toContain('DIPLOMA ru');
    expect(msg.request.body.body).toBe(msg.draft);
    const request = steps[1].actions[0] as Extract<NextAction, { kind: 'request' }>;
    expect(request).toMatchObject({ kind: 'request', request: { path: '/admin/cases/case1/next-step/request-documents' } });
    expect((request.request.body.items as unknown[]).length).toBe(2);
    // A staff message within 3 days → no idle reminder.
    expect(codes({ ...f, lastStaffMessageAt: ago(1) })).toEqual(['MISSING_DOCS']);
  });

  it('passport expires before planned entry + 6 months → ask for a new passport first', () => {
    const f = facts({ status: 'EMBASSY_DOCUMENTS', passportExpiry: inDays(120), plannedEntry: inDays(30), requirements: [req('PASSPORT', 'INITIAL', ['ACCEPTED'])] });
    const s = top(f);
    expect(s.code).toBe('PASSPORT_BEFORE_ENTRY');
    expect(s.actions.map((a) => a.id)).toEqual(['ASK_NEW_PASSPORT', 'REQUEST_PASSPORT']);
    expect((s.actions[0] as { draft: string }).draft).toContain('Reisepass');
    expect(top(facts({ passportExpiry: ago(1) })).code).toBe('PASSPORT_EXPIRED');
  });

  it('embassy stage: checklist items never requested and a diploma without translation', () => {
    const f = facts({ status: 'EMBASSY_DOCUMENTS', requirements: [req('DIPLOMA', 'INITIAL', ['ACCEPTED']), req('VIDEX', 'EMBASSY', ['PENDING'])] });
    const steps = computeSteps(f, { now: NOW });
    const gap = steps.find((s) => s.code === 'CHECKLIST_GAP')!;
    expect(gap.items.map((i) => i.de)).toEqual(expect.arrayContaining([expect.stringContaining('Passfotos'), expect.stringContaining('Lebenslauf')]));
    const tr = steps.find((s) => s.code === 'TRANSLATION_MISSING')!;
    expect(tr.actions.map((a) => a.id)).toEqual(['REQUEST_TRANSLATION', 'ORDER_TRANSLATION', 'SEND_MESSAGE']);
    expect(codes({ ...f, translationOrdered: true })).not.toContain('TRANSLATION_MISSING');
  });

  it('unanswered client message, overdue tasks, slow decision', () => {
    expect(codes(facts({ status: 'CONTRACT_SENT', lastClientMessageAt: ago(2), lastStaffMessageAt: ago(3) }))).toContain('UNANSWERED_MESSAGE');
    expect(codes(facts({ overdueTasks: 2 }))).toContain('OVERDUE_TASKS');
    expect(top(facts({ status: 'DECISION_PENDING', daysInStatus: 70, typicalDays: 56 })).code).toBe('DECISION_OVERDUE');
    expect(top(facts({ status: 'DECISION_PENDING', daysInStatus: 10, typicalDays: 56 })).code).toBe('AWAIT_DECISION');
  });

  it('final cases, view shows at most 3 steps', () => {
    expect(codes(facts({ status: 'CANCELLED' }))).toEqual([]);
    expect(codes(facts({ status: 'APPROVED' }))).toEqual(['VISA_APPROVED']);
    const busy = facts({ status: 'DOCUMENTS_PENDING', daysInStatus: 20, statusSince: ago(20), lastClientActivityAt: ago(20), overdueTasks: 1, lastClientMessageAt: ago(20), passportExpiry: ago(3), requirements: [req('PASSPORT', 'INITIAL', ['PENDING']), req('CV', 'INITIAL')] });
    const v = nextStepView(busy, { now: NOW });
    expect(v.steps).toHaveLength(3);
    expect(v.total).toBeGreaterThan(3);
    expect(v.steps[0].code).toBe('PASSPORT_EXPIRED');
  });
});

describe('next step: two-step contracts V2 (lib/caseContracts/turn)', () => {
  const openContract = { id: 'OPEN_CONTRACT', kind: 'scroll', target: 'case-contract' };
  const sent = (over: Partial<CaseFacts> = {}) => facts({ status: 'CONTRACT_SENT', contract: { sentAt: ago(2), signedAt: null }, daysInStatus: 0, ...over });
  const signed = (over: Partial<CaseFacts> = {}) => facts({ status: 'CONTRACT_SIGNED', contract: { sentAt: ago(4), signedAt: ago(0) }, contractV2: true, daysInStatus: 0, ...over });

  it('Əmək müqaviləsi: the client signed (V2) — Triad Vision signs now, never "client not invited yet"', () => {
    const f = sent({ contractTurn: 'TRIAD', contractV2: true });
    expect(top(f)).toMatchObject({ code: 'TRIAD_SIGN_AFTER_CLIENT', params: { days: 0 }, actions: [openContract] });
    expect(codes(f)).not.toContain('TRIAD_SIGN_CONTRACT');
    expect(codes(f)).not.toContain('CONTRACT_NOT_SIGNED');
    expect(contractProgress(f)).toMatch(/client HAS signed; Triad Vision must sign/);
  });

  it('Əmək müqaviləsi approved, no İş müqaviləsi documents yet — send them (not "confirm the contract")', () => {
    const f = signed({ contractTurn: 'STAFF', workContract: 'NOT_SENT' });
    expect(top(f)).toMatchObject({ code: 'SEND_WORK_CONTRACT', tone: 'action', actions: [openContract] });
    expect(codes(f)).not.toContain('CONFIRM_CONTRACT');
    expect(contractProgress(f)).toMatch(/upload and send the work contract/);
  });

  it('İş müqaviləsi documents sent — the client signs (info, reminders later; no "status overdue")', () => {
    const f = signed({ contractTurn: 'CLIENT', workContract: 'CLIENT_TO_SIGN' });
    expect(codes(f)).toEqual(['AWAIT_WORK_SIGNATURE']);
    expect(top(f)).toMatchObject({ tone: 'info', actions: [openContract] });
    const late = signed({ contractTurn: 'CLIENT', workContract: 'CLIENT_TO_SIGN', daysInStatus: 9, statusSince: ago(9), lastClientActivityAt: ago(9) });
    expect(codes(late)).toEqual(expect.arrayContaining(['CLIENT_IDLE', 'CONTRACT_NOT_SIGNED', 'AWAIT_WORK_SIGNATURE']));
    expect(codes(late)).not.toContain('STATUS_OVERDUE');
    expect(codes(late)).not.toContain('CONFIRM_CONTRACT');
  });

  it('İş müqaviləsi signed by the client — staff approve it; returned / expired — send a new version', () => {
    expect(top(signed({ contractTurn: 'STAFF', workContract: 'SIGNED' }))).toMatchObject({ code: 'APPROVE_WORK_CONTRACT', actions: [openContract] });
    expect(top(signed({ contractTurn: 'STAFF', workContract: 'SIGNED', daysInStatus: 5 }))).toMatchObject({ code: 'APPROVE_WORK_CONTRACT', tone: 'urgent' });
    expect(top(signed({ contractTurn: 'STAFF', workContract: 'RETURNED' }))).toMatchObject({ code: 'RESEND_WORK_CONTRACT', params: { state: 'RETURNED' } });
    expect(top(signed({ contractTurn: 'STAFF', workContract: 'EXPIRED' }))).toMatchObject({ code: 'RESEND_WORK_CONTRACT' });
    expect(contractProgress(signed({ contractTurn: 'STAFF', workContract: 'SIGNED' }))).toMatch(/review and approve/);
  });

  it('old flow unchanged: Triad Vision first, then the client; signed contract is confirmed by the transition', () => {
    expect(top(sent({ contractTurn: 'TRIAD', contractV2: false }))).toMatchObject({ code: 'TRIAD_SIGN_CONTRACT' });
    expect(top(sent({ contractTurn: 'TRIAD' }))).toMatchObject({ code: 'TRIAD_SIGN_CONTRACT' });
    const old = top(facts({ status: 'CONTRACT_SIGNED', contract: { sentAt: ago(6), signedAt: ago(2) }, contractTurn: null }));
    expect(old).toMatchObject({ code: 'CONFIRM_CONTRACT', params: { days: 2 } });
    expect(old.actions[0]).toMatchObject({ kind: 'transition', request: { body: { action: 'CONFIRM_CONTRACT' } } });
    expect(contractProgress(sent({ contractTurn: 'TRIAD' }))).toMatch(/Triad Vision signs first/);
  });
});
