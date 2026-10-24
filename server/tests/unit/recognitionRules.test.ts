import { describe, expect, it } from 'vitest';
import {
  ACCEL_FEE_CENTS,
  accelDeadlines,
  advanceTo,
  aggregateUserStatus,
  appointmentDeadlineFrom,
  checklistProgress,
  checklistTemplate,
  clientOpenItems,
  decisionDeadlineFrom,
  effectiveDeadline,
  employerTodos,
  readChecklist,
  userStatusFor,
} from '../../src/lib/recognition/rules.js';
import { submissionMail, VOLLMACHT_TEMPLATE } from '../../src/lib/recognition/texts.js';
import { renderContract } from '../../src/lib/contracts/render.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-20T09:00:00Z');
const inDays = (d: number) => new Date(NOW.getTime() + d * DAY);

describe('recognition checklist templates', () => {
  it('ZAB: degree, transcript, ID, form and fee — translations optional, no German certificate', () => {
    const items = checklistTemplate('ZAB_STATEMENT', false);
    expect(items.map((i) => i.key)).toEqual(['DIPLOMA', 'TRANSCRIPT', 'TRANSLATIONS', 'PASSPORT', 'APPLICATION_FORM', 'FEE']);
    expect(items.find((i) => i.key === 'TRANSLATIONS')?.optional).toBe(true);
    expect(items.find((i) => i.key === 'FEE')).toMatchObject({ client: false, optional: false });
    expect(items.find((i) => i.key === 'DIPLOMA')).toMatchObject({ client: true, done: false, documentId: null });
  });

  it('regulated professions need the German certificate (required), vocational procedures do not', () => {
    const full = checklistTemplate('FULL_RECOGNITION', true);
    expect(full.find((i) => i.key === 'GERMAN_CERT')).toMatchObject({ optional: false, client: true });
    expect(full.map((i) => i.key)).toEqual(expect.arrayContaining(['TRANSLATIONS', 'WORK_CERTIFICATES', 'CV']));
    expect(checklistTemplate('IHK_FOSA', false).some((i) => i.key === 'GERMAN_CERT')).toBe(false);
    // An IHK procedure for a regulated profession gets it before the form / fee.
    const ihk = checklistTemplate('IHK_FOSA', true).map((i) => i.key);
    expect(ihk.slice(-3)).toEqual(['GERMAN_CERT', 'APPLICATION_FORM', 'FEE']);
    expect(checklistTemplate('PARTIAL_RECOGNITION', false).find((i) => i.key === 'GERMAN_CERT')?.optional).toBe(true);
  });

  it('reads stored checklists defensively; progress counts required items only', () => {
    const items = readChecklist([{ key: 'DIPLOMA', done: true, documentId: 'd1' }, { key: 'BOGUS' }, { key: 'DIPLOMA', done: false }, { key: 'TRANSLATIONS', optional: true }, 'x', { key: 'FEE', done: false }]);
    expect(items.map((i) => i.key)).toEqual(['DIPLOMA', 'TRANSLATIONS', 'FEE']);
    expect(items[0]).toMatchObject({ done: true, documentId: 'd1', client: true });
    expect(items[2].client).toBe(false);
    expect(checklistProgress(items)).toEqual({ done: 1, total: 2 });
    expect(readChecklist(null)).toEqual([]);
    expect(clientOpenItems(items).map((i) => i.key)).toEqual(['TRANSLATIONS']);
  });
});

describe('User.recognitionStatus from the processes', () => {
  it('maps every process status', () => {
    expect(userStatusFor('PREPARING')).toBe('IN_PROGRESS');
    expect(userStatusFor('IN_REVIEW')).toBe('IN_PROGRESS');
    expect(userStatusFor('DEFICIT_NOTICE')).toBe('PARTIAL');
    expect(userStatusFor('ADAPTATION')).toBe('PARTIAL');
    expect(userStatusFor('PARTIALLY_RECOGNISED')).toBe('PARTIAL');
    expect(userStatusFor('RECOGNISED')).toBe('RECOGNISED');
    expect(userStatusFor('REJECTED')).toBe('NONE');
    expect(userStatusFor('WITHDRAWN')).toBe('NONE');
  });

  it('the best process wins; nothing to say without processes', () => {
    expect(aggregateUserStatus([])).toBeNull();
    expect(aggregateUserStatus(['RECOGNISED', 'PREPARING'])).toBe('RECOGNISED');
    expect(aggregateUserStatus(['REJECTED', 'DEFICIT_NOTICE'])).toBe('PARTIAL');
    expect(aggregateUserStatus(['REJECTED', 'WITHDRAWN'])).toBe('NONE');
    expect(aggregateUserStatus(['bogus'])).toBeNull();
  });

  it('watches the next deadline, else the end of a running adaptation measure', () => {
    expect(effectiveDeadline({ status: 'IN_REVIEW', nextDeadline: inDays(3), adaptationUntil: null })).toEqual({ at: inDays(3), kind: 'NEXT' });
    expect(effectiveDeadline({ status: 'ADAPTATION', nextDeadline: null, adaptationUntil: inDays(90) })).toEqual({ at: inDays(90), kind: 'ADAPTATION' });
    expect(effectiveDeadline({ status: 'DEFICIT_NOTICE', nextDeadline: null, adaptationUntil: inDays(90) })).toBeNull();
    expect(effectiveDeadline({ status: 'RECOGNISED', nextDeadline: inDays(3), adaptationUntil: null })).toBeNull();
  });
});

