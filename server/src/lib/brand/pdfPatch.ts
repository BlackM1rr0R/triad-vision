import { PDFDocument, PDFPage } from 'pdf-lib';
import { brandify } from './index.js';

/**
 * White-label sink for every generated PDF (invoices, contracts, reports, official-form data sheets, CVs,
 * e-sign certificates …): text drawn with pdf-lib and the document metadata go through brandify(), so the
 * literal "Triad Vision" in the PDF code prints as this instance's brand. With the default brand brandify()
 * returns its input unchanged. Installed once (imported by app.ts); idempotent.
 */
const MARK = Symbol.for('triad.brandPdfPatch');
type Patched = { [MARK]?: true };

if (!(PDFPage.prototype as Patched)[MARK]) {
  (PDFPage.prototype as Patched)[MARK] = true;
  const drawText = PDFPage.prototype.drawText;
  PDFPage.prototype.drawText = function patchedDrawText(this: PDFPage, text: string, options?: Parameters<PDFPage['drawText']>[1]) {
    return drawText.call(this, typeof text === 'string' ? brandify(text) : text, options);
  };
  for (const method of ['setTitle', 'setAuthor', 'setSubject', 'setCreator', 'setProducer'] as const) {
    const original = PDFDocument.prototype[method] as (this: PDFDocument, value: string, ...rest: unknown[]) => void;
    (PDFDocument.prototype as unknown as Record<string, unknown>)[method] = function patchedMeta(this: PDFDocument, value: string, ...rest: unknown[]) {
      return original.call(this, typeof value === 'string' ? brandify(value) : value, ...rest);
    };
  }
}

export {};
