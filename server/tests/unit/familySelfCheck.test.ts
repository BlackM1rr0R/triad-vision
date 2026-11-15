import { describe, expect, it } from 'vitest';
import { familyCheckSchema, familySelfCheck } from '../../src/lib/family/publicCheck.js';

const NOW = new Date('2026-11-15T12:00:00.000Z');
const run = (q: Record<string, string>) => familySelfCheck(familyCheckSchema.parse(q), NOW);

describe('family reunification self-check (public, no case)', () => {
  it('Blue Card holder with enough income: spouse can come now, no A1 and no flat proof needed', () => {
    const r = run({ title: 'BLUE_CARD', net: '4200', rent: '1100', spouse: '1', spouseAge: '30' });
    expect(r.spouse?.verdict).toBe('now');
    expect(r.spouseLanguageExempt).toBe(true);
    expect(r.livingSpaceExempt).toBe(true);
    expect(r.documents).not.toContain('germanA1');
    expect(r.documents).not.toContain('sponsorRent');
    expect(r.documents).toContain('marriageCert');
  });

  it('a skilled worker (§ 18a/b) spouse needs no A1 either since 01.03.2024', () => {
    const r = run({ title: 'SKILLED', net: '3500', rent: '900', spouseAge: '28', spouseGerman: 'none' });
    expect(r.spouse?.verdict).toBe('now');
  });

  it('Ausbildung: spouse needs A1 first and the authority decides (discretion)', () => {
    const r = run({ title: 'AUSBILDUNG', net: '3000', rent: '700', space: '60', spouseAge: '25', spouseGerman: 'none' });
    expect(r.spouse?.verdict).toBe('after');
    expect(r.spouse?.blockers.map((b) => b.code)).toEqual(expect.arrayContaining(['SPOUSE_LANGUAGE', 'SPONSOR_TITLE']));
    expect(r.documents).toContain('germanA1');
    expect(run({ title: 'AUSBILDUNG', net: '3000', rent: '700', space: '60', spouseAge: '25', spouseGerman: 'a1' }).spouse?.verdict).toBe('likely');
  });

  it('job seekers (Chancenkarte) cannot bring the family yet', () => {
    const r = run({ title: 'JOB_SEEKER', net: '3000', rent: '700', spouseAge: '25' });
    expect(r.spouse?.verdict).toBe('after');
    expect(r.family.find((b) => b.code === 'SPONSOR_TITLE')?.status).toBe('fail');
  });

  it('too little income shows the gap; unknown income asks for it', () => {
    const short = run({ title: 'SKILLED', net: '1200', rent: '900', spouseAge: '30', children: '4,9' });
    expect(short.spouse?.verdict).toBe('after');
    expect(short.income.need).toBeGreaterThan(1200);
    expect(run({ title: 'SKILLED', spouseAge: '30' }).spouse?.verdict).toBe('check');
  });

  it('a spouse under 18 can come after the 18th birthday; adult children cannot come as children', () => {
    const r = run({ title: 'BLUE_CARD', net: '5000', rent: '1000', spouseAge: '17', children: '19' });
    expect(r.spouse?.verdict).toBe('after');
    expect(r.spouse?.blockers.find((b) => b.code === 'SPOUSE_AGE')?.params.yearsTo18).toBe(1);
    expect(r.children[0]).toMatchObject({ age: 19, verdict: 'no' });
  });

  it('children of 16–17 need C1 / integration prognosis except for Blue Card holders', () => {
    expect(run({ title: 'SKILLED', net: '5000', rent: '1000', spouse: '0', children: '16' }).children[0].verdict).toBe('likely');
    expect(run({ title: 'BLUE_CARD', net: '5000', rent: '1000', spouse: '0', children: '16' }).children[0].verdict).toBe('now');
  });

  it('parents: only for titles first issued from 01.03.2024; the flat of the core family does not count for them', () => {
    expect(run({ title: 'SKILLED', issued: '2024-05-01', net: '5000', rent: '1000', spouse: '0', parents: '2' }).parents).toMatchObject({ count: 2, verdict: 'now' });
    expect(run({ title: 'SKILLED', issued: '2023-05-01', net: '5000', rent: '1000', spouse: '0', parents: '1' }).parents?.verdict).toBe('no');
    expect(run({ title: 'SKILLED', net: '5000', rent: '1000', spouse: '0', parents: '1' }).parents?.verdict).toBe('check');
  });

  it('the flat must be large enough for titles without the exemption', () => {
    const r = run({ title: 'AUSBILDUNG', net: '4000', rent: '700', space: '20', spouseAge: '25', spouseGerman: 'a1', children: '7' });
    expect(r.livingSpace.required).toBe(36);
    expect(r.family.find((b) => b.code === 'LIVING_SPACE')?.status).toBe('fail');
    expect(r.documents).toContain('sponsorRent');
  });

  it('rejects malformed input and treats empty fields as unanswered', () => {
    expect(() => familyCheckSchema.parse({ children: '3;4' })).toThrow();
    expect(() => familyCheckSchema.parse({ title: 'KING' })).toThrow();
    expect(familyCheckSchema.parse({ net: '', title: '' })).toMatchObject({ net: undefined, title: 'SKILLED' });
  });
});
