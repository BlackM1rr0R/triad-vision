import { describe, expect, it } from 'vitest';
import { caseIdIn, clientUsersInScope, filterByCaseIds, isFullScope, optionalCase, scoped, viaCase } from '../../src/lib/accessAudit/scope.js';
import { REPORT_SCOPE, reportScopeWhere } from '../../src/lib/accessAudit/reportScope.js';
import { scopeFinanceData } from '../../src/lib/finance/load.js';
import type { FinanceData } from '../../src/lib/finance/aggregate.js';
import { recordOfPath, hourOf } from '../../src/lib/accessAudit/recordTouch.js';
import { elevatedReasons, type AuditRow } from '../../src/lib/accessAudit/whoCanSee.js';
import { inReviewWindow, quarterBounds, quarterOf } from '../../src/lib/accessAudit/reviews.js';
import { DEFAULT_ANOMALY_SETTINGS, anomalySettingsSchema, outsideHours, overThreshold, recordRows, toHit } from '../../src/lib/accessAudit/anomalies.js';
import { anomalySummary, anomalyTitle, AUDIT_TEXTS } from '../../src/lib/accessAudit/texts.js';

const ASSIGNED = { OR: [{ assignedStaffId: { in: ['s1'] } }, { processingAssigneeId: { in: ['s1'] } }] };

describe('case scope helpers', () => {
  it('ALL scope ({}) leaves every query untouched', () => {
    const where = { status: { notIn: ['APPROVED'] } };
    expect(isFullScope({})).toBe(true);
    expect(isFullScope(undefined)).toBe(true);
    expect(scoped(where as never, {})).toBe(where);
    expect(viaCase({})).toEqual({});
    expect(optionalCase({})).toEqual({});
    expect(clientUsersInScope({})).toEqual({});
    expect(caseIdIn(null)).toEqual({});
    const rows = [{ caseId: 'a' }, { caseId: null }];
    expect(filterByCaseIds(rows, null)).toBe(rows);
  });

  it('a restricted scope is AND-ed / mapped onto relations', () => {
    expect(scoped({ status: 'APPROVED' } as never, ASSIGNED as never)).toEqual({ AND: [{ status: 'APPROVED' }, ASSIGNED] });
    expect(viaCase(ASSIGNED as never)).toEqual({ case: ASSIGNED });
    expect(optionalCase(ASSIGNED as never)).toEqual({ OR: [{ caseId: null }, { case: ASSIGNED }] });
    expect(clientUsersInScope(ASSIGNED as never)).toEqual({ OR: [{ role: { not: 'CLIENT' } }, { cases: { some: ASSIGNED } }] });
    expect(caseIdIn(['x'])).toEqual({ caseId: { in: ['x'] } });
    expect(filterByCaseIds([{ caseId: 'a' }, { caseId: 'b' }, { caseId: null }], ['a'])).toEqual([{ caseId: 'a' }]);
    expect(filterByCaseIds([{ caseId: 'a' }, { caseId: null }], ['a'], true)).toEqual([{ caseId: 'a' }, { caseId: null }]);
  });

  it('report datasets: nothing added for ALL; case-linked datasets mapped for a restricted scope', async () => {
    for (const key of [...Object.keys(REPORT_SCOPE), 'inquiries', 'invoices']) expect(await reportScopeWhere(key, {})).toBeNull();
    expect(await reportScopeWhere('cases', ASSIGNED as never)).toEqual(ASSIGNED);
    expect(await reportScopeWhere('documents', ASSIGNED as never)).toEqual({ case: ASSIGNED });
    expect(await reportScopeWhere('clients', ASSIGNED as never)).toEqual({ cases: { some: ASSIGNED } });
    expect(await reportScopeWhere('tasks', ASSIGNED as never)).toEqual({ OR: [{ caseId: null }, { case: ASSIGNED }] });
    expect(await reportScopeWhere('inquiries', ASSIGNED as never)).toBeNull(); // no case data
  });

  it('finance data: unchanged for ALL, reduced to in-scope cases otherwise', () => {
    const d = {
      invoices: [
        { companyId: 'c1', status: 'PAID' },
        { companyId: 'c2', status: 'PAID' },
      ],
      commissions: [{ caseId: 'k1' }, { caseId: 'k2' }, { caseId: null }],
      translations: [{ caseId: 'k2' }],
      cases: [
        { id: 'k1', companyId: 'c1' },
        { id: 'k2', companyId: 'c2' },
      ],
      partnerCommissions: [{ caseId: 'k1' }, { caseId: 'k2' }],
    } as unknown as FinanceData;
    expect(scopeFinanceData(d, null)).toBe(d);
    const s = scopeFinanceData(d, ['k1']);
    expect(s.cases.map((c) => c.id)).toEqual(['k1']);
    expect(s.invoices.map((i) => i.companyId)).toEqual(['c1']);
    expect(s.commissions).toEqual([{ caseId: 'k1' }]);
    expect(s.translations).toEqual([]);
    expect(s.partnerCommissions).toEqual([{ caseId: 'k1' }]);
  });
});

