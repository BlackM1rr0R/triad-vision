import { BRAND, Flow, INK, LINE, MM, MUTED, A4, clean, createDoc, fit, numberPages, wrap } from './pdfKit.js';
import { fmtDate } from './texts.js';
import type { LetterLang } from './letters.js';

/**
 * Letter PDF loosely following DIN 5008 (form B): sender block in the header, return line and recipient in
 * the address window, place and date, bold subject (Betreff), then the body as edited by the client.
 */

export interface LetterPdfInput {
  language: LetterLang;
  sender: { name: string; address?: string | null; city?: string | null; phone?: string | null; email?: string | null };
  recipient: string[];
  title: string;
  body: string;
  date?: Date;
}

export const renderLetterPdf = async (input: LetterPdfInput): Promise<Buffer> => {
  const de = input.language === 'de';
  const { pdf, fonts } = await createDoc({ title: input.title, author: input.sender.name, subject: input.title, lang: de ? 'de-DE' : 'en-GB' });
  const H = A4[1];
  const left = 25 * MM;
  const right = A4[0] - 20 * MM;
  const width = right - left;
  const flow = new Flow(pdf, fonts, {
    top: H - 25 * MM,
    bottom: 25 * MM,
    onNewPage: (p) => {
      // fold and punch marks
      for (const [mm, len] of [[105, 8], [148.5, 12], [210, 8]] as const) p.drawLine({ start: { x: 0, y: H - mm * MM }, end: { x: len, y: H - mm * MM }, thickness: 0.4, color: LINE });
    },
  });
  const page = flow.page;
  const s = input.sender;
  const addressLine = [s.address?.replace(/\s*\n\s*/g, ', '), s.address && s.city && !s.address.includes(s.city) ? s.city : !s.address ? s.city : ''].filter(Boolean).join(', ');

  // Sender block, right aligned in the header
  const senderLines: [string, boolean][] = [[s.name, true], ...([addressLine, s.phone, s.email].filter(Boolean).map((l) => [l as string, false]) as [string, boolean][])];
  let y = H - 18 * MM;
  for (const [line, bold] of senderLines) {
    const font = bold ? fonts.bold : fonts.regular;
    const size = bold ? 11 : 9;
    const t = fit(line, font, size, width * 0.6);
    page.drawText(t, { x: right - font.widthOfTextAtSize(t, size), y, size, font, color: bold ? BRAND : MUTED });
    y -= bold ? 14 : 12;
  }

  // Address window: return line + recipient (45 mm from the top)
  const ret = fit([s.name, addressLine].filter(Boolean).join(' · '), fonts.regular, 7, 85 * MM);
  page.drawText(ret, { x: left, y: H - 50 * MM, size: 7, font: fonts.regular, color: MUTED });
  page.drawLine({ start: { x: left, y: H - 50 * MM - 2 }, end: { x: left + fonts.regular.widthOfTextAtSize(ret, 7), y: H - 50 * MM - 2 }, thickness: 0.3, color: MUTED });
  let ry = H - 56 * MM;
  const recipientLines = input.recipient.flatMap((l) => wrap(l, fonts.regular, 10.5, 85 * MM)).slice(0, 7);
  for (const line of recipientLines) {
    page.drawText(line, { x: left, y: ry, size: 10.5, font: fonts.regular, color: INK });
    ry -= 14;
  }

  // Place and date
  const date = `${clean(s.city?.trim() || 'Baku')}, ${fmtDate(input.date ?? new Date(), input.language)}`;
  page.drawText(date, { x: right - fonts.regular.widthOfTextAtSize(date, 10.5), y: H - 98 * MM, size: 10.5, font: fonts.regular, color: INK });

  // Subject + body
  flow.y = H - 108 * MM;
  flow.para(input.title, left, width, { bold: true, size: 11 });
  flow.gap(14);
  flow.para(input.body.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n'), left, width, { size: 10.5, leading: 15 });

  numberPages(flow.pages, fonts, de ? 'Seite' : 'Page', right, de ? 'von' : 'of');
  return Buffer.from(await pdf.save());
};
