import { describe, expect, it } from 'vitest';
import { BAKU, coordsOf } from '../../src/lib/visaStory/cities.js';
import { bakuYearMonth, daysBetween, firstNameOnly, haversineKm, levelProgress, topCounts, topFunFact, yearReview, type ReviewCase } from '../../src/lib/visaStory/stats.js';
import { storyCardSvg } from '../../src/lib/visaStory/card.js';

describe('visa story numbers', () => {
  it('haversine distance: zero for the same point, Baku → Berlin about 3,050 km, symmetric', () => {
    expect(haversineKm(BAKU, BAKU)).toBe(0);
    const berlin = coordsOf('Berlin')!;
    const km = haversineKm(BAKU, berlin);
    expect(km).toBeGreaterThan(3000);
    expect(km).toBeLessThan(3100);
    expect(haversineKm(berlin, BAKU)).toBe(km);
    // One degree of latitude ≈ 111.2 km.
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBe(111);
  });

  it('finds German cities with umlauts, transliterations and suffixes; unknown → null', () => {
    expect(coordsOf('München')).toEqual(coordsOf('Muenchen'));
    expect(coordsOf('Frankfurt am Main')).toEqual(coordsOf('frankfurt'));
    expect(coordsOf('Köln')).not.toBeNull();
    expect(coordsOf('Halle (Saale)')).not.toBeNull();
    expect(coordsOf('Nowhere-on-Sea')).toBeNull();
    expect(coordsOf(null)).toBeNull();
  });

  it('counts whole days and never negative ones', () => {
    expect(daysBetween(new Date('2026-01-01T10:00:00Z'), new Date('2026-01-31T09:00:00Z'))).toBe(29);
    expect(daysBetween(new Date('2026-01-31T00:00:00Z'), new Date('2026-01-01T00:00:00Z'))).toBe(0);
  });

  it('German level progress from the first known to the highest level', () => {
    expect(levelProgress(['A1', 'B1'], ['B1', 'A2'])).toEqual({ from: 'A1', to: 'B1', steps: 2 });
    expect(levelProgress(['none', null, 'a2'], ['A2'])).toEqual({ from: 'A2', to: 'A2', steps: 0 });
    expect(levelProgress([null], [null, 'none'])).toEqual({ from: null, to: null, steps: 0 });
    expect(levelProgress([null], ['B2'])).toEqual({ from: null, to: 'B2', steps: 0 });
  });

  it('picks the fun fact by a fixed priority, from the real numbers only', () => {
    const base = { days: 140, docsUploaded: 4, docsApproved: 4, messages: 5, km: null, wordsLearned: 0 };
    expect(topFunFact({ ...base, wordsLearned: 200 })).toEqual({ key: 'words', words: 200, perWeek: 10 });
    expect(topFunFact({ ...base, km: 2900 })).toEqual({ key: 'walk', km: 2900, walkDays: 73 });
    expect(topFunFact({ ...base, messages: 70 })).toEqual({ key: 'messages', messages: 70, perWeek: 4 });
    expect(topFunFact({ ...base, docsUploaded: 12 })).toEqual({ key: 'docs', docs: 12 });
    expect(topFunFact(base)).toEqual({ key: 'days', days: 140, weekends: 20 });
    expect(topFunFact({ ...base, days: 0 })).toEqual({ key: 'days', days: 0, weekends: 0 });
  });

  it('keeps only the first name of the staff member', () => {
    expect(firstNameOnly('  Leyla Sara ')).toBe('Leyla');
    expect(firstNameOnly('')).toBeNull();
    expect(firstNameOnly(null)).toBeNull();
  });

  it('share card draws the display name and counts but no surname', async () => {
    const svg = await storyCardSvg({ format: 'square', displayName: 'A. Q.', kicker: 'My visa story', headline: 'Visa approved', stats: [{ value: '120', label: 'days' }], footer: 'Start yours', lang: 'en' });
    expect(svg).toContain('width="1080" height="1080"');
    const story = await storyCardSvg({ format: 'story', displayName: 'Aynur', kicker: 'k', headline: 'h', stats: [], footer: 'f', lang: 'en' });
    expect(story).toContain('height="1920"');
  });
});

