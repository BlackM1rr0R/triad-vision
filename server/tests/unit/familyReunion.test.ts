import { describe, expect, it } from 'vitest';
import { ageAt, assessReunion, FAMILY_LAW, livelihoodNeed, requiredLivingSpace, reunionTimeline, type ReadinessMember, type SponsorFacts } from '../../src/lib/family/legal.js';
import { inferTitle } from '../../src/lib/family/readiness.js';

const NOW = new Date('2026-10-30T12:00:00.000Z');
const born = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const sponsor = (over: Partial<SponsorFacts> = {}): SponsorFacts => ({ title: 'SKILLED', titleIssuedAt: born('2025-02-01'), livingSpaceM2: 60, warmRent: 900, netMonthly: 3500, grossMonthly: null, ...over });
const member = (relation: ReadinessMember['relation'], birth: string | null, over: Partial<ReadinessMember> = {}): ReadinessMember => ({
  caseId: `${relation}-${birth}`,
  relation,
  birthDate: birth ? born(birth) : null,
  germanExempt: false,
  germanCertAccepted: false,
  ...over,
});
const check = (r: ReturnType<typeof assessReunion>, code: string, memberCaseId?: string) => r.checks.find((c) => c.code === code && (memberCaseId === undefined || c.memberCaseId === memberCaseId));

describe('family reunion: legal helpers', () => {
  it('ageAt counts full years', () => {
    expect(ageAt(born('2008-10-31'), NOW)).toBe(17);
    expect(ageAt(born('2008-10-30'), NOW)).toBe(18);
  });

  it('living space: 12 m² per person, 10 m² under 6, under 2 not counted, unknown age as adult', () => {
    expect(requiredLivingSpace([], NOW)).toEqual({ m2: 12, persons: 1 });
    expect(requiredLivingSpace([born('1994-01-01'), born('2022-01-01'), born('2025-12-01'), null], NOW)).toEqual({ m2: 12 + 12 + 10 + 12, persons: 4 });
  });

  it('livelihood need: partner rates with a spouse, child rates by age, rent and the work allowance', () => {
    const r = FAMILY_LAW.livelihood.regelbedarf;
    expect(livelihoodNeed([], null, NOW)).toBe(r.single + FAMILY_LAW.livelihood.workAllowance);
    expect(livelihoodNeed([{ relation: 'spouse', birthDate: born('1994-01-01') }, { relation: 'child', birthDate: born('2015-01-01') }], 800, NOW)).toBe(2 * r.partner + r.child6to13 + 800 + FAMILY_LAW.livelihood.workAllowance);
  });

  it('infers the title from the main case visa', () => {
    expect(inferTitle('WORK', { visaLabel: '§18g Blaue Karte', slug: 'blue-card' })).toBe('BLUE_CARD');
    expect(inferTitle('WORK', { visaLabel: '§18b', slug: 'fachkraft' })).toBe('SKILLED');
    expect(inferTitle('AUSBILDUNG', null)).toBe('AUSBILDUNG');
    expect(inferTitle('TOURIST', null)).toBeNull();
  });
});

