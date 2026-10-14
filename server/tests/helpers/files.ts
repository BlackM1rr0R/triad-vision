import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { Response } from 'supertest';

/** 1x1 transparent PNG, the format the signature pad sends. */
export const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
export const SIGNATURE_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;
export const PNG_BUFFER = Buffer.from(PNG_BASE64, 'base64');

/** A small valid PDF with `pages` pages. */
export const makePdf = async (text = 'Test document', pages = 1) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    doc.addPage().drawText(`${text} (${i + 1})`, { x: 50, y: 700, size: 18, font });
  }
  return Buffer.from(await doc.save());
};

export const pageCount = async (pdf: Buffer) => (await PDFDocument.load(pdf)).getPageCount();

/** supertest parser that collects the raw body as a Buffer (for PDF downloads). */
export const binaryParser = (res: Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

export const PDF = { contentType: 'application/pdf' } as const;
