import type { CaseStatus, Locale } from '@prisma/client';
import { prisma } from '../../db.js';
import { requirementsFor } from '../docsIntel/requirementTemplates.js';
import { familyRequirementsFor } from '../family/requirements.js';
import { clientGuides } from '../clientData/guides.js';

/**
 * Portal "Sənəd siyahısı" (document checklist): every document the client's case needs, stage by stage, in one
 * list — the stages the case already has (with the state of each item) and the stages still to come (a preview
 * from the visa type's templates / the family relation's list, exactly what createRequirements will add later).
 * Each item carries the "Necə almalı?" guide (where to get it in Azerbaijan, apostille, translation) when one is
 * published. Only the case's own client reads it (routes/accountPlus.ts checks Case.clientId).
 */

export type ChecklistStage = 'INITIAL' | 'EMBASSY';
export const CHECKLIST_STAGES: ChecklistStage[] = ['INITIAL', 'EMBASSY'];
export type ItemState = 'waiting' | 'review' | 'accepted' | 'rejected' | 'upcoming';

export interface ChecklistItem {
  /** null: a later stage's item that does not exist on the case yet. */
  id: string | null;
  key: string | null;
  title: unknown;
  description: unknown;
  required: boolean;
  state: ItemState;
  files: number;
  lastUploadAt: Date | null;
  rejectionNote: string | null;
}

export interface ChecklistStageView {
  stage: ChecklistStage;
  created: boolean;
  open: boolean;
  past: boolean;
  items: ChecklistItem[];
}

/** Which stage the client may upload to right now (same as the portal's UPLOAD_STAGE). */
const UPLOAD_STAGE: Partial<Record<CaseStatus, ChecklistStage>> = { DOCUMENTS_PENDING: 'INITIAL', EMBASSY_DOCUMENTS: 'EMBASSY' };
/** Stages that are behind the case (nothing more to upload there). */
const PAST: Record<ChecklistStage, CaseStatus[]> = {
  INITIAL: ['DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED', 'REJECTED'],
  EMBASSY: ['EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED', 'REJECTED'],
};

export const itemState = (docs: { status: string }[]): Exclude<ItemState, 'upcoming'> =>
  !docs.length ? 'waiting' : docs.some((d) => d.status === 'ACCEPTED') ? 'accepted' : docs.some((d) => d.status === 'PENDING') ? 'review' : 'rejected';

export const docChecklist = async (caseId: string, locale: Locale) => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      number: true,
      status: true,
      visaType: true,
      visaCategoryId: true,
      parentCaseId: true,
      relation: true,
      visaCategory: { select: { title: true, visaLabel: true } },
      familyProfile: { select: { firstName: true } },
      requirements: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          key: true,
          stage: true,
          title: true,
          description: true,
          required: true,
          documents: { orderBy: { createdAt: 'desc' }, select: { id: true, status: true, reviewNote: true, createdAt: true, originalName: true } },
        },
      },
    },
  });
  if (!c) return null;
  const uploadStage = UPLOAD_STAGE[c.status] ?? null;

  const stages = await Promise.all(
    CHECKLIST_STAGES.map(async (stage): Promise<ChecklistStageView> => {
      const rows = c.requirements.filter((r) => r.stage === stage);
      if (rows.length) {
        return {
          stage,
          created: true,
          open: uploadStage === stage,
          past: PAST[stage].includes(c.status),
          items: rows.map((r): ChecklistItem => {
            const last = r.documents[0];
            return {
              id: r.id,
              key: r.key,
              title: r.title,
              description: r.description,
              required: r.required,
              state: itemState(r.documents),
              files: r.documents.length,
              lastUploadAt: last?.createdAt ?? null,
              rejectionNote: last?.status === 'REJECTED' ? last.reviewNote : null,
            };
          }),
        };
      }
      // Not created yet: what the case will get (family members get their relation's list).
      const preview = (await familyRequirementsFor(prisma, c.id, stage)) ?? (await requirementsFor(prisma, stage, c.visaCategoryId));
      return {
        stage,
        created: false,
        open: false,
        past: false,
        items: preview.map((r): ChecklistItem => ({
          id: null,
          key: r.key ?? null,
          title: r.title,
          description: r.description ?? null,
          required: r.required,
          state: 'upcoming',
          files: 0,
          lastUploadAt: null,
          rejectionNote: null,
        })),
      };
    }),
  );

  const all = stages.flatMap((s) => s.items);
  const required = all.filter((i) => i.required);
  const keys = [...new Set(all.map((i) => i.key).filter((k): k is string => !!k))];
  const guides = keys.length ? await clientGuides(keys, locale) : {};

  return {
    case: {
      id: c.id,
      number: c.number,
      status: c.status,
      visaType: c.visaType,
      visaCategory: c.visaCategory,
      relation: c.parentCaseId ? c.relation : null,
      memberName: c.parentCaseId ? (c.familyProfile?.firstName ?? null) : null,
    },
    uploadStage,
    stages,
    progress: {
      accepted: required.filter((i) => i.state === 'accepted').length,
      inReview: required.filter((i) => i.state === 'review').length,
      required: required.length,
      total: all.length,
    },
    guides,
  };
};
