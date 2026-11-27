import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERMS,
  NO_PERMS,
  PERM_KEYS,
  TEMPLATE_PERMS,
  exceedingKeys,
  intersectPerms,
  legacyPerms,
  parsePerms,
  partnerPermsOf,
  portalAreas,
  shapeCaseDetail,
  shapeCaseRow,
  shapeClientRow,
  visibilityFor,
  type PartnerPerms,
} from '../../src/lib/partnerAccess/permissions.js';
import { isInsidePartnerFolder } from '../../src/lib/partnerAccess/drive.js';

const detail = () => ({
  id: 'c1',
  status: 'DOCUMENTS_PENDING',
  step: 'DOCUMENTS',
  nextAction: 'UPLOAD_DOCUMENTS',
  refused: false,
  missingDocuments: 2,
  appointmentAt: null,
  decisionAt: null,
  appointmentPlace: null,
  visaValidFrom: null,
  visaValidTo: null,
  uploadStage: 'INITIAL',
  timeline: [{ id: 'e1', type: 'STATUS', fromStatus: null, toStatus: 'DOCUMENTS_PENDING', createdAt: new Date(0) }],
  requirements: [
    { id: 'r1', stage: 'INITIAL', title: { az: 'Pasport' }, required: true, state: 'REJECTED', rejectionReason: 'Bulanıq', canUpload: true, documentCount: 2, myUploads: [{ id: 'd1', name: 'pasport.pdf' }] },
    { id: 'r2', stage: 'INITIAL', title: { az: 'Diplom' }, required: true, state: 'MISSING', rejectionReason: null, canUpload: true, documentCount: 0, myUploads: [] },
  ],
});

describe('partner permissions: legacy = today', () => {
  it('derives LEGACY from the visibility field (masked / full), with documents upload and no new areas', () => {
    expect(legacyPerms('MINIMAL')).toEqual({ clientList: 'masked', caseStage: true, documents: 'upload', payments: true, addClients: true, messaging: false, vacancies: false, drive: 'none' });
    expect(legacyPerms('EXTENDED').clientList).toBe('full');
    expect(visibilityFor(legacyPerms('EXTENDED'))).toBe('EXTENDED');
    expect(visibilityFor(legacyPerms('MINIMAL'))).toBe('MINIMAL');
  });

  it('treats a partner without a row (and a LEGACY row) as legacy, following later visibility changes', () => {
    expect(partnerPermsOf({ visibility: 'MINIMAL' }, null)).toEqual({ template: 'LEGACY', perms: legacyPerms('MINIMAL') });
    expect(partnerPermsOf({ visibility: 'EXTENDED' }, { template: 'LEGACY', perms: null }).perms.clientList).toBe('full');
  });

  it('leaves every portal response unchanged with legacy permissions (same object back)', () => {
    for (const vis of ['MINIMAL', 'EXTENDED']) {
      const perms = legacyPerms(vis);
      const d = detail();
      expect(shapeCaseDetail(d, perms)).toBe(d);
      const row = { status: 'APPROVED', step: 'DONE', nextAction: 'NONE', refused: false, missingDocuments: 0, appointmentAt: null, decisionAt: null };
      expect(shapeCaseRow(row, perms)).toBe(row);
      const client = { contact: null, extended: false, payment: { state: 'PAID' }, latestCase: row };
      expect(shapeClientRow(client, perms)).toBe(client);
    }
  });
});

describe('partner permissions: templates and defaults', () => {
  it('new partners: masked list, stage, documents status only, commissions, add clients, messages, vacancies, drive view', () => {
    expect(DEFAULT_PERMS).toEqual({ clientList: 'masked', caseStage: true, documents: 'status', payments: true, addClients: true, messaging: true, vacancies: true, drive: 'view' });
    expect(partnerPermsOf({ visibility: 'MINIMAL' }, { template: 'DEFAULT', perms: null }).perms).toEqual(DEFAULT_PERMS);
  });

  it('named templates', () => {
    expect(TEMPLATE_PERMS.REFERRER.documents).toBe('none');
    expect(TEMPLATE_PERMS.DOCUMENTS.documents).toBe('upload');
    expect(TEMPLATE_PERMS.FULL).toMatchObject({ clientList: 'full', documents: 'download', drive: 'upload' });
  });

  it('a stored CUSTOM matrix with garbage never grants more (fails closed)', () => {
    expect(parsePerms({ clientList: 'everything', documents: 42, drive: 'admin', payments: 'yes' })).toEqual(NO_PERMS);
    expect(partnerPermsOf({ visibility: 'EXTENDED' }, { template: 'CUSTOM', perms: null }).perms).toEqual(NO_PERMS);
    expect(partnerPermsOf({ visibility: 'MINIMAL' }, { template: 'WHATEVER', perms: { documents: 'list' } }).perms.documents).toBe('list');
  });
});

