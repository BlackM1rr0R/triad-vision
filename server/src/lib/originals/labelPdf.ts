import QRCode from 'qrcode';
import { A4, BRAND, INK, MM, MUTED, createDoc, fit } from '../cv/pdfKit.js';
import { VISA_TYPE_LABEL } from './constants.js';

/**
 * Printable labels for the paper folder of a client: a QR code (→ <CLIENT_URL>/q/<caseId>, which only
 * staff can resolve — the code itself carries no personal data), the client's name, case number, visa
 * type and a short "Triad Vision" line. Layouts: one big label on A4, 8 labels on A4 (2 × 4), or one
 * 62 × 29 mm label for a label printer.
 */

export const LABEL_LAYOUTS = ['a4-1', 'a4-8', '62mm'] as const;
export type LabelLayout = (typeof LABEL_LAYOUTS)[number];

export interface LabelInput {
  url: string;
  clientName: string;
  caseNumber: string;
  visaType: string;
  category?: string | null;
}

export const buildLabelPdf = async (input: LabelInput, layout: LabelLayout): Promise<Buffer> => {
  const { pdf, fonts } = await createDoc({ title: `Etiket ${input.caseNumber}`, author: 'Triad Vision', lang: 'de-DE' });
  const qrPng = await QRCode.toBuffer(input.url, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 600 });
  const qr = await pdf.embedPng(qrPng);
  const visa = VISA_TYPE_LABEL[input.visaType] ?? { az: input.visaType, de: input.visaType };
  const visaLine = `${visa.de} / ${visa.az}${input.category ? ` · ${input.category}` : ''}`;

  /** One label in the box (x, y = bottom-left, w × h). */
  const drawLabel = (page: ReturnType<typeof pdf.addPage>, x: number, y: number, w: number, h: number, scale: number) => {
    const pad = 4 * MM * scale;
    const qrSize = Math.min(h - 2 * pad, w * 0.42);
    page.drawImage(qr, { x: x + pad, y: y + (h - qrSize) / 2, width: qrSize, height: qrSize });
    const tx = x + pad * 2 + qrSize;
    const tw = w - (tx - x) - pad;
    const big = 13 * scale;
    const mid = 9 * scale;
    const small = 7 * scale;
    let ty = y + h - pad - big;
    page.drawText(fit(input.clientName, fonts.bold, big, tw), { x: tx, y: ty, size: big, font: fonts.bold, color: INK });
    ty -= mid * 1.7;
    page.drawText(fit(input.caseNumber, fonts.bold, mid * 1.1, tw), { x: tx, y: ty, size: mid * 1.1, font: fonts.bold, color: BRAND });
    ty -= mid * 1.5;
    page.drawText(fit(visaLine, fonts.regular, mid, tw), { x: tx, y: ty, size: mid, font: fonts.regular, color: INK });
    page.drawText(fit('Triad Vision · Original-Akte', fonts.regular, small, tw), { x: tx, y: y + pad, size: small, font: fonts.regular, color: MUTED });
  };

  if (layout === '62mm') {
    const w = 62 * MM;
    const h = 29 * MM;
    const page = pdf.addPage([w, h]);
    drawLabel(page, 0, 0, w, h, 0.62);
  } else if (layout === 'a4-1') {
    const page = pdf.addPage(A4);
    const w = A4[0] - 30 * MM;
    const h = 90 * MM;
    const x = 15 * MM;
    const y = A4[1] - 20 * MM - h;
    page.drawRectangle({ x, y, width: w, height: h, borderColor: MUTED, borderWidth: 0.5, borderDashArray: [3, 3] });
    drawLabel(page, x, y, w, h, 1.6);
  } else {
    // 2 × 4 on A4 (105 × 74 mm cells, the common "8 per sheet" label format), cut marks as dashed boxes.
    const page = pdf.addPage(A4);
    const cols = 2;
    const rows = 4;
    const w = A4[0] / cols;
    const h = A4[1] / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * w;
        const y = A4[1] - (r + 1) * h;
        page.drawRectangle({ x: x + 2, y: y + 2, width: w - 4, height: h - 4, borderColor: MUTED, borderWidth: 0.3, borderDashArray: [2, 3] });
        drawLabel(page, x + 6, y + 6, w - 12, h - 12, 1);
      }
    }
  }
  return Buffer.from(await pdf.save());
};
