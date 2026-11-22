import { PDFDocument, PDFName, PDFRef, PDFSignature, PDFTextField, StandardFonts, rgb, type PDFField, type PDFImage } from 'pdf-lib';
import { z } from 'zod';
import { safeText } from '../pdfSign.js';

/**
 * Signature places on the original pages (case contracts V2, lib/caseContracts):
 *
 *   - Staff upload their own PDF that already has empty signature places. Either the PDF has AcroForm fields
 *     (signature or text fields) — `inspectPdfFields` lists them and staff map each to "client" or "Triad Vision" —
 *     or staff draw the boxes on a rendered page preview. Both end up as placements: page (1-based) + rectangle in
 *     PDF points (user space, bottom-left origin, like pdf-lib), with the field name when it came from a field.
 *   - On completion `stampSignatures` draws every signature (drawn image or typed name, plus name and UTC time in
 *     small print) INTO those boxes; a mapped form field is removed so its empty widget does not cover the stamp.
 *     No signature page is appended (the certificate of completion still is).
 */

export const PLACEMENT_ROLES = ['CANDIDATE', 'STAFF'] as const;
export type PlacementRole = (typeof PLACEMENT_ROLES)[number];

export const placementSchema = z.object({
  role: z.enum(PLACEMENT_ROLES),
  page: z.number().int().min(1).max(2000),
  x: z.number().finite().min(-10_000).max(20_000),
  y: z.number().finite().min(-10_000).max(20_000),
  w: z.number().finite().min(8).max(5_000),
  h: z.number().finite().min(8).max(5_000),
  field: z.string().trim().min(1).max(200).optional(),
});
export type Placement = z.infer<typeof placementSchema>;
export const placementsSchema = z.array(placementSchema).min(1).max(40);

export interface PdfFieldInfo {
  name: string;
  type: 'signature' | 'text' | 'other';
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfPageInfo {
  width: number;
  height: number;
  /** Lower-left corner of the media box (user space). */
  x: number;
  y: number;
}

const fieldType = (f: PDFField): PdfFieldInfo['type'] => (f instanceof PDFSignature ? 'signature' : f instanceof PDFTextField ? 'text' : 'other');

/** Pages (size) and form fields with their widget rectangles. Never throws on a PDF without a form. */
export const inspectPdfFields = async (buf: Buffer): Promise<{ pages: PdfPageInfo[]; fields: PdfFieldInfo[] }> => {
  const doc = await PDFDocument.load(buf);
  const pageList = doc.getPages();
  const pages = pageList.map((p) => {
    const box = p.getMediaBox();
    return { width: box.width, height: box.height, x: box.x, y: box.y };
  });
  const refIndex = new Map<string, number>(pageList.map((p, i) => [p.ref.toString(), i]));
  const fields: PdfFieldInfo[] = [];
  let form;
  try {
    form = doc.getForm();
  } catch {
    return { pages, fields };
  }
  for (const f of form.getFields()) {
    const type = fieldType(f);
    if (type === 'other') continue;
    for (const w of f.acroField.getWidgets()) {
      const rect = w.getRectangle();
      const pRef = w.dict.get(PDFName.of('P'));
      let page = pRef instanceof PDFRef ? refIndex.get(pRef.toString()) : undefined;
      if (page === undefined) {
        // No /P entry: find the page whose /Annots holds this widget.
        page = pageList.findIndex((p) => {
          const annots = p.node.Annots();
          return !!annots && annots.asArray().some((a) => a instanceof PDFRef && doc.context.lookup(a) === w.dict);
        });
      }
      if (page === undefined || page < 0) continue;
      if (rect.width < 4 || rect.height < 4) continue;
      fields.push({ name: f.getName(), type, page: page + 1, x: rect.x, y: rect.y, w: rect.width, h: rect.height });
    }
  }
  return { pages, fields };
};

/**
 * Checks placements against the PDF: every page exists; a field placement takes the field's real rectangle from the
 * PDF (the browser's numbers are not trusted for it). Returns the cleaned list.
 */
export const resolvePlacements = async (buf: Buffer, input: Placement[]): Promise<Placement[]> => {
  const { pages, fields } = await inspectPdfFields(buf);
  const out: Placement[] = [];
  for (const p of input) {
    if (p.page > pages.length) throw Object.assign(new Error('PLACEMENT_PAGE'), { code: 'PLACEMENT_PAGE' });
    if (p.field) {
      const f = fields.find((x) => x.name === p.field && x.page === p.page) ?? fields.find((x) => x.name === p.field);
      if (!f) throw Object.assign(new Error('PLACEMENT_FIELD'), { code: 'PLACEMENT_FIELD' });
      out.push({ role: p.role, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, field: f.name });
    } else {
      out.push({ role: p.role, page: p.page, x: p.x, y: p.y, w: p.w, h: p.h });
    }
  }
  return out;
};

/** Which roles have at least one place. */
export const rolesWithPlaces = (placements: Placement[]) => new Set(placements.map((p) => p.role));

export interface StampSigner {
  role: string;
  name: string;
  signedAt: Date | null;
  imagePng?: Buffer | null;
  typedName?: string | null;
}

const utcShort = (d: Date | null) => (d ? `${d.toISOString().replace('T', ' ').slice(0, 16)} UTC` : '');

/** Draws each signer's signature into the boxes of their role (first signer of a role fills that role's boxes). */
export const stampSignatures = async (doc: PDFDocument, signers: StampSigner[], placements: Placement[]) => {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const script = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const pages = doc.getPages();
  const images = new Map<StampSigner, PDFImage>();
  for (const s of signers) if (s.imagePng) images.set(s, await doc.embedPng(s.imagePng));

  // Mapped form fields go first: their empty widgets would otherwise be drawn above the stamp.
  const used = [...new Set(placements.map((p) => p.field).filter((x): x is string => !!x))];
  if (used.length) {
    try {
      const form = doc.getForm();
      for (const name of used) {
        const f = form.getFieldMaybe(name);
        if (f) form.removeField(f);
      }
    } catch (err) {
      console.warn('[esign] form fields not removed', (err as Error).message);
    }
  }

  for (const p of placements) {
    const s = signers.find((x) => x.role === p.role);
    const page = pages[p.page - 1];
    if (!s || !page) continue;
    const caption = safeText(font, `${s.name} · ${utcShort(s.signedAt)}`);
    let capSize = Math.max(4.5, Math.min(7, p.h * 0.16));
    while (capSize > 4 && font.widthOfTextAtSize(caption, capSize) > p.w) capSize -= 0.25;
    const capH = capSize + 2;
    const areaH = Math.max(4, p.h - capH);
    const img = images.get(s);
    if (img) {
      const dims = img.scaleToFit(p.w, areaH);
      page.drawImage(img, { x: p.x + (p.w - dims.width) / 2, y: p.y + capH + (areaH - dims.height) / 2, width: dims.width, height: dims.height });
    } else {
      const typed = safeText(script, s.typedName || s.name);
      let size = Math.min(28, areaH * 0.8);
      while (size > 5 && script.widthOfTextAtSize(typed, size) > p.w) size -= 0.5;
      page.drawText(typed, { x: p.x + 2, y: p.y + capH + Math.max(0, (areaH - size) / 2), size, font: script, color: rgb(0.043, 0.122, 0.267) });
    }
    page.drawText(caption, { x: p.x + 1, y: p.y + 1, size: capSize, font, color: rgb(0.36, 0.42, 0.53) });
  }
};
