import { describe, expect, it } from 'vitest';
import { ACTIONS, AREAS, type ResolvedAccess } from '../../src/lib/access/types.js';
import {
  BUILT_IN_TEMPLATES,
  FULL_MATRIX,
  LEGACY_ADMIN,
  LEGACY_STAFF,
  builtInByKey,
  legacyKeyFor,
  matrixEquals,
  normalizeMatrix,
  normalizeOverrides,
} from '../../src/lib/access/templates.js';
import { canWith, caseRowInScope, effectivePermissions, permKey, scopeWhere, toMatrix, withCaseScope } from '../../src/lib/access/resolve.js';

const access = (over: Partial<ResolvedAccess> = {}): ResolvedAccess => ({
  userId: 'me',
  role: 'STAFF',
  templateId: null,
  templateKey: LEGACY_STAFF,
  superAdmin: false,
  allowed: effectivePermissions(FULL_MATRIX),
  caseScope: 'ALL',
  teamMemberIds: [],
  breakGlassCaseIds: [],
  breakGlassExpiresAt: null,
  manageAccess: false,
  ...over,
});

describe('built-in templates', () => {
  it('has the documented templates with all four languages', () => {
    expect(BUILT_IN_TEMPLATES.map((t) => t.key)).toEqual([LEGACY_STAFF, LEGACY_ADMIN, 'manager', 'sales', 'documents', 'accountant', 'content']);
    for (const t of BUILT_IN_TEMPLATES) {
      for (const l of ['az', 'de', 'en', 'ru'] as const) {
        expect(t.name[l].length, `${t.key} ${l}`).toBeGreaterThan(0);
        expect(t.description[l].length, `${t.key} ${l}`).toBeGreaterThan(0);
      }
      expect(normalizeMatrix(t.matrix), t.key).toEqual(t.matrix);
    }
    expect(builtInByKey('accountant')?.name.az).toBe('Mühasib');
    expect(builtInByKey('documents')?.name.az).toBe('Sənəd mütəxəssisi');
  });

  it('legacy templates equal today: every area, every action (role checks stay in the routes)', () => {
    for (const key of [LEGACY_STAFF, LEGACY_ADMIN]) {
      const m = builtInByKey(key)!.matrix;
      expect(matrixEquals(m, FULL_MATRIX)).toBe(true);
      const allowed = effectivePermissions(m);
      for (const area of AREAS) for (const action of ACTIONS) expect(allowed.has(permKey(area, action)), `${key} ${area}:${action}`).toBe(true);
    }
    expect(legacyKeyFor('STAFF')).toBe(LEGACY_STAFF);
    expect(legacyKeyFor('ADMIN')).toBe(LEGACY_ADMIN);
  });

  it('Mühasib: finance in full, no documents', () => {
    const a = access({ allowed: effectivePermissions(builtInByKey('accountant')!.matrix) });
    for (const action of ACTIONS) expect(canWith(a, 'finance', action)).toBe(true);
    for (const action of ACTIONS) expect(canWith(a, 'documents', action)).toBe(false);
    expect(canWith(a, 'cases', 'view')).toBe(true);
    expect(canWith(a, 'cases', 'edit')).toBe(false);
    expect(canWith(a, 'settings', 'view')).toBe(false);
  });

  it('content editor sees no client or case data', () => {
    const a = access({ allowed: effectivePermissions(builtInByKey('content')!.matrix) });
    for (const area of ['cases', 'clients', 'documents', 'finance'] as const) expect(canWith(a, area, 'view')).toBe(false);
    expect(canWith(a, 'content', 'delete')).toBe(true);
  });
});

describe('normalisation', () => {
  it('drops unknown areas / actions and keeps a stable order', () => {
    expect(normalizeMatrix({ cases: ['export', 'view', 'view', 'fly'], nope: ['view'], finance: 'view' })).toEqual({ cases: ['view', 'export'] });
    expect(normalizeMatrix(null)).toEqual({});
    expect(normalizeMatrix(['cases'])).toEqual({});
  });

  it('keeps the last override per area × action and drops invalid ones', () => {
    expect(
      normalizeOverrides([
        { area: 'cases', action: 'view', effect: 'grant' },
        { area: 'cases', action: 'view', effect: 'deny' },
        { area: 'x', action: 'view', effect: 'grant' },
        { area: 'finance', action: 'edit', effect: 'maybe' },
        null,
      ]),
    ).toEqual([{ area: 'cases', action: 'view', effect: 'deny' }]);
    expect(normalizeOverrides('nope')).toEqual([]);
  });
});

