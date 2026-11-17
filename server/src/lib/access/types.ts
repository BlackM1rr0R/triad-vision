/**
 * Staff access control: the vocabulary shared by the resolver, the route map, the Access Center and the
 * client sidebar. Names are part of the documented interface (other parts of the programme import them):
 * keep them stable.
 */

export const AREAS = [
  'cases',
  'clients',
  'documents',
  'finance',
  'employers',
  'partners',
  'content',
  'settings',
  'drive',
  'reports',
  'communications',
  'analytics',
] as const;
export type Area = (typeof AREAS)[number];

export const ACTIONS = ['view', 'edit', 'delete', 'export'] as const;
export type Action = (typeof ACTIONS)[number];

/** Allowed actions per area. A missing area = nothing allowed in it. */
export type PermissionMatrix = Partial<Record<Area, Action[]>>;

export interface PermissionOverride {
  area: Area;
  action: Action;
  effect: 'grant' | 'deny';
}

/** Which cases a staff member sees: every case (today), own cases, or the cases of their team(s). */
export const CASE_SCOPES = ['ALL', 'ASSIGNED', 'TEAM'] as const;
export type CaseScope = (typeof CASE_SCOPES)[number];

export const isArea = (v: unknown): v is Area => typeof v === 'string' && (AREAS as readonly string[]).includes(v);
export const isAction = (v: unknown): v is Action => typeof v === 'string' && (ACTIONS as readonly string[]).includes(v);
export const isCaseScope = (v: unknown): v is CaseScope => typeof v === 'string' && (CASE_SCOPES as readonly string[]).includes(v);

/** Minimal user shape the resolver needs (req.user fits). */
export interface AccessUser {
  id: string;
  role: string;
}

/** Everything the resolver knows about one staff member, cached per user. */
export interface ResolvedAccess {
  userId: string;
  role: string;
  /** Template the user is on (built-in key or custom template id). */
  templateId: string | null;
  templateKey: string | null;
  /** True = SUPER_ADMIN: everything, always, regardless of settings. */
  superAdmin: boolean;
  /** Effective permissions: `${area}:${action}`. */
  allowed: Set<string>;
  caseScope: CaseScope;
  /** TEAM scope: every member of the user's teams (the user included). */
  teamMemberIds: string[];
  /** Cases opened through break-glass that are still valid. */
  breakGlassCaseIds: string[];
  /** Earliest break-glass expiry (the cache entry must not outlive it). */
  breakGlassExpiresAt: number | null;
  manageAccess: boolean;
}
