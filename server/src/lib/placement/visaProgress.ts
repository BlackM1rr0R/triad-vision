import type { CaseStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { forecastForCase, travelRange, travelWindow } from '../journey/forecast.js';

/**
 * Visa progress shown to an employer (share page, company portal candidate list): the stage of the candidate's
 * case for THAT employer's vacancy, mapped to six human steps, the dates the steps were reached and an
 * approximate arrival window. Nothing else: no documents, notes, staff, ids or personal data. Cases that ended
 * without a visa (refused / cancelled) are not shown (null), like in the employer pipeline.
 */
export const PROGRESS_STEPS = ['documents', 'contract', 'embassy', 'appointment', 'decision', 'arrival'] as const;
export type ProgressStep = (typeof PROGRESS_STEPS)[number];

const STEP_OF: Record<CaseStatus, number | null> = {
  DOCUMENTS_PENDING: 0,
  DOCUMENTS_REVIEW: 0,
  CONTRACT_SENT: 1,
  CONTRACT_SIGNED: 1,
  EMBASSY_DOCUMENTS: 2,
  EMBASSY_REVIEW: 2,
  APPOINTMENT_SCHEDULED: 3,
  DECISION_PENDING: 4,
  APPROVED: 5, // visa granted: the remaining step is the journey / arrival
  REJECTED: null,
  CANCELLED: null,
};

/** Index (0..5) of the step a status belongs to, null for ended cases. */
export const stepIndexOf = (status: CaseStatus): number | null => STEP_OF[status];

export interface ProgressEvent {
  toStatus: CaseStatus | null;
  createdAt: Date;
}

export interface VisaProgress {
  steps: { key: ProgressStep; state: 'done' | 'current' | 'upcoming'; reachedAt: Date | null }[];
  currentStep: ProgressStep;
  /** Approximate window (from == to when a flight date is known and the label is "planned"). */
  arrival: { from: Date; to: Date; planned: boolean } | null;
  approximate: true;
}

/**
 * Pure: the six-step timeline from a case's status, its status events and the arrival date.
 * `reachedAt` of a step = first time the case entered one of its statuses (documents: the case start);
 * the arrival step is reached on the arrival day. A visa-granted case has every step up to "decision" done.
 */
export const buildProgress = (input: {
  status: CaseStatus;
  createdAt: Date;
  events: ProgressEvent[];
  arrivedAt: Date | null;
  arrival: { from: Date; to: Date; planned: boolean } | null;
}): VisaProgress | null => {
  const cur = stepIndexOf(input.status);
  if (cur === null) return null;
  const first = new Map<number, Date>();
  for (const e of [...input.events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const i = e.toStatus ? STEP_OF[e.toStatus] : null;
    if (i === null || i === undefined || first.has(i)) continue;
    first.set(i, e.createdAt);
  }
  if (!first.has(0)) first.set(0, input.createdAt);
  if (input.arrivedAt) first.set(5, input.arrivedAt);
  const arrived = !!input.arrivedAt;
  const steps = PROGRESS_STEPS.map((key, i) => {
    const state: VisaProgress['steps'][number]['state'] = i < cur || (i === cur && cur === 5 && arrived) ? 'done' : i === cur ? 'current' : 'upcoming';
    const reached = i <= cur ? (first.get(i) ?? null) : null;
    return { key, state, reachedAt: state === 'upcoming' ? null : reached };
  });
  return { steps, currentStep: PROGRESS_STEPS[cur]!, arrival: arrived ? null : input.arrival, approximate: true };
};

/** Progress of one case (the caller already checked that the viewer may see this case's employer). */
export const visaProgressForCase = async (caseId: string, now = new Date()): Promise<VisaProgress | null> => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      status: true,
      createdAt: true,
      decisionAt: true,
      events: { where: { toStatus: { not: null } }, select: { toStatus: true, createdAt: true }, orderBy: { createdAt: 'asc' }, take: 200 },
      arrivalFollowUp: { select: { arrivedAt: true } },
      arrivalPlan: { select: { flightDate: true, status: true } },
    },
  });
  if (!c || stepIndexOf(c.status) === null) return null;
  const arrivedAt = c.arrivalFollowUp?.arrivedAt ?? null;
  let arrival: VisaProgress['arrival'] = null;
  if (!arrivedAt) {
    const flight = c.arrivalPlan?.flightDate ?? null;
    if (flight && c.arrivalPlan?.status !== 'DRAFT' && c.arrivalPlan?.status !== 'CANCELLED') {
      arrival = { from: flight, to: flight, planned: true };
    } else {
      const [forecast, range] = await Promise.all([forecastForCase(caseId), travelRange()]);
      const w = travelWindow({
        outcome: c.status === 'APPROVED' ? 'APPROVED' : null,
        decisionAt: c.decisionAt,
        estimatedDecision: forecast.estimatedDecision,
        range,
        booked: false,
        now,
      });
      arrival = w ? { ...w, planned: false } : null;
    }
  }
  return buildProgress({ status: c.status, createdAt: c.createdAt, events: c.events, arrivedAt, arrival });
};

/** The newest live case of a candidate for the employer's vacancy (else, for a company-only link, for any of its vacancies). */
export const caseForEmployer = async (candidateId: string, scope: { vacancyId?: string | null; companyId?: string | null }) => {
  const where = scope.vacancyId
    ? { vacancyId: scope.vacancyId }
    : scope.companyId
      ? { OR: [{ companyId: scope.companyId }, { vacancy: { companyId: scope.companyId } }] }
      : null;
  if (!where) return null;
  return prisma.case.findFirst({ where: { clientId: candidateId, parentCaseId: null, ...where }, orderBy: { createdAt: 'desc' }, select: { id: true } });
};

export const visaProgressForEmployer = async (candidateId: string, scope: { vacancyId?: string | null; companyId?: string | null }) => {
  const c = await caseForEmployer(candidateId, scope);
  return c ? visaProgressForCase(c.id) : null;
};
