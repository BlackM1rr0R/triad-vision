import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';
import fontkit from '@pdf-lib/fontkit';
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { A4, BAND, BRAND, INK, LINE, MM, MUTED, clean, wrap } from '../cv/pdfKit.js';
import { docSchema, type Block, type DocModel, type Run, type TableBlock, type TextBlock } from './doc.js';

/**
 * PDF rendering of the drive's document editor (pdf-lib + fontkit + DejaVu Sans, so Azerbaijani, German and
 * Cyrillic text renders): letterhead, title, headings, paragraphs with bold / italic / underline, bullet
 * and numbered lists, tables (header row repeated on every page), rules, page breaks and page numbers.
 *
 * The block JSON is embedded in the PDF (document info entry /TVDoc, deflated + base64), so "Redaktə et"
 * can open the PDF in the editor again — also after the file was copied, moved or downloaded and uploaded.
 */

const require = createRequire(import.meta.url);
const FONT_FILES = ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf', 'DejaVuSans-Oblique.ttf', 'DejaVuSans-BoldOblique.ttf'] as const;
let fontBytes: Promise<Buffer[]> | null = null;
const loadFonts = () =>
  (fontBytes ??= Promise.all(FONT_FILES.map((f) => fs.readFile(require.resolve(`dejavu-fonts-ttf/ttf/${f}`))))).catch((err) => {
    fontBytes = null;
    throw err;
  });

export interface DocFonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

export interface Letterhead {
  name: string;
  lines: string[];
  contact: string[];
}

const SOURCE_KEY = PDFName.of('TVDoc');
const PAGE: [number, number] = A4;
const MARGIN = 20 * MM;

export const newPdf = async (title: string) => {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [r, b, i, bi] = await loadFonts();
  const fonts: DocFonts = {
    regular: await pdf.embedFont(r, { subset: true }),
    bold: await pdf.embedFont(b, { subset: true }),
    italic: await pdf.embedFont(i, { subset: true }),
    boldItalic: await pdf.embedFont(bi, { subset: true }),
  };
  pdf.setTitle(title || 'Dokument');
  pdf.setAuthor('Triad Vision');
  pdf.setProducer('Triad Vision');
  pdf.setCreator('Triad Vision Dokumente');
  return { pdf, fonts };
};

const fontOf = (f: DocFonts, r: Pick<Run, 'b' | 'i'>) => (r.b && r.i ? f.boldItalic : r.b ? f.bold : r.i ? f.italic : f.regular);

interface Seg {
  text: string;
  font: PDFFont;
  u: boolean;
  w: number;
}
type Line = { segs: Seg[]; w: number };

/** Word wrap over styled runs; "\n" inside a run is a line break; over-long words are broken. */
export const layoutRuns = (runs: Run[], fonts: DocFonts, size: number, width: number, force?: Partial<Pick<Run, 'b' | 'i'>>): Line[] => {
  const lines: Line[] = [];
  let cur: Line = { segs: [], w: 0 };
  const push = () => {
    // No trailing blanks at the end of a line.
    while (cur.segs.length && !cur.segs[cur.segs.length - 1].text.trim()) cur.w -= cur.segs.pop()!.w;
    lines.push(cur);
    cur = { segs: [], w: 0 };
  };
  const add = (text: string, font: PDFFont, u: boolean) => {
    const w = font.widthOfTextAtSize(text, size);
    cur.segs.push({ text, font, u, w });
    cur.w += w;
  };
  for (const r of runs) {
    const font = fontOf(fonts, { b: force?.b || r.b, i: force?.i || r.i });
    const u = !!r.u;
    const parts = clean(r.t).split(/(\n| +)/);
    for (const part of parts) {
      if (!part) continue;
      if (part === '\n') {
        push();
        continue;
      }
      if (/^ +$/.test(part)) {
        if (cur.segs.length) add(' ', font, u);
        continue;
      }
      let word = part;
      let w = font.widthOfTextAtSize(word, size);
      if (cur.w + w > width && cur.segs.length) push();
      while (w > width && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > width) cut--;
        add(word.slice(0, cut), font, u);
        push();
        word = word.slice(cut);
        w = font.widthOfTextAtSize(word, size);
      }
      add(word, font, u);
    }
  }
  if (cur.segs.length || !lines.length) push();
  return lines;
};

const TEXT_STYLE: Record<TextBlock['type'], { size: number; bold: boolean; before: number; after: number; color: RGB }> = {
  h1: { size: 17, bold: true, before: 10, after: 6, color: BRAND },
  h2: { size: 13.5, bold: true, before: 8, after: 4, color: BRAND },
  h3: { size: 11.5, bold: true, before: 6, after: 3, color: INK },
  p: { size: 10.5, bold: false, before: 0, after: 7, color: INK },
  ul: { size: 10.5, bold: false, before: 0, after: 3, color: INK },
  ol: { size: 10.5, bold: false, before: 0, after: 3, color: INK },
};

