import { rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { BRAND, INK, LINE, MUTED, clean, createDoc, fit, wrap } from '../cv/pdfKit.js';
import { POSTER_PHRASES, POSTER_TEXT } from './texts.js';

/**
 * "Welcome" poster for a worker's first work day: one A3 portrait page (pdf-lib, DejaVu Sans so ə ğ ı ö ş ç ü
 * render). Bilingual Azerbaijani / German: "Xoş gəlmisiniz, {firstName}! / Herzlich willkommen, {firstName}!",
 * company logo or name, six empty frames "Ihr Team · Komandanız" for photos or signatures, ten key workplace
 * phrases and – when the company named one in the BUDDY checklist item – the contact person.
 */

export const A3: [number, number] = [841.89, 1190.55];

export interface PosterInput {
  firstName: string;
  company: string;
  /** PNG bytes of the company logo (already converted), or null. */
  logoPng?: Buffer | null;
  contact?: string | null;
  firstDay?: Date | null;
}

const AZ_BLUE = rgb(0, 0.71, 0.89);
const AZ_RED = rgb(0.94, 0.2, 0.25);
const AZ_GREEN = rgb(0.31, 0.62, 0.18);
const CREAM = rgb(0.996, 0.988, 0.965);
const SOFT = rgb(0.95, 0.96, 0.98);

const centre = (page: PDFPage, text: string, y: number, size: number, font: PDFFont, color = INK, maxW = A3[0] - 120) => {
  let s = size;
  const t = clean(text);
  while (s > 10 && font.widthOfTextAtSize(t, s) > maxW) s -= 1;
  const line = fit(t, font, s, maxW);
  page.drawText(line, { x: (A3[0] - font.widthOfTextAtSize(line, s)) / 2, y, size: s, font, color });
  return s;
};

const fmtDay = (d: Date) =>
  new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(d);

export const welcomePosterPdf = async (input: PosterInput) => {
  const [W, H] = A3;
  const name = clean(input.firstName).trim().slice(0, 60);
  const { pdf, fonts } = await createDoc({ title: POSTER_TEXT.welcomeDe(name), author: clean(input.company), subject: 'Willkommen · Xoş gəlmisiniz', lang: 'de' });
  pdf.setCreator('Triad Vision');
  const page = pdf.addPage([W, H]);

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
  // Flag stripes: Azerbaijan on top, Germany at the bottom.
  [AZ_BLUE, AZ_RED, AZ_GREEN].forEach((c, i) => page.drawRectangle({ x: 0, y: H - 14 - i * 14, width: W, height: 14, color: c }));
  [rgb(0, 0, 0), rgb(0.87, 0, 0), rgb(1, 0.81, 0)].forEach((c, i) => page.drawRectangle({ x: 0, y: 28 - i * 14, width: W, height: 14, color: c }));

  // Logo or company name on top.
  let y = H - 70;
  let logo: PDFImage | null = null;
  if (input.logoPng) {
    try {
      logo = await pdf.embedPng(input.logoPng);
    } catch {
      logo = null;
    }
  }
  if (logo) {
    const k = Math.min(80 / logo.height, 260 / logo.width, 1.5);
    const w = logo.width * k;
    const h = logo.height * k;
    page.drawImage(logo, { x: (W - w) / 2, y: y - h, width: w, height: h });
    y -= h + 20;
  }
  centre(page, input.company, y - 16, 20, fonts.bold, MUTED);
  y -= 92;

  // Headlines.
  const s1 = centre(page, POSTER_TEXT.welcomeAz(name), y, 54, fonts.bold, BRAND);
  y -= s1 + 14;
  const s2 = centre(page, POSTER_TEXT.welcomeDe(name), y, 38, fonts.bold, INK);
  y -= s2 + 18;
  page.drawLine({ start: { x: W / 2 - 160, y }, end: { x: W / 2 + 160, y }, thickness: 2, color: AZ_RED });
  y -= 26;

  // Team frames: 3 × 2 dashed boxes with a line for the name.
  centre(page, POSTER_TEXT.team, y, 22, fonts.bold, INK);
  y -= 20;
  centre(page, POSTER_TEXT.teamHint, y, 12, fonts.regular, MUTED);
  y -= 18;
  const gap = 24;
  const fw = (W - 120 - 2 * gap) / 3;
  const fh = 100;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const x = 60 + col * (fw + gap);
      const top = y - row * (fh + 34);
      page.drawRectangle({ x, y: top - fh, width: fw, height: fh, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 1.4, borderDashArray: [6, 5] });
      page.drawLine({ start: { x: x + 16, y: top - fh - 20 }, end: { x: x + fw - 16, y: top - fh - 20 }, thickness: 0.8, color: LINE });
    }
  }
  y -= 2 * fh + 34 + 50;

  // Phrases: German bold left, Azerbaijani right.
  const boxTop = y + 10;
  const rowH = 26;
  const boxH = 46 + POSTER_PHRASES.length * rowH;
  page.drawRectangle({ x: 50, y: boxTop - boxH, width: W - 100, height: boxH, color: SOFT });
  centre(page, POSTER_TEXT.phrases, y - 16, 18, fonts.bold, BRAND);
  y -= 50;
  const colX = [80, W / 2 + 10];
  const colW = W / 2 - 100;
  for (const [i, [de, az]] of POSTER_PHRASES.entries()) {
    if (i) page.drawLine({ start: { x: 70, y: y + 18 }, end: { x: W - 70, y: y + 18 }, thickness: 0.5, color: LINE });
    // Shrink a long phrase to fit its column (never cut it); fit() only as a last resort.
    const sizeFor = (s: string, f: PDFFont) => {
      let z = 15;
      while (z > 10 && f.widthOfTextAtSize(s, z) > colW) z -= 0.5;
      return z;
    };
    const dz = sizeFor(de, fonts.bold);
    const az2 = sizeFor(az, fonts.regular);
    page.drawText(fit(de, fonts.bold, dz, colW), { x: colX[0], y, size: dz, font: fonts.bold, color: INK });
    page.drawText(fit(az, fonts.regular, az2, colW), { x: colX[1], y, size: az2, font: fonts.regular, color: INK });
    y -= rowH;
  }
  y = boxTop - boxH - 30;

  // Contact person and first day.
  const facts: [string, string][] = [];
  if (input.contact?.trim()) facts.push([POSTER_TEXT.contact, input.contact.trim()]);
  if (input.firstDay) facts.push([POSTER_TEXT.firstDay, fmtDay(input.firstDay)]);
  if (facts.length) {
    const fwBox = (W - 100 - (facts.length - 1) * 20) / facts.length;
    facts.forEach(([label, value], i) => {
      const x = 50 + i * (fwBox + 20);
      page.drawRectangle({ x, y: y - 56, width: fwBox, height: 70, color: rgb(1, 1, 1), borderColor: AZ_BLUE, borderWidth: 1.2 });
      page.drawText(fit(label, fonts.regular, 11, fwBox - 30), { x: x + 15, y: y - 8, size: 11, font: fonts.regular, color: MUTED });
      const lines = wrap(value, fonts.bold, 17, fwBox - 30).slice(0, 2);
      lines.forEach((l, k) => page.drawText(l, { x: x + 15, y: y - 30 - k * 19, size: lines.length > 1 ? 14 : 17, font: fonts.bold, color: INK }));
    });
  }

  return Buffer.from(await pdf.save());
};
