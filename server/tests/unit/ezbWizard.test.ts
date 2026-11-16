import { describe, expect, it } from 'vitest';
import { DATA_KEY_MAP, isDataKey } from '../../src/lib/officialForms/catalog.js';
import { deriveData } from '../../src/lib/officialForms/resolve.js';
import { DEFAULT_TEMPLATES } from '../../src/lib/officialForms/service.js';
import { EZB_FIELDS, ezbDisplayValue, ezbPrefill, ezbSheetSections, isShown, minimumWageOn, validateEzb } from '../../src/lib/officialForms/ezbWizard.js';
import { EMPLOYER_KEYS } from '../../src/lib/officialForms/employer.js';

/** A complete, valid set of employer answers. */
const valid = (): Record<string, string> => ({
  'company.name': 'Spedition Müller GmbH',
  'company.street': 'Hafenstraße',
  'company.houseNumber': '12',
  'company.postalCode': '28195',
  'company.city': 'Bremen',
  'company.email': 'hr@mueller.de',
  'company.phone': '+49 421 1234',
  'company.betriebsnummer': '87654321',
  'company.foundedRecently': 'no',
  'contract.jobTitle': 'Berufskraftfahrer',
  'employment.workplaceMode': 'EMPLOYER_SEAT',
  'employment.leasedToThirdParty': 'no',
  'contract.startDate': '2027-01-01',
  'contract.contractType': 'UNLIMITED',
  'contract.weeklyHours': '40',
  'employment.overtime': 'no',
  'contract.vacationDays': '26',
  'contract.grossMonthly': '3200',
  'employment.collectiveAgreement': 'no',
  'employment.socialInsurance': 'yes',
});

describe('EzB wizard: rules', () => {
  it('every wizard field is an employer data key, and every employer key is in the wizard', () => {
    for (const f of EZB_FIELDS) expect(DATA_KEY_MAP.get(f.key)?.employer, f.key).toBe(true);
    const wizard = new Set(EZB_FIELDS.map((f) => f.key));
    for (const k of EMPLOYER_KEYS) expect(wizard.has(k.key), k.key).toBe(true);
  });

  it('accepts a complete set of answers', () => {
    expect(validateEzb(valid())).toEqual({ errors: [], warnings: [] });
  });

  it('reports missing, pattern, range and date order errors', () => {
    const v = { ...valid(), 'company.betriebsnummer': '1234', 'company.postalCode': '2819', 'contract.weeklyHours': '70', 'contract.contractType': 'FIXED', 'contract.endDate': '2026-12-01', 'company.city': '' };
    const { errors } = validateEzb(v);
    expect(errors).toEqual(
      expect.arrayContaining([
        { key: 'company.betriebsnummer', code: 'PATTERN' },
        { key: 'company.postalCode', code: 'PATTERN' },
        { key: 'contract.weeklyHours', code: 'RANGE' },
        { key: 'contract.endDate', code: 'DATE_ORDER' },
        { key: 'company.city', code: 'REQUIRED' },
      ]),
    );
  });

  it('conditional questions: shown and required only when their condition holds (chains 42 → 43 → 44)', () => {
    const v = valid();
    expect(isShown('employment.tariffApplied', v)).toBe(false);
    expect(isShown('employment.collectiveAgreementName', { ...v, 'employment.tariffApplied': 'yes' })).toBe(false); // 42 = no hides the chain
    const tarif = { ...v, 'employment.collectiveAgreement': 'yes' };
    expect(validateEzb(tarif).errors).toEqual([{ key: 'employment.tariffApplied', code: 'REQUIRED' }]);
    expect(validateEzb({ ...tarif, 'employment.tariffApplied': 'yes' }).errors).toEqual([{ key: 'employment.collectiveAgreementName', code: 'REQUIRED' }]);
    expect(validateEzb({ ...tarif, 'employment.tariffApplied': 'yes', 'employment.collectiveAgreementName': 'TV Güterverkehr Bremen' }).errors).toEqual([]);
    expect(validateEzb({ ...v, 'contract.contractType': 'FIXED' }).errors).toEqual([{ key: 'contract.endDate', code: 'REQUIRED' }]);
    expect(validateEzb({ ...v, 'employment.workplaceMode': 'ADDRESS' }).errors).toEqual([{ key: 'employment.workplaceAddress', code: 'REQUIRED' }]);
    expect(validateEzb({ ...v, 'employment.overtime': 'yes' }).errors).toEqual([{ key: 'employment.overtimeExtent', code: 'REQUIRED' }]);
    expect(validateEzb({ ...v, 'employment.socialInsurance': 'no' }).errors).toEqual([{ key: 'employment.socialInsuranceReason', code: 'REQUIRED' }]);
    // a hidden question's value is not validated
    expect(validateEzb({ ...v, 'contract.endDate': 'garbage' }).errors).toEqual([]);
  });

  it('warns below the statutory minimum wage (MiLoV5) and below the statutory leave', () => {
    expect(minimumWageOn('2026-06-01')).toBe(13.9);
    expect(minimumWageOn('2027-01-01')).toBe(14.6);
    // 2400 € / (40 h × 52/12) = 13.85 €/h: below 14.60 (2027) and below 13.90 (2026)
    expect(validateEzb({ ...valid(), 'contract.grossMonthly': '2400' }).warnings).toEqual([{ key: 'contract.grossMonthly', code: 'BELOW_MINIMUM_WAGE' }]);
    // 2500 € → 14.42 €/h: fine in 2026, below in 2027
    expect(validateEzb({ ...valid(), 'contract.grossMonthly': '2500', 'contract.startDate': '2026-12-01' }).warnings).toEqual([]);
    expect(validateEzb({ ...valid(), 'contract.grossMonthly': '2500' }).warnings).toEqual([{ key: 'contract.grossMonthly', code: 'BELOW_MINIMUM_WAGE' }]);
    expect(validateEzb({ ...valid(), 'contract.vacationDays': '18' }).warnings).toEqual([{ key: 'contract.vacationDays', code: 'VACATION_BELOW_STATUTORY' }]);
  });
});

