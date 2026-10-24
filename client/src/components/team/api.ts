import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Role } from '@/lib/types';

/** Shapes and hooks of the team features: staff KPI, training, shift calendar, handover notes. */

// ─── KPI (/api/admin/kpi) ───────────────────────────────────────────────

export const STAGES = ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING'] as const;
export type Stage = (typeof STAGES)[number];

export interface KpiMetrics {
  closed: number;
  approved: number;
  rejected: number;
  cancelled: number;
  assigned: number;
  avgCaseDays: number | null;
  stageDays: Partial<Record<Stage, number>>;
  docsReviewed: number;
  docsAccepted: number;
  docsRejected: number;
  avgFirstResponseHours: number | null;
  responses: number;
  csat: number | null;
  nps: number | null;
  surveys: number;
  revenueCents: number;
  marginCents: number;
  minutes: number;
  tasksDone: number;
  tasksOverdue: number;
  approvalsGiven: number;
}
export type NumericKey = Exclude<keyof KpiMetrics, 'stageDays' | 'docsAccepted' | 'docsRejected'>;
export type Delta = { diff: number | null; pct: number | null };
export interface KpiStaff {
  id: string;
  name: string;
  role: Role;
  isActive: boolean;
}
export interface StaffKpiCard {
  staff: KpiStaff;
  month: string;
  months: string[];
  current: KpiMetrics;
  previous: KpiMetrics;
  deltas: Record<NumericKey, Delta>;
  series: (KpiMetrics & { month: string })[];
  team: { size: number; average: KpiMetrics };
}
export interface TeamKpi {
  month: string;
  months: string[];
  rows: { staff: KpiStaff; current: KpiMetrics; previous: KpiMetrics; deltas: Record<NumericKey, Delta>; series: (KpiMetrics & { month: string })[] }[];
  team: { size: number; average: KpiMetrics; previous: KpiMetrics };
}

/** Current Baku month "YYYY-MM". */
export const bakuMonth = (d = new Date()) => new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 7);
export const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export const useStaffKpi = (staffId: string | 'me', month: string, enabled = true) =>
  useQuery({
    queryKey: ['kpi', 'staff', staffId, month],
    queryFn: async () => (await api.get<StaffKpiCard>(staffId === 'me' ? '/admin/kpi/me' : `/admin/kpi/staff/${staffId}`, { params: { month } })).data,
    enabled,
    staleTime: 60_000,
  });

export const useTeamKpi = (month: string) =>
  useQuery({ queryKey: ['kpi', 'team', month], queryFn: async () => (await api.get<TeamKpi>('/admin/kpi/team', { params: { month } })).data, staleTime: 60_000 });

// ─── Training (/api/admin/training) ─────────────────────────────────────

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
}
export interface CourseBase {
  id: string;
  title: string;
  description: string | null;
  roles: Role[] | null;
  required: boolean;
  sortOrder: number;
  published: boolean;
  updatedAt: string;
}
export interface CourseProgress {
  lessons: number;
  completed: number;
  percent: number;
  complete: boolean;
  completedAt: string | null;
  avgScore: number | null;
}
export interface LearnCourse extends CourseBase {
  progress: CourseProgress;
  lessons: { id: string; title: string; minutes: number | null; hasQuiz: boolean; hasVideo: boolean; completedAt: string | null; quizScore: number | null }[];
}
export interface LearnLesson {
  course: { id: string; title: string; required: boolean };
  lesson: {
    id: string;
    title: string;
    body: string | null;
    minutes: number | null;
    video: { kind: 'youtube' | 'vimeo' | 'file'; src: string } | null;
    driveNodeId: string | null;
    quiz: { q: string; options: string[] }[];
    passScore: number;
  };
  progress: { completedAt: string | null; quizScore: number | null; attempts: number } | null;
  prev: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
  position: number;
  total: number;
}
export interface QuizResult {
  score: number;
  passed: boolean;
  passScore: number;
  correct: boolean[];
  attempts: number;
  completedAt: string | null;
}
export interface AdminLesson {
  id: string;
  courseId: string;
  title: string;
  body: string | null;
  videoUrl: string | null;
  driveNodeId: string | null;
  minutes: number | null;
  sortOrder: number;
  quiz: QuizQuestion[];
  passScore: number;
  updatedAt: string;
}
export interface ProgressMatrix {
  courses: (CourseBase & { lessons: number })[];
  rows: { user: { id: string; firstName: string; lastName: string; role: Role }; cells: Record<string, CourseProgress & { applies: boolean; attempts: number }> }[];
}

export const useLearnCourses = (enabled = true) =>
  useQuery({ queryKey: ['training', 'learn'], queryFn: async () => (await api.get<{ courses: LearnCourse[] }>('/admin/training/learn')).data.courses, enabled });

