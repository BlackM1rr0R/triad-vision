import type { CaseStatus, L10n } from '@/lib/types';

// GET /api/german/me · /api/admin/german/users/:id (server/src/lib/german/service.ts germanOverview)

export const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type Cefr = (typeof CEFR)[number];
/** User.germanLevel values ('none' is shown as A0). */
export const PROFILE_LEVELS = ['none', ...CEFR] as const;
export const PROVIDERS = ['GOETHE', 'TELC', 'OESD', 'TESTDAF', 'OTHER'] as const;
export type Provider = (typeof PROVIDERS)[number];
export const MODULES = ['LESEN', 'HOEREN', 'SCHREIBEN', 'SPRECHEN'] as const;
export type ExamModule = (typeof MODULES)[number];
export const COURSE_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export const EXAM_STATUSES = ['PLANNED', 'REGISTERED', 'TAKEN', 'PASSED', 'FAILED', 'CANCELLED'] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

export interface GermanCourse {
  id: string;
  school: string;
  level: Cefr;
  startsAt: string | null;
  endsAt: string | null;
  schedule: string | null;
  format: 'online' | 'offline' | 'hybrid' | null;
  status: (typeof COURSE_STATUSES)[number];
  catalogCourseId: string | null;
  notes: string | null;
  createdById: string | null;
}

export interface ModuleResult {
  score: number | null;
  max: number | null;
  passed: boolean | null;
}

export interface GermanExam {
  id: string;
  provider: Provider;
  level: Cefr;
  examDateId: string | null;
  examDate: string | null;
  location: string | null;
  registrationDeadline: string | null;
  registeredAt: string | null;
  status: ExamStatus;
  results: Partial<Record<ExamModule, ModuleResult>>;
  passed: boolean | null;
  certificateDocumentId: string | null;
  notes: string | null;
}

export interface GermanExamDate {
  id: string;
  provider: Provider;
  level: Cefr | null;
  city: string;
  location: string | null;
  examDate: string;
  registrationDeadline: string | null;
  link: string | null;
  notes: string | null;
  published: boolean;
  candidates?: number;
}

export interface TimelineItem {
  kind: 'course-start' | 'course-end' | 'deadline' | 'exam' | 'certificate';
  date: string;
  refId: string;
  title: string;
  status: string;
  level: string | null;
}

export interface GermanOverview {
  user: { id: string; firstName: string; lastName: string };
  level: string;
  levels: string[];
  requiredLevel: string | null;
  meetsRequirement: boolean | null;
  plan: { targetLevel: Cefr | null; targetDate: string | null; notes: string | null; updatedAt: string } | null;
  progress: { current: string; target: string; percent: number };
  case: { id: string; number: string; status: CaseStatus; visaCategory: { id: string; title: L10n; visaLabel: string; germanLevel: string | null } | null } | null;
  courses: GermanCourse[];
  exams: GermanExam[];
  examDates: GermanExamDate[];
  certificates: { id: string; caseId: string; originalName: string; status: 'PENDING' | 'ACCEPTED' | 'REJECTED'; reviewNote: string | null; createdAt: string; stage: string }[];
  timeline: TimelineItem[];
}

export const levelLabel = (l: string | null | undefined) => (!l || l === 'none' ? 'A0' : l);
export const RANK: Record<string, number> = { none: 0, A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

/** YYYY-MM-DD of an ISO string (date inputs). */
export const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

// ─── Vocabulary trainer (server/src/lib/german/vocabService.ts) ───────

export const VOCAB_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
export const VOCAB_FIELDS = ['GENERAL', 'WORK', 'CARE', 'CONSTRUCTION', 'HOSPITALITY', 'DRIVING'] as const;
export type VocabField = (typeof VOCAB_FIELDS)[number];
/** SM-2 grades the answer buttons send. */
export const GRADES = { again: 1, hard: 3, good: 4, easy: 5 } as const;
export type GradeKey = keyof typeof GRADES;

export interface VocabGroup {
  key: string;
  total: number;
  started: number;
  learned: number;
}

export interface VocabSummary {
  profileLevel: string;
  recommendedLevel: string;
  streak: { current: number; best: number; practisedToday: boolean };
  today: { day: string; reviews: number; correct: number; newWords: number; goal: number; newLimit: number };
  due: number;
  total: number;
  started: number;
  learned: number;
  levels: VocabGroup[];
  fields: VocabGroup[];
  activity: { day: string; reviews: number; correct: number; newWords: number }[];
  totals: { reviews: number; correct: number; days: number };
  lastPracticeAt: string | null;
}

export interface VocabCard {
  id: string;
  de: string;
  article: string | null;
  plural: string | null;
  example: string | null;
  level: string;
  field: VocabField;
  translations: { az: string; ru: string; en: string };
  state: 'new' | 'review';
  repetitions: number;
  intervalDays: number;
  preview: Record<GradeKey, number>;
}

export interface VocabSession {
  cards: VocabCard[];
  dueTotal: number;
  newLeft: number;
}

export interface TestAttempt {
  id: string;
  estimated: string;
  correct: number;
  total: number;
  percent: number;
  createdAt: string;
}

export interface StaffPractice {
  vocab: VocabSummary;
  attempts: TestAttempt[];
}
