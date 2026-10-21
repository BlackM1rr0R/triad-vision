import sharp from 'sharp';
import heicConvert from 'heic-convert';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { badRequest } from '../http.js';
import { PDF_MIME, isPdfBytes } from './core.js';

/**
 * Images for the PDF tools: kind detection (by content, then by name / MIME), HEIC/HEIF → JPEG
 * (heic-convert; sharp's prebuilt libvips has no HEVC decoder), shrinking photos and image pages for PDFs.
 */

export type ToolKind = 'pdf' | 'jpeg' | 'png' | 'image' | 'heic';

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);

export const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
export const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/** ISO-BMFF "ftyp" box with a HEIF brand (major or compatible) and not AVIF. */
export const isHeic = (b: Uint8Array) => {
  if (b.length < 16) return false;
  const s = Buffer.from(b.subarray(0, Math.min(b.length, 64)));
  if (s.toString('latin1', 4, 8) !== 'ftyp') return false;
  const size = Math.min(s.readUInt32BE(0), s.length);
  const brands: string[] = [s.toString('latin1', 8, 12)];
  for (let o = 16; o + 4 <= size; o += 4) brands.push(s.toString('latin1', o, o + 4));
  if (brands[0] === 'avif' || brands[0] === 'avis') return false;
  return brands.some((x) => HEIC_BRANDS.has(x));
};

/** What the tools can do with a file: by name/MIME first (cheap), confirmed by content where given. */
export const toolKind = (name: string, mime: string | null, head?: Uint8Array): ToolKind | null => {
  const m = (mime ?? '').toLowerCase();
  const ext = (name.toLowerCase().split('.').pop() ?? '').trim();
  if (head) {
    if (isPdfBytes(head)) return 'pdf';
    if (isJpeg(head)) return 'jpeg';
    if (isPng(head)) return 'png';
    if (isHeic(head)) return 'heic';
  }
  if (m === PDF_MIME || ext === 'pdf') return 'pdf';
  if (m === 'image/heic' || m === 'image/heif' || ext === 'heic' || ext === 'heif') return 'heic';
  if (m === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (m === 'image/png' || ext === 'png') return 'png';
  if (['image/webp', 'image/gif', 'image/avif', 'image/tiff'].includes(m) || ['webp', 'gif', 'avif', 'tif', 'tiff'].includes(ext)) return 'image';
  return null;
};

/** HEIC/HEIF (first image) → JPEG, EXIF orientation applied. Throws HEIC_UNREADABLE. */
export const heicToJpeg = async (buf: Buffer, quality = 90): Promise<Buffer> => {
  if (!isHeic(buf)) throw badRequest('NOT_HEIC');
  let jpeg: Buffer;
  try {
    jpeg = Buffer.from((await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.95 })) as ArrayBuffer);
  } catch {
    throw badRequest('HEIC_UNREADABLE');
  }
  return sharp(jpeg).rotate().jpeg({ quality, mozjpeg: true }).toBuffer();
};

/** Any supported image as something sharp can read (HEIC decoded first). */
const readable = async (buf: Buffer) => (isHeic(buf) ? heicToJpeg(buf, 95) : buf);

/** Normalises an image for embedding in a PDF: JPEG/PNG kept (EXIF rotation applied), anything else → PNG. */
export const embeddable = async (buf: Buffer): Promise<{ bytes: Buffer; type: 'jpg' | 'png' }> => {
  const src = await readable(buf);
  let meta: sharp.Metadata;
  try {
    meta = await sharp(src).metadata();
  } catch {
    throw badRequest('UNSUPPORTED_IMAGE');
  }
  if ((meta.width ?? 0) * (meta.height ?? 0) > 100_000_000) throw badRequest('IMAGE_TOO_LARGE');
  const turned = (meta.orientation ?? 1) !== 1;
  if (meta.format === 'jpeg' && !turned) return { bytes: src, type: 'jpg' };
  if (meta.format === 'png' && !turned) return { bytes: src, type: 'png' };
  if (meta.format === 'jpeg') return { bytes: await sharp(src).rotate().jpeg({ quality: 90 }).toBuffer(), type: 'jpg' };
  return { bytes: await sharp(src, { animated: false }).rotate().png().toBuffer(), type: 'png' };
};

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 28;

/** A new (unattached) A4 page with the image fitted inside the margins (landscape for wide images). */
export const imagePage = async (doc: PDFDocument, buf: Buffer): Promise<PDFPage> => {
  const e = await embeddable(buf);
  let img;
  try {
    img = e.type === 'jpg' ? await doc.embedJpg(e.bytes) : await doc.embedPng(e.bytes);
  } catch {
    throw badRequest('UNSUPPORTED_IMAGE');
  }
  const landscape = img.width > img.height;
  const [pw, ph] = landscape ? [A4.h, A4.w] : [A4.w, A4.h];
  const s = Math.min((pw - 2 * MARGIN) / img.width, (ph - 2 * MARGIN) / img.height, 1.5);
  const page = PDFPage.create(doc);
  page.setSize(pw, ph);
  page.drawImage(img, { x: (pw - img.width * s) / 2, y: (ph - img.height * s) / 2, width: img.width * s, height: img.height * s });
  return page;
};

export interface ImageCompressResult {
  bytes: Buffer;
  mime: string;
  reached: boolean;
  quality: number;
  longSide: number;
}

/**
 * A photo / scan made small: max 2000 px on the long side, JPEG q75 (white behind transparency). With a
 * byte target the quality steps down to 45 and then the size to 1600 / 1200 px until it fits; the smallest
 * result wins either way.
 */
export const compressImage = async (buf: Buffer, maxBytes: number | null): Promise<ImageCompressResult> => {
  const src = await readable(buf);
  try {
    await sharp(src).metadata();
  } catch {
    throw badRequest('UNSUPPORTED_IMAGE');
  }
  const steps: [number, number][] = [[2000, 75]];
  if (maxBytes) steps.push([2000, 65], [2000, 55], [2000, 45], [1600, 45], [1200, 45]);
  let best: ImageCompressResult | null = null;
  for (const [longSide, quality] of steps) {
    const bytes = await sharp(src, { animated: false })
      .rotate()
      .resize({ width: longSide, height: longSide, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (!best || bytes.length < best.bytes.length) best = { bytes, mime: 'image/jpeg', reached: false, quality, longSide };
    if (!maxBytes || bytes.length <= maxBytes) break;
  }
  best!.reached = !maxBytes || best!.bytes.length <= maxBytes;
  return best!;
};

/** One image as a one-page PDF. */
export const imageToPdf = async (buf: Buffer, title: string) => {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer('Triad Vision');
  doc.addPage(await imagePage(doc, buf));
  return Buffer.from(await doc.save());
};
