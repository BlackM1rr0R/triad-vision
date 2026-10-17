import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  docCheckDeps,
  expiryIssue,
  issuesFromScan,
  levelOf,
  runChecks,
  targetForRequirement,
  targetForVaultKind,
} from '../../src/lib/docCheck/checks.js';
import { issuesFromOcrRecord } from '../../src/lib/docCheck/index.js';
import { expiryOf, vaultKindsFor } from '../../src/lib/docCheck/vault.js';
import { imageSize } from '../../src/lib/docsIntel/passportScan.js';

// ─── Header samples ─────────────────────────────────────────────────────

const png = (w: number, h: number) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

/** JPEG with an APP0 + an EXIF-like APP1 segment before the SOFn marker. */
const jpeg = (w: number, h: number, sof = 0xc0) => {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x0a]), Buffer.alloc(8, 0x41)]);
  const sofSeg = Buffer.alloc(19);
  sofSeg[0] = 0xff;
  sofSeg[1] = sof;
  sofSeg.writeUInt16BE(17, 2);
  sofSeg[4] = 8;
  sofSeg.writeUInt16BE(h, 5);
  sofSeg.writeUInt16BE(w, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, app1, sofSeg, Buffer.alloc(16)]);
};

const riff = (chunk: string, payload: Buffer) => Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from(chunk, 'latin1'), Buffer.from([payload.length, 0, 0, 0]), payload]);

const webpLossy = (w: number, h: number) => {
  const p = Buffer.alloc(20);
  p[3] = 0x9d; p[4] = 0x01; p[5] = 0x2a; // VP8 start code at payload offset 3 (file offset 23)
  p.writeUInt16LE(w, 6); // file offset 26
  p.writeUInt16LE(h, 8); // file offset 28
  return riff('VP8 ', p);
};

const webpLossless = (w: number, h: number) => {
  const p = Buffer.alloc(16);
  p[0] = 0x2f;
  const bits = (w - 1) | ((h - 1) << 14);
  p.writeUInt32LE(bits >>> 0, 1);
  return riff('VP8L', p);
};

const webpExtended = (w: number, h: number) => {
  const p = Buffer.alloc(16);
  p.writeUIntLE(w - 1, 4, 3);
  p.writeUIntLE(h - 1, 7, 3);
  return riff('VP8X', p);
};

