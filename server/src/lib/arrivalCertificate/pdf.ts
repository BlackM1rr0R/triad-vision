import QRCode from 'qrcode';
import { rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { BRAND, INK, LINE, MUTED, clean, createDoc, fit, wrap } from '../cv/pdfKit.js';
import { CERT_TEXTS, DATE_LOCALE, type CertLocale } from './texts.js';

/**
 * "Welcome to Germany" certificate: one landscape A4 page in the client's language (az / de / en / ru) with
 * a decorative double frame, the German colours, a flight-path illustration, the holder's full name (it is the
 * client's own keepsake), city, arrival date, profession, optionally the employer, the certificate number, a
 * signature line and a QR code + link to the public verification page. DejaVu Sans (CV toolkit) so Azerbaijani,
 * German and Cyrillic letters render; the white-label brand is applied by lib/brand/pdfPatch.
 */

const AMBER = rgb(0.91, 0.64, 0.09);
const CREAM = rgb(0.995, 0.985, 0.955);
const NAVY_SOFT = rgb(0.9, 0.93, 0.97);
const W = 841.89;
const H = 595.28;

export interface ArrivalCertInput {
  fullName: string;
  city: string | null;
  arrivedAt: Date;
  profession: string;
  employer: string | null;
  number: string;
  verifyUrl: string;
  locale: CertLocale;
}

const corner = (page: PDFPage, x: number, y: number, sx: number, sy: number) => {
  // Two nested L-shaped ornaments + a diamond in each corner of the inner frame.
  const l = 46;
  page.drawLine({ start: { x, y }, end: { x: x + sx * l, y }, thickness: 2.2, color: AMBER });
  page.drawLine({ start: { x, y }, end: { x, y: y + sy * l }, thickness: 2.2, color: AMBER });
  page.drawLine({ start: { x: x + sx * 8, y: y + sy * 8 }, end: { x: x + sx * 30, y: y + sy * 8 }, thickness: 0.8, color: BRAND });
  page.drawLine({ start: { x: x + sx * 8, y: y + sy * 8 }, end: { x: x + sx * 8, y: y + sy * 30 }, thickness: 0.8, color: BRAND });
  const cx = x + sx * 18;
  const cy = y + sy * 18;
  page.drawSvgPath('M0 -5 L5 0 L0 5 L-5 0 Z', { x: cx, y: cy, color: AMBER });
};

const logo = (page: PDFPage, bold: PDFFont, x: number, y: number) => {
  const bars: RGB[] = [rgb(0, 0.71, 0.89), rgb(0.94, 0.2, 0.25), rgb(0.31, 0.62, 0.18), rgb(1, 0.81, 0)];
  bars.forEach((c, i) => page.drawRectangle({ x: x + i * 6.5, y, width: 5, height: 16, color: c }));
  page.drawText('TRIAD VISION', { x: x + 32, y: y + 3, size: 13, font: bold, color: BRAND });
};

export const arrivalCertificatePdf = async (input: ArrivalCertInput) => {
  const L = CERT_TEXTS[input.locale];
  const { pdf, fonts } = await createDoc({ title: `${L.heading} · ${input.fullName}`, author: 'Triad Vision', subject: input.number, lang: input.locale });
  pdf.setCreator('Triad Vision');
  const page = pdf.addPage([W, H]);
  const centre = (t: string, y: number, size: number, font: PDFFont, color = INK) => {
    const s = fit(clean(t), font, size, W - 170);
    page.drawText(s, { x: (W - font.widthOfTextAtSize(s, size)) / 2, y, size, font, color });
  };

  // Background + frame.
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
  // Soft circles behind everything (the frame is drawn over them).
  page.drawCircle({ x: W - 150, y: H - 160, size: 105, color: NAVY_SOFT, opacity: 0.55 });
  page.drawCircle({ x: 140, y: 140, size: 90, color: rgb(1, 0.95, 0.82), opacity: 0.7 });
  page.drawRectangle({ x: 16, y: 16, width: W - 32, height: H - 32, borderColor: BRAND, borderWidth: 5 });
  page.drawRectangle({ x: 27, y: 27, width: W - 54, height: H - 54, borderColor: AMBER, borderWidth: 1.2 });
  page.drawRectangle({ x: 31, y: 31, width: W - 62, height: H - 62, borderColor: LINE, borderWidth: 0.5 });
  corner(page, 40, 40, 1, 1);
  corner(page, W - 40, 40, -1, 1);
  corner(page, 40, H - 40, 1, -1);
  corner(page, W - 40, H - 40, -1, -1);

  // German colours along the top of the inner frame.
  const stripeW = 180;
  const sx = (W - stripeW) / 2;
  [rgb(0, 0, 0), rgb(0.87, 0, 0), rgb(1, 0.81, 0)].forEach((c, i) => page.drawRectangle({ x: sx + (i * stripeW) / 3, y: H - 37, width: stripeW / 3, height: 5, color: c }));

  // Illustration: soft circles and a dashed flight path up to a plane.
  // (kept in the right margin, clear of the text)
  page.drawSvgPath('M 0 0 C 50 -40, 0 -110, 34 -150', { x: 738, y: 172, borderColor: BRAND, borderWidth: 1.1, borderOpacity: 0.3, borderDashArray: [3, 7] });
  page.drawText('✈', { x: 760, y: 328, size: 30, font: fonts.bold, color: AMBER, opacity: 0.9 });

  logo(page, fonts.bold, 58, H - 82);
  const kicker = clean(L.kicker).toLocaleUpperCase(input.locale);
  page.drawText(kicker, { x: W - 58 - fonts.bold.widthOfTextAtSize(kicker, 10), y: H - 78, size: 10, font: fonts.bold, color: MUTED });

  // Heading.
  let headSize = 38;
  while (headSize > 24 && fonts.bold.widthOfTextAtSize(clean(L.heading), headSize) > W - 170) headSize -= 1;
  centre(L.heading, H - 150, headSize, fonts.bold, BRAND);
  if (input.locale !== 'de') centre('Willkommen in Deutschland', H - 176, 12, fonts.regular, MUTED);
  centre(L.intro, H - 222, 13, fonts.regular, INK);

  // Name.
  let nameSize = 34;
  while (nameSize > 18 && fonts.bold.widthOfTextAtSize(clean(input.fullName), nameSize) > W - 200) nameSize -= 2;
  centre(input.fullName, H - 266, nameSize, fonts.bold, INK);
  page.drawLine({ start: { x: W / 2 - 200, y: H - 280 }, end: { x: W / 2 + 200, y: H - 280 }, thickness: 1, color: AMBER });

  const date = new Intl.DateTimeFormat(DATE_LOCALE[input.locale], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' }).format(input.arrivedAt);
  const arrived = input.city ? L.arrived(input.city, date) : L.arrivedNoCity(date);
  let y = H - 310;
  for (const line of wrap(clean(arrived), fonts.regular, 15, W - 220).slice(0, 2)) {
    centre(line, y, 15, fonts.regular, INK);
    y -= 21;
  }
  const prof = input.profession.trim();
  if (prof) {
    for (const line of wrap(clean(L.profession(prof)), fonts.bold, 15, W - 220).slice(0, 2)) {
      centre(line, y, 15, fonts.bold, BRAND);
      y -= 21;
    }
  }
  if (input.employer) centre(L.employer(input.employer), y - 4, 11, fonts.regular, MUTED);

  // Footer: date + number (left), signature (centre), QR + link (right).
  const fy = 96;
  page.drawText(L.date, { x: 70, y: fy + 30, size: 9, font: fonts.regular, color: MUTED });
  page.drawText(clean(date), { x: 70, y: fy + 14, size: 13, font: fonts.bold, color: INK });
  page.drawText(L.number, { x: 70, y: fy - 12, size: 9, font: fonts.regular, color: MUTED });
  page.drawText(clean(input.number), { x: 70, y: fy - 28, size: 13, font: fonts.bold, color: INK });

  // Signature: a drawn flourish over the line, the team name below.
  const sigX = W / 2 - 110;
  page.drawSvgPath('M 0 0 C 14 -26, 26 -26, 30 -6 C 34 12, 46 -30, 58 -14 C 66 -4, 74 -20, 86 -16 C 98 -12, 104 -4, 120 -12 C 140 -22, 160 -18, 176 -10', {
    x: sigX + 22,
    y: fy + 26,
    borderColor: BRAND,
    borderWidth: 1.6,
  });
  page.drawLine({ start: { x: sigX, y: fy + 4 }, end: { x: sigX + 220, y: fy + 4 }, thickness: 0.8, color: LINE });
  const team = clean(L.team);
  page.drawText(team, { x: W / 2 - fonts.bold.widthOfTextAtSize(team, 11) / 2, y: fy - 12, size: 11, font: fonts.bold, color: INK });
  const sigLabel = clean(L.signature);
  page.drawText(sigLabel, { x: W / 2 - fonts.regular.widthOfTextAtSize(sigLabel, 8) / 2, y: fy - 25, size: 8, font: fonts.regular, color: MUTED });

  const qr = await pdf.embedPng(await QRCode.toBuffer(input.verifyUrl, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 360 }));
  const qs = 86;
  page.drawRectangle({ x: W - 70 - qs - 4, y: fy - 44, width: qs + 8, height: qs + 8, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.6 });
  page.drawImage(qr, { x: W - 70 - qs, y: fy - 40, width: qs, height: qs });
  const linkSize = 7.5;
  const linkText = fit(input.verifyUrl.replace(/^https?:\/\//, ''), fonts.regular, linkSize, 230);
  const right = W - 70 - qs - 14;
  page.drawText(L.verify, { x: right - fonts.bold.widthOfTextAtSize(L.verify, 9), y: fy + 30, size: 9, font: fonts.bold, color: MUTED });
  page.drawText(linkText, { x: right - fonts.regular.widthOfTextAtSize(linkText, linkSize), y: fy + 16, size: linkSize, font: fonts.regular, color: BRAND });

  centre(L.note, 44, 7.5, fonts.regular, MUTED);
  return Buffer.from(await pdf.save());
};
