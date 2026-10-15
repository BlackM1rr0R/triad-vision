import { expiryState, mrzName, mrzOf, ocrOutcome, ocrUnavailable } from '@/lib/ocr';
import type { Mrz } from '@/types';

const mrz: Mrz = {
  documentType: 'P',
  issuingCountry: 'AZE',
  surname: 'ALIYEV',
  givenNames: 'ALI',
  documentNumber: 'C01234567',
  nationality: 'AZE',
  birthDate: '1990-05-01',
  sex: 'M',
  expiryDate: '2030-01-01',
  valid: true,
};

describe('ocr helpers', () => {
  it('classifies the record', () => {
    expect(ocrOutcome(null)).toBe('pending');
    expect(ocrOutcome({ mrz, raw: '', confidence: 90, at: 'x' })).toBe('done');
    expect(ocrOutcome({ mrz: null, raw: '', confidence: 10, at: 'x', error: 'MRZ_NOT_FOUND' })).toBe('failed');
    expect(ocrOutcome({ skipped: 'pdf', at: 'x' })).toBe('failed');
    expect(ocrOutcome({ error: 'boom', at: 'x' })).toBe('failed');
  });

  it('extracts the MRZ only from a successful record', () => {
    expect(mrzOf({ mrz, raw: '', confidence: 1, at: 'x' })).toBe(mrz);
    expect(mrzOf({ skipped: 'pdf', at: 'x' })).toBeNull();
    expect(mrzOf(undefined)).toBeNull();
  });

  it('hides the feature for 404 / 501 / 503 / OCR_UNAVAILABLE', () => {
    expect(ocrUnavailable(404, 'NOT_FOUND')).toBe(true);
    expect(ocrUnavailable(501, 'UNKNOWN')).toBe(true);
    expect(ocrUnavailable(503, 'OCR_UNAVAILABLE')).toBe(true);
    expect(ocrUnavailable(400, 'NO_MRZ')).toBe(false);
    expect(ocrUnavailable(undefined, 'NETWORK')).toBe(false);
  });

  it('formats the name and the expiry state', () => {
    expect(mrzName(mrz)).toBe('ALIYEV ALI');
    expect(mrzName({ surname: 'X', givenNames: '' })).toBe('X');
    const now = Date.UTC(2026, 9, 15);
    expect(expiryState('2030-01-01', now)).toBe('ok');
    expect(expiryState('2027-03-01', now)).toBe('soon');
    expect(expiryState('2026-01-01', now)).toBe('expired');
    expect(expiryState('', now)).toBeNull();
    expect(expiryState('nope', now)).toBeNull();
  });
});
