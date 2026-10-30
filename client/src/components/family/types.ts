import type { CaseStatus, L10n } from '@/lib/types';

// GET /api/family/cases/:id (server/src/lib/family/members.ts familyOverview)

export const FAMILY_RELATIONS = ['spouse', 'child', 'parent', 'other'] as const;
export type FamilyRelation = (typeof FAMILY_RELATIONS)[number];
export type JoinsWhen = 'WITH_MAIN' | 'LATER';
export type ChecklistState = 'accepted' | 'pending' | 'rejected' | 'missing';

export interface FamilyProfile {
  id: string;
  mainCaseId: string;
  memberCaseId: string;
  relation: FamilyRelation;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  birthPlace: string | null;
  sex: 'M' | 'F' | 'X' | null;
  nationality: string | null;
  passportNumber: string | null;
  passportIssuedAt: string | null;
  passportExpiresAt: string | null;
  email: string | null;
  joinsWhen: JoinsWhen;
  plannedEntryAt: string | null;
  germanExempt: boolean;
  germanExemptNote: string | null;
  notes: string | null;
  /** Reusable main-case documents copied into this member's case (lib/family/reunion.ts). */
  docsCopiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistDoc {
  id: string;
  originalName: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  reviewNote: string | null;
  createdAt: string;
  mimeType: string;
  size: number;
}

export interface ChecklistItem {
  id: string;
  key: string | null;
  stage: 'INITIAL' | 'EMBASSY' | string;
  title: L10n;
  description: L10n | null;
  required: boolean;
  state: ChecklistState;
  documents: ChecklistDoc[];
}

export interface FamilyMemberSummary {
  caseId: string;
  number: string;
  status: CaseStatus;
  relation: FamilyRelation;
  visaType: string;
  appointmentAt: string | null;
  decisionAt: string | null;
  updatedAt: string;
  step: number;
  stepCount: number;
  percent: number;
  final: boolean;
  removable: boolean;
  counts: { required: number; accepted: number; pending: number; rejected: number; missing: number };
  profile: FamilyProfile | null;
  checklist: ChecklistItem[];
}

export interface FamilyOverview {
  main: { id: string; number: string; status: CaseStatus; visaType: string; name: string };
  requestedCaseId: string;
  members: FamilyMemberSummary[];
  canAdd: boolean;
  aggregate: { total: number; approved: number; openItems: number; percent: number };
  /** Familiennachzug start (null on a member case's own lookup). */
  reunion: ReunionSummary | null;
  /** Title / flat / income vs. the family + step timeline (server/src/lib/family/readiness.ts); null without members. */
  readiness: FamilyReadiness | null;
}

// Familiennachzug readiness (server/src/lib/family/legal.ts)

export const SPONSOR_TITLES = ['BLUE_CARD', 'SKILLED', 'ICT', 'RESEARCH', 'AUSBILDUNG', 'STUDY', 'JOB_SEEKER', 'SETTLEMENT', 'OTHER'] as const;
export type SponsorTitle = (typeof SPONSOR_TITLES)[number];
export type CheckStatus = 'ok' | 'warn' | 'fail' | 'missing';
export type ReadinessStatus = 'READY' | 'ATTENTION' | 'INCOMPLETE' | 'BLOCKED';
export const TIMELINE_STEPS = ['family', 'worker', 'proof', 'documents', 'appointment', 'decision', 'entry'] as const;
export type TimelineStep = (typeof TIMELINE_STEPS)[number];

export interface ReunionInfo {
  sponsorTitle: SponsorTitle | null;
  titleIssuedAt: string | null;
  livingSpaceM2: number | null;
  warmRent: number | null;
  netMonthly: number | null;
  notes: string | null;
  updatedAt: string;
}

export interface ReadinessCheck {
  code: 'SPONSOR_TITLE' | 'LIVING_SPACE' | 'INCOME' | 'SPOUSE_AGE' | 'SPOUSE_LANGUAGE' | 'CHILD_AGE' | 'CHILD_LANGUAGE' | 'PARENT_ALLOWED' | 'OTHER_HARDSHIP';
  status: CheckStatus;
  memberCaseId: string | null;
  params: Record<string, number | string | boolean | null>;
}

export interface FamilyReadiness {
  info: ReunionInfo | null;
  /** Guesses used when a field is empty: title from the visa, issue day = visa decision, gross from the employment contract. */
  inferred: { sponsorTitle: SponsorTitle | null; titleIssuedAt: string | null; grossMonthly: number | null };
  status: ReadinessStatus;
  checks: ReadinessCheck[];
  livingSpace: { required: number; actual: number | null; persons: number };
  income: { need: number; available: number | null; estimated: boolean };
  /** "Rules as of" (YYYY-MM). */
  asOf: string;
  timeline: { key: TimelineStep; state: 'done' | 'current' | 'upcoming'; date: string | null }[];
}

export interface ReunionSummary {
  /** Main case approved or the main applicant arrived. */
  ready: boolean;
  startedAt: string | null;
  laterCount: number;
  /** Member cases the start would open now. */
  startable: string[];
  members: { caseId: string; joinsWhen: JoinsWhen; startedAt: string | null; docsCopiedAt: string | null }[];
}

/** Form state of a member (dates as YYYY-MM-DD, empty string = not set). */
export interface MemberForm {
  relation: FamilyRelation;
  firstName: string;
  lastName: string;
  birthDate: string;
  birthPlace: string;
  sex: '' | 'M' | 'F' | 'X';
  nationality: string;
  passportNumber: string;
  passportIssuedAt: string;
  passportExpiresAt: string;
  email: string;
  joinsWhen: JoinsWhen;
  plannedEntryAt: string;
  germanExempt: boolean;
  germanExemptNote: string;
  notes: string;
}

export const emptyMemberForm = (relation: FamilyRelation = 'spouse'): MemberForm => ({
  relation,
  firstName: '',
  lastName: '',
  birthDate: '',
  birthPlace: '',
  sex: '',
  nationality: '',
  passportNumber: '',
  passportIssuedAt: '',
  passportExpiresAt: '',
  email: '',
  joinsWhen: 'WITH_MAIN',
  plannedEntryAt: '',
  germanExempt: false,
  germanExemptNote: '',
  notes: '',
});

export const formFromProfile = (p: FamilyProfile): MemberForm => ({
  relation: p.relation,
  firstName: p.firstName,
  lastName: p.lastName,
  birthDate: p.birthDate ?? '',
  birthPlace: p.birthPlace ?? '',
  sex: p.sex ?? '',
  nationality: p.nationality ?? '',
  passportNumber: p.passportNumber ?? '',
  passportIssuedAt: p.passportIssuedAt ?? '',
  passportExpiresAt: p.passportExpiresAt ?? '',
  email: p.email ?? '',
  joinsWhen: p.joinsWhen,
  plannedEntryAt: p.plannedEntryAt ?? '',
  germanExempt: p.germanExempt,
  germanExemptNote: p.germanExemptNote ?? '',
  notes: p.notes ?? '',
});

/** Request body: empty strings → null; the email is sent as '' when cleared (server accepts it). */
export const bodyFromForm = (f: MemberForm) => ({
  relation: f.relation,
  firstName: f.firstName.trim(),
  lastName: f.lastName.trim(),
  birthDate: f.birthDate || null,
  birthPlace: f.birthPlace.trim() || null,
  sex: f.sex || null,
  nationality: f.nationality.trim() || null,
  passportNumber: f.passportNumber.trim() || null,
  passportIssuedAt: f.passportIssuedAt || null,
  passportExpiresAt: f.passportExpiresAt || null,
  email: f.email.trim(),
  joinsWhen: f.joinsWhen,
  plannedEntryAt: f.plannedEntryAt || null,
  germanExempt: f.germanExempt,
  germanExemptNote: f.germanExemptNote.trim() || null,
  notes: f.notes.trim() || null,
});

export const memberName = (m: FamilyMemberSummary) => (m.profile ? `${m.profile.firstName} ${m.profile.lastName}`.trim() : m.number);
