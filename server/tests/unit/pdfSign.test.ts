import crypto from 'node:crypto';
import { PDFDocument, PDFRawStream, decodePDFRawStream, PDFArray, type PDFPage } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { signContractPdf, type SignatureInfo } from '../../src/lib/pdfSign.js';
import { makePdf, PNG_BUFFER } from '../helpers/files';

const info = (over: Partial<SignatureInfo> = {}): SignatureInfo => ({
  caseNumber: 'TV-2026-0001',
  signerName: 'Ali Mammadov',
  signerEmail: 'ali@test.local',
  signedAt: new Date('2026-10-14T10:20:30Z'),
  ip: '203.0.113.7',
  userAgent: 'Mozilla/5.0 (Test)',
  signaturePng: PNG_BUFFER,
  ...over,
});

/** Text drawn on a page: pdf-lib writes standard-font text as <HEX> Tj in (compressed) content streams. */
const pageText = (page: PDFPage) => {
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => page.doc.context.lookup(r)) : [contents];
  let raw = '';
  for (const s of streams) {
    if (s instanceof PDFRawStream) raw += Buffer.from(decodePDFRawStream(s).decode()).toString('latin1');
  }
  return [...raw.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)].map((mt) => Buffer.from(mt[1], 'hex').toString('latin1')).join('\n');
};

const lastPageText = async (pdf: Buffer) => {
  const doc = await PDFDocument.load(pdf);
  return pageText(doc.getPage(doc.getPageCount() - 1));
};

describe('signContractPdf', () => {
  it('returns a valid PDF with exactly one extra page', async () => {
    const original = await makePdf('Contract', 3);
    const { pdf } = await signContractPdf(original, info());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(4);
    const [w, h] = [doc.getPage(3).getWidth(), doc.getPage(3).getHeight()];
    expect(Math.round(w)).toBe(595);
    expect(Math.round(h)).toBe(842);
  });

  it('returns and prints the SHA-256 of the original contract', async () => {
    const original = await makePdf('Contract v1');
    const { pdf, originalHash } = await signContractPdf(original, info());
    const expected = crypto.createHash('sha256').update(original).digest('hex');
    expect(originalHash).toBe(expected);
    const text = await lastPageText(pdf);
    expect(text).toContain(expected.slice(0, 32));
    expect(text).toContain(expected.slice(32));
  });

  it('prints case number, signer, e-mail, UTC time and IP', async () => {
    const text = await lastPageText((await signContractPdf(await makePdf(), info())).pdf);
    for (const s of ['TV-2026-0001', 'Ali Mammadov', 'ali@test.local', '2026-10-14 10:20:30', '203.0.113.7', 'Mozilla/5.0 (Test)']) {
      expect(text).toContain(s);
    }
  });

  it.each([
    ['Əli Məmmədov', 'Eli Memmedov'],
    ['Şəhla Ağayeva', 'Sehla Agayeva'],
    ['İlqar Iğdır', 'Ilqar Igdir'],
    ['Иван Петров', 'Ivan Petrov'],
    ['Щукин Юрий Ёлкин', 'Shchukin Yuriy Elkin'],
    ['Müller Öztürk', 'Müller Öztürk'],
  ])('transliterates %s without throwing', async (name, printed) => {
    const text = await lastPageText((await signContractPdf(await makePdf(), info({ signerName: name }))).pdf);
    // Case-insensitive: multi-letter transliterations of capitals come out as e.g. 'SHCHukin'.
    expect(text.toLowerCase()).toContain(printed.toLowerCase());
  });

  it('replaces characters no standard font can encode with "?"', async () => {
    const text = await lastPageText((await signContractPdf(await makePdf(), info({ signerName: '李雷 😀' }))).pdf);
    expect(text).toMatch(/\?\? \?+/);
  });

  it('truncates very long user agents', async () => {
    const ua = 'A'.repeat(300);
    const text = await lastPageText((await signContractPdf(await makePdf(), info({ userAgent: ua }))).pdf);
    expect(text).toContain('A'.repeat(90));
    expect(text).not.toContain('A'.repeat(91));
  });

  it('rejects a signature that is not a PNG', async () => {
    await expect(signContractPdf(await makePdf(), info({ signaturePng: Buffer.from('not a png') }))).rejects.toThrow();
  });

  it('rejects an original that is not a PDF', async () => {
    await expect(signContractPdf(Buffer.from('hello'), info())).rejects.toThrow();
  });
});
