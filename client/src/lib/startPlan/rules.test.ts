import { describe, expect, it } from 'vitest';
import { LEVELS, PROFESSIONS, WHO, buildPlan, needsLevel, needsProfession, parsePlanParams, planSearch, targetLevel, type PlanInput } from './rules';

// Paths of the public tools registry (components/audience/tools.ts) — kept as plain strings so the test does not
// pull lucide-react; registry.test.ts in lib/pageHelp checks the real TOOLS list.
const KNOWN = [
  '/path-finder', '/blue-card-check', '/anerkennung', '/family-reunification-check', '/visa-document-checklist', '/grade-converter',
  '/salary-calculator', '/cost-calculator', '/budget', '/rent-check', '/which-city', '/life-in-germany', '/shortage-barometer',
  '/driving-time-calculator', '/shift-pay-calculator', '/work-schedule-check', '/driving-licence-germany', '/traffic-signs',
  '/german-mock-exam', '/german-level-test-self', '/workplace-etiquette', '/chancenkarte-calculator',
  '/employer-cost-calculator', '/employer-guide-azerbaijan', '/kandidaten', '/novruz-card',
];

const allInputs = (): PlanInput[] => {
  const out: PlanInput[] = [];
  for (const who of WHO)
    for (const profession of needsProfession(who) ? PROFESSIONS : [null])
      for (const level of needsLevel(who) ? LEVELS : [null]) out.push({ who, profession, level });
  return out;
};

describe('start plan rules', () => {
  it('URL round trip', () => {
    for (const input of allInputs()) expect(parsePlanParams(new URLSearchParams(planSearch(input)))).toEqual(input);
    expect(planSearch({ who: 'worker', profession: 'cook', level: 'a2' })).toBe('?w=worker&p=cook&l=a2');
    expect(planSearch({ who: 'employer', profession: null, level: null })).toBe('?w=employer');
  });

  it('rejects incomplete or unknown answers', () => {
    expect(parsePlanParams(new URLSearchParams(''))).toBeNull();
    expect(parsePlanParams(new URLSearchParams('w=pirate'))).toBeNull();
    expect(parsePlanParams(new URLSearchParams('w=worker&l=a1'))).toBeNull();
    expect(parsePlanParams(new URLSearchParams('w=worker&p=cook'))).toBeNull();
    expect(parsePlanParams(new URLSearchParams('w=worker&p=astronaut&l=a1'))).toBeNull();
    // Answers that do not apply are ignored.
    expect(parsePlanParams(new URLSearchParams('w=student&p=cook&l=b1'))).toEqual({ who: 'student', profession: null, level: 'b1' });
    expect(parsePlanParams(new URLSearchParams('w=employer&l=b1'))).toEqual({ who: 'employer', profession: null, level: null });
  });

  it('every plan has 3–5 steps, five known tools and guides', () => {
    for (const input of allInputs()) {
      const plan = buildPlan(input, KNOWN);
      expect(plan.steps.length).toBeGreaterThanOrEqual(3);
      expect(plan.steps.length).toBeLessThanOrEqual(5);
      expect(plan.tools).toHaveLength(5);
      expect(new Set(plan.tools).size).toBe(5);
      plan.tools.forEach((t) => expect(KNOWN).toContain(t));
      expect(plan.guides.length).toBeGreaterThan(0);
      plan.steps.forEach((s) => expect(s.links.length).toBeGreaterThan(0));
    }
  });

  it('worker cook with A2: eligibility → German to B1 → documents → money → apply', () => {
    const plan = buildPlan({ who: 'worker', profession: 'cook', level: 'a2' }, KNOWN);
    expect(plan.steps.map((s) => s.id)).toEqual(['eligibility', 'germanLearn', 'documents', 'money', 'apply']);
    expect(plan.steps[0].links).toEqual(['/path-finder', '/anerkennung']);
    expect(plan.steps[1].target).toBe('B1');
    expect(plan.steps[2].links[0]).toBe('/visa-document-checklist?type=skilled');
    expect(plan.steps[4].links[0]).toBe('/for/cook');
    expect(plan.hub).toBe('cook');
    expect(plan.cta).toBe('register');
    expect(plan.guides[0]).toBe('anerkennung-koch');
  });

  it('German step depends on the level', () => {
    expect(buildPlan({ who: 'worker', profession: 'other', level: 'b2' }, KNOWN).steps[1]).toMatchObject({ id: 'germanProve', links: ['/german-mock-exam/b1', '/german-level-test-self'] });
    expect(buildPlan({ who: 'worker', profession: 'other', level: 'none' }, KNOWN).steps[1]).toMatchObject({ id: 'germanLearn', links: ['/german-level-test-self', '/german-mock-exam/a1'] });
    expect(buildPlan({ who: 'family', profession: 'other', level: 'a1' }, KNOWN).steps[1]).toMatchObject({ id: 'germanProve', target: 'A1' });
    expect(targetLevel({ who: 'worker', profession: 'nurse', level: 'b1' })).toBe('b2');
    expect(buildPlan({ who: 'worker', profession: 'nurse', level: 'b1' }, KNOWN).steps[2].links[0]).toBe('/visa-document-checklist?type=recognition');
  });

  it('other profession: no hub, Germany-wide jobs', () => {
    const plan = buildPlan({ who: 'worker', profession: 'other', level: 'a1' }, KNOWN);
    expect(plan.hub).toBeNull();
    expect(plan.steps[0].links).toEqual(['/path-finder', '/blue-card-check']);
    expect(plan.steps.at(-1)!.links[0]).toBe('/jobs');
  });

  it('student, family and Ausbildung paths', () => {
    expect(buildPlan({ who: 'student', profession: null, level: 'a1' }, KNOWN).steps.map((s) => s.links[0])).toEqual(['/study', '/german-level-test-self', '/visa-document-checklist?type=study', '/cost-calculator', '/register']);
    const fam = buildPlan({ who: 'family', profession: 'truck-driver', level: 'none' }, KNOWN);
    expect(fam.steps[0].id).toBe('familyCheck');
    expect(fam.steps[2].links[0]).toBe('/visa-document-checklist?type=family');
    expect(fam.hub).toBe('truck-driver');
    const az = buildPlan({ who: 'ausbildung', profession: 'electrician', level: 'a2' }, KNOWN);
    expect(az.steps[0].id).toBe('ausbildungFind');
    expect(az.steps[1]).toMatchObject({ id: 'germanLearn', target: 'B1' });
    expect(az.steps[2].links[0]).toBe('/visa-document-checklist?type=ausbildung');
  });

  it('employer path', () => {
    const plan = buildPlan({ who: 'employer', profession: null, level: null }, KNOWN);
    expect(plan.steps.map((s) => s.id)).toEqual(['empGuide', 'empCandidates', 'empCosts', 'empEzb', 'empContact']);
    expect(plan.tools.slice(0, 3)).toEqual(['/employer-cost-calculator', '/kandidaten', '/employer-guide-azerbaijan']);
    expect(plan.hub).toBeNull();
    expect(plan.cta).toBe('employer');
  });
});
