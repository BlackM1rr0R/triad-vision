import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ReferralPartner } from '@prisma/client';
import {
  bicValid,
  cleanTags,
  contractDatesInvalid,
  contractReadiness,
  isGermany,
  legalCrossError,
  CustomFieldError,
  customValue,
  ibanValid,
  mergeCustomData,
  normaliseIban,
  normaliseWebsite,
  parseDay,
  partnerProfileShape,
  partnerView,
  profileChanges,
  profileRows,
  stripMaskedProfileInput,
  type FieldDef,
} from '../../src/lib/partners/profile';

const schema = z.object(partnerProfileShape);

const partner = (over: Partial<ReferralPartner> = {}): ReferralPartner => ({
  id: 'p1',
  name: 'Ilqar',
  phone: null,
  email: null,
  note: null,
  active: true,
  userId: null,
  commissionCents: null,
  currency: 'EUR',
  code: null,
  commissionTrigger: 'ASSIGNED',
  visibility: 'MINIMAL',
  partnerType: 'INDIVIDUAL',
  companyName: null,
  contactPerson: null,
  phone2: null,
  whatsapp: null,
  address: null,
  city: null,
  country: null,
  taxId: null,
  bankName: null,
  bankAccountHolder: null,
  iban: null,
  bic: null,
  contractStart: null,
  contractEnd: null,
  preferredLanguage: null,
  website: null,
  tags: null,
  customData: null,
  extraFields: null,
  legalForm: null,
  registerNumber: null,
  registerCourt: null,
  vatId: null,
  betriebsnummer: null,
  street: null,
  postalCode: null,
  signatoryName: null,
  signatoryRole: null,
  createdAt: new Date('2026-10-01T10:00:00Z'),
  updatedAt: new Date('2026-10-01T10:00:00Z'),
  ...over,
});

const defs: FieldDef[] = [
  { id: 'f_text', label: 'Rayon', type: 'TEXT', options: [] },
  { id: 'f_num', label: 'Müştəri sayı', type: 'NUMBER', options: [] },
  { id: 'f_date', label: 'Görüş', type: 'DATE', options: [] },
  { id: 'f_sel', label: 'Kanal', type: 'SELECT', options: ['Instagram', 'Tövsiyə'] },
  { id: 'f_chk', label: 'Müqavilə imzalanıb', type: 'CHECKBOX', options: [] },
  { id: 'f_long', label: 'Təcrübə', type: 'LONG_TEXT', options: [] },
];

describe('partner profile: single values', () => {
  it('checks IBAN check digits and normalises spaces / case', () => {
    expect(normaliseIban('de89 3704 0044 0532 0130 00')).toBe('DE89370400440532013000');
    expect(ibanValid('DE89370400440532013000')).toBe(true);
    expect(ibanValid('AZ21NABZ00000000137010001944')).toBe(true);
    expect(ibanValid('DE88370400440532013000')).toBe(false); // wrong check digits
    expect(ibanValid('DE89')).toBe(false);
  });

  it('checks BIC shape, website and calendar days', () => {
    expect(bicValid('COBADEFFXXX')).toBe(true);
    expect(bicValid('COBADEFF')).toBe(true);
    expect(bicValid('COBA1')).toBe(false);
    expect(normaliseWebsite('triad.az/partner')).toBe('https://triad.az/partner');
    expect(normaliseWebsite('http://instagram.com/ilqar')).toBe('http://instagram.com/ilqar');
    expect(normaliseWebsite('javascript:alert(1)')).toBeNull();
    expect(normaliseWebsite('localhost')).toBeNull();
    expect(parseDay('2026-02-29')).toBeNull();
    expect(parseDay('2028-02-29')).toBe('2028-02-29');
    expect(contractDatesInvalid('2026-05-01', '2026-04-30')).toBe(true);
    expect(contractDatesInvalid(new Date('2026-05-01T00:00:00Z'), '2026-05-01')).toBe(false);
    expect(contractDatesInvalid(null, '2026-01-01')).toBe(false);
  });

  it('cleans tags (trim, empties, case-insensitive duplicates)', () => {
    expect(cleanTags([' VIP ', 'vip', '', 'Gəncə  rayonu'])).toEqual(['VIP', 'Gəncə rayonu']);
  });
});