describe('record counter', () => {
  it('counts only GET detail pages of cases and clients', () => {
    expect(recordOfPath('GET', '/admin/cases/abcdef123')).toBe('case:abcdef123');
    expect(recordOfPath('GET', '/admin/cases/abcdef123/messages')).toBe('case:abcdef123');
    expect(recordOfPath('GET', '/admin/clients/client12345')).toBe('client:client12345');
    expect(recordOfPath('POST', '/admin/cases/abcdef123')).toBeNull();
    expect(recordOfPath('GET', '/admin/cases')).toBeNull();
    expect(recordOfPath('GET', '/admin/cases/export')).toBeNull();
    expect(recordOfPath('GET', '/admin/finance/summary')).toBeNull();
  });
  it('buckets by hour', () => {
    expect(hourOf(new Date('2026-11-17T10:42:13Z')).toISOString()).toBe('2026-11-17T10:00:00.000Z');
  });
});

describe('who can see what: elevated reasons', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  const recent = new Date('2026-11-10T12:00:00Z');
  const staff = (over: Partial<NonNullable<AuditRow['staff']>> = {}) =>
    ({
      superAdmin: false,
      templateKey: 'legacy_staff',
      templateId: 't',
      overrides: 0,
      manageAccess: false,
      matrix: {},
      caseScope: 'ALL',
      visibleCases: 0,
      sensitive: { visible: [], masked: ['PASSPORT'], hidden: [] },
      breakGlass: [],
      ...over,
    }) as NonNullable<AuditRow['staff']>;
  const base = { role: 'STAFF' as const, isActive: true, lastLoginAt: recent, createdAt: recent };

  it('flags manage access, wide templates, ALL scope, visible sensitive data', () => {
    expect(elevatedReasons({ ...base, staff: staff() }, now)).toEqual(['SCOPE_ALL']);
    expect(elevatedReasons({ ...base, staff: staff({ caseScope: 'ASSIGNED' }) }, now)).toEqual([]);
    expect(elevatedReasons({ ...base, staff: staff({ manageAccess: true, templateKey: 'legacy_admin', sensitive: { visible: ['IBAN'], masked: [], hidden: [] } }) }, now)).toEqual([
      'MANAGE_ACCESS',
      'ELEVATED_TEMPLATE',
      'SCOPE_ALL',
      'SENSITIVE_VISIBLE',
    ]);
    expect(elevatedReasons({ ...base, staff: staff({ templateKey: 'manager', caseScope: 'TEAM' }) }, now)).toEqual(['ELEVATED_TEMPLATE']);
    expect(elevatedReasons({ ...base, role: 'SUPER_ADMIN', staff: staff({ superAdmin: true }) }, now)).toEqual(['SUPER_ADMIN']);
  });

  it('flags partner FULL, company owner / admin and inactive accounts', () => {
    const perms = { clientList: 'masked' } as never;
    expect(elevatedReasons({ ...base, role: 'AGENT', partner: { partnerId: 'p', partnerName: 'P', role: 'OWNER', template: 'FULL', perms, visibleCases: 0, memberActive: true } }, now)).toEqual(['PARTNER_FULL']);
    expect(elevatedReasons({ ...base, role: 'AGENT', partner: { partnerId: 'p', partnerName: 'P', role: 'OWNER', template: 'DEFAULT', perms, visibleCases: 0, memberActive: true } }, now)).toEqual([]);
    const company = (role: string | null, isOwner: boolean) => ({ companyId: 'c', companyName: 'C', role, isOwner, perms: {} as never, visibleCases: 0 });
    expect(elevatedReasons({ ...base, role: 'COMPANY', company: company(null, true) }, now)).toEqual(['COMPANY_OWNER']);
    expect(elevatedReasons({ ...base, role: 'COMPANY', company: company('ADMIN', false) }, now)).toEqual(['COMPANY_ADMIN']);
    expect(elevatedReasons({ ...base, role: 'COMPANY', company: company('VIEWER', false) }, now)).toEqual([]);
    const old = new Date('2026-07-01T00:00:00Z');
    expect(elevatedReasons({ ...base, role: 'COMPANY', lastLoginAt: old, createdAt: old, company: company('VIEWER', false) }, now)).toEqual(['INACTIVE']);
    expect(elevatedReasons({ ...base, role: 'COMPANY', lastLoginAt: null, createdAt: old, company: company('VIEWER', false) }, now)).toEqual(['INACTIVE']);
    expect(elevatedReasons({ ...base, isActive: false, role: 'COMPANY', lastLoginAt: old, createdAt: old, company: company('VIEWER', false) }, now)).toEqual([]);
  });
});

