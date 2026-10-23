import type { CaseStatus, L10n } from '@/lib/types';

// ─── Forecast (GET /journey/cases/:id/forecast) ────────────────────────

export const FORECAST_STEPS = ['DOCUMENTS', 'CONTRACT', 'EMBASSY', 'APPOINTMENT', 'DECISION'] as const;
export type ForecastStepKey = (typeof FORECAST_STEPS)[number];
export type ForecastBasis = 'history' | 'default' | 'override';

export interface ForecastStep {
  key: ForecastStepKey;
  status: 'done' | 'current' | 'upcoming';
  minDays: number;
  maxDays: number;
  basedOn: ForecastBasis;
  sample: number;
  enteredAt: string | null;
  leftAt: string | null;
  expectedFrom: string | null;
  expectedTo: string | null;
}

export interface Forecast {
  status: CaseStatus;
  /** WORK | AUSBILDUNG | JOB_SEEKER | STUDY | FAMILY | TOURIST — names the contract step. */
  visaType?: string;
  currentStep: ForecastStepKey | null;
  currentSince: string | null;
  steps: ForecastStep[];
  estimatedDecision: { from: string; to: string } | null;
}

export type ForecastOverride = Partial<Record<ForecastStepKey, [number, number] | null>>;
export type ForecastRanges = Record<ForecastStepKey, { minDays: number; maxDays: number; basedOn: ForecastBasis; sample: number }>;

/** Unit a forecast step is entered in on the admin page (values are stored in days). */
export type ForecastUnit = 'day' | 'week';

export interface AdminForecastRow {
  id: string;
  slug: string;
  title: L10n;
  visaLabel: string;
  published: boolean;
  sortOrder: number;
  override: ForecastOverride | null;
  units: Partial<Record<ForecastStepKey, ForecastUnit>>;
  /** Cases and vacancies using the visa type (deleting is refused while > 0). */
  usage: { cases: number; vacancies: number };
  effective: ForecastRanges;
}

// ─── Onboarding ────────────────────────────────────────────────────────

export interface OnboardingItem {
  id: string;
  slug: string;
  icon: string;
  title: L10n;
  body: L10n;
  link: string | null;
  dueDays: number | null;
  sortOrder: number;
  published: boolean;
}

export interface OnboardingRow extends OnboardingItem {
  done: boolean;
  doneAt: string | null;
  note: string | null;
  dueAt: string | null;
}

export interface OnboardingProgress {
  done: number;
  total: number;
  percent: number;
}

export interface OnboardingResponse {
  case: { id: string; number: string; status: CaseStatus; decisionAt: string | null; visaValidFrom: string | null; visaValidTo: string | null } | null;
  baseDate: string | null;
  items: OnboardingRow[];
  progress: OnboardingProgress | null;
}

// ─── German ────────────────────────────────────────────────────────────

export type GermanLevel = 'A1' | 'A2' | 'B1' | 'B2';
export type EstimatedLevel = 'none' | GermanLevel;
export const GERMAN_LEVELS: GermanLevel[] = ['A1', 'A2', 'B1', 'B2'];

export interface GermanQuestion {
  id: string;
  level: GermanLevel;
  question: L10n;
  options: string[];
}

export interface GermanQuestionAdmin extends GermanQuestion {
  answer: number;
  sortOrder: number;
  published: boolean;
}

export interface GermanTestResult {
  levels: { level: GermanLevel; total: number; correct: number; percent: number; passed: boolean }[];
  estimated: EstimatedLevel;
  total: number;
  correct: number;
  percent: number;
}

export interface LanguageCourse {
  id: string;
  name: string;
  provider: string | null;
  city: string | null;
  url: string | null;
  levels: string | null;
  format: 'online' | 'offline' | 'hybrid' | null;
  description: L10n | null;
  sortOrder: number;
  published: boolean;
}

export type CertificateState = 'accepted' | 'pending' | 'rejected' | 'missing';

export interface GermanStatus {
  userLevel: string | null;
  requiredLevel: string | null;
  meetsRequirement: boolean | null;
  case: { id: string; number: string; status: CaseStatus; visaCategory: { id: string; title: L10n; visaLabel: string; germanLevel: string | null } | null } | null;
  certificate: { caseId: string; requirementId: string; stage: string; title: L10n; status: CertificateState; uploadedAt: string | null; link: string } | null;
}

// ─── Family ────────────────────────────────────────────────────────────

export type Relation = 'spouse' | 'child' | 'parent' | 'other';
export const RELATIONS: Relation[] = ['spouse', 'child', 'parent', 'other'];

export interface FamilyMemberInfo {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  email: string | null;
  relation: Relation;
}

export interface FamilyCase {
  id: string;
  number: string;
  profession: string;
  status: CaseStatus;
  relation: Relation | null;
  parentCaseId: string | null;
  createdAt: string;
  updatedAt: string;
  decisionAt: string | null;
  visaCategory: { id: string; slug: string; title: L10n; visaLabel: string } | null;
  assignedStaff: { id: string; firstName: string; lastName: string } | null;
  member: FamilyMemberInfo | null;
  step: number;
  stepCount: number;
  percent: number;
  documents: number;
}

export interface FamilyGroup {
  main: FamilyCase;
  members: FamilyCase[];
  aggregate: { total: number; approved: number; active: number; percent: number };
}
