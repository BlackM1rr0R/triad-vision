import { describe, expect, it } from 'vitest';
import { cvCompleteness, cvDataSchema, cvPutSchema, emptyCv, readCv, type CvData } from '../../src/lib/cv/schema.js';
import { prefillCv } from '../../src/lib/cv/prefill.js';
import { asciiName, cvFileName, renderCvPdf, type CvPerson } from '../../src/lib/cv/pdf.js';
import { fmtRange, nationalityLabel, byNewest } from '../../src/lib/cv/texts.js';
import { asSentence, buildLetter, experienceYearsOf, letterAnswersSchema, letterRecipient, listJoin, type LetterContext } from '../../src/lib/cv/letters.js';
import { renderLetterPdf } from '../../src/lib/cv/letterPdf.js';
import { cvPdfText, pdfPageCount } from './cvPdfText';

const person: CvPerson = {
  firstName: 'Əli',
  lastName: 'Məmmədov',
  email: 'ali.mammadov@example.com',
  phone: '+994501112233',
  address: 'Nizami küç. 10',
  city: 'Gəncə',
  birthDate: new Date('1990-05-01T00:00:00Z'),
  nationality: 'AZE',
};

const sampleCv = (): CvData => ({
  ...emptyCv(),
  headline: 'Berufskraftfahrer (CE)',
  summary: 'Zuverlässiger Fahrer mit Erfahrung im internationalen Güterverkehr; erreichbar unter +994501112233.',
  experience: [
    { title: 'LKW-Fahrer', employer: 'Şirvan Logistika MMC', city: 'Bakı', country: 'Aserbaidschan', from: '2016-03', to: '2019-08', tasks: ['Fernverkehr Türkei–Georgien'] },
    { title: 'Fahrer Klasse CE', employer: 'Qafqaz Trans', city: 'Gəncə', country: 'Aserbaidschan', from: '2019-09', to: null, tasks: ['Ladungssicherung', 'Tourenplanung'] },
  ],
  education: [{ degree: 'Berufsausbildung', institution: 'Gəncə Peşə Məktəbi', city: 'Gəncə', country: 'Aserbaidschan', from: '2008-09', to: '2011-06', field: 'Kraftfahrzeugtechnik' }],
  languages: [
    { language: 'Aserbaidschanisch', level: 'native' },
    { language: 'Deutsch', level: 'B1' },
  ],
  skills: ['Ladungssicherung', 'Tachograph', 'Erste Hilfe'],
  certificates: [{ name: 'ADR-Bescheinigung', issuer: 'DEKRA', year: 2021 }],
  drivingLicences: ['B', 'C', 'CE'],
  interests: ['Schach'],
});

describe('CV schema', () => {
  it('accepts a full CV and fills defaults', () => {
    const parsed = cvDataSchema.parse({ headline: 'X', experience: [{ title: 'Fahrer', from: '2020-01', to: '' }] });
    expect(parsed.experience[0]).toMatchObject({ employer: '', to: null, tasks: [] });
    expect(parsed.skills).toEqual([]);
  });

  it('rejects bad months, reversed ranges, unknown keys, levels and oversize lists', () => {
    const bad = [
      { experience: [{ title: 'A', from: '2020-13' }] },
      { experience: [{ title: 'A', from: '2020-05', to: '2019-01' }] },
      { education: [{ degree: 'A', from: '2015-01', to: '2014-01' }] },
      { languages: [{ language: 'Deutsch', level: 'B3' }] },
      { skills: Array.from({ length: 41 }, (_, i) => `s${i}`) },
      { headline: 'x'.repeat(161) },
      { hobby: 'x' },
      { experience: [{ title: 'A', from: '2020-01', salary: 1 }] },
    ];
    for (const data of bad) expect(cvDataSchema.safeParse(data).success, JSON.stringify(data).slice(0, 60)).toBe(false);
    expect(cvPutSchema.safeParse({ data: {}, template: 'modern' }).success).toBe(false);
    expect(cvPutSchema.safeParse({ data: {}, template: 'europass', shareWithEmployers: false }).success).toBe(true);
  });

  it('reads stored JSON tolerantly', () => {
    const cv = readCv({ headline: '  Koch ', experience: [{ title: 'Koch', from: '2020-01' }, { nonsense: true }], skills: ['a', 5, ''] });
    expect(cv.headline).toBe('Koch');
    expect(cv.experience).toHaveLength(1);
    expect(cv.skills).toEqual(['a']);
    expect(readCv(null)).toEqual(emptyCv());
  });

  it('scores completeness', () => {
    expect(cvCompleteness(emptyCv(), {})).toBe(0);
    expect(cvCompleteness(sampleCv(), { birthDate: new Date(), address: 'x', phone: 'y', nationality: 'AZE' })).toBe(100);
  });
});

