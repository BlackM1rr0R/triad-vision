// Plain-language summary of a staff member's EFFECTIVE permissions (the matrix comes from the server resolver,
// GET /admin/access/staff/users/:id/preview, i.e. the same logic that enforces access). Display mapping only.
// No '@/' imports: unit-tested directly (permissionSummary.test.ts).

/** Areas in the order the owner thinks about them. Mirrors server/src/lib/access/types.ts AREAS. */
export const SUMMARY_AREAS = ['cases', 'clients', 'documents', 'finance', 'employers', 'partners', 'communications', 'content', 'drive', 'reports', 'analytics', 'settings'] as const;
export type SummaryArea = (typeof SUMMARY_AREAS)[number];

export type AreaLevel = 'edit' | 'view' | 'none';

export interface AreaSummary {
  area: SummaryArea;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
  /** edit = can change, view = read only, none = nothing. Editing without viewing counts as edit. */
  level: AreaLevel;
}

export type PermissionMatrixLike = Partial<Record<string, readonly string[] | undefined>>;

export const summarizePermissions = (matrix: PermissionMatrixLike | null | undefined): AreaSummary[] =>
  SUMMARY_AREAS.map((area) => {
    const actions = matrix?.[area] ?? [];
    const canView = actions.includes('view');
    const canEdit = actions.includes('edit');
    return {
      area,
      canView,
      canEdit,
      canDelete: actions.includes('delete'),
      canExport: actions.includes('export'),
      level: canEdit ? 'edit' : canView ? 'view' : 'none',
    };
  });

export type CaseScopeKind = 'ALL' | 'ASSIGNED' | 'TEAM';
export const isCaseScopeKind = (v: unknown): v is CaseScopeKind => v === 'ALL' || v === 'ASSIGNED' || v === 'TEAM';

/** Unknown values fall back to the narrowest wording-safe default of the server (ALL = today's behaviour). */
export const scopeKind = (v: unknown): CaseScopeKind => (isCaseScopeKind(v) ? v : 'ALL');

/** "Əməkdaş · Marketinq · Rəhbərlik profili": the summary line of a user card (empty parts are dropped). */
export const joinSummary = (parts: (string | null | undefined | false)[]) => parts.filter((p): p is string => !!p && p.trim() !== '').join(' · ');

/** Counts for a one-line headline: how many areas are editable / read only / closed. */
export const countLevels = (rows: AreaSummary[]) => ({
  edit: rows.filter((r) => r.level === 'edit').length,
  view: rows.filter((r) => r.level === 'view').length,
  none: rows.filter((r) => r.level === 'none').length,
});
