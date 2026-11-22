import type { CaseStatus, DocStatus, VisaType } from '@prisma/client';
import type { ForecastStep, StepKey } from '../journey/forecast.js';
import { PROCESSING_COPY, processingLabel, type L10n, type ProcessingStage } from './texts.js';

/**
 * "Sənədlərimin vəziyyəti" — the client's process overview (pure, unit-tested in tests/unit/docProgress.test.ts):
 *
 *   - the whole way in six steps (documents → contract → embassy documents → appointment → decision → result) with
 *     done / current / upcoming and their dates (taken from the journey forecast, lib/journey/forecast.ts),
 *     plus one overall percentage;
 *   - the documents per stage (INITIAL, EMBASSY) with counts per status: missing / uploaded (in review) /
 *     accepted / rejected, and the list of requirements with their status;
 *   - the team's document workflow of the case (lib/caseProcessing: Schon geschrieben / In Bearbeitung / Fertig /
 *     Ablehnung) as an informational label — the German word plus a translation — with nothing else of it (no staff
 *     names, no notes, no history);
 *   - "Səfirlik üçün sənədlərin toplanması": while the client waits for the work contract (contract step, or initial
 *     documents all accepted and in review), the embassy list is shown early. Since 2026-11 the case already has its
 *     EMBASSY requirement rows in that state and the client may upload them (lib/earlyEmbassy, lib/clientUploadTarget);
 *     the preview ("upload opens soon") is only left for a case whose rows could not be created yet.
 */

export const OVERVIEW_STEPS = ['documents', 'contract', 'embassyDocs', 'appointment', 'decision', 'result'] as const;
export type OverviewStepKey = (typeof OVERVIEW_STEPS)[number];
export type StepState = 'done' | 'current' | 'upcoming';

const FORECAST_TO_STEP: Record<StepKey, OverviewStepKey> = {
  DOCUMENTS: 'documents',
  CONTRACT: 'contract',
  EMBASSY: 'embassyDocs',
  APPOINTMENT: 'appointment',
  DECISION: 'decision',
};

export type ReqStatus = 'MISSING' | 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type OverviewDocStage = 'INITIAL' | 'EMBASSY';

export interface RequirementFact {
  id: string;
  stage: string;
  key: string | null;
  title: unknown;
  required: boolean;
  sortOrder?: number;
  documents: { status: DocStatus; createdAt: Date }[];
  /** The client may upload a file for it now (lib/clientUploadTarget, computed by the caller). */
  uploadable: boolean;
}

export interface OverviewInput {
  caseId: string;
  number: string;
  status: CaseStatus;
  visaType: VisaType;
  /** Steps of the journey forecast (dates of the steps). */
  steps: Pick<ForecastStep, 'key' | 'status' | 'enteredAt' | 'leftAt' | 'expectedFrom' | 'expectedTo'>[];
  /** When the case was closed (approved / refused / cancelled). */
  closedAt: Date | null;
  decisionAt: Date | null;
  requirements: RequirementFact[];
  /** The embassy list the case will get (templates), when it has no EMBASSY requirements yet. */
  embassyPreview: { key: string | null; title: unknown; required: boolean }[] | null;
  /** Team workflow of the case (Case.processingStage / processingStageAt). */
  processing: { stage: string | null; at: Date | null };
}

export interface StageCounts {
  total: number;
  missing: number;
  pending: number;
  accepted: number;
  rejected: number;
  /** Required ones, and how many of them are accepted. */
  required: number;
  requiredAccepted: number;
}

export interface OverviewItem {
  id: string | null;
  key: string | null;
  title: unknown;
  required: boolean;
  status: ReqStatus;
  /** Latest upload. */
  uploadedAt: Date | null;
  uploadable: boolean;
}

export interface OverviewDocStageView {
  stage: OverviewDocStage;
  /** The list is a preview of what will be asked (no requirement rows yet): every item is "missing", none uploadable. */
  preview: boolean;
  /** The client can upload to this stage now (at least one item). */
  uploadOpen: boolean;
  counts: StageCounts;
  items: OverviewItem[];
}