describe('prefill', () => {
  const profile = { profession: 'LKW-Fahrer', experienceYears: 6, education: 'vocational', germanLevel: 'B1', drivingLicence: 'B, C, CE', about: null, nationality: 'Azərbaycan', city: 'Gəncə' };

  it('fills empty sections from the profile', () => {
    const { data, filled } = prefillCv(emptyCv(), profile, new Date('2026-10-17T00:00:00Z'));
    expect(filled).toEqual(['headline', 'summary', 'experience', 'education', 'languages', 'drivingLicences']);
    expect(data.headline).toBe('LKW-Fahrer');
    expect(data.summary).toBe('LKW-Fahrer mit 6 Jahren Berufserfahrung.');
    expect(data.experience[0]).toMatchObject({ title: 'LKW-Fahrer', from: '2020-10', to: null });
    expect(data.education[0].degree).toBe('Berufsausbildung');
    expect(data.languages).toEqual([
      { language: 'Aserbaidschanisch', level: 'native' },
      { language: 'Deutsch', level: 'B1' },
    ]);
    expect(data.drivingLicences).toEqual(['B', 'C', 'CE']);
    expect(cvDataSchema.safeParse(data).success).toBe(true);
  });

  it('never overwrites what the client wrote', () => {
    const cv = { ...sampleCv(), summary: 'Eigener Text' };
    const { data, filled } = prefillCv(cv, { ...profile, about: 'Über mich' });
    expect(data).toEqual(cv);
    expect(filled).toEqual([]);
  });

  it('adds German to an existing language list and uses "about" as summary', () => {
    const { data } = prefillCv({ ...emptyCv(), languages: [{ language: 'Russisch', level: 'C1' }] }, { ...profile, about: 'Ich bin zuverlässig.', germanLevel: 'A2' });
    expect(data.languages.map((l) => l.language)).toEqual(['Russisch', 'Deutsch']);
    expect(data.summary).toBe('Ich bin zuverlässig.');
  });
});

describe('texts', () => {
  it('formats ranges and nationalities', () => {
    expect(fmtRange('2019-09', null, 'de', true)).toBe('09/2019 – heute');
    expect(fmtRange('2019-09', null, 'en', true)).toBe('09/2019 – present');
    expect(fmtRange('2016-03', '2019-08', 'de')).toBe('03/2016 – 08/2019');
    expect(nationalityLabel('AZE', 'de')).toBe('aserbaidschanisch');
    expect(nationalityLabel('Azərbaycan', 'en')).toBe('Azerbaijani');
    expect(nationalityLabel('Kanada', 'de')).toBe('Kanada');
    expect(byNewest(sampleCv().experience).map((e) => e.title)).toEqual(['Fahrer Klasse CE', 'LKW-Fahrer']);
  });

  it('builds ASCII file names', () => {
    expect(asciiName('Məmmədov Şükür Ağayev Jürgen')).toBe('Mammadov Suekuer Agayev Juergen');
    expect(asciiName('Иванов')).toBe('Ivanov');
    expect(cvFileName({ firstName: 'Əli', lastName: 'Məmmədov' }, 'de')).toBe('Lebenslauf_Mammadov_Ali.pdf');
    expect(cvFileName({ firstName: 'Əli', lastName: 'Məmmədov' }, 'de', true)).toBe('Lebenslauf_Ali_M.pdf');
  });
});

