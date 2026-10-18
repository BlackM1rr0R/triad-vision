import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { encodePng, ocrImage } from './ocr.js';

/**
 * Text extraction from drive files, per type:
 *   PDF   text layer via pdfjs-dist (legacy build, no canvas); pages with (almost) no text are scans: their
 *         embedded images (JPEG streams, or 8-bit grey / RGB Flate images re-encoded as PNG) are OCR'd —
 *         best effort, at most OCR_PDF_PAGES pages.
 *   Image JPG / PNG via tesseract (see ./ocr.ts).
 *   DOCX  word/document.xml (+ headers / footers) via jszip.
 *   XLSX  cell text via exceljs.
 *   TXT / CSV as is.
 * Results come in chunks (one per PDF page / sheet, else one), so the version comparison can diff by page.
 */

export type IntelKind = 'pdf' | 'image' | 'docx' | 'xlsx' | 'text';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const PDF_MIME = 'application/pdf';

/** Largest file the indexer / comparison opens. */
export const MAX_EXTRACT_BYTES = 40 * 1024 * 1024;
/** Scanned PDF pages OCR'd at most. */
export const OCR_PDF_PAGES = 10;
/** A PDF page with fewer non-space characters than this counts as a scan. */
const SCAN_THRESHOLD = 16;

export const intelKind = (name: string, mime: string | null | undefined): IntelKind | null => {
  const m = (mime ?? '').toLowerCase();
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (m === PDF_MIME || ext === 'pdf') return 'pdf';
  if (m === 'image/jpeg' || m === 'image/png' || ['jpg', 'jpeg', 'png'].includes(ext)) return 'image';
  if (m === DOCX_MIME || ext === 'docx') return 'docx';
  if (m === XLSX_MIME || ext === 'xlsx') return 'xlsx';
  if (m === 'text/plain' || m === 'text/csv' || ['txt', 'csv', 'md', 'tsv'].includes(ext)) return 'text';
  return null;
};

export interface Extracted {
  /** One entry per PDF page / spreadsheet sheet; a single entry otherwise. */
  chunks: string[];
  /** Pages whose text came from OCR. */
  ocrPages: number;
}

// ─── PDF ─────────────────────────────────────────────────────────────

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsPromise: Promise<PdfJs> | null = null;
const pdfjs = () => (pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs'));

/** Text layer of every page (pdfjs). */
export const pdfPageTexts = async (buf: Buffer, maxPages = 2000): Promise<string[]> => {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: new Uint8Array(buf), disableFontFace: true, useSystemFonts: false, isEvalSupported: false, verbosity: 0, stopAtErrors: false });
  const doc = await task.promise;
  try {
    const out: string[] = [];
    const n = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let s = '';
      for (const it of tc.items) {
        if (!('str' in it)) continue;
        s += it.str;
        if (it.hasEOL) s += '\n';
        else if (it.str && !/\s$/.test(it.str)) s += ' ';
      }
      out.push(s);
      page.cleanup();
    }
    return out;
  } finally {
    await doc.destroy().catch(() => undefined);
  }
};

const filterNames = (f: unknown): string[] => {
  if (f instanceof PDFName) return [f.asString()];
  if (f instanceof PDFArray) return f.asArray().map((x) => (x instanceof PDFName ? x.asString() : ''));
  return [];
};

/** Embedded images of the given pages (0-based) as JPEG / PNG bytes, biggest first per page. */
export const pdfPageImages = async (buf: Buffer, pageIdx: number[]): Promise<Map<number, Buffer[]>> => {
  const out = new Map<number, Buffer[]>();
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
  const pages = doc.getPages();
  for (const i of pageIdx) {
    const page = pages[i];
    if (!page) continue;
    const xobjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xobjects) continue;
    const imgs: { area: number; bytes: Buffer }[] = [];
    for (const [, ref] of xobjects.entries()) {
      const obj = doc.context.lookup(ref);
      if (!(obj instanceof PDFRawStream)) continue;
      const d = obj.dict;
      if (d.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
      const w = (d.lookup(PDFName.of('Width')) as PDFNumber | undefined)?.asNumber?.() ?? 0;
      const h = (d.lookup(PDFName.of('Height')) as PDFNumber | undefined)?.asNumber?.() ?? 0;
      if (w < 32 || h < 32) continue;
      const filters = filterNames(d.lookup(PDFName.of('Filter')));
      try {
        if (filters.length === 1 && filters[0] === '/DCTDecode') {
          imgs.push({ area: w * h, bytes: Buffer.from(obj.contents) });
        } else if (filters.length === 1 && filters[0] === '/FlateDecode' && !d.get(PDFName.of('DecodeParms'))) {
          const bpc = (d.lookup(PDFName.of('BitsPerComponent')) as PDFNumber | undefined)?.asNumber?.();
          const cs = d.lookup(PDFName.of('ColorSpace'));
          const channels = cs === PDFName.of('DeviceRGB') ? 3 : cs === PDFName.of('DeviceGray') ? 1 : 0;
          if (bpc !== 8 || !channels || w * h > 40_000_000) continue;
          const pixels = Buffer.from(decodePDFRawStream(obj).decode());
          imgs.push({ area: w * h, bytes: encodePng(pixels, w, h, channels as 1 | 3) });
        }
      } catch {
        // an image we cannot read is skipped
      }
    }
    imgs.sort((a, b) => b.area - a.area);
    if (imgs.length) out.set(i, imgs.slice(0, 2).map((x) => x.bytes));
  }
  return out;
};

