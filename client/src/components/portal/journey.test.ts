import { describe, expect, it } from 'vitest';
import { buildMilestones, milestonePositions, MILESTONE_POSITIONS, nextMilestone, routeProgress, type JourneyData } from './journey';

const step = (key: JourneyData['steps'][number]['key'], status: 'done' | 'current' | 'upcoming', over: Partial<JourneyData['steps'][number]> = {}) => ({
  key,
  status,
  enteredAt: null,
  leftAt: status === 'done' ? '2026-09-01T09:00:00.000Z' : null,
  expectedFrom: null,
  expectedTo: null,
  ...over,
});

const journey = (over: Partial<JourneyData> = {}): JourneyData => ({
  origin: { country: 'AZ', city: 'Baku', lat: 40.4, lng: 49.9, exact: true },
  destination: { city: 'München' },
  outcome: null,
  decisionAt: null,
  steps: [step('DOCUMENTS', 'done'), step('CONTRACT', 'current'), step('EMBASSY', 'upcoming'), step('APPOINTMENT', 'upcoming'), step('DECISION', 'upcoming', { expectedFrom: '2026-12-01T09:00:00.000Z', expectedTo: '2026-12-20T09:00:00.000Z' })],
  appointment: null,
  travel: { at: null, planned: false, done: false },
  arrival: { at: null, done: false },
  ...over,
});

describe('journey milestones', () => {
  it('six milestones without a recognition procedure (the step does not apply)', () => {
    const ms = buildMilestones(journey());
    expect(ms.map((m) => m.key)).toEqual(['documents', 'contract', 'embassy', 'decision', 'travel', 'arrival']);
    expect(milestonePositions(ms.length)).toEqual([...MILESTONE_POSITIONS]);
  });

  it('a running recognition is the current step right after the documents', () => {
    const ms = buildMilestones(journey({ recognition: { status: 'current', outcome: null, startedAt: null, submittedAt: '2026-09-10T09:00:00.000Z', decisionAt: null } }));
    expect(ms.map((m) => m.key)).toEqual(['documents', 'recognition', 'contract', 'embassy', 'decision', 'travel', 'arrival']);
    expect(ms[1]).toMatchObject({ status: 'current', dateKind: 'submitted', date: '2026-09-10T09:00:00.000Z' });
    // only one current step: the contract waits behind the recognition
    expect(ms.filter((m) => m.status === 'current').map((m) => m.key)).toEqual(['recognition']);
    expect(nextMilestone(ms)?.key).toBe('contract');
    const pos = milestonePositions(7);
    expect(pos).toHaveLength(7);
    expect(pos[0]).toBe(0.1);
    expect(pos[6]).toBe(0.92);
    expect(routeProgress(ms)).toBe(pos[1]);
  });

  it('a refused recognition is done and negative; a running one is dropped once the case is decided', () => {
    const refused = buildMilestones(journey({ recognition: { status: 'done', outcome: 'REJECTED', startedAt: null, submittedAt: null, decisionAt: '2026-09-20T09:00:00.000Z' } }));
    expect(refused[1]).toMatchObject({ key: 'recognition', status: 'done', negative: true, dateKind: 'done' });
    const approved = buildMilestones(journey({ outcome: 'APPROVED', recognition: { status: 'current', outcome: null, startedAt: null, submittedAt: null, decisionAt: null } }));
    expect(approved.some((m) => m.key === 'recognition')).toBe(false);
  });

  it('next milestone: the first upcoming one after the current step, none at the end', () => {
    const ms = buildMilestones(journey());
    expect(nextMilestone(ms)?.key).toBe('embassy');
    const allDone = [step('DOCUMENTS', 'done'), step('CONTRACT', 'done'), step('EMBASSY', 'done'), step('APPOINTMENT', 'done'), step('DECISION', 'done')];
    const arrived = buildMilestones(journey({ outcome: 'APPROVED', steps: allDone, travel: { at: '2026-10-01T09:00:00.000Z', planned: true, done: true }, arrival: { at: '2026-10-01T12:00:00.000Z', done: true } }));
    expect(nextMilestone(arrived)).toBeNull();
  });
});
