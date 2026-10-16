import { beforeEach, describe, expect, it, vi } from 'vitest';

// The OCR worker is replaced: tests feed the text tesseract would have read.
const m = vi.hoisted(() => ({
  available: vi.fn(() => true),
  recognize: vi.fn(async (_image: Buffer, _opts?: { rectangle?: unknown }) => ({ data: { text: '', confidence: 0 } })),
  terminate: vi.fn(async () => undefined),
}));
vi.mock('../../src/lib/docsIntel/ocr.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/docsIntel/ocr.js')>()),
  langDataAvailable: m.available,
  getWorker: async () => ({ recognize: m.recognize }),
  terminateWorker: m.terminate,
}));

import { anon } from '../helpers/api';
import { imageSize, mrzCandidates, repairDataLine, repairNameLine, scanResultFromMrz, titleCase } from '../../src/lib/docsIntel/passportScan.js';
import { parseMrz } from '../../src/lib/docsIntel/mrz.js';
import { buildMrz, fakeJpeg, fakePng, monthsFromNow } from './passport-scan.fixtures';

const VALID = buildMrz({ surname: 'ALIYEV', given: 'RAMIL ALI', docNo: 'C01234567', birth: '1990-05-14', expiry: monthsFromNow(48) });
const text = (lines: readonly string[]) => `REPUBLIC OF AZERBAIJAN\nPASSPORT\n${lines.join('\n')}\n`;

const scan = (buf: Buffer, name = 'passport.png', contentType = 'image/png') =>
  anon().post('/api/auth/passport-scan').attach('image', buf, { filename: name, contentType });

beforeEach(() => {
  m.available.mockReturnValue(true);
  m.recognize.mockReset();
  m.recognize.mockResolvedValue({ data: { text: text(VALID), confidence: 88 } });
  m.terminate.mockClear();
});

describe('passport scan helpers', () => {
  it('title-cases MRZ names and keeps multi-part given names', () => {
    expect(titleCase('ALIYEV')).toBe('Aliyev');
    expect(titleCase('ANNA  MARIA')).toBe('Anna Maria');
    expect(titleCase('')).toBe('');
  });

  it('maps an MRZ to fields, checks and warnings', () => {
    const now = new Date('2026-10-16T00:00:00Z');
    const ok = scanResultFromMrz(parseMrz(VALID[0], VALID[1], now), now);
    expect(ok).toMatchObject({
      ok: true,
      fields: { firstName: 'Ramil Ali', lastName: 'Aliyev', birthDate: '1990-05-14', passportNumber: 'C01234567', nationality: 'AZE', sex: 'M' },
      checks: { valid: true },
      warnings: [],
    });

    const expired = buildMrz({ surname: 'X', given: 'Y', docNo: 'AA1234567', birth: '1985-01-01', expiry: '2024-01-01' });
    expect(scanResultFromMrz(parseMrz(expired[0], expired[1], now), now)).toMatchObject({ warnings: ['EXPIRED'] });

    const soon = buildMrz({ surname: 'X', given: 'Y', docNo: 'AA1234567', birth: '1985-01-01', expiry: '2027-03-01' });
    expect(scanResultFromMrz(parseMrz(soon[0], soon[1], now), now)).toMatchObject({ warnings: ['EXPIRES_SOON'] });

    const broken = [VALID[0], VALID[1].slice(0, 19) + ((Number(VALID[1][19]) + 1) % 10) + VALID[1].slice(20)];
    const res = scanResultFromMrz(parseMrz(broken[0], broken[1], now), now);
    expect(res).toMatchObject({ ok: true, checks: { valid: false, birthDate: false }, warnings: ['CHECK_DIGIT'] });
  });

  it('repairs fillers that tesseract read as K / L / C and stray characters', () => {
    const now = new Date('2026-10-16T00:00:00Z');
    // Real tesseract output for a rendered MRZ: fillers read as K/L, one character too many on each line.
    const noisy = `P<AZEALIYEV<<RAMIL<ALI<<<<<<K<<KKLLLLLLLLKLKLK\n${VALID[1].slice(0, 42)}K${VALID[1].slice(42)}`;
    expect(repairNameLine('P<AZEALIYEV<<RAMIL<CALICCCCLLLLLLLLLL')).toBe('P<AZEALIYEV<<RAMIL<CALI'.padEnd(44, '<'));
    // Names ending in L / K / C keep their last letter.
    expect(repairNameLine('P<AZEMAMMADOVA<<AYSEL<<<<<<<<<<<<<<<<<<<<<<<<')).toBe('P<AZEMAMMADOVA<<AYSEL'.padEnd(44, '<'));
    expect(repairNameLine('P<GBRBLACKLOCK<<JACK<<<<<<<<<<<<<<<<<<<<<<<<<')).toBe('P<GBRBLACKLOCK<<JACK'.padEnd(44, '<'));
    const [best] = mrzCandidates(noisy, now);
    expect(best).toMatchObject({ valid: true, surname: 'ALIYEV', givenNames: 'RAMIL ALI', documentNumber: 'C01234567' });
    // A repair is only trusted when the check digits hold.
    expect(repairDataLine(VALID[1])).toEqual([VALID[1]]);
  });

  it('reads the pixel size from PNG and JPEG headers', () => {
    expect(imageSize(fakePng(1600, 1100))).toEqual({ width: 1600, height: 1100 });
    expect(imageSize(fakeJpeg(2000, 1400))).toEqual({ width: 2000, height: 1400 });
    expect(imageSize(Buffer.from('nope'))).toBeNull();
  });
});

