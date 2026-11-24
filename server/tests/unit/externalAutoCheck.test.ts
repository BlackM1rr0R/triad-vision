import { describe, expect, it } from 'vitest';
import {
  checkExternalApplication,
  employerEmailFromText,
  extractEmails,
  meetsGerman,
  missingKey,
  parseGermanRequirement,
  professionMatches,
  readMissing,
  type AutoCheckInput,
} from '../../src/lib/germanyJobs/autoCheck.js';
import { dayStart, limitReason, nextDayStart } from '../../src/lib/germanyJobs/autoSettings.js';
import { needsMessage } from '../../src/lib/germanyJobs/autoTexts.js';

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

  it('compares with the default A2 when nothing is stated', () => {
    expect(meetsGerman('A2', null)).toBe(true);
    expect(meetsGerman('A1', null)).toBe(false);
    expect(meetsGerman('none', 'none')).toBe(true);
    expect(meetsGerman('B1', 'B2')).toBe(false);
    expect(meetsGerman('C1', 'B2')).toBe(true);
    expect(meetsGerman(null, 'A1')).toBe(false);
  });
});

describe('profession match', () => {
  it.each([
    [['sürücü'], 'LKW-Fahrer CE (m/w/d) Nahverkehr'],
    [['Kraftfahrer'], 'Berufskraftfahrer (m/w/d)'],
    [['sürücü'], 'Kurierfahrer (m/w/d) Paketzustellung'], // same family (driving)
    [['aşpaz'], 'Koch / Köchin (m/w/d)'],
    [['tibb bacısı'], 'Pflegefachkraft (m/w/d)'],
    [['Elektriker'], 'Elektroniker für Betriebstechnik'],
    [[null, 'Schweißer'], 'Schweißer MAG (m/w/d)'],
  ])('%j fits %s', (own, title) => {
    expect(professionMatches(own, title)).toBe(true);
  });

  it('rejects other professions and missing data, passes without a title', () => {
    expect(professionMatches(['aşpaz'], 'LKW-Fahrer CE')).toBe(false);
    expect(professionMatches(['tibb bacısı'], 'Softwareentwickler Java')).toBe(false);
    expect(professionMatches([null, ''], 'Koch (m/w/d)')).toBe(false);
    expect(professionMatches(['aşpaz'], null)).toBe(true);
  });
});

describe('checkExternalApplication', () => {
  const ok: AutoCheckInput = {
    hasAccount: true,
    hasCv: true,
    germanLevel: 'B1',
    requiredGerman: null,
    professions: ['sürücü'],
    listingTitle: 'Berufskraftfahrer CE (m/w/d)',
    passport: true,
    phone: '+994501234567',
    email: 'ali@example.com',
  };

  it('passes a complete application', () => {
    expect(checkExternalApplication(ok)).toEqual({ ok: true, missing: [], requiredGerman: 'A2', listingProfession: 'truck_driver' });
  });

  it('lists every missing item', () => {
    const r = checkExternalApplication({ ...ok, hasAccount: false, hasCv: false, germanLevel: 'A1', requiredGerman: 'B1', professions: ['aşpaz'], passport: false, phone: ' ', email: 'nope' });
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['ACCOUNT', 'CV', 'GERMAN_LEVEL', 'PROFESSION', 'PASSPORT', 'PHONE', 'EMAIL']);
    expect(r.requiredGerman).toBe('B1');
  });

  it('uses the listing requirement over the default', () => {
    expect(checkExternalApplication({ ...ok, germanLevel: 'A2', requiredGerman: 'B2' }).missing).toEqual(['GERMAN_LEVEL']);
    expect(checkExternalApplication({ ...ok, germanLevel: 'none', requiredGerman: 'none' }).ok).toBe(true);
  });

  it('round-trips the missing codes', () => {
    expect(missingKey(['PASSPORT', 'CV'])).toBe('CV,PASSPORT');
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
  const s = { dailyLimit: 30, perDomainLimit: 3 };
  it('stops at the daily and the per-domain limit', () => {
    expect(limitReason(s, 0, 0)).toBeNull();
    expect(limitReason(s, 29, 2)).toBeNull();
    expect(limitReason(s, 30, 0)).toBe('DAILY_LIMIT');
    expect(limitReason(s, 5, 3)).toBe('DOMAIN_LIMIT');
    expect(limitReason({ dailyLimit: 0, perDomainLimit: 3 }, 0, 0)).toBe('DAILY_LIMIT');
  });

  it('counts per Baku day and queues to the next one', () => {
    const now = new Date('2026-11-24T21:30:00Z'); // 01:30 on 25 Nov in Baku (UTC+4)
    expect(dayStart(now).toISOString()).toBe('2026-11-24T20:00:00.000Z');
    expect(nextDayStart(now).toISOString()).toBe('2026-11-25T20:00:00.000Z');
  });
});

describe('client notice of missing data', () => {
  it('names each item in the client language, with links in e-mails', () => {
    const m = needsMessage(['CV', 'GERMAN_LEVEL'], 'az', { job: 'Koch', have: 'A1', need: 'B1' }, 'https://triad-vision.de');
    expect(m.title).toContain('Koch');
    expect(m.body).toContain('CV əlavə edin');
    expect(m.body).toContain('(A1)');
    expect(m.body).toContain('(B1)');
    expect(m.body).toContain('https://triad-vision.de/account/cv');
    expect(m.path).toBe('/account/cv');
    const de = needsMessage(['PASSPORT'], 'de', { job: 'Koch', have: '—', need: 'A2' }, 'https://triad-vision.de');
    expect(de.body).toContain('https://triad-vision.de/de/account/profile');
    for (const lng of ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const) expect(needsMessage(['PHONE'], lng, { job: 'x', have: '', need: '' }).note.length).toBeGreaterThan(10);
  });
});
