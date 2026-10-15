import { describe, expect, it } from 'vitest';
import { buildForm, FORM_KINDS, formFileName, missingFields, PLACEHOLDER, type FormData } from '../../src/lib/docsIntel/forms.js';
import { parseMrz } from '../../src/lib/docsIntel/mrz.js';
import { pageCount } from '../helpers/files';
import { pdfText } from '../helpers/pdfText';

const full = (): FormData => ({
  caseNumber: 'TV-2026-0003',
  visaType: '§18b – LKW-Fahrer',
  profession: 'Berufskraftfahrer',
  client: {
    firstName: 'Əli',
    lastName: 'Məmmədov',
    email: 'ali@test.local',
    phone: '+994501234567',
    birthDate: new Date('1990-05-20T00:00:00Z'),
    nationality: 'AZE',
    city: 'Bakı',
    address: 'Nizami küç. 10',
    passportNumber: 'C01234567',
    passportExpiry: new Date('2031-01-31T00:00:00Z'),
    germanLevel: 'B1',
    education: 'vocational',
    drivingLicence: 'CE',
    experienceYears: 5,
  },
  company: { name: 'Spedition Müller', legalForm: 'GmbH', address: 'Hauptstraße 1', city: 'Hamburg', contactName: 'Hans Müller', phone: '+49 40 123', email: 'hr@mueller.de', vatId: 'DE123456789' },
  vacancy: { salaryMin: 2800, salaryMax: 3200, employmentType: 'FULL_TIME', city: 'Hamburg' },
  contract: { version: 2, sentAt: new Date('2026-09-01T00:00:00Z'), signedAt: new Date('2026-09-03T00:00:00Z'), signerName: 'Əli Məmmədov' },
  mrz: null,
  date: new Date('2026-10-15T00:00:00Z'),
});

const empty = (): FormData => ({
  ...full(),
  client: { ...full().client, phone: null, birthDate: null, nationality: null, city: null, address: null, passportNumber: null, passportExpiry: null, germanLevel: null, education: null },
  company: null,
  vacancy: null,
  contract: null,
});

describe('buildForm', () => {
  it.each(FORM_KINDS)('%s: produces a PDF with the case data and no missing fields when the profile is complete', async (kind) => {
    const { pdf, missing, pages } = await buildForm(kind, full());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(await pageCount(pdf)).toBe(pages);
    expect(missing).toEqual([]);
    const text = await pdfText(pdf);
    expect(text).toContain('TV-2026-0003');
    expect(text).toContain('MEMMEDOV');
    expect(text).toContain('20.05.1990');
    expect(text).toContain('C01234567');
    expect(text).toContain('Berufskraftfahrer');
    expect(text).toContain(`1 / ${pages}`);
  });

  it.each(FORM_KINDS)('%s: lists the missing profile fields and draws placeholders', async (kind) => {
    const data = empty();
    const { pdf, missing } = await buildForm(kind, data);
    expect(missing).toEqual(missingFields(kind, data));
    expect(missing).toContain('passportNumber');
    expect(missing).toContain('birthDate');
    expect(missing).toContain('company');
    const text = await pdfText(pdf);
    expect(text).toContain(PLACEHOLDER);
  });

  it('videx-summary lists the VIDEX fields and the employer', async () => {
    const text = await pdfText((await buildForm('videx-summary', full())).pdf);
    for (const s of ['Familienname', 'Vorname', 'Geburtsdatum', 'Staatsangeh', 'Passnummer', 'Anschrift', 'Arbeitgeber', 'Spedition M', 'Zweck des Aufenthalts', 'Langfristig']) {
      expect(text).toContain(s);
    }
  });

  it('employer-letter is a German confirmation letter with a signature block', async () => {
    const text = await pdfText((await buildForm('employer-letter', full())).pdf);
    expect(text).toContain('Hiermit best');
    expect(text).toContain('Spedition M');
    expect(text).toContain('2800');
    expect(text).toContain('Unterschrift');
    expect(text).toContain('Hamburg, 15.10.2026');
  });

  it('contract-cover names both parties and the contract version', async () => {
    const text = await pdfText((await buildForm('contract-cover', full())).pdf);
    expect(text).toContain('Arbeitgeber');
    expect(text).toContain('Arbeitnehmer');
    expect(text).toContain('DE123456789');
    expect(text).toContain('Vertragsversion 2');
  });

  it('uses the MRZ spelling of the names when available', async () => {
    const data = full();
    data.mrz = parseMrz('P<AZEMAMMADOV<<ALI<<<<<<<<<<<<<<<<<<<<<<<<<<', 'C012345672AZE9005201M3101317<<<<<<<<<<<<<<04', new Date('2026-10-15T00:00:00Z'));
    const text = await pdfText((await buildForm('videx-summary', data)).pdf);
    expect(text).toContain('MAMMADOV');
    expect(text).toContain('ALI');
  });

  it('file names', () => {
    expect(formFileName('videx-summary', 'TV-2026-0001')).toBe('TV-2026-0001-videx-datenblatt.pdf');
    expect(formFileName('employer-letter', 'TV-2026-0001')).toBe('TV-2026-0001-arbeitgeber-bestaetigung.pdf');
    expect(formFileName('contract-cover', 'TV-2026-0001')).toBe('TV-2026-0001-arbeitsvertrag-deckblatt.pdf');
  });
});
