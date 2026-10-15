import { describe, expect, it } from 'vitest';
import { checkDigit, findMrzLines, normaliseLine, parseMrz, parseMrzText, toDigits, toLetters } from '../../src/lib/docsIntel/mrz.js';

/** ICAO 9303 specimen (Utopia, Anna Maria Eriksson). */
const L1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
const L2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
const NOW = new Date('2026-10-15T00:00:00Z');

describe('checkDigit', () => {
  it('matches the ICAO examples', () => {
    expect(checkDigit('L898902C3')).toBe(6);
    expect(checkDigit('740812')).toBe(2);
    expect(checkDigit('120415')).toBe(9);
    expect(checkDigit('ZE184226B<<<<<')).toBe(1);
    expect(checkDigit('<<<<<<')).toBe(0);
  });
});

describe('parseMrz', () => {
  it('parses the ICAO specimen with every check digit valid', () => {
    const r = parseMrz(L1, L2, NOW);
    expect(r).toMatchObject({
      format: 'TD3',
      documentType: 'P',
      issuingCountry: 'UTO',
      surname: 'ERIKSSON',
      givenNames: 'ANNA MARIA',
      documentNumber: 'L898902C3',
      nationality: 'UTO',
      birthDate: '1974-08-12',
      sex: 'F',
      expiryDate: '2012-04-15',
      optionalData: 'ZE184226B',
      valid: true,
    });
    expect(r.checks).toEqual({ documentNumber: true, birthDate: true, expiryDate: true, optionalData: true, composite: true });
    expect(r.lines).toEqual([L1, L2]);
  });

  it('flags a wrong document-number check digit and composite', () => {
    const bad = `${L2.slice(0, 9)}7${L2.slice(10)}`;
    const r = parseMrz(L1, bad, NOW);
    expect(r.valid).toBe(false);
    expect(r.checks.documentNumber).toBe(false);
    expect(r.checks.birthDate).toBe(true);
    expect(r.checks.expiryDate).toBe(true);
    expect(r.checks.composite).toBe(false);
  });

  it('flags a corrupted birth date', () => {
    const bad = `${L2.slice(0, 13)}740813${L2.slice(19)}`;
    const r = parseMrz(L1, bad, NOW);
    expect(r.checks.birthDate).toBe(false);
    expect(r.valid).toBe(false);
  });

  it('repairs O/0 and I/1 confusions in numeric fields', () => {
    // 7408122 → 74O8I22 ; 1204159 → I2O4I59 ; composite 0 → O
    const noisy = `${L2.slice(0, 13)}74O8I22F I2O4I59${L2.slice(28, 43)}O`.replace(' ', '');
    const r = parseMrz(L1, noisy, NOW);
    expect(r.birthDate).toBe('1974-08-12');
    expect(r.expiryDate).toBe('2012-04-15');
    expect(r.valid).toBe(true);
  });

  it('repairs a document number whose digits were read as letters', () => {
    // L898902C3 → L8989O2C3 (0 read as O); the check digit still identifies the right reading
    const noisy = `L8989O2C3${L2.slice(9)}`;
    const r = parseMrz(L1, noisy, NOW);
    expect(r.documentNumber).toBe('L898902C3');
    expect(r.checks.documentNumber).toBe(true);
    expect(r.valid).toBe(true);
  });

  it('repairs digits inside name and nationality fields', () => {
    const r = parseMrz('P<UT0ER1KSS0N<<ANNA<MAR1A<<<<<<<<<<<<<<<<<<<', `${L2.slice(0, 10)}UT0${L2.slice(13)}`, NOW);
    expect(r.issuingCountry).toBe('UTO');
    expect(r.surname).toBe('ERIKSSON');
    expect(r.givenNames).toBe('ANNA MARIA');
    expect(r.nationality).toBe('UTO');
  });

  it('handles short / padded / lower-case lines with spaces', () => {
    const r = parseMrz('p<utoeriksson<<anna<maria', 'L898902C36UTO7408122F1204159ZE184226B<<<<<10 ', NOW);
    expect(r.valid).toBe(true);
    expect(r.surname).toBe('ERIKSSON');
  });

  it('picks the century of the birth year relative to today', () => {
    expect(parseMrz(L1, L2, new Date('2080-01-01T00:00:00Z')).birthDate).toBe('2074-08-12');
    const young = `${L2.slice(0, 13)}200101${checkDigit('200101')}${L2.slice(20)}`;
    expect(parseMrz(L1, young, NOW).birthDate).toBe('2020-01-01');
  });

  it('treats an empty optional field with "<" check as valid', () => {
    const opt = '<<<<<<<<<<<<<<';
    const base = `${L2.slice(0, 28)}${opt}<`;
    const composite = checkDigit(base.slice(0, 10) + base.slice(13, 20) + base.slice(21, 43));
    const r = parseMrz(L1, `${base}${composite}`, NOW);
    expect(r.optionalData).toBe('');
    expect(r.checks.optionalData).toBe(true);
    expect(r.valid).toBe(true);
  });

  it('never throws on garbage', () => {
    expect(parseMrz('', '', NOW).valid).toBe(false);
    expect(parseMrz('!!!', '###', NOW).valid).toBe(false);
  });
});

describe('findMrzLines / parseMrzText', () => {
  it('finds the two lines in noisy OCR output', () => {
    const text = `REPUBLIC OF UTOPIA\nPASSPORT\n\n  ${L1.slice(0, 20)} ${L1.slice(20)}\n${L2}\n`;
    expect(findMrzLines(text)).toEqual([L1, L2]);
    expect(parseMrzText(text, NOW)?.valid).toBe(true);
  });

  it('returns null when there is no MRZ', () => {
    expect(findMrzLines('just a photo\nnothing here')).toBeNull();
    expect(parseMrzText('', NOW)).toBeNull();
  });

  it('normalises guillemets and foreign characters', () => {
    expect(normaliseLine('P«UTOERIKSSON«ANNA<MARIA').startsWith('P<<UTOERIKSSON<<ANNA<MARIA')).toBe(true);
    expect(normaliseLine('ÄBC')).toHaveLength(44);
  });

  it('digit/letter helpers', () => {
    expect(toDigits('O1I2S5B8')).toBe('01125588');
    expect(toLetters('0O1I')).toBe('OOII');
  });
});