describe('CV PDF', () => {
  const now = new Date('2026-10-17T10:00:00Z');

  it('renders the German Lebenslauf with Azerbaijani characters', async () => {
    const pdf = await renderCvPdf({ person, cv: sampleCv(), template: 'lebenslauf', lang: 'de', now });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const text = await cvPdfText(pdf);
    for (const s of ['Lebenslauf', 'Persönliche Daten', 'Əli Məmmədov', 'Nizami küç. 10, Gəncə', '01.05.1990', 'aserbaidschanisch', 'Berufserfahrung', '09/2019 – heute', 'Şirvan Logistika MMC · Bakı, Aserbaidschan', 'Ausbildung', 'Sprachkenntnisse', 'B1 – Gute Kenntnisse', 'Führerschein', 'Klasse B, C, CE', 'Interessen', 'Gəncə, 17.10.2026']) {
      expect(text).toContain(s);
    }
    // reverse-chronological
    expect(text.indexOf('Fahrer Klasse CE')).toBeLessThan(text.indexOf('LKW-Fahrer'));
  });

  it('renders the Europass layout in English with the CEFR grid', async () => {
    const pdf = await renderCvPdf({ person, cv: sampleCv(), template: 'europass', lang: 'en', now });
    const text = await cvPdfText(pdf);
    for (const s of ['Curriculum Vitae'.toUpperCase(), 'Work experience', 'Education and training', 'Language skills', 'Mother tongue(s):', 'Azerbaijani', 'German', 'Listening', 'Writing', '09/2019 – present', 'Azerbaijani']) {
      expect(text).toContain(s);
    }
  });

  it('breaks long CVs across pages', async () => {
    const cv = sampleCv();
    cv.experience = Array.from({ length: 20 }, (_, i) => ({ title: `Position ${i}`, employer: 'Firma', city: 'Bakı', country: '', from: `${2000 + i}-01`, to: `${2000 + i}-12`, tasks: ['Aufgabe eins mit einer längeren Beschreibung, die umbrechen muss, damit sie passt', 'Aufgabe zwei'] }));
    const pdf = await renderCvPdf({ person, cv, template: 'lebenslauf', lang: 'de', now });
    expect(await pdfPageCount(pdf)).toBeGreaterThan(1);
    const text = await cvPdfText(pdf);
    expect(text).toContain('Position 0');
    expect(text).toContain('Position 19');
    expect(text).toMatch(/Seite 1 von \d/);
  });

  it('anonymises for employers', async () => {
    const pdf = await renderCvPdf({ person, cv: sampleCv(), template: 'lebenslauf', lang: 'de', anonymised: true, now });
    const text = await cvPdfText(pdf);
    expect(text).toContain('Əli M.');
    expect(text).toContain('1990 (Alter 36)');
    for (const s of ['Məmmədov', 'ali.mammadov@example.com', '+994501112233', 'Nizami', '01.05.1990']) expect(text).not.toContain(s);
  });
});

const ctx = (over: Partial<LetterContext> = {}): LetterContext => ({
  kind: 'VISA',
  language: 'de',
  person: { firstName: 'Əli', lastName: 'Məmmədov', profession: 'Berufskraftfahrer', experienceYears: 7, germanLevel: 'B1', education: 'vocational', drivingLicence: 'CE' },
  cv: sampleCv(),
  caseInfo: { visaTitle: 'Fachkräfte mit Berufsausbildung', profession: 'Berufskraftfahrer' },
  vacancy: null,
  answers: {},
  ...over,
});

