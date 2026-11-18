import type { CompanyPerm } from './access';

/**
 * Employer-portal controls → the permissions the server needs for what they do (server/src/lib/companyAccess/rules.ts).
 * Cosmetic: the server enforces every request; the portal hides a control the member could only get a 403 from
 * (role templates and per-member overrides from the Access Center alike).
 */
export const COMPANY_ACTION_PERMS = {
  /** POST /company/requests, PATCH /company/requests/:id, POST /company/requests/:id/cancel */
  editRequests: ['createRequests'],
  /** POST /company/avv/preview, POST /company/avv/sign */
  signAvv: ['signAvv'],
  /** Interview writes: propose, reschedule, cancel, confirm / decline, evaluations, availability, invites */
  manageInterviews: ['decideCandidates'],
  /** GET /interviews/applicants, GET /interviews/:id/evaluations */
  interviewApplicants: ['viewCandidatePool'],
  /** POST /company/candidates/:id/decision, PUT/DELETE /company/candidates/:id/vote */
  decideCandidates: ['viewCandidatePool', 'decideCandidates'],
  /** PUT/DELETE /company/pool/:code/saved, POST /company/pool/:code/interest */
  poolActions: ['viewCandidatePool', 'decideCandidates'],
  /** POST /company/quotes/:id/accept|decline */
  respondQuotes: ['viewInvoices', 'manageBilling'],
  /** POST /company/forms/:id/submit */
  submitEzb: ['fillEzb', 'viewSalaries', 'signEzb'],
  /** Links into /company/candidates (route gate) */
  viewCandidates: ['viewCandidatePool'],
} as const satisfies Record<string, readonly CompanyPerm[]>;

export type CompanyAction = keyof typeof COMPANY_ACTION_PERMS;

/** Whether a member with `perms` may use the control (missing permissions = not loaded yet: shown, as before). */
export const companyCan = (perms: Partial<Record<CompanyPerm, boolean>> | undefined, action: CompanyAction) =>
  !perms || COMPANY_ACTION_PERMS[action].every((p) => perms[p] !== false);
