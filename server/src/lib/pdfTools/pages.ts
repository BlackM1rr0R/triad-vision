import sharp from 'sharp';
import { PDFDocument, PDFPage, degrees, rgb, type PDFImage } from 'pdf-lib';
import { badRequest } from '../http.js';
import { PDF_LIMITS, checkIndices, embedDejaVu, loadPdf, pageGeometry, savePdf, setPages, visualToUser } from './core.js';
import { embeddable, imagePage } from './images.js';

/**
 * Page operations of the PDF editor and the one-shot tools (split, merge, watermark, stamp, redact).
 * Page indices in the API are 0-based; range strings typed by people are 1-based.
 */

export type PageOp =
  | { type: 'rotate'; pages: number[]; angle: number }
  | { type: 'delete'; pages: number[] }
  | { type: 'reorder'; order: number[] }
  | { type: 'insert'; at: number; sourceNodeId: string; pages?: number[] };

/** Bytes of another drive file for an insert (the route checks access): a PDF or an image. */
export type InsertSource = { kind: 'pdf' | 'image'; bytes: Buffer };

/** Applies the editor's operations in order to the PDF and returns the new bytes and page count. */
export const applyOps = async (src: Buffer, ops: PageOp[], loadSource: (nodeId: string) => Promise<InsertSource>) => {
  const doc = await loadPdf(src);
  let pages: PDFPage[] = doc.getPages();
  for (const op of ops) {
    if (op.type === 'rotate') {
      if (op.angle % 90 !== 0) throw badRequest('INVALID_ANGLE');
      for (const i of checkIndices(op.pages, pages.length)) {
        const p = pages[i];
        p.setRotation(degrees((((p.getRotation().angle + op.angle) % 360) + 360) % 360));
      }
    } else if (op.type === 'delete') {
      const del = checkIndices(op.pages, pages.length);
      pages = pages.filter((_, i) => !del.has(i));
      if (!pages.length) throw badRequest('NO_PAGES_LEFT');
    } else if (op.type === 'reorder') {
      if (op.order.length !== pages.length) throw badRequest('INVALID_ORDER');
      checkIndices(op.order, pages.length);
      pages = op.order.map((i) => pages[i]);
    } else if (op.type === 'insert') {
      if (!Number.isInteger(op.at) || op.at < 0 || op.at > pages.length) throw badRequest('INVALID_PAGES');
      const s = await loadSource(op.sourceNodeId);
      let added: PDFPage[];
      if (s.kind === 'image') added = [await imagePage(doc, s.bytes)];
      else {
        const other = await loadPdf(s.bytes);
        const idx = op.pages?.length ? op.pages : other.getPageIndices();
        checkIndices(idx, other.getPageCount());
        added = await doc.copyPages(other, idx);
      }
      pages.splice(op.at, 0, ...added);
    }
    if (pages.length > PDF_LIMITS.maxPages) throw badRequest('TOO_MANY_PAGES');
  }
  setPages(doc, pages);
  return { bytes: await savePdf(doc), pageCount: pages.length };
};

/** A new PDF with only the given pages of `src` (in that order); fields and links of those pages stay. */
export const extractPages = async (src: Buffer, indices: number[]) => {
  const doc = await loadPdf(src);
  const all = doc.getPages();
  checkIndices(indices, all.length);
  setPages(
    doc,
    indices.map((i) => all[i]),
  );
  return savePdf(doc);
};

/** PDFs and images in the given order as one PDF (the first PDF is the base, so its form stays intact). */
export const mergeSources = async (sources: InsertSource[], title: string) => {
  const firstPdf = sources.findIndex((s) => s.kind === 'pdf');
  const doc = firstPdf === 0 ? await loadPdf(sources[0].bytes) : await PDFDocument.create();
  const pages: PDFPage[] = [];
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    if (i === 0 && firstPdf === 0) pages.push(...doc.getPages());
    else if (s.kind === 'image') pages.push(await imagePage(doc, s.bytes));
    else {
      const other = await loadPdf(s.bytes);
      pages.push(...(await doc.copyPages(other, other.getPageIndices())));
    }
    if (pages.length > PDF_LIMITS.maxPages) throw badRequest('TOO_MANY_PAGES');
  }
  setPages(doc, pages);
  doc.setTitle(title);
  return savePdf(doc);
};

// ─── watermark ───────────────────────────────────────────────────────

export interface WatermarkOptions {
  text: string;
  position: 'diagonal' | 'footer' | 'header';
  /** 0.05 … 1 */
  opacity: number;
  /** Font size in points. */
  size: number;
  /** "#rrggbb" */
  color: string;
  /** 0-based pages; null = all. */
  pages: Set<number> | null;
}