class Writer {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;
  readonly left = MARGIN;
  readonly right: number;
  readonly width: number;
  readonly top: number;
  readonly bottom = MARGIN + 10;

  constructor(
    readonly pdf: PDFDocument,
    readonly fonts: DocFonts,
    readonly size: [number, number] = PAGE,
  ) {
    this.right = size[0] - MARGIN;
    this.width = size[0] - 2 * MARGIN;
    this.top = size[1] - MARGIN;
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage(this.size);
    this.pages.push(this.page);
    this.y = this.top;
  }

  need(h: number) {
    if (this.y - h < this.bottom) this.newPage();
  }

  get atTop() {
    return this.y >= this.top - 0.5;
  }

  gap(h: number) {
    if (!this.atTop) this.y -= h;
  }

  text(s: string, x: number, size: number, font: PDFFont, color: RGB = INK) {
    const t = clean(s);
    if (t) this.page.drawText(t, { x, y: this.y, size, font, color });
  }

  rule(color = LINE, thickness = 0.7) {
    this.page.drawLine({ start: { x: this.left, y: this.y }, end: { x: this.right, y: this.y }, thickness, color });
  }

  /** Styled lines at x within width, aligned; moves the cursor. */
  lines(lines: Line[], x: number, width: number, size: number, color: RGB, align: 'left' | 'center' | 'right' = 'left', marker?: { text: string; x: number }) {
    const leading = size * 1.42;
    lines.forEach((line, idx) => {
      this.need(leading);
      const baseline = this.y - size;
      if (idx === 0 && marker) this.page.drawText(marker.text, { x: marker.x, y: baseline, size, font: this.fonts.regular, color });
      let cx = align === 'center' ? x + (width - line.w) / 2 : align === 'right' ? x + width - line.w : x;
      for (const s of line.segs) {
        if (s.text.trim()) this.page.drawText(s.text, { x: cx, y: baseline, size, font: s.font, color });
        if (s.u) this.page.drawLine({ start: { x: cx, y: baseline - 1.6 }, end: { x: cx + s.w, y: baseline - 1.6 }, thickness: size / 16, color });
        cx += s.w;
      }
      this.y -= leading;
    });
  }
}

const drawLetterhead = (w: Writer, lh: Letterhead) => {
  const f = w.fonts;
  const startY = w.y;
  w.y -= 14;
  w.text(lh.name, w.left, 14, f.bold, BRAND);
  let leftY = w.y - 13;
  for (const l of lh.lines) {
    w.page.drawText(clean(l), { x: w.left, y: leftY, size: 8.5, font: f.regular, color: MUTED });
    leftY -= 11;
  }
  let rightY = startY - 12;
  for (const c of lh.contact) {
    const t = clean(c);
    const tw = f.regular.widthOfTextAtSize(t, 8.5);
    w.page.drawText(t, { x: w.right - tw, y: rightY, size: 8.5, font: f.regular, color: MUTED });
    rightY -= 11;
  }
  w.y = Math.min(leftY, rightY) - 2;
  w.rule(BRAND, 1.2);
  w.y -= 18;
};

const drawTextBlock = (w: Writer, b: TextBlock, listIndex: number) => {
  const st = TEXT_STYLE[b.type];
  const runs = b.runs.length ? b.runs : [{ t: '' }];
  const isList = b.type === 'ul' || b.type === 'ol';
  const indent = isList ? 18 : 0;
  const x = w.left + indent;
  const width = w.width - indent;
  const lines = layoutRuns(runs, w.fonts, st.size, width, st.bold ? { b: true } : undefined);
  w.gap(st.before);
  // Keep a heading together with at least two lines of what follows.
  if (b.type.startsWith('h')) w.need(st.size * 1.42 * lines.length + 30);
  const marker = isList ? { text: b.type === 'ul' ? '•' : `${listIndex}.`, x: w.left + (b.type === 'ul' ? 6 : 0) } : undefined;
  w.lines(lines, x, width, st.size, st.color, isList ? 'left' : (b.align ?? 'left'), marker);
  w.y -= st.after;
};

