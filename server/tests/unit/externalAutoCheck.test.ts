import { describe, expect, it } from 'vitest';
import {
  employerEmailFromText,
  extractEmails,
  parseGermanRequirement,
  readMissing,
} from '../../src/lib/germanyJobs/autoCheck.js';
import { dayStart } from '../../src/lib/germanyJobs/autoSettings.js';

describe('German level of a listing', () => {
  it.each([
    ['LKW-Fahrer CE (m/w/d), Deutsch B1', 'B1'],
    ['Deutschkenntnisse mind. B2 erforderlich', 'B2'],
    ['Pflegehelfer – Deutsch A2–B1', 'A2'],
    ['Sprachniveau B1 Deutsch, Englisch C1 von Vorteil', 'B1'],
    ['Koch (m/w/d) – gute Deutschkenntnisse', 'B1'],
    ['Sehr gute Deutschkenntnisse in Wort und Schrift', 'B2'],
    ['Fließend Deutsch', 'B2'],
    ['Deutsch in Wort und Schrift', 'B1'],
    ['Grundkenntnisse in Deutsch', 'A2'],
    ['Basic German is enough', 'A2'],
    ['Good German skills', 'B1'],
    ['Keine Deutschkenntnisse erforderlich', 'none'],
    ['No German required – English team', 'none'],
  ])('%s → %s', (text, level) => {
    expect(parseGermanRequirement(text)).toBe(level);
  });

  it('ignores levels that are not about German and unknown texts', () => {
    expect(parseGermanRequirement('Führerschein C1 und CE, Englisch B2')).toBeNull();
    expect(parseGermanRequirement('Lagerhelfer Hamburg')).toBeNull();
    expect(parseGermanRequirement(null)).toBeNull();
  });
});

describe('missing codes', () => {
  it('reads the stored codes, dropping unknown ones', () => {
    expect(readMissing('CV,PASSPORT,BOGUS')).toEqual(['CV', 'PASSPORT']);
    expect(readMissing(null)).toEqual([]);
  });
});

describe('employer e-mail addresses', () => {
  it('extracts usable addresses only', () => {
    expect(extractEmails('Bewerbung an Jobs@Nord-Logistik.de. Fragen: noreply@nord-logistik.de, info@arbeitnow.com, x@example.com')).toEqual(['jobs@nord-logistik.de']);
    expect(extractEmails(null)).toEqual([]);
  });

  it('trusts a pasted address only on the listing site itself', () => {
    expect(employerEmailFromText('Senden Sie Ihre Unterlagen an bewerbung@nord-logistik.de', 'https://karriere.nord-logistik.de/jobs/fahrer')).toBe('bewerbung@nord-logistik.de');
    expect(employerEmailFromText('bewerbung@other-firm.de', 'https://www.nord-logistik.de/jobs/fahrer')).toBeNull();
    expect(employerEmailFromText('hr@stepstone.de', 'https://www.stepstone.de/stellenangebote--fahrer')).toBeNull();
    expect(employerEmailFromText('hr@firma.de', 'not a url')).toBeNull();
  });
});

describe('limits', () => {
  it('counts per Baku day', () => {
    const now = new Date('2026-11-24T21:30:00Z'); // 01:30 on 25 Nov in Baku (UTC+4)
    expect(dayStart(now).toISOString()).toBe('2026-11-24T20:00:00.000Z');
  });
});