const hexColor = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw badRequest('INVALID_COLOR');
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** Text (DejaVu, so ə / ş / Cyrillic work) stamped on the pages, upright as the viewer shows the page. */
export const watermark = async (src: Buffer, o: WatermarkOptions) => {
  const doc = await loadPdf(src);
  const font = await embedDejaVu(doc, true);
  const color = hexColor(o.color);
  const text = o.text.replace(/\s+/g, ' ').trim();
  if (!text) throw badRequest('EMPTY_TEXT');
  doc.getPages().forEach((page, i) => {
    if (o.pages && !o.pages.has(i)) return;
    const { vw, vh } = pageGeometry(page);
    let size = o.size;
    let width = font.widthOfTextAtSize(text, size);
    let angle = 0;
    const cx = vw / 2;
    let cy: number;
    if (o.position === 'diagonal') {
      angle = (Math.atan2(vh, vw) * 180) / Math.PI;
      const diag = Math.hypot(vw, vh) * 0.85;
      if (width > diag) {
        size = (size * diag) / width;
        width = diag;
      }
      cy = vh / 2;
    } else {
      const max = vw * 0.9;
      if (width > max) {
        size = (size * max) / width;
        width = max;
      }
      const h = font.heightAtSize(size, { descender: false });
      cy = o.position === 'footer' ? 18 + h / 2 : vh - 18 - h / 2;
    }
    const ch = font.heightAtSize(size, { descender: false }) * 0.7;
    // Start of the baseline so that the text is centred on (cx, cy) at the given angle.
    const rad = (angle * Math.PI) / 180;
    const vx = cx - (Math.cos(rad) * width) / 2 + (Math.sin(rad) * ch) / 2;
    const vy = cy - (Math.sin(rad) * width) / 2 - (Math.cos(rad) * ch) / 2;
    const u = visualToUser(page, vx, vy);
    page.drawText(text, { x: u.x, y: u.y, size, font, color, opacity: o.opacity, rotate: degrees(angle + u.rot) });
  });
  return savePdf(doc);
};

// ─── stamps and signatures ───────────────────────────────────────────

export interface StampItem {
  page: number;
  /** Visual coordinates in points, origin top-left of the page as displayed (rotation applied). */
  x: number;
  y: number;
  width: number;
  height: number;
  imageNodeId: string;
  dateText?: string;
}

/** Embeds stamp / signature images at exact positions (+ optional date text under each). */
export const stamp = async (src: Buffer, items: StampItem[], loadImage: (nodeId: string) => Promise<Buffer>) => {
  const doc = await loadPdf(src);
  const pages = doc.getPages();
  const cache = new Map<string, PDFImage>();
  const needsFont = items.some((i) => i.dateText?.trim());
  const font = needsFont ? await embedDejaVu(doc) : null;
  for (const it of items) {
    const page = pages[it.page];
    if (!page) throw badRequest('INVALID_PAGES');
    const { vw, vh } = pageGeometry(page);
    if (it.width <= 0 || it.height <= 0 || it.x < -1 || it.y < -1 || it.x + it.width > vw + 1 || it.y + it.height > vh + 1) throw badRequest('OUT_OF_PAGE');
    let img = cache.get(it.imageNodeId);
    if (!img) {
      const e = await embeddable(await loadImage(it.imageNodeId));
      img = e.type === 'jpg' ? await doc.embedJpg(e.bytes) : await doc.embedPng(e.bytes);
      cache.set(it.imageNodeId, img);
    }
    // Bottom-left corner of the box in visual coordinates (origin bottom-left).
    const bl = visualToUser(page, it.x, vh - it.y - it.height);
    page.drawImage(img, { x: bl.x, y: bl.y, width: it.width, height: it.height, rotate: degrees(bl.rot) });
    const date = it.dateText?.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (date && font) {
      const size = Math.max(7, Math.min(12, it.height * 0.16));
      const below = vh - it.y - it.height - size - 3;
      const vy = below >= 4 ? below : vh - it.y + 3;
      const p = visualToUser(page, it.x, vy);
      page.drawText(date, { x: p.x, y: p.y, size, font, color: rgb(0.1, 0.1, 0.18), rotate: degrees(p.rot) });
    }
  }
  return savePdf(doc);
};

// ─── redaction ───────────────────────────────────────────────────────

export interface RedactPage {
  index: number;
  image: Buffer;
}

/**
 * True redaction: each listed page is replaced by a new page holding only the given image (rendered and
 * blacked out in the browser); the old page — its text, fonts, images and annotations — is removed from the
 * file. Other pages keep their text. The new page has the size of the page as displayed (rotation baked in).
 */
export const redactPages = async (src: Buffer, list: RedactPage[]) => {
  const doc = await loadPdf(src);
  const pages = doc.getPages();
  checkIndices(
    list.map((r) => r.index),
    pages.length,
  );
  const next = [...pages];
  for (const r of list) {
    const meta = await sharp(r.image).metadata().catch(() => null);
    if (!meta || (meta.format !== 'png' && meta.format !== 'jpeg')) throw badRequest('UNSUPPORTED_IMAGE');
    if ((meta.width ?? 0) > PDF_LIMITS.maxRedactPixels || (meta.height ?? 0) > PDF_LIMITS.maxRedactPixels) throw badRequest('IMAGE_TOO_LARGE');
    // Smaller of lossless PNG and a high-quality JPEG (scans compress far better as JPEG).
    const flat = sharp(r.image).flatten({ background: '#ffffff' });
    const [png, jpg] = await Promise.all([flat.clone().png({ compressionLevel: 9 }).toBuffer(), flat.clone().jpeg({ quality: 85, mozjpeg: true }).toBuffer()]);
    const img = jpg.length < png.length * 0.8 ? await doc.embedJpg(jpg) : await doc.embedPng(png);
    const { vw, vh } = pageGeometry(pages[r.index]);
    const page = PDFPage.create(doc);
    page.setSize(vw, vh);
    page.drawImage(img, { x: 0, y: 0, width: vw, height: vh });
    next[r.index] = page;
  }
  setPages(doc, next);
  return savePdf(doc);
};
