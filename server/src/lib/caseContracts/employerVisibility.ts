import type { CaseStatus } from '@prisma/client';
import { prisma } from '../../db.js';

/**
 * When may the CLIENT see the employer (company name, logo, address) of their case?
 *
 * Owner's rule (single-contract flow): the employer is shown once the German documents (Arbeitsvertrag …) were sent to
 * the client from the drive workflow "Fertig" — that send moves the case to EMBASSY_DOCUMENTS (lib/clientFolders/readyDocs)
 * — or staff moved the case there by hand ("Confirm contract"). Staff, admin, company and partner views are not
 * affected — this only filters what the client (portal, client APIs, client e-mails / notifications) is shown.
 *
 *   revealed = the case is at the embassy documents stage or later (EMBASSY_DOCUMENTS and later)
 *              OR (old cases only) an İş müqaviləsi (WORK / AUSBILDUNG contract request, retired) of the case is approved.
 */
export const EMPLOYER_REVEALED_STATUSES: CaseStatus[] = ['EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED'];

/** Pure rule (unit-tested). */
export const isEmployerRevealed = (status: CaseStatus, workContractApproved: boolean) => workContractApproved || EMPLOYER_REVEALED_STATUSES.includes(status);

/** Case ids (of the given ones) with an approved İş müqaviləsi. */
const workApprovedCaseIds = async (ids: string[]) => {
  if (!ids.length) return new Set<string>();
  const rows = await prisma.signatureRequest.findMany({
    where: { caseId: { in: ids }, contractKind: { in: ['WORK', 'AUSBILDUNG'] }, approvedAt: { not: null } },
    select: { caseId: true },
  });
  return new Set(rows.map((r) => r.caseId).filter((x): x is string => !!x));
};

/** case id → may the client see the employer (one query for many cases). */
export const loadEmployerRevealed = async (cases: { id: string; status: CaseStatus }[]): Promise<Map<string, boolean>> => {
  const pending = cases.filter((c) => !EMPLOYER_REVEALED_STATUSES.includes(c.status)).map((c) => c.id);
  const approved = await workApprovedCaseIds(pending);
  return new Map(cases.map((c) => [c.id, isEmployerRevealed(c.status, approved.has(c.id))]));
};

/** Single case (by id); false when the case does not exist. */
export const employerRevealedFor = async (caseId: string): Promise<boolean> => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, status: true } });
  if (!c) return false;
  return (await loadEmployerRevealed([c])).get(c.id) ?? false;
};

/** All cases of a client: does any of them reveal the employer `companyId`? (vacancy / application lists of the client) */
export const revealedCompanyIdsForClient = async (clientId: string): Promise<Set<string>> => {
  const cases = await prisma.case.findMany({ where: { clientId, companyId: { not: null } }, select: { id: true, status: true, companyId: true } });
  const revealed = await loadEmployerRevealed(cases);
  return new Set(cases.filter((c) => revealed.get(c.id)).map((c) => c.companyId!));
};
