import { describe, expect, it } from 'vitest';
import { computeSplit, effectiveShare, rowShares, type BeneficiaryLike } from '../../src/lib/settlement/split.js';
import {
  formatStatus,
  looksLikeCredential,
  nameScore,
  normaliseName,
  parseAmount,
  parseShareCell,
  parseStatus,
  splitName,
  stageFromColor,
} from '../../src/lib/settlement/parse.js';
import { caseSyncPatch, stageFromCase } from '../../src/lib/settlement/service.js';

const BENS: BeneficiaryLike[] = [
  { id: 'x', name: 'Xalid', rule: 'THIRD_OF_NET', value: 0, currency: null, active: true, sortOrder: 0 },
  { id: 't', name: 'Tofig', rule: 'REMAINDER', value: 0, currency: null, active: true, sortOrder: 1 },
  { id: 'a', name: 'Abdulla', rule: 'REMAINDER', value: 0, currency: null, active: true, sortOrder: 2 },
  { id: 'team', name: 'Team', rule: 'FIXED', value: 20000, currency: 'AZN', active: true, sortOrder: 3 },
];
const RATE = 2;

const units = (amount: number, opts: { currency?: string; partner?: number; partnerCur?: string; expenses?: number } = {}) => {
  const r = computeSplit(
    {
      amountCents: amount * 100,
      currency: opts.currency ?? 'AZN',
      partnerShareCents: opts.partner != null ? opts.partner * 100 : null,
      partnerShareCurrency: opts.partnerCur ?? 'EUR',
      expensesCents: opts.expenses != null ? opts.expenses * 100 : null,
    },
    BENS,
    RATE,
  )!;
  return { x: r.shares.x!.cents / 100, t: r.shares.t!.cents / 100, a: r.shares.a!.cents / 100, team: r.shares.team!.cents / 100, teamCur: r.shares.team!.currency, cur: r.shares.x!.currency, net: r.netCents / 100, rest: r.roundingCents / 100 };
};

describe('settlement split rule', () => {
  it('reproduces the sheet: 3000 / 4000 / 5000 with expenses', () => {
    expect(units(3000)).toMatchObject({ x: 1000, t: 900, a: 900, team: 200, net: 3000, rest: 0 });
    expect(units(4000)).toMatchObject({ x: 1333, t: 1233, a: 1233, team: 200, rest: 1 });
    expect(units(5000, { expenses: 500 })).toMatchObject({ x: 1500, t: 1400, a: 1400, team: 200, net: 4500 });
    expect(units(1500)).toMatchObject({ x: 500, t: 400, a: 400, team: 200 });
  });

  it('rounds Xalid half-up to whole units; the remainder is split equally downwards', () => {
    expect(units(2500)).toMatchObject({ x: 833, t: 733, a: 733, rest: 1 });
    // 3001.5 / 3 = 1000.5 → 1001 (half-up)
    const r = computeSplit({ amountCents: 300150, currency: 'AZN', partnerShareCents: null, partnerShareCurrency: 'EUR', expensesCents: null }, BENS, RATE)!;
    expect(r.shares.x!.cents).toBe(100100);
  });

  it('mixed currency: computes in the payment currency, Team stays 200 AZN but is deducted at the rate', () => {
    expect(units(1500, { currency: 'EUR', partner: 500, partnerCur: 'EUR' })).toMatchObject({ x: 333, t: 283, a: 283, team: 200, teamCur: 'AZN', cur: 'EUR', net: 1000 });
    expect(units(1500, { currency: 'EUR', partner: 0 })).toMatchObject({ x: 500, t: 450, a: 450 });
    // 3000 AZN with a 500 EUR partner share: 500 EUR = 1000 AZN → net 2000
    expect(units(3000, { partner: 500, partnerCur: 'EUR' })).toMatchObject({ net: 2000, x: 667, t: 566, a: 566 });
    // rate change
    const r = computeSplit({ amountCents: 150000, currency: 'EUR', partnerShareCents: null, partnerShareCurrency: 'EUR', expensesCents: null }, BENS, 1.7)!;
    expect(r.shares.t!.cents).toBe(44100); // 1500 − 500 − round(200/1.7 = 117.6 → 118) = 882 → 441
  });

  it('no amount → no shares; percent rule and inactive beneficiaries', () => {
    expect(computeSplit({ amountCents: null, currency: 'AZN', partnerShareCents: null, partnerShareCurrency: 'EUR', expensesCents: null }, BENS, RATE)).toBeNull();
    const bens: BeneficiaryLike[] = [
      { id: 'p', name: 'P', rule: 'PERCENT_OF_NET', value: 1000, currency: null, active: true, sortOrder: 0 },
      { id: 'r', name: 'R', rule: 'REMAINDER', value: 0, currency: null, active: true, sortOrder: 1 },
      { id: 'off', name: 'Off', rule: 'FIXED', value: 50000, currency: 'AZN', active: false, sortOrder: 2 },
    ];
    const r = computeSplit({ amountCents: 100000, currency: 'AZN', partnerShareCents: null, partnerShareCurrency: 'EUR', expensesCents: null }, bens, RATE)!;
    expect(r.shares).toEqual({ p: { cents: 10000, currency: 'AZN' }, r: { cents: 90000, currency: 'AZN' } });
  });

  it('manual values stick, rawot is a non-numeric marker, paid shares are frozen', () => {
    const computed = { cents: 100000, currency: 'AZN' as const };
    expect(effectiveShare(undefined, computed, 'AZN')).toEqual({ cents: 100000, currency: 'AZN', status: 'PENDING' });
    expect(effectiveShare({ cents: 83000, currency: 'AZN', manual: true, status: 'PENDING' }, computed, 'AZN')).toEqual({ cents: 83000, currency: 'AZN', status: 'PENDING', manual: true });
    expect(effectiveShare({ cents: 0, text: 'rawot', manual: true, status: 'NONE' }, computed, 'AZN')).toEqual({ cents: 0, currency: 'AZN', status: 'NONE', text: 'rawot', manual: true });
    expect(effectiveShare({ cents: 90000, currency: 'AZN', status: 'PAID', paidAt: '2026-09-01T00:00:00.000Z' }, computed, 'AZN')).toMatchObject({ cents: 90000, status: 'PAID' });
    expect(effectiveShare({ status: 'PAID' }, computed, 'AZN')).toMatchObject({ cents: 100000, status: 'PAID' });
    expect(effectiveShare(undefined, undefined, 'AZN')).toBeNull();

    const row = rowShares(
      { amountCents: 300000, currency: 'AZN', partnerShareCents: null, partnerShareCurrency: 'EUR', expensesCents: null, shares: { x: { cents: 0, text: 'rawot', manual: true, status: 'NONE' } } },
      BENS,
      RATE,
    );
    expect(row.shares.x).toMatchObject({ text: 'rawot', cents: 0 });
    expect(row.shares.t).toMatchObject({ cents: 90000 });
  });
});

