import { describe, expect, it } from 'vitest';
import { readinessPercent, roadmapSteps } from './quizReadiness';

describe('quiz readiness', () => {
  it('stays within 0-100 and rises with a better profile', () => {
    const low = readinessPercent({ german: 'none', experience: 'none', education: 'school' }, [{ score: 20, missing: [] }]);
    const high = readinessPercent({ german: 'B2', experience: '5p', education: 'university' }, [{ score: 90, missing: [] }]);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThanOrEqual(100);
    expect(high).toBeGreaterThan(low);
    expect(readinessPercent({}, [])).toBeLessThan(5);
  });
  it('builds 3-5 roadmap steps ending with registration', () => {
    const none = roadmapSteps([{ missing: [] }]);
    expect(none.map((s) => s.kind)).toEqual(['docs', 'consult', 'register']);
    const many = roadmapSteps([{ missing: [1, 2, 3, 4].map((n) => ({ code: `G${n}` })) }]);
    expect(many).toHaveLength(5);
    expect(many.at(-1)?.kind).toBe('register');
  });
});