describe('quarterly reviews: dates', () => {
  it('quarter of a Baku date', () => {
    expect(quarterOf(new Date('2026-11-17T12:00:00Z'))).toBe('2026-Q4');
    expect(quarterOf(new Date('2026-12-31T21:00:00Z'))).toBe('2027-Q1'); // 01:00 in Baku on 1 January
    expect(quarterOf(new Date('2026-04-01T00:00:00Z'))).toBe('2026-Q2');
  });
  it('creation window = days 1–7 of a quarter (Baku)', () => {
    expect(inReviewWindow(new Date('2026-10-01T06:00:00Z'))).toBe(true);
    expect(inReviewWindow(new Date('2026-10-07T06:00:00Z'))).toBe(true);
    expect(inReviewWindow(new Date('2026-10-08T06:00:00Z'))).toBe(false);
    expect(inReviewWindow(new Date('2026-11-01T06:00:00Z'))).toBe(false);
    expect(inReviewWindow(new Date('2026-12-31T21:00:00Z'))).toBe(true); // 1 January in Baku
  });
  it('quarter bounds and previous quarter', () => {
    const b = quarterBounds(new Date('2027-01-03T10:00:00Z'));
    expect(b.start.toISOString()).toBe('2026-12-31T20:00:00.000Z'); // Baku midnight 1 Jan 2027
    expect(b.prevStart.toISOString()).toBe('2026-09-30T20:00:00.000Z');
  });
});

describe('anomaly detection thresholds', () => {
  it('defaults', () => {
    expect(DEFAULT_ANOMALY_SETTINGS.manyRecords.threshold).toBe(150);
    expect(DEFAULT_ANOMALY_SETTINGS.manyReveals.threshold).toBe(20);
    expect(DEFAULT_ANOMALY_SETTINGS.manyExports.threshold).toBe(10);
    expect(DEFAULT_ANOMALY_SETTINGS.breakGlass.threshold).toBe(3);
    expect(DEFAULT_ANOMALY_SETTINGS.offHours.enabled).toBe(false);
    expect(anomalySettingsSchema.parse({ manyRecords: { enabled: true, threshold: 'x' } }).manyRecords.threshold).toBe(150);
  });

  it('only MORE than the threshold of distinct keys alerts', () => {
    const rows = (user: string, n: number) => Array.from({ length: n }, (_, i) => ({ userId: user, key: `k${i}`, id: `${user}-${i}` }));
    expect(overThreshold('accessManyReveals', rows('u1', 20), 20)).toEqual([]);
    const hit = overThreshold('accessManyReveals', [...rows('u1', 21), ...rows('u2', 5), { userId: null, key: 'x', id: 'y' }], 20);
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ userId: 'u1', count: 21, threshold: 20 });
    expect(hit[0].eventIds).toHaveLength(21);
    // same record twice = one distinct record
    const dup = overThreshold('accessManyRecords', [...rows('u3', 3), { userId: 'u3', key: 'k0', id: 'z' }], 3);
    expect(dup).toEqual([]);
  });

  it('records = counter + document views, one key per case', () => {
    const r = recordRows(
      [{ userId: 'u', record: 'case:c1', hour: new Date(0) }],
      [
        { id: 'd1', actorId: 'u', caseId: 'c1', clientId: 'cl' },
        { id: 'd2', actorId: 'u', caseId: null, clientId: 'cl' },
      ],
    );
    expect(new Set(r.map((x) => x.key))).toEqual(new Set(['case:c1', 'client:cl']));
    expect(overThreshold('accessManyRecords', r, 1)[0].count).toBe(2);
  });

  it('working hours', () => {
    const cfg = { startHour: 8, endHour: 20, weekdaysOnly: true };
    expect(outsideHours(9, 2, cfg)).toBe(false);
    expect(outsideHours(7, 2, cfg)).toBe(true);
    expect(outsideHours(20, 2, cfg)).toBe(true);
    expect(outsideHours(10, 6, cfg)).toBe(true);
    expect(outsideHours(10, 6, { ...cfg, weekdaysOnly: false })).toBe(false);
    expect(outsideHours(23, 3, { startHour: 22, endHour: 6, weekdaysOnly: false })).toBe(false); // night shift window
    expect(outsideHours(12, 3, { startHour: 22, endHour: 6, weekdaysOnly: false })).toBe(true);
  });

  it('hits carry texts in every locale', () => {
    const h = toHit({ rule: 'accessManyExports', userId: 'u', count: 12, threshold: 10, eventIds: ['a'] }, 'A B <a@b>', 'STAFF');
    expect(h).toMatchObject({ subject: 'user:u', severity: 'MEDIUM', facts: { exports: 12, threshold: 10 } });
    for (const l of Object.keys(AUDIT_TEXTS)) {
      expect(anomalyTitle('accessManyExports', l)).toBeTruthy();
      expect(anomalySummary('accessManyExports', h.facts, l)).toContain('12');
    }
    expect(anomalyTitle('unknownRule', 'az')).toBeUndefined();
  });
});
