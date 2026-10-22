import { describe, expect, it } from 'vitest';
import { borderContact, exposure, glarePatch, pixelReasons, resolutionReason, sharpness, toGray, THRESHOLDS } from '../../src/lib/uploadAi/quality.js';
import { combineGuesses, datesFromText, guessFromFilename, guessFromText, scoreText, typeFromFreeText } from '../../src/lib/uploadAi/classify.js';
import { namePart, proposedFileName, transliterate } from '../../src/lib/uploadAi/naming.js';
import { reuploadNote } from '../../src/lib/uploadAi/texts.js';
import { typeForRequirementKey, satisfiesKey } from '../../src/lib/uploadAi/types.js';
import { syntheticPage } from '../helpers/syntheticImages';

const codes = (g: ReturnType<typeof syntheticPage>) => pixelReasons(g).reasons.map((r) => `${r.code}:${r.level}`);

describe('scan quality metrics (synthetic grayscale pages)', () => {
  it('a sharp, well-exposed page passes', () => {
    expect(codes(syntheticPage())).toEqual([]);
    expect(codes(syntheticPage({ desk: true }))).toEqual([]); // paper on a desk: margins are not "cut off"
  });

  it('blur lowers the Laplacian percentile: slight blur warns, strong blur is BAD', () => {
    const sharp = sharpness(syntheticPage());
    const soft = sharpness(syntheticPage({ blur: 1 }));
    const blurred = sharpness(syntheticPage({ blur: 3 }));
    expect(sharp.p995).toBeGreaterThan(THRESHOLDS.blurWarn);
    expect(soft.p995).toBeLessThan(sharp.p995);
    expect(blurred.p995).toBeLessThan(THRESHOLDS.blurBad);
    expect(blurred.variance).toBeLessThan(soft.variance);
    expect(codes(syntheticPage({ blur: 1 }))).toEqual(['BLURRY:WARN']);
    expect(codes(syntheticPage({ blur: 3 }))).toEqual(['BLURRY:BAD']);
  });

  it('text running into three borders is CUT_OFF BAD; margins are fine', () => {
    expect(borderContact(syntheticPage({ cut: true })).touching.length).toBeGreaterThanOrEqual(3);
    expect(borderContact(syntheticPage()).touching).toEqual([]);
    expect(codes(syntheticPage({ cut: true }))).toContain('CUT_OFF:BAD');
  });

  it('dark, blank and glare', () => {
    expect(exposure(syntheticPage({ gain: 0.15 })).mean).toBeLessThan(THRESHOLDS.darkBad);
    expect(codes(syntheticPage({ gain: 0.15 }))).toContain('TOO_DARK:BAD');
    expect(codes(syntheticPage({ blank: true }))).toEqual(['NO_CONTENT:BAD']);
    expect(glarePatch(syntheticPage({ desk: true, glare: true }))).toBeGreaterThan(THRESHOLDS.glareWarn);
    // a fully white, saturated scan is not glare
    const white = { data: new Uint8Array(400 * 400).fill(255), width: 400, height: 400 };
    expect(glarePatch(white)).toBe(0);
    expect(codes(syntheticPage({ glare: true }))).toContain('GLARE:WARN');
  });

  it('resolution thresholds per kind of upload', () => {
    expect(resolutionReason(4000, 3000, 'document')).toBeNull();
    expect(resolutionReason(1200, 800, 'document')).toMatchObject({ code: 'LOW_RESOLUTION', level: 'WARN' });
    expect(resolutionReason(500, 400, 'document')).toMatchObject({ level: 'BAD' });
    expect(resolutionReason(700, 900, 'photo')).toBeNull();
  });

  it('RGBA → luminance', () => {
    const g = toGray(new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]), 3, 1);
    expect([...g.data]).toEqual([255, 0, 76]);
  });

  it('runs fast on a phone-sized analysis copy', () => {
    const g = syntheticPage({ width: 900, height: 1200 });
    const t = Date.now();
    pixelReasons(g);
    expect(Date.now() - t).toBeLessThan(1000);
  });
});