const extractPdf = async (buf: Buffer, opts: { ocr: boolean }): Promise<Extracted> => {
  const pages = await pdfPageTexts(buf);
  let ocrPages = 0;
  if (opts.ocr) {
    const scans = pages.map((t, i) => (t.replace(/\s+/g, '').length < SCAN_THRESHOLD ? i : -1)).filter((i) => i >= 0).slice(0, OCR_PDF_PAGES);
    if (scans.length) {
      const images = await pdfPageImages(buf, scans).catch(() => new Map<number, Buffer[]>());
      for (const [i, list] of images) {
        const texts: string[] = [];
        for (const img of list) {
          const t = await ocrImage(img).catch(() => '');
          if (t.trim()) texts.push(t);
        }
        if (texts.length) {
          pages[i] = [pages[i], ...texts].filter((x) => x.trim()).join('\n');
          ocrPages++;
        }
      }
    }
  }
  return { chunks: pages, ocrPages };
};

// ─── DOCX ────────────────────────────────────────────────────────────

const decodeXml = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos|#(\d+)|#x([0-9a-fA-F]+));/g, (m, name: string, dec?: string, hex?: string) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" } as Record<string, string>)[name] ?? m;
  });

/** Plain text of a WordprocessingML part: paragraphs → lines, tabs and breaks kept. */
export const docxXmlText = (xml: string) => {
  const out: string[] = [];
  for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) ?? []) {
    let line = '';
    for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g)) {
      if (m[0].startsWith('<w:tab')) line += '\t';
      else if (m[0].startsWith('<w:br') || m[0].startsWith('<w:cr')) line += '\n';
      else line += decodeXml(m[1]);
    }
    out.push(line);
  }
  return out.join('\n');
};

/** The text parts of a docx in reading order: headers, body, footers. */
export const docxParts = (zip: JSZip) => {
  const names = Object.keys(zip.files);
  const pick = (re: RegExp) => names.filter((n) => re.test(n)).sort();
  return [...pick(/^word\/header\d*\.xml$/), 'word/document.xml', ...pick(/^word\/footer\d*\.xml$/)].filter((n) => zip.file(n));
};

export const loadDocx = async (buf: Buffer) => {
  try {
    const zip = await JSZip.loadAsync(buf);
    if (!zip.file('word/document.xml')) throw new Error('no document.xml');
    return zip;
  } catch {
    throw Object.assign(new Error('INVALID_DOCX'), { code: 'INVALID_DOCX' });
  }
};

const extractDocx = async (buf: Buffer): Promise<Extracted> => {
  const zip = await loadDocx(buf);
  const texts: string[] = [];
  for (const name of docxParts(zip)) texts.push(docxXmlText(await zip.file(name)!.async('string')));
  return { chunks: [texts.filter((t) => t.trim()).join('\n')], ocrPages: 0 };
};

// ─── XLSX ────────────────────────────────────────────────────────────

/** Max cells read per workbook (index and comparison). */
export const MAX_CELLS = 200_000;

export type SheetCells = { name: string; cells: Map<string, string> }[];

const cellText = (cell: ExcelJS.Cell) => {
  try {
    const t = cell.text;
    return typeof t === 'string' ? t : String(t ?? '');
  } catch {
    return String(cell.value ?? '');
  }
};

/** Non-empty cells of every sheet (address → displayed text). */
export const xlsxCells = async (buf: Buffer): Promise<SheetCells> => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const out: SheetCells = [];
  let count = 0;
  for (const ws of wb.worksheets) {
    const cells = new Map<string, string>();
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (count >= MAX_CELLS) return;
        const t = cellText(cell).trim();
        if (t) {
          cells.set(cell.address, t);
          count++;
        }
      });
    });
    out.push({ name: ws.name, cells });
  }
  return out;
};

const extractXlsx = async (buf: Buffer): Promise<Extracted> => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const chunks: string[] = [];
  let count = 0;
  for (const ws of wb.worksheets) {
    const lines: string[] = [ws.name];
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (count >= MAX_CELLS) return;
      const vals: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        const t = cellText(cell).trim();
        if (t) vals.push(t);
      });
      count += vals.length;
      if (vals.length) lines.push(vals.join('\t'));
    });
    chunks.push(lines.join('\n'));
  }
  return { chunks, ocrPages: 0 };
};

// ─── Text ────────────────────────────────────────────────────────────

export const decodeText = (buf: Buffer) => {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  const s = buf.toString('utf8');
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
};

// ─── Entry point ─────────────────────────────────────────────────────

/** Extracts the text of a file of the given kind. `ocr: false` skips tesseract (comparison of PDFs). */
export const extractText = async (buf: Buffer, kind: IntelKind, opts: { ocr?: boolean } = {}): Promise<Extracted> => {
  const ocr = opts.ocr ?? true;
  switch (kind) {
    case 'pdf':
      return extractPdf(buf, { ocr });
    case 'docx':
      return extractDocx(buf);
    case 'xlsx':
      return extractXlsx(buf);
    case 'text':
      return { chunks: [decodeText(buf)], ocrPages: 0 };
    case 'image': {
      if (!ocr) return { chunks: [''], ocrPages: 0 };
      const t = await ocrImage(buf);
      return { chunks: [t], ocrPages: t.trim() ? 1 : 0 };
    }
  }
};
