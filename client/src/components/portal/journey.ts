/**
 * Client journey milestones (portal home + case view): pure mapping of the `journey` block of
 * GET /api/account/next-step (server: lib/account/nextStep.ts → buildJourney) to six milestones
 *   documents → (recognition) → contract → embassy → decision → travel → arrival
 * (recognition only for cases with a recognition procedure — the step does not apply to the others)
 * each done / current / upcoming (or skipped after a refusal / cancellation) with the date to show:
 * the real date of done steps, the booked Botschaft appointment, the booked flight, otherwise the
 * expected window (forecast steps; travel / arrival from the decision → arrival history).
 */

export type ForecastStepKey = 'DOCUMENTS' | 'CONTRACT' | 'EMBASSY' | 'APPOINTMENT' | 'DECISION';

export interface JourneyStep {
  key: ForecastStepKey;
  status: 'done' | 'current' | 'upcoming';
  enteredAt: string | null;
  leftAt: string | null;
  expectedFrom: string | null;
  expectedTo: string | null;
}

export interface JourneyData {
  origin: { country: 'AZ' | 'TR' | 'UA' | null; city: string | null; lat: number | null; lng: number | null; exact: boolean };
  destination: { city: string | null };
  outcome: 'APPROVED' | 'REJECTED' | 'CANCELLED' | null;
  decisionAt: string | null;
  steps: JourneyStep[];
  /** The booked Botschaft appointment (older servers: absent). */
  appointment?: { at: string | null; place: string | null } | null;
  travel: { at: string | null; planned: boolean; done: boolean; expectedFrom?: string | null; expectedTo?: string | null };
  arrival: { at: string | null; done: boolean };
  /** Recognition procedure of the qualification (Anerkennung); null / absent = the step does not apply. */
  recognition?: {
    status: 'done' | 'current';
    outcome: 'RECOGNISED' | 'PARTIAL' | 'REJECTED' | null;
    startedAt: string | null;
    submittedAt: string | null;
    decisionAt: string | null;
  } | null;
}

export const MILESTONE_KEYS = ['documents', 'recognition', 'contract', 'embassy', 'decision', 'travel', 'arrival'] as const;
export type MilestoneKey = (typeof MILESTONE_KEYS)[number];
export type MilestoneStatus = 'done' | 'current' | 'upcoming' | 'skipped';

export interface Milestone {
  key: MilestoneKey;
  status: MilestoneStatus;
  /** done: the day it happened; planned: the booked day (flight); appointment: the booked Botschaft date and time. */
  date: string | null;
  /** Expected window (current / upcoming steps of the forecast). */
  from: string | null;
  to: string | null;
  dateKind: 'done' | 'expected' | 'planned' | 'appointment' | 'submitted' | null;
  /** Place of the booked appointment (embassy milestone). */
  place?: string | null;
  /** The decision was a refusal. */
  negative?: boolean;
}

type Part = Pick<Milestone, 'status' | 'date' | 'from' | 'to' | 'dateKind'>;

const fromStep = (s: JourneyStep | undefined): Part => {
  if (!s) return { status: 'upcoming', date: null, from: null, to: null, dateKind: null };
  if (s.status === 'done') return { status: 'done', date: s.leftAt, from: null, to: null, dateKind: s.leftAt ? 'done' : null };
  const window = s.expectedTo ? { from: s.expectedFrom, to: s.expectedTo, dateKind: 'expected' as const } : { from: null, to: null, dateKind: null };
  return { status: s.status, date: null, ...window };
};

/** Embassy documents + appointment read as one milestone. */
const embassyOf = (e: JourneyStep | undefined, a: JourneyStep | undefined): Part => {
  if (!e && !a) return fromStep(undefined);
  if (!e || !a) return fromStep(e ?? a);
  if (e.status === 'done' && a.status === 'done') {
    const date = a.leftAt ?? e.leftAt;
    return { status: 'done', date, from: null, to: null, dateKind: date ? 'done' : null };
  }
  const status = e.status === 'current' || a.status === 'current' ? 'current' : e.status === 'done' ? 'current' : 'upcoming';
  const from = e.status === 'done' ? a.expectedFrom : (e.expectedFrom ?? a.expectedFrom);
  const to = a.expectedTo ?? e.expectedTo;
  return { status, date: null, from: to ? from : null, to, dateKind: to ? 'expected' : null };
};

