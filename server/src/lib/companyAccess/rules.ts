import { hasFullWork, type CompanyPerm, type CompanyPerms } from './permissions.js';

/**
 * Endpoint → permission map of everything a COMPANY login can call (pure).
 *
 * Paths are relative to /api, `:x` matches one segment. First match wins, so literal paths come before `:param`
 * ones of the same router. A request no rule matches is "unmapped": it stays open for members with full work
 * access (STANDARD / OWNER / ADMIN — today's behaviour) and is refused for restricted roles (fail closed).
 * tests/unit/company-access.test.ts walks every employer router and fails when a route has no rule here.
 */
export type Need =
  | { kind: 'basic' } // every member of the company
  | { kind: 'perms'; all?: CompanyPerm[]; any?: CompanyPerm[] }
  | { kind: 'signer'; action: 'view' | 'sign' } // /signatures/my/:signerId — depends on what is signed (guard.ts)
  | { kind: 'signerList' }; // /signatures/my — filtered by what the member may see (guard.ts)

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | '*';
export interface Rule {
  method: Method;
  path: string;
  need: Need;
}

const basic: Need = { kind: 'basic' };
const allOf = (...p: CompanyPerm[]): Need => ({ kind: 'perms', all: p });
const anyOf = (...p: CompanyPerm[]): Need => ({ kind: 'perms', any: p });
const r = (method: Method, path: string, need: Need): Rule => ({ method, path, need });

/** URL prefixes (under /api) the guard looks at at all. */
export const GUARDED_PREFIXES = ['/company', '/signatures/my', '/interviews', '/interview-calendar'];

