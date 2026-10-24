import type { CaseStatus, L10n } from '@/lib/types';
import type { EmployerAccelerated } from '@/components/recognition/api';

/** Shapes of /api/company/workers (lib/employerWorkers/panel.ts on the server). */

export type Stage = 'DOCUMENTS' | 'CONTRACT' | 'EMBASSY' | 'APPOINTMENT' | 'DECISION' | 'APPROVED' | 'ARRIVED' | 'REJECTED' | 'CANCELLED';
export type Phase = 'IN_PROCESS' | 'TRAVELLING' | 'WORKING' | 'LEFT' | 'CLOSED';
export const PHASES: Phase[] = ['IN_PROCESS', 'TRAVELLING', 'WORKING', 'LEFT', 'CLOSED'];
export type DateWarn = 'OK' | 'WARN' | 'CRITICAL' | 'EXPIRED';
export type CheckInState = 'OK' | 'ISSUE' | 'RESOLVED' | 'ANSWERED' | 'OVERDUE' | 'PENDING';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type NextAction = 'SIGN_DOCUMENT' | 'COMPLETE_FORM' | 'ACCELERATED_STEP' | 'ANSWER_CHECKIN' | 'PREPARE_ARRIVAL' | 'PROBATION_REVIEW' | 'CONFIRM_EMPLOYMENT' | 'TALK_TO_MANAGER' | 'NONE';
export type MilestoneCode = 'CONTRACT' | 'EMBASSY' | 'APPOINTMENT' | 'DECISION' | 'ARRIVAL' | 'PROBATION_END' | 'TITLE_EXPIRY' | 'CHECKIN';

export interface OpenItem {
  /** ACCELERATED: § 81a step of the employer; id = `<caseId>:<SIGN_AGREEMENT | PAY_FEE>`. */
  kind: 'SIGNATURE' | 'FORM' | 'CHECKIN' | 'ACCELERATED';
  id: string;
  title: string;
  link: string | null;
  since: string | null;
}

export interface WorkerRow {
  id: string;
  name: string;
  profession: string;
  position: string;
  visaType: string;
  status: CaseStatus;
  stage: Stage;
  phase: Phase;
  startedAt: string;
  appointmentAt: string | null;
  decisionAt: string | null;
  arrival: { status: string; flightDate: string | null; arrivalTime: string | null } | null;
  arrivedAt: string | null;
  leftAt: string | null;
  vacancy: { id: string; title: L10n } | null;
  visa: { title: L10n; visaLabel: string } | null;
  title: { kind: 'VISA' | 'RESIDENCE'; validUntil: string; warn: DateWarn; daysLeft: number } | null;
  probation: { endsAt: string; warn: DateWarn; daysLeft: number } | null;
  contractStart: string | null;
  checkIn: { employer: CheckInState | null; worker: CheckInState | null; overall: CheckInState | null; lastAt: string | null };
  risk: { level: RiskLevel; reasons: { code: string; params?: Record<string, number> }[] } | null;
  next: { code: MilestoneCode; at: string | null; from: string | null; to: string | null } | null;
  openItems: OpenItem[];
  nextAction: NextAction;
  manager: { name: string; email: string } | null;
}

export interface WorkersResponse {
  items: WorkerRow[];
  summary: {
    inProcess: number;
    approved: number;
    arrivingThisMonth: number;
    arrived: number;
    travelling: number;
    working: number;
    left: number;
    probationSoon: number;
    titlesExpiring: number;
    atRisk: number;
    openItems: number;
  };
}

export interface WorkerDetail {
  worker: WorkerRow;
  timeline: { code: string; at: string; params?: Record<string, string | number> }[];
  upcoming: { code: string; at: string; params?: Record<string, string | number> }[];
  documents: { kind: 'SIGNATURE' | 'FORM'; id: string; title: string; status: string; isContract: boolean; date: string | null; signLink: string | null; downloadable: boolean }[];
  checkIns: { id: string; audience: 'EMPLOYER' | 'WORKER'; offsetDays: number; dueAt: string; state: CheckInState | null; answeredAt: string | null; topics: string[]; comment: string | null; link: string | null }[];
  contact: { manager: { name: string; email: string } | null; office: { phone: string | null; email: string | null } };
  /** § 81a accelerated procedure (components/recognition/EmployerAcceleratedBlock), null when none runs. */
  accelerated?: EmployerAccelerated | null;
}

export const plannedArrival = (w: Pick<WorkerRow, 'arrival'>) => w.arrival?.arrivalTime ?? w.arrival?.flightDate ?? null;
