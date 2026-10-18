import { PDFDocument } from 'pdf-lib';
import { badRequest } from '../http.js';
import { renderDocPdf } from './pdf.js';
import { csvToRows, rowsToXlsx, xlsxToRows } from './table.js';

/**
 * Conversions of drive files: images (JPG / PNG) → PDF pages, PDFs merged, spreadsheets (.xlsx / .csv) →
 * PDF table, .csv → .xlsx. WEBP is not supported (no image library on the server to decode it).
 */

export type SourceKind = 'image' | 'pdf' | 'xlsx' | 'csv';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const PDF_MIME = 'application/pdf';

/** What a file can be converted from (by MIME type, falling back to the extension). */
export const sourceKind = (name: string, mime: string | null): SourceKind | null => {
  const m = (mime ?? '').toLowerCase();
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (m === 'image/jpeg' || m === 'image/png' || ['jpg', 'jpeg', 'png'].includes(ext)) return 'image';
  if (m === PDF_MIME || ext === 'pdf') return 'pdf';
  if (m === XLSX_MIME || ext === 'xlsx') return 'xlsx';
  if (m === 'text/csv' || ext === 'csv') return 'csv';
  return null;
};

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 28;

const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isPng = (b: Buffer) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

/** Adds one A4 page (portrait or landscape, following the image) with the image fitted inside the margins. */
const addImagePage = async (pdf: PDFDocument, bytes: Buffer) => {
  let img;
  try {
    if (isJpeg(bytes)) img = await pdf.embedJpg(bytes);
    else if (isPng(bytes)) img = await pdf.embedPng(bytes);
  } catch {
    img = undefined;
  }
  if (!img) throw badRequest('UNSUPPORTED_IMAGE');
  const landscape = img.width > img.height;
  const [pw, ph] = landscape ? [A4.h, A4.w] : [A4.w, A4.h];
  const s = Math.min((pw - 2 * MARGIN) / img.width, (ph - 2 * MARGIN) / img.height, 1.5);
  const w = img.width * s;
  const h = img.height * s;
  const page = pdf.addPage([pw, ph]);
  page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
};

const loadPdf = async (bytes: Buffer) => {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return doc;
  } catch (err) {
    if (/encrypt/i.test(String((err as Error)?.message))) throw badRequest('PDF_ENCRYPTED');
    throw badRequest('INVALID_PDF');
  }
};

/** A spreadsheet as a PDF table (landscape when it has many columns). */
export const tableToPdf = async (title: string, rows: string[][]) => {
  if (!rows.length) throw badRequest('NO_TABLE_DATA');
  const cols = Math.max(...rows.map((r) => r.length));
  return renderDocPdf({ title, letterhead: false, date: null, blocks: [{ type: 'table', header: true, rows }] }, { embedSource: false, landscape: cols > 6 });
};

const sheetRows = async (kind: 'xlsx' | 'csv', bytes: Buffer) => (kind === 'xlsx' ? (await xlsxToRows(bytes)).rows : csvToRows(bytes).slice(0, 5000).map((r) => r.slice(0, 30)));

export interface Source {
  name: string;
  kind: SourceKind;
  bytes: Buffer;
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, '') || name;

/** One source as PDF bytes (an image → one page, a spreadsheet → a table). PDFs are returned unchanged. */
const toPdfBytes = async (s: Source): Promise<Buffer> => {
  if (s.kind === 'pdf') return s.bytes;
  if (s.kind === 'image') {
    const pdf = await PDFDocument.create();
    pdf.setTitle(baseName(s.name));
    pdf.setProducer('Triad Vision');
    await addImagePage(pdf, s.bytes);
    return Buffer.from(await pdf.save());
  }
  return tableToPdf(baseName(s.name), await sheetRows(s.kind, s.bytes));
};

/** All sources in order as one PDF (images become pages, PDFs are appended page by page). */
export const mergeToPdf = async (sources: Source[], title: string): Promise<Buffer> => {
  const out = await PDFDocument.create();
  out.setTitle(title);
  out.setProducer('Triad Vision');
  for (const s of sources) {
    if (s.kind === 'image') {
      await addImagePage(out, s.bytes);
      continue;
    }
    const doc = await loadPdf(await toPdfBytes(s));
    const pages = await out.copyPages(doc, doc.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  if (out.getPageCount() === 0) throw badRequest('NOTHING_TO_CONVERT');
  return Buffer.from(await out.save());
};

/** One source converted to a single PDF. */
export const convertToPdf = async (s: Source): Promise<Buffer> => {
  if (s.kind === 'pdf') throw badRequest('ALREADY_PDF');
  return toPdfBytes(s);
};

/** A .csv converted to .xlsx. */
export const convertToXlsx = async (s: Source): Promise<Buffer> => {
  if (s.kind !== 'csv') throw badRequest('UNSUPPORTED_CONVERSION');
  return rowsToXlsx(csvToRows(s.bytes), baseName(s.name));
};