export const COMPANY_RULES: Rule[] = [
  // ── routes/companyAccess.ts (own permissions) ──
  r('GET', '/company/access/me', basic),

  // ── routes/companyTeam.ts ──
  r('GET', '/company/team', basic),
  r('POST', '/company/team', allOf('manageTeam')),
  r('POST', '/company/team/:id/resend', allOf('manageTeam')),
  r('PATCH', '/company/team/:id/role', allOf('manageTeam')),
  r('DELETE', '/company/team/:id', allOf('manageTeam')),

  // ── routes/companyInvoices.ts, routes/quotes.ts (company side) ──
  r('GET', '/company/invoices', allOf('viewInvoices')),
  r('GET', '/company/invoices/:id/pdf', allOf('viewInvoices')),
  r('GET', '/company/quotes', allOf('viewInvoices')),
  r('GET', '/company/quotes/:id', allOf('viewInvoices')),
  r('GET', '/company/quotes/:id/pdf', allOf('viewInvoices')),
  r('POST', '/company/quotes/:id/accept', allOf('viewInvoices', 'manageBilling')),
  r('POST', '/company/quotes/:id/decline', allOf('viewInvoices', 'manageBilling')),

  // ── routes/companyRequests.ts ──
  r('GET', '/company/requests/options', anyOf('viewPipeline', 'createRequests')),
  r('GET', '/company/requests', anyOf('viewPipeline', 'createRequests')),
  r('POST', '/company/requests', allOf('createRequests')),
  r('GET', '/company/requests/:id', anyOf('viewPipeline', 'createRequests')),
  r('PATCH', '/company/requests/:id', allOf('createRequests')),
  r('POST', '/company/requests/:id/cancel', allOf('createRequests')),

  // ── routes/companyPool.ts ──
  r('GET', '/company/pool/options', allOf('viewCandidatePool')),
  r('GET', '/company/pool', allOf('viewCandidatePool')),
  r('GET', '/company/pool/saved', allOf('viewCandidatePool')),
  r('GET', '/company/pool/interests', allOf('viewCandidatePool')),
  r('GET', '/company/pool/:code', allOf('viewCandidatePool')),
  r('GET', '/company/pool/:code/one-pager.pdf', allOf('viewCandidatePool')),
  r('PUT', '/company/pool/:code/saved', allOf('viewCandidatePool', 'decideCandidates')),
  r('DELETE', '/company/pool/:code/saved', allOf('viewCandidatePool', 'decideCandidates')),
  r('POST', '/company/pool/:code/interest', allOf('viewCandidatePool', 'decideCandidates')),

  // ── routes/companyAi.ts, routes/companySkillVideos.ts ──
  r('GET', '/company/ai/status', basic),
  r('GET', '/company/ai/profiles', allOf('viewCandidatePool')),
  r('GET', '/company/ai/profiles/:applicationId/pdf', allOf('viewCandidatePool')),
  r('POST', '/company/ai/vacancy/draft', allOf('manageVacancies')),
  r('POST', '/company/ai/vacancy/translate', allOf('manageVacancies')),
  r('POST', '/company/ai/vacancy/google', allOf('manageVacancies')),
  r('POST', '/company/ai/vacancies/:id/ai-saved', allOf('manageVacancies')),
  r('GET', '/company/skill-videos', allOf('viewCandidatePool')),
  r('GET', '/company/skill-videos/:id/file', allOf('viewCandidatePool')),
  r('GET', '/company/skill-videos/:id/poster', allOf('viewCandidatePool')),
  r('POST', '/company/skill-videos/:id/view', allOf('viewCandidatePool')),

  // ── routes/companyForms.ts (EzB wizard: the pay step shows salaries) ──
  r('GET', '/company/forms', allOf('fillEzb', 'viewSalaries')),
  r('GET', '/company/forms/kldb', allOf('fillEzb')),
  r('POST', '/company/forms/start', allOf('fillEzb', 'viewSalaries')),
  r('POST', '/company/forms/:id/datasheet', allOf('fillEzb', 'viewSalaries')),
  r('GET', '/company/forms/:id', allOf('fillEzb', 'viewSalaries')),
  r('POST', '/company/forms/:id/preview', allOf('fillEzb', 'viewSalaries')),
  r('POST', '/company/forms/:id/submit', allOf('fillEzb', 'viewSalaries', 'signEzb')),

  // ── routes/companyAvv.ts ──
  r('GET', '/company/avv', anyOf('signAvv', 'viewContracts')),
  r('POST', '/company/avv/preview', allOf('signAvv')),
  r('POST', '/company/avv/sign', allOf('signAvv')),
  r('GET', '/company/avv/:id/file', anyOf('signAvv', 'viewContracts')),

  // ── routes/companyWorkers.ts (literal paths before /:caseId) ──
  r('GET', '/company/workers', allOf('viewWorkers')),
  r('GET', '/company/workers/export.xlsx', allOf('viewWorkers')),
  r('GET', '/company/workers/export.csv', allOf('viewWorkers')),
  r('GET', '/company/workers/checklists/overview', allOf('viewWorkers')),
  r('GET', '/company/workers/:caseId/one-pager.pdf', allOf('viewWorkers')),
  r('GET', '/company/workers/:caseId/welcome-poster.pdf', allOf('viewWorkers')),
  r('GET', '/company/workers/:caseId/checklist', allOf('viewWorkers')),
  r('POST', '/company/workers/:caseId/checklist', allOf('viewWorkers', 'manageArrivalChecklist')),
  r('PATCH', '/company/workers/:caseId/checklist/:itemId', allOf('viewWorkers', 'manageArrivalChecklist')),
  r('DELETE', '/company/workers/:caseId/checklist/:itemId', allOf('viewWorkers', 'manageArrivalChecklist')),
  r('GET', '/company/workers/:caseId', allOf('viewWorkers')),
  r('GET', '/company/workers/:caseId/documents/signature/:id', allOf('viewWorkers', 'viewPersonalDocuments', 'viewContracts')),
  r('GET', '/company/workers/:caseId/documents/:kind/:id', allOf('viewWorkers', 'viewPersonalDocuments')),

  // ── routes/readyProgress.ts (company readiness card) ──
  r('GET', '/company/readiness-profile/workers/:caseId', allOf('viewWorkers')),
  r('GET', '/company/readiness-profile/pool/:code', allOf('viewCandidatePool')),

  // ── routes/companyReports.ts ──
  r('GET', '/company/reports', allOf('viewPipeline')),
  r('GET', '/company/reports/preferences', basic), // the signed-in user's own e-mail opt-out
  r('PUT', '/company/reports/preferences', basic),
  r('GET', '/company/reports/:id/pdf', allOf('viewPipeline')),

  // ── routes/companyPipeline.ts ──
  r('GET', '/company/pipeline', allOf('viewPipeline')),
  r('GET', '/company/pipeline/preferences', basic), // own weekly digest preference
  r('PUT', '/company/pipeline/preferences', basic),

  // ── routes/configurator.ts (company side) ──
  r('GET', '/company/configurator', basic),
  r('POST', '/company/configurator/price', basic),
  r('GET', '/company/configurator/requests', allOf('manageBilling')),
  r('POST', '/company/configurator/requests', allOf('manageBilling')),

  // ── routes/company.ts ──
  r('POST', '/company/register', basic), // public registration (not used by signed-in members)
  r('GET', '/company/me', basic),
  r('PATCH', '/company/me', allOf('editCompanyProfile')),
  r('POST', '/company/me/logo', allOf('editCompanyProfile')),
  r('DELETE', '/company/me/logo', allOf('editCompanyProfile')),
  r('GET', '/company/dashboard', basic),
  r('GET', '/company/vacancies', basic),
  r('POST', '/company/vacancies/images', allOf('manageVacancies')),
  r('GET', '/company/vacancies/:id', basic),
  r('POST', '/company/vacancies', allOf('manageVacancies')),
  r('PATCH', '/company/vacancies/:id', allOf('manageVacancies')),
  r('POST', '/company/vacancies/:id/submit', allOf('manageVacancies')),
  r('POST', '/company/vacancies/:id/close', allOf('manageVacancies')),
  r('DELETE', '/company/vacancies/:id', allOf('manageVacancies')),
  r('GET', '/company/candidates', allOf('viewCandidatePool')),
  r('PUT', '/company/candidates/:id/vote', allOf('viewCandidatePool', 'decideCandidates')),
  r('DELETE', '/company/candidates/:id/vote', allOf('viewCandidatePool', 'decideCandidates')),
  r('GET', '/company/candidates/:applicationId/cv.pdf', allOf('viewCandidatePool')),
  r('POST', '/company/candidates/:id/decision', allOf('viewCandidatePool', 'decideCandidates')),

  // ── routes/signatures.ts (portal signing: contracts, EzB, AVV) ──
  r('GET', '/signatures/my', { kind: 'signerList' }),
  r('GET', '/signatures/my/:signerId', { kind: 'signer', action: 'view' }),
  r('GET', '/signatures/my/:signerId/document', { kind: 'signer', action: 'view' }),
  r('POST', '/signatures/my/:signerId/sign', { kind: 'signer', action: 'sign' }),
  r('POST', '/signatures/my/:signerId/decline', { kind: 'signer', action: 'sign' }),

  // ── routes/interviews.ts, routes/interviewCalendar.ts (company audience) ──
  r('GET', '/interviews', basic),
  r('GET', '/interviews/mine', basic),
  r('GET', '/interviews/applicants', allOf('viewCandidatePool')),
  r('GET', '/interviews/:id', basic),
  r('GET', '/interviews/:id/ics', basic),
  r('GET', '/interviews/:id/evaluations', allOf('viewCandidatePool')),
  r('*', '/interviews', allOf('decideCandidates')),
  r('*', '/interviews/:id', allOf('decideCandidates')),
  r('*', '/interviews/:id/confirm', allOf('decideCandidates')),
  r('*', '/interviews/:id/decline', allOf('decideCandidates')),
  r('*', '/interviews/:id/evaluations/mine', allOf('decideCandidates')),
  r('*', '/interviews/:id/evaluations/:evalId', allOf('decideCandidates')),
  r('GET', '/interview-calendar/availability', basic),
  r('GET', '/interview-calendar/availability/preview', basic),
  r('GET', '/interview-calendar/invites', basic),
  r('GET', '/interview-calendar/invites/:id/slots', basic),
  r('*', '/interview-calendar/availability', allOf('decideCandidates')),
  r('*', '/interview-calendar/invites', allOf('decideCandidates')),
  r('*', '/interview-calendar/invites/:id', allOf('decideCandidates')),
  r('*', '/interview-calendar/invites/:id/book', allOf('decideCandidates')),
];

