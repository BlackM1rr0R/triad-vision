import { toast } from 'sonner';
import i18n from '@/i18n';
import { errorCode } from '@/lib/api';
import type { L10n } from '@/lib/types';
import type { Match } from '@/components/jobs/types';
import { TONE_CLASS } from '@/components/ui/status';

/**
 * Placement & employer collaboration (server: lib/placement, routes/admin/placement.ts, routes/candidateShare.ts,
 * routes/introVideo.ts, the evaluation routes of routes/interviews.ts). Copy: i18n/pagesPlacement.ts (`placement.*`).
 */

export const RECOGNITION_STATUSES = ['NONE', 'NOT_REQUIRED', 'IN_PROGRESS', 'PARTIAL', 'RECOGNISED'] as const;
export type RecognitionStatus = (typeof RECOGNITION_STATUSES)[number];

/** Mirrors MATCH_WEIGHTS in server/src/lib/matching.ts. */
export const MATCH_WEIGHTS = { profession: 32, german: 22, experience: 14, licence: 13, visa: 9, recognition: 10 } as const;

export const placementError = (err: unknown) => {
  const code = errorCode(err);
  const key = `placement.errors.${code}`;
  return i18n.exists(key) ? String(i18n.t(key)) : String(i18n.t('placement.errors.default'));
};
export const toastPlacementError = (err: unknown) => toast.error(placementError(err));

// ─── Share links ────────────────────────────────────────────────────────

export type ShareDecision = 'INTERESTED' | 'REJECTED';

export interface ShareLinkRow {
  id: string;
  status: 'active' | 'expired' | 'revoked';
  applicationId: string | null;
  company: { id: string; name: string } | null;
  vacancy: { id: string; title: L10n } | null;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  decision: ShareDecision | null;
  decisionNote: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
}

export interface PublicShare {
  candidate: { name: string; profession: string | null; experienceYears: number | null; germanLevel: string | null; education: string | null; drivingLicence: string | null; city: string | null; recognitionStatus: string | null };
  company: { name: string } | null;
  vacancy: { title: L10n; city: string | null; profession: string | null } | null;
  match: Match | null;
  documents: { total: number; approved: number; inReview: number; missing: number; items: { id: string; title: L10n; stage: string; state: 'approved' | 'inReview' | 'missing' }[] } | null;
  cv: { available: boolean };
  video: { available: boolean; mimeType?: string; size?: number };
  expiresAt: string;
  decision: { decision: ShareDecision; note: string | null; decidedAt: string; decidedByName: string } | null;
}

// ─── Evaluations ────────────────────────────────────────────────────────

export const EVAL_CRITERIA = ['german', 'skills', 'experience', 'motivation', 'communication'] as const;
export type EvalCriterion = (typeof EVAL_CRITERIA)[number];
export type Recommendation = 'HIRE' | 'MAYBE' | 'NO';

export interface Evaluation {
  id: string;
  interviewId: string;
  candidateId: string;
  authorKind: 'EMPLOYER' | 'STAFF';
  authorId: string | null;
  authorName: string | null;
  overall: number;
  scores: Record<EvalCriterion, number | null>;
  recommendation: Recommendation;
  strengths: string | null;
  concerns: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationSummary {
  count: number;
  overall: number | null;
  scores: Record<EvalCriterion, number | null>;
  recommendations: Record<Recommendation, number>;
}

export interface InterviewEvaluations {
  items: Evaluation[];
  summary: EvaluationSummary;
  canEvaluate: boolean;
  mineId: string | null;
}

export interface CandidateEvaluationList {
  items: (Evaluation & { interview: { id: string; startsAt: string; status: string; company: { id: string; name: string } | null; vacancy: { id: string; title: L10n } | null } | null })[];
  summary: EvaluationSummary;
  byAuthor: Record<'EMPLOYER' | 'STAFF', EvaluationSummary>;
}

export const REC_TONE: Record<Recommendation, string> = { HIRE: TONE_CLASS.success, MAYBE: TONE_CLASS.warning, NO: TONE_CLASS.danger };

// ─── Employment contract ───────────────────────────────────────────────

export const CONTRACT_TYPES = ['UNLIMITED', 'FIXED', 'AUSBILDUNG'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export type BlueCardCheck = 'OK' | 'SHORTAGE_OK' | 'BELOW' | 'NOT_APPLICABLE';

export interface ContractWarning {
  code: string;
  severity: 'BLOCKER' | 'WARNING';
  params: Record<string, number | string>;
  message: string;
}

export interface EmploymentContract {
  id: string;
  caseId: string;
  companyId: string | null;
  employerName: string | null;
  jobTitle: string | null;
  contractType: ContractType;
  grossMonthly: number | null;
  grossYearly: number | null;
  weeklyHours: number | null;
  vacationDays: number | null;
  startDate: string | null;
  endDate: string | null;
  probationMonths: number | null;
  probationEndsAt: string | null;
  signedAt: string | null;
  driveNodeId: string | null;
  blueCardCheck: BlueCardCheck | null;
  warnings: ContractWarning[];
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export const BLUE_CARD_TONE: Record<BlueCardCheck, string> = { OK: TONE_CLASS.success, SHORTAGE_OK: TONE_CLASS.warning, BELOW: TONE_CLASS.danger, NOT_APPLICABLE: TONE_CLASS.neutral };

/** Translated contract warning from its code and parameters (numbers formatted for the UI language). */
export const contractWarningText = (w: ContractWarning) => {
  const nf = new Intl.NumberFormat(i18n.language === 'az' ? 'az-Latn-AZ' : i18n.language, { maximumFractionDigits: 2 });
  const params = Object.fromEntries(Object.entries(w.params).map(([k, v]) => [k, typeof v === 'number' && k !== 'year' ? nf.format(v) : String(v)]));
  const key = `placement.contract.warning.${w.code}`;
  return i18n.exists(key) ? String(i18n.t(key, params)) : w.message;
};

/** "2026-03-01" for date inputs (the server stores UTC midnight). */
export const dateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