export interface ProcessingView {
  stage: ProcessingStage;
  word: string;
  label: L10n;
  meaning: L10n;
  explanation: L10n;
  tone: 'info' | 'progress' | 'success' | 'danger';
  at: Date | null;
}

export interface DocProgressOverview {
  caseId: string;
  number: string;
  status: CaseStatus;
  visaType: VisaType;
  /** 0–100; null for a cancelled case. */
  percent: number | null;
  steps: { key: OverviewStepKey; state: StepState; enteredAt: Date | null; leftAt: Date | null; expectedFrom: Date | null; expectedTo: Date | null }[];
  documents: OverviewDocStageView[];
  processing: ProcessingView | null;
  /** "Səfirlik üçün sənədlərin toplanması" card (null = not this stage). */
  embassyCollection: { uploadOpen: boolean; preview: boolean; counts: StageCounts; items: OverviewItem[] } | null;
}

const isStage = (v: unknown): v is ProcessingStage => typeof v === 'string' && Object.prototype.hasOwnProperty.call(PROCESSING_COPY, v);

const FINAL: CaseStatus[] = ['APPROVED', 'REJECTED', 'CANCELLED'];
const BEFORE_EMBASSY: CaseStatus[] = ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED'];

/** One requirement's status from its files: an accepted file wins, then one in review, then rejected ones. */
export const requirementStatus = (docs: { status: DocStatus }[]): ReqStatus => {
  if (!docs.length) return 'MISSING';
  if (docs.some((d) => d.status === 'ACCEPTED')) return 'ACCEPTED';
  if (docs.some((d) => d.status === 'PENDING')) return 'PENDING';
  return 'REJECTED';
};

export const countItems = (items: Pick<OverviewItem, 'status' | 'required'>[]): StageCounts => {
  const c: StageCounts = { total: items.length, missing: 0, pending: 0, accepted: 0, rejected: 0, required: 0, requiredAccepted: 0 };
  for (const i of items) {
    if (i.status === 'MISSING') c.missing++;
    else if (i.status === 'PENDING') c.pending++;
    else if (i.status === 'ACCEPTED') c.accepted++;
    else c.rejected++;
    if (i.required) {
      c.required++;
      if (i.status === 'ACCEPTED') c.requiredAccepted++;
    }
  }
  return c;
};

/** Share 0–1 of a document stage that is done: accepted 1, in review 0.6, rejected 0.2, missing 0 (required items only). */
export const stageShare = (items: Pick<OverviewItem, 'status' | 'required'>[]) => {
  const req = items.filter((i) => i.required);
  const list = req.length ? req : items;
  if (!list.length) return 0;
  const w: Record<ReqStatus, number> = { ACCEPTED: 1, PENDING: 0.6, REJECTED: 0.2, MISSING: 0 };
  return list.reduce((s, i) => s + w[i.status], 0) / list.length;
};

/**
 * The client waits for the work contract: the contract step (sent / signed, waiting for the team), or all required
 * initial documents are accepted while the team still reviews (the contract comes next).
 */
export const waitingForContract = (status: CaseStatus, initial: Pick<OverviewItem, 'status' | 'required'>[]) => {
  if (status === 'CONTRACT_SENT' || status === 'CONTRACT_SIGNED') return true;
  if (status !== 'DOCUMENTS_REVIEW') return false;
  const req = initial.filter((i) => i.required);
  return req.length > 0 && req.every((i) => i.status === 'ACCEPTED');
};

/** Visible team stage: an approved visa hides "Ablehnung"; a refused case (CaseStatus REJECTED) shows it. */
export const visibleProcessingStage = (status: CaseStatus, stored: string | null): ProcessingStage | null => {
  if (status === 'REJECTED') return 'REFUSED';
  if (!isStage(stored)) return null;
  if (stored === 'REFUSED' && status === 'APPROVED') return null;
  return stored;
};

const toItem = (r: RequirementFact): OverviewItem => {
  const latest = r.documents.reduce<Date | null>((m, d) => (!m || d.createdAt > m ? d.createdAt : m), null);
  return { id: r.id, key: r.key, title: r.title, required: r.required, status: requirementStatus(r.documents), uploadedAt: latest, uploadable: r.uploadable };
};