describe('image header dimensions', () => {
  it('reads PNG IHDR', () => {
    expect(imageSize(png(1200, 800))).toEqual({ width: 1200, height: 800 });
  });

  it('reads JPEG SOF0 / SOF2 after APP segments', () => {
    expect(imageSize(jpeg(4032, 3024))).toEqual({ width: 4032, height: 3024 });
    expect(imageSize(jpeg(640, 480, 0xc2))).toEqual({ width: 640, height: 480 });
  });

  it('reads WebP VP8, VP8L and VP8X', () => {
    expect(imageSize(webpLossy(1600, 900))).toEqual({ width: 1600, height: 900 });
    expect(imageSize(webpLossless(321, 123))).toEqual({ width: 321, height: 123 });
    expect(imageSize(webpExtended(5000, 3000))).toEqual({ width: 5000, height: 3000 });
  });

  it('returns null for garbage and truncated headers', () => {
    expect(imageSize(Buffer.from('not an image at all, just text'))).toBeNull();
    expect(imageSize(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
    expect(imageSize(Buffer.alloc(0))).toBeNull();
  });
});

// ─── Pure rules ─────────────────────────────────────────────────────────

describe('expiry rules', () => {
  const now = new Date('2026-10-17T12:00:00Z');
  it('expired → error, < 6 months → error, < 12 months → warn, later → none', () => {
    expect(expiryIssue('2026-10-01', now)).toMatchObject({ code: 'PASSPORT_EXPIRED', level: 'error' });
    expect(expiryIssue('2027-02-01', now)).toMatchObject({ code: 'PASSPORT_EXPIRES_SOON', level: 'error', params: { months: 3 } });
    expect(expiryIssue('2027-08-01', now)).toMatchObject({ code: 'PASSPORT_EXPIRES_SOON', level: 'warn' });
    expect(expiryIssue('2028-01-01', now)).toBeNull();
    expect(expiryIssue(null, now)).toBeNull();
    expect(expiryIssue('garbage', now)).toBeNull();
  });

  it('levels and targets', () => {
    expect(levelOf([])).toBe('ok');
    expect(levelOf([{ code: 'LOW_RESOLUTION', level: 'warn' }])).toBe('warn');
    expect(levelOf([{ code: 'LOW_RESOLUTION', level: 'warn' }, { code: 'PDF_UNREADABLE', level: 'error' }])).toBe('error');
    expect(targetForRequirement('PHOTO_2')).toBe('PHOTO');
    expect(targetForRequirement('PASSPORT')).toBe('PASSPORT');
    expect(targetForRequirement(null)).toBe('OTHER');
    expect(targetForVaultKind('ID_CARD')).toBe('ID_CARD');
    expect(targetForVaultKind('DIPLOMA')).toBe('OTHER');
  });

  it('scan results: missing MRZ is suspicious only on passports', () => {
    expect(issuesFromScan('PASSPORT', { ok: false, error: 'MRZ_NOT_FOUND' })).toEqual([{ code: 'WRONG_TYPE_SUSPECTED', level: 'warn' }]);
    expect(issuesFromScan('ID_CARD', { ok: false, error: 'MRZ_NOT_FOUND' })).toEqual([]);
  });

  it('OCR job records → issues', () => {
    const now = new Date('2026-10-17T00:00:00Z');
    expect(issuesFromOcrRecord('PASSPORT', { mrz: null, raw: '', confidence: 0, at: '', error: 'MRZ_NOT_FOUND' }, now)).toEqual([{ code: 'WRONG_TYPE_SUSPECTED', level: 'warn' }]);
    expect(issuesFromOcrRecord('PASSPORT', { mrz: { expiryDate: '2026-01-01' }, raw: '', confidence: 90, at: '' }, now)[0]).toMatchObject({ code: 'PASSPORT_EXPIRED' });
    expect(issuesFromOcrRecord('PASSPORT', { skipped: 'pdf', at: '' }, now)).toEqual([]);
    expect(issuesFromOcrRecord('PASSPORT', null, now)).toEqual([]);
  });

  it('requirement keys map to vault kinds', () => {
    expect(vaultKindsFor('PASSPORT')).toEqual(['PASSPORT']);
    expect(vaultKindsFor('PHOTO_2')).toEqual(['PHOTO']);
    expect(vaultKindsFor('DIPLOMA')).toEqual(['DIPLOMA', 'TRANSCRIPT', 'CERTIFICATE']);
    expect(vaultKindsFor('GERMAN_CERT')).toEqual(['LANGUAGE_CERT']);
    expect(vaultKindsFor('VIDEX')).toEqual([]);
    expect(vaultKindsFor(null)).toEqual([]);
  });

  it('vault expiry status', () => {
    const now = new Date('2026-10-17T00:00:00Z');
    expect(expiryOf(null, now)).toEqual({ status: 'none', daysLeft: null });
    expect(expiryOf(new Date('2026-10-01T00:00:00Z'), now).status).toBe('expired');
    expect(expiryOf(new Date('2026-11-16T00:00:00Z'), now)).toEqual({ status: 'soon', daysLeft: 30 });
    expect(expiryOf(new Date('2027-06-01T00:00:00Z'), now).status).toBe('valid');
  });
});

// ─── runChecks on files (OCR mocked) ────────────────────────────────────

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-doccheck-'));
const write = (name: string, buf: Buffer) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, buf);
  return p;
};
const original = { ...docCheckDeps };