describe('motivation letter templates', () => {
  it('helpers', () => {
    expect(asSentence('  ich lerne   seit einem Jahr Deutsch ')).toBe('Ich lerne seit einem Jahr Deutsch.');
    expect(asSentence('Schon fertig!')).toBe('Schon fertig!');
    expect(listJoin(['a', 'b', 'c'], 'de')).toBe('a, b und c');
    expect(listJoin(['a', 'b'], 'en')).toBe('a and b');
    expect(experienceYearsOf({ person: { firstName: '', lastName: '', experienceYears: null }, cv: sampleCv() }, new Date('2026-10-01T00:00:00Z'))).toBe(10);
    expect(letterAnswersSchema.safeParse({ whyGermany: 'x'.repeat(1201) }).success).toBe(false);
    expect(letterAnswersSchema.safeParse({ unknown: 'x' }).success).toBe(false);
  });

  it('VISA (de): placeholders filled from profile, CV, case and answers', () => {
    const { title, body } = buildLetter(ctx({ answers: { whyGermany: 'in Deutschland werden Berufskraftfahrer dringend gesucht', plans: 'Ich möchte mit meiner Familie in Hamburg leben', family: 'Ich bin verheiratet und habe zwei Kinder' } }));
    expect(title).toBe('Motivationsschreiben zum Antrag auf ein nationales Visum – Fachkräfte mit Berufsausbildung');
    expect(body.startsWith('Sehr geehrte Damen und Herren,\n\nhiermit beantrage ich ein nationales Visum der Kategorie „Fachkräfte mit Berufsausbildung“')).toBe(true);
    expect(body).toContain('verfüge über sieben Jahre Berufserfahrung');
    expect(body).toContain('Derzeit arbeite ich als Fahrer Klasse CE bei Qafqaz Trans in Gəncə.');
    expect(body).toContain('Zu meinen Aufgaben gehören unter anderem Ladungssicherung und Tourenplanung.');
    expect(body).toContain('In Deutschland werden Berufskraftfahrer dringend gesucht.');
    expect(body).toContain('Niveau B1 des Gemeinsamen Europäischen Referenzrahmens');
    expect(body).toContain('Ich bin verheiratet und habe zwei Kinder.');
    expect(body.trimEnd().endsWith('Mit freundlichen Grüßen\n\nƏli Məmmədov')).toBe(true);
    const paragraphs = body.split('\n\n');
    // salutation + 5 paragraphs + closing + name
    expect(paragraphs).toHaveLength(8);
    expect(body).not.toMatch(/\{|\}|undefined|null/);
  });

  it('JOB (de) uses the vacancy and lists skills and licences; VISA defaults without answers', () => {
    const job = buildLetter(ctx({ kind: 'JOB', caseInfo: null, vacancy: { title: 'LKW-Fahrer (m/w/d)', city: 'Hamburg', company: 'Nord Logistik GmbH' } }));
    expect(job.title).toBe('Bewerbung als LKW-Fahrer (m/w/d) in Hamburg');
    expect(job.body).toContain('Ihre Stelle als LKW-Fahrer (m/w/d) in Hamburg');
    expect(job.body).toContain('Kenntnisse in folgenden Bereichen mit: Ladungssicherung, Tachograph, Erste Hilfe.');
    expect(job.body).toContain('Führerschein der Klassen B, C, CE');
    expect(job.body).toContain('Meinen Lebenslauf finden Sie in der Anlage.');
    const visa = buildLetter(ctx({ caseInfo: null }));
    expect(visa.body).toContain('Deutschland ist für mich attraktiv');
    expect(visa.body).toContain('Nach meiner Ankunft möchte ich mich zügig einarbeiten');
  });

  it('ANERKENNUNG and English variants', () => {
    const rec = buildLetter(ctx({ kind: 'ANERKENNUNG' }));
    expect(rec.title).toBe('Antrag auf Anerkennung meiner ausländischen Berufsqualifikation als Berufskraftfahrer');
    expect(rec.body).toContain('meiner in Aserbaidschan erworbenen Berufsqualifikation („Berufsausbildung“, Gəncə Peşə Məktəbi, 2011)');
    const en = buildLetter(ctx({ language: 'en', kind: 'JOB', vacancy: { title: 'Truck driver', city: 'Bremen', company: null } }));
    expect(en.title).toBe('Application for the position of Truck driver in Bremen');
    expect(en.body.startsWith('Dear Sir or Madam,')).toBe(true);
    expect(en.body).toContain('seven years of professional experience');
    expect(en.body).toContain('Yours faithfully,');
  });

  it('recipients', () => {
    expect(letterRecipient('VISA', 'de', null, {})[0]).toBe('Botschaft der Bundesrepublik Deutschland Baku');
    expect(letterRecipient('JOB', 'de', { title: 'x', city: 'Hamburg', company: 'Nord GmbH' }, {})).toEqual(['Nord GmbH', 'Personalabteilung', 'Hamburg']);
    expect(letterRecipient('JOB', 'de', { title: 'x', city: null, company: null }, {})).toEqual(['Personalabteilung']);
    expect(letterRecipient('ANERKENNUNG', 'de', null, { recipient: 'IHK FOSA\nUlmenstraße 52g\n90443 Nürnberg' })).toEqual(['IHK FOSA', 'Ulmenstraße 52g', '90443 Nürnberg']);
  });

  it('renders the letter PDF (DIN 5008-like)', async () => {
    const { title, body } = buildLetter(ctx());
    const pdf = await renderLetterPdf({
      language: 'de',
      sender: { name: 'Əli Məmmədov', address: 'Nizami küç. 10', city: 'Gəncə', phone: '+994501112233', email: 'ali@example.com' },
      recipient: letterRecipient('VISA', 'de', null, {}),
      title,
      body,
      date: new Date('2026-10-17T10:00:00Z'),
    });
    const text = await cvPdfText(pdf);
    for (const s of ['Əli Məmmədov', 'Botschaft der Bundesrepublik Deutschland', 'Visastelle', 'Gəncə, 17.10.2026', 'Motivationsschreiben zum Antrag', 'Sehr geehrte Damen und Herren,', 'Mit freundlichen Grüßen']) expect(text).toContain(s);
  });
});
