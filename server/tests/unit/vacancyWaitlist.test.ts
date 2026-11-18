import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db.js', () => ({ prisma: {} }));

const { GERMAN_STATES, normalizePlace, placeMatches, recipientOf, waitlistInputSchema, waitlistMatches } = await import('../../src/lib/jobAlerts/waitlist.js');
const { WAITLIST_MAIL } = await import('../../src/lib/jobAlerts/waitlistTexts.js');

const L = (de: string) => ({ az: de, de, en: de, ru: de });

describe('vacancy waitlist: places', () => {
  it('normalises umlauts, accents and punctuation', () => {
    expect(normalizePlace('München')).toBe('muenchen');
    expect(normalizePlace('Muenchen')).toBe('muenchen');
    expect(normalizePlace(' Baden-Württemberg ')).toBe('badenwuerttemberg');
    expect(normalizePlace('Frankfurt (Oder)')).toBe('frankfurtoder');
    expect(normalizePlace(null)).toBe('');
  });

  it('matches city names both ways and a Bundesland by its cities', () => {
    expect(placeMatches(null, 'Hamburg')).toBe(true);
    expect(placeMatches('', 'Hamburg')).toBe(true);
    expect(placeMatches('Hamburg', null)).toBe(true); // vacancy without a city: told
    expect(placeMatches('hamburg', 'Hamburg')).toBe(true);
    expect(placeMatches('Muenchen', 'München')).toBe(true);
    expect(placeMatches('Frankfurt', 'Frankfurt am Main')).toBe(true);
    expect(placeMatches('Bayern', 'Nürnberg')).toBe(true);
    expect(placeMatches('Bavaria', 'Munich')).toBe(true);
    expect(placeMatches('NRW', 'Köln')).toBe(true);
    expect(placeMatches('Bayern', 'Hamburg')).toBe(false);
    expect(placeMatches('Hamburg', 'München')).toBe(false);
    expect(placeMatches('Ulm', 'Köln')).toBe(false);
    expect(GERMAN_STATES).toHaveLength(16);
  });
});

describe('vacancy waitlist: matching', () => {
  const entry = (o: Partial<{ professions: string[]; germanLevel: string | null; city: string | null }> = {}) => ({ professions: ['truck_driver'], germanLevel: null, city: null, ...o });
  const v = (o: Partial<{ profession: string | null; title: Record<string, string>; germanLevel: string | null; city: string | null }> = {}) => ({ profession: 'LKW-Fahrer', title: L('LKW-Fahrer'), germanLevel: 'A2', city: 'Hamburg', ...o });

  it('same canonical profession (field, else title); not a sibling of the family', () => {
    expect(waitlistMatches(entry(), v())).toBe(true);
    expect(waitlistMatches(entry(), v({ profession: null, title: L('Berufskraftfahrer CE') }))).toBe(true);
    expect(waitlistMatches(entry(), v({ profession: 'Koch', title: L('Koch') }))).toBe(false);
    expect(waitlistMatches(entry({ professions: ['bus_driver'] }), v())).toBe(false);
  });

  it('German level of the vacancy not above the entry; city when given', () => {
    expect(waitlistMatches(entry({ germanLevel: 'B1' }), v({ germanLevel: 'A2' }))).toBe(true);
    expect(waitlistMatches(entry({ germanLevel: 'A1' }), v({ germanLevel: 'B1' }))).toBe(false);
    expect(waitlistMatches(entry({ germanLevel: 'none' }), v({ germanLevel: null }))).toBe(true);
    expect(waitlistMatches(entry({ city: 'Hamburg' }), v())).toBe(true);
    expect(waitlistMatches(entry({ city: 'Bayern' }), v())).toBe(false);
  });

  it('one person per account, else per e-mail', () => {
    expect(recipientOf({ userId: 'u1', email: 'A@x.de' })).toBe('u1');
    expect(recipientOf({ userId: null, email: 'A@x.de' })).toBe('a@x.de');
  });

  it('input: canonical professions only, empty city becomes null', () => {
    expect(waitlistInputSchema.parse({ profession: 'cook', city: '' }).city).toBeNull();
    expect(waitlistInputSchema.parse({ profession: 'cook', city: ' Köln ' }).city).toBe('Köln');
    expect(waitlistInputSchema.safeParse({ profession: 'astronaut' }).success).toBe(false);
  });

  it('texts exist in the six site languages', () => {
    for (const l of ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const) {
      expect(WAITLIST_MAIL[l].noticeSubject('X')).toContain('X');
      expect(WAITLIST_MAIL[l].noticeBody('P', 2)).toContain('P');
      expect(WAITLIST_MAIL[l].confirmBody('P', 'Hamburg')).toContain('Hamburg');
    }
  });
});
