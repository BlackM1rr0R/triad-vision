import { describe, expect, it } from 'vitest';
import type { BeneficiaryLike } from '../../src/lib/settlement/split.js';
import { nameScore } from '../../src/lib/settlement/parse.js';
import {
  buildShares,
  companyScore,
  mapHeaders,
  normaliseTable,
  parseCsv,
  parseDate,
  parseMoney,
  personKey,
  templateHeaders,
  toCsv,
} from '../../src/lib/settlement/rowImportParse.js';

// Synthetic data only.
const BENS: BeneficiaryLike[] = [
  { id: 'x', name: 'Xalid', rule: 'THIRD_OF_NET', value: 0, currency: null, active: true, sortOrder: 0 },
  { id: 't', name: 'Tofig', rule: 'REMAINDER', value: 0, currency: null, active: true, sortOrder: 1 },
  { id: 'a', name: 'Abdulla', rule: 'REMAINDER', value: 0, currency: null, active: true, sortOrder: 2 },
  { id: 'team', name: 'Team', rule: 'FIXED', value: 20000, currency: 'AZN', active: true, sortOrder: 3 },
];
const COLS = { Xalid: 'x', Tofig: 't', Abdulla: 'a', Team: 'team' };
const HEAD = templateHeaders(['Xalid', 'Tofig', 'Abdulla', 'Team']);
const row = (v: Record<string, string>) => HEAD.map((h) => v[h] ?? '');

describe('settlement row import: money cells', () => {
  it('parses amount + currency as the team writes it', () => {
    expect(parseMoney('3000 manat')).toMatchObject({ cents: 300000, currency: 'AZN', text: null, payAfterVisa: false });
    expect(parseMoney('1500 euro')).toMatchObject({ cents: 150000, currency: 'EUR' });
    expect(parseMoney('4000 azn (viza sonrasi)')).toMatchObject({ cents: 400000, currency: 'AZN', payAfterVisa: true });
    expect(parseMoney('viza sonrasi 2000 euro')).toMatchObject({ cents: 200000, currency: 'EUR', payAfterVisa: true });
    expect(parseMoney('2000azn/2000azn viza sonrasi')).toMatchObject({ cents: 400000, currency: 'AZN', payAfterVisa: true, instalments: [200000, 200000] });
    expect(parseMoney('500 €')).toMatchObject({ cents: 50000, currency: 'EUR' });
    expect(parseMoney(3000)).toMatchObject({ cents: 300000, currency: null });
    expect(parseMoney('0')).toMatchObject({ cents: 0, currency: null });
    expect(parseMoney('')).toMatchObject({ cents: null, currency: null, text: null });
  });

  it('keeps markers ("rawot") and flags currency problems', () => {
    expect(parseMoney('rawot')).toMatchObject({ cents: null, text: 'rawot' });
    expect(parseMoney('RAWOT')).toMatchObject({ cents: null, text: 'rawot' });
    expect(parseMoney('XALID')).toMatchObject({ cents: null, text: 'XALID' });
    expect(parseMoney('1000', 'EUR')).toMatchObject({ cents: 100000, currency: 'EUR', warnings: [] });
    expect(parseMoney('1000 manat', 'EUR').warnings).toContain('CURRENCY_MISMATCH');
    expect(parseMoney('1000 manat', 'EUR').currency).toBe('AZN'); // what is written in the cell wins
    expect(parseMoney('1000', 'TRY').warnings).toContain('UNSUPPORTED_CURRENCY');
    expect(parseMoney('1000 lira').warnings).toContain('UNSUPPORTED_CURRENCY');
    expect(parseMoney('4000 azn (viza sonrasi) +').warnings).toContain('AMOUNT_INCOMPLETE');
  });

  it('reads dates in both orders', () => {
    expect(parseDate('01.06.2026')).toBe('2026-06-01');
    expect(parseDate('2026-07-09')).toBe('2026-07-09');
    expect(parseDate('5/8/26')).toBe('2026-08-05');
    expect(parseDate(new Date(Date.UTC(2026, 8, 17)))).toBe('2026-09-17');
    expect(parseDate('31.02.2026')).toBe('INVALID');
    expect(parseDate('soon')).toBe('INVALID');
    expect(parseDate('')).toBeNull();
  });
});

