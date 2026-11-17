import { prisma } from '../../db.js';
import { notFound } from '../http.js';
import { clientUploadStageFor } from '../clientUploadTarget.js';
import { forecastForCase } from '../journey/forecast.js';
import { requirementsFor } from '../docsIntel/requirementTemplates.js';
import { familyRequirementsFor } from '../family/requirements.js';
import { stripAiFlag } from '../ai/translate.js';
import { buildOverview } from './build.js';

/**
 * Loads one case of the client and builds the process overview (lib/docProgress/build.ts). Only the client's own
 * case (404 otherwise). Reads the team stage (Case.processingStage / processingStageAt) but returns nothing else of
 * the team workflow: no staff, no notes, no history, no review notes.
 */
export const docProgressForClient = async (caseId: string, userId: string) => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      clientId: true,
      number: true,
      status: true,
      visaType: true,
      visaCategoryId: true,
      closedAt: true,
      decisionAt: true,
      processingStage: true,
      processingStageAt: true,
      requirements: {
        orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
        select: { id: true, stage: true, key: true, title: true, required: true, sortOrder: true, documents: { select: { status: true, createdAt: true } } },
      },
    },
  });
  if (!c || c.clientId !== userId) throw notFound('CASE_NOT_FOUND');

  const forecast = await forecastForCase(c.id);
  const hasEmbassy = c.requirements.some((r) => r.stage === 'EMBASSY');
  // Before the embassy step the case has no EMBASSY rows yet: show the list it will get (same source as createRequirements).
  const preview =
    hasEmbassy || !['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED'].includes(c.status)
      ? null
      : ((await familyRequirementsFor(prisma, c.id, 'EMBASSY')) ?? (await requirementsFor(prisma, 'EMBASSY', c.visaCategoryId))).map((r) => ({
          key: r.key ?? null,
          title: stripAiFlag(r.title),
          required: r.required,
        }));

  return buildOverview({
    caseId: c.id,
    number: c.number,
    status: c.status,
    visaType: c.visaType,
    steps: forecast.steps,
    closedAt: c.closedAt,
    decisionAt: c.decisionAt,
    requirements: c.requirements.map((r) => ({ ...r, title: stripAiFlag(r.title), uploadable: !!clientUploadStageFor(c.status, r) })),
    embassyPreview: preview,
    processing: { stage: c.processingStage, at: c.processingStageAt },
  });
};