const segs = (p: string) => p.split('/').filter(Boolean);

/** Express routing is case-insensitive and ignores one trailing slash; so is this. HEAD is answered by GET routes. */
export const matchRule = (method: string, apiPath: string, rules: Rule[] = COMPANY_RULES): Rule | null => {
  const m = method.toUpperCase() === 'HEAD' ? 'GET' : method.toUpperCase();
  const parts = segs(apiPath);
  for (const rule of rules) {
    if (rule.method !== '*' && rule.method !== m) continue;
    const want = segs(rule.path);
    if (want.length !== parts.length) continue;
    if (want.every((w, i) => w.startsWith(':') || w.toLowerCase() === parts[i].toLowerCase())) return rule;
  }
  return null;
};

export const isGuardedPath = (apiPath: string) => {
  const p = apiPath.toLowerCase();
  return GUARDED_PREFIXES.some((pre) => p === pre || p.startsWith(`${pre}/`));
};

/** Decision for a plain rule (signer rules are resolved in guard.ts). Unmapped → full work access only. */
export const allowedByNeed = (need: Need | null, perms: CompanyPerms): boolean => {
  if (!need) return hasFullWork(perms);
  if (need.kind === 'basic') return true;
  if (need.kind !== 'perms') return true;
  if (need.all && !need.all.every((p) => perms[p])) return false;
  if (need.any && !need.any.some((p) => perms[p])) return false;
  return true;
};

// ─── Signature requests: what is being signed ──────────────────────────

export type SignKind = 'AVV' | 'EZB' | 'CONTRACT';

export const signerAllowed = (kind: SignKind, action: 'view' | 'sign', perms: CompanyPerms) => {
  if (kind === 'AVV') return action === 'sign' ? perms.signAvv : perms.signAvv || perms.viewContracts;
  if (kind === 'EZB') return action === 'sign' ? perms.signEzb : perms.signEzb || perms.fillEzb;
  return perms.viewContracts;
};

// ─── Salary redaction ──────────────────────────────────────────────────

/** Keys holding pay figures in employer-facing JSON (vacancies, requests, contract / form values). */
const SALARY_KEY = /salary|wage|gross(monthly|yearly)|netmonthly|paygroup|variablepay|benefitsinkindamount/i;
export const isSalaryKey = (k: string) => SALARY_KEY.test(k);

/** Deep copy without salary keys (dates and other non-plain objects are kept as they are). */
export const redactSalaries = (value: unknown, depth = 0): unknown => {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactSalaries(v, depth + 1));
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (!isSalaryKey(k)) out[k] = redactSalaries(v, depth + 1);
  return out;
};
