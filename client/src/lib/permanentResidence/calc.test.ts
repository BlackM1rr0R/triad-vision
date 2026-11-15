import { describe, expect, it } from 'vitest';
import { addMonths, computePr, DEFAULT_PR, prFromParams, prToQuery, type PrInput } from './calc';

const TODAY = '2026-11';
const input = (over: Partial<PrInput>): PrInput => ({ ...DEFAULT_PR, start: '2026-01', ...over });

describe('permanent residence & citizenship timeline', () => {
  it('adds months across years', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', 60)).toBe('2031-01');
  });

  it('Blue Card: 27 months with A1, 21 with B1; citizenship after 5 years', () => {
    const a1 = computePr(input({ permit: 'blueCard', german: 'a1' }), TODAY);
    expect(a1).toMatchObject({ route: 'blueCard', titleMonths: 27, settlement: '2028-04', germanNeeded: 'a1', germanOk: true, fasterWithB1: '2027-10', citizenship: '2031-01' });
    const b1 = computePr(input({ permit: 'blueCard', german: 'b1' }), TODAY);
    expect(b1).toMatchObject({ titleMonths: 21, settlement: '2027-10', fasterWithB1: null, citizenshipGermanOk: true });
    expect(computePr(input({ permit: 'blueCard', german: 'none' }), TODAY).germanOk).toBe(false);
  });

  it('skilled worker: 36 months + B1; 24 months after a German degree', () => {
    expect(computePr(input({ permit: 'skilled', german: 'b1' }), TODAY)).toMatchObject({ route: 'skilled', settlement: '2029-01', germanOk: true });
    expect(computePr(input({ permit: 'skilled', german: 'a1' }), TODAY).germanOk).toBe(false);
    expect(computePr(input({ permit: 'skilled', german: 'b1', germanDegree: true }), TODAY)).toMatchObject({ route: 'skilledDegree', settlement: '2028-01' });
  });

  it('Ausbildung → worker: the 24 months start with the work title; the citizenship years count from arrival', () => {
    const r = computePr(input({ permit: 'ausbildung', german: 'b2', before: 36 }), TODAY);
    expect(r).toMatchObject({ route: 'skilledDegree', titleStart: '2029-01', settlement: '2031-01', citizenship: '2031-01' });
  });

  it('Chancenkarte → worker: 36 months from the work title', () => {
    expect(computePr(input({ permit: 'chancenkarte', german: 'b1', before: 8 }), TODAY)).toMatchObject({ titleStart: '2026-09', settlement: '2029-09' });
  });

  it('missing pension months push the date (contributions counted from today)', () => {
    const r = computePr(input({ permit: 'skilled', german: 'b1', start: '2024-01', pension: 12 }), TODAY);
    expect(r.settlement).toBe(addMonths(TODAY, 24));
    expect(r.settlementBy).toBe('pension');
  });

  it('family: § 9 after 5 years, as the spouse of a German § 28 after 3 years; citizenship 3 years + 2 years of marriage', () => {
    expect(computePr(input({ permit: 'family', german: 'b1' }), TODAY)).toMatchObject({ route: 'general', settlement: '2031-01' });
    const g = computePr(input({ permit: 'family', german: 'b1', marriedGerman: true, marriedSince: '2025-06' }), TODAY);
    expect(g).toMatchObject({ route: 'spouseGerman', settlement: '2029-01', citizenship: '2029-01', citizenshipRoute: 'spouseGerman' });
    expect(computePr(input({ permit: 'family', german: 'b1', marriedGerman: true, marriedSince: '2028-06' }), TODAY).citizenship).toBe('2030-06');
  });

  it('round-trips through the URL', () => {
    const i = input({ permit: 'chancenkarte', german: 'b1', before: 10, pension: 5, marriedGerman: true, marriedSince: '2025-03' });
    expect(prFromParams(new URLSearchParams(prToQuery(i)), TODAY)).toEqual(i);
    expect(prFromParams(new URLSearchParams('permit=nope&start=bad'), TODAY)).toMatchObject({ permit: 'blueCard', start: TODAY });
  });
});
