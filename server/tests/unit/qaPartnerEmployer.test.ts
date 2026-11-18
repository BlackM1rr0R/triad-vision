import { describe, expect, it, vi } from 'vitest';
import type { DocStage, DocStatus } from '@prisma/client';
import { DEFAULT_PERMS, NO_PERMS, TEMPLATE_PERMS, partnerNoticeRule, schoolRecordAccess, type PartnerPerms } from '../../src/lib/partnerAccess/permissions.js';

// Regression tests for the QA findings PE-01, PE-02, PE-04 and PE-13 (partner and employer portals).
vi.mock('../../src/db.js', () => ({ prisma: {} }));

const { partnerCanUpload } = await import('../../src/lib/partnerPortal/cases.js');
const { workContractMilestone } = await import('../../src/lib/employerWorkers/panel.js');

const req = (stage: DocStage, ...statuses: DocStatus[]) => ({ stage, documents: statuses.map((status) => ({ status })) });

describe('PE-01: language-school records are the school’s own data', () => {
  it('DEFAULT and REFERRER language schools may record (documents level does not apply)', () => {
    for (const perms of [DEFAULT_PERMS, TEMPLATE_PERMS.REFERRER]) {
      expect(schoolRecordAccess(perms, 'LANGUAGE_SCHOOL')).toEqual({ view: true, write: true, certificate: true });
    }
  });
  it('colleges see students but do not record; nothing without the client list', () => {
    expect(schoolRecordAccess(DEFAULT_PERMS, 'SCHOOL')).toMatchObject({ view: true, write: false });
    expect(schoolRecordAccess({ ...DEFAULT_PERMS, clientList: 'none' }, 'LANGUAGE_SCHOOL')).toEqual({ view: false, write: false, certificate: false });
    expect(schoolRecordAccess(NO_PERMS, 'LANGUAGE_SCHOOL').write).toBe(false);
  });
});

describe('PE-02: partner uploads follow the client’s upload rules', () => {
  it('open step as before, accepted requirements never', () => {
    expect(partnerCanUpload('DOCUMENTS_PENDING', req('INITIAL'))).toBe(true);
    expect(partnerCanUpload('DOCUMENTS_PENDING', req('INITIAL', 'ACCEPTED'))).toBe(false);
    expect(partnerCanUpload('DOCUMENTS_PENDING', req('EMBASSY'))).toBe(false);
  });
  it('replacement of a rejected document after the hand-in', () => {
    expect(partnerCanUpload('DOCUMENTS_REVIEW', req('INITIAL', 'REJECTED'))).toBe(true);
    expect(partnerCanUpload('EMBASSY_REVIEW', req('EMBASSY', 'REJECTED', 'REJECTED'))).toBe(true);
    expect(partnerCanUpload('DOCUMENTS_REVIEW', req('INITIAL', 'PENDING'))).toBe(false);
    expect(partnerCanUpload('DOCUMENTS_REVIEW', req('INITIAL'))).toBe(false);
    expect(partnerCanUpload('APPROVED', req('INITIAL', 'REJECTED'))).toBe(false);
  });
  it('embassy documents early while the case waits for the contract', () => {
    expect(partnerCanUpload('CONTRACT_SENT', req('EMBASSY'), { earlyEmbassy: true })).toBe(true);
    expect(partnerCanUpload('CONTRACT_SENT', req('EMBASSY'), { earlyEmbassy: false })).toBe(false);
    expect(partnerCanUpload('CONTRACT_SENT', req('INITIAL'), { earlyEmbassy: true })).toBe(false);
  });
});

describe('PE-04: partner notifications follow the permission set', () => {
  const p = (over: Partial<PartnerPerms>): PartnerPerms => ({ ...DEFAULT_PERMS, ...over });
  it('stage news need the case stage and the client list', () => {
    expect(partnerNoticeRule(DEFAULT_PERMS, 'PARTNER_CASE_APPROVED')).toEqual({ names: true });
    expect(partnerNoticeRule(p({ caseStage: false }), 'PARTNER_CASE_APPROVED')).toBeNull();
    expect(partnerNoticeRule(p({ clientList: 'none' }), 'PARTNER_APPOINTMENT_MOVED')).toBeNull();
  });
  it('new clients / cases need the client list', () => {
    expect(partnerNoticeRule(p({ clientList: 'none' }), 'PARTNER_NEW_CLIENT')).toBeNull();
    expect(partnerNoticeRule(p({ clientList: 'none' }), 'PARTNER_NEW_CASE')).toBeNull();
    expect(partnerNoticeRule(DEFAULT_PERMS, 'PARTNER_NEW_CASE')).toEqual({ names: true });
  });
  it('commissions need payments; client names only with the client list', () => {
    expect(partnerNoticeRule(p({ payments: false }), 'PARTNER_COMMISSION_PAID')).toBeNull();
    expect(partnerNoticeRule(p({ clientList: 'none' }), 'PARTNER_COMMISSION_EARNED')).toEqual({ names: false });
    expect(partnerNoticeRule(DEFAULT_PERMS, 'PARTNER_COMMISSION_EARNED')).toEqual({ names: true });
  });
});

describe('PE-13: work contract milestone in the employer worker timeline', () => {
  const at = new Date('2026-10-01T10:00:00Z');
  it('from the approved WORK step, else the employment contract', () => {
    expect(workContractMilestone([], { workApprovedAt: at, employmentSignedAt: null })).toEqual({ code: 'WORK_CONTRACT_SIGNED', at });
    expect(workContractMilestone([], { workApprovedAt: null, employmentSignedAt: at })).toEqual({ code: 'WORK_CONTRACT_SIGNED', at });
    expect(workContractMilestone([], { workApprovedAt: null, employmentSignedAt: null })).toBeNull();
  });
  it('not twice when an employer-visible case contract already carries it (no document details)', () => {
    expect(workContractMilestone([{ code: 'CONTRACT_SIGNED', at }], { workApprovedAt: at, employmentSignedAt: null })).toBeNull();
    expect(Object.keys(workContractMilestone([], { workApprovedAt: at, employmentSignedAt: null })!)).toEqual(['code', 'at']);
  });
});