export const buildOverview = (input: OverviewInput): DocProgressOverview => {
  const { status } = input;
  const final = FINAL.includes(status);
  const byStage = (stage: OverviewDocStage) =>
    input.requirements
      .filter((r) => r.stage === stage)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map(toItem);
  const initial = byStage('INITIAL');
  let embassy = byStage('EMBASSY');
  let embassyIsPreview = false;
  if (!embassy.length && input.embassyPreview?.length && BEFORE_EMBASSY.includes(status)) {
    embassyIsPreview = true;
    embassy = input.embassyPreview.map((p) => ({ id: null, key: p.key, title: p.title, required: p.required, status: 'MISSING' as const, uploadedAt: null, uploadable: false }));
  }

  const stageView = (stage: OverviewDocStage, items: OverviewItem[], preview: boolean): OverviewDocStageView => ({
    stage,
    preview,
    uploadOpen: items.some((i) => i.uploadable),
    counts: countItems(items),
    items,
  });
  const documents: OverviewDocStageView[] = [stageView('INITIAL', initial, false)];
  if (embassy.length) documents.push(stageView('EMBASSY', embassy, embassyIsPreview));

  // Steps: the five forecast steps + the result.
  const byKey = new Map(input.steps.map((s) => [FORECAST_TO_STEP[s.key], s]));
  const steps = OVERVIEW_STEPS.map((key) => {
    if (key === 'result') {
      const at = status === 'CANCELLED' ? null : (input.decisionAt ?? input.closedAt);
      return { key, state: (status === 'APPROVED' || status === 'REJECTED' ? 'done' : 'upcoming') as StepState, enteredAt: final && status !== 'CANCELLED' ? at : null, leftAt: null, expectedFrom: null, expectedTo: null };
    }
    const s = byKey.get(key);
    const state: StepState = status === 'CANCELLED' ? (s?.leftAt ? 'done' : 'upcoming') : (s?.status ?? 'upcoming');
    return { key, state, enteredAt: s?.enteredAt ?? null, leftAt: s?.leftAt ?? null, expectedFrom: s?.expectedFrom ?? null, expectedTo: s?.expectedTo ?? null };
  });

  // One percentage: each of the six steps is a sixth; the current one counts by how far it got.
  let percent: number | null = null;
  if (status === 'APPROVED' || status === 'REJECTED') percent = 100;
  else if (status !== 'CANCELLED') {
    const done = steps.filter((s) => s.state === 'done').length;
    const current = steps.find((s) => s.state === 'current')?.key;
    let frac = 0;
    if (current === 'documents') frac = status === 'DOCUMENTS_REVIEW' ? 0.6 + 0.35 * stageShare(initial) : 0.1 + 0.5 * stageShare(initial);
    else if (current === 'embassyDocs') frac = status === 'EMBASSY_REVIEW' ? 0.6 + 0.35 * stageShare(embassy) : 0.1 + 0.5 * stageShare(embassy);
    else if (current === 'contract') frac = status === 'CONTRACT_SIGNED' ? 0.75 : 0.35;
    else if (current) frac = 0.5;
    percent = Math.max(0, Math.min(99, Math.round(((done + frac) / OVERVIEW_STEPS.length) * 100)));
  }

  const stage = visibleProcessingStage(status, input.processing.stage);
  const processing: ProcessingView | null = stage
    ? { stage, word: PROCESSING_COPY[stage].word, label: processingLabel(stage), meaning: PROCESSING_COPY[stage].meaning, explanation: PROCESSING_COPY[stage].explanation, tone: PROCESSING_COPY[stage].tone, at: input.processing.at }
    : null;

  const embassyCollection =
    waitingForContract(status, initial) && embassy.length
      ? { uploadOpen: embassy.some((i) => i.uploadable), preview: embassyIsPreview, counts: countItems(embassy), items: embassy }
      : null;

  return { caseId: input.caseId, number: input.number, status, visaType: input.visaType, percent, steps, documents, processing, embassyCollection };
};
