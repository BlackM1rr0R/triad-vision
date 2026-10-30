import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Client document uploads accept iPhone photos (HEIC/HEIF) and store them as JPEG (middleware/upload.ts:
 * clientDocFilter + verifyUploadedFile → convertHeicUpload). The repo has no real HEIC fixture, so heic-convert
 * is mocked (it returns a JPEG made by sharp); the magic-byte detection and the file bookkeeping are real.
 */

let decoded: Buffer;
vi.mock('heic-convert', () => ({ default: vi.fn(async () => decoded) }));

const { clientDocFilter, verifyUploadedFile } = await import('../../src/middleware/upload.js');
const { isHeic } = await import('../../src/lib/pdfTools/images.js');

const heifHeader = (brand = 'heic') => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp'), Buffer.from(brand, 'latin1'), Buffer.from([0, 0, 0, 0]), Buffer.from('mif1heic'), Buffer.alloc(300, 7)]);

let dir: string;
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tv-heic-'));
  decoded = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#c33' } }).jpeg().toBuffer();
});
afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

type Filtered = { accepted: boolean; error?: { code?: string } };
const filter = (file: Partial<Express.Multer.File>) =>
  new Promise<Filtered>((resolve) => {
    clientDocFilter!({} as never, file as Express.Multer.File, ((err: unknown, ok?: boolean) => resolve({ accepted: !err && !!ok, error: err as { code?: string } })) as never);
  });

const stored = async (name: string, bytes: Buffer, mimetype: string) => {
  const filename = `${Date.now()}-${Math.random().toString(16).slice(2)}${path.extname(name).toLowerCase()}`;
  const file = { fieldname: 'file', originalname: name, mimetype, filename, path: path.join(dir, filename), size: bytes.length } as Express.Multer.File;
  const res = await filter(file);
  await fs.writeFile(file.path, bytes);
  return { file, res };
};

describe('HEIC/HEIF client uploads', () => {
  it('detects HEIF by its ftyp brand, not by name', () => {
    expect(isHeic(heifHeader('heic'))).toBe(true);
    expect(isHeic(heifHeader('heix'))).toBe(true);
    expect(isHeic(heifHeader('avif').subarray(0, 16))).toBe(false);
    expect(isHeic(Buffer.from('%PDF-1.7 not an image at all'))).toBe(false);
  });

  it('accepts HEIC (octet-stream from the phone) and stores it as JPEG', async () => {
    const { file, res } = await stored('IMG_0042.HEIC', heifHeader(), 'application/octet-stream');
    expect(res.accepted).toBe(true);
    expect(file.mimetype).toBe('image/heic');
    const heicPath = file.path;
    await verifyUploadedFile(file);
    expect(file.mimetype).toBe('image/jpeg');
    expect(file.originalname).toBe('IMG_0042.jpg');
    expect(file.filename).toMatch(/\.jpg$/);
    expect(file.size).toBe((await fs.stat(file.path)).size);
    expect((await fs.readFile(file.path)).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    await expect(fs.stat(heicPath)).rejects.toThrow();
  });

  it('refuses a ".heic" whose bytes are not HEIF and removes it', async () => {
    const { file } = await stored('fake.heic', Buffer.from('not a photo at all, really'), 'image/heic');
    await expect(verifyUploadedFile(file)).rejects.toMatchObject({ code: 'FILE_CONTENT_MISMATCH' });
    await expect(fs.stat(file.path)).rejects.toThrow();
  });

  it('still refuses other types and leaves PDFs / JPEGs untouched', async () => {
    expect((await filter({ originalname: 'x.exe', mimetype: 'application/octet-stream' })).accepted).toBe(false);
    expect((await filter({ originalname: 'x.gif', mimetype: 'image/gif' })).accepted).toBe(false);
    const { file, res } = await stored('photo.jpg', decoded, 'image/jpeg');
    expect(res.accepted).toBe(true);
    const before = file.path;
    await verifyUploadedFile(file);
    expect(file.path).toBe(before);
    expect(file.mimetype).toBe('image/jpeg');
  });
});
