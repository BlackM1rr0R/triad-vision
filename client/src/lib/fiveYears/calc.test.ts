import { describe, expect, it } from 'vitest';
import { FY_DEFAULTS, fiveYears, fyFromParams, fyToQuery, levelAt, levelDate, settlementWithPath, type FyInput } from './calc';
import { AZ_SECTOR_WAGES } from '../moneyHome/data';

/** Simple stand-in for the payroll engine (the real one is tested on the server). */
const netOf = (g: number) => g * 0.65;
const input = (over: Partial<FyInput> = {}): FyInput => ({ ...FY_DEFAULTS, start: '2027-01', ...over });

describe('5-year time machine', () => {
  it('learns one level per `pace` months', () => {
    expect(levelDate('2027-01', 'a1', 'b1', 6)).toBe('2028-01');
    expect(levelDate('2027-01', 'b1', 'b1', 6)).toBe('2027-01');
    expect(levelDate('2027-01', 'b2', 'b1', 6)).toBe('2027-01');
    expect(levelAt(0, 'a1', 6)).toBe('a1');
    expect(levelAt(60, 'none', 6)).toBe('b2');
  });

  it('skilled worker: settlement after 36 months, later when B1 comes later', () => {
    expect(settlementWithPath({ start: '2027-01', german: 'a1', pace: 6, permit: 'skilled' })).toEqual({ ym: '2030-01', by: 'law' });
    // none → B1 with 15 months per level = 45 months > 36
    expect(settlementWithPath({ start: '2027-01', german: 'none', pace: 15, permit: 'skilled' })).toEqual({ ym: '2030-10', by: 'german' });
  });

  it('Blue Card: 21 months with B1, else 27 months with A1', () => {
    expect(settlementWithPath({ start: '2027-01', german: 'b1', pace: 6, permit: 'blueCard' })).toEqual({ ym: '2028-10', by: 'law' });
    // A1 → B1 in 24 months: B1 route = later(21 months, B1) = 2029-01, earlier than the A1 route (27 months = 2029-04).
    expect(settlementWithPath({ start: '2027-01', german: 'a1', pace: 12, permit: 'blueCard' })).toEqual({ ym: '2029-01', by: 'german' });
    // Very slow learner: B1 after 48 months → the A1 route (27 months) is earlier.
    expect(settlementWithPath({ start: '2027-01', german: 'a1', pace: 24, permit: 'blueCard' })).toEqual({ ym: '2029-04', by: 'law' });
  });

  it('computes five years with growing salary and costs and a running savings total', () => {
    const r = fiveYears(input({ raise: 3, inflation: 2 }), netOf);
    expect(r.years).toHaveLength(5);
    expect(r.years[0].gross).toBe(3200); // driver: (2800 + 3600) / 2
    expect(r.years[1].gross).toBe(Math.round(3200 * 1.03));
    expect(r.years[4].costs).toBe(Math.round(r.years[0].costs * 1.02 ** 4));
    let total = 0;
    for (const y of r.years) {
      expect(y.saveMonth).toBe(y.net - y.costs);
      expect(y.saveYear).toBe(y.saveMonth * 12);
      total += y.saveYear;
      expect(y.total).toBe(Math.round(total));
    }
    expect(r.years[4].totalReal).toBeLessThan(r.years[4].total);
    expect(r.years.map((y) => y.from)).toEqual(['2027-01', '2028-01', '2029-01', '2030-01', '2031-01']);
  });

  it('projects the Azerbaijani sector wage from 2025 with the assumed growth', () => {
    const r = fiveYears(input({ profession: 'care', azGrowth: 10 }), netOf);
    expect(r.azSector).toBe('health');
    expect(r.years[0].azGross).toBe(Math.round(AZ_SECTOR_WAGES.health * 1.1 ** 2)); // 2027 = 2025 + 2
    const flat = fiveYears(input({ profession: 'it', azGrowth: 0 }), netOf);
    expect(flat.years.every((y) => y.azGross === Math.round(AZ_SECTOR_WAGES.ict))).toBe(true);
  });

  it('lists milestones in order, with citizenship after 5 years of residence and B1', () => {
    const r = fiveYears(input({ german: 'a1', pace: 6 }), netOf);
    expect(r.milestones.map((m) => m.key)).toEqual(['arrival', 'family', 'probation', 'a2', 'b1', 'b2', 'settlement', 'citizenship']);
    expect(r.citizenship).toBe('2032-01');
    expect(r.citizenshipBy).toBe('law');
    expect(r.milestones.find((m) => m.key === 'citizenship')!.inside).toBe(true);
    // none → B1 in 3 × 18 = 54 months: still before the 5 years.
    expect(fiveYears(input({ german: 'none', pace: 18 }), netOf)).toMatchObject({ citizenship: '2032-01', citizenshipBy: 'law', germanAtEnd: 'b1' });
    // none → B1 in 3 × 24 = 72 months: B1 sets the date.
    const slow = fiveYears(input({ german: 'none', pace: 24 }), netOf);
    expect(slow).toMatchObject({ citizenship: '2033-01', citizenshipBy: 'german' });
    expect(slow.milestones.find((m) => m.key === 'citizenship')!.inside).toBe(false);
  });

  it('round-trips the URL and clamps assumptions', () => {
    const i = input({ profession: 'it', permit: 'blueCard', city: 'hamburg', german: 'b1', pace: 9, style: 'frugal', raise: 4.5, inflation: 2.5, azGrowth: 8 });
    expect(fyFromParams(new URLSearchParams(fyToQuery(i)), '2026-11')).toEqual(i);
    const d = fyFromParams(new URLSearchParams('raise=99&pace=1&profession=astronaut&start=2027-13'), '2026-11');
    expect(d.raise).toBe(15);
    expect(d.pace).toBe(3);
    expect(d.profession).toBe('driver');
    expect(d.start).toBe('2026-11');
    expect(fyFromParams(new URLSearchParams('profession=it'), '2026-11').permit).toBe('blueCard');
  });
});