const drawTable = (w: Writer, b: TableBlock) => {
  const f = w.fonts;
  const cols = Math.max(1, ...b.rows.map((r) => r.length));
  const rows = b.rows.map((r) => Array.from({ length: cols }, (_, i) => clean(r[i] ?? '')));
  const size = cols > 8 ? 7.5 : 9;
  const pad = 4;
  const leading = size * 1.32;
  // Natural column widths (capped), scaled to the full text width.
  const natural = Array.from({ length: cols }, (_, c) => {
    let m = 24;
    for (const r of rows.slice(0, 300)) {
      for (const part of r[c].split('\n')) m = Math.max(m, Math.min(220, f.regular.widthOfTextAtSize(part, size) + 2 * pad + 2));
    }
    return m;
  });
  const sum = natural.reduce((a, n) => a + n, 0);
  const widths = natural.map((n) => (n / sum) * w.width);
  const header = b.header !== false && rows.length > 1;
  const maxRowH = w.top - w.bottom - 4;

  const drawRow = (cells: string[], bold: boolean) => {
    const font = bold ? f.bold : f.regular;
    const wrapped = cells.map((c, i) => wrap(c, font, size, Math.max(8, widths[i] - 2 * pad)));
    const linesN = Math.max(1, ...wrapped.map((l) => l.length));
    let h = linesN * leading + 2 * pad;
    if (h > maxRowH) h = maxRowH;
    if (w.y - h < w.bottom) {
      w.newPage();
      if (header && !bold) drawRow(rows[0], true);
    }
    let x = w.left;
    const top = w.y;
    cells.forEach((_, i) => {
      if (bold) w.page.drawRectangle({ x, y: top - h, width: widths[i], height: h, color: BAND });
      w.page.drawRectangle({ x, y: top - h, width: widths[i], height: h, borderColor: LINE, borderWidth: 0.6 });
      let ly = top - pad - size;
      for (const line of wrapped[i]) {
        if (ly < top - h + pad - 1) break;
        if (line) w.page.drawText(line, { x: x + pad, y: ly, size, font, color: INK });
        ly -= leading;
      }
      x += widths[i];
    });
    w.y = top - h;
  };

  w.gap(4);
  w.need(header ? 3 * leading + 4 * pad : 2 * leading);
  rows.forEach((r, i) => drawRow(r, header && i === 0));
  w.y -= 10;
};

const numberPages = (w: Writer) => {
  if (w.pages.length < 2) return;
  w.pages.forEach((p, i) => {
    const t = `${i + 1} / ${w.pages.length}`;
    p.drawText(t, { x: w.right - w.fonts.regular.widthOfTextAtSize(t, 8), y: MARGIN / 2, size: 8, font: w.fonts.regular, color: MUTED });
  });
};

/** Renders blocks onto pages (no title / letterhead); used by the document editor and the converters. */
const drawBlocks = (w: Writer, blocks: Block[]) => {
  let olIndex = 0;
  for (const b of blocks) {
    if (b.type === 'ol') olIndex++;
    else olIndex = 0;
    if (b.type === 'table') drawTable(w, b);
    else if (b.type === 'hr') {
      w.gap(6);
      w.need(12);
      w.rule();
      w.y -= 12;
    } else if (b.type === 'pagebreak') {
      if (!w.atTop) w.newPage();
    } else drawTextBlock(w, b as TextBlock, olIndex);
  }
};

/** The document information dictionary (setTitle creates it; older or foreign PDFs may have none). */
const infoDict = (pdf: PDFDocument) => {
  const ref = pdf.context.trailerInfo.Info;
  const d = ref ? pdf.context.lookup(ref) : undefined;
  return d instanceof PDFDict ? d : null;
};

const encodeSource = (doc: DocModel) => zlib.deflateRawSync(Buffer.from(JSON.stringify({ v: 1, ...doc }), 'utf8')).toString('base64');

/** Renders a document of the editor; the source JSON is embedded (see readDocSource). */
export const renderDocPdf = async (doc: DocModel, opts: { letterhead?: Letterhead | null; embedSource?: boolean; landscape?: boolean } = {}): Promise<Buffer> => {
  const { pdf, fonts } = await newPdf(doc.title);
  const w = new Writer(pdf, fonts, opts.landscape ? [PAGE[1], PAGE[0]] : PAGE);
  if (doc.letterhead && opts.letterhead) drawLetterhead(w, opts.letterhead);
  if (doc.date) {
    const t = clean(doc.date);
    w.page.drawText(t, { x: w.right - fonts.regular.widthOfTextAtSize(t, 10), y: w.y - 10, size: 10, font: fonts.regular, color: INK });
    w.y -= 26;
  }
  if (doc.title) {
    w.lines(layoutRuns([{ t: doc.title, b: true }], fonts, 18, w.width), w.left, w.width, 18, BRAND);
    w.y -= 4;
    w.rule(LINE, 0.8);
    w.y -= 14;
  }
  drawBlocks(w, doc.blocks);
  numberPages(w);
  if (opts.embedSource !== false) {
    pdf.setKeywords(['tvdoc']);
    infoDict(pdf)?.set(SOURCE_KEY, PDFString.of(encodeSource(doc)));
  }
  return Buffer.from(await pdf.save());
};

/** The editor source embedded in a PDF made by renderDocPdf (null for any other PDF). */
export const readDocSource = async (buf: Buffer): Promise<DocModel | null> => {
  try {
    const pdf = await PDFDocument.load(buf, { updateMetadata: false, ignoreEncryption: true });
    const v = infoDict(pdf)?.lookup(SOURCE_KEY);
    const raw = v instanceof PDFString ? v.asString() : v instanceof PDFHexString ? v.decodeText() : null;
    if (!raw) return null;
    const json = JSON.parse(zlib.inflateRawSync(Buffer.from(raw, 'base64')).toString('utf8')) as unknown;
    const parsed = docSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};