describe('EzB wizard: prefill, mapping, data sheet', () => {
  it('prefills from the vacancy (KldB, level, place) and the company profile', () => {
    const p = ezbPrefill({
      vacancy: { occupationCode: '52122', description: { de: '<p>Fernverkehr&nbsp;EU</p>' }, city: 'Hamburg', postalCode: '20095' },
      company: { city: 'Bremen', foundedYear: 2010, collectiveAgreement: 'TV Spedition' },
      jobTitle: 'LKW-Fahrer',
      now: new Date('2026-11-16T00:00:00Z'),
    });
    expect(p).toMatchObject({
      'employment.kldbCode': '52122',
      'employment.qualificationRequired': 'VOCATIONAL',
      'employment.jobDescription': 'Fernverkehr EU',
      'employment.workplaceMode': 'ADDRESS',
      'employment.workplaceAddress': '20095 Hamburg',
      'employment.collectiveAgreement': 'yes',
      'employment.collectiveAgreementName': 'TV Spedition',
      'company.foundedRecently': 'no',
    });
    expect(ezbPrefill({ vacancy: { occupationCode: '29301', description: null, city: 'Bremen', postalCode: null }, company: { city: 'bremen', foundedYear: 2026, collectiveAgreement: null }, now: new Date('2026-11-16T00:00:00Z') })).toEqual({
      'employment.kldbCode': '29301',
      'employment.qualificationRequired': 'NONE',
      'company.foundedRecently': 'yes',
    });
    expect(ezbPrefill({ jobTitle: 'Pflegefachkraft' })['employment.licenceRequired']).toBe('yes');
  });

  it('adds the KldB code to question 25 (Berufsbezeichnung und Beschreibung)', () => {
    const d = deriveData({ 'contract.jobTitle': 'Berufskraftfahrer' }, { 'employment.kldbCode': '52122', 'employment.jobDescription': 'Fernverkehr' });
    expect(d['employment.jobTitleDescription']).toBe('Berufskraftfahrer (KldB 2010: 52122) – Fernverkehr');
  });

  it('the shipped EzB mapping only uses known data keys and maps the new questions', () => {
    const ezb = DEFAULT_TEMPLATES.find((t) => t.key === 'EMPLOYMENT_DECLARATION')!;
    for (const m of Object.values(ezb.fieldMap)) if (m.source !== 'const') expect(isDataKey(m.source), m.source).toBe(true);
    expect(ezb.fieldMap.txtf_44_Tarifvertrag.source).toBe('employment.collectiveAgreementName');
    expect(ezb.fieldMap.chbx_34_keine_Ausbildung).toMatchObject({ source: 'employment.qualificationRequired', when: 'NONE' });
    expect(ezb.fieldMap.txtf_56_Ergaemzungen.source).toBe('employment.remarks');
  });

  it('data sheet: official question order, German option texts, missing required highlighted', () => {
    const data = deriveData({ ...valid(), 'company.betriebsnummer': '', 'employment.licenceRequired': 'no' }, {});
    const sections = ezbSheetSections(data);
    expect(sections.map((s) => s.title[0])).toEqual(['C', 'D', 'E', 'G', 'J', 'K']);
    const rows = sections.flatMap((s) => s.rows);
    expect(rows.find((r) => r.label.startsWith('19 '))).toEqual({ label: '19 · Betriebsnummer des Beschäftigungsbetriebes', value: '', missing: true });
    expect(rows.find((r) => r.label.startsWith('22 · Befristung'))?.value).toBe('unbefristet');
    expect(rows.find((r) => r.label.startsWith('21 '))?.value).toBe('01.01.2027');
    expect(rows.some((r) => r.label.includes('befristet bis'))).toBe(false); // hidden for an unlimited contract
    expect(ezbDisplayValue('contract.grossMonthly', '3200.5')).toBe('3.200,50 €');
  });
});