// Validation, size limit and "nothing stored" live in passport-scan-validation.test.ts (the scan limiter allows
// 10 requests per file).
describe('POST /api/auth/passport-scan', () => {
  it('reads the MRZ from the bottom of the photo and returns the sign-up fields', async () => {
    const res = await scan(fakePng(1600, 1000));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      ok: true,
      fields: { firstName: 'Ramil Ali', lastName: 'Aliyev', birthDate: '1990-05-14', passportNumber: 'C01234567', nationality: 'AZE', sex: 'M', expiryDate: expect.any(String) },
      checks: { valid: true, documentNumber: true, birthDate: true, expiryDate: true, composite: true },
      warnings: [],
    });
    // Only the bottom crop was needed.
    expect(m.recognize).toHaveBeenCalledTimes(1);
    expect(m.recognize.mock.calls[0][1]).toEqual({ rectangle: { left: 0, top: 600, width: 1600, height: 400 } });
  });

  it('falls back to the whole image when the bottom crop has no MRZ', async () => {
    m.recognize.mockResolvedValueOnce({ data: { text: 'blurry', confidence: 10 } });
    const res = await scan(fakeJpeg(1200, 900), 'p.jpg', 'image/jpeg');
    expect(res.status).toBe(200);
    expect(res.body.fields.lastName).toBe('Aliyev');
    expect(m.recognize).toHaveBeenCalledTimes(2);
    expect(m.recognize.mock.calls[1][1]).toEqual({});
  });

  it('answers 422 MRZ_NOT_FOUND when no MRZ can be read', async () => {
    m.recognize.mockResolvedValue({ data: { text: 'just a selfie', confidence: 5 } });
    const res = await scan(fakePng());
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ ok: false, error: 'MRZ_NOT_FOUND' });
  });

  it('flags an expired passport', async () => {
    const lines = buildMrz({ surname: 'MAMMADOVA', given: 'AYSEL', docNo: 'AA7654321', birth: '1992-02-29', sex: 'F', expiry: '2025-01-31' });
    m.recognize.mockResolvedValue({ data: { text: text(lines), confidence: 80 } });
    const res = await scan(fakePng());
    expect(res.status).toBe(200);
    expect(res.body.fields).toMatchObject({ firstName: 'Aysel', lastName: 'Mammadova', sex: 'F', expiryDate: '2025-01-31' });
    expect(res.body.warnings).toEqual(['EXPIRED']);
  });

  it('answers 503 OCR_UNAVAILABLE without language data', async () => {
    m.available.mockReturnValue(false);
    const res = await scan(fakePng());
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('OCR_UNAVAILABLE');
    expect(m.recognize).not.toHaveBeenCalled();
  });

  it('answers 503 and discards the worker when OCR crashes', async () => {
    m.recognize.mockRejectedValue(new Error('worker died'));
    const res = await scan(fakePng());
    expect(res.status).toBe(503);
    expect(m.terminate).toHaveBeenCalled();
  });

});