describe('partner profile: request schema', () => {
  it('keeps everything optional and turns blanks into null', () => {
    expect(schema.parse({})).toEqual({});
    const r = schema.parse({ companyName: '  ', iban: '', bic: ' ', website: '', preferredLanguage: '', contractStart: '', tags: ['a', 'A'], extraFields: [{ label: 'Telegram', value: '' }, { label: 'Ref', value: 'x' }] });
    expect(r).toMatchObject({ companyName: null, iban: null, bic: null, website: null, preferredLanguage: null, contractStart: null, tags: ['a'], extraFields: [{ label: 'Ref', value: 'x' }] });
  });

  it('rejects invalid IBAN, BIC, website, date, language and type', () => {
    for (const bad of [{ iban: 'DE00 1234' }, { bic: '12' }, { website: 'not a url' }, { contractEnd: '2026-13-01' }, { preferredLanguage: 'fr' }, { partnerType: 'GROUP' }, { tags: Array(21).fill('x') }]) {
      expect(schema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(schema.safeParse({ iban: 'de89 3704 0044 0532 0130 00' }).data?.iban).toBe('DE89370400440532013000');
  });

  it('drops masked bank / tax values sent back unchanged', () => {
    expect(stripMaskedProfileInput({ iban: '•••• 3000', bankName: '••••', taxId: '•••• 123', city: 'Bakı' })).toEqual({ city: 'Bakı' });
  });
});

describe('partner profile: admin-defined fields', () => {
  it('validates each type', () => {
    expect(customValue(defs[0], '  Nərimanov ')).toBe('Nərimanov');
    expect(customValue(defs[1], '12,5')).toBe(12.5);
    expect(customValue(defs[2], '2026-11-03')).toBe('2026-11-03');
    expect(customValue(defs[3], 'Instagram')).toBe('Instagram');
    expect(customValue(defs[4], true)).toBe(true);
    expect(customValue(defs[4], false)).toBeNull();
    expect(customValue(defs[0], '')).toBeNull();
    expect(() => customValue(defs[1], 'abc')).toThrow(CustomFieldError);
    expect(() => customValue(defs[2], '03.11.2026')).toThrow(CustomFieldError);
    expect(() => customValue(defs[3], 'TikTok')).toThrow(CustomFieldError);
    expect(() => customValue(defs[0], 'x'.repeat(501))).toThrow(CustomFieldError);
    expect(customValue(defs[5], 'x'.repeat(4000))).toHaveLength(4000);
  });

  it('merges a change, drops cleared and deleted fields, rejects unknown ones', () => {
    expect(mergeCustomData(defs, { f_text: 'A', gone: 'x', f_num: 3 }, { f_num: '', f_sel: 'Tövsiyə' })).toEqual({ f_text: 'A', f_sel: 'Tövsiyə' });
    expect(mergeCustomData(defs, { f_text: 'A' }, { f_text: null })).toBeNull();
    expect(() => mergeCustomData(defs, null, { nope: 'x' })).toThrow(CustomFieldError);
  });
});

describe('partner profile: output and audit', () => {
  const p = partner({
    iban: 'DE89370400440532013000',
    bic: 'COBADEFFXXX',
    bankName: 'Commerzbank',
    bankAccountHolder: 'Ilqar M.',
    taxId: '1234567890',
    contractStart: new Date('2026-01-01T00:00:00Z'),
    tags: ['VIP'],
    customData: { f_sel: 'Instagram', f_chk: true },
    extraFields: [{ label: 'Telegram', value: '@ilqar' }],
  });

  it('masks bank data below ADMIN and formats days / JSON columns', () => {
    const staff = partnerView(p, { canSeeBank: false });
    expect(staff).toMatchObject({ bankLocked: true, iban: '•••• 3000', bic: '••••', bankName: '••••', bankAccountHolder: '••••', contractStart: '2026-01-01', tags: ['VIP'] });
    expect(JSON.stringify(staff)).not.toContain('Commerzbank');
    const admin = partnerView(p, { canSeeBank: true });
    expect(admin).toMatchObject({ bankLocked: false, iban: 'DE89370400440532013000', customData: { f_sel: 'Instagram', f_chk: true }, extraFields: [{ label: 'Telegram', value: '@ilqar' }] });
  });

  it('audits field names only for bank data, before / after for the rest', () => {
    const labels = new Map(defs.map((d) => [d.id, d.label]));
    const { fields, changes } = profileChanges(p as unknown as Record<string, unknown>, { iban: 'AZ21NABZ00000000137010001944', city: 'Gəncə', contractStart: '2026-01-01', customData: { f_sel: 'Tövsiyə', f_chk: true } }, labels);
    expect(fields.sort()).toEqual(['city', 'custom:Kanal', 'iban']);
    expect(changes).toEqual({ city: { from: null, to: 'Gəncə' }, 'custom:Kanal': { from: 'Instagram', to: 'Tövsiyə' } });
    expect(JSON.stringify(changes)).not.toContain('AZ21');
  });

  it('lists the profile for the Excel export (bank rows only for ADMIN+)', () => {
    const staffRows = profileRows(p, defs, { mask: new Set(['TAX_ID']), canSeeBank: false });
    expect(staffRows.find((r) => r[0] === 'IBAN')).toBeUndefined();
    expect(staffRows.find((r) => r[0] === 'VÖEN')?.[1]).toBe('•••• 7890');
    expect(staffRows).toContainEqual(['Kanal', 'Instagram']);
    expect(staffRows).toContainEqual(['Telegram', '@ilqar']);
    expect(staffRows).toContainEqual(['Müqavilə başlanğıcı', '01.01.2026']);
    expect(profileRows(p, defs, { mask: new Set(), canSeeBank: true })).toContainEqual(['IBAN', 'DE89370400440532013000']);
  });
});

describe('partner legal data', () => {
  it('normalises and validates the VAT id, Betriebsnummer and postal code', () => {
    expect(schema.parse({ vatId: 'de 123.456-789', betriebsnummer: '1234 5678' })).toMatchObject({ vatId: 'DE123456789', betriebsnummer: '12345678' });
    expect(schema.safeParse({ vatId: '123' }).success).toBe(false);
    expect(schema.safeParse({ betriebsnummer: '1234567' }).success).toBe(false);
    expect(schema.safeParse({ postalCode: '#1' }).success).toBe(false);
    expect(schema.parse({ vatId: '', betriebsnummer: '' })).toMatchObject({ vatId: null, betriebsnummer: null });
  });

  it('checks Germany-only rules on the merged values', () => {
    expect(isGermany(' Deutschland ')).toBe(true);
    expect(isGermany('Almaniya')).toBe(true);
    expect(isGermany('Azərbaycan')).toBe(false);
    expect(legalCrossError({ country: 'Azərbaycan', betriebsnummer: '12345678' })).toBe('BETRIEBSNUMMER_GERMANY_ONLY');
    expect(legalCrossError({ country: null, betriebsnummer: '12345678' })).toBeNull();
    expect(legalCrossError({ country: 'Germany', postalCode: '8080' })).toBe('INVALID_POSTAL_CODE');
    expect(legalCrossError({ country: 'Azərbaycan', postalCode: 'AZ1000' })).toBeNull();
  });

  it('lists the contract fields that are still missing', () => {
    expect(contractReadiness(partner())).toMatchObject({ missing: ['street', 'postalCode', 'city', 'country', 'taxId', 'phone'] });
    const full = partner({ street: 'Nizami 1', postalCode: 'AZ1000', city: 'Bakı', country: 'Azərbaycan', taxId: '123', whatsapp: '+994' });
    expect(contractReadiness(full)).toEqual({ required: expect.any(Array), missing: [], percent: 100 });
    const gmbh = partner({ partnerType: 'COMPANY', country: 'Deutschland', companyName: 'XTA GmbH', vatId: 'DE123456789' });
    const r = contractReadiness(gmbh);
    expect(r.required).toContain('registerNumber');
    expect(r.missing).not.toContain('taxId'); // the VAT id stands in for the tax number
    expect(r.missing).toEqual(expect.arrayContaining(['legalForm', 'registerNumber', 'registerCourt', 'signatoryName', 'email']));
  });
});
