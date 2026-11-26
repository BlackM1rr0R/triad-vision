import { describe, expect, it } from 'vitest';
import { SUMMARY_AREAS, countLevels, joinSummary, scopeKind, summarizePermissions } from './permissionSummary';

describe('summarizePermissions', () => {
  it('maps actions to a level per area and keeps the area order', () => {
    const rows = summarizePermissions({ cases: ['view', 'edit', 'delete', 'export'], finance: ['view'], documents: ['view', 'export'], clients: [] });
    expect(rows.map((r) => r.area)).toEqual([...SUMMARY_AREAS]);
    const by = Object.fromEntries(rows.map((r) => [r.area, r]));
    expect(by.cases).toMatchObject({ level: 'edit', canView: true, canEdit: true, canDelete: true, canExport: true });
    expect(by.finance).toMatchObject({ level: 'view', canEdit: false, canDelete: false });
    expect(by.documents).toMatchObject({ level: 'view', canExport: true });
    expect(by.clients.level).toBe('none');
    expect(by.settings.level).toBe('none'); // missing area = nothing
  });

  it('handles a missing matrix and edit without view', () => {
    expect(summarizePermissions(null).every((r) => r.level === 'none')).toBe(true);
    expect(summarizePermissions({ drive: ['edit'] }).find((r) => r.area === 'drive')?.level).toBe('edit');
  });

  it('a full (legacy / super admin) matrix is edit everywhere', () => {
    const full = Object.fromEntries(SUMMARY_AREAS.map((a) => [a, ['view', 'edit', 'delete', 'export']]));
    expect(countLevels(summarizePermissions(full))).toEqual({ edit: SUMMARY_AREAS.length, view: 0, none: 0 });
  });
});

describe('scopeKind / joinSummary', () => {
  it('keeps the three scopes, anything else is ALL', () => {
    expect(scopeKind('ASSIGNED')).toBe('ASSIGNED');
    expect(scopeKind('TEAM')).toBe('TEAM');
    expect(scopeKind('x')).toBe('ALL');
    expect(scopeKind(undefined)).toBe('ALL');
  });
  it('joins the non-empty parts with a middle dot', () => {
    expect(joinSummary(['Əməkdaş', 'Marketinq', 'Rəhbərlik profili'])).toBe('Əməkdaş · Marketinq · Rəhbərlik profili');
    expect(joinSummary(['Əməkdaş', null, '', false])).toBe('Əməkdaş');
  });
});