export const usePendingTraining = (enabled = true) =>
  useQuery({
    queryKey: ['training', 'pending'],
    queryFn: async () => (await api.get<{ count: number; courses: { id: string; title: string; percent: number }[] }>('/admin/training/learn/pending')).data,
    enabled,
    staleTime: 5 * 60_000,
  });

export const useTrainingInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['training'] });
};

// ─── Shift calendar (/api/admin/shifts) ─────────────────────────────────

export const SHIFT_KINDS = ['OFFICE', 'REMOTE', 'ON_CALL'] as const;
export type ShiftKind = (typeof SHIFT_KINDS)[number];
export interface Shift {
  id: string;
  userId: string;
  date: string;
  startMin: number;
  endMin: number;
  kind: ShiftKind;
  note: string | null;
}
export interface CoverageConfig {
  requireOffice: boolean;
  requireOnCall: boolean;
  weekdays: number[];
}
export interface CalendarData {
  from: string;
  to: string;
  days: string[];
  people: { id: string; firstName: string; lastName: string; role: Role }[];
  shifts: Shift[];
  leave: { id: string; userId: string; type: 'VACATION' | 'SICK' | 'REMOTE' | 'OTHER'; status: 'APPROVED' | 'PENDING'; startsAt: string; endsAt: string; note: string | null }[];
  handovers: { originalStaffId: string; substituteId: string; cases: number; active: number; startedAt: string; until: string | null; leaveId: string | null }[];
  coverage: { day: string; office: number; remote: number; onCall: number; checked: boolean; warnings: ('NO_OFFICE' | 'NO_ON_CALL')[] }[];
  config: CoverageConfig;
}

export const useShiftCalendar = (from: string, to: string) =>
  useQuery({ queryKey: ['shifts', from, to], queryFn: async () => (await api.get<CalendarData>('/admin/shifts/calendar', { params: { from, to } })).data });

const pad = (n: number) => String(n).padStart(2, '0');
export const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
export const parseHhmm = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
/** Calendar-day helpers ("YYYY-MM-DD", UTC based so a day never shifts). */
export const dayDate = (key: string) => new Date(`${key}T00:00:00Z`);
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (key: string, n: number) => dayKey(new Date(dayDate(key).getTime() + n * 86400_000));
export const weekdayOf = (key: string) => ((dayDate(key).getUTCDay() + 6) % 7) + 1;
export const mondayOf = (key: string) => addDays(key, 1 - weekdayOf(key));
export const todayKey = () => bakuDay();
export const bakuDay = (d = new Date()) => new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 10);

// ─── Handover notes (/api/admin/handover-notes) ─────────────────────────

export interface ChecklistItem {
  text: string;
  done: boolean;
  doneAt?: string | null;
  doneById?: string | null;
}
export interface HandoverChanges {
  events: number;
  messages: number;
  docsReviewed: number;
  statusChanges: { from: string; to: string; at: string }[];
  recent: { id: string; type: string; note: string | null; at: string; actor: string | null; fromStatus: string | null; toStatus: string | null }[];
}
export interface Handover {
  id: string;
  caseId: string;
  caseNumber: string | null;
  caseStatus: string | null;
  client: string | null;
  status: 'ACTIVE' | 'RETURNED' | 'KEPT';
  originalStaffId: string;
  originalName: string | null;
  substituteId: string;
  substituteName: string | null;
  leaveId: string | null;
  startedAt: string;
  plannedEndAt: string | null;
  endedAt: string | null;
  note: string | null;
  checklist: ChecklistItem[];
  open: number;
}
export interface MyHandovers {
  leaves: { id: string; type: string; status: string; startsAt: string; endsAt: string; hasDraft: boolean; notes: number }[];
  covering: Handover[];
  mineActive: Handover[];
  returned: (Handover & { changes: HandoverChanges })[];
}
export interface LeaveDraft {
  leave: { id: string; userId: string; type: string; status: string; startsAt: string; endsAt: string };
  general: { note: string | null; checklist: ChecklistItem[] };
  updatedAt: string | null;
  cases: { id: string; number: string; status: string; client: string | null; note: string | null; checklist: ChecklistItem[]; handover: Handover | null }[];
}
export interface CaseHandoverInfo {
  active: (Handover & { changes: HandoverChanges }) | null;
  returned: (Handover & { changes: HandoverChanges }) | null;
}

export const useMyHandovers = (enabled = true) =>
  useQuery({ queryKey: ['handover-notes', 'mine'], queryFn: async () => (await api.get<MyHandovers>('/admin/handover-notes/mine')).data, enabled });
