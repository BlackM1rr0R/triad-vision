import { describe, expect, it } from 'vitest';
import { COMPANY_ACTION_PERMS, companyCan } from './uiPerms';
import type { CompanyPerm } from './access';

// QA PE-09 … PE-12: employer controls hidden where the server would answer 403 (lib/companyAccess/rules.ts).
const role = (...granted: CompanyPerm[]) => {
  const all = new Set(Object.values(COMPANY_ACTION_PERMS).flat());
  return Object.fromEntries([...all].map((p) => [p, granted.includes(p)])) as Record<CompanyPerm, boolean>;
};

describe('employer portal control gates', () => {
  it('VIEWER / MANAGER (viewPipeline without createRequests): no New / Edit / Cancel request', () => {
    expect(companyCan(role('viewPipeline', 'viewWorkers'), 'editRequests')).toBe(false);
    expect(companyCan(role('viewPipeline', 'createRequests'), 'editRequests')).toBe(true);
  });
  it('HR (viewContracts without signAvv): AVV read-only', () => {
    expect(companyCan(role('viewContracts'), 'signAvv')).toBe(false);
    expect(companyCan(role('signAvv'), 'signAvv')).toBe(true);
  });
  it('interviews: writes need decideCandidates, the applicant picker viewCandidatePool', () => {
    expect(companyCan(role('viewPipeline', 'viewWorkers'), 'manageInterviews')).toBe(false);
    expect(companyCan(role('decideCandidates'), 'manageInterviews')).toBe(true);
    expect(companyCan(role('decideCandidates'), 'interviewApplicants')).toBe(false);
  });
  it('decisions, votes and pool actions need viewCandidatePool + decideCandidates', () => {
    for (const a of ['decideCandidates', 'poolActions'] as const) {
      expect(companyCan(role('viewCandidatePool'), a)).toBe(false);
      expect(companyCan(role('viewCandidatePool', 'decideCandidates'), a)).toBe(true);
    }
  });
  it('quotes need manageBilling, the EzB submit signEzb', () => {
    expect(companyCan(role('viewInvoices'), 'respondQuotes')).toBe(false);
    expect(companyCan(role('viewInvoices', 'manageBilling'), 'respondQuotes')).toBe(true);
    expect(companyCan(role('fillEzb', 'viewSalaries'), 'submitEzb')).toBe(false);
    expect(companyCan(role('fillEzb', 'viewSalaries', 'signEzb'), 'submitEzb')).toBe(true);
  });
  it('permissions not loaded yet: shown as before', () => {
    expect(companyCan(undefined, 'signAvv')).toBe(true);
  });
});