const c = (over: Partial<ReviewCase>): ReviewCase => ({
  number: 'TV-1',
  createdAt: new Date('2025-03-10T08:00:00Z'),
  decisionAt: null,
  status: 'DOCUMENTS_PENDING',
  profession: 'Pflegefachkraft',
  city: null,
  staffId: null,
  staffName: null,
  ...over,
});

describe('year in review', () => {
  it('uses the Baku calendar for months and years', () => {
    // 31 Dec 21:00 UTC is already 1 Jan in Baku (UTC+4).
    expect(bakuYearMonth(new Date('2025-12-31T21:00:00Z'))).toEqual({ year: 2026, month: 1 });
    expect(bakuYearMonth(new Date('2025-12-31T19:00:00Z'))).toEqual({ year: 2025, month: 12 });
  });

  it('groups professions and cities case-insensitively and ranks them', () => {
    expect(topCounts(['Koch', 'koch ', 'LKW-Fahrer', 'Koch', null, ''], 2)).toEqual([
      { name: 'Koch', count: 3 },
      { name: 'LKW-Fahrer', count: 1 },
    ]);
  });

  it('counts opened / approved, busiest month, fastest case and per-staff numbers', () => {
    const cases = [
      c({ number: 'A', createdAt: new Date('2025-01-05T10:00:00Z'), status: 'APPROVED', decisionAt: new Date('2025-04-05T10:00:00Z'), city: 'Berlin', staffId: 's1', staffName: 'Leyla A' }),
      c({ number: 'B', createdAt: new Date('2025-01-20T10:00:00Z'), status: 'APPROVED', decisionAt: new Date('2025-02-19T10:00:00Z'), city: 'berlin', profession: 'Koch', staffId: 's2', staffName: 'Murad B' }),
      c({ number: 'C', createdAt: new Date('2025-06-01T10:00:00Z'), status: 'REJECTED', decisionAt: new Date('2025-09-01T10:00:00Z'), staffId: 's1', staffName: 'Leyla A' }),
      c({ number: 'D', createdAt: new Date('2024-11-01T10:00:00Z'), status: 'APPROVED', decisionAt: new Date('2025-01-15T10:00:00Z'), city: 'Hamburg', staffId: 's1', staffName: 'Leyla A' }),
      c({ number: 'E', createdAt: new Date('2026-01-02T10:00:00Z') }), // other year
    ];
    const r = yearReview(cases, 2025);
    expect(r.opened).toBe(3);
    expect(r.approved).toBe(3);
    expect(r.rejected).toBe(1);
    expect(r.busiestMonth).toEqual({ month: 1, count: 2 });
    expect(r.openedByMonth.reduce((a, b) => a + b, 0)).toBe(3);
    expect(r.approvedByMonth[0]).toBe(1); // D in January
    expect(r.fastest).toEqual({ number: 'B', profession: 'Koch', days: 30 });
    expect(r.medianDays).toBe(75); // 30, 75, 90
    expect(r.topCities[0]).toEqual({ name: 'Berlin', count: 2 });
    expect(r.topProfessions[0]).toEqual({ name: 'Pflegefachkraft', count: 2 });
    expect(r.perStaff).toEqual([
      { id: 's1', name: 'Leyla A', opened: 2, approved: 2 },
      { id: 's2', name: 'Murad B', opened: 1, approved: 1 },
    ]);
  });

  it('is empty for a year without cases', () => {
    const r = yearReview([], 2020);
    expect(r).toMatchObject({ opened: 0, approved: 0, busiestMonth: null, fastest: null, medianDays: null, perStaff: [] });
  });
});
