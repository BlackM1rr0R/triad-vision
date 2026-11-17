/**
 * Employer portal: company-internal roles and permissions (pure, no database).
 *
 * Every COMPANY login of a company is a "member". A member either has
 *   - no explicit role (STANDARD, `role = null`): today's access, unchanged — everything in the portal, team
 *     management only for the company owner (the oldest active login, lib/companyTeam.ts), or
 *   - an explicit role (OWNER / ADMIN / HR / MANAGER / VIEWER) from the role template below, plus optional per-user
 *     overrides that only a Triad Vision SUPER_ADMIN can set (Access Center › Employers).
 *
 * The company owner always has every permission, whatever is stored (a company can never lock itself out).
 * Enforcement is server-side: lib/companyAccess/guard.ts maps every employer endpoint to the permissions below.
 */

export const COMPANY_PERMS = [
  'manageTeam', // invite, change roles, deactivate colleagues
  'editCompanyProfile', // company profile, logo
  'manageVacancies', // create / edit / submit / close vacancies
  'viewPipeline', // candidate pipeline, staff requests list, monthly reports
  'viewWorkers', // "my workers" panel, worker drawer, exports, one-pager, welcome poster, Novruz cards
  'manageArrivalChecklist', // add / tick / delete arrival checklist items
  'viewPersonalDocuments', // download workers' documents (forms, signed PDFs) from the worker drawer
  'viewSalaries', // salary figures (vacancies, requests, EzB pay step)
  'viewContracts', // contracts & other documents to sign: list, open, sign, decline
  'fillEzb', // EzB wizard (Erklärung zum Beschäftigungsverhältnis): open, fill, preview, data sheet
  'signEzb', // submit + sign the EzB
  'signAvv', // AVV (Art. 28 DSGVO): fill, preview, sign
  'viewCandidatePool', // proposed candidates, anonymous candidate pool, CVs, skill videos, AI profiles
  'decideCandidates', // votes, accept / reject, shortlist, interest, interviews and interview hours
  'createRequests', // new staff requests (Personalanfragen), edit / cancel
  'viewInvoices', // invoices and quotes
  'manageBilling', // accept / decline quotes, package configurator requests
] as const;
export type CompanyPerm = (typeof COMPANY_PERMS)[number];
export type CompanyPerms = Record<CompanyPerm, boolean>;

export const COMPANY_ROLES = ['OWNER', 'ADMIN', 'HR', 'MANAGER', 'VIEWER'] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];
/** Roles a company owner / admin may hand out in the portal (OWNER only through the Access Center). */
export const PORTAL_ASSIGNABLE_ROLES = ['ADMIN', 'HR', 'MANAGER', 'VIEWER'] as const;

export const isCompanyPerm = (v: unknown): v is CompanyPerm => typeof v === 'string' && (COMPANY_PERMS as readonly string[]).includes(v);
export const isCompanyRole = (v: unknown): v is CompanyRole => typeof v === 'string' && (COMPANY_ROLES as readonly string[]).includes(v);

const all = (value: boolean): CompanyPerms => Object.fromEntries(COMPANY_PERMS.map((p) => [p, value])) as CompanyPerms;
const only = (...perms: CompanyPerm[]): CompanyPerms => ({ ...all(false), ...Object.fromEntries(perms.map((p) => [p, true])) });

export const ROLE_TEMPLATES: Record<CompanyRole, CompanyPerms> = {
  OWNER: all(true),
  ADMIN: all(true),
  HR: only(
    'manageVacancies',
    'viewPipeline',
    'viewWorkers',
    'manageArrivalChecklist',
    'viewPersonalDocuments',
    'viewSalaries',
    'viewContracts',
    'fillEzb',
    'signEzb',
    'viewCandidatePool',
    'decideCandidates',
    'createRequests',
  ),
  MANAGER: only('viewPipeline', 'viewWorkers', 'manageArrivalChecklist', 'viewCandidatePool', 'decideCandidates'),
  VIEWER: only('viewPipeline', 'viewWorkers'),
};

/** STANDARD (no role stored): today's behaviour — everything; team management only for the owner. */
export const standardPerms = (isOwner: boolean): CompanyPerms => ({ ...all(true), manageTeam: isOwner });

/** Keeps only known permission keys with boolean values (stored JSON may be anything). */
export const cleanOverrides = (raw: unknown): Partial<CompanyPerms> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Partial<CompanyPerms> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (isCompanyPerm(k) && typeof v === 'boolean') out[k] = v;
  return out;
};

export interface MemberAccessInput {
  /** Stored role, null / unknown = STANDARD. */
  role: string | null | undefined;
  overrides?: unknown;
  /** The company owner (oldest active login). */
  isOwner: boolean;
}

/** Effective permissions of one member. */
export const resolveCompanyPerms = (m: MemberAccessInput): CompanyPerms => {
  if (m.isOwner) return all(true);
  if (!isCompanyRole(m.role)) return standardPerms(false);
  return { ...ROLE_TEMPLATES[m.role], ...cleanOverrides(m.overrides) };
};

/** True when the member has every permission (unmapped endpoints stay open only for such members). */
export const hasAllPerms = (p: CompanyPerms) => COMPANY_PERMS.every((k) => p[k]);

/** Every permission except team management: what a STANDARD member has (unmapped endpoints accept this too). */
export const hasFullWork = (p: CompanyPerms) => COMPANY_PERMS.every((k) => k === 'manageTeam' || p[k]);