/** Pure: the six milestones of a journey. */
export const buildMilestones = (j: JourneyData): Milestone[] => {
  const step = (k: ForecastStepKey) => j.steps.find((s) => s.key === k);
  const stopped = j.outcome === 'REJECTED' || j.outcome === 'CANCELLED';

  const documents = fromStep(step('DOCUMENTS'));
  const contract = fromStep(step('CONTRACT'));
  let embassy: Part & { place?: string | null } = embassyOf(step('EMBASSY'), step('APPOINTMENT'));
  // A booked appointment replaces the estimate on the embassy milestone.
  if (embassy.status !== 'done' && !stopped && j.appointment?.at) {
    embassy = { ...embassy, date: j.appointment.at, from: null, to: null, dateKind: 'appointment', place: j.appointment.place };
  }
  let decision: Part = fromStep(step('DECISION'));
  if (j.outcome === 'APPROVED' || j.outcome === 'REJECTED') {
    const date = j.decisionAt ?? step('DECISION')?.leftAt ?? null;
    decision = { status: 'done', date, from: null, to: null, dateKind: date ? 'done' : null };
  }

  let travel: Part;
  let arrival: Part;
  if (stopped) {
    travel = { status: 'skipped', date: null, from: null, to: null, dateKind: null };
    arrival = { status: 'skipped', date: null, from: null, to: null, dateKind: null };
  } else {
    // Booked flight first, else the expected window (nothing booked yet).
    const planned: Pick<Part, 'date' | 'from' | 'to' | 'dateKind'> = j.travel.at
      ? { date: j.travel.at, from: null, to: null, dateKind: 'planned' }
      : j.travel.expectedTo
        ? { date: null, from: j.travel.expectedFrom ?? null, to: j.travel.expectedTo, dateKind: 'expected' }
        : { date: null, from: null, to: null, dateKind: null };
    if (j.travel.done) travel = { status: 'done', date: j.travel.at, from: null, to: null, dateKind: j.travel.at ? 'done' : null };
    else travel = { status: j.outcome === 'APPROVED' ? 'current' : 'upcoming', ...planned };
    if (j.arrival.done) arrival = { status: 'done', date: j.arrival.at ?? j.travel.at, from: null, to: null, dateKind: (j.arrival.at ?? j.travel.at) ? 'done' : null };
    else arrival = { status: j.travel.done ? 'current' : 'upcoming', ...planned };
  }

  // Recognition: only when the case has a procedure. A decided case drops a still-running one (no longer its step).
  const r = j.recognition;
  const recognition: Milestone | null =
    !r || (r.status !== 'done' && j.outcome)
      ? null
      : r.status === 'done'
        ? { key: 'recognition', status: 'done', date: r.decisionAt, from: null, to: null, dateKind: r.decisionAt ? 'done' : null, negative: r.outcome === 'REJECTED' || undefined }
        : { key: 'recognition', status: 'current', date: r.submittedAt, from: null, to: null, dateKind: r.submittedAt ? 'submitted' : null };

  const list: Milestone[] = [
    { key: 'documents', ...documents },
    ...(recognition ? [recognition] : []),
    { key: 'contract', ...contract },
    { key: 'embassy', ...embassy },
    { key: 'decision', ...decision, negative: j.outcome === 'REJECTED' || undefined },
    { key: 'travel', ...travel },
    { key: 'arrival', ...arrival },
  ];
  // A cancelled case: nothing is "current" or still to come any more.
  if (j.outcome === 'CANCELLED') return list.map((m) => (m.status === 'done' ? m : { ...m, status: 'skipped', from: null, to: null, dateKind: null }));
  // Never more than one "current" milestone (the first one wins).
  let seen = false;
  return list.map((m) => {
    if (m.status !== 'current') return m;
    if (seen) return { ...m, status: 'upcoming' };
    seen = true;
    return m;
  });
};

/** Position (0..1 of the route length) of each of the six usual milestones: home city at 0, German city at 1. */
export const MILESTONE_POSITIONS = [0.1, 0.26, 0.42, 0.58, 0.76, 0.92] as const;

/** Positions for `n` milestones (six: MILESTONE_POSITIONS; seven with recognition: spread evenly over the same span). */
export const milestonePositions = (n: number): number[] => {
  if (n === MILESTONE_POSITIONS.length) return [...MILESTONE_POSITIONS];
  if (n <= 1) return [0.5];
  return Array.from({ length: n }, (_, i) => Math.round((0.1 + (0.82 * i) / (n - 1)) * 1000) / 1000);
};

/** How far along the route the client is: the current milestone, else the last done one (1 = arrived). */
export const routeProgress = (ms: Milestone[]): number => {
  if (ms.length && ms.every((m) => m.status === 'done')) return 1;
  const pos = milestonePositions(ms.length);
  const cur = ms.findIndex((m) => m.status === 'current');
  if (cur >= 0) return pos[cur];
  let last = -1;
  ms.forEach((m, i) => {
    if (m.status === 'done') last = i;
  });
  return last >= 0 ? pos[last] : 0;
};

/** The step after the current one that still lies ahead (for "Next: …"); null when nothing is ahead. */
export const nextMilestone = (ms: Milestone[]): Milestone | null => {
  const cur = ms.findIndex((m) => m.status === 'current');
  if (cur < 0) return null;
  return ms.slice(cur + 1).find((m) => m.status === 'upcoming') ?? null;
};