describe('family reunion: readiness check', () => {
  it('a skilled worker with spouse (A1 accepted) and a child, enough flat and income: READY', () => {
    const r = assessReunion(sponsor(), [member('spouse', '1994-03-01', { germanCertAccepted: true }), member('child', '2016-05-05')], NOW);
    expect(r.status).toBe('READY');
    expect(r.checks.every((c) => c.status === 'ok')).toBe(true);
    // Skilled workers: living space exempt, the numbers are still shown.
    expect(check(r, 'LIVING_SPACE')?.params).toMatchObject({ exempt: true, required: 36, persons: 3 });
  });

  it('spouse without A1: exemption by title → warn (staff should mark it); without exemption → missing', () => {
    const sp = member('spouse', '1994-03-01');
    expect(check(assessReunion(sponsor({ title: 'BLUE_CARD' }), [sp], NOW), 'SPOUSE_LANGUAGE')?.status).toBe('warn');
    const trainee = assessReunion(sponsor({ title: 'AUSBILDUNG' }), [sp], NOW);
    expect(check(trainee, 'SPOUSE_LANGUAGE')?.status).toBe('missing');
    expect(check(trainee, 'SPONSOR_TITLE')?.status).toBe('warn'); // discretion
    expect(check(assessReunion(sponsor({ title: 'AUSBILDUNG' }), [{ ...sp, germanExempt: true }], NOW), 'SPOUSE_LANGUAGE')?.status).toBe('ok');
  });

  it('a spouse under 18 and an adult child fail; a 16-year-old child needs C1 unless Blue Card', () => {
    const r = assessReunion(sponsor(), [member('spouse', '2010-01-01', { germanExempt: true }), member('child', '2007-01-01'), member('child', '2010-02-01')], NOW);
    expect(r.status).toBe('BLOCKED');
    expect(check(r, 'SPOUSE_AGE')?.status).toBe('fail');
    expect(check(r, 'CHILD_AGE', 'child-2007-01-01')?.status).toBe('fail');
    expect(check(r, 'CHILD_LANGUAGE', 'child-2010-02-01')?.status).toBe('warn');
    expect(check(assessReunion(sponsor({ title: 'BLUE_CARD' }), [member('child', '2010-02-01')], NOW), 'CHILD_LANGUAGE')).toBeUndefined();
  });

  it('parents: only to skilled workers whose title was first issued from 1 March 2024', () => {
    const p = member('parent', '1965-01-01');
    expect(check(assessReunion(sponsor(), [p], NOW), 'PARENT_ALLOWED')?.status).toBe('ok');
    expect(check(assessReunion(sponsor({ titleIssuedAt: born('2023-12-01') }), [p], NOW), 'PARENT_ALLOWED')?.status).toBe('fail');
    expect(check(assessReunion(sponsor({ titleIssuedAt: null }), [p], NOW), 'PARENT_ALLOWED')?.status).toBe('missing');
    expect(check(assessReunion(sponsor({ title: 'STUDY' }), [p], NOW), 'PARENT_ALLOWED')?.status).toBe('fail');
  });

  it('living space and income for a non-exempt title; gross only → estimate (warn); job seeker → blocked', () => {
    const fam = [member('spouse', '1994-03-01', { germanExempt: true }), member('child', '2022-01-01')];
    const small = assessReunion(sponsor({ title: 'AUSBILDUNG', livingSpaceM2: 30 }), fam, NOW);
    expect(check(small, 'LIVING_SPACE')).toMatchObject({ status: 'fail', params: { required: 34, actual: 30 } });
    expect(check(assessReunion(sponsor({ title: 'AUSBILDUNG', livingSpaceM2: null }), fam, NOW), 'LIVING_SPACE')?.status).toBe('missing');

    const need = livelihoodNeed(fam, 900, NOW);
    expect(check(assessReunion(sponsor({ netMonthly: need - 500 }), fam, NOW), 'INCOME')?.status).toBe('fail');
    expect(check(assessReunion(sponsor({ netMonthly: need - 10 }), fam, NOW), 'INCOME')?.status).toBe('warn');
    const est = check(assessReunion(sponsor({ netMonthly: null, grossMonthly: 6000 }), fam, NOW), 'INCOME');
    expect(est).toMatchObject({ status: 'warn', params: { estimated: true, available: 4200 } });
    expect(check(assessReunion(sponsor({ netMonthly: null }), fam, NOW), 'INCOME')?.status).toBe('missing');
    expect(assessReunion(sponsor({ title: 'JOB_SEEKER' }), fam, NOW).status).toBe('BLOCKED');
    expect(assessReunion(sponsor({ title: null }), fam, NOW).status).toBe('INCOMPLETE');
  });
});

describe('family reunion: timeline', () => {
  const m = (status: string, over: Partial<{ appointmentAt: Date | null; plannedEntryAt: Date | null; openItems: number }> = {}) => ({ status, appointmentAt: null, plannedEntryAt: null, openItems: 2, ...over });

  it('marks done steps and the first open step as current', () => {
    const steps = reunionTimeline({ members: [m('DOCUMENTS_PENDING')], workerReady: true, proofReady: false }, NOW);
    expect(steps.map((s) => [s.key, s.state])).toEqual([
      ['family', 'done'],
      ['worker', 'done'],
      ['proof', 'current'],
      ['documents', 'upcoming'],
      ['appointment', 'upcoming'],
      ['decision', 'upcoming'],
      ['entry', 'upcoming'],
    ]);
  });

  it('cancelled members do not hold the family back; entry is done once the planned day passed', () => {
    const at = new Date('2026-11-12T08:00:00.000Z');
    const steps = reunionTimeline({ members: [m('APPROVED', { appointmentAt: at, plannedEntryAt: born('2026-10-01'), openItems: 0 }), m('CANCELLED')], workerReady: true, proofReady: true }, NOW);
    expect(steps.every((s) => s.state === 'done')).toBe(true);
    expect(steps.find((s) => s.key === 'appointment')?.date).toBe(at.toISOString());
    expect(reunionTimeline({ members: [], workerReady: false, proofReady: false }, NOW)[0].state).toBe('current');
  });
});
