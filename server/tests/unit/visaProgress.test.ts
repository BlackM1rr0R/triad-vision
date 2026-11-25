import { describe, expect, it } from 'vitest';
import { buildProgress, stepIndexOf } from '../../src/lib/placement/visaProgress.js';

const d = (s: string) => new Date(`${s}T10:00:00Z`);

describe('employer visa progress: stage mapping', () => {
  it('maps every case status to one of six steps; ended cases to null', () => {
    expect(stepIndexOf('DOCUMENTS_PENDING')).toBe(0);
    expect(stepIndexOf('DOCUMENTS_REVIEW')).toBe(0);
    expect(stepIndexOf('CONTRACT_SENT')).toBe(1);
    expect(stepIndexOf('EMBASSY_REVIEW')).toBe(2);
    expect(stepIndexOf('APPOINTMENT_SCHEDULED')).toBe(3);
    expect(stepIndexOf('DECISION_PENDING')).toBe(4);
    expect(stepIndexOf('APPROVED')).toBe(5);
    expect(stepIndexOf('REJECTED')).toBeNull();
    expect(stepIndexOf('CANCELLED')).toBeNull();
  });

  it('builds done / current / upcoming with the first date of each reached step', () => {
    const p = buildProgress({
      status: 'EMBASSY_DOCUMENTS',
      createdAt: d('2026-01-01'),
      events: [
        { toStatus: 'DOCUMENTS_REVIEW', createdAt: d('2026-01-05') },
        { toStatus: 'CONTRACT_SENT', createdAt: d('2026-01-10') },
        { toStatus: 'CONTRACT_SIGNED', createdAt: d('2026-01-12') },
        { toStatus: 'EMBASSY_DOCUMENTS', createdAt: d('2026-01-15') },
      ],
      arrivedAt: null,
      arrival: { from: d('2026-03-01'), to: d('2026-03-20'), planned: false },
    })!;
    expect(p.steps.map((s) => s.state)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(p.steps[0]!.reachedAt).toEqual(d('2026-01-05'));
    expect(p.steps[1]!.reachedAt).toEqual(d('2026-01-10'));
    expect(p.steps[2]!.reachedAt).toEqual(d('2026-01-15'));
    expect(p.steps[3]!.reachedAt).toBeNull();
    expect(p.currentStep).toBe('embassy');
    expect(p.arrival?.planned).toBe(false);
    expect(p.approximate).toBe(true);
  });

  it('approved: steps up to the decision done, arrival current; arrived: everything done, no window', () => {
    const base = { status: 'APPROVED' as const, createdAt: d('2026-01-01'), events: [{ toStatus: 'APPROVED' as const, createdAt: d('2026-02-20') }] };
    const open = buildProgress({ ...base, arrivedAt: null, arrival: { from: d('2026-03-05'), to: d('2026-04-01'), planned: false } })!;
    expect(open.steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done', 'done', 'current']);
    expect(open.arrival).not.toBeNull();
    const done = buildProgress({ ...base, arrivedAt: d('2026-03-10'), arrival: { from: d('2026-03-05'), to: d('2026-04-01'), planned: false } })!;
    expect(done.steps.every((s) => s.state === 'done')).toBe(true);
    expect(done.steps[5]!.reachedAt).toEqual(d('2026-03-10'));
    expect(done.arrival).toBeNull();
  });

  it('rejected / cancelled cases show nothing', () => {
    expect(buildProgress({ status: 'REJECTED', createdAt: d('2026-01-01'), events: [], arrivedAt: null, arrival: null })).toBeNull();
  });
});
