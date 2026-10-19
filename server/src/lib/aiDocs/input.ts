import { PDFDocument } from 'pdf-lib';
import type { AiPart } from '../ai/complete.js';

/**
 * Turns a stored file into AI input parts, keeping the request small (the OpenRouter budget is tiny):
 *   - images (JPEG / PNG / WEBP / GIF): sent as they are, only below MAX_IMAGE_BYTES (the server has no
 *     image library to downscale; the browser downsizes photos before letter uploads);
 *   - PDFs: only the first MAX_PDF_PAGES pages (split with pdf-lib); a PDF that pdf-lib cannot split is
 *     sent whole when it is small enough;
 *   - anything else (Word …) is not readable for the model.
 */

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_PDF_BYTES = 4 * 1024 * 1024;
export const MAX_PDF_PAGES = 3;
export const AI_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export type FilePartResult = { ok: true; parts: AiPart[]; pages: number } | { ok: false; reason: 'UNSUPPORTED_TYPE' | 'TOO_LARGE' | 'UNREADABLE' };

/** The first `pages` pages of a PDF as a new PDF (null when pdf-lib cannot read it). */
export const firstPdfPages = async (buf: Buffer, pages = MAX_PDF_PAGES): Promise<{ data: Buffer; pages: number; total: number } | null> => {
  try {
    const src = await PDFDocument.load(buf, { ignoreEncryption: false, updateMetadata: false });
    const total = src.getPageCount();
    if (!total) return null;
    if (total <= pages) return { data: buf, pages: total, total };
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, Array.from({ length: pages }, (_, i) => i));
    copied.forEach((p) => out.addPage(p));
    return { data: Buffer.from(await out.save()), pages, total };
  } catch {
    return null;
  }
};

export const filePart = async (buf: Buffer, mimeType: string, filename = 'document.pdf'): Promise<FilePartResult> => {
  if (!buf.length) return { ok: false, reason: 'UNREADABLE' };
  if (AI_IMAGE_MIME.includes(mimeType)) {
    if (buf.length > MAX_IMAGE_BYTES) return { ok: false, reason: 'TOO_LARGE' };
    return { ok: true, parts: [{ type: 'image', mime: mimeType, data: buf }], pages: 1 };
  }
  if (mimeType === 'application/pdf') {
    const cut = await firstPdfPages(buf);
    const data = cut?.data ?? buf;
    if (data.length > MAX_PDF_BYTES) return { ok: false, reason: 'TOO_LARGE' };
    const name = /\.pdf$/i.test(filename) ? filename : `${filename}.pdf`;
    return { ok: true, parts: [{ type: 'pdf', filename: name.slice(0, 120), data }], pages: cut?.pages ?? 1 };
  }
  return { ok: false, reason: 'UNSUPPORTED_TYPE' };
};

/** ISO date (YYYY-MM-DD) or null. */
export const isoDate = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
};

/** Trimmed string, cut to `max`, or null. */
export const str = (v: unknown, max = 300): string | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};

export const today = (now = new Date()) => now.toISOString().slice(0, 10);
