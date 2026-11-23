import { describe, expect, it } from 'vitest';
import { isWaitingStep, waitProgress, waitUnit } from './waiting';

const now = new Date('2026-06-30T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

describe('waitProgress', () => {
  it('week 3 of a 4-8 week wait', () => {
    const p = waitProgress(28, 56, ago(15), now)!;
    expect(p.unit).toBe('week');
    expect([p.min, p.max, p.elapsed]).toEqual([4, 8, 3]);
    expect(p.percent).toBe(27);
    expect(p.windowStart).toBe(50);
    expect(p.state).toBe('early');
  });
  it('within and over the usual time', () => {
    expect(waitProgress(28, 56, ago(40), now)!.state).toBe('within');
    expect(waitProgress(28, 56, ago(70), now)!.state).toBe('over');
    expect(waitProgress(28, 56, ago(70), now)!.percent).toBe(100);
  });
  it('short ranges read in days', () => {
    const p = waitProgress(3, 10, ago(4), now)!;
    expect([p.unit, p.min, p.max, p.elapsed]).toEqual(['day', 3, 10, 4]);
  });
  it('shows nothing without real figures', () => {
    expect(waitProgress(null, null, ago(3), now)).toBeNull();
    expect(waitProgress(10, 0, ago(3), now)).toBeNull();
    expect(waitProgress(10, 20, null, now)).toBeNull();
    expect(waitProgress(30, 20, ago(3), now)).toBeNull();
    expect(waitProgress(10, 20, 'nonsense', now)).toBeNull();
    expect(waitProgress(10, 20, ago(-2), now)).toBeNull();
  });
  it('unit rule and waiting steps', () => {
    expect(waitUnit(14, 28)).toBe('week');
    expect(waitUnit(10, 20)).toBe('day');
    expect(isWaitingStep('DECISION')).toBe(true);
    expect(isWaitingStep('DOCUMENTS')).toBe(false);
    expect(isWaitingStep(null)).toBe(false);
  });
});
