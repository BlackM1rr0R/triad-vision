import fs from 'node:fs';
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
import { prisma } from '../helpers/db';
import { TEST_UPLOADS_DIR } from '../helpers/testEnv';
import { buildMrz, fakePng, monthsFromNow } from './passport-scan.fixtures';

const VALID = buildMrz({ surname: 'ALIYEV', given: 'RAMIL', docNo: 'C01234567', birth: '1990-05-14', expiry: monthsFromNow(48) });

const scan = (buf: Buffer, name = 'passport.png', contentType = 'image/png') =>
  anon().post('/api/auth/passport-scan').attach('image', buf, { filename: name, contentType });

beforeEach(() => {
  m.recognize.mockReset();
  m.recognize.mockResolvedValue({ data: { text: VALID.join(String.fromCharCode(10)), confidence: 88 } });
});

describe('POST /api/auth/passport-scan — validation and privacy', () => {
  it('rejects other file types, spoofed content and a missing file', async () => {
    const pdf = await scan(Buffer.from('%PDF-1.4 hello'), 'p.pdf', 'application/pdf');
    expect(pdf.status).toBe(400);
    expect(pdf.body.error).toBe('UNSUPPORTED_FILE_TYPE');
    const gif = await scan(Buffer.from('GIF89a....'), 'p.gif', 'image/gif');
    expect(gif.status).toBe(400);
    const spoofed = await scan(Buffer.from('<html>not a png</html>'), 'p.png', 'image/png');
    expect(spoofed.status).toBe(400);
    expect(spoofed.body.error).toBe('FILE_CONTENT_MISMATCH');
    const none = await anon().post('/api/auth/passport-scan').field('x', '1');
    expect(none.status).toBe(400);
    expect(none.body.error).toBe('NO_FILE');
    expect(m.recognize).not.toHaveBeenCalled();
  });

  it('rejects images over 8 MB with 413', async () => {
    const res = await scan(fakePng(1600, 1100, 8 * 1024 * 1024 + 10));
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('FILE_TOO_LARGE');
  });

  it('stores nothing: no rows, no files', async () => {
    const files = () => (fs.existsSync(TEST_UPLOADS_DIR) ? fs.readdirSync(TEST_UPLOADS_DIR, { recursive: true }).length : 0);
    const before = files();
    expect((await scan(fakePng())).status).toBe(200);
    expect(files()).toBe(before);
    expect(await prisma.document.count()).toBe(0);
    expect(await prisma.consentRecord.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
  });
});