describe('settlement row import: names and matching keys', () => {
  it('matches Azerbaijani / Latin spellings in any order', () => {
    expect(nameScore('Mammadli Test', 'Test Məmmədli')).toBe(1);
    expect(nameScore('Huseynov Demo', 'Demo Hüseynov')).toBe(1);
    expect(nameScore('Aliyev Sample', 'Əliyev Sample')).toBe(1);
    expect(nameScore('Qasimov Nümunə', 'Gasimov Numune')).toBe(1);
    expect(nameScore('Mammadli Test', 'Mammadli Other')).toBe(0.5);
  });

  it('compares companies without legal forms and partners / beneficiaries without spelling noise', () => {
    expect(companyScore('Example Logistik GmbH', 'example logistik')).toBe(1);
    expect(companyScore('Sample Logistics', 'Sample Logistik GmbH')).toBe(1);
    expect(companyScore('ABC Transporte', 'ABC Transport e.K.')).toBe(1);
    expect(companyScore('Muster Spedition Nord', 'Muster Spedition')).toBe(0.8);
    expect(companyScore('ABC Transport', 'XYZ Transport')).toBe(0);
    expect(personKey('Tofiq')).toBe(personKey('tofig'));
    expect(personKey('Xalid')).toBe(personKey('KHALID'));
  });
});

describe('settlement row import: table reading', () => {
  it('reads CSV with comma, semicolon, quotes, BOM and newlines in quotes', () => {
    expect(parseCsv('﻿a,b,c\r\n1,"x, y",3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', '3'],
    ]);
    expect(parseCsv('a;b\n"he said ""hi""";"two\nlines"\n\n')).toEqual([
      ['a', 'b'],
      ['he said "hi"', 'two\nlines'],
    ]);
    expect(parseCsv(toCsv([['a', 'b;c', 'd"e']]))).toEqual([['a', 'b;c', 'd"e']]);
  });

  it('maps template headers, aliases and currency columns', () => {
    const m = mapHeaders(HEAD);
    expect(m.fields.client).toBe(2);
    expect(m.fields.amount).toBe(8);
    expect(m.fields.currency).toBe(9);
    expect(m.beneficiaries.map((b) => b.name)).toEqual(['Xalid', 'Tofig', 'Abdulla', 'Team']);
    expect(m.currencyOf['ben:Team']).toBe(HEAD.indexOf('Team currency'));
    expect(m.currencyOf.sanani).toBe(HEAD.indexOf('Sanani currency'));
    // The team's own headers work too.
    const az = mapHeaders(['Zwischen Person', 'Musteri adi:', 'Transporte', 'Status', 'Odeniw', 'Sanani', 'Xalid', 'Rasxod']);
    expect(az.fields).toMatchObject({ intermediary: 0, client: 1, employer: 2, status: 3, amount: 4, sanani: 5, expenses: 7 });
    expect(az.beneficiaries.map((b) => b.name)).toEqual(['Xalid']);
  });
});

