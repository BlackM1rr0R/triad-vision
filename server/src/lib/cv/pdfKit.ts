import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';

/**
 * Small layout toolkit for the CV and letter PDFs: DejaVu Sans (embedded with fontkit, so Azerbaijani,
 * German and Cyrillic letters render), word wrapping and automatic page breaks.
 */

export const A4: [number, number] = [595.28, 841.89];
export const MM = 72 / 25.4;
export const INK = rgb(0.11, 0.13, 0.17);
export const MUTED = rgb(0.4, 0.44, 0.5);
export const BRAND = rgb(0.043, 0.243, 0.494);
export const LINE = rgb(0.8, 0.83, 0.87);
export const BAND = rgb(0.92, 0.95, 0.98);

const require = createRequire(import.meta.url);
let fontBytes: Promise<{ regular: Buffer; bold: Buffer }> | null = null;
const loadFontBytes = () =>
  (fontBytes ??= Promise.all([
    fs.readFile(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf')),
    fs.readFile(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf')),
  ]).then(([regular, bold]) => ({ regular, bold }))).catch((err) => {
    fontBytes = null;
    throw err;
  });

export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

export const createDoc = async (meta: { title: string; author?: string; subject?: string; lang?: string }) => {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const bytes = await loadFontBytes();
  const fonts: Fonts = {
    regular: await pdf.embedFont(bytes.regular, { subset: true }),
    bold: await pdf.embedFont(bytes.bold, { subset: true }),
  };
  pdf.setTitle(meta.title);
  if (meta.author) pdf.setAuthor(meta.author);
  if (meta.subject) pdf.setSubject(meta.subject);
  if (meta.lang) pdf.setLanguage(meta.lang);
  pdf.setProducer('Triad Vision');
  pdf.setCreator('Triad Vision CV');
  return { pdf, fonts };
};

/** Removes characters that break single-line drawing (control chars, tabs, odd spaces). */
export const clean = (s: string | null | undefined) =>
  (s ?? '')
    .replace(/\t/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F​-‍﻿]/g, '')
    .replace(/[  -  ]/g, ' ');

/** Word wrap that also breaks words longer than the line (URLs, e-mail addresses). */
export const wrap = (text: string, font: PDFFont, size: number, width: number): string[] => {
  const out: string[] = [];
  for (const para of clean(text).split(/\r?\n/)) {
    const words = para.split(/ +/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (let word of words) {
      while (font.widthOfTextAtSize(word, size) > width && word.length > 1) {
        // hard break inside an over-long word
        let cut = word.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > width) cut--;
        if (line) {
          out.push(line);
          line = '';
        }
        out.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
      else {
        if (line) out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
};

/** Truncates one line with an ellipsis so it fits. */
export const fit = (text: string, font: PDFFont, size: number, width: number) => {
  let t = clean(text).replace(/\s*\n\s*/g, ' ');
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
};

export interface FlowOpts {
  top: number;
  bottom: number;
  /** called for every page the flow adds (to draw backgrounds / headers) */
  onNewPage?: (page: PDFPage, index: number) => void;
}

/**
 * A vertical cursor over pages. `y` is the baseline position of the next line; `need(h)` starts a new page
 * when fewer than h points are left.
 */
export class Flow {
  page: PDFPage;
  y: number;
  pages: PDFPage[] = [];

  constructor(
    public pdf: PDFDocument,
    public fonts: Fonts,
    public opts: FlowOpts,
  ) {
    this.page = this.addPage();
    this.y = opts.top;
  }

  private addPage() {
    const p = this.pdf.addPage(A4);
    this.pages.push(p);
    this.opts.onNewPage?.(p, this.pages.length - 1);
    return p;
  }

  newPage() {
    this.page = this.addPage();
    this.y = this.opts.top;
  }

  need(h: number) {
    if (this.y - h < this.opts.bottom) this.newPage();
  }

  /** Draws text at (x, current y) without moving the cursor. */
  draw(text: string, x: number, o: { size?: number; bold?: boolean; color?: RGB; y?: number } = {}) {
    const t = clean(text);
    if (!t) return;
    this.page.drawText(t, { x, y: o.y ?? this.y, size: o.size ?? 10, font: o.bold ? this.fonts.bold : this.fonts.regular, color: o.color ?? INK });
  }

  /** Wrapped paragraph at x with width; moves the cursor below it. Returns lines drawn. */
  para(text: string, x: number, width: number, o: { size?: number; bold?: boolean; color?: RGB; leading?: number; indentFirst?: string } = {}) {
    const size = o.size ?? 10;
    const leading = o.leading ?? size * 1.38;
    const font = o.bold ? this.fonts.bold : this.fonts.regular;
    const lines = wrap(text, font, size, width);
    for (const line of lines) {
      this.need(leading);
      if (line) this.page.drawText(line, { x, y: this.y, size, font, color: o.color ?? INK });
      this.y -= leading;
    }
    return lines.length;
  }

  /** Bullet list item with a hanging indent. */
  bullet(text: string, x: number, width: number, o: { size?: number; color?: RGB } = {}) {
    const size = o.size ?? 10;
    const leading = size * 1.38;
    const lines = wrap(text, this.fonts.regular, size, width - 10);
    lines.forEach((line, i) => {
      this.need(leading);
      if (i === 0) this.page.drawText('•', { x, y: this.y, size, font: this.fonts.regular, color: o.color ?? INK });
      if (line) this.page.drawText(line, { x: x + 10, y: this.y, size, font: this.fonts.regular, color: o.color ?? INK });
      this.y -= leading;
    });
  }

  rule(x1: number, x2: number, color = LINE, thickness = 0.6) {
    this.page.drawLine({ start: { x: x1, y: this.y }, end: { x: x2, y: this.y }, thickness, color });
  }

  gap(h: number) {
    this.y -= h;
  }
}

/** Page numbers "Seite 1 von 3" at the bottom (only when there is more than one page). */
export const numberPages = (pages: PDFPage[], fonts: Fonts, label: string, x: number, of = 'von') => {
  if (pages.length < 2) return;
  pages.forEach((p, i) => {
    const t = `${label} ${i + 1} ${of} ${pages.length}`;
    p.drawText(t, { x: x - fonts.regular.widthOfTextAtSize(t, 8), y: 24, size: 8, font: fonts.regular, color: MUTED });
  });
};

/** Embeds a JPEG or PNG (sniffed by magic bytes); anything else or a broken file → null. */
export const embedImage = async (pdf: PDFDocument, bytes: Buffer | null | undefined): Promise<PDFImage | null> => {
  if (!bytes || bytes.length < 8) return null;
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
    if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return await pdf.embedPng(bytes);
  } catch {
    return null;
  }
  return null;
};

/** Draws an image covering the box (centre crop by scaling to fill, clipped by drawing scaled to fit). */
export const drawPhoto = (page: PDFPage, img: PDFImage, x: number, y: number, w: number, h: number) => {
  // Fit inside the box keeping the aspect ratio (no clipping support in pdf-lib's high-level API).
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  page.drawImage(img, { x: x + (w - dw) / 2, y: y + (h - dh) / 2, width: dw, height: dh });
  page.drawRectangle({ x, y, width: w, height: h, borderColor: LINE, borderWidth: 0.6 });
};
