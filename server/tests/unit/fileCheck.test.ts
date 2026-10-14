import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { bufferMatches, CASE_DOC_MIME, FileCheckError, IMAGE_MIME, INLINE_MIME, resolveMime, verifyStoredFile, WORKSPACE_MIME } from '../../src/lib/fileCheck.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-filecheck-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

describe('resolveMime', () => {
  it('keeps a known type that matches the extension', () => {
    expect(resolveMime('application/pdf', 'a.PDF')).toBe('application/pdf');
    expect(resolveMime('image/jpeg', 'photo.jpeg')).toBe('image/jpeg');
  });

  it('falls back to the extension when the client sends a generic or wrong type', () => {
    expect(resolveMime('application/octet-stream', 'sheet.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(resolveMime('image/png', 'contract.pdf')).toBe('application/pdf');
    expect(resolveMime('application/x-zip-compressed', 'a.zip')).toBe('application/x-zip-compressed');
  });

  it('returns null for unknown or dangerous extensions', () => {
    expect(resolveMime('text/html', 'page.html')).toBeNull();
    expect(resolveMime('application/pdf', 'run.exe')).toBeNull();
    expect(resolveMime('image/png', 'noext')).toBeNull();
    expect(resolveMime('application/javascript', 'x.js')).toBeNull();
  });
});

describe('bufferMatches', () => {
  it.each([
    ['application/pdf', PDF, true],
    ['application/pdf', PNG, false],
    ['image/png', PNG, true],
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xdb]), true],
    ['image/webp', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]), true],
    ['image/webp', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]), false],
    ['image/avif', Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif')]), true],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ZIP, true],
    ['application/msword', OLE, true],
    ['application/msword', ZIP, false],
    ['text/plain', Buffer.from('hello\nworld'), true],
    ['text/plain', Buffer.from('bin\0ary'), false],
    ['text/csv', Buffer.from('<html><script>x</script>'), false],
    ['image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), true],
    ['image/svg+xml', Buffer.from('<svg><script>alert(1)</script></svg>'), false],
    ['image/svg+xml', Buffer.from('<svg onload="alert(1)"/>'), false],
    ['application/rtf', Buffer.from('{\\rtf1\\ansi'), true],
    ['text/html', Buffer.from('<html>'), false],
  ])('%s → %s', (mime, buf, ok) => {
    expect(bufferMatches(buf, mime)).toBe(ok);
  });

  it('rejects empty buffers', () => {
    expect(bufferMatches(Buffer.alloc(0), 'application/pdf')).toBe(false);
  });
});

describe('verifyStoredFile', () => {
  it('accepts a matching file and rejects a mismatching one', async () => {
    const good = path.join(tmp, 'good.pdf');
    fs.writeFileSync(good, PDF);
    await expect(verifyStoredFile(good, 'application/pdf')).resolves.toBeUndefined();
    const bad = path.join(tmp, 'bad.pdf');
    fs.writeFileSync(bad, '<html>');
    await expect(verifyStoredFile(bad, 'application/pdf')).rejects.toMatchObject({ code: 'FILE_CONTENT_MISMATCH' });
    await expect(verifyStoredFile(good, 'text/html')).rejects.toBeInstanceOf(FileCheckError);
    const empty = path.join(tmp, 'empty.png');
    fs.writeFileSync(empty, '');
    await expect(verifyStoredFile(empty, 'image/png')).rejects.toMatchObject({ code: 'FILE_CONTENT_MISMATCH' });
  });
});

describe('type sets', () => {
  it('never allow browser-executable types', () => {
    for (const set of [CASE_DOC_MIME, IMAGE_MIME, WORKSPACE_MIME, INLINE_MIME]) {
      expect(set.has('text/html')).toBe(false);
      expect(set.has('application/javascript')).toBe(false);
      expect(set.has('application/x-msdownload')).toBe(false);
    }
    expect(WORKSPACE_MIME.has('image/svg+xml')).toBe(false);
    expect(INLINE_MIME.has('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(false);
  });
});