describe('§ 81a accelerated procedure', () => {
  it('moves forward only; final states stay', () => {
    expect(advanceTo('PREPARING', 'AGREEMENT_SIGNED')).toBe('AGREEMENT_SIGNED');
    expect(advanceTo('FEE_PAID', 'SUBMITTED')).toBe('FEE_PAID');
    expect(advanceTo('IN_REVIEW', 'CANCELLED')).toBe('CANCELLED');
    expect(advanceTo('VISA_DECIDED', 'PRE_APPROVAL')).toBe('VISA_DECIDED');
    expect(advanceTo('REJECTED', 'FEE_PAID')).toBe('REJECTED');
  });

  it('411 € fee; appointment within 3 weeks of the pre-approval, decision 3 weeks after the appointment', () => {
    expect(ACCEL_FEE_CENTS).toBe(41100);
    expect(appointmentDeadlineFrom(NOW)).toEqual(inDays(21));
    expect(decisionDeadlineFrom(inDays(10))).toEqual(inDays(31));
  });

  it("employer to-dos: the agreement until it is signed, the fee once requested until paid", () => {
    const base = { status: 'PREPARING', agreementSignedAt: null, feeRequestedAt: null, feePaidAt: null };
    expect(employerTodos(base)).toEqual(['SIGN_AGREEMENT']);
    expect(employerTodos({ ...base, status: 'AGREEMENT_SIGNED', agreementSignedAt: NOW })).toEqual([]);
    expect(employerTodos({ ...base, status: 'FEE_REQUESTED', agreementSignedAt: NOW, feeRequestedAt: NOW })).toEqual(['PAY_FEE']);
    expect(employerTodos({ ...base, status: 'FEE_PAID', agreementSignedAt: NOW, feeRequestedAt: NOW, feePaidAt: NOW })).toEqual([]);
    expect(employerTodos({ ...base, status: 'CANCELLED' })).toEqual([]);
  });

  it('deadlines: appointment until booked, decision until decided, fee two weeks after the request, reply date — nearest first', () => {
    const p = { status: 'PRE_APPROVAL', appointmentDeadline: inDays(21), appointmentAt: null, decisionDeadline: null, decidedAt: null, feeRequestedAt: inDays(-10), feePaidAt: null };
    expect(accelDeadlines(p, inDays(2)).map((d) => d.kind)).toEqual(['REPLY', 'FEE', 'APPOINTMENT']);
    expect(accelDeadlines({ ...p, appointmentAt: inDays(5), decisionDeadline: inDays(26), feePaidAt: NOW }, null).map((d) => d.kind)).toEqual(['DECISION']);
    expect(accelDeadlines({ ...p, status: 'VISA_DECIDED' }, inDays(1))).toEqual([]);
  });

  it('Vollmacht template and the submission e-mail are German and filled in', () => {
    const r = renderContract(VOLLMACHT_TEMPLATE, { 'client.fullName': 'Kamran Əliyev', 'company.name': 'Hotel Adler GmbH', 'case.profession': 'Koch', 'triad.name': 'Triad Vision' });
    expect(r.text).toContain('§ 81a');
    expect(r.text).toContain('Kamran Əliyev');
    expect(r.text).toContain('Hotel Adler GmbH');
    expect(r.text).toContain('Koch');
    const m = submissionMail({ authority: 'Ausländerbehörde München', reference: 'AZ-1', worker: { name: 'Kamran Əliyev', birthDate: '01.02.1990', nationality: 'AZ' }, company: { name: 'Hotel Adler GmbH', contact: 'Max' }, profession: 'Koch', caseNumber: 'TV-1', attachments: ['pass.pdf', 'vollmacht.pdf'], sender: 'Staff', agency: 'Triad Vision' });
    expect(m.subject).toContain('§ 81a AufenthG');
    expect(m.subject).toContain('Az. AZ-1');
    expect(m.body).toContain('1. pass.pdf\n2. vollmacht.pdf');
    expect(m.body).toContain('der Ausländerbehörde München');
  });
});