describe('settlement parsers', () => {
  it('amounts: currencies, after-visa, instalments, markers', () => {
    expect(parseAmount('3000 manat')).toMatchObject({ amountCents: 300000, currency: 'AZN', payAfterVisa: false });
    expect(parseAmount('1500 euro')).toMatchObject({ amountCents: 150000, currency: 'EUR' });
    expect(parseAmount('4000 azn (viza sonrasi) +')).toMatchObject({ amountCents: 400000, currency: 'AZN', payAfterVisa: true });
    expect(parseAmount('viza sonrasi 2000 euro')).toMatchObject({ amountCents: 200000, currency: 'EUR', payAfterVisa: true });
    expect(parseAmount('2000azn/2000azn viza sonrasi')).toMatchObject({ amountCents: 400000, currency: 'AZN', payAfterVisa: true, instalments: [200000, 200000] });
    expect(parseAmount('RAWOT')).toMatchObject({ amountCents: null, marker: 'RAWOT' });
    expect(parseAmount('XALID')).toMatchObject({ amountCents: null, marker: 'XALID' });
    expect(parseAmount('')).toMatchObject({ amountCents: null, marker: null });
    expect(parseAmount(2500, 'AZN')).toMatchObject({ amountCents: 250000, currency: 'AZN' });
    expect(parseAmount('1.500 €')).toMatchObject({ amountCents: 150000, currency: 'EUR' });
    expect(parseAmount('12,500 manat')).toMatchObject({ amountCents: 1250000, currency: 'AZN' });
    expect(parseAmount('12,5 euro')).toMatchObject({ amountCents: 1250, currency: 'EUR' });
    expect(parseShareCell('rawot', 'AZN')).toEqual({ cents: 0, currency: 'AZN', text: 'rawot' });
    expect(parseShareCell('RAWOT', 'EUR')).toEqual({ cents: 0, currency: 'EUR', text: 'rawot' });
    expect(parseShareCell('333 euro', 'AZN')).toEqual({ cents: 33300, currency: 'EUR' });
    expect(parseShareCell(0, 'AZN')).toEqual({ cents: 0, currency: 'AZN' });
    expect(parseShareCell('', 'AZN')).toBeNull();
  });

  it('status: TLS / visa dates and refusals', () => {
    const a = parseStatus('TLS/01.06.2026-viza/09.07.2026');
    expect(a.tlsDate?.toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(a.visaDate?.toISOString().slice(0, 10)).toBe('2026-07-09');
    expect(a.stage).toBe('VISA');
    const b = parseStatus('TLS/10.08.2026');
    expect(b).toMatchObject({ stage: 'IN_PROGRESS', visaDate: null });
    expect(b.tlsDate?.toISOString().slice(0, 10)).toBe('2026-08-10');
    expect(parseStatus('TLS/01.06.2026-saxta atkaz')).toMatchObject({ refused: true, stage: 'REFUSED' });
    expect(parseStatus('imtina')).toMatchObject({ stage: 'REFUSED' });
    expect(parseStatus('rədd edildi')).toMatchObject({ stage: 'REFUSED' });
    expect(parseStatus('')).toMatchObject({ stage: 'NEW', tlsDate: null });
    expect(formatStatus(a.tlsDate, a.visaDate, 'VISA')).toBe('TLS/01.06.2026-viza/09.07.2026');
    expect(formatStatus(b.tlsDate, null, 'REFUSED')).toBe('TLS/10.08.2026-atkaz');
  });

  it('names: licence and notes in brackets, transliteration-insensitive matching', () => {
    expect(splitName('Niftaliyev Elvin (CE)')).toEqual({ name: 'Niftaliyev Elvin', licence: 'CE', note: null });
    expect(splitName('Gurbanov Emil {CE}')).toMatchObject({ name: 'Gurbanov Emil', licence: 'CE' });
    expect(splitName('Jafarov Elshad (BC)')).toMatchObject({ licence: 'BC' });
    expect(splitName('Hasanov Vusal (islemeyecek)')).toEqual({ name: 'Hasanov Vusal', licence: null, note: 'islemeyecek' });
    expect(normaliseName('Məmmədov Əli')).toBe(normaliseName('Ali Mammadov'));
    expect(normaliseName('Şəfirov Yalçın')).toBe(normaliseName('Shefirov Yalchin'));
    expect(normaliseName('Xəlilov Pərviz')).toBe(normaliseName('Khalilov Parviz'));
    expect(normaliseName('Qasımov Cahangir')).toBe(normaliseName('Gasimov Jahangir'));
    expect(normaliseName('Ağayev Səid')).toBe(normaliseName('Aghayev Said'));
    expect(normaliseName('Hüseynli Ələkbər')).toBe(normaliseName('Huseynli Alakbar'));
    expect(normaliseName('Gölüşov Ülvi')).toBe(normaliseName('Golushov Ulvi'));
    expect(nameScore('Aliyev Kamran', 'Kamran Aliyev')).toBe(1);
    expect(nameScore('Aliyev Kamran', 'Kamran Aliyev Rauf')).toBe(0.8);
    expect(nameScore('Aliyev Kamran', 'Aliyev Tahir')).toBe(0.5);
    expect(nameScore('Aliyev Kamran', 'Babayev Rustam')).toBe(0);
  });

  it('credentials and fill colours', () => {
    expect(looksLikeCredential('csariyev8@gmailcom Jeyhun12345.')).toBe(true);
    expect(looksLikeCredential('someone@example.com')).toBe(true);
    expect(looksLikeCredential('parol: abc123')).toBe(true);
    expect(looksLikeCredential('Sariyev Jeyhun')).toBe(false);
    expect(stageFromColor('FF00B050')).toBe('VISA');
    expect(stageFromColor('FF92D050')).toBe('VISA');
    expect(stageFromColor('FFFFFF00')).toBe('IN_PROGRESS');
    expect(stageFromColor('FFFF0000')).toBe('REFUSED');
    expect(stageFromColor('FF00B0F0')).toBe('NEW');
    expect(stageFromColor('FFFFFFFF')).toBeNull();
    expect(stageFromColor(undefined)).toBeNull();
  });
});

describe('settlement case sync', () => {
  const base = { stage: 'NEW' as const, stageAuto: true, tlsDate: null, visaDate: null, partnerId: null };
  const c = { id: 'c', status: 'DOCUMENTS_PENDING' as const, appointmentAt: null, visaValidFrom: null, decisionAt: null, partnerId: 'p1' };
  it('maps case statuses to stages and copies dates / partner', () => {
    expect(stageFromCase('APPROVED')).toBe('VISA');
    expect(stageFromCase('REJECTED')).toBe('REFUSED');
    expect(stageFromCase('CANCELLED')).toBe('CANCELLED');
    expect(stageFromCase('APPOINTMENT_SCHEDULED')).toBe('IN_PROGRESS');
    expect(stageFromCase('DOCUMENTS_REVIEW')).toBeNull();
    expect(caseSyncPatch(base, c)).toEqual({ partnerId: 'p1' });
    const at = new Date('2026-09-10T09:00:00Z');
    const vf = new Date('2026-10-01T00:00:00Z');
    expect(caseSyncPatch(base, { ...c, status: 'APPROVED', appointmentAt: at, visaValidFrom: vf })).toEqual({ partnerId: 'p1', stage: 'VISA', tlsDate: at, visaDate: vf });
    // manual stage: only the partner follows
    expect(caseSyncPatch({ ...base, stageAuto: false, partnerId: 'p0' }, { ...c, status: 'REJECTED' })).toEqual({});
  });
});
