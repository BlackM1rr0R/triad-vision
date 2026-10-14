import { prisma } from '../db.js';
import { notFound } from './http.js';

/** Full case detail used by both the client portal and the admin panel. */
export const loadCaseDetail = async (caseId: string, opts: { forStaff: boolean }) => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, locale: true } },
      assignedStaff: { select: { id: true, firstName: true, lastName: true } },
      visaCategory: { select: { id: true, slug: true, title: true, visaLabel: true } },
      requirements: {
        orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
        include: { documents: { orderBy: { createdAt: 'desc' } } },
      },
      documents: { where: { requirementId: null }, orderBy: { createdAt: 'desc' } },
      contract: true,
      events: {
        where: opts.forStaff ? {} : { visibleToClient: true },
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { firstName: true, lastName: true, role: true } } },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
      },
    },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');

  const docIds = [c.contract?.fileDocumentId, c.contract?.signedDocumentId].filter(Boolean) as string[];
  const contractDocs = docIds.length ? await prisma.document.findMany({ where: { id: { in: docIds } } }) : [];
  const byId = new Map(contractDocs.map((d) => [d.id, d]));

  return {
    ...c,
    contract: c.contract && {
      ...c.contract,
      file: byId.get(c.contract.fileDocumentId) ?? null,
      signedFile: c.contract.signedDocumentId ? byId.get(c.contract.signedDocumentId) ?? null : null,
      signerIp: opts.forStaff ? c.contract.signerIp : undefined,
      signerUserAgent: opts.forStaff ? c.contract.signerUserAgent : undefined,
    },
    // Documents not tied to a requirement (contract, visa scan, other files uploaded by staff)
    otherDocuments: c.documents.filter((d) => d.stage === 'VISA' || d.stage === 'OTHER'),
    documents: undefined,
  };
};
