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

/** Minimal byte samples that pass the server's content sniffing for each accepted type. */
export const SAMPLE = {
  png: PNG_BUFFER,
  jpg: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]), Buffer.alloc(32)]),
  webp: Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(32)]),
  avif: Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from('ftypavif'), Buffer.alloc(32)]),
  gif: Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32)]),
  svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  /** OOXML (docx/xlsx/pptx) and OpenDocument files are zip containers. */
  zip: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(60)]),
  /** Legacy Office (doc/xls/ppt) files are OLE compound documents. */
  ole: Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(60)]),
  txt: Buffer.from('plain text, nothing else'),
} as const;

/** Sample bytes by MIME type. */
export const sampleFor = (contentType: string): Buffer => {
  if (contentType === 'image/png') return SAMPLE.png;
  if (contentType === 'image/jpeg') return SAMPLE.jpg;
  if (contentType === 'image/webp') return SAMPLE.webp;
  if (contentType === 'image/avif') return SAMPLE.avif;
  if (contentType === 'image/gif') return SAMPLE.gif;
  if (contentType === 'image/svg+xml') return SAMPLE.svg;
  if (contentType === 'application/msword' || contentType === 'application/vnd.ms-excel') return SAMPLE.ole;
  if (contentType.startsWith('application/vnd.openxmlformats') || contentType.startsWith('application/vnd.oasis') || contentType.includes('zip')) return SAMPLE.zip;
  if (contentType.startsWith('text/')) return SAMPLE.txt;
  return Buffer.from('x');
};
