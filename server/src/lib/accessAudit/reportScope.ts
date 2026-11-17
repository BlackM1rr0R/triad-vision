import type { Prisma } from '@prisma/client';
import { isFullScope, optionalCase, scopeCaseIds, viaCase } from './scope.js';

/**
 * Report builder × staff case scope: how a dataset's rows map to cases. A dataset not listed here holds no
 * case data (inquiries, vacancies, company invoices, partners, campaigns) and is not filtered.
 * With the full scope ({} = ALL, the default) nothing is added to any query.
 */
type ScopeMapper = (scope: Prisma.CaseWhereInput) => Record<string, unknown> | Promise<Record<string, unknown>>;

export const REPORT_SCOPE: Record<string, ScopeMapper> = {
  cases: (s) => s as Record<string, unknown>,
  clients: (s) => ({ cases: { some: s } }),
  documents: (s) => viaCase(s),
  settlements: (s) => viaCase(s),
  agentCommissions: (s) => viaCase(s),
  // no case relation on PartnerCommission: by id list
  partnerCommissions: async (s) => ({ caseId: { in: (await scopeCaseIds(s)) ?? [] } }),
  // rows that may have no case (team tasks, office bookings, signatures, time entries): unlinked rows stay
  tasks: (s) => optionalCase(s),
  bookings: (s) => optionalCase(s),
  signatures: (s) => optionalCase(s),
  timeEntries: (s) => optionalCase(s),
};

/** Extra where condition of a dataset for the viewer's case scope; null = nothing to add. */
export const reportScopeWhere = async (datasetKey: string, scope: Prisma.CaseWhereInput | null | undefined): Promise<Record<string, unknown> | null> => {
  if (isFullScope(scope)) return null;
  const m = REPORT_SCOPE[datasetKey];
  return m ? await m(scope!) : null;
};
