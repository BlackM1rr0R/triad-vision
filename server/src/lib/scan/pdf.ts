import { PDFDocument } from 'pdf-lib';

/**
 * Phone scans → one PDF: every page image is placed on its own A4 page (portrait, or landscape for a
 * landscape image), scaled to fit inside a small margin and centred. JPEG pages are embedded as they
 * are (no re-encoding: the apps already shrink and compress them; sharp is not a server dependency).
 */

export const SCAN_MAX_PAGES = 20;
export const SCAN_IMAGE_MIME = ['image/jpeg', 'image/png'] as const;
/** Upper bound for the produced PDF. */
export const SCAN_MAX_PDF_BYTES = 30 * 1024 * 1024;

export const A4 = { width: 595.28, height: 841.89 } as const;
const MARGIN = 18;

export class ScanImageError extends Error {
  constructor(public readonly page: number) {
    super(`Page ${page} is not a readable JPEG/PNG image`);
  }
}

/** Placement of an image on an A4 page: orientation follows the image, fit inside the margin, centred. */
export const fitOnA4 = (img: { width: number; height: number }) => {
  const landscape = img.width > img.height;
  const pageW = landscape ? A4.height : A4.width;
  const pageH = landscape ? A4.width : A4.height;
  const scale = Math.min((pageW - 2 * MARGIN) / img.width, (pageH - 2 * MARGIN) / img.height);
  const width = img.width * scale;
  const height = img.height * scale;
  return { pageW, pageH, x: (pageW - width) / 2, y: (pageH - height) / 2, width, height };
};

export const buildScanPdf = async (pages: { data: Buffer; mime: string }[], meta: { title?: string; now?: Date } = {}) => {
  const pdf = await PDFDocument.create();
  pdf.setTitle(meta.title ?? 'Scan');
  pdf.setProducer('Triad Vision');
  pdf.setCreator('Triad Vision document scanner');
  const now = meta.now ?? new Date();
  pdf.setCreationDate(now);
  pdf.setModificationDate(now);
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    let image;
    try {
      image = p.mime === 'image/png' ? await pdf.embedPng(p.data) : await pdf.embedJpg(p.data);
    } catch {
      throw new ScanImageError(i + 1);
    }
    const box = fitOnA4(image);
    const page = pdf.addPage([box.pageW, box.pageH]);
    page.drawImage(image, { x: box.x, y: box.y, width: box.width, height: box.height });
  }
  return Buffer.from(await pdf.save({ useObjectStreams: true }));
};