describe('settlement row import: rows and owner rules', () => {
  const table = [
    ['Synthetic export'],
    HEAD,
    row({ Project: 'P1', Intermediary: 'Partner A', Client: 'Nümunə Test (CE)', Employer: 'Example GmbH', Status: 'TLS/01.06.2026-viza/09.07.2026', Amount: '3000 manat', Xalid: '1000', Tofig: '900', Abdulla: '900', Team: '200', 'Team currency': 'AZN' }),
    row({ Project: 'P1', Client: 'Demo Person (islemeyecek)', 'TLS date': '06.08.2026', Amount: 'viza sonrasi 2000 euro' }),
    row({ Client: 'Refused Sample', Status: 'TLS/01.06.2026-saxta atkaz', Amount: '3000', Currency: 'AZN', Sanani: '500', 'Sanani currency': 'EUR' }),
    row({ Client: 'Cancelled Sample', Amount: '1500 euro', Sanani: '500 euro', Xalid: 'rawot', Tofig: 'rawot', Abdulla: 'rawot' }),
    row({ Client: 'Instalment Sample', Amount: '2000azn/2000azn viza sonrasi' }),
    row({ Client: 'Own Client', Amount: 'RAWOT', Xalid: '0', Tofig: '0', Abdulla: '0', Team: '0' }),
    row({ Client: 'Login Row', Note: 'demo@example.invalid' }),
    row({ Client: 'Cəmi: 7' }),
    row({ Client: '' }),
  ];
  const parsed = normaliseTable(table);
  const byName = (n: string) => parsed.rows.find((r) => r.clientName === n)!;

  it('normalises names, dates, amounts, notes and stages', () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(7);
    expect(parsed.skippedCredentials).toBe(1);
    expect(JSON.stringify(parsed.rows)).not.toContain('@');
    expect(parsed.beneficiaryColumns).toEqual(['Xalid', 'Tofig', 'Abdulla', 'Team']);

    expect(byName('Nümunə Test')).toMatchObject({
      line: 3,
      project: 'P1',
      intermediary: 'Partner A',
      licence: 'CE',
      employer: 'Example GmbH',
      tlsDate: '2026-06-01',
      visaDate: '2026-07-09',
      statusText: null,
      stage: 'VISA',
      amountCents: 300000,
      currency: 'AZN',
      shares: { Xalid: { cents: 100000, currency: null, text: null }, Team: { cents: 20000, currency: 'AZN', text: null } },
    });
    const later = byName('Demo Person');
    expect(later).toMatchObject({ willNotWork: true, payAfterVisa: true, currency: 'EUR', amountCents: 200000, stage: 'IN_PROGRESS', project: 'P1' });
    expect(later.note).toContain('işləməyəcək');
    expect(later.note).toContain('Viza sonrası');
    expect(later.warnings).toContain('WILL_NOT_WORK');

    const refused = byName('Refused Sample');
    expect(refused).toMatchObject({ refused: true, stage: 'REFUSED', statusText: 'saxta atkaz', tlsDate: '2026-06-01', project: 'Ümumi' });
    expect(refused.warnings).toContain('FAKE_REFUSAL');

    expect(byName('Cancelled Sample')).toMatchObject({ cancelled: true, stage: 'CANCELLED', partnerShare: { cents: 50000, currency: 'EUR' } });
    const inst = byName('Instalment Sample');
    expect(inst).toMatchObject({ amountCents: 400000, payAfterVisa: true, instalments: [200000, 200000] });
    expect(inst.note).toContain('Hissələr: 2000 / 2000 AZN');
    expect(byName('Own Client')).toMatchObject({ stage: 'CANCELLED', amountCents: null });
    expect(byName('Login Row').note).toBeNull();
  });

  it('builds shares: rule-equal values stay computed, others are manual', () => {
    const r = byName('Nümunə Test');
    const b = buildShares(r, r.stage, COLS, BENS, 2);
    expect(b.shares).toEqual({}); // 3000 → 1000 / 900 / 900 / 200 is exactly the rule
    const odd = { ...r, shares: { ...r.shares, Xalid: { cents: 133300, currency: null, text: null }, Tofig: { cents: 73300, currency: null, text: null }, Abdulla: { cents: 73300, currency: null, text: null } } };
    const b2 = buildShares(odd, 'VISA', COLS, BENS, 2);
    expect(Object.keys(b2.shares)).toEqual(['x']); // Tofig / Abdulla 733 follow from Xalid 1333
    expect(b2.shares.x).toMatchObject({ cents: 133300, currency: 'AZN', manual: true });
  });

  it('applies the owner rules: refusal cancels all shares, rawot cancels a share, empty cells next to filled ones are not owed', () => {
    const refused = byName('Refused Sample');
    const b = buildShares(refused, refused.stage, COLS, BENS, 2);
    expect(b.partnerShareCents).toBeNull();
    expect(b.notes.join(' ')).toContain('Sanani ləğv edildi (atkaz): 500 EUR');
    for (const id of ['x', 't', 'a', 'team']) expect(b.shares[id]).toMatchObject({ text: 'rawot', status: 'NONE', cents: 0 });

    const cancelled = byName('Cancelled Sample');
    const c = buildShares(cancelled, cancelled.stage, COLS, BENS, 2);
    expect(c.partnerShareCents).toBe(50000);
    expect(c.partnerShareCurrency).toBe('EUR');
    for (const id of ['x', 't', 'a']) expect(c.shares[id]).toMatchObject({ text: 'rawot', status: 'NONE' });
    expect(c.shares.team).toMatchObject({ cents: 0, status: 'NONE', currency: 'AZN' });

    const later = byName('Demo Person');
    expect(buildShares(later, later.stage, COLS, BENS, 2).shares).toEqual({}); // nothing written → the rule
  });

  it('converts expenses in another currency and warns when shares exceed the fee', () => {
    const r = { amountCents: 300000, currency: 'AZN' as const, partnerShare: null, expenses: { cents: 10000, currency: 'EUR' as const, text: null }, shares: { Xalid: { cents: 300000, currency: null, text: null } } };
    const b = buildShares(r, 'NEW', COLS, BENS, 2);
    expect(b.expensesCents).toBe(20000);
    expect(b.notes[0]).toContain('100 EUR');
    expect(b.warnings).toContain('SHARES_EXCEED_AMOUNT');
  });

  it('reports a missing header', () => {
    expect(normaliseTable([['foo', 'bar'], ['1', '2']]).errors).toEqual(['NO_HEADER']);
  });
});