describe('runChecks', () => {
  const now = new Date('2026-10-17T00:00:00Z');
  const scan = vi.fn();
  beforeEach(() => {
    scan.mockReset();
    docCheckDeps.ocrAvailable = () => true;
    docCheckDeps.scan = scan;
  });
  afterEach(() => Object.assign(docCheckDeps, original));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const passportScan = (expiryDate: string) => ({
    ok: true as const,
    fields: { firstName: 'Ali', lastName: 'Aliyev', birthDate: '1990-01-01', passportNumber: 'C01234567', nationality: 'AZE', sex: 'M' as const, expiryDate },
    checks: { valid: true, documentNumber: true, birthDate: true, expiryDate: true, composite: true },
    warnings: [],
  });

  it('a readable PDF is ok; a broken or encrypted-looking one is PDF_UNREADABLE', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const good = write('good.pdf', Buffer.from(await pdf.save()));
    expect((await runChecks({ path: good, mimeType: 'application/pdf', target: 'OTHER', now })).checks).toMatchObject({ level: 'ok', issues: [] });

    const broken = write('broken.pdf', Buffer.from('%PDF-1.7\n garbage without objects'));
    const r = await runChecks({ path: broken, mimeType: 'application/pdf', target: 'OTHER', now });
    expect(r.checks.level).toBe('error');
    expect(r.checks.issues.map((i) => i.code)).toEqual(['PDF_UNREADABLE']);

    const noPages = write('nopages.pdf', Buffer.from(await (await PDFDocument.create()).save({ addDefaultPage: false })));
    expect((await runChecks({ path: noPages, mimeType: 'application/pdf', target: 'OTHER', now })).checks.issues.map((i) => i.code)).toEqual(['PDF_UNREADABLE']);
  });

  it('photo requirement with a PDF → PHOTO_NOT_IMAGE', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const p = write('photo.pdf', Buffer.from(await pdf.save()));
    const r = await runChecks({ path: p, mimeType: 'application/pdf', target: 'PHOTO', now });
    expect(r.checks.issues).toEqual([{ code: 'PHOTO_NOT_IMAGE', level: 'error' }]);
  });

  it('tiny images → LOW_RESOLUTION warning; large ones pass', async () => {
    const small = write('small.png', png(400, 300));
    expect((await runChecks({ path: small, mimeType: 'image/png', target: 'PHOTO', now })).checks).toMatchObject({
      level: 'warn',
      issues: [{ code: 'LOW_RESOLUTION', level: 'warn', params: { width: 400, height: 300 } }],
    });
    const big = write('big.jpg', jpeg(2000, 1500));
    expect((await runChecks({ path: big, mimeType: 'image/jpeg', target: 'PHOTO', now })).checks.level).toBe('ok');
    expect(scan).not.toHaveBeenCalled();
  });

  it('empty file → EMPTY_FILE', async () => {
    const p = write('empty.png', Buffer.alloc(0));
    expect((await runChecks({ path: p, mimeType: 'image/png', target: 'OTHER', now })).checks.issues[0].code).toBe('EMPTY_FILE');
  });

  it('passport: OCR with the 8 s budget; expiry and missing MRZ become issues', async () => {
    const p = write('passport.jpg', jpeg(2000, 1400));
    scan.mockResolvedValueOnce(passportScan('2027-01-10'));
    const soon = await runChecks({ path: p, mimeType: 'image/jpeg', target: 'PASSPORT', now });
    expect(scan).toHaveBeenCalledWith(expect.any(Buffer), { timeoutMs: 8000, now });
    expect(soon.checks.issues).toEqual([{ code: 'PASSPORT_EXPIRES_SOON', level: 'error', params: { expiryDate: '2027-01-10', months: 2 } }]);
    expect(soon.scan?.fields.lastName).toBe('Aliyev');

    scan.mockResolvedValueOnce(passportScan('2020-01-01'));
    expect((await runChecks({ path: p, mimeType: 'image/jpeg', target: 'PASSPORT', now })).checks.issues[0].code).toBe('PASSPORT_EXPIRED');

    scan.mockResolvedValueOnce(passportScan('2027-07-01'));
    expect((await runChecks({ path: p, mimeType: 'image/jpeg', target: 'PASSPORT', now })).checks).toMatchObject({ level: 'warn' });

    scan.mockResolvedValueOnce(passportScan('2030-01-01'));
    expect((await runChecks({ path: p, mimeType: 'image/jpeg', target: 'PASSPORT', now })).checks).toMatchObject({ level: 'ok', issues: [] });

    scan.mockResolvedValueOnce({ ok: false, error: 'MRZ_NOT_FOUND' });
    expect((await runChecks({ path: p, mimeType: 'image/jpeg', target: 'PASSPORT', now })).checks.issues).toEqual([{ code: 'WRONG_TYPE_SUSPECTED', level: 'warn' }]);
  });

  it('passport OCR timeout → pending; OCR crash → no issue; OCR unavailable → skipped', async () => {
    const p = write('passport2.jpg', jpeg(2000, 1400));
    scan.mockResolvedValueOnce({ ok: false, error: 'OCR_TIMEOUT' });
    expect((await runChecks({ path: p, mimeType: 'image/jpeg', target: 'PASSPORT', now })).checks).toMatchObject({ level: 'ok', pending: true });

    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    scan.mockRejectedValueOnce(new Error('worker died'));
    const crashed = await runChecks({ path: p, mimeType: 'image/jpeg', target: 'PASSPORT', now });
    expect(crashed.checks).toMatchObject({ level: 'ok', issues: [] });
    expect(crashed.checks.pending).toBeUndefined();
    spy.mockRestore();

    docCheckDeps.ocrAvailable = () => false;
    await runChecks({ path: p, mimeType: 'image/jpeg', target: 'PASSPORT', now });
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('passport PDF is not OCR-ed', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const p = write('passport.pdf', Buffer.from(await pdf.save()));
    expect((await runChecks({ path: p, mimeType: 'application/pdf', target: 'PASSPORT', now })).checks.level).toBe('ok');
    expect(scan).not.toHaveBeenCalled();
  });
});
