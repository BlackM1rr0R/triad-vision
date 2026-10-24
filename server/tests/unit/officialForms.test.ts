import { describe, expect, it } from 'vitest';
import { DATA_KEY_MAP, isDataKey, normName, suggestFor, suggestMapping } from '../../src/lib/officialForms/catalog.js';
import { applyMapping, deriveData, maritalCode, sexCode, splitGermanAddress, toIsoDay } from '../../src/lib/officialForms/resolve.js';
import { dataSheetPdf, fillPdf, listPdfFields, readPdfValues } from '../../src/lib/officialForms/pdf.js';
import { cleanFieldMap, DEFAULT_TEMPLATES } from '../../src/lib/officialForms/service.js';
import { parseEmployerValues } from '../../src/lib/officialForms/employer.js';
import { makeFormPdf } from '../helpers/formPdf';

describe('official forms: catalogue and suggestions', () => {
  it('normalises German field names', () => {
    expect(normName('Staatsangehörigkeit_2')).toBe('staatsangehoerigkeit 2');
    expect(normName('Straße  Hausnummer')).toBe('strasse hausnummer');
  });

  it('suggests data keys from German / English labels', () => {
    const s = (name: string, type: 'text' | 'checkbox' | 'radio' = 'text', options: string[] = []) => suggestFor({ name, type, options })?.source ?? null;
    expect(s('Familienname')).toBe('client.lastName');
    expect(s('Name Familienname Surname')).toBe('client.lastName');
    expect(s('Vorname')).toBe('client.firstName');
    expect(s('Geburtsdatum (TT.MM.JJJJ)')).toBe('client.birthDate');
    expect(s('Geburtsort Place of birth')).toBe('client.birthPlace');
    expect(s('Staatsangehörigkeit')).toBe('client.nationality');
    expect(s('Reisepassnummer')).toBe('passport.number');
    expect(s('Ausstellende Behörde')).toBe('passport.authority');
    expect(s('txtf_19_Betriebsnummer')).toBe('company.betriebsnummer');
    expect(s('txtf_10_Firma')).toBe('company.name');
    expect(s('Vornamen First names_2')).toBe('spouse.firstName');
    expect(s('Vornamen First namesRow3')).toBe('children.3.firstName');
    expect(s('ledig single', 'checkbox')).toBe('client.maritalStatus');
    expect(suggestFor({ name: 'weiblich female', type: 'checkbox', options: [] })).toMatchObject({ source: 'client.sex', when: 'F' });
    expect(suggestFor({ name: 'rbtn_6_Geschlecht', type: 'radio', options: ['maennlich', 'weiblich', 'divers'] })).toMatchObject({ source: 'client.sex', map: { M: 'maennlich' } });
    // radio whose options do not match the translation: no map, staff map it
    expect(suggestFor({ name: 'Geschlecht', type: 'radio', options: ['1', '2'] })?.map).toBeUndefined();
    expect(s('Unterschrift')).toBeNull();
    expect(suggestFor({ name: 'Signature1', type: 'signature', options: [] })).toBeNull();
  });

  it('suggestMapping skips fields that already have a mapping', () => {
    const fields = [
      { name: 'Familienname', type: 'text' as const, options: [], page: 0, maxLength: null, readOnly: false },
      { name: 'Vorname', type: 'text' as const, options: [], page: 0, maxLength: null, readOnly: false },
    ];
    expect(Object.keys(suggestMapping(fields, { Familienname: { source: 'const', value: 'X' } }))).toEqual(['Vorname']);
  });

  it('the shipped default mappings only use catalogue keys', () => {
    expect(DEFAULT_TEMPLATES.map((d) => d.key)).toEqual(['NATIONAL_VISA', 'EMPLOYMENT_DECLARATION']);
    for (const d of DEFAULT_TEMPLATES) {
      expect(d.url).toMatch(/^https:\/\/(service\.diplo\.de|www\.arbeitsagentur\.de)\//);
      for (const [field, m] of Object.entries(d.fieldMap)) {
        expect(m.source === 'const' || isDataKey(m.source), `${d.key}: ${field} → ${m.source}`).toBe(true);
        if (m.map) {
          const def = DATA_KEY_MAP.get(m.source);
          if (def?.codes) for (const code of Object.keys(m.map)) expect(def.codes, `${field}: ${code}`).toContain(code);
        }
      }
    }
  });
});

describe('official forms: resolving values', () => {
  it('parses dates, sex and marital status', () => {
    expect(toIsoDay('04.05.1990')).toBe('1990-05-04');
    expect(toIsoDay('1990-05-04T00:00:00Z')).toBe('1990-05-04');
    expect(toIsoDay('soon')).toBe('');
    expect(sexCode('männlich')).toBe('M');
    expect(sexCode('weiblich')).toBe('F');
    expect(sexCode('F')).toBe('F');
    expect(sexCode('')).toBe('');
    expect(maritalCode('verheiratet')).toBe('VERHEIRATET');
    expect(maritalCode('ledig')).toBe('LEDIG');
    expect(maritalCode('geschieden seit 2019')).toBe('GESCHIEDEN');
    expect(maritalCode('?')).toBe('');
  });

  it('splits a German address', () => {
    expect(splitGermanAddress('Hauptstraße 12a, 10115 Berlin', null)).toEqual({ streetLine: 'Hauptstraße 12a', street: 'Hauptstraße', houseNumber: '12a', postalCode: '10115', city: 'Berlin' });
    expect(splitGermanAddress('Am Hafen 3-5', 'Hamburg')).toMatchObject({ street: 'Am Hafen', houseNumber: '3-5', postalCode: '', city: 'Hamburg' });
    expect(splitGermanAddress(null, 'Köln')).toMatchObject({ streetLine: '', city: 'Köln' });
  });

  it('derives dependent values after employer corrections', () => {
    const d = deriveData({ 'contract.grossMonthly': '3000', 'contract.weeklyHours': '40', 'contract.jobTitle': 'Fahrer', 'meta.today': '2026-10-24' }, { 'contract.grossMonthly': '3500', 'company.city': 'Bremen', 'employment.jobDescription': 'Fernverkehr' });
    expect(d['contract.grossYearly']).toBe('42000');
    expect(d['contract.hourlyWage']).toBe(String(Math.round((3500 / (40 * 4.33)) * 100) / 100));
    expect(d['contract.workingTime']).toBe('FULL');
    expect(d['meta.employerPlaceDate']).toBe('Bremen, 24.10.2026');
    expect(d['employment.jobTitleDescription']).toBe('Fahrer – Fernverkehr');
    // unknown keys are ignored
    expect(deriveData({}, { 'evil.key': 'x' })['evil.key']).toBeUndefined();
  });

  it('applies a mapping: formats, check boxes, radio maps, constants, overrides, missing', () => {
    const fields = [
      { name: 'Nachname', type: 'text' as const },
      { name: 'Geburtsdatum', type: 'text' as const },
      { name: 'Gehalt', type: 'text' as const },
      { name: 'verheiratet', type: 'checkbox' as const },
      { name: 'ledig', type: 'checkbox' as const },
      { name: 'Geschlecht', type: 'radio' as const },
      { name: 'Pass', type: 'checkbox' as const },
      { name: 'Ort', type: 'text' as const },
      { name: 'Betriebsnummer', type: 'text' as const },
      { name: 'Fax', type: 'text' as const },
    ].map((f) => ({ ...f, options: [], page: 0, maxLength: null, readOnly: false }));
    const map = {
      Nachname: { source: 'client.lastName', format: 'upper' as const },
      Geburtsdatum: { source: 'client.birthDate' },
      Gehalt: { source: 'contract.grossMonthly' },
      verheiratet: { source: 'client.maritalStatus', when: 'VERHEIRATET' },
      ledig: { source: 'client.maritalStatus', when: 'LEDIG' },
      Geschlecht: { source: 'client.sex', map: { M: 'maennlich', F: 'weiblich' } },
      Pass: { source: 'const', value: 'X', when: '*' },
      Ort: { source: 'company.city' },
      Betriebsnummer: { source: 'company.betriebsnummer' },
      Fax: { source: 'company.fax', optional: true },
      Ghost: { source: 'client.email' },
    };
    const data = { 'client.lastName': 'Müller', 'client.birthDate': '1990-05-04', 'contract.grossMonthly': '3200.5', 'client.maritalStatus': 'VERHEIRATET', 'client.sex': 'F' };
    const r = applyMapping(fields, map, data, { Ort: 'Berlin' });
    expect(r.values).toEqual({ Nachname: 'MÜLLER', Geburtsdatum: '04.05.1990', Gehalt: '3.200,50', verheiratet: true, ledig: false, Geschlecht: 'weiblich', Pass: true, Ort: 'Berlin', Betriebsnummer: '', Fax: '' });
    expect(r.missing.map((m) => m.source)).toEqual(['company.betriebsnummer']);
    expect(r.missing[0]).toMatchObject({ group: 'company', fields: ['Betriebsnummer'], label: { de: 'Betriebsnummer' } });
    expect(r.rows.find((x) => x.field === 'Ort')).toMatchObject({ overridden: true, missing: false });
    expect(r.rows.find((x) => x.field === 'Nachname')?.key).toBe('lastName');
    // passport number rows carry the key the response masking knows
    const p = applyMapping([{ name: 'Pass Nr', type: 'text', options: [], page: 0, maxLength: null, readOnly: false }], { 'Pass Nr': { source: 'passport.number' } }, { 'passport.number': 'C01234567' });
    expect(p.rows[0]).toMatchObject({ key: 'passportNumber', value: 'C01234567' });
  });

  it('cleanFieldMap drops unknown fields and sources', () => {
    const fields = [{ name: 'A', type: 'text' as const, options: [], page: 0, maxLength: null, readOnly: false }];
    const out = cleanFieldMap({ A: { source: 'client.lastName', format: 'none' }, B: { source: 'client.lastName' }, C: { source: 'nope.key' } }, fields);
    expect(out.map).toEqual({ A: { source: 'client.lastName' } });
    expect(out.dropped.sort()).toEqual(['B', 'C']);
  });

  it('validates the employer values', () => {
    const ok = parseEmployerValues({ 'contract.grossMonthly': '3.200', 'contract.startDate': '2027-01-01', 'contract.contractType': 'FIXED', 'company.betriebsnummer': ' 12345678 ', 'client.lastName': 'hack' });
    expect(ok.errors).toEqual([]);
    expect(ok.values).toEqual({ 'contract.grossMonthly': '3.2', 'contract.startDate': '2027-01-01', 'contract.contractType': 'FIXED', 'company.betriebsnummer': '12345678' });
    const bad = parseEmployerValues({ 'contract.startDate': '01.01.2027', 'contract.contractType': 'FOREVER', 'contract.weeklyHours': 'many' });
    expect(bad.errors.map((e) => e.code).sort()).toEqual(['INVALID_DATE', 'INVALID_NUMBER', 'INVALID_OPTION']);
  });
});

describe('official forms: PDF', () => {
  it('lists fields, fills text / check box / radio / dropdown (umlauts and ə) and keeps the form editable', async () => {
    const pdf = await makeFormPdf({ text: ['Familienname', 'Geburtsort'], checkbox: ['ledig'], radio: { Geschlecht: ['maennlich', 'weiblich'] }, dropdown: { Land: ['Deutschland', 'Aserbaidschan'] } });
    const { fields, pages } = await listPdfFields(pdf);
    expect(pages).toBeGreaterThan(0);
    expect(fields.map((f) => [f.name, f.type])).toEqual([
      ['Familienname', 'text'],
      ['Geburtsort', 'text'],
      ['ledig', 'checkbox'],
      ['Geschlecht', 'radio'],
      ['Land', 'dropdown'],
    ]);
    expect(fields.find((f) => f.name === 'Geschlecht')?.options).toEqual(['maennlich', 'weiblich']);
    const out = await fillPdf(pdf, { Familienname: 'MÜLLER', Geburtsort: 'Gəncə', ledig: true, Geschlecht: 'Weiblich', Land: 'Aserbaidschan', Missing: 'x' });
    expect(out.errors).toEqual([{ field: 'Missing', code: 'NO_SUCH_FIELD' }]);
    expect(await readPdfValues(out.pdf)).toEqual({ Familienname: 'MÜLLER', Geburtsort: 'Gəncə', ledig: true, Geschlecht: 'weiblich', Land: 'Aserbaidschan' });
    const bad = await fillPdf(pdf, { Geschlecht: 'divers' });
    expect(bad.errors).toEqual([{ field: 'Geschlecht', code: 'BAD_OPTION' }]);
    // flattened: no form fields left
    const flat = await fillPdf(pdf, { Familienname: 'X' }, { flatten: true });
    expect((await listPdfFields(flat.pdf)).fields).toEqual([]);
  });

  it('rejects files that are not PDFs', async () => {
    await expect(listPdfFields(Buffer.from('hello'))).rejects.toMatchObject({ code: 'INVALID_PDF' });
  });

  it('builds the data sheet fallback', async () => {
    const pdf = await dataSheetPdf({ title: 'Erklärung – Datenblatt', subtitle: 'TV-1 · Əli', note: 'Gelb = fehlt', sections: [{ title: 'Arbeitgeber', rows: [{ label: 'Firma', value: 'Müller GmbH' }, { label: 'Betriebsnummer', value: '', missing: true }] }] });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
