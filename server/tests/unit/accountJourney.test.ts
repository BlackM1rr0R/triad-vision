import { describe, expect, it } from 'vitest';
import { buildJourney } from '../../src/lib/account/nextStep.js';
import { travelWindow, type Forecast } from '../../src/lib/journey/forecast.js';

// Portal journey map (GET /api/account/next-step → journey): origin, destination, milestones, travel / arrival.

const NOW = new Date('2026-10-20T09:00:00Z');
const d = (s: string) => new Date(`${s}T09:00:00Z`);

const forecast = (over: Partial<Forecast> = {}): Forecast => ({
  status: 'EMBASSY_REVIEW',
  currentStep: 'EMBASSY',
  currentSince: d('2026-10-01'),
  estimatedDecision: { from: d('2026-11-10'), to: d('2026-12-01') },
  steps: [
    { key: 'DOCUMENTS', status: 'done', enteredAt: d('2026-08-01'), leftAt: d('2026-08-20'), expectedFrom: null, expectedTo: null, minDays: 7, maxDays: 21 },
    { key: 'CONTRACT', status: 'done', enteredAt: d('2026-08-20'), leftAt: d('2026-10-01'), expectedFrom: null, expectedTo: null, minDays: 7, maxDays: 30 },
    { key: 'EMBASSY', status: 'current', enteredAt: d('2026-10-01'), leftAt: null, expectedFrom: d('2026-10-25'), expectedTo: d('2026-11-05'), minDays: 14, maxDays: 30 },
    { key: 'DECISION', status: 'upcoming', enteredAt: null, leftAt: null, expectedFrom: d('2026-11-10'), expectedTo: d('2026-12-01'), minDays: 14, maxDays: 60 },
  ] as Forecast['steps'],
  ...over,
});

const caseOf = (over: Partial<Parameters<typeof buildJourney>[1]> = {}): Parameters<typeof buildJourney>[1] => ({
  status: 'EMBASSY_REVIEW',
  decisionAt: null,
  company: { city: 'München, Bayern' },
  vacancy: { city: 'Berlin' },
  ...over,
});

const travel = (over: Partial<Parameters<typeof buildJourney>[3]> = {}): Parameters<typeof buildJourney>[3] => ({
  flight: null,
  arrived: false,
  arrivedAt: null,
  travelPlanned: false,
  now: NOW,
  ...over,
});

describe('buildJourney', () => {
  it('maps origin, destination (company city first, without the state) and forecast steps as ISO dates', () => {
    const j = buildJourney({ city: 'Baku', nationality: 'AZ' }, caseOf(), forecast(), travel());
    expect(j.origin.country).toBe('AZ');
    expect(j.origin.lat).toEqual(expect.any(Number));
    expect(j.destination.city).toBe('München');
    expect(j.outcome).toBeNull();
    expect(j.steps.map((s) => [s.key, s.status])).toEqual([
      ['DOCUMENTS', 'done'],
      ['CONTRACT', 'done'],
      ['EMBASSY', 'current'],
      ['DECISION', 'upcoming'],
    ]);
    expect(j.steps[2].expectedFrom).toBe(d('2026-10-25').toISOString());
    expect(j.travel).toEqual({ at: null, planned: false, done: false, expectedFrom: null, expectedTo: null });
    expect(j.appointment).toBeNull();
    expect(j.arrival).toEqual({ at: null, done: false });
  });

  it('falls back to the vacancy city, and to an unknown origin without coordinates', () => {
    const j = buildJourney({ city: null, nationality: null }, caseOf({ company: null }), null, travel());
    expect(j.destination.city).toBe('Berlin');
    expect(j.origin).toEqual({ country: null, city: null, lat: null, lng: null, exact: false });
    expect(j.steps).toEqual([]);
  });

  it('marks the outcome, the decision date and a past flight as travelled', () => {
    const j = buildJourney(
      { city: 'Baku', nationality: 'AZ' },
      caseOf({ status: 'APPROVED', decisionAt: d('2026-10-10') }),
      forecast({ status: 'APPROVED' }),
      travel({ flight: d('2026-10-18'), travelPlanned: true }),
    );
    expect(j.outcome).toBe('APPROVED');
    expect(j.decisionAt).toBe(d('2026-10-10').toISOString());
    expect(j.travel).toMatchObject({ at: d('2026-10-18').toISOString(), planned: true, done: true });
    expect(j.arrival.done).toBe(false);
  });

  it('a future flight is planned, not done; arrival counts as travelled', () => {
    const planned = buildJourney({ city: 'Baku', nationality: 'AZ' }, caseOf({ status: 'APPROVED' }), null, travel({ flight: d('2026-11-01'), travelPlanned: true }));
    expect(planned.travel.done).toBe(false);
    const arrived = buildJourney({ city: 'Baku', nationality: 'AZ' }, caseOf({ status: 'APPROVED' }), null, travel({ arrived: true, arrivedAt: d('2026-10-19') }));
    expect(arrived.travel.done).toBe(true);
    expect(arrived.arrival).toEqual({ at: d('2026-10-19').toISOString(), done: true });
  });

  it('reports refused and cancelled applications', () => {
    expect(buildJourney({ city: null, nationality: 'AZ' }, caseOf({ status: 'REJECTED' }), null, travel()).outcome).toBe('REJECTED');
    expect(buildJourney({ city: null, nationality: 'AZ' }, caseOf({ status: 'CANCELLED' }), null, travel()).outcome).toBe('CANCELLED');
  });
  it('carries the booked embassy appointment and the expected travel window', () => {
    const j = buildJourney(
      { city: 'Baku', nationality: 'AZ' },
      caseOf({ status: 'APPOINTMENT_SCHEDULED', appointmentAt: d('2026-11-03'), appointmentPlace: 'VFS Baku' }),
      forecast(),
      travel({ travelExpected: { from: d('2026-11-24'), to: d('2027-01-12') } }),
    );
    expect(j.appointment).toEqual({ at: d('2026-11-03').toISOString(), place: 'VFS Baku' });
    expect(j.travel).toMatchObject({ expectedFrom: d('2026-11-24').toISOString(), expectedTo: d('2027-01-12').toISOString() });
  });
});

describe('travelWindow', () => {
  const range = { minDays: 14, maxDays: 42 };
  it('chains from the forecast decision window of an open case', () => {
    const w = travelWindow({ outcome: null, decisionAt: null, estimatedDecision: { from: d('2026-11-10'), to: d('2026-12-01') }, range, booked: false, now: NOW });
    expect(w).toEqual({ from: d('2026-11-24'), to: d('2027-01-12') });
  });

  it('counts from the decision of an approved case and never starts in the past', () => {
    const w = travelWindow({ outcome: 'APPROVED', decisionAt: d('2026-10-01'), estimatedDecision: null, range, booked: false, now: NOW });
    expect(w).toEqual({ from: NOW, to: d('2026-11-12') });
  });

  it('nothing once travel is booked, after a refusal, or when the window is over', () => {
    expect(travelWindow({ outcome: 'APPROVED', decisionAt: d('2026-10-01'), estimatedDecision: null, range, booked: true, now: NOW })).toBeNull();
    expect(travelWindow({ outcome: 'REJECTED', decisionAt: d('2026-10-01'), estimatedDecision: null, range, booked: false, now: NOW })).toBeNull();
    expect(travelWindow({ outcome: 'APPROVED', decisionAt: d('2026-01-01'), estimatedDecision: null, range, booked: false, now: NOW })).toBeNull();
    expect(travelWindow({ outcome: null, decisionAt: null, estimatedDecision: null, range, booked: false, now: NOW })).toBeNull();
  });
});
