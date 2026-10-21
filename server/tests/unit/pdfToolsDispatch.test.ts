import { describe, expect, it } from 'vitest';
import { heicToJpeg, isHeic, toolKind } from '../../src/lib/pdfTools/images.js';
import { parseRanges } from '../../src/lib/pdfTools/core.js';

const ftyp = (major: string, ...compat: string[]) => {
  const body = Buffer.concat([Buffer.from(major), Buffer.from([0, 0, 0, 0]), ...compat.map((c) => Buffer.from(c))]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(8 + body.length);
  return Buffer.concat([size, Buffer.from('ftyp'), body, Buffer.alloc(64)]);
};

describe('pdf tools: file kind dispatch', () => {
  it('recognises HEIC/HEIF by content (not AVIF)', () => {
    expect(isHeic(ftyp('heic', 'mif1', 'heic'))).toBe(true);
    expect(isHeic(ftyp('mif1', 'heic'))).toBe(true);
    expect(isHeic(ftyp('heix'))).toBe(true);
    expect(isHeic(ftyp('avif', 'mif1', 'miaf'))).toBe(false);
    expect(isHeic(Buffer.from('%PDF-1.7 ....................'))).toBe(false);
  });

  it('dispatches by content first, then by MIME / extension', () => {
    expect(toolKind('x.bin', null, Buffer.from('%PDF-1.4\n'))).toBe('pdf');
    expect(toolKind('photo.jpg', 'image/jpeg', ftyp('heic', 'mif1'))).toBe('heic');
    expect(toolKind('IMG_0001.HEIC', 'application/octet-stream')).toBe('heic');
    expect(toolKind('a.heif', null)).toBe('heic');
    expect(toolKind('a.PNG', null)).toBe('png');
    expect(toolKind('a.webp', 'image/webp')).toBe('image');
    expect(toolKind('a.docx', null)).toBeNull();
  });

  it('HEIC conversion errors are reported as codes', async () => {
    await expect(heicToJpeg(Buffer.from('no heic'))).rejects.toMatchObject({ code: 'NOT_HEIC' });
    await expect(heicToJpeg(ftyp('heic', 'mif1'))).rejects.toMatchObject({ code: 'HEIC_UNREADABLE' });
  });

  it('parses page ranges', () => {
    expect(parseRanges('1-3, 5', 6)).toEqual([[0, 1, 2], [4]]);
    expect(parseRanges('4-', 6)).toEqual([[3, 4, 5]]);
    expect(() => parseRanges('0-2', 6)).toThrow();
    expect(() => parseRanges('3-2', 6)).toThrow();
    expect(() => parseRanges('a', 6)).toThrow();
  });
});