describe('team members are never above the partner', () => {
  const owner: PartnerPerms = { ...DEFAULT_PERMS, documents: 'upload', drive: 'view', messaging: false };
  it('intersects per key', () => {
    const member: PartnerPerms = { clientList: 'full', caseStage: true, documents: 'download', payments: false, addClients: true, messaging: true, vacancies: true, drive: 'upload' };
    expect(intersectPerms(owner, member)).toEqual({ clientList: 'masked', caseStage: true, documents: 'upload', payments: false, addClients: true, messaging: false, vacancies: true, drive: 'view' });
    expect(exceedingKeys(owner, member).sort()).toEqual(['clientList', 'documents', 'drive', 'messaging']);
  });
  it('member ≤ owner for every combination of levels (property check)', () => {
    const levels = { clientList: ['none', 'masked', 'full'], documents: ['none', 'status', 'list', 'upload', 'download'], drive: ['none', 'view', 'upload'] } as const;
    for (const a of levels.documents)
      for (const b of levels.documents)
        for (const c of levels.clientList)
          for (const d of levels.drive) {
            const o: PartnerPerms = { ...DEFAULT_PERMS, documents: a, clientList: c, drive: 'view' };
            const m: PartnerPerms = { ...DEFAULT_PERMS, documents: b, clientList: 'full', drive: d };
            const eff = intersectPerms(o, m);
            expect(exceedingKeys(o, eff)).toEqual([]);
            expect(exceedingKeys(m, eff)).toEqual([]);
          }
    expect(PERM_KEYS).toHaveLength(8);
  });
});

describe('response shaping', () => {
  it('STATUS only: requirement + complete / missing, no file names, counts, rejection notes or upload', () => {
    const out = shapeCaseDetail(detail(), { ...DEFAULT_PERMS, documents: 'status' });
    expect(out.requirements.map((r) => ({ state: r.state, myUploads: r.myUploads, documentCount: r.documentCount, rejectionReason: r.rejectionReason, canUpload: r.canUpload }))).toEqual([
      { state: 'REJECTED', myUploads: [], documentCount: null, rejectionReason: null, canUpload: false },
      { state: 'MISSING', myUploads: [], documentCount: null, rejectionReason: null, canUpload: false },
    ]);
    expect(out.uploadStage).toBeNull();
    expect(JSON.stringify(out)).not.toContain('pasport.pdf');
  });

  it('documents none: no requirements; no case stage: no status, step, dates or timeline', () => {
    const out = shapeCaseDetail(detail(), { ...DEFAULT_PERMS, documents: 'none', caseStage: false });
    expect(out.requirements).toEqual([]);
    expect(out).toMatchObject({ status: null, step: null, nextAction: null, refused: null, missingDocuments: null, timeline: [] });
  });

  it('list: names of the team uploads, no upload button', () => {
    const out = shapeCaseDetail(detail(), { ...DEFAULT_PERMS, documents: 'list' });
    expect(out.requirements[0]).toMatchObject({ canUpload: false, documentCount: 2, rejectionReason: 'Bulanıq', myUploads: [{ name: 'pasport.pdf' }] });
  });

  it('client rows without payments carry no payment state', () => {
    expect(shapeClientRow({ payment: { state: 'OPEN' }, latestCase: null }, { ...DEFAULT_PERMS, payments: false }).payment).toBeNull();
  });

  it('portal areas', () => {
    expect(portalAreas(NO_PERMS, { owner: false })).toEqual({ clients: false, cases: false, commissions: false, addClients: false, messages: false, vacancies: false, drive: false, team: false, profile: false, referrals: false });
    expect(portalAreas(DEFAULT_PERMS, { owner: true })).toMatchObject({ clients: true, drive: true, team: true, profile: true });
    // referrers: the sub-referrer area instead of commissions and the team page
    expect(portalAreas(TEMPLATE_PERMS.REFERRER, { owner: true, referrer: true })).toMatchObject({ commissions: false, team: false, referrals: true, clients: true });
  });
});

describe('drive isolation (own folder only, never client folders)', () => {
  const live = (id: string, parentId: string | null) => ({ id, parentId, deletedAt: null });
  it('accepts nodes below the partner folder and the folder itself', () => {
    expect(isInsidePartnerFolder([live('root', 'partners')], 'root', new Set())).toBe(true);
    expect(isInsidePartnerFolder([live('f', 'sub'), live('sub', 'root'), live('root', 'partners')], 'root', new Set())).toBe(true);
  });
  it('refuses other partners, client folders and deleted nodes', () => {
    expect(isInsidePartnerFolder([live('f', 'other'), live('other', 'partners'), live('partners', null)], 'root', new Set())).toBe(false);
    expect(isInsidePartnerFolder([live('f', 'client'), live('client', 'root'), live('root', 'partners')], 'root', new Set(['client']))).toBe(false);
    expect(isInsidePartnerFolder([{ id: 'f', parentId: 'root', deletedAt: new Date() }, live('root', 'partners')], 'root', new Set())).toBe(false);
    expect(isInsidePartnerFolder([], 'root', new Set())).toBe(false);
  });
});
