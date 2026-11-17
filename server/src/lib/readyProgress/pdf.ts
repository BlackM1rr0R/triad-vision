import QRCode from 'qrcode';
import { rgb, type PDFFont } from 'pdf-lib';
import { BRAND, INK, LINE, MUTED, clean, createDoc, fit, wrap } from '../cv/pdfKit.js';
import { READY_DATE_LOCALE, READY_TEXTS, type ReadyLocale } from './texts.js';

/**
 * "Germany Ready" practice certificate: one landscape A4 page (same toolkit and frame style as the arrival
 * certificate, lib/arrivalCertificate/pdf): holder's full name (their own keepsake), level medal, activity count
 * and points, date, number and a QR code to the public check. Clearly labelled "practice achievements".
 */

const W = 841.89;
const H = 595.28;
const CREAM = rgb(0.995, 0.985, 0.955);
const MEDAL = { BRONZE: rgb(0.72, 0.45, 0.2), SILVER: rgb(0.55, 0.58, 0.62), GOLD: rgb(0.91, 0.64, 0.09) } as const;

export interface ReadyCertInput {
  fullName: string;
  level: keyof typeof MEDAL;
  points: number;
  maxPoints: number;
  activities: number;
  date: Date;
  number: string;
  verifyUrl: string;
  locale: ReadyLocale;
}

export const readyCertificatePdf = async (input: ReadyCertInput) => {
  const L = READY_TEXTS[input.locale];
  const { pdf, fonts } = await createDoc({ title: `${L.heading} · ${input.fullName}`, author: 'Triad Vision', subject: input.number, lang: input.locale });
  pdf.setCreator('Triad Vision');
  const page = pdf.addPage([W, H]);
  const medal = MEDAL[input.level];
  const centre = (t: string, y: number, size: number, font: PDFFont, color = INK) => {
    const s = fit(clean(t), font, size, W - 170);
    page.drawText(s, { x: (W - font.widthOfTextAtSize(s, size)) / 2, y, size, font, color });
  };

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
  page.drawRectangle({ x: 16, y: 16, width: W - 32, height: H - 32, borderColor: BRAND, borderWidth: 5 });
  page.drawRectangle({ x: 27, y: 27, width: W - 54, height: H - 54, borderColor: medal, borderWidth: 1.2 });
  const stripeW = 180;
  const sx = (W - stripeW) / 2;
  [rgb(0, 0, 0), rgb(0.87, 0, 0), rgb(1, 0.81, 0)].forEach((c, i) => page.drawRectangle({ x: sx + (i * stripeW) / 3, y: H - 37, width: stripeW / 3, height: 5, color: c }));

  const bars = [rgb(0, 0.71, 0.89), rgb(0.94, 0.2, 0.25), rgb(0.31, 0.62, 0.18), rgb(1, 0.81, 0)];
  bars.forEach((c, i) => page.drawRectangle({ x: 58 + i * 6.5, y: H - 82, width: 5, height: 16, color: c }));
  page.drawText('TRIAD VISION', { x: 90, y: H - 79, size: 13, font: fonts.bold, color: BRAND });
  const kicker = clean(L.kicker).toLocaleUpperCase(input.locale);
  page.drawText(kicker, { x: W - 58 - fonts.bold.widthOfTextAtSize(kicker, 10), y: H - 78, size: 10, font: fonts.bold, color: MUTED });

  // Medal (right): circle + ribbon + level name.
  const mx = W - 150;
  const my = H - 200;
  page.drawSvgPath('M -18 0 L -30 -70 L -10 -58 L 0 -78 L 4 0 Z', { x: mx - 6, y: my - 30, color: BRAND, opacity: 0.85 });
  page.drawSvgPath('M 18 0 L 30 -70 L 10 -58 L 0 -78 L -4 0 Z', { x: mx + 6, y: my - 30, color: rgb(0.87, 0, 0), opacity: 0.85 });
  page.drawCircle({ x: mx, y: my, size: 46, color: medal });
  page.drawCircle({ x: mx, y: my, size: 38, borderColor: rgb(1, 1, 1), borderWidth: 1.5 });
  const lvl = clean(L.level[input.level]);
  const lvlSize = Math.min(15, (60 / Math.max(1, fonts.bold.widthOfTextAtSize(lvl, 15))) * 15);
  page.drawText(lvl, { x: mx - fonts.bold.widthOfTextAtSize(lvl, lvlSize) / 2, y: my - lvlSize / 3, size: lvlSize, font: fonts.bold, color: rgb(1, 1, 1) });

  centre(L.heading, H - 150, 40, fonts.bold, BRAND);
  centre(L.intro, H - 205, 13, fonts.regular, INK);
  let nameSize = 34;
  while (nameSize > 18 && fonts.bold.widthOfTextAtSize(clean(input.fullName), nameSize) > W - 340) nameSize -= 2;
  centre(input.fullName, H - 250, nameSize, fonts.bold, INK);
  page.drawLine({ start: { x: W / 2 - 200, y: H - 264 }, end: { x: W / 2 + 200, y: H - 264 }, thickness: 1, color: medal });
  let y = H - 296;
  for (const line of wrap(clean(L.body(input.activities, input.points, input.maxPoints)), fonts.regular, 15, W - 260).slice(0, 3)) {
    centre(line, y, 15, fonts.regular, INK);
    y -= 21;
  }
  centre(`${L.levelLabel}: ${L.level[input.level]}`, y - 6, 15, fonts.bold, medal);

  const fy = 96;
  const date = new Intl.DateTimeFormat(READY_DATE_LOCALE[input.locale], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' }).format(input.date);
  page.drawText(L.date, { x: 70, y: fy + 30, size: 9, font: fonts.regular, color: MUTED });
  page.drawText(clean(date), { x: 70, y: fy + 14, size: 13, font: fonts.bold, color: INK });
  page.drawText(L.number, { x: 70, y: fy - 12, size: 9, font: fonts.regular, color: MUTED });
  page.drawText(clean(input.number), { x: 70, y: fy - 28, size: 13, font: fonts.bold, color: INK });
  const team = clean(L.team);
  page.drawLine({ start: { x: W / 2 - 110, y: fy + 4 }, end: { x: W / 2 + 110, y: fy + 4 }, thickness: 0.8, color: LINE });
  page.drawText(team, { x: W / 2 - fonts.bold.widthOfTextAtSize(team, 11) / 2, y: fy - 12, size: 11, font: fonts.bold, color: INK });

  const qr = await pdf.embedPng(await QRCode.toBuffer(input.verifyUrl, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 360 }));
  const qs = 86;
  page.drawRectangle({ x: W - 70 - qs - 4, y: fy - 44, width: qs + 8, height: qs + 8, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.6 });
  page.drawImage(qr, { x: W - 70 - qs, y: fy - 40, width: qs, height: qs });
  const right = W - 70 - qs - 14;
  const linkText = fit(input.verifyUrl.replace(/^https?:\/\//, ''), fonts.regular, 7.5, 230);
  page.drawText(L.verify, { x: right - fonts.bold.widthOfTextAtSize(L.verify, 9), y: fy + 30, size: 9, font: fonts.bold, color: MUTED });
  page.drawText(linkText, { x: right - fonts.regular.widthOfTextAtSize(linkText, 7.5), y: fy + 16, size: 7.5, font: fonts.regular, color: BRAND });

  for (const [i, line] of wrap(clean(L.note), fonts.regular, 7.5, W - 170).slice(0, 2).entries()) centre(line, 44 - i * 10, 7.5, fonts.regular, MUTED);
  return Buffer.from(await pdf.save());
};