describe('resolver', () => {
  it('applies grants on top of the template and lets a deny win', () => {
    const allowed = effectivePermissions({ finance: ['view'] }, [
      { area: 'reports', action: 'export', effect: 'grant' },
      { area: 'finance', action: 'view', effect: 'deny' },
    ]);
    expect([...allowed].sort()).toEqual(['reports:export']);
  });

  it('a deny on the legacy template removes exactly that permission', () => {
    const allowed = effectivePermissions(FULL_MATRIX, [{ area: 'documents', action: 'export', effect: 'deny' }]);
    expect(allowed.has('documents:export')).toBe(false);
    expect(allowed.size).toBe(AREAS.length * ACTIONS.length - 1);
  });

  it('SUPER_ADMIN can everything whatever is stored', () => {
    const a = access({ superAdmin: true, allowed: new Set() });
    for (const area of AREAS) for (const action of ACTIONS) expect(canWith(a, area, action)).toBe(true);
    expect(toMatrix(a).documents).toEqual([...ACTIONS]);
  });

  it('toMatrix lists the effective actions per area', () => {
    const m = toMatrix(access({ allowed: effectivePermissions({ finance: ['view', 'export'] }) }));
    expect(m.finance).toEqual(['view', 'export']);
    expect(m.cases).toEqual([]);
    expect(Object.keys(m)).toEqual([...AREAS]);
  });
});

describe('case scope', () => {
  it('ALL (the default) adds no filter at all', () => {
    expect(scopeWhere(access())).toEqual({});
    expect(scopeWhere(access({ superAdmin: true, caseScope: 'ASSIGNED' }))).toEqual({});
    expect(withCaseScope({ status: 'APPROVED' }, {})).toEqual({ status: 'APPROVED' });
  });

  it('ASSIGNED: responsible staff or team-workflow assignee, plus break-glass cases', () => {
    expect(scopeWhere(access({ caseScope: 'ASSIGNED' }))).toEqual({ OR: [{ assignedStaffId: { in: ['me'] } }, { processingAssigneeId: { in: ['me'] } }] });
    expect(scopeWhere(access({ caseScope: 'ASSIGNED', breakGlassCaseIds: ['c9'] }))).toEqual({
      OR: [{ assignedStaffId: { in: ['me'] } }, { processingAssigneeId: { in: ['me'] } }, { id: { in: ['c9'] } }],
    });
  });

  it('TEAM: every member of the user’s teams (the user included)', () => {
    expect(scopeWhere(access({ caseScope: 'TEAM', teamMemberIds: ['a', 'me', 'b'] }))).toEqual({
      OR: [{ assignedStaffId: { in: ['me', 'a', 'b'] } }, { processingAssigneeId: { in: ['me', 'a', 'b'] } }],
    });
    // No team: the same as ASSIGNED
    expect(scopeWhere(access({ caseScope: 'TEAM' }))).toEqual(scopeWhere(access({ caseScope: 'ASSIGNED' })));
  });

  it('combines a list filter with the scope', () => {
    const scope = scopeWhere(access({ caseScope: 'ASSIGNED' }));
    expect(withCaseScope({ status: 'APPROVED' }, scope)).toEqual({ AND: [{ status: 'APPROVED' }, scope] });
    expect(withCaseScope({}, scope)).toEqual(scope);
  });

  it('checks a loaded case row the same way', () => {
    const row = (assignedStaffId: string | null, processingAssigneeId: string | null = null, id = 'c1') => ({ id, assignedStaffId, processingAssigneeId });
    expect(caseRowInScope(access(), row('other'))).toBe(true);
    const assigned = access({ caseScope: 'ASSIGNED' });
    expect(caseRowInScope(assigned, row('me'))).toBe(true);
    expect(caseRowInScope(assigned, row('other', 'me'))).toBe(true);
    expect(caseRowInScope(assigned, row('other'))).toBe(false);
    expect(caseRowInScope(assigned, row(null))).toBe(false);
    expect(caseRowInScope(access({ caseScope: 'ASSIGNED', breakGlassCaseIds: ['c1'] }), row('other'))).toBe(true);
    const team = access({ caseScope: 'TEAM', teamMemberIds: ['mate'] });
    expect(caseRowInScope(team, row('mate'))).toBe(true);
    expect(caseRowInScope(team, row('stranger'))).toBe(false);
  });
});
