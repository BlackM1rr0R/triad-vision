import type { L10n } from '@/lib/types';
import type { RequirementState } from '@/components/portal/requirementState';
import type { BadgeTone } from '@/components/ui/status';

/** GET /api/doc-progress/cases/:id (server/src/lib/docProgress/build.ts). Pure helpers, unit-tested in model.test.ts. */

export type ReqStatus = 'MISSING' | 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type StepState = 'done' | 'current' | 'upcoming';

export interface StageCounts {
  total: number;
  missing: number;
  pending: number;
  accepted: number;
  rejected: number;
  required: number;
  requiredAccepted: number;
}

export interface OverviewItem {
  id: string | null;
  key: string | null;
  title: L10n | null;
  required: boolean;
  status: ReqStatus;
  uploadedAt: string | null;
  uploadable: boolean;
}

export interface OverviewDocStage {
  stage: 'INITIAL' | 'EMBASSY';
  preview: boolean;
  uploadOpen: boolean;
  counts: StageCounts;
  items: OverviewItem[];
}

export interface ProcessingInfo {
  stage: 'WRITTEN' | 'IN_PROGRESS' | 'DONE' | 'REFUSED';
  word: string;
  label: L10n;
  meaning: L10n;
  explanation: L10n;
  tone: 'info' | 'progress' | 'success' | 'danger';
  at: string | null;
}

export interface DocProgressOverview {
  caseId: string;
  number: string;
  status: string;
  visaType: string;
  percent: number | null;
  steps: { key: string; state: StepState; enteredAt: string | null; leftAt: string | null; expectedFrom: string | null; expectedTo: string | null }[];
  documents: OverviewDocStage[];
  processing: ProcessingInfo | null;
  embassyCollection: { uploadOpen: boolean; preview: boolean; counts: StageCounts; items: OverviewItem[] } | null;
}

/** Server status → the portal's requirement state words (pmom.docState.*). */
export const STATE_OF: Record<ReqStatus, RequirementState> = { MISSING: 'waiting', PENDING: 'review', ACCEPTED: 'accepted', REJECTED: 'rejected' };

/** Same tones as the requirement chips of the case page (components/portal/CaseDocuments.tsx). */
export const STATE_TONE: Record<RequirementState, BadgeTone> = { waiting: 'neutral', review: 'warning', accepted: 'success', rejected: 'danger' };

export const PROCESSING_TONE: Record<ProcessingInfo['tone'], BadgeTone> = { info: 'info', progress: 'warning', success: 'success', danger: 'danger' };

/** Order of the segments in the stacked bars / donut: done first, problems next, then what is still open. */
export const SEGMENT_ORDER: RequirementState[] = ['accepted', 'review', 'rejected', 'waiting'];

export interface Segment {
  state: RequirementState;
  count: number;
  /** Share 0–1 of the stage. */
  share: number;
}

export const segmentsOf = (c: StageCounts): Segment[] => {
  const n: Record<RequirementState, number> = { accepted: c.accepted, review: c.pending, rejected: c.rejected, waiting: c.missing };
  return SEGMENT_ORDER.filter((s) => n[s] > 0).map((state) => ({ state, count: n[state], share: c.total ? n[state] / c.total : 0 }));
};

/** Items sorted for the compact list: what needs the client first (rejected, missing), then in review, then accepted. */
export const sortForList = <T extends { status: ReqStatus; required: boolean }>(items: T[]) => {
  const rank: Record<ReqStatus, number> = { REJECTED: 0, MISSING: 1, PENDING: 2, ACCEPTED: 3 };
  return [...items].sort((a, b) => rank[a.status] - rank[b.status] || Number(b.required) - Number(a.required));
};
