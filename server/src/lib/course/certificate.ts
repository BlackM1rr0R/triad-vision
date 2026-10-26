import QRCode from 'qrcode';
import { rgb } from 'pdf-lib';
import { config } from '../../config.js';
import { BRAND, INK, LINE, MUTED, clean, createDoc, fit, wrap } from '../cv/pdfKit.js';
import { CERT_LABELS, DATE_LOCALE } from './texts.js';
import type { CourseLocale } from './service.js';

/**
 * Completion certificate as a one-page landscape A4 PDF in the chosen language (az / de / en / ru): holder's
 * full name, course title, date, certificate number, and a QR code + link to the public verification page
 * /certificate/:code (which itself shows only initials, course and date). DejaVu Sans via the CV toolkit, so
 * Azerbaijani and Cyrillic letters render; the white-label brand is applied by lib/brand/pdfPatch.
 */

export const verifyUrl = (code: string) => `${config.clientUrl.replace(/\/+$/, '')}/certificate/${code}`;

const HIGHLIGHT = rgb(0.96, 0.69, 0.13);

export const certificatePdf = async (input: { holderName: string; courseTitle: string; issuedAt: Date; number: string; code: string; locale: CourseLocale }) => {
  const L = CERT_LABELS[input.locale] ?? CERT_LABELS.az;
  const { pdf, fonts } = await createDoc({ title: `${L.heading} · ${input.courseTitle}`, author: 'Triad Vision', subject: input.number, lang: input.locale });
  pdf.setCreator('Triad Vision Course');
  const W = 841.89;
  const H = 595.28;
  const page = pdf.addPage([W, H]);
  const centre = (t: string, y: number, size: number, bold = false, color = INK) => {
    const font = bold ? fonts.bold : fonts.regular;
    const s = clean(t);
    page.drawText(s, { x: (W - font.widthOfTextAtSize(s, size)) / 2, y, size, font, color });
  };

  // Frame
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 22, y: 22, width: W - 44, height: H - 44, borderColor: BRAND, borderWidth: 2.5 });
  page.drawRectangle({ x: 30, y: 30, width: W - 60, height: H - 60, borderColor: LINE, borderWidth: 0.8 });
  page.drawRectangle({ x: 30, y: H - 34, width: W - 60, height: 4, color: HIGHLIGHT });

  page.drawText('Triad Vision', { x: 56, y: H - 78, size: 13, font: fonts.bold, color: BRAND });

  centre(L.heading, H - 150, 40, true, BRAND);
  centre(L.sub, H - 178, 14, false, MUTED);
  centre(L.intro, H - 232, 13, false, INK);

  const nameSize = fonts.bold.widthOfTextAtSize(clean(input.holderName), 30) > W - 160 ? 22 : 30;
  centre(fit(input.holderName, fonts.bold, nameSize, W - 160), H - 278, nameSize, true, INK);
  page.drawLine({ start: { x: W / 2 - 180, y: H - 290 }, end: { x: W / 2 + 180, y: H - 290 }, thickness: 0.8, color: LINE });

  centre(L.completed, H - 322, 13, false, INK);
  const titleLines = wrap(input.courseTitle, fonts.bold, 20, W - 220).slice(0, 2);
  titleLines.forEach((line, i) => centre(line, H - 358 - i * 26, 20, true, BRAND));

  // Footer: date + number (left), QR + link (right)
  const date = new Intl.DateTimeFormat(DATE_LOCALE[input.locale] ?? 'de-DE', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' }).format(input.issuedAt);
  const fy = 104;
  page.drawText(L.date, { x: 70, y: fy + 28, size: 9, font: fonts.regular, color: MUTED });
  page.drawText(clean(date), { x: 70, y: fy + 12, size: 13, font: fonts.bold, color: INK });
  page.drawText(L.number, { x: 70, y: fy - 16, size: 9, font: fonts.regular, color: MUTED });
  page.drawText(clean(input.number), { x: 70, y: fy - 32, size: 13, font: fonts.bold, color: INK });

  const url = verifyUrl(input.code);
  const qr = await pdf.embedPng(await QRCode.toBuffer(url, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 360 }));
  const qs = 92;
  page.drawImage(qr, { x: W - 70 - qs, y: fy - 40, width: qs, height: qs });
  const linkSize = 8;
  const linkText = fit(url.replace(/^https?:\/\//, ''), fonts.regular, linkSize, 260);
  page.drawText(L.verify, { x: W - 70 - qs - 12 - fonts.bold.widthOfTextAtSize(L.verify, 9), y: fy + 28, size: 9, font: fonts.bold, color: MUTED });
  page.drawText(linkText, { x: W - 70 - qs - 12 - fonts.regular.widthOfTextAtSize(linkText, linkSize), y: fy + 14, size: linkSize, font: fonts.regular, color: BRAND });

  centre(L.note, 46, 8, false, MUTED);
  return Buffer.from(await pdf.save());
};