describe('deterministic recognition', () => {
  it('file names in four languages', () => {
    expect(guessFromFilename('pasport_ali.jpg')?.type).toBe('PASSPORT');
    expect(guessFromFilename('Reisepass Məmmədov.pdf')?.type).toBe('PASSPORT');
    expect(guessFromFilename('паспорт.jpg')?.type).toBe('PASSPORT');
    expect(guessFromFilename('Lebenslauf_2024.docx')?.type).toBe('CV');
    expect(guessFromFilename('diplom.pdf')?.type).toBe('DIPLOMA');
    expect(guessFromFilename('sürücülük vəsiqəsi.jpg')?.type).toBe('DRIVING_LICENCE');
    expect(guessFromFilename('Anerkennungsbescheid ZAB.pdf')?.type).toBe('RECOGNITION_DECISION');
    expect(guessFromFilename('IMG_20240101_1234.jpg')).toBeNull();
    expect(guessFromFilename('scan.pdf')).toBeNull();
  });

  it('text layer: strong keywords give a confident type, specific beats generic', () => {
    const t = guessFromText('Goethe-Zertifikat B1. Prüfungsteilnehmer: Ali Mammadov. Goethe-Institut Baku. Zertifikat Deutsch.');
    expect(t?.type).toBe('LANGUAGE_CERT');
    expect(t!.confidence).toBeGreaterThanOrEqual(0.8);
    expect(scoreText('Diploma supplement — transcript of records, ECTS credits, diploma')[0].type).toBe('TRANSCRIPT');
    expect(guessFromText('hello')).toBeNull();
  });

  it('file name + text agreeing raise the confidence', () => {
    const c = combineGuesses({ type: 'CV', confidence: 0.6, score: 3 }, { type: 'CV', confidence: 0.72, score: 3 });
    expect(c?.confidence).toBeGreaterThan(0.8);
    expect(combineGuesses({ type: 'CV', confidence: 0.6, score: 3 }, { type: 'DIPLOMA', confidence: 0.72, score: 3 })?.type).toBe('DIPLOMA');
  });

  it('dates near "valid until" / "issued"', () => {
    expect(datesFromText('Ausgestellt am 01.02.2020 — gültig bis 04.05.2031')).toEqual({ issueDate: '2020-02-01', expiryDate: '2031-05-04' });
    expect(datesFromText('Date of expiry: 2030-12-31')).toEqual({ expiryDate: '2030-12-31' });
    expect(datesFromText('no dates here')).toEqual({});
  });

  it('maps the AI document check free text onto types', () => {
    expect(typeFromFreeText('Passport')).toBe('PASSPORT');
    expect(typeFromFreeText('Bachelor diploma')).toBe('DIPLOMA');
    expect(typeFromFreeText('LANGUAGE_CERT')).toBe('LANGUAGE_CERT');
    expect(typeFromFreeText('National ID')).toBe('ID_CARD');
    expect(typeFromFreeText('something else')).toBeNull();
  });

  it('requirement keys ↔ types', () => {
    expect(typeForRequirementKey('PASSPORT')).toBe('PASSPORT');
    expect(typeForRequirementKey('GERMAN_CERT')).toBe('LANGUAGE_CERT');
    expect(typeForRequirementKey('SIGNED_CONTRACT')).toBe('EMPLOYMENT_CONTRACT');
    expect(typeForRequirementKey('VIDEX')).toBeNull();
    expect(satisfiesKey('TRANSCRIPT', 'DIPLOMA')).toBe(true);
    expect(satisfiesKey('DIPLOMA', 'PASSPORT')).toBe(false);
  });
});

describe('standard file names', () => {
  it('transliterates Azerbaijani and Cyrillic for file names', () => {
    expect(transliterate('Məmmədov')).toBe('Mammadov');
    expect(transliterate('Şükürov')).toBe('Shukurov');
    expect(transliterate('Çingiz Ağayev')).toBe('Chingiz Agayev');
    expect(transliterate('Иванов')).toBe('Ivanov');
    expect(namePart('ƏLİ VƏLİ')).toBe('Ali-Vali');
  });

  it('<Surname>_<Firstname>_<DocType>_<date>.<ext>', () => {
    expect(proposedFileName({ type: 'PASSPORT', fields: { lastName: 'MAMMADOV', firstName: 'ALI', expiryDate: '2031-05-04' }, currentName: 'IMG_1.JPG' })).toBe('Mammadov_Ali_Reisepass_2031-05-04.jpg');
    expect(proposedFileName({ type: 'DIPLOMA', fields: { issueDate: '2015' }, currentName: 'scan.pdf', person: { firstName: 'Əli', lastName: 'Məmmədov' } })).toBe('Mammadov_Ali_Diplom_2015.pdf');
    expect(proposedFileName({ type: 'CV', fields: {}, currentName: 'x.docx', person: { firstName: 'Ali', lastName: 'Aliyev' } })).toBe('Aliyev_Ali_Lebenslauf.docx');
    expect(proposedFileName({ type: 'CV', fields: {}, currentName: 'x.docx' })).toBeNull();
  });
});

describe('re-upload note', () => {
  it('lists the problems, tips and the wrong type in the client language', () => {
    const de = reuploadNote('de', { reasons: [{ code: 'BLURRY', level: 'BAD' }, { code: 'CUT_OFF', level: 'BAD' }], found: 'DIPLOMA', expected: 'PASSPORT' });
    expect(de).toContain('Diplom');
    expect(de).toContain('Reisepass');
    expect(de).toContain('unscharf');
    expect(de).toContain('ohne Blitz');
    const ru = reuploadNote('ru', { reasons: [{ code: 'TOO_DARK', level: 'BAD' }] });
    expect(ru).toContain('тёмное');
    expect(ru).toContain('загрузите');
  });
});
